import type { IsoDate } from "../review-scheduler";
import type {
  TargetReviewState,
  TargetTransitionDecision,
} from "../review-policy/contracts";

export const FINAL_RUNG_RETIREMENT_POLICY_VERSION = "ADLE_FINAL_RUNG_RETIREMENT_V1" as const;
export const FINAL_RUNG_RETIREMENT_STATE_VERSION = "adle_final_rung_retirement_v1" as const;

export type RetirementAuthenticUseEvidence = {
  eventId: string;
  childId: string;
  canonicalWordId: string;
  occurredOn: IsoDate;
  useKind: "authentic_correct_use" | "self_correction_in_writing";
  parentVerified: boolean;
  provenanceKind:
    | "independent_or_parent_verified_application"
    | "prompted_review_writing_application";
  rowStatus: string;
};

export type PreRetirementCheckOutcomeLineage = {
  outcomeEventId: string;
  outcome: "pass" | "fail";
  occurredOn: IsoDate;
  governedDueOn: IsoDate;
};

export type FinalRungRetirementLifecycle =
  | { status: "NOT_ENTERED" }
  | {
      status: "AWAITING_PRE_RETIREMENT_CHECK";
      dueOn: IsoDate;
      day56OutcomeEventId: string;
    }
  | {
      status: "POST_CHECK_RECOVERY";
      checkOutcomeLineage: PreRetirementCheckOutcomeLineage & { outcome: "fail" };
    }
  | {
      status: "RETIRED";
      retiredOn: IsoDate;
      retirementSourceOutcomeEventId: string;
      basis:
        | "QUALIFYING_AUTHENTIC_USE"
        | "PRE_RETIREMENT_CHECK_PASS"
        | "POST_CHECK_FINAL_RUNG_PASS";
      checkOutcomeLineage: PreRetirementCheckOutcomeLineage | null;
    };

/**
 * Scheduler route/failure state, retirement lifecycle, and check lineage are
 * separate. The state revision is shared because a single governed learner
 * outcome will later persist all affected dimensions atomically.
 */
export type FinalRungRetirementAuthorityState = {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  schedulePolicyVersion: string;
  stateShapeVersion: string;
  retirementPolicyVersion: string;
  retirementStateVersion: string;
  stateRevision: number;
  schedulerState: TargetReviewState;
  retirementLifecycle: FinalRungRetirementLifecycle;
  appliedRetirementEventIds: readonly string[];
};

export type FinalRungDelegationSource = {
  reviewOutcomeEventId: string;
  childId: string;
  canonicalWordId: string;
  dueKind: "scheduled_review" | "next_day_recovery";
  rung: "DAY_56";
  outcome: "pass";
  occurredOn: IsoDate;
};

export type PreRetirementCheckSource = {
  reviewOutcomeEventId: string;
  childId: string;
  canonicalWordId: string;
  dueKind: "pre_retirement_check";
  outcome: "pass" | "fail";
  occurredOn: IsoDate;
};

export type FinalRungRetirementEvent =
  | {
      kind: "FINAL_RUNG_DELEGATION";
      expectedStateRevision: number;
      source: FinalRungDelegationSource;
      schedulerDecision: Extract<TargetTransitionDecision, { disposition: "APPLIED" }>;
      last28DayReviewOn: IsoDate | null;
      authenticUseEvidence: readonly RetirementAuthenticUseEvidence[];
    }
  | {
      kind: "PRE_RETIREMENT_CHECK";
      expectedStateRevision: number;
      source: PreRetirementCheckSource;
    }
  | {
      kind: "REPAIR";
      eventId: string;
      occurredOn: IsoDate;
      expectedStateRevision: number;
    };

export type FinalRungRetirementPolicyConfig = {
  schedulePolicyVersion: string;
  stateShapeVersion: string;
  retirementPolicyVersion: string;
  retirementStateVersion: string;
  preRetirementCheckGapDays: number;
};

