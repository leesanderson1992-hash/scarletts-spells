import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IsoDate } from "../review-scheduler";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import {
  REVIEW_RUNGS,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type ReviewRung,
  type TargetReviewEvent,
  type TargetReviewPolicyConfig,
  type TargetReviewState,
} from "./contracts";
import type {
  HydratedReviewSchedule,
  PersistedReviewScheduleStateC2B2,
} from "./runtime-coexistence";
import { TARGET_REVIEW_REDUCER_VERSION } from "./runtime-coexistence";
import { canonicalUtcTimestampMilliseconds } from "./canonical-timestamp";

export type TargetReviewOutcomeSourceFact = {
  id: string;
  schedule_word_id: string;
  child_id: string;
  canonical_word_id: string;
  schedule_policy_version: string;
  word_schedule_version: string;
  due_kind: "scheduled_review" | "next_day_recovery" | "pre_retirement_check";
  frozen_interval_index: number;
  original_result: "success" | "failure";
  review_completed_on: IsoDate;
  completed_at: string;
};

export type TargetControlledPassSourceFact = {
  id: string;
  child_id: string;
  canonical_word_id: string;
  controlled_policy_version: "ADLE_CONTROLLED_GRADUATION_V1_OR";
  decision: "PASS";
  completed_on: IsoDate;
  decided_at: string;
};

export type TargetTransitionSource =
  | { kind: "REVIEW_OUTCOME_APPLIED"; outcome: TargetReviewOutcomeSourceFact }
  | { kind: "CONTROLLED_PASS_APPLIED"; receipt: TargetControlledPassSourceFact };

export type TargetTransitionRpcResult = {
  status: "applied" | "already_applied";
  transitionEventId: string;
  appliedStateRevision: number;
};

export type TargetTransitionPersistenceResult =
  | {
      disposition: "PERSISTED" | "IDEMPOTENT_REPLAY";
      decisionReason: string;
      transitionEventId: string;
      appliedStateRevision: number;
    }
  | {
      disposition: "REJECTED";
      reason:
        | "TARGET_EXECUTOR_REQUIRED"
        | "TARGET_SOURCE_LINEAGE_CONFLICT"
        | "TARGET_SOURCE_KIND_UNSUPPORTED"
        | "TARGET_TRANSITION_REJECTED"
        | "TARGET_FINAL_RUNG_AUTHORITY_NOT_INTEGRATED"
        | "TARGET_PERSISTENCE_RESULT_MALFORMED";
      detail?: string;
    };

type RpcClient = Pick<SupabaseClient, "rpc">;

export type TargetReviewTransitionPlan = {
  decisionReason: string;
  sourceId: string;
  occurredAt: string;
  occurredOn: IsoDate;
  toState: PersistedReviewScheduleStateC2B2;
  idempotencyKey: string;
  sourceFingerprint: string;
  reducerVersion: string;
};

