import type { CompletionWordPolicy, ProducedWordAttempt } from "../composer-completions";
import { ingProgressValid, type IngProgressV1 } from "./progress";
import type { IngLessonV1 } from "./contracts";

function normalized(text: string) { return text.trim().toLocaleLowerCase("en-GB"); }

/** Raw spelling attempts are retained. Dictionary fill words never schedule learning items. */
export function ingCompletionFacts(lesson: IngLessonV1, progress: IngProgressV1) {
  if (!ingProgressValid(progress, lesson) || !progress.finished) throw new Error("ing_completion_incomplete");
  const producedWords: ProducedWordAttempt[] = lesson.words.map(word => {
    const attemptText = progress.dictationValues[word.canonicalWordId];
    return { canonicalWordId: word.canonicalWordId, attemptText, correct: normalized(attemptText) === word.word };
  });
  const wordPolicies: CompletionWordPolicy[] = lesson.words.map(word => ({ canonicalWordId: word.canonicalWordId,
    evidenceEligible: word.learningItemId !== null, scheduleEligible: word.learningItemId !== null,
    learningItemTransitionEligible: word.learningItemId !== null, rewardEligible: word.learningItemId !== null }));
  return { producedWords, wordPolicies, controlledAttempts: new Map(Object.entries(progress.coverAttempts)), dictationAttempts: new Map(Object.entries(progress.dictationValues)) };
}
