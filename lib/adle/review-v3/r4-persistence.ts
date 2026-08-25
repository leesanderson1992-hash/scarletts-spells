import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CompiledReviewSnapshotV3 } from "./contracts";
import { validateReviewGraphemeSpan } from "./graphemes";
import { hydrateReviewR3Session } from "./r3-persistence";
import type {
  ReviewR4EncounterSubmission,
  ReviewR4GatewayResult,
  ReviewR4MemoryCueSubmission,
  ReviewR4RetrySubmission,
  ReviewR4SessionView,
  ReviewR4TrickySpanSubmission,
  ReviewRepairStage,
} from "./r4-contracts";
import {
  reviewR4SessionView,
  type ReviewMemoryCueVersionState,
  type ReviewR4StoredState,
  type ReviewRepairAttemptState,
  type ReviewRepairEncounterState,
} from "./r4-state";
import { isExactReviewAudioResponse } from "./target-word-matcher";

type SessionRow = { child_id: string };
export type ReviewR4PersistenceEncounterRow = {
  id: string;
  repair_stage: ReviewRepairStage | null;
  revealed_at: string | null;
  repair_tricky_grapheme_start: number | null;
  repair_tricky_grapheme_end: number | null;
  repair_tricky_text: string | null;
  repair_memory_cue_version_id: string | null;
  repair_state: "not_required" | "required" | "in_progress" | "completed_correct" | "attempted_not_secured";
  repair_terminal_at: string | null;
};
export type ReviewR4PersistenceCueRow = {
  id: string;
  child_id: string;
  canonical_word_id: string;
  spelling_authority_reference_id: string;
  spelling_authority_version: string;
  tricky_grapheme_start: number;
  tricky_grapheme_end: number;
  selected_tricky_text: string;
  cue_text: string;
  source_review_encounter_id: string;
  version_number: number;
  supersedes_cue_version_id: string | null;
  version_status: "active" | "superseded";
  created_at: string;
};
export type ReviewR4PersistenceAttemptRow = {
  review_encounter_id: string;
  attempt_number: 1 | 2;
  attempt_text: string;
  is_correct: boolean;
  created_at: string;
};

function persistenceFailure(error: { message?: string } | null): never {
  throw new Error(`Review R4 persistence failed: ${error?.message ?? "unknown error"}`);
}

export function reviewR4StoredStateFromPersistenceRows(input: {
  childId: string;
  encounterRows: readonly ReviewR4PersistenceEncounterRow[];
  cueRows: readonly ReviewR4PersistenceCueRow[];
  attemptRows: readonly ReviewR4PersistenceAttemptRow[];
}): ReviewR4StoredState {
  const attemptsByEncounter = new Map<string, ReviewRepairAttemptState[]>();
  for (const row of input.attemptRows) {
    const attempts = attemptsByEncounter.get(row.review_encounter_id) ?? [];
    attempts.push({
      attemptNumber: row.attempt_number,
      response: row.attempt_text,
      correct: row.is_correct,
      idempotencyKey: `hydrated:${row.review_encounter_id}:${row.attempt_number}`,
      createdAt: row.created_at,
    });
    attemptsByEncounter.set(row.review_encounter_id, attempts);
  }
  const repairs: ReviewRepairEncounterState[] = input.encounterRows.flatMap((row) => {
    if (row.repair_stage === null) return [];
    const terminalOutcome = row.repair_state === "completed_correct"
      ? "repair_completed" as const
      : row.repair_state === "attempted_not_secured"
        ? "repair_attempted_not_secured" as const
        : null;
    return [{
      encounterId: row.id,
      stage: row.repair_stage,
      revealedAt: row.revealed_at ?? "",
      trickyGraphemeStart: row.repair_tricky_grapheme_start,
      trickyGraphemeEnd: row.repair_tricky_grapheme_end,
      trickyText: row.repair_tricky_text,
      cueVersionId: row.repair_memory_cue_version_id,
      attempts: (attemptsByEncounter.get(row.id) ?? []).sort((left, right) =>
        left.attemptNumber - right.attemptNumber),
      terminalOutcome,
      terminalAt: row.repair_terminal_at,
    }];
  });
  const cueVersions: ReviewMemoryCueVersionState[] = input.cueRows.map((row) => ({
    cueVersionId: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    spellingAuthorityReferenceId: row.spelling_authority_reference_id,
    spellingAuthorityVersion: row.spelling_authority_version,
    graphemeStart: row.tricky_grapheme_start,
    graphemeEnd: row.tricky_grapheme_end,
    selectedText: row.selected_tricky_text,
    cueText: row.cue_text,
    versionNumber: row.version_number,
    sourceReviewEncounterId: row.source_review_encounter_id,
    supersedesCueVersionId: row.supersedes_cue_version_id,
    status: row.version_status,
    createdAt: row.created_at,
  }));
  return { childId: input.childId, repairs, cueVersions, receipts: [] };
}

