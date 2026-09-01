import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { IsoDate } from "../review-scheduler";
import {
  transitionPerWordScheduleV1,
  type GovernedPerWordReviewPolicyV1,
  type PerWordReviewDueKindV1,
} from "../review-v3/per-word-scheduler";
import { deterministicReviewR6Uuid } from "../review-v3/r6-snapshot-compiler";
import { validateCompiledReviewSnapshotV3 } from "../review-v3/snapshot-validator";
import {
  CURRENT_REVIEW_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "./contracts";
import { loadReviewScheduleForExecution } from "./runtime-repository";
import {
  buildTargetReviewTransitionPlan,
  type TargetReviewOutcomeSourceFact,
} from "./target-transition-persistence";
import { canonicalUtcTimestampMilliseconds } from "./canonical-timestamp";

type Client = SupabaseClient;

type Preparation = { completedAt: string; reviewCompletedOn: IsoDate };

type CompletedReviewSessionFact = {
  id: string;
  stage: string;
  completed_at: string | null;
  state_version: number;
  snapshot_fingerprint: string;
};

type CompletionReceiptFact = {
  review_session_id: string;
  snapshot_fingerprint: string;
  completed_at: string;
  review_completed_on: string;
  result_payload: unknown;
};

export type CompletedMixedPolicyReplayResolution =
  | { disposition: "NOT_COMPLETED" }
  | { disposition: "REPLAY"; result: Record<string, unknown> }
  | {
    disposition: "REJECTED";
    reason:
      | "COMPLETION_STATE_INCONSISTENT"
      | "COMPLETION_RECEIPT_MISSING"
      | "COMPLETION_RECEIPT_SESSION_CONFLICT"
      | "COMPLETION_RECEIPT_SNAPSHOT_CONFLICT"
      | "COMPLETION_RECEIPT_TIME_CONFLICT"
      | "COMPLETION_RECEIPT_PAYLOAD_MALFORMED";
  };

function timestampsMatch(left: string, right: string): boolean {
  try {
    return canonicalUtcTimestampMilliseconds(left) === canonicalUtcTimestampMilliseconds(right);
  } catch {
    return false;
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Resolves only an already-completed mixed-policy session. The immutable
 * completion receipt is the replay authority; a new browser idempotency key
 * is deliberately irrelevant once that singular receipt exists. Any partial
 * or contradictory completion state fails closed instead of being prepared
 * or finalized again.
 */
export function resolveCompletedMixedPolicyReviewReplay(input: {
  session: CompletedReviewSessionFact;
  receipt: CompletionReceiptFact | null;
  requestedSnapshotFingerprint: string;
}): CompletedMixedPolicyReplayResolution {
  const stageCompleted = input.session.stage === "completed";
  const completedAt = input.session.completed_at;
  const hasCompletedAt = completedAt !== null;
  if (!stageCompleted && !hasCompletedAt) return { disposition: "NOT_COMPLETED" };
  if (!stageCompleted || !hasCompletedAt) {
    return { disposition: "REJECTED", reason: "COMPLETION_STATE_INCONSISTENT" };
  }
  if (!input.receipt) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_MISSING" };
  }
  if (input.receipt.review_session_id !== input.session.id) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_SESSION_CONFLICT" };
  }
  if (
    input.session.snapshot_fingerprint !== input.requestedSnapshotFingerprint
    || input.receipt.snapshot_fingerprint !== input.requestedSnapshotFingerprint
  ) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_SNAPSHOT_CONFLICT" };
  }
  if (!timestampsMatch(input.receipt.completed_at, completedAt)) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_TIME_CONFLICT" };
  }
  if (!input.receipt.result_payload || typeof input.receipt.result_payload !== "object"
    || Array.isArray(input.receipt.result_payload)) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_PAYLOAD_MALFORMED" };
  }
  const payload = input.receipt.result_payload as Record<string, unknown>;
  const successCount = payload.successCount;
  const failureCount = payload.failureCount;
  const transitionedWordCount = payload.transitionedWordCount;
  if (
    payload.ok !== true
    || payload.reviewSessionId !== input.session.id
    || typeof payload.completedAt !== "string"
    || !timestampsMatch(payload.completedAt, input.receipt.completed_at)
    || payload.reviewCompletedOn !== input.receipt.review_completed_on
    || payload.stateVersion !== input.session.state_version
    || !isNonNegativeInteger(successCount)
    || !isNonNegativeInteger(failureCount)
    || !isNonNegativeInteger(transitionedWordCount)
    || transitionedWordCount !== successCount + failureCount
  ) {
    return { disposition: "REJECTED", reason: "COMPLETION_RECEIPT_PAYLOAD_MALFORMED" };
  }
  return {
    disposition: "REPLAY",
    result: {
      ...payload,
      replayed: true,
      assignmentItemCompleted: true,
      nextMajorStage: "specialist_generation",
    },
  };
}

