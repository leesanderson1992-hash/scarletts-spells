import type { LessonWordSlot } from "../composer-word-selection";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../curriculum-release-activation";
import { WORD_LAB_RECIPE_SCHEMA_VERSION, type WordLabRecipeDefinitionV1 } from "./contracts";
import {
  DETECTIVE_ACTIVITY_VERSION, resolveDetectiveForSelectedWords,
  type CurrentDetectiveFamilyAuthority, type DetectiveActivityConfigV1, type DetectiveFamilyV1,
  type DetectiveRecordingV1, type DetectiveSelectionWord,
} from "./family-tree-detective";
import { WEAK_VOWEL_MICRO_SKILLS } from "./weak-vowel-dinner";

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
    lesson: { min: 5, preferred: 5, max: 5 }, authentic: { min: 1, max: 5 }, transfer: { min: 0, max: 4 }, practice: { min: 0, max: 4 },
    guided: { roles: ["authentic_target", "transfer", "practice"], min: 1, max: 5 },
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
