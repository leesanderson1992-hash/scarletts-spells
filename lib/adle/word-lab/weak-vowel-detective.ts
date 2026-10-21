import type { LessonWordSlot } from "../composer-word-selection";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../curriculum-release-activation";
import { WORD_LAB_RECIPE_SCHEMA_VERSION, type WordLabRecipeDefinitionV1 } from "./contracts";
import {
  DETECTIVE_ACTIVITY_VERSION, resolveDetectiveForSelectedWords,
  type CurrentDetectiveFamilyAuthority, type DetectiveActivityConfigV1, type DetectiveFamilyV1,
  type DetectiveRecordingV1, type DetectiveSelectionWord,
} from "./family-tree-detective";
import { WEAK_VOWEL_MICRO_SKILLS } from "./weak-vowel-dinner";

/** A single published family authority pinned by the calling release. V1 has
 * no family-level fingerprint, so its semantic authority fingerprint is used. */
export interface PublishedDetectiveBaseFamilyAuthority {
  authorityId: string;
  schemaVersion: 1 | 2;
  sourceFingerprint: string;
  families: readonly {
    familyId: string;
    baseFamilyKey: string;
    baseWordId: string;
    members: readonly { canonicalWordId: string; assignmentEligible: boolean }[];
  }[];
}

const validFingerprint = (value: string) => /^[a-f0-9]{64}$/.test(value);

export interface ApprovedSuffixMorphologyForDetective {
  id: string;
  canonicalWordId: string;
  sourceRowHash: string;
  rowStatus: "active";
  reviewStatus: "approved_for_first_exposure";
  analysisStatus: "approved";
  wordSum: string;
  parts: readonly { text: string; type: string }[];
  transformationNotes: string | null;
}

/** A final -er word is not necessarily a suffixed word (water, for example).
 * The relation is shown only when approved morphology and a canonical base
 * reconstruct the precise target. Safe + -r and photograph + -er are distinct.
 * No root-family name is used as a shortcut. */
export function detectiveBaseToFinalErRelation(input: {
  microSkillKey: string;
  target: { canonicalWordId: string; spelling: string; span: { start: number; end: number; text: string } };
  base: { canonicalWordId: string; spelling: string; rowStatus: "active"; reviewStatus: "approved_for_first_exposure" };
  morphology: ApprovedSuffixMorphologyForDetective;
  reviewedAudio: readonly { canonicalWordId: string; recording: DetectiveRecordingV1 }[];
}): { family: DetectiveFamilyV1 | null; reason: string | null } {
  const { target, base, morphology } = input;
  if (input.microSkillKey !== "D4_SCHWA_FINAL_ER_FINAL") return { family: null, reason: "not_final_er_skill" };
  if (morphology.rowStatus !== "active" || morphology.reviewStatus !== "approved_for_first_exposure" ||
    morphology.analysisStatus !== "approved" || base.rowStatus !== "active" ||
    base.reviewStatus !== "approved_for_first_exposure" ||
    morphology.canonicalWordId !== target.canonicalWordId || !validFingerprint(morphology.sourceRowHash)) {
    return { family: null, reason: "morphology_not_current_and_approved" };
  }
  if (target.span.text !== "er" || target.span.start !== target.spelling.length - 2 ||
    target.span.end !== target.spelling.length || target.spelling.slice(target.span.start) !== "er") {
    return { family: null, reason: "target_is_not_final_er_suffix" };
  }
  const parts = morphology.parts;
  const suffix = parts.at(-1)?.text;
  if (parts.length < 2 || parts.at(-1)?.type !== "suffix" || !(suffix === "er" || suffix === "r") ||
    parts.slice(0, -1).some((part) => !part.text || part.type === "suffix") ||
    parts.slice(0, -1).map((part) => part.text).join("") !== base.spelling ||
    base.canonicalWordId === target.canonicalWordId ||
    !morphology.wordSum.includes("→") || !morphology.wordSum.endsWith(target.spelling)) {
    return { family: null, reason: "base_to_derived_not_verified" };
  }
  const direct = `${base.spelling}${suffix}` === target.spelling;
  const dropFinalE = suffix === "er" && base.spelling.endsWith("e") && `${base.spelling.slice(0, -1)}er` === target.spelling &&
    /final\s+<?e>?\s+.*(?:omit|drop)/i.test(morphology.transformationNotes ?? "");
  if (!direct && !dropFinalE) return { family: null, reason: "unreviewed_spelling_transformation" };
  const audio = new Map(input.reviewedAudio.map((item) => [item.canonicalWordId, item.recording]));
  const derivation = `${base.spelling} + -${suffix} → ${target.spelling}${dropFinalE ? " (the final e is omitted)" : ""}`;
  const preservedBaseEnd = dropFinalE ? base.spelling.length - 1 : base.spelling.length;
  return { family: {
    authorityId: `morphology:${morphology.id}`, sourceFingerprint: morphology.sourceRowHash,
    reviewStatus: "approved", relationKind: "base_to_derived", name: base.spelling,
    preservedBaseSpan: { start: 0, end: preservedBaseEnd },
    members: [
      { canonicalWordId: base.canonicalWordId, spelling: base.spelling,
        recording: audio.get(base.canonicalWordId) ?? null, morphologyNote: derivation,
        alignedVowelSpan: suffix === "r" && base.spelling.endsWith("e")
          ? { start: base.spelling.length - 1, end: base.spelling.length } : null },
      { canonicalWordId: target.canonicalWordId, spelling: target.spelling,
        recording: audio.get(target.canonicalWordId) ?? null, morphologyNote: null, alignedVowelSpan: null },
    ],
    explanation: derivation,
  }, reason: null };
}

