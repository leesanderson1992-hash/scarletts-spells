import type { LessonWordSlot } from "../composer-word-selection";
import type { DinnerSelectionWord } from "./call-it-to-dinner";
import { compileWordLabSnapshot } from "./compile-word-lab";
import type { CompiledWordLabSnapshotV1, WordLabSelectedWordV1 } from "./contracts";
import { prepareDinnerForComposerSlots, WEAK_VOWEL_DINNER_CANDIDATE_RECIPE } from "./weak-vowel-dinner";

/** Candidate integration boundary: the existing composer supplies its five demand-first slots. */
export function compileWeakVowelDinnerCandidate(input: {
  assignmentId: string;
  childId: string;
  assignmentDate: string;
  compiledAt: string;
  familyKey: string;
  clusterKey: string;
  microSkillKey: string;
  slots: readonly LessonWordSlot[];
  selectedWords: readonly WordLabSelectedWordV1[];
  currentAssignments: readonly DinnerSelectionWord[];
  publishedAnnotations: readonly unknown[];
  dictionaryReleaseIds: readonly string[];
  selectionPolicyVersion: string;
  evidencePolicyVersion: string;
  assignmentItemId: string;
}): { snapshot: CompiledWordLabSnapshotV1 | null; blockers: { canonicalWordId: string; reason: string }[] } {
  if (input.slots.length !== input.selectedWords.length || input.slots.some((slot, index) =>
    slot.canonicalWordId !== input.selectedWords[index]?.canonicalWordId)) {
    return { snapshot: null, blockers: [{ canonicalWordId: "*", reason: "composer_word_binding_mismatch" }] };
  }
  const prepared = prepareDinnerForComposerSlots(input);
  if (!prepared.config) return { snapshot: null, blockers: prepared.blockers };
  const compiled = compileWordLabSnapshot({
    assignmentId: input.assignmentId, childId: input.childId, assignmentDate: input.assignmentDate, compiledAt: input.compiledAt,
    taxonomy: { familyKey: input.familyKey, clusterKey: input.clusterKey, microSkillKey: input.microSkillKey },
    recipe: WEAK_VOWEL_DINNER_CANDIDATE_RECIPE, selectedWords: input.selectedWords,
    assignmentItemIdsByActivityKey: { "call-it-to-dinner": [input.assignmentItemId] },
    activityConfigsByKey: { "call-it-to-dinner": { ...prepared.config } },
    activityWordIdsByKey: { "call-it-to-dinner": prepared.readyWordIds },
    content: { dictionaryReleaseIds: [...input.dictionaryReleaseIds], profileKeys: ["weak_vowel_dinner"],
      profileVersions: [...new Set(prepared.config.rounds.map((round) => round.contentVersion))] },
    selectionPolicyVersion: input.selectionPolicyVersion, evidencePolicyVersion: input.evidencePolicyVersion,
  });
  return compiled.ok
    ? { snapshot: compiled.snapshot, blockers: prepared.blockers }
    : { snapshot: null, blockers: [...prepared.blockers, ...compiled.blockers.map((blocker) => ({ canonicalWordId: "*", reason: blocker.code }))] };
}
