import type { BaseWordFamilyLessonSnapshotV1 } from "./morphology/base-word-family-payload";
import type { IsoDate } from "./review-scheduler";

export interface BaseWordTransferMissWrite {
  childId: string;
  canonicalWordId: string;
  microSkillKey: string;
  lessonSourceRef: string;
  occurredOn: IsoDate;
  attemptText: string;
}

export interface BaseWordFinalIndependentAttempt {
  canonicalWordId: string;
  attemptText: string;
  correct: boolean;
}

/**
 * Selects only missed transfer words from the final independent attempt. The
 * durable RPC owns separate-lesson counting and learning-item creation.
 */
export function baseWordTransferMissWrites(params: {
  payload: BaseWordFamilyLessonSnapshotV1;
  childId: string;
  lessonSourceRef: string;
  occurredOn: IsoDate;
  finalAttempts: readonly BaseWordFinalIndependentAttempt[];
}): BaseWordTransferMissWrite[] {
  const attempts = new Map(params.finalAttempts.map((attempt) => [attempt.canonicalWordId, attempt]));
  const writes: BaseWordTransferMissWrite[] = [];
  for (const slot of params.payload.independentSlots) {
    if (slot.provenance !== "transfer") continue;
    const attempt = attempts.get(slot.canonicalWordId);
    if (!attempt || attempt.correct || !attempt.attemptText.trim()) continue;
    writes.push({
      childId: params.childId,
      canonicalWordId: slot.canonicalWordId,
      microSkillKey: params.payload.microSkillKey,
      lessonSourceRef: params.lessonSourceRef,
      occurredOn: params.occurredOn,
      attemptText: attempt.attemptText,
    });
  }
  return writes;
}
