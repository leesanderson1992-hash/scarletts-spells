import { createHash } from "node:crypto";

import type {
  AssignmentWordRole,
  LessonActivityKind,
  LessonRecipeReference,
  LessonRouteReference,
} from "./contracts";
import {
  getActivityRequirement,
  type ActivityFactKey,
} from "./activity-requirements";

export const ADLE_COMPATIBILITY_ASSESSMENT_VERSION =
  "adle_compatibility_assessment_v1" as const;
export const ADLE_COMPATIBILITY_VALIDATOR_VERSION =
  "adle_compatibility_validator_v1" as const;

export const COMPATIBILITY_BLOCKER_CODES = [
  "taxonomy_binding_missing",
  "route_or_profile_unavailable",
  "canonical_identity_missing",
  "canonical_status_unapproved",
  "pronunciation_facts_missing",
  "banding_facts_missing",
  "word_microskill_support_missing",
  "microskill_content_missing",
  "decomposition_missing",
  "morphology_reconstruction_mismatch",
  "base_or_root_missing",
  "affix_form_missing",
  "compound_component_missing",
  "invalid_join",
  "transformation_missing_or_invalid",
  "meaning_facts_missing",
  "meaning_group_missing",
  "dictation_sentence_missing",
  "dictation_target_missing_or_mismatched",
  "authentic_target_not_approved",
  "transfer_not_approved",
  "microskill_incompatible",
  "activity_requirement_unmet",
  "insufficient_authentic_targets",
  "insufficient_transfer_words",
  "group_composition_failure",
  "recipe_count_failure",
  "form_coverage_failure",
  "profile_coverage_failure",
  "answer_comparator_mismatch",
  "assignment_binding_failure",
  "payload_version_unsupported",
  "persisted_payload_invalid",
  "runtime_reconstruction_failure",
  "activity_binding_unresolved",
] as const;

export type CompatibilityBlockerCode =
  (typeof COMPATIBILITY_BLOCKER_CODES)[number];
export type CompatibilityOutcome =
  | "compatible"
  | "incompatible"
  | "not_assessed";
export type CompatibilityBlockerScope =
  | "supported"
  | "authentic_target"
  | "transfer"
  | "selection"
  | "production_parity";

export interface CompatibilityEvidence {
  source: "repository" | "teaching_dictionary" | "compiled_snapshot";
  fact: string;
  observed: string | number | boolean | null;
}

export interface CompatibilityBlocker {
  code: CompatibilityBlockerCode;
  scope: CompatibilityBlockerScope;
  activityKind?: LessonActivityKind;
  evidence: readonly CompatibilityEvidence[];
}

export interface CompatibilityAssessmentInput {
  route: LessonRouteReference;
  recipe: LessonRecipeReference;
  microSkillKey: string;
  canonicalWordId?: string;
  role: AssignmentWordRole;
  selected: boolean;
  dependencyFingerprint: string;
  routeAvailable: boolean;
  profileAvailable: boolean;
  taxonomyBound: boolean;
  microSkillCompatible: boolean;
  canonicalIdentityPresent: boolean;
  canonicalApproved: boolean;
  authenticTargetApproved: boolean;
  transferApproved: boolean;
  availableFacts: readonly ActivityFactKey[];
  requiredActivities: readonly LessonActivityKind[];
  contradictions?: readonly (
    | "morphology_reconstruction"
    | "invalid_join"
    | "dictation_target"
    | "answer_comparator"
    | "persisted_payload"
    | "runtime_reconstruction"
    | "activity_binding"
  )[];
  currentProductionCoupling?: "authentic_requires_transfer";
}

export interface CompatibilityAssessment {
  route: LessonRouteReference;
  recipe: LessonRecipeReference;
  microSkillKey: string;
  canonicalWordId: string | null;
  role: AssignmentWordRole;
  outcomes: {
    supported: CompatibilityOutcome;
    authenticTarget: CompatibilityOutcome;
    transfer: CompatibilityOutcome;
    selected: boolean;
  };
  blockers: readonly CompatibilityBlocker[];
  evidence: readonly CompatibilityEvidence[];
  dependencyFingerprint: string;
  assessmentVersion: typeof ADLE_COMPATIBILITY_ASSESSMENT_VERSION;
  validatorVersion: typeof ADLE_COMPATIBILITY_VALIDATOR_VERSION;
  assessmentFingerprint: string;
}