export type RetirementEligibility =
  | { status: "QUALIFIED"; qualifyingAuthenticUseEventId: string }
  | { status: "NOT_QUALIFIED"; qualifyingAuthenticUseEventId: null }
  | { status: "NOT_APPLICABLE"; qualifyingAuthenticUseEventId: null };

export type FinalRungRetirementDecisionKind =
  | "AWAIT_PRE_RETIREMENT_CHECK"
  | "CONTINUE_V2_RECOVERY"
  | "RETIRE";

export type FinalRungRetirementTransitionReason =
  | "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE"
  | "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK"
  | "PRE_RETIREMENT_CHECK_PASS_RETIRED"
  | "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY"
  | "POST_CHECK_FINAL_RUNG_PASS_RETIRED";

export type FinalRungRetirementRejectionReason =
  | "SCHEDULER_POLICY_UNSUPPORTED"
  | "RETIREMENT_POLICY_UNSUPPORTED"
  | "STATE_SHAPE_UNSUPPORTED"
  | "RETIREMENT_STATE_SHAPE_UNSUPPORTED"
  | "POLICY_CONFIG_MALFORMED"
  | "STATE_MALFORMED"
  | "EVENT_MALFORMED"
  | "REVISION_CONFLICT"
  | "DUPLICATE_EVENT"
  | "EVENT_ROUTE_CONFLICT"
  | "DAY_56_DELEGATION_MALFORMED"
  | "DAY_28_LINEAGE_REQUIRED"
  | "PRE_RETIREMENT_CHECK_NOT_DUE"
  | "PRE_RETIREMENT_CHECK_LINEAGE_CONFLICT"
  | "AUTHENTIC_EVIDENCE_CONFLICT"
  | "REPAIR_NOT_RETIREMENT_EVIDENCE"
  | "SCHEDULER_TRANSITION_REJECTED";

export type RetirementDecisionProvenance = {
  sourceReviewOutcomeEventId: string;
  qualifyingAuthenticUseEventId: string | null;
  preRetirementCheckOutcomeEventId: string | null;
  schedulePolicyVersion: string;
  stateShapeVersion: string;
  retirementPolicyVersion: string;
  retirementStateVersion: string;
  expectedStateRevision: number;
  appliedStateRevision: number;
};

export type FinalRungRetirementDecision =
  | {
      disposition: "APPLIED";
      decision: FinalRungRetirementDecisionKind;
      reason: FinalRungRetirementTransitionReason;
      eligibility: RetirementEligibility;
      previousState: FinalRungRetirementAuthorityState;
      nextState: FinalRungRetirementAuthorityState;
      schedulerReducerDecision: Extract<TargetTransitionDecision, { disposition: "APPLIED" }> | null;
      returnsToC2B1Recovery: boolean;
      finalForCurrentScheduleEpisode: boolean;
      requiredProvenance: RetirementDecisionProvenance;
    }
  | {
      disposition: "REJECTED";
      reason: FinalRungRetirementRejectionReason;
      previousState: FinalRungRetirementAuthorityState;
      nextState: null;
      detail?: string;
    };

export type PostCheckSchedulerOrchestrationDecision =
  | {
      disposition: "APPLIED";
      reason: "POST_CHECK_SCHEDULER_TRANSITION_PRESERVED" | "POST_CHECK_FINAL_RUNG_RETIRED";
      previousState: FinalRungRetirementAuthorityState;
      nextState: FinalRungRetirementAuthorityState;
      schedulerReducerDecision: Extract<TargetTransitionDecision, { disposition: "APPLIED" }>;
      retirementDecision: Extract<FinalRungRetirementDecision, { disposition: "APPLIED" }> | null;
      checkOutcomeLineagePreserved: true;
    }
  | {
      disposition: "REJECTED";
      reason: FinalRungRetirementRejectionReason;
      previousState: FinalRungRetirementAuthorityState;
      nextState: null;
      detail?: string;
    };
