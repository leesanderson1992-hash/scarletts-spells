import { addDays, type IsoDate } from "../review-scheduler";
import {
  ADLE_REVIEW_DUE_ANCHOR_V1,
  REVIEW_RUNGS,
  ROLLING_FROM_COMPLETION,
  TARGET_REVIEW_POLICY_VERSION,
  type PostDayOneReviewRung,
  type ReviewRung,
  type ScheduledDueDatePolicy,
  type TargetFailureLineage,
  type TargetReviewEvent,
  type TargetReviewPolicyConfig,
  type TargetReviewState,
  type TargetTransitionDecision,
  type TargetTransitionReason,
} from "./contracts";

const RUNG_GAP_DAYS: Readonly<Record<ReviewRung, number>> = {
  DAY_1: 1,
  DAY_3: 3,
  DAY_7: 7,
  DAY_14: 14,
  DAY_28: 28,
  DAY_56: 56,
};

export const ROLLING_FROM_COMPLETION_DUE_DATES: ScheduledDueDatePolicy = {
  dueAnchorVersion: ADLE_REVIEW_DUE_ANCHOR_V1,
  dueAnchorKind: ROLLING_FROM_COMPLETION,
  nextScheduledDueOn: (completedOn, rung) => addDays(completedOn, RUNG_GAP_DAYS[rung]),
};

export const TARGET_REVIEW_POLICY_CONFIG: TargetReviewPolicyConfig = {
  schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
  rungGapDays: RUNG_GAP_DAYS,
  recoveryDelayDays: 1,
  dueDates: ROLLING_FROM_COMPLETION_DUE_DATES,
};

export function targetNoFailureLineage(): TargetFailureLineage {
  return { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 };
}

export function initialTargetControlledState(): TargetReviewState {
  return {
    route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: "NOT_YET_PASSED" },
    failureLineage: targetNoFailureLineage(),
    appliedEventIds: [],
  };
}

export function initialTargetScheduledState(input: {
  rung: ReviewRung;
  dueOn: IsoDate;
  failureLineage?: TargetFailureLineage;
  regressionOrigin?: ReviewRung | null;
  appliedEventIds?: readonly string[];
}): TargetReviewState {
  return {
    route: {
      membership: "SCHEDULED",
      rung: input.rung,
      dueOn: input.dueOn,
      regressionOrigin: input.regressionOrigin ?? null,
    },
    failureLineage: input.failureLineage ?? targetNoFailureLineage(),
    appliedEventIds: input.appliedEventIds ?? [],
  };
}

function validIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isRung(value: unknown): value is ReviewRung {
  return typeof value === "string" && (REVIEW_RUNGS as readonly string[]).includes(value);
}

function isPostDayOneRung(value: unknown): value is PostDayOneReviewRung {
  return typeof value === "string" && (REVIEW_RUNGS.slice(1) as readonly string[]).includes(value);
}

function validLineage(lineage: TargetFailureLineage): boolean {
  if (!lineage || typeof lineage !== "object") return false;
  if (lineage.resolution === "NONE") {
    return lineage.episodeId === null && lineage.consecutiveIndependentFailures === 0;
  }
  return lineage.resolution === "UNRESOLVED"
    && typeof lineage.episodeId === "string"
    && lineage.episodeId.length > 0
    && Number.isInteger(lineage.consecutiveIndependentFailures)
    && lineage.consecutiveIndependentFailures >= 1;
}

