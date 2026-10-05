import type { LessonReflectionContextRecap, NormalizedLessonReflectionMistake } from "@/lib/adle/lesson-reflection";
import { gradePairedDegreeAttempt, normalizeDegreeAttempt, type ComparativeLessonV1 } from "./contracts";
import type { ComparativeProgressV1 } from "./resume";

/** Independent attempts only; sentence placement is feedback, not spelling evidence. */
export function comparativeReflectionModel(lesson: ComparativeLessonV1, progress: ComparativeProgressV1): {
  mistakes: NormalizedLessonReflectionMistake[];
  contextRecap: LessonReflectionContextRecap;
} {
  const mistakes: NormalizedLessonReflectionMistake[] = lesson.words.flatMap(word => {
    const attempt = progress.coverAttempts[word.canonicalWordId];
    return attempt !== undefined && normalizeDegreeAttempt(attempt) !== word.word
      ? [{ id: `cover:${word.canonicalWordId}`, attempt, correctSpelling: word.word }] : [];
  });
  const items: { id: string; text: string }[] = [];
  for (const sentence of lesson.dictationTasks) {
    if (!progress.dictationChecked[sentence.id]) continue;
    for (const outcome of gradePairedDegreeAttempt(sentence, progress.dictationValues[sentence.id])) {
      const target = sentence.targets[outcome.expectedSlot];
      if (!outcome.spellingCorrect) mistakes.push({ id: `${sentence.id}:${outcome.canonicalWordId}`, attempt: outcome.attemptText, correctSpelling: target.word });
      else if (!outcome.placementCorrect) items.push({ id: `${sentence.id}:${outcome.canonicalWordId}`, text: `You spelt ${target.word} correctly, but put it in gap ${outcome.attemptedSlot + 1}. It belongs in gap ${outcome.expectedSlot + 1}.` });
    }
  }
  return { mistakes, contextRecap: { heading: "The right word in the right gap", introduction: "These words were spelt correctly. Check which comparison each sentence needs.", items } };
}
