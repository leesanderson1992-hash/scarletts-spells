import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompiledReviewSnapshotV3,
  ReviewRuntimeEncounterStateV1,
} from "./contracts";
import type {
  ReviewR3AudioSubmission,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
  ReviewR31DecisionSubmission,
  ReviewR31SpanSubmission,
} from "./r3-contracts";
import { evaluateSubmittedReviewWritingServer } from "./server-evaluation";
import {
  reviewR3SessionView,
  type ReviewR3StoredAudioAttempt,
  type ReviewR3StoredState,
} from "./r3-state";
import {
  isExactReviewAudioResponse,
  validateReviewWritingSelection,
} from "./target-word-matcher";

type SessionRow = {
  id: string;
  snapshot_fingerprint: string;
  submitted_writing_text: string | null;
};

type EncounterRow = {
  id: string;
  writing_disposition: ReviewRuntimeEncounterStateV1["writingDisposition"];
  original_outcome: ReviewRuntimeEncounterStateV1["originalOutcome"];
  original_outcome_source: ReviewRuntimeEncounterStateV1["originalOutcomeSource"];
  attribution_algorithm_version: string | null;
  attribution_provenance: ReviewRuntimeEncounterStateV1["attributionProvenance"];
  original_attempt_event_id: string | null;
  repair_state: ReviewRuntimeEncounterStateV1["repairState"];
};

type AttemptRow = {
  id: string;
  attempt_text: string | null;
  is_correct: boolean | null;
  source_ref: string;
};

function persistenceFailure(error: { message?: string } | null): never {
  throw new Error(`Review R3 persistence failed: ${error?.message ?? "unknown error"}`);
}

export async function hydrateReviewR3Session(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
}): Promise<ReviewR3SessionView> {
  const sessionResult = await input.client
    .from("adle_review_sessions")
    .select("id,snapshot_fingerprint,submitted_writing_text")
    .eq("id", input.reviewSessionId)
    .maybeSingle();
  if (sessionResult.error || !sessionResult.data) persistenceFailure(sessionResult.error);
  const session = sessionResult.data as SessionRow;
  if (session.snapshot_fingerprint !== input.snapshot.provenance.sourceFingerprint) {
    throw new Error("Review R3 persistence failed: snapshot fingerprint mismatch");
  }

  const encounterResult = await input.client
    .from("adle_review_word_encounters")
    .select("id,writing_disposition,original_outcome,original_outcome_source,attribution_algorithm_version,attribution_provenance,original_attempt_event_id,repair_state")
    .eq("review_session_id", input.reviewSessionId);
  if (encounterResult.error) persistenceFailure(encounterResult.error);
  const rows = (encounterResult.data ?? []) as EncounterRow[];
  const frozenEncounterIds = new Set(input.snapshot.targets.map((target) => target.encounterId));
  if (rows.length !== input.snapshot.targets.length || rows.some((row) => !frozenEncounterIds.has(row.id))) {
    throw new Error("Review R3 persistence failed: encounter set does not match frozen snapshot");
  }
  const attemptIds = rows.flatMap((row) => row.original_attempt_event_id ? [row.original_attempt_event_id] : []);
  let attempts: AttemptRow[] = [];
  if (attemptIds.length > 0) {
    const attemptResult = await input.client
      .from("adle_assignment_attempt_events")
      .select("id,attempt_text,is_correct,source_ref")
      .in("id", attemptIds);
    if (attemptResult.error) persistenceFailure(attemptResult.error);
    attempts = (attemptResult.data ?? []) as AttemptRow[];
  }
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const audioAttempts: ReviewR3StoredAudioAttempt[] = rows.flatMap((row) => {
    if (row.original_outcome_source !== "audio_retrieval_check" || !row.original_attempt_event_id) return [];
    const attempt = attemptById.get(row.original_attempt_event_id);
    if (!attempt || attempt.attempt_text === null || attempt.is_correct === null) {
      throw new Error("Review R3 persistence failed: linked audio attempt is missing");
    }
    return [{
      encounterId: row.id,
      response: attempt.attempt_text,
      correct: attempt.is_correct,
      idempotencyKey: attempt.source_ref,
    }];
  });
  const state: ReviewR3StoredState = {
    assignmentId: input.snapshot.assignment.assignmentId,
    snapshotFingerprint: session.snapshot_fingerprint,
    submittedWritingText: session.submitted_writing_text,
    writingIdempotencyKey: null,
    encounters: rows.map((row) => ({
      encounterId: row.id,
      writingDisposition: row.writing_disposition,
      originalOutcome: row.original_outcome,
      originalOutcomeSource: row.original_outcome_source,
      attributionAlgorithmVersion: row.attribution_algorithm_version,
      attributionProvenance: row.attribution_provenance,
      repairState: row.repair_state,
    })),
    audioAttempts,
  };
  return reviewR3SessionView(input.snapshot, state);
}

