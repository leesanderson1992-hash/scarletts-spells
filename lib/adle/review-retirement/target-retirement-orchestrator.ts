import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewEvent,
} from "../review-policy/contracts";
import {
  TARGET_REVIEW_POLICY_CONFIG,
  reduceTargetReviewTransition,
} from "../review-policy/target-regression-v1";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
  type FinalRungRetirementAuthorityState,
  type FinalRungRetirementRejectionReason,
  type PostCheckSchedulerOrchestrationDecision,
} from "./contracts";
import {
  FINAL_RUNG_RETIREMENT_POLICY_CONFIG,
  isValidFinalRungRetirementAuthorityStateV1,
  reduceFinalRungRetirementV1,
} from "./final-rung-retirement-v1";

function rejected(
  state: FinalRungRetirementAuthorityState,
  reason: FinalRungRetirementRejectionReason,
  detail?: string,
): PostCheckSchedulerOrchestrationDecision {
  return { disposition: "REJECTED", reason, previousState: state, nextState: null, ...(detail ? { detail } : {}) };
}

/**
 * Runs ordinary post-check Review events through the unchanged C2B.1 reducer.
 * This wrapper preserves retirement-check lineage and intercepts only a new
 * DAY_56 delegation, which the retirement authority converts to retirement.
 */
export function orchestratePostCheckTargetReviewTransitionV1(input: {
  state: FinalRungRetirementAuthorityState;
  event: TargetReviewEvent;
  expectedStateRevision: number;
}): PostCheckSchedulerOrchestrationDecision {
  const { state, event } = input;
  if (state.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION) {
    return rejected(state, "SCHEDULER_POLICY_UNSUPPORTED");
  }
  if (state.stateShapeVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION) {
    return rejected(state, "STATE_SHAPE_UNSUPPORTED");
  }
  if (state.retirementPolicyVersion !== FINAL_RUNG_RETIREMENT_POLICY_VERSION) {
    return rejected(state, "RETIREMENT_POLICY_UNSUPPORTED");
  }
  if (state.retirementStateVersion !== FINAL_RUNG_RETIREMENT_STATE_VERSION) {
    return rejected(state, "RETIREMENT_STATE_SHAPE_UNSUPPORTED");
  }
  if (!isValidFinalRungRetirementAuthorityStateV1(state)) {
    return rejected(state, "STATE_MALFORMED");
  }
  if (state.retirementLifecycle.status !== "POST_CHECK_RECOVERY") {
    return rejected(state, "EVENT_ROUTE_CONFLICT");
  }
  if (!Number.isInteger(input.expectedStateRevision)
    || input.expectedStateRevision !== state.stateRevision) {
    return rejected(state, "REVISION_CONFLICT");
  }
  const schedulerDecision = reduceTargetReviewTransition(
    state.schedulerState,
    event,
    TARGET_REVIEW_POLICY_CONFIG,
  );
  if (schedulerDecision.disposition === "REJECTED") {
    return rejected(state, "SCHEDULER_TRANSITION_REJECTED", schedulerDecision.reason);
  }
  if (!schedulerDecision.finalRungDelegated) {
    return {
      disposition: "APPLIED",
      reason: "POST_CHECK_SCHEDULER_TRANSITION_PRESERVED",
      previousState: state,
      nextState: {
        ...state,
        stateRevision: state.stateRevision + 1,
        schedulerState: schedulerDecision.nextState,
      },
      schedulerReducerDecision: schedulerDecision,
      retirementDecision: null,
      checkOutcomeLineagePreserved: true,
    };
  }
  const rung = event.kind === "SCHEDULED_CHECK" ? event.rung
    : event.kind === "RECOVERY_CHECK" ? event.failedRung : null;
  const outcome = event.kind === "SCHEDULED_CHECK" || event.kind === "RECOVERY_CHECK"
    ? event.outcome : null;
  if (rung !== "DAY_56" || outcome !== "pass") {
    return rejected(state, "DAY_56_DELEGATION_MALFORMED");
  }
  const retirementDecision = reduceFinalRungRetirementV1(state, {
    kind: "FINAL_RUNG_DELEGATION",
    expectedStateRevision: state.stateRevision,
    source: {
      reviewOutcomeEventId: event.eventId,
      childId: state.childId,
      canonicalWordId: state.canonicalWordId,
      dueKind: event.kind === "RECOVERY_CHECK" ? "next_day_recovery" : "scheduled_review",
      rung: "DAY_56",
      outcome: "pass",
      occurredOn: event.occurredOn,
    },
    schedulerDecision,
    last28DayReviewOn: null,
    authenticUseEvidence: [],
  }, FINAL_RUNG_RETIREMENT_POLICY_CONFIG);
  if (retirementDecision.disposition === "REJECTED") {
    return rejected(state, retirementDecision.reason, retirementDecision.detail);
  }
  return {
    disposition: "APPLIED",
    reason: "POST_CHECK_FINAL_RUNG_RETIRED",
    previousState: state,
    nextState: retirementDecision.nextState,
    schedulerReducerDecision: schedulerDecision,
    retirementDecision,
    checkOutcomeLineagePreserved: true,
  };
}
