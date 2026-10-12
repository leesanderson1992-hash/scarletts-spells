import type { AdleSessionItem } from "../loaders/daily-plan-surface";
import type { AssignmentAttemptEventWrite } from "../loaders/session-completion-loader";
import type { CompletionWordPolicy, ProducedWordAttempt } from "../composer-completions";
import { isExactGovernedFormCorrect } from "../session-correctness";
import { homophoneProgressComplete, homophoneProgressValid, type HomophoneProgressV1 } from "./progress";
import type { CompiledHomophoneSpecialistSnapshotV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";

export function homophoneCompletionFacts(snapshot: CompiledHomophoneSpecialistSnapshotV3, progress: HomophoneProgressV1) {
  const lesson = snapshot.payload.resolvedLesson.lesson;
  if (!homophoneProgressValid(progress, lesson) || !homophoneProgressComplete(progress, lesson) || !progress.completed) {
    throw new Error("homophone_completion_incomplete");
  }
  const producedWords: ProducedWordAttempt[] = snapshot.words.map(word => {
    const attempts = lesson.dictationPassages.flatMap((passage, index) => passage.targets.flatMap((target, slot) =>
      target === word.displayWord ? [progress.dictationValues[String(index)][slot]] : []));
    const cover = progress.coverAttempts[word.displayWord];
    return { canonicalWordId: word.canonicalWordId, attemptText: attempts.at(-1) ?? "",
      correct: isExactGovernedFormCorrect(cover, word.displayWord) && attempts.length > 0 && attempts.every(attempt => isExactGovernedFormCorrect(attempt, word.displayWord)) };
  });
  const wordPolicies: CompletionWordPolicy[] = snapshot.words.map(word => ({ canonicalWordId: word.canonicalWordId,
    evidenceEligible: word.learningItemId !== null, scheduleEligible: word.learningItemId !== null,
    learningItemTransitionEligible: word.learningItemId !== null, rewardEligible: word.learningItemId !== null }));
  return { producedWords, wordPolicies };
}

export function homophoneAttemptEvents(params: { snapshot: CompiledHomophoneSpecialistSnapshotV3; progress: HomophoneProgressV1;
  items: readonly AdleSessionItem[]; childId: string; parentUserId: string; assignmentId: string; planDate: string }): AssignmentAttemptEventWrite[] {
  const lesson = params.snapshot.payload.resolvedLesson.lesson;
  if (!homophoneProgressValid(params.progress, lesson) || !homophoneProgressComplete(params.progress, lesson)) throw new Error("homophone_attempts_incomplete");
  const sourceRef = `lesson:${params.childId}:${params.planDate}:${lesson.microSkillKey}`;
  return params.items.map(item => {
    const base = { childId: params.childId, parentUserId: params.parentUserId, dailyAssignmentId: params.assignmentId,
      assignmentItemId: item.id, canonicalWordId: item.canonicalWordId, microSkillKey: item.microSkillKey,
      sectionKey: item.sectionKey, templateKey: item.templateKey || null, targetWord: item.targetWord };
    if (item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice") return { ...base, attemptText: "completed", isCorrect: null,
      attemptKind: "guided_practice" as const, evidenceClass: "guided_practice_attempt" as const, sourceRef: `${sourceRef}:guided:${item.id}` };
    if (item.sectionKey === "lesson_production" && item.targetWord) {
      const attemptText = params.progress.coverAttempts[item.targetWord];
      return { ...base, attemptText, isCorrect: isExactGovernedFormCorrect(attemptText, item.targetWord), attemptKind: "lesson_production" as const,
        evidenceClass: "first_exposure_lesson_attempt" as const, sourceRef };
    }
    if (item.sectionKey === "lesson_dictation" && item.targetWord) {
      const activityId = String(item.promptData.homophoneActivityId ?? "");
      const index = Number(activityId.slice("dictation:".length));
      const slot = Number(item.promptData.targetSlot);
      const passage = lesson.dictationPassages[index];
      if (!/^dictation:\d+$/.test(activityId) || !passage || !Number.isInteger(slot) || passage.targets[slot] !== item.targetWord
        || item.promptData.passageId !== passage.id) throw new Error("homophone_attempt_context_mismatch");
      const attemptText = params.progress.dictationValues[String(index)][slot];
      return { ...base, attemptText, isCorrect: isExactGovernedFormCorrect(attemptText, item.targetWord), attemptKind: "lesson_dictation" as const,
        evidenceClass: "first_exposure_lesson_attempt" as const, sourceRef: `${sourceRef}:passage:${passage.id}:slot:${slot}` };
    }
    throw new Error("homophone_attempt_item_unexpected");
  });
}
