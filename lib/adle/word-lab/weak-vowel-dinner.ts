import type { LessonWordSlot } from "../composer-word-selection";
import {
  DINNER_ACTIVITY_VERSION,
  resolveDinnerForSelectedWords,
  type DinnerActivityConfigV1,
  type DinnerSelectionWord,
} from "./call-it-to-dinner";
import {
  WORD_LAB_RECIPE_SCHEMA_VERSION, type WordLabRecipeDefinitionV1,
} from "./contracts";

export const WEAK_VOWEL_MICRO_SKILLS = [
  "D4_SCHWA_FINAL_A_FINAL", "D4_SCHWA_FINAL_AR_FINAL", "D4_SCHWA_FINAL_ER_FINAL", "D4_SCHWA_FINAL_OR_FINAL",
  "D4_SCHWA_INITIAL_E_INITIAL", "D4_SCHWA_INITIAL_O_INITIAL",
  "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS", "D4_SCHWA_MEDIAL_NATURAL_ACTUAL",
] as const;

/** Dark candidate only: the complete weak-vowel lesson is not activated by this activity recipe. */
export const WEAK_VOWEL_DINNER_CANDIDATE_RECIPE: WordLabRecipeDefinitionV1 = {
  schemaVersion: WORD_LAB_RECIPE_SCHEMA_VERSION,
  identity: { recipeKey: "weak_vowel_dinner_candidate", recipeVersion: 1, status: "candidate" },
  compatibility: { routeKey: "weak_vowel_word_lab", routeVersion: 1, familyKey: "D4_SCHWA", clusterKeys: [], microSkillKeys: WEAK_VOWEL_MICRO_SKILLS },
  wordRequirements: {
    lesson: { min: 4, preferred: 6, max: 6 }, authentic: { min: 1, max: 6 }, transfer: { min: 0, max: 5 }, practice: { min: 0, max: 5 },
    guided: { roles: ["authentic_target", "transfer", "practice"], min: 1, max: 6 },
    coverCheck: { roles: [], min: 0, max: 0 }, dictation: { roles: [], min: 0, max: 0 }, coverage: [],
    bandingPolicyVersion: "composer_banding_v1_1", taughtHistoryPolicyVersion: "composer_taught_history_v1",
  },
  activities: [{
    activityKey: "call-it-to-dinner", kind: "call_it_to_dinner", contractVersion: 1, order: 1,
    condition: { kind: "always" }, words: { roles: ["authentic_target", "transfer", "practice"], min: 1, max: 5 },
    config: { schemaVersion: DINNER_ACTIVITY_VERSION, rounds: [] }, answerVisibility: "teaching_visible",
    evidenceMode: "guided_recognition", requiredForCompletion: true, assignmentItemKind: "word_lab_guided",
  }],
  probe: { placement: "separate_before_lesson", consumesLessonWordQuota: false },
  completion: { contractVersion: 1, requireAllMarkedActivities: true, requireReflection: false,
    independentWordSelector: { roles: [], min: 0, max: 0 } },
  scheduling: { policyVersion: "dinner_candidate_no_schedule_v1", roles: { authentic_target: "none", transfer: "none", practice: "none" } },
  rewards: { policyVersion: "dinner_candidate_no_reward_v1", roles: { authentic_target: "ineligible", transfer: "ineligible", practice: "ineligible" } },
};

/** Preserve the composer order (demand, probe misses, stretch) and report every content gap. */
export function prepareDinnerForComposerSlots(input: {
  microSkillKey: string;
  slots: readonly LessonWordSlot[];
  currentAssignments: readonly DinnerSelectionWord[];
  publishedAnnotations: readonly unknown[];
}): { config: DinnerActivityConfigV1 | null; readyWordIds: string[]; blockers: { canonicalWordId: string; reason: string }[] } {
  if (!WEAK_VOWEL_MICRO_SKILLS.some((key) => key === input.microSkillKey)) {
    return { config: null, readyWordIds: [], blockers: input.slots.map((slot) => ({ canonicalWordId: slot.canonicalWordId, reason: "unsupported_micro_skill" })) };
  }
  const selected: DinnerSelectionWord[] = [];
  const blockers: { canonicalWordId: string; reason: string }[] = [];
  for (const slot of input.slots) {
    const rows = input.currentAssignments.filter((row) => row.canonicalWordId === slot.canonicalWordId && row.microSkillKey === input.microSkillKey);
    if (rows.length !== 1) blockers.push({ canonicalWordId: slot.canonicalWordId, reason: rows.length ? "ambiguous_assignment" : "assignment_missing" });
    else selected.push(rows[0]);
  }
  const resolved = resolveDinnerForSelectedWords(selected, input.publishedAnnotations);
  blockers.push(...resolved.blockers);
  return {
    config: resolved.ready.length ? { schemaVersion: DINNER_ACTIVITY_VERSION, rounds: resolved.ready } : null,
    readyWordIds: resolved.ready.map((round) => round.canonicalWordId), blockers,
  };
}
