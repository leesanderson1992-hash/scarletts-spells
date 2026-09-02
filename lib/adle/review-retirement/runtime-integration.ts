import type { IsoDate } from "../review-scheduler";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewState,
} from "../review-policy/contracts";
import { reduceTargetReviewTransition } from "../review-policy/target-regression-v1";
import { canonicalUtcTimestampMilliseconds } from "../review-policy/canonical-timestamp";
import type {
  HydratedReviewSchedule,
} from "../review-policy/runtime-coexistence";
import {
  buildTargetReviewTransitionPlan,
  serializeTargetReducerState,
  targetReviewEventFromSource,
  type TargetReviewOutcomeSourceFact,
  type TargetReviewTransitionPlan,
} from "../review-policy/target-transition-persistence";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
  type FinalRungRetirementAuthorityState,
  type FinalRungRetirementDecision,
  type PreRetirementCheckOutcomeLineage,
  type RetirementAuthenticUseEvidence,
} from "./contracts";
import {
  FINAL_RUNG_RETIREMENT_POLICY_CONFIG,
  isValidFinalRungRetirementAuthorityStateV1,
  reduceFinalRungRetirementV1,
} from "./final-rung-retirement-v1";
import { orchestratePostCheckTargetReviewTransitionV1 } from "./target-retirement-orchestrator";

type TargetSchedule = Extract<HydratedReviewSchedule, { kind: "TARGET_REGRESSION_V1" }>;
type AppliedRetirementDecision = Extract<FinalRungRetirementDecision, { disposition: "APPLIED" }>;

export type PersistedRetirementDecisionReceipt = {
  source_review_outcome_event_id: string;
  qualifying_authentic_use_event_id: string | null;
  pre_retirement_check_outcome_event_id: string | null;
  schedule_policy_version: string;
  state_shape_version: string;
  retirement_policy_version: string;
  retirement_state_version: string;
  decision: "AWAIT_PRE_RETIREMENT_CHECK" | "CONTINUE_V2_RECOVERY" | "RETIRE";
  decision_reason:
    | "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE"
    | "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK"
    | "PRE_RETIREMENT_CHECK_PASS_RETIRED"
    | "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY"
    | "POST_CHECK_FINAL_RUNG_PASS_RETIRED";
  expected_state_revision: number;
  applied_state_revision: number;
  occurred_at: string;
};

export type PersistedRetirementCheckOutcome = {
  id: string;
  event_type: "review_pass" | "retirement_check_pass" | "retirement_check_fail";
  occurred_on: IsoDate;
  frozen_due_on: IsoDate;
};

export type HydrateRetirementAuthorityResult =
  | { disposition: "HYDRATED"; state: FinalRungRetirementAuthorityState }
  | { disposition: "REJECTED"; reason: "RETIREMENT_HISTORY_MALFORMED" };

/**
 * Reconstructs the separate FR lifecycle from immutable FR.2 receipts. The
 * C2B scheduler route/failure state is never used as a substitute for check
 * lineage, and every non-retirement field remains under exact C2B hydration.
 */