function databaseFailure(boundary: string, error: { message?: string } | null): never {
  throw new Error(`${boundary}:${error?.message ?? "unknown_database_error"}`);
}

export async function reviewSessionContainsTargetV2(input: {
  client: Client;
  reviewSessionId: string;
}): Promise<boolean> {
  const session = await input.client.from("adle_review_sessions")
    .select("daily_assignment_id").eq("id", input.reviewSessionId).maybeSingle();
  if (session.error || !session.data) databaseFailure("reviewSessionContainsTargetV2:session", session.error);
  const assignment = await input.client.from("daily_assignments")
    .select("compiled_review_snapshot").eq("id", session.data.daily_assignment_id).maybeSingle();
  if (assignment.error || !assignment.data) databaseFailure("reviewSessionContainsTargetV2:assignment", assignment.error);
  const validated = validateCompiledReviewSnapshotV3(assignment.data.compiled_review_snapshot);
  if (!validated.ok) throw new Error("reviewSessionContainsTargetV2:snapshot_invalid");
  return validated.snapshot.targets.some((target) =>
    target.schedule.schedulePolicyVersion === TARGET_REVIEW_POLICY_VERSION
    && target.schedule.wordScheduleVersion === TARGET_PER_WORD_STATE_SHAPE_VERSION);
}

function currentToState(word: ReturnType<typeof transitionPerWordScheduleV1>["word"], completedOn: IsoDate) {
  return {
    stateShapeVersion: word.scheduleVersion,
    schedulePolicyVersion: word.schedulePolicyVersion,
    membershipStatus: word.membershipStatus,
    wordIntervalIndex: word.intervalIndex,
    wordNextDueOn: word.nextDueOn,
    catchUpStage: word.catchUpStage,
    nextRetestDueOn: word.nextRetestDueOn,
    failedReviewOn: word.failedReviewOn,
    preRetirementCheckDueOn: word.preRetirementCheckDueOn,
    last28DayReviewOn: word.last28DayReviewOn,
    wordLastReviewCompletedOn: completedOn,
  };
}

