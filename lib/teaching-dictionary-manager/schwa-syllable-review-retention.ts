import type { WordDraftPayload } from "./contracts";
import type { DictionaryPronunciation } from "./senses";
import type { SchwaWorkbookFacts } from "./weak-vowel-workbook";
import { normaliseWrittenSyllableBreakdown } from "./authoring";

/** A family-only rebuild can reuse an actual saved review of these exact facts.
 * An incoming workbook/context token alone is never evidence of that review. */
export function retainedSchwaSyllableReviewEpoch(input: {
  previous: WordDraftPayload | null | undefined;
  word: string; skill: string; senseId: string;
  pronunciation: DictionaryPronunciation | undefined;
  divisions: string; resetAt: string | null;
}): string {
  const previous = input.previous;
  if (!previous || !input.resetAt || previous.displayWord !== input.word
    || previous.skillSenseIds?.[input.skill] !== input.senseId || !input.pronunciation) return "";
  const fields = previous.routeContents.find(route => route.microSkillKey === input.skill)
    ?.content.schwaWorkbookFields as SchwaWorkbookFacts | undefined;
  if (fields?.syllable_review_epoch !== input.resetAt
    || !fields.written_syllable_breakdown?.trim()
    || normaliseWrittenSyllableBreakdown(fields.written_syllable_breakdown, input.word)
      !== normaliseWrittenSyllableBreakdown(input.divisions, input.word)) return "";
  const sense = previous.senseSet?.senses.find(sense => sense.id === input.senseId);
  const pronunciation = previous.senseSet?.pronunciations.find(row => row.id === sense?.pronunciationId);
  const current = input.pronunciation;
  if (!pronunciation || pronunciation.id !== current.id || pronunciation.ipa !== current.ipa
    || pronunciation.spokenSyllableCount !== current.spokenSyllableCount
    || pronunciation.stressPattern !== current.stressPattern) return "";
  return input.resetAt;
}