export async function hydrateReviewR4Session(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
}): Promise<ReviewR4SessionView> {
  const reviewSession = await hydrateReviewR3Session(input);
  const sessionResult = await input.client.from("adle_review_sessions")
    .select("child_id").eq("id", input.reviewSessionId).maybeSingle();
  if (sessionResult.error || !sessionResult.data) persistenceFailure(sessionResult.error);
  const session = sessionResult.data as SessionRow;
  const encounterResult = await input.client.from("adle_review_word_encounters")
    .select("id,repair_stage,revealed_at,repair_tricky_grapheme_start,repair_tricky_grapheme_end,repair_tricky_text,repair_memory_cue_version_id,repair_state,repair_terminal_at")
    .eq("review_session_id", input.reviewSessionId);
  if (encounterResult.error) persistenceFailure(encounterResult.error);
  const encounterRows = (encounterResult.data ?? []) as ReviewR4PersistenceEncounterRow[];
  const canonicalWordIds = input.snapshot.targets.map((target) => target.canonicalWordId);
  const cueResult = await input.client.from("adle_review_memory_cue_versions")
    .select("id,child_id,canonical_word_id,spelling_authority_reference_id,spelling_authority_version,tricky_grapheme_start,tricky_grapheme_end,selected_tricky_text,cue_text,source_review_encounter_id,version_number,supersedes_cue_version_id,version_status,created_at")
    .eq("child_id", session.child_id).in("canonical_word_id", canonicalWordIds);
  if (cueResult.error) persistenceFailure(cueResult.error);
  const attemptResult = await input.client.from("adle_review_repair_attempts")
    .select("review_encounter_id,attempt_number,attempt_text,is_correct,created_at")
    .in("review_encounter_id", encounterRows.map((row) => row.id));
  if (attemptResult.error) persistenceFailure(attemptResult.error);
  const state = reviewR4StoredStateFromPersistenceRows({
    childId: session.child_id,
    encounterRows,
    cueRows: (cueResult.data ?? []) as ReviewR4PersistenceCueRow[],
    attemptRows: (attemptResult.data ?? []) as ReviewR4PersistenceAttemptRow[],
  });
  return reviewR4SessionView({ snapshot: input.snapshot, reviewSession, state });
}

