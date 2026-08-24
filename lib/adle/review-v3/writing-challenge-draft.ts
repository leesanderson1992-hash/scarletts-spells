import type { CompiledReviewSnapshotV3 } from "./contracts";
import {
  REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION,
  type ReviewWritingChallengeSessionV1,
} from "./writing-challenge-session";

export const REVIEW_WRITING_CHALLENGE_DRAFT_SCHEMA_VERSION =
  "review_writing_challenge_draft_v1" as const;

export interface ReviewWritingChallengeDraftEnvelopeV1 {
  schemaVersion: typeof REVIEW_WRITING_CHALLENGE_DRAFT_SCHEMA_VERSION;
  assignmentId: string;
  snapshotFingerprint: string;
  session: ReviewWritingChallengeSessionV1;
}

export interface ReviewWritingChallengeDraftStore {
  load(key: string): unknown;
  save(key: string, value: ReviewWritingChallengeDraftEnvelopeV1): void;
  clear(key: string): void;
}

export function reviewWritingChallengeDraftKey(snapshot: CompiledReviewSnapshotV3): string {
  return `adle:review-writing-challenge:v1:${snapshot.assignment.assignmentId}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validPhase(value: unknown): boolean {
  return value === "challenge_selection" ||
    value === "creative_writing" ||
    value === "writing_time_finished";
}

function validSession(value: unknown, snapshot: CompiledReviewSnapshotV3): value is ReviewWritingChallengeSessionV1 {
  if (!record(value)) return false;
  const prompt = snapshot.promptCandidates.find((candidate) =>
    candidate.challengeType === value.selectedChallengeType,
  );
  return value.schemaVersion === REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION &&
    value.assignmentId === snapshot.assignment.assignmentId &&
    value.snapshotFingerprint === snapshot.provenance.sourceFingerprint &&
    typeof value.wheelResult === "string" &&
    snapshot.promptCandidates.some((candidate) => candidate.challengeType === value.wheelResult) &&
    (value.selectedChallengeType === null || prompt !== undefined) &&
    (value.selectedPromptVersionId === null || prompt?.promptVersionId === value.selectedPromptVersionId) &&
    validPhase(value.phase) &&
    typeof value.draftText === "string" &&
    (value.writingStartedAtMs === null || Number.isFinite(value.writingStartedAtMs)) &&
    (value.writingDeadlineAtMs === null || Number.isFinite(value.writingDeadlineAtMs)) &&
    (value.extensionSeconds === null || [300, 600, 900].includes(value.extensionSeconds as number)) &&
    (value.writingFinishedAtMs === null || Number.isFinite(value.writingFinishedAtMs));
}

export function createReviewWritingChallengeDraftEnvelope(
  snapshot: CompiledReviewSnapshotV3,
  session: ReviewWritingChallengeSessionV1,
): ReviewWritingChallengeDraftEnvelopeV1 {
  return {
    schemaVersion: REVIEW_WRITING_CHALLENGE_DRAFT_SCHEMA_VERSION,
    assignmentId: snapshot.assignment.assignmentId,
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    session,
  };
}

export function restoreReviewWritingChallengeDraft(
  value: unknown,
  snapshot: CompiledReviewSnapshotV3,
): ReviewWritingChallengeSessionV1 | null {
  if (!record(value) ||
    value.schemaVersion !== REVIEW_WRITING_CHALLENGE_DRAFT_SCHEMA_VERSION ||
    value.assignmentId !== snapshot.assignment.assignmentId ||
    value.snapshotFingerprint !== snapshot.provenance.sourceFingerprint ||
    !validSession(value.session, snapshot)) return null;
  return value.session;
}

export function browserReviewWritingChallengeDraftStore(): ReviewWritingChallengeDraftStore | null {
  if (typeof window === "undefined") return null;
  return {
    load(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    },
    save(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // A device draft is convenience only until the guarded R5 server adapter exists.
      }
    },
    clear(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // A failed cleanup must not block the learner's next Review screen.
      }
    },
  };
}
