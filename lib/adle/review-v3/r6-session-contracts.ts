import type { CompiledReviewSnapshotV3 } from "./contracts";

export type AdleMajorStage =
  | "empty"
  | "review"
  | "specialist_generation"
  | "specialist_lesson"
  | "session_complete"
  | "blocked";

export interface AdleTodaySessionReadModel {
  childId: string;
  assignmentDate: string;
  assignmentId: string | null;
  majorStage: AdleMajorStage;
  stateVersion: number;
  blockerCode: string | null;
  review: null | {
    itemId: string;
    sessionId: string;
    complete: boolean;
    snapshot: CompiledReviewSnapshotV3;
  };
  specialist: null | {
    complete: boolean;
    compiledLessonSnapshot: unknown;
    lessonRouteMetadata: unknown;
  };
}

export interface ReviewR6WritingSessionView {
  reviewSessionId: string;
  stateVersion: number;
  selectedChallengeType: string | null;
  draftText: string;
  stage: string;
  writingStartedAt: string | null;
  writingDeadlineAt: string | null;
  extensionSeconds: number | null;
  submittedWritingText: string | null;
  completedAt: string | null;
}

export interface AdleSpecialistCheckpointR6View {
  adapterKey: string;
  checkpointSchemaVersion: string;
  lessonSnapshotFingerprint: string;
  checkpointPayload: Record<string, unknown>;
  stateVersion: number;
}
