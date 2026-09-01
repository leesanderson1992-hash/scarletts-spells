import { addDays, type IsoDate } from "../review-scheduler";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewState,
} from "../review-policy/contracts";
import {
  TARGET_REVIEW_POLICY_CONFIG,
  reduceTargetReviewTransition,
  targetNoFailureLineage,
} from "../review-policy/target-regression-v1";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
  type FinalRungRetirementAuthorityState,
  type FinalRungRetirementDecision,
  type FinalRungRetirementEvent,
  type FinalRungRetirementPolicyConfig,
  type FinalRungRetirementTransitionReason,
  type RetirementAuthenticUseEvidence,
  type RetirementDecisionProvenance,
  type RetirementEligibility,
} from "./contracts";

export const FINAL_RUNG_RETIREMENT_POLICY_CONFIG: FinalRungRetirementPolicyConfig = {
  schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
  stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  retirementPolicyVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  retirementStateVersion: FINAL_RUNG_RETIREMENT_STATE_VERSION,
  preRetirementCheckGapDays: 112,
};

function validIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function exactEqual(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validConfig(config: FinalRungRetirementPolicyConfig): boolean {
  return config.schedulePolicyVersion === TARGET_REVIEW_POLICY_VERSION
    && config.stateShapeVersion === TARGET_PER_WORD_STATE_SHAPE_VERSION
    && config.retirementPolicyVersion === FINAL_RUNG_RETIREMENT_POLICY_VERSION
    && config.retirementStateVersion === FINAL_RUNG_RETIREMENT_STATE_VERSION
    && config.preRetirementCheckGapDays === 112;
}

function validSchedulerStateBoundary(state: TargetReviewState): boolean {
  return !!state && typeof state === "object"
    && !!state.route && typeof state.route === "object"
    && !!state.failureLineage && typeof state.failureLineage === "object"
    && Array.isArray(state.appliedEventIds)
    && state.appliedEventIds.every((id) => typeof id === "string" && id.length > 0)
    && new Set(state.appliedEventIds).size === state.appliedEventIds.length;
}

function validState(state: FinalRungRetirementAuthorityState): boolean {
  if (!state || typeof state !== "object"
    || !state.scheduleWordId || !state.childId || !state.canonicalWordId
    || !Number.isInteger(state.stateRevision) || state.stateRevision < 0
    || !validSchedulerStateBoundary(state.schedulerState)
    || !Array.isArray(state.appliedRetirementEventIds)
    || state.appliedRetirementEventIds.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(state.appliedRetirementEventIds).size !== state.appliedRetirementEventIds.length) return false;

  const lifecycle = state.retirementLifecycle;
  const route = state.schedulerState.route;
  if (lifecycle.status === "NOT_ENTERED") {
    return !["PRE_RETIREMENT_PRESERVED", "RETIRED_PRESERVED", "FINAL_RUNG_DELEGATED"].includes(route.membership);
  }
  if (lifecycle.status === "AWAITING_PRE_RETIREMENT_CHECK") {
    return validIsoDate(lifecycle.dueOn)
      && lifecycle.day56OutcomeEventId.length > 0
      && state.appliedRetirementEventIds.includes(lifecycle.day56OutcomeEventId)
      && state.schedulerState.appliedEventIds.includes(lifecycle.day56OutcomeEventId)
      && route.membership === "PRE_RETIREMENT_PRESERVED"
      && route.dueOn === lifecycle.dueOn
      && state.schedulerState.failureLineage.resolution === "NONE";
  }
  if (lifecycle.status === "POST_CHECK_RECOVERY") {
    const lineage = lifecycle.checkOutcomeLineage;
    return lineage.outcome === "fail"
      && lineage.outcomeEventId.length > 0
      && validIsoDate(lineage.occurredOn)
      && validIsoDate(lineage.governedDueOn)
      && state.appliedRetirementEventIds.includes(lineage.outcomeEventId)
      && state.schedulerState.appliedEventIds.includes(lineage.outcomeEventId)
      && !["PRE_RETIREMENT_PRESERVED", "RETIRED_PRESERVED", "FINAL_RUNG_DELEGATED"].includes(route.membership);
  }
  const lineage = lifecycle.checkOutcomeLineage;
  return validIsoDate(lifecycle.retiredOn)
    && lifecycle.retirementSourceOutcomeEventId.length > 0
    && state.appliedRetirementEventIds.includes(lifecycle.retirementSourceOutcomeEventId)
    && state.schedulerState.appliedEventIds.includes(lifecycle.retirementSourceOutcomeEventId)
    && route.membership === "RETIRED_PRESERVED"
    && state.schedulerState.failureLineage.resolution === "NONE"
    && (lineage === null || (
      lineage.outcomeEventId.length > 0
      && validIsoDate(lineage.occurredOn)
      && validIsoDate(lineage.governedDueOn)
      && state.appliedRetirementEventIds.includes(lineage.outcomeEventId)
      && state.schedulerState.appliedEventIds.includes(lineage.outcomeEventId)
    ))
    && (
      (lifecycle.basis === "QUALIFYING_AUTHENTIC_USE" && lineage === null)
      || (lifecycle.basis === "PRE_RETIREMENT_CHECK_PASS" && lineage?.outcome === "pass")
      || (lifecycle.basis === "POST_CHECK_FINAL_RUNG_PASS" && lineage?.outcome === "fail")
    );
}

export function isValidFinalRungRetirementAuthorityStateV1(
  state: FinalRungRetirementAuthorityState,
): boolean {
  return validState(state);
}

function validEvent(event: FinalRungRetirementEvent): boolean {
  if (!event || typeof event !== "object" || !Number.isInteger(event.expectedStateRevision)
    || event.expectedStateRevision < 0) return false;
  if (event.kind === "REPAIR") {
    return typeof event.eventId === "string" && event.eventId.length > 0
      && validIsoDate(event.occurredOn);
  }
  const source = event.source;
  if (!source || typeof source.reviewOutcomeEventId !== "string"
    || source.reviewOutcomeEventId.length === 0
    || typeof source.childId !== "string" || source.childId.length === 0
    || typeof source.canonicalWordId !== "string" || source.canonicalWordId.length === 0
    || !validIsoDate(source.occurredOn)) return false;
  if (event.kind === "PRE_RETIREMENT_CHECK") {
    return source.dueKind === "pre_retirement_check"
      && (source.outcome === "pass" || source.outcome === "fail");
  }
  return (source.dueKind === "scheduled_review" || source.dueKind === "next_day_recovery")
    && source.rung === "DAY_56"
    && source.outcome === "pass"
    && Array.isArray(event.authenticUseEvidence)
    && !!event.schedulerDecision && typeof event.schedulerDecision === "object";
}

function rejected(
  state: FinalRungRetirementAuthorityState,
  reason: Extract<FinalRungRetirementDecision, { disposition: "REJECTED" }>["reason"],
  detail?: string,
): FinalRungRetirementDecision {
  return { disposition: "REJECTED", reason, previousState: state, nextState: null, ...(detail ? { detail } : {}) };
}

function retirementSchedulerState(input: {
  from: TargetReviewState;
  membership: "PRE_RETIREMENT_PRESERVED" | "RETIRED_PRESERVED";
  dueOn?: IsoDate;
  sourceEventId: string;
}): TargetReviewState {
  return {
    route: input.membership === "PRE_RETIREMENT_PRESERVED"
      ? { membership: "PRE_RETIREMENT_PRESERVED", dueOn: input.dueOn! }
      : { membership: "RETIRED_PRESERVED" },
    failureLineage: targetNoFailureLineage(),
    appliedEventIds: input.from.appliedEventIds.includes(input.sourceEventId)
      ? input.from.appliedEventIds
      : [...input.from.appliedEventIds, input.sourceEventId],
  };
}

function evidenceConflict(evidence: readonly RetirementAuthenticUseEvidence[]): boolean {
  const byId = new Map<string, string>();
  for (const fact of evidence) {
    if (!fact || typeof fact.eventId !== "string" || fact.eventId.length === 0
      || typeof fact.childId !== "string" || typeof fact.canonicalWordId !== "string"
      || !validIsoDate(fact.occurredOn)
      || !["authentic_correct_use", "self_correction_in_writing"].includes(fact.useKind)
      || typeof fact.parentVerified !== "boolean"
      || !["independent_or_parent_verified_application", "prompted_review_writing_application"].includes(fact.provenanceKind)
      || typeof fact.rowStatus !== "string") return true;
    const normalized = canonical(fact);
    const previous = byId.get(fact.eventId);
    if (previous !== undefined) return true;
    byId.set(fact.eventId, normalized);
  }
  return false;
}

function retirementEligibility(input: {
  evidence: readonly RetirementAuthenticUseEvidence[];
  state: FinalRungRetirementAuthorityState;
  last28DayReviewOn: IsoDate;
  completedOn: IsoDate;
}): RetirementEligibility {
  const qualifying = input.evidence.filter((fact) =>
    fact.childId === input.state.childId
    && fact.canonicalWordId === input.state.canonicalWordId
    && fact.rowStatus === "active"
    && fact.parentVerified
    && fact.useKind === "authentic_correct_use"
    && fact.provenanceKind === "independent_or_parent_verified_application"
    && fact.occurredOn >= input.last28DayReviewOn
    && fact.occurredOn <= input.completedOn
  ).sort((left, right) => left.occurredOn.localeCompare(right.occurredOn)
    || left.eventId.localeCompare(right.eventId))[0];
  return qualifying
    ? { status: "QUALIFIED", qualifyingAuthenticUseEventId: qualifying.eventId }
    : { status: "NOT_QUALIFIED", qualifyingAuthenticUseEventId: null };
}

function provenance(input: {
  state: FinalRungRetirementAuthorityState;
  sourceEventId: string;
  qualifyingAuthenticUseEventId: string | null;
  checkOutcomeEventId: string | null;
}): RetirementDecisionProvenance {
  return {
    sourceReviewOutcomeEventId: input.sourceEventId,
    qualifyingAuthenticUseEventId: input.qualifyingAuthenticUseEventId,
    preRetirementCheckOutcomeEventId: input.checkOutcomeEventId,
    schedulePolicyVersion: input.state.schedulePolicyVersion,
    stateShapeVersion: input.state.stateShapeVersion,
    retirementPolicyVersion: input.state.retirementPolicyVersion,
    retirementStateVersion: input.state.retirementStateVersion,
    expectedStateRevision: input.state.stateRevision,
    appliedStateRevision: input.state.stateRevision + 1,
  };
}

function applied(input: {
  previousState: FinalRungRetirementAuthorityState;
  nextState: FinalRungRetirementAuthorityState;
  decision: Extract<FinalRungRetirementDecision, { disposition: "APPLIED" }>["decision"];
  reason: FinalRungRetirementTransitionReason;
  eligibility: RetirementEligibility;
  schedulerReducerDecision: Extract<FinalRungRetirementDecision, { disposition: "APPLIED" }>["schedulerReducerDecision"];
  returnsToC2B1Recovery: boolean;
  finalForCurrentScheduleEpisode: boolean;
  sourceEventId: string;
  checkOutcomeEventId: string | null;
}): FinalRungRetirementDecision {
  return {
    disposition: "APPLIED",
    decision: input.decision,
    reason: input.reason,
    eligibility: input.eligibility,
    previousState: input.previousState,
    nextState: input.nextState,
    schedulerReducerDecision: input.schedulerReducerDecision,
    returnsToC2B1Recovery: input.returnsToC2B1Recovery,
    finalForCurrentScheduleEpisode: input.finalForCurrentScheduleEpisode,
    requiredProvenance: provenance({
      state: input.previousState,
      sourceEventId: input.sourceEventId,
      qualifyingAuthenticUseEventId: input.eligibility.qualifyingAuthenticUseEventId,
      checkOutcomeEventId: input.checkOutcomeEventId,
    }),
  };
}

function validFinalDelegation(
  state: FinalRungRetirementAuthorityState,
  event: Extract<FinalRungRetirementEvent, { kind: "FINAL_RUNG_DELEGATION" }>,
): boolean {
  const decision = event.schedulerDecision;
  const replayedDecision = reduceTargetReviewTransition(
    state.schedulerState,
    event.source.dueKind === "next_day_recovery"
      ? {
          eventId: event.source.reviewOutcomeEventId,
          kind: "RECOVERY_CHECK",
          failedRung: "DAY_56",
          outcome: "pass",
          occurredOn: event.source.occurredOn,
        }
      : {
          eventId: event.source.reviewOutcomeEventId,
          kind: "SCHEDULED_CHECK",
          rung: "DAY_56",
          outcome: "pass",
          occurredOn: event.source.occurredOn,
        },
    TARGET_REVIEW_POLICY_CONFIG,
  );
  const routeMatchesDueKind = decision.previousState.route.membership === "SCHEDULED"
    ? decision.previousState.route.rung === "DAY_56" && event.source.dueKind === "scheduled_review"
    : decision.previousState.route.membership === "NEXT_DAY_RECOVERY"
      && decision.previousState.route.failedRung === "DAY_56"
      && event.source.dueKind === "next_day_recovery";
  return event.source.childId === state.childId
    && event.source.canonicalWordId === state.canonicalWordId
    && replayedDecision.disposition === "APPLIED"
    && exactEqual(replayedDecision, decision)
    && routeMatchesDueKind
    && decision.schedulePolicyVersion === TARGET_REVIEW_POLICY_VERSION
    && decision.reason === "DAY_56_PASS_DELEGATED"
    && decision.finalRungDelegated
    && exactEqual(decision.previousState, state.schedulerState)
    && decision.nextState.route.membership === "FINAL_RUNG_DELEGATED"
    && decision.nextState.route.completedRung === "DAY_56"
    && decision.nextState.route.completedOn === event.source.occurredOn
    && decision.nextState.appliedEventIds.at(-1) === event.source.reviewOutcomeEventId;
}

export function initialFinalRungRetirementAuthorityState(input: {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  stateRevision: number;
  schedulerState: TargetReviewState;
}): FinalRungRetirementAuthorityState {
  return {
    scheduleWordId: input.scheduleWordId,
    childId: input.childId,
    canonicalWordId: input.canonicalWordId,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    retirementPolicyVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
    retirementStateVersion: FINAL_RUNG_RETIREMENT_STATE_VERSION,
    stateRevision: input.stateRevision,
    schedulerState: input.schedulerState,
    retirementLifecycle: { status: "NOT_ENTERED" },
    appliedRetirementEventIds: [],
  };
}

export function reduceFinalRungRetirementV1(
  state: FinalRungRetirementAuthorityState,
  event: FinalRungRetirementEvent,
  config: FinalRungRetirementPolicyConfig = FINAL_RUNG_RETIREMENT_POLICY_CONFIG,
): FinalRungRetirementDecision {
  if (state.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION
    || config.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION) {
    return rejected(state, "SCHEDULER_POLICY_UNSUPPORTED");
  }
  if (state.retirementPolicyVersion !== FINAL_RUNG_RETIREMENT_POLICY_VERSION
    || config.retirementPolicyVersion !== FINAL_RUNG_RETIREMENT_POLICY_VERSION) {
    return rejected(state, "RETIREMENT_POLICY_UNSUPPORTED");
  }
  if (state.stateShapeVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION
    || config.stateShapeVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION) {
    return rejected(state, "STATE_SHAPE_UNSUPPORTED");
  }
  if (state.retirementStateVersion !== FINAL_RUNG_RETIREMENT_STATE_VERSION
    || config.retirementStateVersion !== FINAL_RUNG_RETIREMENT_STATE_VERSION) {
    return rejected(state, "RETIREMENT_STATE_SHAPE_UNSUPPORTED");
  }
  if (!validConfig(config)) return rejected(state, "POLICY_CONFIG_MALFORMED");
  if (!validState(state)) return rejected(state, "STATE_MALFORMED");
  if (!validEvent(event)) return rejected(state, "EVENT_MALFORMED");
  if (event.expectedStateRevision !== state.stateRevision) return rejected(state, "REVISION_CONFLICT");
  const sourceEventId = event.kind === "REPAIR" ? event.eventId : event.source.reviewOutcomeEventId;
  const occurredOn = event.kind === "REPAIR" ? event.occurredOn : event.source.occurredOn;
  if (!sourceEventId || !validIsoDate(occurredOn)) return rejected(state, "EVENT_MALFORMED");
  if (state.appliedRetirementEventIds.includes(sourceEventId)) return rejected(state, "DUPLICATE_EVENT");
  if (event.kind === "REPAIR") return rejected(state, "REPAIR_NOT_RETIREMENT_EVIDENCE");

  if (event.source.childId !== state.childId || event.source.canonicalWordId !== state.canonicalWordId) {
    return rejected(state, "EVENT_MALFORMED");
  }

  if (event.kind === "FINAL_RUNG_DELEGATION") {
    if (state.retirementLifecycle.status !== "NOT_ENTERED"
      && state.retirementLifecycle.status !== "POST_CHECK_RECOVERY") {
      return rejected(state, "EVENT_ROUTE_CONFLICT");
    }
    if (!validFinalDelegation(state, event)) return rejected(state, "DAY_56_DELEGATION_MALFORMED");
    if (evidenceConflict(event.authenticUseEvidence)) return rejected(state, "AUTHENTIC_EVIDENCE_CONFLICT");
    const retirementEvents = [...state.appliedRetirementEventIds, sourceEventId];
    if (state.retirementLifecycle.status === "POST_CHECK_RECOVERY") {
      if (event.authenticUseEvidence.length > 0 || event.last28DayReviewOn !== null) {
        return rejected(state, "AUTHENTIC_EVIDENCE_CONFLICT");
      }
      const nextState: FinalRungRetirementAuthorityState = {
        ...state,
        stateRevision: state.stateRevision + 1,
        schedulerState: retirementSchedulerState({
          from: event.schedulerDecision.nextState,
          membership: "RETIRED_PRESERVED",
          sourceEventId,
        }),
        retirementLifecycle: {
          status: "RETIRED",
          retiredOn: event.source.occurredOn,
          retirementSourceOutcomeEventId: sourceEventId,
          basis: "POST_CHECK_FINAL_RUNG_PASS",
          checkOutcomeLineage: state.retirementLifecycle.checkOutcomeLineage,
        },
        appliedRetirementEventIds: retirementEvents,
      };
      return applied({
        previousState: state,
        nextState,
        decision: "RETIRE",
        reason: "POST_CHECK_FINAL_RUNG_PASS_RETIRED",
        eligibility: { status: "NOT_APPLICABLE", qualifyingAuthenticUseEventId: null },
        schedulerReducerDecision: event.schedulerDecision,
        returnsToC2B1Recovery: false,
        finalForCurrentScheduleEpisode: true,
        sourceEventId,
        checkOutcomeEventId: state.retirementLifecycle.checkOutcomeLineage.outcomeEventId,
      });
    }

    if (event.last28DayReviewOn === null || !validIsoDate(event.last28DayReviewOn)
      || event.last28DayReviewOn > event.source.occurredOn) {
      return rejected(state, "DAY_28_LINEAGE_REQUIRED");
    }
    const eligibility = retirementEligibility({
      evidence: event.authenticUseEvidence,
      state,
      last28DayReviewOn: event.last28DayReviewOn,
      completedOn: event.source.occurredOn,
    });
    if (eligibility.status === "QUALIFIED") {
      const nextState: FinalRungRetirementAuthorityState = {
        ...state,
        stateRevision: state.stateRevision + 1,
        schedulerState: retirementSchedulerState({
          from: event.schedulerDecision.nextState,
          membership: "RETIRED_PRESERVED",
          sourceEventId,
        }),
        retirementLifecycle: {
          status: "RETIRED",
          retiredOn: event.source.occurredOn,
          retirementSourceOutcomeEventId: sourceEventId,
          basis: "QUALIFYING_AUTHENTIC_USE",
          checkOutcomeLineage: null,
        },
        appliedRetirementEventIds: retirementEvents,
      };
      return applied({
        previousState: state,
        nextState,
        decision: "RETIRE",
        reason: "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE",
        eligibility,
        schedulerReducerDecision: event.schedulerDecision,
        returnsToC2B1Recovery: false,
        finalForCurrentScheduleEpisode: true,
        sourceEventId,
        checkOutcomeEventId: null,
      });
    }
    const dueOn = addDays(event.source.occurredOn, config.preRetirementCheckGapDays);
    const nextState: FinalRungRetirementAuthorityState = {
      ...state,
      stateRevision: state.stateRevision + 1,
      schedulerState: retirementSchedulerState({
        from: event.schedulerDecision.nextState,
        membership: "PRE_RETIREMENT_PRESERVED",
        dueOn,
        sourceEventId,
      }),
      retirementLifecycle: {
        status: "AWAITING_PRE_RETIREMENT_CHECK",
        dueOn,
        day56OutcomeEventId: sourceEventId,
      },
      appliedRetirementEventIds: retirementEvents,
    };
    return applied({
      previousState: state,
      nextState,
      decision: "AWAIT_PRE_RETIREMENT_CHECK",
      reason: "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK",
      eligibility,
      schedulerReducerDecision: event.schedulerDecision,
      returnsToC2B1Recovery: false,
      finalForCurrentScheduleEpisode: false,
      sourceEventId,
      checkOutcomeEventId: null,
    });
  }

  if (state.retirementLifecycle.status !== "AWAITING_PRE_RETIREMENT_CHECK") {
    return rejected(state, "EVENT_ROUTE_CONFLICT");
  }
  if (event.source.dueKind !== "pre_retirement_check") return rejected(state, "EVENT_MALFORMED");
  if (event.source.occurredOn < state.retirementLifecycle.dueOn) {
    return rejected(state, "PRE_RETIREMENT_CHECK_NOT_DUE");
  }
  const checkLineage = {
    outcomeEventId: sourceEventId,
    outcome: event.source.outcome,
    occurredOn: event.source.occurredOn,
    governedDueOn: state.retirementLifecycle.dueOn,
  } as const;
  const retirementEvents = [...state.appliedRetirementEventIds, sourceEventId];
  if (event.source.outcome === "pass") {
    const nextState: FinalRungRetirementAuthorityState = {
      ...state,
      stateRevision: state.stateRevision + 1,
      schedulerState: retirementSchedulerState({
        from: state.schedulerState,
        membership: "RETIRED_PRESERVED",
        sourceEventId,
      }),
      retirementLifecycle: {
        status: "RETIRED",
        retiredOn: event.source.occurredOn,
        retirementSourceOutcomeEventId: sourceEventId,
        basis: "PRE_RETIREMENT_CHECK_PASS",
        checkOutcomeLineage: checkLineage,
      },
      appliedRetirementEventIds: retirementEvents,
    };
    return applied({
      previousState: state,
      nextState,
      decision: "RETIRE",
      reason: "PRE_RETIREMENT_CHECK_PASS_RETIRED",
      eligibility: { status: "NOT_APPLICABLE", qualifyingAuthenticUseEventId: null },
      schedulerReducerDecision: null,
      returnsToC2B1Recovery: false,
      finalForCurrentScheduleEpisode: true,
      sourceEventId,
      checkOutcomeEventId: sourceEventId,
    });
  }

  const reducerInput: TargetReviewState = {
    route: {
      membership: "SCHEDULED",
      rung: "DAY_56",
      dueOn: state.retirementLifecycle.dueOn,
      regressionOrigin: null,
    },
    failureLineage: targetNoFailureLineage(),
    appliedEventIds: state.schedulerState.appliedEventIds,
  };
  const schedulerDecision = reduceTargetReviewTransition(reducerInput, {
    eventId: sourceEventId,
    kind: "SCHEDULED_CHECK",
    rung: "DAY_56",
    outcome: "fail",
    occurredOn: event.source.occurredOn,
  }, TARGET_REVIEW_POLICY_CONFIG);
  if (schedulerDecision.disposition === "REJECTED") {
    return rejected(state, "SCHEDULER_TRANSITION_REJECTED", schedulerDecision.reason);
  }
  if (schedulerDecision.reason !== "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY"
    || schedulerDecision.nextState.route.membership !== "NEXT_DAY_RECOVERY"
    || schedulerDecision.nextState.route.failedRung !== "DAY_56") {
    return rejected(state, "PRE_RETIREMENT_CHECK_LINEAGE_CONFLICT");
  }
  const nextState: FinalRungRetirementAuthorityState = {
    ...state,
    stateRevision: state.stateRevision + 1,
    schedulerState: schedulerDecision.nextState,
    retirementLifecycle: {
      status: "POST_CHECK_RECOVERY",
      checkOutcomeLineage: { ...checkLineage, outcome: "fail" },
    },
    appliedRetirementEventIds: retirementEvents,
  };
  return applied({
    previousState: state,
    nextState,
    decision: "CONTINUE_V2_RECOVERY",
    reason: "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY",
    eligibility: { status: "NOT_APPLICABLE", qualifyingAuthenticUseEventId: null },
    schedulerReducerDecision: schedulerDecision,
    returnsToC2B1Recovery: true,
    finalForCurrentScheduleEpisode: false,
    sourceEventId,
    checkOutcomeEventId: sourceEventId,
  });
}