export function hydrateFinalRungRetirementAuthorityV1(input: {
  schedule: TargetSchedule;
  persistedCheckOutcomeEventId: string | null;
  receipts: readonly PersistedRetirementDecisionReceipt[];
  checkOutcomes: readonly PersistedRetirementCheckOutcome[];
}): HydrateRetirementAuthorityResult {
  const receipts = [...input.receipts].sort((left, right) =>
    left.applied_state_revision - right.applied_state_revision
    || left.source_review_outcome_event_id.localeCompare(right.source_review_outcome_event_id));
  const sourceIds = receipts.map((receipt) => receipt.source_review_outcome_event_id);
  if (new Set(sourceIds).size !== sourceIds.length || receipts.some((receipt) =>
    receipt.schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
    || receipt.state_shape_version !== TARGET_PER_WORD_STATE_SHAPE_VERSION
    || receipt.retirement_policy_version !== FINAL_RUNG_RETIREMENT_POLICY_VERSION
    || receipt.retirement_state_version !== FINAL_RUNG_RETIREMENT_STATE_VERSION
    || receipt.expected_state_revision < 0
    || receipt.applied_state_revision !== receipt.expected_state_revision + 1
    || receipt.applied_state_revision > input.schedule.stateRevision
    || !input.schedule.state.appliedEventIds.includes(receipt.source_review_outcome_event_id)
  )) return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };

  const latest = receipts.at(-1);
  const checkById = new Map(input.checkOutcomes.map((outcome) => [outcome.id, outcome]));
  const checkLineage = (id: string | null): PreRetirementCheckOutcomeLineage | null => {
    if (!id) return null;
    const outcome = checkById.get(id);
    if (!outcome || !["retirement_check_pass", "retirement_check_fail"].includes(outcome.event_type)
      || !input.schedule.state.appliedEventIds.includes(id)) return null;
    return {
      outcomeEventId: id,
      outcome: outcome.event_type === "retirement_check_pass" ? "pass" : "fail",
      occurredOn: outcome.occurred_on,
      governedDueOn: outcome.frozen_due_on,
    };
  };

  let retirementLifecycle: FinalRungRetirementAuthorityState["retirementLifecycle"];
  if (!latest) {
    if (input.persistedCheckOutcomeEventId !== null
      || ["PRE_RETIREMENT_PRESERVED", "RETIRED_PRESERVED"].includes(input.schedule.state.route.membership)) {
      return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
    }
    retirementLifecycle = { status: "NOT_ENTERED" };
  } else if (latest.decision === "AWAIT_PRE_RETIREMENT_CHECK") {
    if (input.persistedCheckOutcomeEventId !== null
      || input.schedule.state.route.membership !== "PRE_RETIREMENT_PRESERVED"
      || latest.pre_retirement_check_outcome_event_id !== null) {
      return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
    }
    retirementLifecycle = {
      status: "AWAITING_PRE_RETIREMENT_CHECK",
      dueOn: input.schedule.state.route.dueOn,
      day56OutcomeEventId: latest.source_review_outcome_event_id,
    };
  } else if (latest.decision === "CONTINUE_V2_RECOVERY") {
    const lineage = checkLineage(latest.pre_retirement_check_outcome_event_id);
    if (!lineage || lineage.outcome !== "fail"
      || input.persistedCheckOutcomeEventId !== lineage.outcomeEventId) {
      return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
    }
    retirementLifecycle = {
      status: "POST_CHECK_RECOVERY",
      checkOutcomeLineage: { ...lineage, outcome: "fail" },
    };
  } else {
    const lineage = checkLineage(latest.pre_retirement_check_outcome_event_id);
    const basis = latest.decision_reason === "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE"
      ? "QUALIFYING_AUTHENTIC_USE"
      : latest.decision_reason === "PRE_RETIREMENT_CHECK_PASS_RETIRED"
        ? "PRE_RETIREMENT_CHECK_PASS"
        : latest.decision_reason === "POST_CHECK_FINAL_RUNG_PASS_RETIRED"
          ? "POST_CHECK_FINAL_RUNG_PASS"
          : null;
    if (!basis || input.schedule.state.route.membership !== "RETIRED_PRESERVED"
      || input.persistedCheckOutcomeEventId !== (latest.pre_retirement_check_outcome_event_id ?? null)
      || (basis === "QUALIFYING_AUTHENTIC_USE" && lineage !== null)
      || (basis === "PRE_RETIREMENT_CHECK_PASS" && lineage?.outcome !== "pass")
      || (basis === "POST_CHECK_FINAL_RUNG_PASS" && lineage?.outcome !== "fail")) {
      return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
    }
    const retirementSource = checkById.get(latest.source_review_outcome_event_id);
    if (!retirementSource) {
      return { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
    }
    retirementLifecycle = {
      status: "RETIRED",
      retiredOn: retirementSource.occurred_on,
      retirementSourceOutcomeEventId: latest.source_review_outcome_event_id,
      basis,
      checkOutcomeLineage: lineage,
    };
  }

  const state: FinalRungRetirementAuthorityState = {
    scheduleWordId: input.schedule.scheduleWordId,
    childId: input.schedule.childId,
    canonicalWordId: input.schedule.canonicalWordId,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    retirementPolicyVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
    retirementStateVersion: FINAL_RUNG_RETIREMENT_STATE_VERSION,
    stateRevision: input.schedule.stateRevision,
    schedulerState: input.schedule.state,
    retirementLifecycle,
    appliedRetirementEventIds: sourceIds,
  };
  return isValidFinalRungRetirementAuthorityStateV1(state)
    ? { disposition: "HYDRATED", state }
    : { disposition: "REJECTED", reason: "RETIREMENT_HISTORY_MALFORMED" };
}

export type FinalRungRetirementPersistencePlan = {
  authority: "TARGET_RETIREMENT_V1";
  decision: AppliedRetirementDecision["decision"];
  decisionReason: AppliedRetirementDecision["reason"];
  qualifyingAuthenticUseEventId: string | null;
  preRetirementCheckOutcomeEventId: string | null;
  expectedPreRetirementCheckOutcomeEventId: string | null;
  schedulerReducerInputState: AppliedRetirementDecision["schedulerReducerDecision"] extends never
    ? never : object | null;
  transition: TargetReviewTransitionPlan;
  retirementSourceFingerprint: string;
};

export type TargetRuntimeTransitionPlan =
  | { authority: "TARGET_REGRESSION_V1"; transition: TargetReviewTransitionPlan }
  | FinalRungRetirementPersistencePlan;

