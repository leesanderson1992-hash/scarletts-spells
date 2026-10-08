"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { reviewR6GatewayAction, type ReviewR6GatewayRequest } from "@/app/learn/week/adle/review-r6-actions";
import { WordLabScene } from "@/components/adle/morphology/word-lab-scene";
import {
  ReviewFreeWritingActivity,
  type ReviewR2DurableWritingGateway,
} from "./review-free-writing-activity";
import type { CompiledReviewSnapshotV3, ReviewChallengeType } from "@/lib/adle/review-v3/contracts";
import type { ReviewR3Gateway, ReviewR3GatewayResult, ReviewR3SessionView } from "@/lib/adle/review-v3/r3-contracts";
import type { ReviewR4Gateway, ReviewR4GatewayResult, ReviewR4SessionView } from "@/lib/adle/review-v3/r4-contracts";
import type { ReviewR6WritingSessionView } from "@/lib/adle/review-v3/r6-session-contracts";
import {
  REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION,
  type ReviewWritingChallengeSessionV1,
} from "@/lib/adle/review-v3/writing-challenge-session";

type Base = {
  assignmentId: string;
  reviewSessionId: string;
  snapshotFingerprint: string;
};

function writingSession(snapshot: CompiledReviewSnapshotV3, row: ReviewR6WritingSessionView): ReviewWritingChallengeSessionV1 {
  const selected = row.selectedChallengeType as ReviewChallengeType | null;
  const prompt = selected === null ? null : snapshot.promptCandidates.find((candidate) => candidate.challengeType === selected) ?? null;
  const deadline = row.writingDeadlineAt === null ? null : new Date(row.writingDeadlineAt).getTime();
  const started = row.writingStartedAt === null ? null : new Date(row.writingStartedAt).getTime();
  const expired = deadline !== null && deadline <= Date.now() && row.submittedWritingText === null;
  return {
    schemaVersion: REVIEW_WRITING_CHALLENGE_SESSION_SCHEMA_VERSION,
    assignmentId: snapshot.assignment.assignmentId,
    snapshotFingerprint: snapshot.provenance.sourceFingerprint,
    wheelResult: snapshot.initialChallengeType,
    selectedChallengeType: selected,
    selectedPromptVersionId: prompt?.promptVersionId ?? null,
    phase: row.writingStartedAt === null
      ? "challenge_selection"
      : expired ? "writing_time_finished" : "creative_writing",
    draftText: row.draftText,
    writingStartedAtMs: started,
    writingDeadlineAtMs: deadline,
    extensionSeconds: row.extensionSeconds,
    writingFinishedAtMs: expired ? Date.now() : null,
  };
}