const factBlockers: Partial<
  Record<ActivityFactKey, CompatibilityBlockerCode>
> = {
  canonical_identity: "canonical_identity_missing",
  canonical_status: "canonical_status_unapproved",
  pronunciation: "pronunciation_facts_missing",
  syllables: "pronunciation_facts_missing",
  stress: "pronunciation_facts_missing",
  schwa: "pronunciation_facts_missing",
  phonemes: "pronunciation_facts_missing",
  frequency_band: "banding_facts_missing",
  age_band: "banding_facts_missing",
  complexity_band: "banding_facts_missing",
  word_micro_skill_support: "word_microskill_support_missing",
  micro_skill_content: "microskill_content_missing",
  teaching_decomposition: "decomposition_missing",
  canonical_morphology: "decomposition_missing",
  base_or_root: "base_or_root_missing",
  affix_form: "affix_form_missing",
  compound_components: "compound_component_missing",
  joins: "invalid_join",
  transformations: "transformation_missing_or_invalid",
  child_meaning: "meaning_facts_missing",
  whole_word_meaning: "meaning_facts_missing",
  meaning_group: "meaning_group_missing",
  dictation_sentence: "dictation_sentence_missing",
  dictation_target: "dictation_target_missing_or_mismatched",
  dictation_audio: "dictation_sentence_missing",
  assignment_binding: "assignment_binding_failure",
};

function evidence(
  fact: string,
  observed: string | number | boolean | null,
  source: CompatibilityEvidence["source"] = "teaching_dictionary",
): CompatibilityEvidence {
  return { source, fact, observed };
}

function blocker(
  code: CompatibilityBlockerCode,
  scope: CompatibilityBlockerScope,
  facts: readonly CompatibilityEvidence[],
  activityKind?: LessonActivityKind,
): CompatibilityBlocker {
  return { code, scope, ...(activityKind ? { activityKind } : {}), evidence: facts };
}

