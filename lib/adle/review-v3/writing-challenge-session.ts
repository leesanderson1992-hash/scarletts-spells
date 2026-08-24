import {
  REVIEW_TIMER_POLICY_V3,
  type CompiledReviewSnapshotV3,
  type ReviewChallengeType,
  type ReviewPromptCandidateSnapshotV3,
} from "./contracts";

export const REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION =
  "review_writing_challenge_session_v1" as const;

export type ReviewWritingChallengePhase =
  | "challenge_selection"
  | "creative_writing"
  | "writing_time_finished";

export interface ReviewWritingChallengeSessionV1 {
  schemaVersion: typeof REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION;
  assignmentId: string;
  snapshotFingerprint: string;
  wheelResult: ReviewChallengeType;
  selectedChallengeType: ReviewChallengeType | null;
  selectedPromptVersionId: string | null;
  phase: ReviewWritingChallengePhase;
  draftText: string;
  writingStartedAtMs: number | null;
  writingDeadlineAtMs: number | null;
  extensionSeconds: number | null;
  writingFinishedAtMs: number | null;
}

export type ReviewWritingChallengeTransition =
  | { ok: true; session: ReviewWritingChallengeSessionV1; replayed: boolean }
  | { ok: false; code: "prompt_not_in_snapshot" | "writing_not_ready" | "writing_not_active" | "extension_not_allowed" };

function hasR1TimerPolicy(snapshot: CompiledReviewSnapshotV3): boolean {
  const policy = snapshot.timerPolicy;
  return policy.writingDurationSeconds === REVIEW_TIMER_POLICY_V3.writingDurationSeconds &&
    policy.maximumExtensions === REVIEW_TIMER_POLICY_V3.maximumExtensions &&
    policy.parentReauthenticationRequired === REVIEW_TIMER_POLICY_V3.parentReauthenticationRequired &&
    policy.scope === REVIEW_TIMER_POLICY_V3.scope &&
    policy.extensionOptionsSeconds.length === REVIEW_TIMER_POLICY_V3.extensionOptionsSeconds.length &&
    policy.extensionOptionsSeconds.every((seconds, index) =>
      seconds === REVIEW_TIMER_POLICY_V3.extensionOptionsSeconds[index],
    );
}

export function createReviewWritingChallengeSession(
  snapshot: CompiledReviewSnapshotV3,
): ReviewWritingChallengeSessionV1 {
  if (!hasR1TimerPolicy(snapshot)) {
    throw new Error("Review Writing Challenge requires the frozen R1 timer policy");
  }
  return {
    schemaVersion: REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION,
    assignmentId: snapshot.assignment.assignmentId,
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    wheelResult: snapshot.initialChallengeType,
    selectedChallengeType: null,
    selectedPromptVersionId: null,
    phase: "challenge_selection",
    draftText: "",
    writingStartedAtMs: null,
    writingDeadlineAtMs: null,
    extensionSeconds: null,
    writingFinishedAtMs: null,
  };
}

export function promptForChallengeType(
  snapshot: CompiledReviewSnapshotV3,
  challengeType: ReviewChallengeType,
): ReviewPromptCandidateSnapshotV3 {
  const prompt = snapshot.promptCandidates.find((candidate) =>
    candidate.challengeType === challengeType,
  );
  if (!prompt) throw new Error("Review snapshot is missing its governed challenge prompt");
  return prompt;
}

export function selectedChallengePrompt(
  snapshot: CompiledReviewSnapshotV3,
  session: ReviewWritingChallengeSessionV1,
): ReviewPromptCandidateSnapshotV3 | null {
  if (session.selectedChallengeType === null || session.selectedPromptVersionId === null) return null;
  const prompt = promptForChallengeType(snapshot, session.selectedChallengeType);
  return prompt.promptVersionId === session.selectedPromptVersionId ? prompt : null;
}