export async function submitReviewR3WritingDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR3WritingSubmission;
}): Promise<ReviewR3GatewayResult> {
  const evaluations = await evaluateSubmittedReviewWritingServer({
    writing: input.submission.finalWriting,
    targets: input.snapshot.targets,
    client: input.client,
    reviewSessionId: input.reviewSessionId,
  });
  const { data, error } = await input.client.rpc("submit_adle_review_writing_r3", {
    p_review_session_id: input.reviewSessionId,
    p_snapshot_fingerprint: input.snapshot.provenance.sourceFingerprint,
    p_submitted_writing_text: input.submission.finalWriting,
    p_dispositions: evaluations.map((evaluation) => ({
      encounterId: evaluation.encounterId,
      disposition: evaluation.disposition,
      attributionAlgorithmVersion: evaluation.attributionAlgorithmVersion,
      attributionProvenance: {
        ...evaluation.attributionProvenance,
        ...(evaluation.observedText === null ? {} : { observedText: evaluation.observedText }),
      },
    })),
    p_idempotency_key: input.submission.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("writing_submission_conflict")) {
      return { ok: false, code: "writing_submission_conflict" };
    }
    persistenceFailure(error);
  }
  const session = await hydrateReviewR3Session(input);
  return { ok: true, session, replayed: Boolean((data as { replayed?: boolean } | null)?.replayed) };
}

export async function submitReviewR3AudioCheckDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR3AudioSubmission;
}): Promise<ReviewR3GatewayResult> {
  const target = input.snapshot.targets.find((candidate) =>
    candidate.encounterId === input.submission.encounterId,
  );
  if (!target) return { ok: false, code: "encounter_not_found" };
  const normalizedResponse = input.submission.response.normalize("NFC").trim();
  if (normalizedResponse.length === 0) return { ok: false, code: "invalid_response" };
  const { data, error } = await input.client.rpc("submit_adle_review_audio_check_r3", {
    p_review_session_id: input.reviewSessionId,
    p_encounter_id: input.submission.encounterId,
    p_snapshot_fingerprint: input.snapshot.provenance.sourceFingerprint,
    p_response: normalizedResponse,
    p_is_correct: isExactReviewAudioResponse(normalizedResponse, target),
    p_idempotency_key: input.submission.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("audio_response_conflict") || error.message.includes("review_idempotency_conflict")) {
      return { ok: false, code: "audio_response_conflict" };
    }
    if (error.message.includes("audio_check_not_eligible")) {
      return { ok: false, code: "audio_check_not_eligible" };
    }
    persistenceFailure(error);
  }
  const session = await hydrateReviewR3Session(input);
  return { ok: true, session, replayed: Boolean((data as { replayed?: boolean } | null)?.replayed) };
}

async function transitionReviewR31AttributionDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  encounterId: string;
  transitionKind:
    | "confirm_writing_suggestion"
    | "answer_writing_attempt_question"
    | "confirm_writing_span";
  decision?: "yes" | "no";
  startOffset?: number;
  endOffset?: number;
  selectedText?: string;
  idempotencyKey: string;
}): Promise<ReviewR3GatewayResult> {
  const { data, error } = await input.client.rpc("transition_adle_review_writing_attribution_r31", {
    p_review_session_id: input.reviewSessionId,
    p_encounter_id: input.encounterId,
    p_snapshot_fingerprint: input.snapshot.provenance.sourceFingerprint,
    p_transition_kind: input.transitionKind,
    p_decision: input.decision ?? null,
    p_start_offset: input.startOffset ?? null,
    p_end_offset: input.endOffset ?? null,
    p_selected_text: input.selectedText ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const codes = [
      "attribution_confirmation_not_eligible",
      "attribution_confirmation_conflict",
      "invalid_writing_span",
      "writing_span_already_consumed",
    ] as const;
    const code = codes.find((candidate) => error.message.includes(candidate));
    if (code) return { ok: false, code };
    if (error.message.includes("review_encounter_not_found")) {
      return { ok: false, code: "encounter_not_found" };
    }
    persistenceFailure(error);
  }
  const session = await hydrateReviewR3Session(input);
  return { ok: true, session, replayed: Boolean((data as { replayed?: boolean } | null)?.replayed) };
}

export function confirmReviewR31SuggestionDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR31DecisionSubmission;
}) {
  return transitionReviewR31AttributionDurably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "confirm_writing_suggestion",
    decision: input.submission.decision,
    idempotencyKey: input.submission.idempotencyKey,
  });
}

export function answerReviewR31AttemptQuestionDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR31DecisionSubmission;
}) {
  return transitionReviewR31AttributionDurably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "answer_writing_attempt_question",
    decision: input.submission.decision,
    idempotencyKey: input.submission.idempotencyKey,
  });
}

export async function confirmReviewR31WritingSpanDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR31SpanSubmission;
}): Promise<ReviewR3GatewayResult> {
  const session = await hydrateReviewR3Session(input);
  if (session.submittedWritingText === null) return { ok: false, code: "writing_not_submitted" };
  const selection = validateReviewWritingSelection(
    session.submittedWritingText,
    input.submission.startOffset,
    input.submission.endOffset,
  );
  if (!selection) return { ok: false, code: "invalid_writing_span" };
  return transitionReviewR31AttributionDurably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "confirm_writing_span",
    startOffset: selection.startOffset,
    endOffset: selection.endOffset,
    selectedText: selection.text,
    idempotencyKey: input.submission.idempotencyKey,
  });
}