export async function finalizeMixedPolicyReviewSessionC2B6(input: {
  client: Client;
  reviewSessionId: string;
  snapshotFingerprint: string;
  idempotencyKey: string;
}): Promise<Record<string, unknown>> {
  const sessionResult = await input.client.from("adle_review_sessions")
    .select("id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,snapshot_fingerprint,stage,completed_at,state_version")
    .eq("id", input.reviewSessionId).maybeSingle();
  if (sessionResult.error || !sessionResult.data) databaseFailure("finalizeMixedPolicyReviewSessionC2B6:session", sessionResult.error);
  const session = sessionResult.data as {
    id: string;
    daily_assignment_id: string;
    assignment_item_id: string;
    child_id: string;
    parent_user_id: string;
    snapshot_fingerprint: string;
    stage: string;
    completed_at: string | null;
    state_version: number;
  };
  const assignmentResult = await input.client.from("daily_assignments")
    .select("assignment_date,compiled_review_snapshot")
    .eq("id", session.daily_assignment_id).maybeSingle();
  if (assignmentResult.error || !assignmentResult.data) databaseFailure("finalizeMixedPolicyReviewSessionC2B6:assignment", assignmentResult.error);
  const validated = validateCompiledReviewSnapshotV3(assignmentResult.data.compiled_review_snapshot);
  if (!validated.ok || session.snapshot_fingerprint !== input.snapshotFingerprint) {
    throw new Error("finalizeMixedPolicyReviewSessionC2B6:snapshot_conflict");
  }
  const targetBySchedule = new Map(validated.snapshot.targets.map((target) => [target.schedule.scheduleWordId, target]));
  if (![...targetBySchedule.values()].some((target) =>
    target.schedule.schedulePolicyVersion === TARGET_REVIEW_POLICY_VERSION
    && target.schedule.wordScheduleVersion === TARGET_PER_WORD_STATE_SHAPE_VERSION)) {
    throw new Error("finalizeMixedPolicyReviewSessionC2B6:target_pin_required");
  }

  // Completed replays are resolved before preparation, reducer planning or
  // persistence. The receipt is singular and immutable for the session.
  if (session.stage === "completed" || session.completed_at !== null) {
    const receiptResult = await input.client.from("adle_review_completion_receipts")
      .select("review_session_id,snapshot_fingerprint,completed_at,review_completed_on,result_payload")
      .eq("review_session_id", input.reviewSessionId).maybeSingle();
    if (receiptResult.error) {
      databaseFailure("finalizeMixedPolicyReviewSessionC2B6:completion_receipt", receiptResult.error);
    }
    const replay = resolveCompletedMixedPolicyReviewReplay({
      session,
      receipt: receiptResult.data as CompletionReceiptFact | null,
      requestedSnapshotFingerprint: input.snapshotFingerprint,
    });
    if (replay.disposition === "REPLAY") return replay.result;
    if (replay.disposition === "NOT_COMPLETED") {
      throw new Error("finalizeMixedPolicyReviewSessionC2B6:completion_state_inconsistent");
    }
    throw new Error(`finalizeMixedPolicyReviewSessionC2B6:${replay.reason.toLowerCase()}`);
  }

  const [encounterResult, policyResult, authenticResult, preparationResult] = await Promise.all([
    input.client.from("adle_review_word_encounters")
      .select("id,schedule_word_id,canonical_word_id,original_outcome,original_outcome_source,original_attempt_event_id,writing_disposition,repair_state")
      .eq("review_session_id", input.reviewSessionId).order("target_order"),
    input.client.from("adle_review_policy_versions")
      .select("schedule_policy_version,interval_ladder_days,catch_up_offsets_days,session_cap,pre_retirement_check_gap_days,completion_grace_minutes")
      .eq("schedule_policy_version", CURRENT_REVIEW_POLICY_VERSION).maybeSingle(),
    input.client.from("adle_authentic_use_events")
      .select("canonical_word_id,occurred_on,parent_verified,provenance_kind,row_status")
      .eq("child_id", session.child_id).eq("row_status", "active").eq("parent_verified", true),
    input.client.rpc("prepare_adle_review_finalization_c2b6", {
      p_review_session_id: input.reviewSessionId,
      p_snapshot_fingerprint: input.snapshotFingerprint,
    }),
  ]);
  for (const [boundary, result] of [["encounters", encounterResult], ["policy", policyResult],
    ["authentic", authenticResult], ["preparation", preparationResult]] as const) {
    if (result.error) databaseFailure(`finalizeMixedPolicyReviewSessionC2B6:${boundary}`, result.error);
  }
  const rawPreparation = preparationResult.data as Preparation;
  const preparation: Preparation = {
    completedAt: canonicalUtcTimestampMilliseconds(rawPreparation.completedAt),
    reviewCompletedOn: rawPreparation.reviewCompletedOn,
  };
  const policyRow = policyResult.data as {
    schedule_policy_version: string; interval_ladder_days: number[];
    catch_up_offsets_days: [number, number]; session_cap: number;
    pre_retirement_check_gap_days: number; completion_grace_minutes: number;
  };
  const currentPolicy: GovernedPerWordReviewPolicyV1 = {
    schedulePolicyVersion: policyRow.schedule_policy_version,
    intervalLadderDays: policyRow.interval_ladder_days,
    catchUpOffsetsDays: policyRow.catch_up_offsets_days,
    sessionCap: policyRow.session_cap,
    preRetirementCheckGapDays: policyRow.pre_retirement_check_gap_days,
    completionGraceMinutes: policyRow.completion_grace_minutes,
  };
  const plans: Record<string, unknown>[] = [];
  for (const encounter of encounterResult.data ?? []) {
    const target = targetBySchedule.get(encounter.schedule_word_id as string);
    if (!target || !["success", "failure"].includes(encounter.original_outcome as string)) {
      throw new Error("finalizeMixedPolicyReviewSessionC2B6:encounter_unresolved");
    }
    const loaded = await loadReviewScheduleForExecution({
      client: input.client,
      scheduleWordId: encounter.schedule_word_id as string,
    });
    if (loaded.disposition !== "HYDRATED") {
      throw new Error(`finalizeMixedPolicyReviewSessionC2B6:${loaded.reason}`);
    }
    const outcomeEventId = deterministicReviewR6Uuid(
      "adle_review_c2b6_outcome_v1", input.reviewSessionId, encounter.id as string,
    );
    if (loaded.schedule.kind === "CURRENT_V1") {
      const currentSchedule = loaded.schedule;
      const hasAuthentic = (authenticResult.data ?? []).some((row) =>
        row.canonical_word_id === currentSchedule.canonicalWordId
        && row.provenance_kind !== "prompted_review_writing_application"
        && currentSchedule.state.last28DayReviewOn !== null
        && row.occurred_on >= currentSchedule.state.last28DayReviewOn);
      const transition = transitionPerWordScheduleV1({
        policy: currentPolicy,
        word: currentSchedule.state,
        dueKind: target.schedule.dueKind as PerWordReviewDueKindV1,
        frozenDueOn: target.schedule.dueOn as IsoDate,
        completedOn: preparation.reviewCompletedOn,
        originalOutcome: encounter.original_outcome as "success" | "failure",
        hasQualifyingIndependentAuthenticUse: hasAuthentic,
      });
      plans.push({
        authority: "CURRENT_V1", encounterId: encounter.id,
        scheduleWordId: currentSchedule.scheduleWordId, outcomeEventId,
        expectedStateRevision: currentSchedule.stateRevision,
        eventType: transition.eventType, fromState: currentSchedule.state,
        toState: currentToState(transition.word, preparation.reviewCompletedOn),
      });
      continue;
    }
    if (!loaded.targetPolicyConfig) throw new Error("finalizeMixedPolicyReviewSessionC2B6:target_policy_malformed");
    const source: TargetReviewOutcomeSourceFact = {
      id: outcomeEventId,
      schedule_word_id: loaded.schedule.scheduleWordId,
      child_id: loaded.schedule.childId,
      canonical_word_id: loaded.schedule.canonicalWordId,
      schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
      word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
      due_kind: target.schedule.dueKind as "scheduled_review" | "next_day_recovery",
      frozen_interval_index: target.schedule.intervalIndex,
      original_result: encounter.original_outcome as "success" | "failure",
      review_completed_on: preparation.reviewCompletedOn,
      completed_at: preparation.completedAt,
    };
    const plan = buildTargetReviewTransitionPlan({
      schedule: loaded.schedule,
      source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: source },
      policyConfig: loaded.targetPolicyConfig,
    });
    if (plan.disposition === "REJECTED") throw new Error(`finalizeMixedPolicyReviewSessionC2B6:${plan.result.reason}`);
    plans.push({
      authority: "TARGET_REGRESSION_V1", encounterId: encounter.id,
      scheduleWordId: loaded.schedule.scheduleWordId, outcomeEventId,
      expectedStateRevision: loaded.schedule.stateRevision,
      eventType: encounter.original_outcome === "success" ? "review_pass" : "review_fail",
      fromState: loaded.schedule.persistedState, toState: plan.value.toState,
      transitionReason: plan.value.decisionReason,
      reducerVersion: plan.value.reducerVersion,
      idempotencyKey: plan.value.idempotencyKey,
      sourceFingerprint: plan.value.sourceFingerprint,
    });
  }
  const request = {
    reviewSessionId: input.reviewSessionId, snapshotFingerprint: input.snapshotFingerprint,
    completedAt: preparation.completedAt, reviewCompletedOn: preparation.reviewCompletedOn,
    plans,
  };
  const result = await input.client.rpc("finalize_adle_review_c2b6", {
    p_review_session_id: input.reviewSessionId,
    p_snapshot_fingerprint: input.snapshotFingerprint,
    p_idempotency_key: input.idempotencyKey,
    p_completed_at: preparation.completedAt,
    p_review_completed_on: preparation.reviewCompletedOn,
    p_transition_plans: plans,
    p_request_fingerprint: fingerprintSnapshotValue(request),
  });
  if (result.error) databaseFailure("finalizeMixedPolicyReviewSessionC2B6:persist", result.error);
  return (result.data ?? {}) as Record<string, unknown>;
}