function validRouteAndLineage(state: TargetReviewState): boolean {
  if (!state || typeof state !== "object" || !validLineage(state.failureLineage)
    || !Array.isArray(state.appliedEventIds)
    || state.appliedEventIds.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(state.appliedEventIds).size !== state.appliedEventIds.length) return false;
  const route = state.route;
  if (!route || typeof route !== "object") return false;
  if (route.membership === "SCHEDULED") {
    return isRung(route.rung) && validIsoDate(route.dueOn)
      && (route.regressionOrigin === null || isRung(route.regressionOrigin))
      && (state.failureLineage.resolution === "NONE"
        || route.rung === "DAY_1"
        || state.failureLineage.consecutiveIndependentFailures < 3);
  }
  if (route.membership === "NEXT_DAY_RECOVERY") {
    return isPostDayOneRung(route.failedRung) && validIsoDate(route.dueOn)
      && state.failureLineage.resolution === "UNRESOLVED"
      && state.failureLineage.consecutiveIndependentFailures < 3;
  }
  if (route.membership === "CONTROLLED_REACQUISITION") {
    if (route.requiredBecause === "NOT_YET_PASSED") return state.failureLineage.resolution === "NONE";
    if (state.failureLineage.resolution !== "UNRESOLVED") return false;
    if (route.requiredBecause === "DAY_1_FAILURE") {
      return state.failureLineage.consecutiveIndependentFailures < 3;
    }
    return route.requiredBecause === "THIRD_CONSECUTIVE_FAILURE"
      && state.failureLineage.consecutiveIndependentFailures >= 3;
  }
  if (route.membership === "FINAL_RUNG_DELEGATED") {
    return route.completedRung === "DAY_56" && validIsoDate(route.completedOn)
      && state.failureLineage.resolution === "NONE";
  }
  if (route.membership === "PRE_RETIREMENT_PRESERVED") {
    return validIsoDate(route.dueOn) && state.failureLineage.resolution === "NONE";
  }
  return route.membership === "RETIRED_PRESERVED" && state.failureLineage.resolution === "NONE";
}

function validEvent(event: TargetReviewEvent): boolean {
  if (!event || typeof event !== "object" || typeof event.eventId !== "string"
    || event.eventId.length === 0 || !validIsoDate(event.occurredOn)) return false;
  if (event.kind === "CONTROLLED_PASS" || event.kind === "REPAIR") return true;
  if (event.kind === "SCHEDULED_CHECK") return isRung(event.rung)
    && (event.outcome === "pass" || event.outcome === "fail");
  return event.kind === "RECOVERY_CHECK" && isPostDayOneRung(event.failedRung)
    && (event.outcome === "pass" || event.outcome === "fail");
}

function validConfig(config: TargetReviewPolicyConfig): boolean {
  return config.schedulePolicyVersion === TARGET_REVIEW_POLICY_VERSION
    && config.recoveryDelayDays === 1
    && typeof config.dueDates?.dueAnchorVersion === "string"
    && config.dueDates.dueAnchorVersion.length > 0
    && typeof config.dueDates.dueAnchorKind === "string"
    && config.dueDates.dueAnchorKind.length > 0
    && typeof config.dueDates.nextScheduledDueOn === "function"
    && REVIEW_RUNGS.every((rung) => config.rungGapDays[rung] === RUNG_GAP_DAYS[rung]);
}

function nextRung(rung: ReviewRung): ReviewRung | null {
  return REVIEW_RUNGS[REVIEW_RUNGS.indexOf(rung) + 1] ?? null;
}

function previousRung(rung: PostDayOneReviewRung): ReviewRung {
  return REVIEW_RUNGS[REVIEW_RUNGS.indexOf(rung) - 1];
}

function appendEvent(state: TargetReviewState, eventId: string): readonly string[] {
  return [...state.appliedEventIds, eventId];
}

function failedLineage(state: TargetReviewState, eventId: string): Extract<TargetFailureLineage, { resolution: "UNRESOLVED" }> {
  if (state.failureLineage.resolution === "NONE") {
    return { resolution: "UNRESOLVED", episodeId: eventId, consecutiveIndependentFailures: 1 };
  }
  return {
    ...state.failureLineage,
    consecutiveIndependentFailures: state.failureLineage.consecutiveIndependentFailures + 1,
  };
}