export function assessLessonWordCompatibility(
  input: CompatibilityAssessmentInput,
): CompatibilityAssessment {
  const available = new Set(input.availableFacts);
  const blockers: CompatibilityBlocker[] = [];

  if (!input.taxonomyBound) {
    blockers.push(
      blocker("taxonomy_binding_missing", "supported", [
        evidence("taxonomyBound", false, "repository"),
      ]),
    );
  }
  if (!input.routeAvailable || !input.profileAvailable) {
    blockers.push(
      blocker("route_or_profile_unavailable", "supported", [
        evidence("routeAvailable", input.routeAvailable, "repository"),
        evidence("profileAvailable", input.profileAvailable),
      ]),
    );
  }
  if (!input.microSkillCompatible) {
    blockers.push(
      blocker("microskill_incompatible", "supported", [
        evidence("microSkillKey", input.microSkillKey, "repository"),
      ]),
    );
  }
  if (!input.canonicalIdentityPresent) {
    blockers.push(
      blocker("canonical_identity_missing", "supported", [
        evidence("canonicalWordId", input.canonicalWordId ?? null),
      ]),
    );
  }
  if (!input.canonicalApproved) {
    blockers.push(
      blocker("canonical_status_unapproved", "supported", [
        evidence("canonicalApproved", false),
      ]),
    );
  }
  if (!input.authenticTargetApproved) {
    blockers.push(
      blocker("authentic_target_not_approved", "authentic_target", [
        evidence("authenticTargetApproved", false),
      ]),
    );
  }
  if (!input.transferApproved) {
    blockers.push(
      blocker("transfer_not_approved", "transfer", [
        evidence("transferApproved", false),
      ]),
    );
  }

  for (const activityKind of input.requiredActivities) {
    const requirement = getActivityRequirement(activityKind);
    if (!requirement) {
      blockers.push(
        blocker("activity_requirement_unmet", "supported", [
          evidence("requirementRegistryEntry", false, "repository"),
        ], activityKind),
      );
      continue;
    }
    for (const requirementFact of requirement.requiredFacts) {
      if (
        requirementFact.roles &&
        !requirementFact.roles.includes(input.role)
      ) {
        continue;
      }
      if (!available.has(requirementFact.factKey)) {
        blockers.push(
          blocker(
            factBlockers[requirementFact.factKey] ??
              "activity_requirement_unmet",
            "supported",
            [
              evidence("requiredFact", requirementFact.factKey, "repository"),
              evidence("factOwner", requirementFact.owner, "repository"),
            ],
            activityKind,
          ),
        );
      }
    }
  }

  for (const contradiction of input.contradictions ?? []) {
    const code: CompatibilityBlockerCode =
      contradiction === "morphology_reconstruction"
        ? "morphology_reconstruction_mismatch"
        : contradiction === "invalid_join"
          ? "invalid_join"
          : contradiction === "dictation_target"
            ? "dictation_target_missing_or_mismatched"
            : contradiction === "answer_comparator"
              ? "answer_comparator_mismatch"
              : contradiction === "persisted_payload"
                ? "persisted_payload_invalid"
                : contradiction === "runtime_reconstruction"
                  ? "runtime_reconstruction_failure"
                  : "activity_binding_unresolved";
    blockers.push(
      blocker(code, "production_parity", [
        evidence("contradiction", contradiction, "repository"),
      ]),
    );
  }

  if (
    input.currentProductionCoupling === "authentic_requires_transfer" &&
    input.authenticTargetApproved &&
    !input.transferApproved
  ) {
    blockers.push(
      blocker("transfer_not_approved", "production_parity", [
        evidence(
          "currentProductionCoupling",
          "authentic_requires_transfer",
          "repository",
        ),
      ]),
    );
  }

  const uniqueBlockers = [...new Map(
    blockers.map((entry) => [
      `${entry.scope}:${entry.activityKind ?? ""}:${entry.code}:${JSON.stringify(entry.evidence)}`,
      entry,
    ]),
  ).values()].sort((left, right) =>
    `${left.scope}:${left.activityKind ?? ""}:${left.code}`.localeCompare(
      `${right.scope}:${right.activityKind ?? ""}:${right.code}`,
    ),
  );
  const supported =
    !uniqueBlockers.some((entry) => entry.scope === "supported");
  const authentic =
    supported &&
    !uniqueBlockers.some((entry) => entry.scope === "authentic_target");
  const transfer =
    supported && !uniqueBlockers.some((entry) => entry.scope === "transfer");
  const assessmentEvidence = [
    evidence("selected", input.selected, "compiled_snapshot"),
    evidence("availableFactCount", available.size),
  ];
  const fingerprintInput = JSON.stringify({
    route: input.route,
    recipe: input.recipe,
    microSkillKey: input.microSkillKey,
    canonicalWordId: input.canonicalWordId ?? null,
    role: input.role,
    dependencyFingerprint: input.dependencyFingerprint,
    blockers: uniqueBlockers,
    evidence: assessmentEvidence,
  });

  return {
    route: input.route,
    recipe: input.recipe,
    microSkillKey: input.microSkillKey,
    canonicalWordId: input.canonicalWordId ?? null,
    role: input.role,
    outcomes: {
      supported: supported ? "compatible" : "incompatible",
      authenticTarget: authentic ? "compatible" : "incompatible",
      transfer: transfer ? "compatible" : "incompatible",
      selected: input.selected,
    },
    blockers: uniqueBlockers,
    evidence: assessmentEvidence,
    dependencyFingerprint: input.dependencyFingerprint,
    assessmentVersion: ADLE_COMPATIBILITY_ASSESSMENT_VERSION,
    validatorVersion: ADLE_COMPATIBILITY_VALIDATOR_VERSION,
    assessmentFingerprint: createHash("sha256")
      .update(fingerprintInput)
      .digest("hex"),
  };
}
