import type { LatinRootLessonWord } from "./latin-root-lesson";
import { analyseDictationSentence } from "./dictation-context";
import { lessonReflectionSentenceComparison, type NormalizedLessonReflectionMistake, type NormalizedLessonReflectionSentenceComparison } from "../lesson-reflection";
import { isExactGovernedFormCorrect, normaliseSessionWord } from "../session-correctness";

/** Presentation only: submitted attempts inform reflection, never progress/evidence. */
export function latinRootReflectionModel(words: LatinRootLessonWord[], coverAttempts: Record<string, string>, sentenceAttempts: Record<string, string>) {
  const mistakes: NormalizedLessonReflectionMistake[] = [];
  const sentenceComparisons: NormalizedLessonReflectionSentenceComparison[] = [];
  for (const word of words) {
    if (Object.hasOwn(coverAttempts, word.id) && !isExactGovernedFormCorrect(coverAttempts[word.id], word.word)) mistakes.push({ id: `cover:${word.id}`, activityLabel: "Cover & check", attempt: coverAttempts[word.id], correctSpelling: word.word });
    if (!Object.hasOwn(sentenceAttempts, word.id)) continue;
    const attempt = sentenceAttempts[word.id];
    const comparison = lessonReflectionSentenceComparison({ id: `sentence:${word.id}`, attempt, correct: word.sentence });
    if (comparison) sentenceComparisons.push(comparison);
    const targetIndex = word.sentence.trim().split(/\s+/u).findIndex(token => normaliseSessionWord(token) === normaliseSessionWord(word.word));
    if (targetIndex < 0) continue;
    const analysis = analyseDictationSentence(word.sentence, attempt, targetIndex);
    if (!analysis.targetCorrect) mistakes.push({ id: `dictation:${word.id}`, activityLabel: "Dictation", attempt: analysis.targetAttemptedToken ?? "", correctSpelling: word.word });
  }
  return { mistakes, sentenceComparisons };
}
