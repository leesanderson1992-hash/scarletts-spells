import type { LessonWordSlot } from "../composer-word-selection";
import type { CurrentDetectiveFamilyAuthority, DetectiveSelectionWord } from "./family-tree-detective";
import { compileWordLabSnapshot } from "./compile-word-lab";
import type { CompiledWordLabSnapshotV1, WordLabSelectedWordV1 } from "./contracts";
import { prepareDetectiveForComposerSlots, WEAK_VOWEL_DETECTIVE_CANDIDATE_RECIPE } from "./weak-vowel-detective";

/** Candidate integration boundary: the composer supplies its unchanged demand-first five slots. */
export function compileWeakVowelDetectiveCandidate(input: {
  assignmentId: string;
  childId: string;
  assignmentDate: string;
  compiledAt: string;
  familyKey: string;
  clusterKey: string;
  microSkillKey: string;
  slots: readonly LessonWordSlot[];
  selectedWords: readonly WordLabSelectedWordV1[];
  currentAssignments: readonly DetectiveSelectionWord[];
  publishedAnnotations: readonly unknown[];
  currentFamilyAuthorities: readonly CurrentDetectiveFamilyAuthority[];
  dictionaryReleaseIds: readonly string[];
  selectionPolicyVersion: string;
  evidencePolicyVersion: string;
  assignmentItemId: string;
}): { snapshot: CompiledWordLabSnapshotV1 | null; blockers: { canonicalWordId: string; reason: string }[] } {
  if (input.slots.length !== input.selectedWords.length || input.slots.some((slot, index) =>
    slot.canonicalWordId !== input.selectedWords[index]?.canonicalWordId)) {
    return { snapshot: null, blockers: [{ canonicalWordId: "*", reason: "composer_word_binding_mismatch" }] };
  }
  const prepared = prepareDetectiveForComposerSlots(input);
  if (!prepared.config) return { snapshot: null, blockers: prepared.blockers };
  const compiled = compileWordLabSnapshot({
    assignmentId: input.assignmentId, childId: input.childId, assignmentDate: input.assignmentDate, compiledAt: input.compiledAt,
    taxonomy: { familyKey: input.familyKey, clusterKey: input.clusterKey, microSkillKey: input.microSkillKey },
    recipe: WEAK_VOWEL_DETECTIVE_CANDIDATE_RECIPE, selectedWords: input.selectedWords,
    assignmentItemIdsByActivityKey: { "family-tree-detective": [input.assignmentItemId] },
    activityConfigsByKey: { "family-tree-detective": { ...prepared.config } },
    activityWordIdsByKey: { "family-tree-detective": prepared.readyWordIds },
    content: { dictionaryReleaseIds: [...input.dictionaryReleaseIds], profileKeys: ["weak_vowel_detective"],
      profileVersions: [...new Set(prepared.config.rounds.flatMap((round) =>
        [round.contentVersion, ...(round.family ? [round.family.sourceFingerprint] : [])]))] },
    selectionPolicyVersion: input.selectionPolicyVersion, evidencePolicyVersion: input.evidencePolicyVersion,
  });
  return compiled.ok
    ? { snapshot: compiled.snapshot, blockers: prepared.blockers }
    : { snapshot: null, blockers: [...prepared.blockers, ...compiled.blockers.map((blocker) => ({ canonicalWordId: "*", reason: blocker.code }))] };
}