export function ReviewR6Session(props: {
  assignmentId: string;
  reviewSessionId: string;
  snapshot: CompiledReviewSnapshotV3;
  /** Transport seam only: the development fixture supplies a local gateway. */
  gateway?: (request: ReviewR6GatewayRequest) => Promise<unknown>;
  onStageRefresh?: () => void;
}) {
  const router = useRouter();
  const gateway = props.gateway ?? reviewR6GatewayAction;
  const [initial, setInitial] = useState<{ session: ReviewWritingChallengeSessionV1; stateVersion: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const parentPassword = useRef<string | null>(null);
  const base = useMemo<Base>(() => ({
    assignmentId: props.assignmentId,
    reviewSessionId: props.reviewSessionId,
    snapshotFingerprint: props.snapshot.provenance.sourceFingerprint,
  }), [props.assignmentId, props.reviewSessionId, props.snapshot.provenance.sourceFingerprint]);

  useEffect(() => {
    let active = true;
    void gateway({ ...base, action: "hydrate_writing" })
      .then((value) => {
        if (!active) return;
        const row = value as ReviewR6WritingSessionView;
        setInitial({ session: writingSession(props.snapshot, row), stateVersion: row.stateVersion });
      })
      .catch(() => { if (active) setMessage("Your Review could not be loaded. Please refresh."); });
    return () => { active = false; };
  }, [base, props.snapshot, gateway]);

  const r3 = useMemo<ReviewR3Gateway>(() => ({
    hydrate: () => gateway({ ...base, action: "hydrate_r3" }) as Promise<ReviewR3SessionView>,
    submitWriting: (input) => gateway({ ...base, action: "submit_writing", ...input }) as Promise<ReviewR3GatewayResult>,
    submitAudioCheck: (input) => gateway({ ...base, action: "submit_audio", ...input }) as Promise<ReviewR3GatewayResult>,
    confirmSuggestion: (input) => gateway({ ...base, action: "confirm_suggestion", ...input }) as Promise<ReviewR3GatewayResult>,
    answerAttemptQuestion: (input) => gateway({ ...base, action: "answer_attempt", ...input }) as Promise<ReviewR3GatewayResult>,
    confirmWritingSpan: (input) => gateway({ ...base, action: "confirm_span", ...input }) as Promise<ReviewR3GatewayResult>,
  }), [base, gateway]);
  const r4 = useMemo<ReviewR4Gateway>(() => ({
    hydrate: () => gateway({ ...base, action: "hydrate_r4" }) as Promise<ReviewR4SessionView>,
    beginRepair: (input) => gateway({ ...base, action: "begin_repair", ...input }) as Promise<ReviewR4GatewayResult>,
    moveToTrickyPart: (input) => gateway({ ...base, action: "move_tricky", ...input }) as Promise<ReviewR4GatewayResult>,
    saveTrickySpan: (input) => gateway({ ...base, action: "save_tricky", ...input }) as Promise<ReviewR4GatewayResult>,
    saveMemoryCue: (input) => gateway({ ...base, action: "save_cue", ...input }) as Promise<ReviewR4GatewayResult>,
    moveToCover: (input) => gateway({ ...base, action: "move_cover", ...input }) as Promise<ReviewR4GatewayResult>,
    moveToTryAgain: (input) => gateway({ ...base, action: "move_try", ...input }) as Promise<ReviewR4GatewayResult>,
    submitRepairRetry: (input) => gateway({ ...base, action: "repair_retry", ...input }) as Promise<ReviewR4GatewayResult>,
  }), [base, gateway]);
  const writing = useMemo<ReviewR2DurableWritingGateway>(() => ({
    async selectPrompt(input) {
      const row = await gateway({
        ...base, action: "select_prompt", ...input,
        idempotencyKey: `review-r6:select:${base.snapshotFingerprint}:${input.challengeType}:${input.expectedStateVersion}`,
      }) as ReviewR6WritingSessionView;
      return { session: writingSession(props.snapshot, row), stateVersion: row.stateVersion };
    },
    async startWriting(input) {
      const row = await gateway({
        ...base, action: "start_writing", ...input,
        idempotencyKey: `review-r6:start:${base.snapshotFingerprint}`,
      }) as ReviewR6WritingSessionView;
      return { session: writingSession(props.snapshot, row), stateVersion: row.stateVersion };
    },
    async saveDraft(input) {
      const row = await gateway({
        ...base, action: "save_draft", ...input,
        idempotencyKey: `review-r6:draft:${base.snapshotFingerprint}:${input.expectedStateVersion}`,
      }) as ReviewR6WritingSessionView;
      return { stateVersion: row.stateVersion };
    },
    async extendWriting(input) {
      const password = parentPassword.current;
      parentPassword.current = null;
      if (!password) throw new Error("parent_reauthentication_required");
      const row = await gateway({
        ...base, action: "extend_writing", ...input, password,
        idempotencyKey: `review-r6:extension:${base.snapshotFingerprint}`,
      }) as ReviewR6WritingSessionView;
      return { session: writingSession(props.snapshot, row), stateVersion: row.stateVersion };
    },
  }), [base, props.snapshot, gateway]);

  async function finishReview() {
    if (finishing) return;
    setFinishing(true);
    setMessage(null);
    try {
      const result = await gateway({
        ...base,
        action: "finalize",
        idempotencyKey: `review-r6:finalize:${base.snapshotFingerprint}`,
      }) as { specialistOutcome?: string };
      setMessage(result.specialistOutcome === "ready"
        ? "Review complete ✓ Now for today’s lesson…"
        : result.specialistOutcome === "not_due"
          ? "Review complete ✓ Today’s session is finished."
          : "Review complete ✓ Your work is safe while the next stage is checked.");
      window.setTimeout(() => {
        if (props.onStageRefresh) props.onStageRefresh();
        else router.refresh();
      }, 650);
    } catch {
      setMessage("Your Review is safe, but the next stage could not open. Please try again.");
      setFinishing(false);
    }
  }

  const beat = {
    id: "review-r6-guide",
    activityId: "review-writing-challenge",
    state: "focus" as const,
    say: "Listen, remember, and use your Target Words in your own writing.",
    goal: "Complete today’s Review",
    waitFor: "learner progress",
    onComplete: "Continue to today’s lesson",
  };
  return (
    <WordLabScene
      beat={beat}
      phase={0}
      muted={muted}
      onMutedChange={setMuted}
      guideName="Review Guide"
      phases={["Review", "Write", "Check", "Repair", "Lesson"]}
      phaseCues={["Choose your challenge", "Use your Target Words", "Check each word", "Repair tricky parts", "Today’s lesson"]}
      toolbar={<span className="rounded-full bg-cyan-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-950">Today’s Lesson · Review first</span>}
    >
      <div className="adle-presentation min-w-0">
        {initial ? (
          <ReviewFreeWritingActivity
            snapshot={props.snapshot}
            initialSession={initial.session}
            initialServerStateVersion={initial.stateVersion}
            durableWritingGateway={writing}
            reviewR3Gateway={r3}
            reviewR4Gateway={r4}
            requestParentReauthenticatedExtension={async () => {
              const password = window.prompt("Grown-up: enter your password to add extra writing time.");
              parentPassword.current = password;
              return Boolean(password);
            }}
            onReadyToComplete={finishReview}
          />
        ) : (
          <div className="grid min-h-80 place-items-center" aria-busy="true" role="status">
            <p className="font-semibold text-cyan-100">Preparing your Review…</p>
          </div>
        )}
        {finishing || message ? (
          <p className="review-callout mx-4 mb-4 text-center font-semibold" aria-live="polite">
            {message ?? "Finishing Review…"}
          </p>
        ) : null}
      </div>
    </WordLabScene>
  );
}