function applied(input: {
  config: TargetReviewPolicyConfig;
  reason: TargetTransitionReason;
  previousState: TargetReviewState;
  nextState: TargetReviewState;
  routeChanged: boolean;
  sequenceReset?: boolean;
  regressionOrigin?: ReviewRung | null;
  finalRungDelegated?: boolean;
}): TargetTransitionDecision {
  return {
    disposition: "APPLIED",
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    dueAnchorVersion: input.config.dueDates.dueAnchorVersion,
    reason: input.reason,
    previousState: input.previousState,
    nextState: input.nextState,
    routeChanged: input.routeChanged,
    sequenceReset: input.sequenceReset ?? false,
    regressionOrigin: input.regressionOrigin ?? null,
    finalRungDelegated: input.finalRungDelegated ?? false,
  };
}

function rejected(
  state: TargetReviewState,
  config: TargetReviewPolicyConfig,
  reason: Extract<TargetTransitionDecision, { disposition: "REJECTED" }>["reason"],
): TargetTransitionDecision {
  return {
    disposition: "REJECTED",
    schedulePolicyVersion: String(config?.schedulePolicyVersion ?? ""),
    reason,
    previousState: state,
    nextState: null,
  };
}

function successfulCheck(input: {
  state: TargetReviewState;
  event: Extract<TargetReviewEvent, { kind: "SCHEDULED_CHECK" | "RECOVERY_CHECK" }>;
  completedRung: ReviewRung;
  reason: "SCHEDULED_PASS_ADVANCED" | "RECOVERY_PASS_ADVANCED";
  config: TargetReviewPolicyConfig;
}): TargetTransitionDecision {
  const next = nextRung(input.completedRung);
  const appliedEventIds = appendEvent(input.state, input.event.eventId);
  if (next === null) {
    return applied({
      config: input.config,
      reason: "DAY_56_PASS_DELEGATED",
      previousState: input.state,
      nextState: {
        route: { membership: "FINAL_RUNG_DELEGATED", completedRung: "DAY_56", completedOn: input.event.occurredOn },
        failureLineage: targetNoFailureLineage(),
        appliedEventIds,
      },
      routeChanged: true,
      sequenceReset: input.state.failureLineage.resolution === "UNRESOLVED",
      finalRungDelegated: true,
    });
  }
  return applied({
    config: input.config,
    reason: input.reason,
    previousState: input.state,
    nextState: initialTargetScheduledState({
      rung: next,
      dueOn: input.config.dueDates.nextScheduledDueOn(input.event.occurredOn, next),
      appliedEventIds,
    }),
    routeChanged: true,
    sequenceReset: input.state.failureLineage.resolution === "UNRESOLVED",
  });
}

