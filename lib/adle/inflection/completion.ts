import type { CompletionWordPolicy, ProducedWordAttempt } from "../composer-completions";
import { comparativeProgressValid, type ComparativeProgressV1 } from "./resume";
import { gradePairedDegreeAttempt, normalizeDegreeAttempt, type ComparativeLessonV1 } from "./contracts";
/** Server-recomputed spelling outcomes. Placement never changes spelling evidence. */
export function comparativeCompletionFacts(lesson: ComparativeLessonV1, progress: ComparativeProgressV1) {
  if (!comparativeProgressValid(progress, lesson) || !progress.finished) throw new Error("comparative_completion_incomplete");
  const placementOutcomes = lesson.dictationTasks.flatMap(t => gradePairedDegreeAttempt(t, progress.dictationValues[t.id]).map(o => ({ ...o, sentenceId: t.id })));
  const producedWords: ProducedWordAttempt[] = lesson.words.map(w => {
    const paired = placementOutcomes.find(o => o.canonicalWordId === w.canonicalWordId);
    const attemptText = paired?.attemptText ?? progress.coverAttempts[w.canonicalWordId];
    return { canonicalWordId: w.canonicalWordId, attemptText, correct: normalizeDegreeAttempt(attemptText) === w.word };
  });
  const wordPolicies: CompletionWordPolicy[] = lesson.words.map(w => ({ canonicalWordId: w.canonicalWordId, evidenceEligible: w.degree !== "base",
    scheduleEligible: w.learningItemId !== null, learningItemTransitionEligible: w.learningItemId !== null, rewardEligible: w.learningItemId !== null }));
  return { placementOutcomes, producedWords, wordPolicies, controlledAttempts: new Map(Object.entries(progress.coverAttempts)), dictationAttempts: new Map(placementOutcomes.map(o => [o.canonicalWordId, o.attemptText])) };
}