function validInstant(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function sourceEvent(input: {
  schedule: Extract<HydratedReviewSchedule, { kind: "TARGET_REGRESSION_V1" }>;
  source: TargetTransitionSource;
}): { event: TargetReviewEvent; sourceId: string; occurredAt: string; occurredOn: IsoDate } | null {
  if (input.source.kind === "CONTROLLED_PASS_APPLIED") {
    const { receipt } = input.source;
    if (
      receipt.child_id !== input.schedule.childId
      || receipt.canonical_word_id !== input.schedule.canonicalWordId
      || receipt.controlled_policy_version !== "ADLE_CONTROLLED_GRADUATION_V1_OR"
      || receipt.decision !== "PASS"
      || !validInstant(receipt.decided_at)
    ) return null;
    return {
      event: { eventId: receipt.id, kind: "CONTROLLED_PASS", occurredOn: receipt.completed_on },
      sourceId: receipt.id,
      occurredAt: receipt.decided_at,
      occurredOn: receipt.completed_on,
    };
  }
  const { outcome } = input.source;
  if (
    outcome.schedule_word_id !== input.schedule.scheduleWordId
    || outcome.child_id !== input.schedule.childId
    || outcome.canonical_word_id !== input.schedule.canonicalWordId
    || outcome.schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
    || outcome.word_schedule_version !== TARGET_PER_WORD_STATE_SHAPE_VERSION
    || outcome.frozen_interval_index < 0
    || outcome.frozen_interval_index >= REVIEW_RUNGS.length
    || !validInstant(outcome.completed_at)
  ) return null;
  const rung = REVIEW_RUNGS[outcome.frozen_interval_index] as ReviewRung;
  const outcomeValue = outcome.original_result === "success" ? "pass" : "fail";
  if (outcome.due_kind === "scheduled_review") {
    return {
      event: {
        eventId: outcome.id,
        kind: "SCHEDULED_CHECK",
        rung,
        outcome: outcomeValue,
        occurredOn: outcome.review_completed_on,
      },
      sourceId: outcome.id,
      occurredAt: outcome.completed_at,
      occurredOn: outcome.review_completed_on,
    };
  }
  if (outcome.due_kind === "next_day_recovery" && rung !== "DAY_1") {
    return {
      event: {
        eventId: outcome.id,
        kind: "RECOVERY_CHECK",
        failedRung: rung,
        outcome: outcomeValue,
        occurredOn: outcome.review_completed_on,
      },
      sourceId: outcome.id,
      occurredAt: outcome.completed_at,
      occurredOn: outcome.review_completed_on,
    };
  }
  // Final-rung/pre-retirement delegation remains a later gate.
  return null;
}

export function serializeTargetReducerState(input: {
  state: TargetReviewState;
  previous: PersistedReviewScheduleStateC2B2;
  source: TargetTransitionSource;
  occurredOn: IsoDate;
  occurredAt: string;
}): PersistedReviewScheduleStateC2B2 | null {
  const { state, previous } = input;
  let membershipStatus: PersistedReviewScheduleStateC2B2["membershipStatus"];
  let wordIntervalIndex: number;
  let wordNextDueOn: IsoDate | null;
  let preRetirementCheckDueOn: IsoDate | null = null;
  if (state.route.membership === "SCHEDULED") {
    membershipStatus = "scheduled";
    wordIntervalIndex = REVIEW_RUNGS.indexOf(state.route.rung);
    wordNextDueOn = state.route.dueOn;
  } else if (state.route.membership === "NEXT_DAY_RECOVERY") {
    membershipStatus = "next_day_recovery";
    wordIntervalIndex = REVIEW_RUNGS.indexOf(state.route.failedRung);
    wordNextDueOn = state.route.dueOn;
  } else if (state.route.membership === "CONTROLLED_REACQUISITION") {
    membershipStatus = "controlled_reacquisition";
    wordIntervalIndex = previous.wordIntervalIndex;
    wordNextDueOn = null;
  } else if (state.route.membership === "PRE_RETIREMENT_PRESERVED") {
    membershipStatus = "awaiting_pre_retirement_check";
    wordIntervalIndex = REVIEW_RUNGS.indexOf("DAY_56");
    wordNextDueOn = null;
    preRetirementCheckDueOn = state.route.dueOn;
  } else if (state.route.membership === "RETIRED_PRESERVED") {
    membershipStatus = "retired";
    wordIntervalIndex = REVIEW_RUNGS.indexOf("DAY_56");
    wordNextDueOn = null;
  } else {
    return null;
  }

  const reviewOutcome = input.source.kind === "REVIEW_OUTCOME_APPLIED"
    ? input.source.outcome
    : null;
  const completedRung = reviewOutcome
    ? REVIEW_RUNGS[reviewOutcome.frozen_interval_index]
    : null;
  const last28DayReviewOn = reviewOutcome?.original_result === "success" && completedRung === "DAY_28"
    ? input.occurredOn
    : previous.last28DayReviewOn;
  return {
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    membershipStatus,
    wordIntervalIndex,
    wordNextDueOn,
    consecutiveIndependentFailures: state.failureLineage.consecutiveIndependentFailures,
    failureEpisodeId: state.failureLineage.episodeId,
    preRetirementCheckDueOn,
    last28DayReviewOn,
    wordLastReviewCompletedOn: reviewOutcome
      ? input.occurredOn
      : previous.wordLastReviewCompletedOn,
    wordLastReviewCompletedAt: reviewOutcome
      ? canonicalUtcTimestampMilliseconds(input.occurredAt)
      : previous.wordLastReviewCompletedAt,
  };
}

export async function persistTargetReviewTransition(input: {
  client: RpcClient;
  schedule: HydratedReviewSchedule;
  source: TargetTransitionSource;
  policyConfig: TargetReviewPolicyConfig;
}): Promise<TargetTransitionPersistenceResult> {
  if (
    input.schedule.kind !== "TARGET_REGRESSION_V1"
    || input.schedule.executor.kind !== "TARGET_REVIEW_REGRESSION_V1"
  ) return { disposition: "REJECTED", reason: "TARGET_EXECUTOR_REQUIRED" };

  const plan = buildTargetReviewTransitionPlan(input);
  if (plan.disposition === "REJECTED") return plan.result;
  const { value } = plan;
  const response = await input.client.rpc("persist_adle_review_schedule_transition_c2b2", {
    p_schedule_word_id: input.schedule.scheduleWordId,
    p_transition_kind: input.source.kind,
    p_source_review_outcome_event_id: input.source.kind === "REVIEW_OUTCOME_APPLIED"
      ? value.sourceId
      : null,
    p_source_controlled_graduation_receipt_id: input.source.kind === "CONTROLLED_PASS_APPLIED"
      ? value.sourceId
      : null,
    p_idempotency_key: value.idempotencyKey,
    p_expected_state_revision: input.schedule.stateRevision,
    p_from_state: input.schedule.persistedState,
    p_to_state: value.toState,
    p_transition_reason: value.decisionReason,
    p_reducer_version: value.reducerVersion,
    p_occurred_at: value.occurredAt,
    p_source_fingerprint: value.sourceFingerprint,
  });
  if (response.error) throw new Error(`persistTargetReviewTransition:${response.error.message}`);
  const result = response.data as Partial<TargetTransitionRpcResult> | null;
  if (
    !result
    || (result.status !== "applied" && result.status !== "already_applied")
    || typeof result.transitionEventId !== "string"
    || !Number.isInteger(result.appliedStateRevision)
  ) return { disposition: "REJECTED", reason: "TARGET_PERSISTENCE_RESULT_MALFORMED" };
  return {
    disposition: result.status === "applied" ? "PERSISTED" : "IDEMPOTENT_REPLAY",
    decisionReason: value.decisionReason,
    transitionEventId: result.transitionEventId,
    appliedStateRevision: result.appliedStateRevision as number,
  };
}

/** Pure plan construction shared by the single-word CAS adapter and the
 * transactional mixed-session finalizer. It invokes the C2B.1 reducer once;
 * SQL receives the result and may only verify/persist it. */
export function buildTargetReviewTransitionPlan(input: {
  schedule: HydratedReviewSchedule;
  source: TargetTransitionSource;
  policyConfig: TargetReviewPolicyConfig;
}): { disposition: "PLANNED"; value: TargetReviewTransitionPlan } | {
  disposition: "REJECTED";
  result: Extract<TargetTransitionPersistenceResult, { disposition: "REJECTED" }>;
} {
  if (
    input.schedule.kind !== "TARGET_REGRESSION_V1"
    || input.schedule.executor.kind !== "TARGET_REVIEW_REGRESSION_V1"
  ) return { disposition: "REJECTED", result: { disposition: "REJECTED", reason: "TARGET_EXECUTOR_REQUIRED" } };
  const fact = sourceEvent({ schedule: input.schedule, source: input.source });
  if (!fact) {
    const unsupported = input.source.kind === "REVIEW_OUTCOME_APPLIED"
      && input.source.outcome.due_kind === "pre_retirement_check";
    return { disposition: "REJECTED", result: {
      disposition: "REJECTED", reason: unsupported ? "TARGET_SOURCE_KIND_UNSUPPORTED" : "TARGET_SOURCE_LINEAGE_CONFLICT",
    } };
  }
  const decision = input.schedule.executor.reduce(
    input.schedule.state,
    fact.event,
    input.policyConfig,
  );
  if (decision.disposition === "REJECTED") {
    return { disposition: "REJECTED", result: {
      disposition: "REJECTED", reason: "TARGET_TRANSITION_REJECTED", detail: decision.reason,
    } };
  }
  if (decision.finalRungDelegated) {
    return { disposition: "REJECTED", result: { disposition: "REJECTED", reason: "TARGET_FINAL_RUNG_AUTHORITY_NOT_INTEGRATED" } };
  }
  const occurredAt = canonicalUtcTimestampMilliseconds(fact.occurredAt);
  const toState = serializeTargetReducerState({
    state: decision.nextState,
    previous: input.schedule.persistedState,
    source: input.source,
    occurredOn: fact.occurredOn,
    occurredAt,
  });
  if (!toState) {
    return { disposition: "REJECTED", result: { disposition: "REJECTED", reason: "TARGET_FINAL_RUNG_AUTHORITY_NOT_INTEGRATED" } };
  }

  const idempotencyKey = input.source.kind === "REVIEW_OUTCOME_APPLIED"
    ? `review-outcome:${fact.sourceId}`
    : `controlled-pass:${fact.sourceId}`;
  const envelope = {
    scheduleWordId: input.schedule.scheduleWordId,
    transitionKind: input.source.kind,
    sourceReviewOutcomeEventId: input.source.kind === "REVIEW_OUTCOME_APPLIED"
      ? fact.sourceId
      : null,
    sourceControlledGraduationReceiptId: input.source.kind === "CONTROLLED_PASS_APPLIED"
      ? fact.sourceId
      : null,
    idempotencyKey,
    expectedStateRevision: input.schedule.stateRevision,
    fromState: input.schedule.persistedState,
    toState,
    transitionReason: decision.reason,
    reducerVersion: TARGET_REVIEW_REDUCER_VERSION,
    occurredAt,
  };
  return { disposition: "PLANNED", value: {
    decisionReason: decision.reason,
    sourceId: fact.sourceId,
    occurredAt,
    occurredOn: fact.occurredOn,
    toState,
    idempotencyKey,
    sourceFingerprint: fingerprintSnapshotValue(envelope),
    reducerVersion: TARGET_REVIEW_REDUCER_VERSION,
  } };
}
