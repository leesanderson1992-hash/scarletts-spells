import type {
  ReviewOriginalOutcome,
  ReviewRepairState,
  ReviewRuntimeEncounterStateV1,
  ReviewSnapshotJsonValue,
  ReviewWritingDisposition,
} from "./contracts";

export const REVIEW_TRANSITION_REJECTION_CODES = [
  "writing_already_classified",
  "audio_check_not_eligible",
  "original_outcome_immutable",
  "repair_not_required",
  "repair_already_terminal",
] as const;

export type ReviewTransitionRejectionCode =
  (typeof REVIEW_TRANSITION_REJECTION_CODES)[number];

export type ReviewEncounterTransitionResult =
  | { ok: true; state: ReviewRuntimeEncounterStateV1; replayed: boolean }
  | { ok: false; code: ReviewTransitionRejectionCode };

export function createPendingReviewEncounterState(
  encounterId: string,
): ReviewRuntimeEncounterStateV1 {
  return {
    encounterId,
    writingDisposition: null,
    originalOutcome: "pending",
    originalOutcomeSource: null,
    attributionAlgorithmVersion: null,
    attributionProvenance: null,
    repairState: "not_required",
  };
}

function outcomeForWritingDisposition(
  disposition: ReviewWritingDisposition,
): ReviewOriginalOutcome {
  if (disposition === "correct_in_writing") return "success";
  if (disposition === "attributable_misspelling") return "failure";
  return "pending";
}

export function submitWritingDisposition(
  state: ReviewRuntimeEncounterStateV1,
  input: {
    disposition: ReviewWritingDisposition;
    attributionAlgorithmVersion?: string | null;
    attributionProvenance?: Readonly<Record<string, ReviewSnapshotJsonValue>> | null;
  },
): ReviewEncounterTransitionResult {
  if (state.writingDisposition !== null) {
    return state.writingDisposition === input.disposition
      ? { ok: true, state, replayed: true }
      : { ok: false, code: "writing_already_classified" };
  }
  if (state.originalOutcome !== "pending") {
    return { ok: false, code: "original_outcome_immutable" };
  }
  const originalOutcome = outcomeForWritingDisposition(input.disposition);
  return {
    ok: true,
    replayed: false,
    state: {
      ...state,
      writingDisposition: input.disposition,
      originalOutcome,
      originalOutcomeSource:
        originalOutcome === "pending" ? null : "writing",
      attributionAlgorithmVersion: input.attributionAlgorithmVersion ?? null,
      attributionProvenance: input.attributionProvenance ?? null,
      repairState: originalOutcome === "failure" ? "required" : "not_required",
    },
  };
}

export function submitAudioRetrievalCheck(
  state: ReviewRuntimeEncounterStateV1,
  correct: boolean,
): ReviewEncounterTransitionResult {
  if (state.originalOutcome !== "pending") {
    return { ok: false, code: "original_outcome_immutable" };
  }
  if (state.writingDisposition !== "unaccounted_for") {
    return { ok: false, code: "audio_check_not_eligible" };
  }
  const originalOutcome = correct ? "success" : "failure";
  return {
    ok: true,
    replayed: false,
    state: {
      ...state,
      originalOutcome,
      originalOutcomeSource: "audio_retrieval_check",
      repairState: correct ? "not_required" : "required",
    },
  };
}

const TERMINAL_REPAIR_STATES = new Set<ReviewRepairState>([
  "completed_correct",
  "attempted_not_secured",
]);

export function setRepairState(
  state: ReviewRuntimeEncounterStateV1,
  repairState: Extract<
    ReviewRepairState,
    "in_progress" | "completed_correct" | "attempted_not_secured"
  >,
): ReviewEncounterTransitionResult {
  if (state.originalOutcome !== "failure") {
    return { ok: false, code: "repair_not_required" };
  }
  if (TERMINAL_REPAIR_STATES.has(state.repairState)) {
    return state.repairState === repairState
      ? { ok: true, state, replayed: true }
      : { ok: false, code: "repair_already_terminal" };
  }
  return {
    ok: true,
    replayed: state.repairState === repairState,
    state: { ...state, repairState },
  };
}

export function isTerminalRepairState(state: ReviewRepairState): boolean {
  return state === "not_required" || TERMINAL_REPAIR_STATES.has(state);
}

export function isReviewCompletionReady(
  encounters: readonly ReviewRuntimeEncounterStateV1[],
): boolean {
  return encounters.length > 0 && encounters.every((encounter) =>
    encounter.originalOutcome !== "pending" &&
    (encounter.originalOutcome === "success" ||
      TERMINAL_REPAIR_STATES.has(encounter.repairState)),
  );
}

export function targetWordChallengeProgress(input: {
  totalTargets: number;
  correctlyPresentTargetIds: ReadonlySet<string>;
}): { count: number; total: number; role: "challenge_progress_only" } {
  return {
    count: Math.min(input.totalTargets, input.correctlyPresentTargetIds.size),
    total: input.totalTargets,
    role: "challenge_progress_only",
  };
}