function transitionPlanFromDecision(input: {
  schedule: TargetSchedule;
  source: TargetReviewOutcomeSourceFact;
  nextState: TargetReviewState;
  reducerVersion: string;
  reason: string;
}): TargetReviewTransitionPlan | null {
  const occurredAt = canonicalUtcTimestampMilliseconds(input.source.completed_at);
  const toState = serializeTargetReducerState({
    state: input.nextState,
    previous: input.schedule.persistedState,
    source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: input.source },
    occurredOn: input.source.review_completed_on,
    occurredAt,
  });
  if (!toState) return null;
  const idempotencyKey = `review-outcome:${input.source.id}`;
  const envelope = {
    scheduleWordId: input.schedule.scheduleWordId,
    transitionKind: "REVIEW_OUTCOME_APPLIED",
    sourceReviewOutcomeEventId: input.source.id,
    sourceControlledGraduationReceiptId: null,
    idempotencyKey,
    expectedStateRevision: input.schedule.stateRevision,
    fromState: input.schedule.persistedState,
    toState,
    transitionReason: input.reason,
    reducerVersion: input.reducerVersion,
    occurredAt,
  };
  return {
    decisionReason: input.reason,
    sourceId: input.source.id,
    occurredAt,
    occurredOn: input.source.review_completed_on,
    toState,
    idempotencyKey,
    sourceFingerprint: fingerprintSnapshotValue(envelope),
    reducerVersion: input.reducerVersion,
  };
}

function retirementPlan(input: {
  schedule: TargetSchedule;
  source: TargetReviewOutcomeSourceFact;
  decision: AppliedRetirementDecision;
  priorCheckOutcomeEventId: string | null;
}): FinalRungRetirementPersistencePlan | null {
  const transition = transitionPlanFromDecision({
    schedule: input.schedule,
    source: input.source,
    nextState: input.decision.nextState.schedulerState,
    reducerVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
    reason: input.decision.reason,
  });
  if (!transition) return null;
  const currentCheck = input.decision.requiredProvenance.preRetirementCheckOutcomeEventId;
  const schedulerReducerInputState = input.decision.reason === "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY"
    ? input.decision.schedulerReducerDecision?.previousState ?? null
    : null;
  const envelope = {
    scheduleWordId: input.schedule.scheduleWordId,
    sourceReviewOutcomeEventId: input.source.id,
    qualifyingAuthenticUseEventId: input.decision.requiredProvenance.qualifyingAuthenticUseEventId,
    preRetirementCheckOutcomeEventId: currentCheck,
    expectedPreRetirementCheckOutcomeEventId: input.priorCheckOutcomeEventId,
    idempotencyKey: transition.idempotencyKey,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    retirementPolicyVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
    retirementStateVersion: FINAL_RUNG_RETIREMENT_STATE_VERSION,
    decision: input.decision.decision,
    decisionReason: input.decision.reason,
    schedulerReducerInputState,
    expectedStateRevision: input.schedule.stateRevision,
    appliedStateRevision: input.schedule.stateRevision + 1,
    transitionSourceFingerprint: transition.sourceFingerprint,
    occurredAt: transition.occurredAt,
  };
  return {
    authority: "TARGET_RETIREMENT_V1",
    decision: input.decision.decision,
    decisionReason: input.decision.reason,
    qualifyingAuthenticUseEventId: input.decision.requiredProvenance.qualifyingAuthenticUseEventId,
    preRetirementCheckOutcomeEventId: currentCheck,
    expectedPreRetirementCheckOutcomeEventId: input.priorCheckOutcomeEventId,
    schedulerReducerInputState,
    transition,
    retirementSourceFingerprint: fingerprintSnapshotValue(envelope),
  };
}

/** One composition boundary: ordinary events stay with C2B.1; only final-rung
 * delegation and the governed retirement check enter FR.1. */
