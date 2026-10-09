import { activityVariantsForRoute, type ActivityVariant } from "../adle/composable-lesson/activity-variants";
import type { LessonActivityKind } from "../adle/composable-lesson/contracts";
import { routeForSkill, type RouteContentDraft, type WordDraftPayload } from "./contracts";
import { routeRequirements, type ReadinessRequirement } from "./readiness";

export const WORD_ACTIVITY_ASSESSMENT_VERSION =
  "teaching_dictionary_word_activity_v1" as const;

export type WordActivityStatus =
  | "ready"
  | "needs_review"
  | "missing"
  | "incompatible"
  | "not_used";

export type WordActivityAssessment = {
  version: typeof WORD_ACTIVITY_ASSESSMENT_VERSION;
  variant: ActivityVariant;
  status: WordActivityStatus;
  requirements: readonly ReadinessRequirement[];
  /** A released member or a successful route compiler is needed for Ready. */
  validatorConfirmed: boolean;
};

const WORD_PARTS = new Set<LessonActivityKind>([
  "discovery", "guided_prompt", "family_reveal", "cleaver", "word_build",
  "compound_jigsaw", "meaning_match", "meaning_sort", "cover_check",
  "dictation", "review_quick_sort", "must_use_writing", "diagnostic_probe",
]);

/**
 * The existing manager validator reports field-level failures. Until each
 * specialist compiler exposes structured blockers, retain its conservative
 * result and attach every issue to the activity that consumes that fact.
 * Unknown issues attach to all word activities rather than yielding a false
 * green tick.
 */
export function requirementActivities(
  requirement: ReadinessRequirement,
  routeId: string,
): readonly LessonActivityKind[] {
  const target = requirement.editTarget;
  const routeField = target.startsWith("td-route-")
    ? target.slice(target.lastIndexOf("-") + 1) : "";
  if (target === "td-dictation" || routeField === "pairedSentence") return ["dictation"];
  if (routeField === "meaningBinKey") return ["discovery", "meaning_sort", "meaning_match"];
  if (target === "td-definition" || routeField === "baseMeaning") {
    return ["discovery", "family_reveal", "meaning_match", "meaning_sort", "word_build"];
  }
  if (target === "td-canonical-word-sum") return ["word_build", "cleaver"];
  if (["td-morphemes", "td-morphology_notes"].includes(target)) return ["cleaver", "word_build"];
  if (routeField === "choiceAudit") return ["meaning_sort", "word_build"];
  if (["components", "componentToWholeRelationship", "joins"].includes(routeField)) {
    return ["compound_jigsaw", "meaning_match"];
  }
  if (["teachingSplitParts", "teachingSplitJoins", "trueMorphologyParts",
    "trueMorphologyJoins", "trueMorphologyProvenance", "morphologyParts",
    "transformations", "semanticBaseText", "semanticBaseKind", "suffixVariant",
    "prefixVariant", "baseWord"].includes(routeField)) {
    return ["cleaver", "word_build", "compound_jigsaw", "family_reveal"];
  }
  if (routeField === "familyKey") {
    return ["family_reveal", "cleaver", "word_build"];
  }
  if (["td-syllables", "td-phoneme_hint", "td-stress_pattern", "td-has-schwa",
    "td-age-band", "td-frequency-band", "td-complexity-band"].includes(target)) {
    return ["cover_check", "dictation"];
  }
  return routeId === "generic_composer"
    ? ["guided_prompt", "cover_check", "dictation"]
    : [...WORD_PARTS];
}

export function assessWordActivities(input: {
  microSkillKey: string;
  payload: WordDraftPayload;
  routeContent: RouteContentDraft | null;
  /** True only after the existing release compiler validates the exact member. */
  releasedMember: boolean;
  needsReview?: (editTarget: string) => boolean;
  selectedActivityKinds?: ReadonlySet<LessonActivityKind>;
}): readonly WordActivityAssessment[] {
  const route = routeForSkill(input.microSkillKey);
  if (!route) return [];
  const content = input.routeContent ?? {
    routeId: route.routeId,
    routeVersion: route.routeVersion,
    microSkillKey: input.microSkillKey,
    wordMeaning: input.payload.definition,
    wordSum: input.payload.canonicalMorphology.wordSum,
    content: {},
  };
  const checks = routeRequirements(content, input.payload, input.needsReview);
  return activityVariantsForRoute(route.routeId, input.microSkillKey).map((variant) => {
    const used = variant.enabled
      && (!input.selectedActivityKinds || input.selectedActivityKinds.has(variant.kind));
    const requirements = checks.filter((check) =>
      requirementActivities(check, route.routeId).includes(variant.kind));
    const status: WordActivityStatus = !used ? "not_used"
      : input.releasedMember ? "ready"
        : requirements.some((check) => check.status === "missing") ? "missing"
          : requirements.some((check) => check.status === "needs_review") ? "needs_review"
            : "needs_review";
    return {
      version: WORD_ACTIVITY_ASSESSMENT_VERSION,
      variant,
      status,
      requirements,
      validatorConfirmed: used && input.releasedMember,
    };
  });
}