export function selectReviewChallengePrompt(
  snapshot: CompiledReviewSnapshotV3,
  session: ReviewWritingChallengeSessionV1,
  challengeType: ReviewChallengeType,
): ReviewWritingChallengeTransition {
  if (session.phase !== "challenge_selection") {
    return { ok: false, code: "writing_not_active" };
  }
  const prompt = snapshot.promptCandidates.find((candidate) => candidate.challengeType === challengeType);
  if (!prompt) return { ok: false, code: "prompt_not_in_snapshot" };
  const replayed = session.selectedPromptVersionId === prompt.promptVersionId;
  return {
    ok: true,
    replayed,
    session: {
      ...session,
      selectedChallengeType: prompt.challengeType,
      selectedPromptVersionId: prompt.promptVersionId,
    },
  };
}

export function revealInitialWheelResult(
  snapshot: CompiledReviewSnapshotV3,
  session: ReviewWritingChallengeSessionV1,
): ReviewWritingChallengeTransition {
  return selectReviewChallengePrompt(snapshot, session, session.wheelResult);
}

export function beginCreativeWriting(
  snapshot: CompiledReviewSnapshotV3,
  session: ReviewWritingChallengeSessionV1,
  startedAtMs: number,
): ReviewWritingChallengeTransition {
  if (session.phase === "creative_writing") return { ok: true, session, replayed: true };
  if (session.phase !== "challenge_selection" || selectedChallengePrompt(snapshot, session) === null) {
    return { ok: false, code: "writing_not_ready" };
  }
  return {
    ok: true,
    replayed: false,
    session: {
      ...session,
      phase: "creative_writing",
      writingStartedAtMs: startedAtMs,
      writingDeadlineAtMs: startedAtMs + (REVIEW_TIMER_POLICY_V3.writingDurationSeconds * 1_000),
    },
  };
}

export function saveWritingChallengeDraft(
  session: ReviewWritingChallengeSessionV1,
  draftText: string,
): ReviewWritingChallengeSessionV1 {
  return session.phase === "creative_writing"
    ? { ...session, draftText }
    : session;
}

export function remainingWritingSeconds(
  session: ReviewWritingChallengeSessionV1,
  nowMs: number,
): number {
  if (session.phase !== "creative_writing" || session.writingDeadlineAtMs === null) return 0;
  const maximumAllowedSeconds = REVIEW_TIMER_POLICY_V3.writingDurationSeconds +
    (session.extensionSeconds ?? 0);
  return Math.min(
    maximumAllowedSeconds,
    Math.max(0, Math.ceil((session.writingDeadlineAtMs - nowMs) / 1_000)),
  );
}

export function applyParentReauthenticatedExtension(
  session: ReviewWritingChallengeSessionV1,
  extensionSeconds: number,
  reauthenticatedAtMs: number = Date.now(),
): ReviewWritingChallengeTransition {
  if (
    session.phase !== "writing_time_finished" ||
    session.writingDeadlineAtMs === null ||
    session.extensionSeconds !== null ||
    !REVIEW_TIMER_POLICY_V3.extensionOptionsSeconds.includes(
      extensionSeconds as (typeof REVIEW_TIMER_POLICY_V3.extensionOptionsSeconds)[number],
    )
  ) return { ok: false, code: "extension_not_allowed" };

  if (
    session.phase === "writing_time_finished" &&
    reauthenticatedAtMs < session.writingDeadlineAtMs
  ) return { ok: false, code: "extension_not_allowed" };

  return {
    ok: true,
    replayed: false,
    session: {
      ...session,
      phase: "creative_writing",
      extensionSeconds,
      writingDeadlineAtMs: reauthenticatedAtMs + (extensionSeconds * 1_000),
      writingFinishedAtMs: null,
    },
  };
}

export function finishCreativeWriting(
  session: ReviewWritingChallengeSessionV1,
  finishedAtMs: number,
): ReviewWritingChallengeTransition {
  if (session.phase === "writing_time_finished") return { ok: true, session, replayed: true };
  if (session.phase !== "creative_writing") return { ok: false, code: "writing_not_active" };
  return {
    ok: true,
    replayed: false,
    session: {
      ...session,
      phase: "writing_time_finished",
      writingFinishedAtMs: finishedAtMs,
    },
  };
}

export function expireCreativeWritingIfNeeded(
  session: ReviewWritingChallengeSessionV1,
  nowMs: number,
): ReviewWritingChallengeSessionV1 {
  if (remainingWritingSeconds(session, nowMs) > 0) return session;
  const result = finishCreativeWriting(session, nowMs);
  return result.ok ? result.session : session;
}