export function buildTargetRuntimeTransitionPlan(input: {
  schedule: TargetSchedule;
  retirementState: FinalRungRetirementAuthorityState;
  source: TargetReviewOutcomeSourceFact;
  authenticUseEvidence: readonly RetirementAuthenticUseEvidence[];
  policyConfig: Parameters<typeof buildTargetReviewTransitionPlan>[0]["policyConfig"];
}): { disposition: "PLANNED"; value: TargetRuntimeTransitionPlan } | {
  disposition: "REJECTED";
  reason: string;
} {
  if (input.retirementState.stateRevision !== input.schedule.stateRevision
    || input.retirementState.schedulerState !== input.schedule.state
      && fingerprintSnapshotValue(input.retirementState.schedulerState)
        !== fingerprintSnapshotValue(input.schedule.state)) {
    return { disposition: "REJECTED", reason: "RETIREMENT_SCHEDULER_STATE_CONFLICT" };
  }
  const priorCheck = input.retirementState.retirementLifecycle.status === "POST_CHECK_RECOVERY"
    ? input.retirementState.retirementLifecycle.checkOutcomeLineage.outcomeEventId
    : null;
  if (input.source.due_kind === "pre_retirement_check") {
    const decision = reduceFinalRungRetirementV1(input.retirementState, {
      kind: "PRE_RETIREMENT_CHECK",
      expectedStateRevision: input.schedule.stateRevision,
      source: {
        reviewOutcomeEventId: input.source.id,
        childId: input.source.child_id,
        canonicalWordId: input.source.canonical_word_id,
        dueKind: "pre_retirement_check",
        outcome: input.source.original_result === "success" ? "pass" : "fail",
        occurredOn: input.source.review_completed_on,
      },
    }, FINAL_RUNG_RETIREMENT_POLICY_CONFIG);
    if (decision.disposition === "REJECTED") return { disposition: "REJECTED", reason: decision.reason };
    const plan = retirementPlan({ schedule: input.schedule, source: input.source, decision, priorCheckOutcomeEventId: null });
    return plan ? { disposition: "PLANNED", value: plan }
      : { disposition: "REJECTED", reason: "RETIREMENT_SERIALIZATION_FAILED" };
  }

  const fact = targetReviewEventFromSource({
    schedule: input.schedule,
    source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: input.source },
  });
  if (!fact) return { disposition: "REJECTED", reason: "TARGET_SOURCE_LINEAGE_CONFLICT" };

  if (input.retirementState.retirementLifecycle.status === "POST_CHECK_RECOVERY") {
    const orchestrated = orchestratePostCheckTargetReviewTransitionV1({
      state: input.retirementState,
      event: fact.event,
      expectedStateRevision: input.schedule.stateRevision,
    });
    if (orchestrated.disposition === "REJECTED") {
      return { disposition: "REJECTED", reason: orchestrated.reason };
    }
    if (orchestrated.retirementDecision) {
      const plan = retirementPlan({
        schedule: input.schedule,
        source: input.source,
        decision: orchestrated.retirementDecision,
        priorCheckOutcomeEventId: priorCheck,
      });
      return plan ? { disposition: "PLANNED", value: plan }
        : { disposition: "REJECTED", reason: "RETIREMENT_SERIALIZATION_FAILED" };
    }
    const transition = transitionPlanFromDecision({
      schedule: input.schedule,
      source: input.source,
      nextState: orchestrated.schedulerReducerDecision.nextState,
      reducerVersion: TARGET_REVIEW_POLICY_VERSION,
      reason: orchestrated.schedulerReducerDecision.reason,
    });
    return transition
      ? { disposition: "PLANNED", value: { authority: "TARGET_REGRESSION_V1", transition } }
      : { disposition: "REJECTED", reason: "TARGET_SERIALIZATION_FAILED" };
  }

  const ordinary = buildTargetReviewTransitionPlan({
    schedule: input.schedule,
    source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: input.source },
    policyConfig: input.policyConfig,
  });
  if (ordinary.disposition === "PLANNED") {
    return { disposition: "PLANNED", value: { authority: "TARGET_REGRESSION_V1", transition: ordinary.value } };
  }
  if (ordinary.result.reason !== "TARGET_FINAL_RUNG_AUTHORITY_NOT_INTEGRATED") {
    return { disposition: "REJECTED", reason: ordinary.result.reason };
  }
  const schedulerDecision = reduceTargetReviewTransition(
    input.schedule.state,
    fact.event,
    input.policyConfig,
  );
  if (schedulerDecision.disposition === "REJECTED" || !schedulerDecision.finalRungDelegated) {
    return { disposition: "REJECTED", reason: "DAY_56_DELEGATION_MALFORMED" };
  }
  const decision = reduceFinalRungRetirementV1(input.retirementState, {
    kind: "FINAL_RUNG_DELEGATION",
    expectedStateRevision: input.schedule.stateRevision,
    source: {
      reviewOutcomeEventId: input.source.id,
      childId: input.source.child_id,
      canonicalWordId: input.source.canonical_word_id,
      dueKind: input.source.due_kind,
      rung: "DAY_56",
      outcome: "pass",
      occurredOn: input.source.review_completed_on,
    },
    schedulerDecision,
    last28DayReviewOn: input.schedule.persistedState.last28DayReviewOn,
    authenticUseEvidence: input.authenticUseEvidence,
  }, FINAL_RUNG_RETIREMENT_POLICY_CONFIG);
  if (decision.disposition === "REJECTED") return { disposition: "REJECTED", reason: decision.reason };
  const plan = retirementPlan({ schedule: input.schedule, source: input.source, decision, priorCheckOutcomeEventId: null });
  return plan ? { disposition: "PLANNED", value: plan }
    : { disposition: "REJECTED", reason: "RETIREMENT_SERIALIZATION_FAILED" };
}
