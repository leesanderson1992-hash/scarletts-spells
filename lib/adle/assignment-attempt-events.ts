import type { AdleSessionItem } from "./loaders/daily-plan-surface";
import type { AssignmentAttemptEventWrite } from "./loaders/session-completion-loader";
import { isAttemptCorrect } from "./session-correctness";

interface AttemptContext {
  childId: string;
  parentUserId: string;
  assignmentId: string;
  planDate: string;
}

function attemptEventBase(context: AttemptContext, item: AdleSessionItem) {
  return {
    childId: context.childId,
    parentUserId: context.parentUserId,
    dailyAssignmentId: context.assignmentId,
    assignmentItemId: item.id,
    canonicalWordId: item.canonicalWordId,
    microSkillKey: item.microSkillKey,
    sectionKey: item.sectionKey,
    templateKey: item.templateKey || null,
    targetWord: item.targetWord,
  };
}

export function buildReviewAttemptEvents(params: {
  context: AttemptContext;
  productionItems: readonly AdleSessionItem[];
  reflectionItems: readonly AdleSessionItem[];
  attempts: ReadonlyMap<string, string>;
  reflectionAttempts: ReadonlyMap<string, string>;
}): AssignmentAttemptEventWrite[] {
  const reviewSourceRef = `review:${params.context.childId}:${params.context.planDate}`;
  const events: AssignmentAttemptEventWrite[] = params.productionItems.map((item) => {
    const attemptText = params.attempts.get(item.canonicalWordId ?? "") ?? "";
    return {
      ...attemptEventBase(params.context, item),
      attemptText,
      isCorrect: isAttemptCorrect(attemptText, item.targetWord),
      attemptKind: "review_production",
      evidenceClass: "scheduled_review_attempt",
      sourceRef: reviewSourceRef,
    };
  });
  for (const item of params.reflectionItems) {
    if (!params.reflectionAttempts.has(item.id)) {
      continue;
    }
    events.push({
      ...attemptEventBase(params.context, item),
      attemptText: params.reflectionAttempts.get(item.id) ?? "",
      isCorrect: null,
      attemptKind: "reflection_retry",
      evidenceClass: "reflection_attempt",
      sourceRef: `${reviewSourceRef}:reflection:${item.id}`,
    });
  }
  return events;
}

export function buildLessonAttemptEvents(params: {
  context: AttemptContext;
  sourceRef: string;
  items: readonly AdleSessionItem[];
  controlledAttempts: ReadonlyMap<string, string>;
  dictationAttempts: ReadonlyMap<string, string>;
  dictationRawAttempts?: ReadonlyMap<string, string>;
  guidedAttempts: ReadonlyMap<string, string>;
  probeAttempts: ReadonlyMap<string, string>;
}): AssignmentAttemptEventWrite[] {
  const events: AssignmentAttemptEventWrite[] = [];
  for (const item of params.items) {
    if (item.sectionKey === "guided_practice") {
      if (!params.guidedAttempts.has(item.id)) {
        continue;
      }
      events.push({
        ...attemptEventBase(params.context, item),
        attemptText: params.guidedAttempts.get(item.id) ?? "",
        isCorrect: null,
        attemptKind: "guided_practice",
        evidenceClass: "guided_practice_attempt",
        sourceRef: `${params.sourceRef}:guided:${item.id}`,
      });
      continue;
    }
    if (item.sectionKey === "lesson_production" && item.canonicalWordId !== null) {
      const attemptText = params.controlledAttempts.get(item.canonicalWordId) ?? "";
      events.push({
        ...attemptEventBase(params.context, item),
        attemptText,
        isCorrect: isAttemptCorrect(attemptText, item.targetWord),
        attemptKind: "lesson_production",
        evidenceClass: "first_exposure_lesson_attempt",
        sourceRef: params.sourceRef,
      });
      continue;
    }
    if (item.sectionKey === "lesson_dictation" && item.canonicalWordId !== null) {
      const attemptText = params.dictationAttempts.get(item.canonicalWordId) ?? "";
      events.push({
        ...attemptEventBase(params.context, item),
        attemptText: params.dictationRawAttempts?.get(item.canonicalWordId) ?? attemptText,
        isCorrect: isAttemptCorrect(attemptText, item.targetWord),
        attemptKind: "lesson_dictation",
        evidenceClass: "first_exposure_lesson_attempt",
        sourceRef: params.sourceRef,
      });
      continue;
    }
    if (item.sectionKey === "lesson_probe") {
      const probeWords = Array.isArray(item.promptData.words)
        ? (item.promptData.words as { canonicalWordId?: unknown; targetWord?: unknown }[])
        : [];
      for (const word of probeWords) {
        if (typeof word.canonicalWordId !== "string" || typeof word.targetWord !== "string") {
          continue;
        }
        const attemptText = params.probeAttempts.get(word.canonicalWordId) ?? "";
        events.push({
          ...attemptEventBase(params.context, item),
          canonicalWordId: word.canonicalWordId,
          targetWord: word.targetWord,
          attemptText,
          isCorrect: isAttemptCorrect(attemptText, word.targetWord),
          attemptKind: "lesson_probe",
          evidenceClass: "diagnostic_probe_attempt",
          sourceRef: `probe:${params.context.childId}:${params.context.planDate}:${item.microSkillKey ?? "unknown"}:${word.canonicalWordId}`,
        });
      }
    }
  }
  return events;
}
