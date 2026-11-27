import type { AdleSessionItem } from "../loaders/daily-plan-surface";
import type { AssignmentAttemptEventWrite } from "../loaders/session-completion-loader";
import type { CompletionWordPolicy, ProducedWordAttempt } from "../composer-completions";
import { isExactGovernedFormCorrect } from "../session-correctness";
import { extractCanonicalSentenceTarget } from "../sentence-dictation-contract";
import type { CompiledLatinRootSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import { latinRootProgressValid, latinRootReadyToFinish, type LatinRootProgressV1 } from "./latin-root-progress";

/** Only answer-hidden cover and check and original full-sentence dictation are
 * production evidence. Guided word building and revealed repairs never count. */
export function latinRootCompletionFacts(snapshot: CompiledLatinRootSpecialistSnapshotV3,
  progress: LatinRootProgressV1): { producedWords: ProducedWordAttempt[]; wordPolicies: CompletionWordPolicy[] } {
  const lesson = snapshot.payload.resolvedLesson;
  const contentWords = lesson.content.families.flatMap(family => family.words);
  if (!latinRootProgressValid(progress, lesson.content) || !progress.finished || !latinRootReadyToFinish(progress, lesson.content))
    throw new Error("latin_root_completion_incomplete");
  const producedWords: ProducedWordAttempt[] = lesson.words.map((word) => {
    const original = progress.sentenceAttempts[word.canonicalWordId];
    const extracted = extractCanonicalSentenceTarget(original, {
      kind: "token", tokenIndex: word.targetTokenIndex,
    });
    return { canonicalWordId: word.canonicalWordId, attemptText: extracted,
      correct: isExactGovernedFormCorrect(progress.coverAttempts[word.canonicalWordId], contentWords.find(content => content.id === word.canonicalWordId)!.word) &&
        isExactGovernedFormCorrect(extracted, contentWords.find(content => content.id === word.canonicalWordId)!.word) };
  });
  const wordPolicies: CompletionWordPolicy[] = lesson.words.map((word) => ({
    canonicalWordId: word.canonicalWordId, evidenceEligible: word.learningItemId !== null,
    scheduleEligible: word.learningItemId !== null, learningItemTransitionEligible: word.learningItemId !== null,
    rewardEligible: word.learningItemId !== null,
  }));
  return { producedWords, wordPolicies };
}

export function latinRootAttemptEvents(input: { snapshot: CompiledLatinRootSpecialistSnapshotV3;
  progress: LatinRootProgressV1; items: readonly AdleSessionItem[]; childId: string;
  parentUserId: string; assignmentId: string; planDate: string }): AssignmentAttemptEventWrite[] {
  const lesson = input.snapshot.payload.resolvedLesson;
  const contentWords = lesson.content.families.flatMap(family => family.words);
  if (!latinRootProgressValid(input.progress, lesson.content) || !latinRootReadyToFinish(input.progress, lesson.content))
    throw new Error("latin_root_attempts_incomplete");
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
    if (!word || item.targetWord !== contentWords.find(content => content.id === word.canonicalWordId)!.word) throw new Error("latin_root_attempt_binding_invalid");
    if (item.sectionKey === "lesson_production") {
      const attempt = input.progress.coverAttempts[word.canonicalWordId];
      return { ...base, attemptText: attempt, isCorrect: isExactGovernedFormCorrect(attempt, contentWords.find(content => content.id === word.canonicalWordId)!.word),
        attemptKind: "lesson_production" as const, evidenceClass: "first_exposure_lesson_attempt" as const, sourceRef };
    }
    if (item.sectionKey === "lesson_dictation") {
      const original = input.progress.sentenceAttempts[word.canonicalWordId];
      const extracted = extractCanonicalSentenceTarget(original, {
        kind: "token", tokenIndex: word.targetTokenIndex,
      });
      return { ...base, attemptText: original, isCorrect: isExactGovernedFormCorrect(extracted, contentWords.find(content => content.id === word.canonicalWordId)!.word),
        attemptKind: "lesson_dictation" as const, evidenceClass: "first_exposure_lesson_attempt" as const,
        sourceRef: `${sourceRef}:dictation:${word.canonicalWordId}` };
    }
    throw new Error("latin_root_attempt_section_invalid");
  });
}
