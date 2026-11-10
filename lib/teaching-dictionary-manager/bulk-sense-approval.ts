import { targetOccurrences } from "./authoring";
import type { DictionarySenseSet } from "./senses";

export type BulkSenseChoice = {
  wordId: string;
  displayWord: string;
  senseSet: DictionarySenseSet | null;
  senseId: string | undefined;
};

/** The same selected meaning is required whether approval starts on a word or in a batch. */
export function bulkSenseChoiceError(choice: BulkSenseChoice): string | null {
  const { senseSet, senseId } = choice;
  if (!senseSet?.senses?.length) return "Review this word's meanings in Overview first.";
  if (!senseId) return senseSet.senses.length > 1
    ? "Choose the meaning taught by this micro-skill."
    : "Select the reviewed meaning.";
  const sense = senseSet.senses.find(row => row.id === senseId);
  if (!sense?.definition.trim() || !sense.partOfSpeech.trim())
    return "The selected meaning needs a reviewed definition and part of speech.";
  const pronunciation = senseSet.pronunciations.find(row => row.id === sense.pronunciationId);
  if (sense.partOfSpeech !== "root" && (!pronunciation?.ipa.trim()
    || !pronunciation.spokenSyllableCount || !pronunciation.stressPattern.trim()))
    return "The selected meaning needs a reviewed pronunciation.";
  if (senseSet.senses.length > 1 && !sense.dictationSentence?.trim())
    return "The selected meaning needs its own dictation sentence.";
  if (sense.dictationSentence?.trim() && (!Number.isInteger(sense.dictationTargetTokenIndex)
    || !targetOccurrences(sense.dictationSentence, choice.displayWord)
      .includes(sense.dictationTargetTokenIndex!)))
    return "The selected sentence must identify this word's exact position.";
  return null;
}