export function reduceTargetReviewTransition(
  state: TargetReviewState,
  event: TargetReviewEvent,
  policyConfig: TargetReviewPolicyConfig = TARGET_REVIEW_POLICY_CONFIG,
): TargetTransitionDecision {
  if (policyConfig?.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION) {
    return rejected(state, policyConfig, "POLICY_VERSION_UNSUPPORTED");
  }
  if (!validConfig(policyConfig)) return rejected(state, policyConfig, "POLICY_CONFIG_MALFORMED");
  if (!validRouteAndLineage(state)) return rejected(state, policyConfig, "STATE_MALFORMED");
  if (!validEvent(event)) return rejected(state, policyConfig, "EVENT_MALFORMED");
  if (state.appliedEventIds.includes(event.eventId)) return rejected(state, policyConfig, "DUPLICATE_EVENT");

  if (event.kind === "REPAIR") {
    return applied({
      config: policyConfig,
      reason: "REPAIR_RECORDED_NO_ROUTE_CHANGE",
      previousState: state,
      nextState: { ...state, appliedEventIds: appendEvent(state, event.eventId) },
      routeChanged: false,
    });
  }

  if (event.kind === "CONTROLLED_PASS") {
    if (state.route.membership !== "CONTROLLED_REACQUISITION") {
      return rejected(state, policyConfig, "EVENT_ROUTE_CONFLICT");
    }
    return applied({
      config: policyConfig,
      reason: "CONTROLLED_PASS_TO_DAY_1",
      previousState: state,
      nextState: initialTargetScheduledState({
        rung: "DAY_1",
        dueOn: policyConfig.dueDates.nextScheduledDueOn(event.occurredOn, "DAY_1"),
        failureLineage: state.failureLineage,
        appliedEventIds: appendEvent(state, event.eventId),
      }),
      routeChanged: true,
    });
  }

  if (event.kind === "SCHEDULED_CHECK") {
    if (state.route.membership !== "SCHEDULED" || state.route.rung !== event.rung) {
      return rejected(state, policyConfig, "EVENT_ROUTE_CONFLICT");
    }
    if (event.occurredOn < state.route.dueOn) return rejected(state, policyConfig, "EVENT_BEFORE_DUE");
    if (event.outcome === "pass") {
      return successfulCheck({
        state, event, completedRung: event.rung,
        reason: "SCHEDULED_PASS_ADVANCED", config: policyConfig,
      });
    }
    const lineage = failedLineage(state, event.eventId);
    if (event.rung === "DAY_1" || lineage.consecutiveIndependentFailures >= 3) {
      const third = lineage.consecutiveIndependentFailures >= 3;
      return applied({
        config: policyConfig,
        reason: third ? "THIRD_CONSECUTIVE_FAILURE_TO_CONTROLLED" : "DAY_1_FAILURE_TO_CONTROLLED",
        previousState: state,
        nextState: {
          route: {
            membership: "CONTROLLED_REACQUISITION",
            requiredBecause: third ? "THIRD_CONSECUTIVE_FAILURE" : "DAY_1_FAILURE",
          },
          failureLineage: lineage,
          appliedEventIds: appendEvent(state, event.eventId),
        },
        routeChanged: true,
      });
    }
    return applied({
      config: policyConfig,
      reason: "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY",
      previousState: state,
      nextState: {
        route: {
          membership: "NEXT_DAY_RECOVERY",
          failedRung: event.rung,
          dueOn: addDays(event.occurredOn, policyConfig.recoveryDelayDays),
        },
        failureLineage: lineage,
        appliedEventIds: appendEvent(state, event.eventId),
      },
      routeChanged: true,
    });
  }

  if (state.route.membership !== "NEXT_DAY_RECOVERY" || state.route.failedRung !== event.failedRung) {
    return rejected(state, policyConfig, "EVENT_ROUTE_CONFLICT");
  }
  if (event.occurredOn < state.route.dueOn) return rejected(state, policyConfig, "EVENT_BEFORE_DUE");
  if (event.outcome === "pass") {
    return successfulCheck({
      state, event, completedRung: event.failedRung,
      reason: "RECOVERY_PASS_ADVANCED", config: policyConfig,
    });
  }
  const lineage = failedLineage(state, event.eventId);
  if (lineage.consecutiveIndependentFailures >= 3) {
    return applied({
      config: policyConfig,
      reason: "THIRD_CONSECUTIVE_FAILURE_TO_CONTROLLED",
      previousState: state,
      nextState: {
        route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: "THIRD_CONSECUTIVE_FAILURE" },
        failureLineage: lineage,
        appliedEventIds: appendEvent(state, event.eventId),
      },
      routeChanged: true,
    });
  }
  const regressedRung = previousRung(event.failedRung);
  return applied({
    config: policyConfig,
    reason: "RECOVERY_FAILURE_REGRESSED_ONE_RUNG",
    previousState: state,
    nextState: initialTargetScheduledState({
      rung: regressedRung,
      dueOn: policyConfig.dueDates.nextScheduledDueOn(event.occurredOn, regressedRung),
      failureLineage: lineage,
      regressionOrigin: event.failedRung,
      appliedEventIds: appendEvent(state, event.eventId),
    }),
    routeChanged: true,
    regressionOrigin: event.failedRung,
  });
}

export function requireAppliedTargetTransition(
  state: TargetReviewState,
  event: TargetReviewEvent,
  policyConfig: TargetReviewPolicyConfig = TARGET_REVIEW_POLICY_CONFIG,
): Extract<TargetTransitionDecision, { disposition: "APPLIED" }> {
  const decision = reduceTargetReviewTransition(state, event, policyConfig);
  if (decision.disposition === "REJECTED") {
    throw new Error(`target_review_transition_rejected:${decision.reason}`);
  }
  return decision;
}
