import { type ComposerPolicy } from "../composer-policy";
import {
  selectLessonWords,
  type WordSelectionFacts,
  type WordSelectionResult,
} from "../composer-word-selection";
import type { ChildBandProfile } from "../dictionary-eligibility";
import type { IsoDate } from "../review-scheduler";
import { WEAK_VOWEL_MICRO_SKILLS } from "../word-lab/weak-vowel-dinner";

export const WEAK_VOWEL_MIN_WORDS = 4;
export const WEAK_VOWEL_MAX_WORDS = 6;

/** The shared composer still owns ordering, eligibility, banding and probe policy.
 * Only this route changes the number of words needed for a lesson. */
export function selectWeakVowelLessonWords(
  microSkillKey: string,
  childId: string,
  facts: WordSelectionFacts,
  childBand: ChildBandProfile,
  policy: ComposerPolicy,
  today: IsoDate,
): WordSelectionResult {
  if (!WEAK_VOWEL_MICRO_SKILLS.some((key) => key === microSkillKey)) {
    throw new Error("Unsupported weak-vowel micro-skill");
  }
  const selected = selectLessonWords(
    microSkillKey, childId, facts, childBand,
    { ...policy, lessonWordCount: WEAK_VOWEL_MAX_WORDS }, today,
  );
  return selected.slots.length >= WEAK_VOWEL_MIN_WORDS
    ? { ...selected, skipReasons: selected.skipReasons.filter((reason) => reason !== "missing_required_words") }
    : selected;
}
