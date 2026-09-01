import type { IsoDate } from "../review-scheduler";

export const CURRENT_REVIEW_POLICY_VERSION = "review_policy_v1_2026-07-04" as const;
export const TARGET_REVIEW_POLICY_VERSION = "ADLE_SPACED_REVIEW_REGRESSION_V1" as const;
export const CONTROLLED_GRADUATION_POLICY_VERSION = "ADLE_CONTROLLED_GRADUATION_V1_OR" as const;
export const CURRENT_PER_WORD_STATE_SHAPE_VERSION = "adle_review_per_word_schedule_v1" as const;
export const TARGET_PER_WORD_STATE_SHAPE_VERSION = "adle_review_per_word_schedule_v2" as const;
export const LEGACY_BUNDLE_STATE_SHAPE_VERSION = "legacy_bundle" as const;

export type PureReviewStateShapeVersion =
  | typeof CURRENT_PER_WORD_STATE_SHAPE_VERSION
  | typeof TARGET_PER_WORD_STATE_SHAPE_VERSION
  | typeof LEGACY_BUNDLE_STATE_SHAPE_VERSION;

export const ADLE_REVIEW_DUE_ANCHOR_V1 = "ADLE_REVIEW_DUE_ANCHOR_V1" as const;
export const ROLLING_FROM_COMPLETION = "ROLLING_FROM_COMPLETION" as const;

export const REVIEW_RUNGS = [
  "DAY_1",
  "DAY_3",
  "DAY_7",
  "DAY_14",
  "DAY_28",
  "DAY_56",
] as const;

export type ReviewRung = (typeof REVIEW_RUNGS)[number];
export type PostDayOneReviewRung = Exclude<ReviewRung, "DAY_1">;
export type SchedulerCheckOutcome = "pass" | "fail";

export type ScheduledDueDatePolicy = {
  /** Versioned date authority. Runtime V1 uses ADLE_REVIEW_DUE_ANCHOR_V1. */
  dueAnchorVersion: string;
  /** Runtime V1 uses ROLLING_FROM_COMPLETION; simulations may name a counterfactual. */
  dueAnchorKind: string;
  nextScheduledDueOn(completedOn: IsoDate, rung: ReviewRung): IsoDate;
};

export type TargetReviewPolicyConfig = {
  schedulePolicyVersion: typeof TARGET_REVIEW_POLICY_VERSION;
  rungGapDays: Readonly<Record<ReviewRung, number>>;
  recoveryDelayDays: 1;
  dueDates: ScheduledDueDatePolicy;
};

/**
 * The current route and the failure lineage are deliberately independent.
 *
 * A word in CONTROLLED_REACQUISITION has left the active Review recovery
 * route, but can still carry UNRESOLVED lineage explaining why it got there.
 * Controlled practice and repair do not erase that lineage. A later governed
 * independent Review success resolves it.
 */
export type TargetFailureLineage =
  | {
      resolution: "NONE";
      episodeId: null;
      consecutiveIndependentFailures: 0;
    }
  | {
      resolution: "UNRESOLVED";
      episodeId: string;
      consecutiveIndependentFailures: number;
    };

export type TargetReviewRoute =
  | {
      membership: "SCHEDULED";
      rung: ReviewRung;
      dueOn: IsoDate;
      regressionOrigin: ReviewRung | null;
    }
  | {
      membership: "NEXT_DAY_RECOVERY";
      failedRung: PostDayOneReviewRung;
      dueOn: IsoDate;
    }
  | {
      membership: "CONTROLLED_REACQUISITION";
      requiredBecause: "NOT_YET_PASSED" | "DAY_1_FAILURE" | "THIRD_CONSECUTIVE_FAILURE";
    }
  | {
      membership: "FINAL_RUNG_DELEGATED";
      completedRung: "DAY_56";
      completedOn: IsoDate;
    }
  | {
      membership: "PRE_RETIREMENT_PRESERVED";
      dueOn: IsoDate;
    }
  | {
      membership: "RETIRED_PRESERVED";
    };

export type TargetReviewState = {
  route: TargetReviewRoute;
  failureLineage: TargetFailureLineage;
  appliedEventIds: readonly string[];
};

export type TargetReviewEvent =
  | {
      eventId: string;
      kind: "CONTROLLED_PASS";
      occurredOn: IsoDate;
    }
  | {
      eventId: string;
      kind: "SCHEDULED_CHECK";
      rung: ReviewRung;
      outcome: SchedulerCheckOutcome;
      occurredOn: IsoDate;
    }
  | {
      eventId: string;
      kind: "RECOVERY_CHECK";
      failedRung: PostDayOneReviewRung;
      outcome: SchedulerCheckOutcome;
      occurredOn: IsoDate;
    }
  | {
      eventId: string;
      kind: "REPAIR";
      occurredOn: IsoDate;
    };

export type TargetTransitionReason =
  | "CONTROLLED_PASS_TO_DAY_1"
  | "REPAIR_RECORDED_NO_ROUTE_CHANGE"
  | "SCHEDULED_PASS_ADVANCED"
  | "DAY_1_FAILURE_TO_CONTROLLED"
  | "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY"
  | "RECOVERY_PASS_ADVANCED"
  | "RECOVERY_FAILURE_REGRESSED_ONE_RUNG"
  | "THIRD_CONSECUTIVE_FAILURE_TO_CONTROLLED"
  | "DAY_56_PASS_DELEGATED";

export type TargetTransitionRejectionReason =
  | "POLICY_VERSION_UNSUPPORTED"
  | "POLICY_CONFIG_MALFORMED"
  | "STATE_MALFORMED"
  | "EVENT_MALFORMED"
  | "DUPLICATE_EVENT"
  | "EVENT_ROUTE_CONFLICT"
  | "EVENT_BEFORE_DUE";

export type TargetTransitionDecision =
  | {
      disposition: "APPLIED";
      schedulePolicyVersion: typeof TARGET_REVIEW_POLICY_VERSION;
      dueAnchorVersion: string;
      reason: TargetTransitionReason;
      previousState: TargetReviewState;
      nextState: TargetReviewState;
      routeChanged: boolean;
      sequenceReset: boolean;
      regressionOrigin: ReviewRung | null;
      finalRungDelegated: boolean;
    }
  | {
      disposition: "REJECTED";
      schedulePolicyVersion: string;
      reason: TargetTransitionRejectionReason;
      previousState: TargetReviewState;
      nextState: null;
    };