/** Consume only the authority selected by the current release, not every
 * historical publication with a similar family name. */
export function currentDetectiveFamiliesFromPublishedAuthority(
  authority: PublishedDetectiveBaseFamilyAuthority,
): CurrentDetectiveFamilyAuthority[] {
  if (!validFingerprint(authority.sourceFingerprint)) return [];
  return authority.families.flatMap((family) => {
    const members = family.members.filter((member) => member.assignmentEligible);
    return members.length >= 2 ? [{ authorityId: family.familyId,
      sourceFingerprint: authority.sourceFingerprint,
      memberWordIds: members.map((member) => member.canonicalWordId) }] : [];
  });
}

/** An owner-selected family key is useful only when the target is an approved
 * member of that exact published family. The choice does not create members. */
export function detectiveFamilyFromPublishedAuthority(input: {
  authority: PublishedDetectiveBaseFamilyAuthority;
  chosenFamilyKey: string;
  targetWordId: string;
  words: readonly { canonicalWordId: string; spelling: string }[];
  reviewedAudio: readonly { canonicalWordId: string; recording: DetectiveRecordingV1 }[];
}): { family: DetectiveFamilyV1 | null; reason: string | null } {
  if (!validFingerprint(input.authority.sourceFingerprint)) return { family: null, reason: "family_authority_fingerprint_missing" };
  const matches = input.authority.families.filter((family) => family.baseFamilyKey === input.chosenFamilyKey);
  if (matches.length !== 1) return { family: null, reason: matches.length ? "ambiguous_base_family" : "chosen_base_family_missing" };
  const source = matches[0];
  if (!source.members.some((member) => member.assignmentEligible && member.canonicalWordId === input.targetWordId)) {
    return { family: null, reason: "target_not_verified_family_member" };
  }
  const words = new Map(input.words.map((word) => [word.canonicalWordId, word.spelling]));
  const audio = new Map(input.reviewedAudio.map((item) => [item.canonicalWordId, item.recording]));
  const members = source.members.filter((member) => member.assignmentEligible).flatMap((member) => {
    const spelling = words.get(member.canonicalWordId);
    return spelling ? [{ canonicalWordId: member.canonicalWordId, spelling,
      recording: audio.get(member.canonicalWordId) ?? null,
      morphologyNote: null, alignedVowelSpan: null }] : [];
  });
  const baseSpelling = words.get(source.baseWordId);
  if (members.length < 2 || !baseSpelling) return { family: null, reason: "incomplete_base_family" };
  return { family: { authorityId: source.familyId, sourceFingerprint: input.authority.sourceFingerprint,
    reviewStatus: "approved", name: baseSpelling, members, explanation: null }, reason: null };
}

/** Reuse the governed family membership itself, across lesson micro-skills. */
export function currentDetectiveFamiliesFromAuthority(authority: BaseWordFamilyAuthorityProjectionV2): CurrentDetectiveFamilyAuthority[] {
  return authority.families.flatMap((family) => {
    const members = family.members.filter((member) => member.assignmentEligible);
    return family.sourceFingerprint && /^[a-f0-9]{64}$/.test(family.sourceFingerprint) && members.length >= 2
      ? [{ authorityId: family.familyId, sourceFingerprint: family.sourceFingerprint,
        memberWordIds: members.map((member) => member.canonicalWordId) }] : [];
  });
}

/** Build the tree from reviewed family membership and dictionary words, never a pairwise sound map. */
export function detectiveFamilyFromAuthority(input: {
  authority: BaseWordFamilyAuthorityProjectionV2;
  targetWordId: string;
  words: readonly { canonicalWordId: string; spelling: string }[];
  reviewedAudio: readonly { canonicalWordId: string; recording: DetectiveRecordingV1 }[];
}): { family: DetectiveFamilyV1 | null; reason: string | null } {
  const candidates = input.authority.families.filter((family) =>
    family.sourceFingerprint && /^[a-f0-9]{64}$/.test(family.sourceFingerprint) &&
    family.members.some((member) => member.assignmentEligible && member.canonicalWordId === input.targetWordId));
  if (candidates.length !== 1) return { family: null, reason: candidates.length ? "ambiguous_base_family" : "no_verified_base_family" };
  const source = candidates[0];
  const words = new Map(input.words.map((word) => [word.canonicalWordId, word.spelling]));
  const audio = new Map(input.reviewedAudio.map((item) => [item.canonicalWordId, item.recording]));
  const members = source.members.filter((member) => member.assignmentEligible).flatMap((member) => {
    const spelling = words.get(member.canonicalWordId);
    return spelling ? [{ canonicalWordId: member.canonicalWordId, spelling,
      recording: audio.get(member.canonicalWordId) ?? null,
      morphologyNote: null, alignedVowelSpan: null }] : [];
  });
  const baseSpelling = words.get(source.baseWordId);
  if (members.length < 2 || !baseSpelling || !members.some((member) => member.canonicalWordId === input.targetWordId)) {
    return { family: null, reason: "incomplete_base_family" };
  }
  return { family: {
    authorityId: source.familyId, sourceFingerprint: source.sourceFingerprint!, reviewStatus: "approved",
    name: baseSpelling, members, explanation: null,
  }, reason: null };
}