async function transitionReviewR4Durably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  encounterId: string;
  transitionKind: string;
  idempotencyKey: string;
  graphemeStart?: number;
  graphemeEnd?: number;
  selectedText?: string;
  cueText?: string;
  retainCueVersionId?: string;
  response?: string;
  correct?: boolean;
}): Promise<ReviewR4GatewayResult> {
  const { data, error } = await input.client.rpc("transition_adle_review_repair_r4", {
    p_review_session_id: input.reviewSessionId,
    p_encounter_id: input.encounterId,
    p_snapshot_fingerprint: input.snapshot.provenance.sourceFingerprint,
    p_transition_kind: input.transitionKind,
    p_grapheme_start: input.graphemeStart ?? null,
    p_grapheme_end: input.graphemeEnd ?? null,
    p_selected_text: input.selectedText ?? null,
    p_cue_text: input.cueText ?? null,
    p_retain_cue_version_id: input.retainCueVersionId ?? null,
    p_response: input.response ?? null,
    p_is_correct: input.correct ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const codes = [
      "repair_not_eligible", "repair_transition_conflict", "invalid_grapheme_span",
      "invalid_memory_cue", "memory_cue_not_eligible", "repair_retry_not_eligible",
    ] as const;
    const code = codes.find((candidate) => error.message.includes(candidate));
    if (code) return { ok: false, code };
    if (error.message.includes("review_idempotency_conflict")) {
      return { ok: false, code: input.transitionKind === "submit_repair_retry"
        ? "repair_retry_conflict" : "repair_transition_conflict" };
    }
    if (error.message.includes("review_encounter_not_found")) {
      return { ok: false, code: "encounter_not_found" };
    }
    persistenceFailure(error);
  }
  const session = await hydrateReviewR4Session(input);
  return { ok: true, session, replayed: Boolean((data as { replayed?: boolean } | null)?.replayed) };
}

function simpleTransition(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR4EncounterSubmission;
  transitionKind: string;
}) {
  return transitionReviewR4Durably({
    ...input,
    encounterId: input.submission.encounterId,
    idempotencyKey: input.submission.idempotencyKey,
  });
}

export function beginReviewRepairDurably(input: Omit<Parameters<typeof simpleTransition>[0], "transitionKind">) {
  return simpleTransition({ ...input, transitionKind: "begin_repair" });
}
export function moveReviewRepairToTrickyPartDurably(input: Omit<Parameters<typeof simpleTransition>[0], "transitionKind">) {
  return simpleTransition({ ...input, transitionKind: "move_to_tricky_part" });
}
export function moveReviewRepairToCoverDurably(input: Omit<Parameters<typeof simpleTransition>[0], "transitionKind">) {
  return simpleTransition({ ...input, transitionKind: "move_to_cover" });
}
export function moveReviewRepairToTryAgainDurably(input: Omit<Parameters<typeof simpleTransition>[0], "transitionKind">) {
  return simpleTransition({ ...input, transitionKind: "move_to_try_again" });
}

export function saveReviewRepairTrickySpanDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR4TrickySpanSubmission;
}) {
  const target = input.snapshot.targets.find((candidate) =>
    candidate.encounterId === input.submission.encounterId);
  if (!target) return Promise.resolve<ReviewR4GatewayResult>({ ok: false, code: "encounter_not_found" });
  const span = validateReviewGraphemeSpan(
    target.canonicalSpelling,
    input.submission.graphemeStart,
    input.submission.graphemeEnd,
    input.submission.selectedText,
  );
  if (!span) return Promise.resolve<ReviewR4GatewayResult>({ ok: false, code: "invalid_grapheme_span" });
  return transitionReviewR4Durably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "save_tricky_part",
    idempotencyKey: input.submission.idempotencyKey,
    graphemeStart: span.graphemeStart,
    graphemeEnd: span.graphemeEnd,
    selectedText: span.selectedText,
  });
}

export function saveReviewRepairMemoryCueDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR4MemoryCueSubmission;
}) {
  return transitionReviewR4Durably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "save_memory_cue",
    idempotencyKey: input.submission.idempotencyKey,
    cueText: input.submission.cueText.normalize("NFC").trim(),
    retainCueVersionId: input.submission.retainCueVersionId,
  });
}

export function submitReviewRepairRetryDurably(input: {
  client: SupabaseClient;
  snapshot: CompiledReviewSnapshotV3;
  reviewSessionId: string;
  submission: ReviewR4RetrySubmission;
}) {
  const target = input.snapshot.targets.find((candidate) =>
    candidate.encounterId === input.submission.encounterId);
  if (!target) return Promise.resolve<ReviewR4GatewayResult>({ ok: false, code: "encounter_not_found" });
  const response = input.submission.response.normalize("NFC").trim();
  return transitionReviewR4Durably({
    ...input,
    encounterId: input.submission.encounterId,
    transitionKind: "submit_repair_retry",
    idempotencyKey: input.submission.idempotencyKey,
    response,
    correct: isExactReviewAudioResponse(response, target),
  });
}
