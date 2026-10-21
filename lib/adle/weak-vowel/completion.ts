import type { AdleSessionItem } from "../loaders/daily-plan-surface";
import type { AssignmentAttemptEventWrite } from "../loaders/session-completion-loader";
import type { CompletionWordPolicy, ProducedWordAttempt } from "../composer-completions";
import { isExactGovernedFormCorrect } from "../session-correctness";
import { extractCanonicalSentenceTarget } from "../sentence-dictation-contract";
import type { CompiledWeakVowelSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import { weakVowelProgressValid, weakVowelReadyToFinish, type WeakVowelProgressV1 } from "./progress";

function targetTokenIndex(sentence: string, start: number): number {
  return (sentence.slice(0, start).match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? []).length;
}

/** Only answer-hidden Memory Lock and original full-sentence dictation are
 * production evidence. Guided investigation and revealed repairs never count. */
export function weakVowelCompletionFacts(snapshot: CompiledWeakVowelSpecialistSnapshotV3,
  progress: WeakVowelProgressV1): { producedWords: ProducedWordAttempt[]; wordPolicies: CompletionWordPolicy[] } {
  const lesson = snapshot.payload.resolvedLesson;
  if (!weakVowelProgressValid(progress, lesson) || !progress.finished || !weakVowelReadyToFinish(progress, lesson))
    throw new Error("weak_vowel_completion_incomplete");
  const producedWords: ProducedWordAttempt[] = lesson.words.map((word) => {
    const original = progress.dictationAttempts[word.canonicalWordId];
    const extracted = extractCanonicalSentenceTarget(original, {
      kind: "token", tokenIndex: targetTokenIndex(word.dictation.sentence, word.dictation.targetStart),
    });
    return { canonicalWordId: word.canonicalWordId, attemptText: extracted,
      correct: isExactGovernedFormCorrect(progress.coverAttempts[word.canonicalWordId], word.spelling) &&
        isExactGovernedFormCorrect(extracted, word.spelling) };
  });
  const wordPolicies: CompletionWordPolicy[] = lesson.words.map((word) => ({
    canonicalWordId: word.canonicalWordId, evidenceEligible: word.learningItemId !== null,
    scheduleEligible: word.learningItemId !== null, learningItemTransitionEligible: word.learningItemId !== null,
    rewardEligible: word.learningItemId !== null,
  }));
  return { producedWords, wordPolicies };
}

export function weakVowelAttemptEvents(input: { snapshot: CompiledWeakVowelSpecialistSnapshotV3;
  progress: WeakVowelProgressV1; items: readonly AdleSessionItem[]; childId: string;
  parentUserId: string; assignmentId: string; planDate: string }): AssignmentAttemptEventWrite[] {
  const lesson = input.snapshot.payload.resolvedLesson;
  if (!weakVowelProgressValid(input.progress, lesson) || !weakVowelReadyToFinish(input.progress, lesson))
    throw new Error("weak_vowel_attempts_incomplete");
  const wordById = new Map(lesson.words.map((word) => [word.canonicalWordId, word]));
  const sourceRef = `lesson:${input.childId}:${input.planDate}:${lesson.microSkillKey}`;
  return input.items.map((item) => {
    const base = { childId: input.childId, parentUserId: input.parentUserId,
      dailyAssignmentId: input.assignmentId, assignmentItemId: item.id,
      canonicalWordId: item.canonicalWordId, microSkillKey: item.microSkillKey,
      sectionKey: item.sectionKey, templateKey: item.templateKey || null,
      targetWord: item.targetWord };
    if (item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice")
      return { ...base, attemptText: "completed", isCorrect: null, attemptKind: "guided_practice" as const,
        evidenceClass: "guided_practice_attempt" as const, sourceRef: `${sourceRef}:guided:${item.id}` };
    const word = wordById.get(item.canonicalWordId ?? "");
    if (!word || item.targetWord !== word.spelling) throw new Error("weak_vowel_attempt_binding_invalid");
    if (item.sectionKey === "lesson_production") {
      const attempt = input.progress.coverAttempts[word.canonicalWordId];
      return { ...base, attemptText: attempt, isCorrect: isExactGovernedFormCorrect(attempt, word.spelling),
        attemptKind: "lesson_production" as const, evidenceClass: "first_exposure_lesson_attempt" as const, sourceRef };
    }
    if (item.sectionKey === "lesson_dictation") {
      const original = input.progress.dictationAttempts[word.canonicalWordId];
      const extracted = extractCanonicalSentenceTarget(original, {
        kind: "token", tokenIndex: targetTokenIndex(word.dictation.sentence, word.dictation.targetStart),
      });
      return { ...base, attemptText: original, isCorrect: isExactGovernedFormCorrect(extracted, word.spelling),
        attemptKind: "lesson_dictation" as const, evidenceClass: "first_exposure_lesson_attempt" as const,
        sourceRef: `${sourceRef}:dictation:${word.canonicalWordId}` };
    }
    throw new Error("weak_vowel_attempt_section_invalid");
  });
}