/** Candidate only. It cannot enter a live lesson until every selected target is approved. */
export const WEAK_VOWEL_DETECTIVE_CANDIDATE_RECIPE: WordLabRecipeDefinitionV1 = {
  schemaVersion: WORD_LAB_RECIPE_SCHEMA_VERSION,
  identity: { recipeKey: "weak_vowel_detective_candidate", recipeVersion: 1, status: "candidate" },
  compatibility: { routeKey: "weak_vowel_word_lab", routeVersion: 1, familyKey: "D4_SCHWA", clusterKeys: [], microSkillKeys: WEAK_VOWEL_MICRO_SKILLS },
  wordRequirements: {
    lesson: { min: 4, preferred: 6, max: 6 }, authentic: { min: 1, max: 6 }, transfer: { min: 0, max: 5 }, practice: { min: 0, max: 5 },
    guided: { roles: ["authentic_target", "transfer", "practice"], min: 1, max: 6 },
    coverCheck: { roles: [], min: 0, max: 0 }, dictation: { roles: [], min: 0, max: 0 }, coverage: [],
    bandingPolicyVersion: "composer_banding_v1_1", taughtHistoryPolicyVersion: "composer_taught_history_v1",
  },
  activities: [{
    activityKey: "family-tree-detective", kind: "family_tree_detective", contractVersion: 1, order: 1,
    condition: { kind: "always" }, words: { roles: ["authentic_target", "transfer", "practice"], min: 1, max: 5 },
    config: { schemaVersion: DETECTIVE_ACTIVITY_VERSION, rounds: [] }, answerVisibility: "post_submit_only",
    evidenceMode: "guided_recognition", requiredForCompletion: true, assignmentItemKind: "word_lab_guided",
  }],
  probe: { placement: "separate_before_lesson", consumesLessonWordQuota: false },
  completion: { contractVersion: 1, requireAllMarkedActivities: true, requireReflection: false,
    independentWordSelector: { roles: [], min: 0, max: 0 } },
  scheduling: { policyVersion: "detective_candidate_no_schedule_v1", roles: { authentic_target: "none", transfer: "none", practice: "none" } },
  rewards: { policyVersion: "detective_candidate_no_reward_v1", roles: { authentic_target: "ineligible", transfer: "ineligible", practice: "ineligible" } },
};

/** Composer slots stay in demand-first order, including words whose content is blocked. */
export function prepareDetectiveForComposerSlots(input: {
  microSkillKey: string;
  slots: readonly LessonWordSlot[];
  currentAssignments: readonly DetectiveSelectionWord[];
  publishedAnnotations: readonly unknown[];
  currentFamilyAuthorities: readonly CurrentDetectiveFamilyAuthority[];
}): { config: DetectiveActivityConfigV1 | null; readyWordIds: string[]; blockers: { canonicalWordId: string; reason: string }[] } {
  if (!WEAK_VOWEL_MICRO_SKILLS.some((key) => key === input.microSkillKey)) {
    return { config: null, readyWordIds: [], blockers: input.slots.map((slot) => ({ canonicalWordId: slot.canonicalWordId, reason: "unsupported_micro_skill" })) };
  }
  const selected: DetectiveSelectionWord[] = [];
  const blockers: { canonicalWordId: string; reason: string }[] = [];
  for (const slot of input.slots) {
    const rows = input.currentAssignments.filter((row) => row.canonicalWordId === slot.canonicalWordId && row.microSkillKey === input.microSkillKey);
    if (rows.length !== 1) blockers.push({ canonicalWordId: slot.canonicalWordId, reason: rows.length ? "ambiguous_assignment" : "assignment_missing" });
    else selected.push(rows[0]);
  }
  const resolved = resolveDetectiveForSelectedWords(selected, input.publishedAnnotations, input.currentFamilyAuthorities);
  blockers.push(...resolved.blockers);
  return {
    config: blockers.length === 0 && resolved.ready.length ? { schemaVersion: DETECTIVE_ACTIVITY_VERSION, rounds: resolved.ready } : null,
    readyWordIds: resolved.ready.map((round) => round.canonicalWordId), blockers,
  };
}
