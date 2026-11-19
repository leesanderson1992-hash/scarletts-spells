import type { ContextualChoiceContent } from "./contextual-choice-contract";
import type { HomophoneLessonSnapshotV1, HomophonePassage } from "./lesson";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";

/** Shared word facts come only from the frozen Dictionary release. Authored
 * practice questions, imagery and spelling memory cues remain lesson choices. */
export function applyCanonicalGuidedFacts(snapshot: HomophoneLessonSnapshotV1, content: ContextualChoiceContent) {
  if (!content.dictionaryFacts) return snapshot;
  const members = content.sets.flatMap(set => set.members);
  const meaning = (word: string) => {
    const member = members.find(member => member.word === word);
    if (!member || !content.dictionaryFacts?.some(fact => fact.wordId === member.canonicalWordId))
      throw new Error("homophone_dictionary_guided_fact_missing");
    return member.intendedSense;
  };
  const split = (word: string, sentence: string) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [...sentence.matchAll(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "gi"))];
    if (matches.length !== 1) throw new Error("homophone_dictionary_sentence_target_invalid");
    return [sentence.slice(0, matches[0].index), sentence.slice(matches[0].index! + matches[0][0].length)];
  };
  const passages: HomophonePassage[] = (snapshot.lesson.contrastSets ?? []).flatMap(set => {
    const selected = set.members.map(word => members.find(member => member.word === word)!);
    return selected.map((first, index) => {
      const second = selected[(index + 1) % selected.length];
      const a = split(first.word, first.teachingSentence), b = split(second.word, second.teachingSentence);
      return {id: `dictionary-${set.setKey}-${index}`, targets: [first.word, second.word] as [string,string],
        segments: [a[0], `${a[1]} ${b[0]}`, b[1]] as [string,string,string]};
    });
  });
  return {...snapshot, contentVersion: `${snapshot.contentVersion}:dictionary-v1`,
    contentSha256: fingerprintSnapshotValue(content),
    lesson: {...snapshot.lesson,
      words: snapshot.lesson.words.map(word => ({...word, memoryCue: meaning(word.word), feedbackReason: meaning(word.word)})),
      teachingGroups: snapshot.lesson.teachingGroups?.map(group => ({...group,
        words: group.words.map(word => ({...word, definition: meaning(word.word)}))})),
      dictationPassages: passages,
    }};
}
