import {
  CONTROLLED_GRADUATION_POLICY_VERSION as SHARED_CONTROLLED_GRADUATION_POLICY_VERSION,
  REVIEW_RUNGS as SHARED_REVIEW_RUNGS,
  TARGET_REVIEW_POLICY_VERSION,
  type ReviewRung as SharedReviewRung,
  type SchedulerCheckOutcome as SharedSchedulerCheckOutcome,
  type TargetReviewEvent,
  type TargetReviewState,
} from "../../review-policy/contracts";

export const SCHEDULER_SIMULATION_VERSION =
  "ADLE_WORD_PROGRESSION_SIMULATION_V1" as const;

export const SCHEDULER_TARGET_POLICY_VERSION =
  TARGET_REVIEW_POLICY_VERSION;

export const CONTROLLED_GRADUATION_POLICY_VERSION =
  SHARED_CONTROLLED_GRADUATION_POLICY_VERSION;

export const REVIEW_RUNGS = SHARED_REVIEW_RUNGS;

export type ReviewRung = SharedReviewRung;
export type SchedulerCheckOutcome = SharedSchedulerCheckOutcome;

export type ControlledOpportunity = "COVER_WRITE" | "SENTENCE_DICTATION";

export type ControlledAttemptFact = {
  eventId: string;
  learnerId: string;
  canonicalWordId: string;
  controlledCycleId: string;
  opportunity: ControlledOpportunity;
  outcome: SchedulerCheckOutcome;
  occurredOn: string;
};

export type ControlledGraduationDecision = {
  decisionId: string;
  learnerId: string;
  canonicalWordId: string;
  controlledCycleId: string;
  disposition: "ADMITTED" | "BLOCKED" | "AMBIGUOUS";
  reason:
    | "CONTROLLED_OR_PASS"
    | "CONTROLLED_BOTH_FAILED"
    | "CONTROLLED_OPPORTUNITY_MISSING"
    | "CONTROLLED_OPPORTUNITY_DUPLICATED"
    | "CONTROLLED_FACT_CONFLICT";
  controlledPass: boolean | null;
  coverWriteEventId: string | null;
  sentenceDictationEventId: string | null;
  completedOn: string | null;
};

export type SchedulerRouteState = TargetReviewState;
export type SchedulerSimulationEvent = TargetReviewEvent;

export type SchedulerDueDateScenario = {
  scenarioVersion: string;
  nextScheduledDueOn(completedOn: string, rung: ReviewRung): string;
};

export type CurrentRouteFact = {
  scheduleWordId: string;
  learnerId: string;
  canonicalWordId: string;
  membershipStatus:
    | "scheduled"
    | "catch_up"
    | "ejected_pending_reteach"
    | "paused_parent_review"
    | "awaiting_pre_retirement_check"
    | "retired";
  catchUpStage: number;
  effectiveIntervalIndex: number | null;
  effectiveDueOn: string | null;
  failedReviewOn: string | null;
  preRetirementCheckDueOn: string | null;
  rowStatus: string;
  scheduleAuthority: "PER_WORD_V1" | "LEGACY_BUNDLE" | "CONFLICTING";
  currentPolicyVersion: string | null;
  currentPolicyLadderCompatible: boolean;
  reconstructedConsecutiveFailures: number | null;
};

export type RouteMigrationDecision = {
  scheduleWordId: string;
  disposition: "ADMITTED" | "BLOCKED" | "REQUIRES_POLICY_DECISION" | "EXCLUDED";
  reason:
    | "DIRECT_RUNG_MAPPING"
    | "FIRST_CATCH_UP_MAPS_TO_RECOVERY"
    | "DAY_1_CATCH_UP_MAPS_TO_CONTROLLED_REACQUISITION"
    | "SECOND_CATCH_UP_HAS_NO_TARGET_EQUIVALENT"
    | "EJECTED_MAPS_TO_CONTROLLED_REACQUISITION"
    | "PAUSED_PARENT_REQUIRES_RELEASE_DECISION"
    | "PRE_RETIREMENT_PRESERVED_SEPARATELY"
    | "RETIRED_PRESERVED_SEPARATELY"
    | "SCHEDULE_AUTHORITY_CONFLICT"
    | "CURRENT_POLICY_LADDER_UNSUPPORTED"
    | "RUNG_INDEX_UNSUPPORTED"
    | "FAILURE_EPISODE_UNRECONSTRUCTABLE"
    | "INACTIVE_ROW";
  targetState: SchedulerRouteState | null;
};

export type SchedulerSimulationReconciliation = {
  simulationVersion: typeof SCHEDULER_SIMULATION_VERSION;
  dueDateScenarioVersion: string;
  sourceFingerprint: string;
  controlledDecisionFingerprint: string;
  routeMigrationFingerprint: string;
  queueFingerprint: string;
  controlledAttemptCount: number;
  controlledCycleCount: number;
  controlledPassCount: number;
  controlledNotPassedCount: number;
  controlledBothCorrectCount: number;
  controlledCoverOnlyCorrectCount: number;
  controlledDictationOnlyCorrectCount: number;
  controlledBothWrongCount: number;
  controlledBlockedCount: number;
  controlledAmbiguousCount: number;
  currentRouteRowCount: number;
  currentRouteAuthorityCounts: Record<CurrentRouteFact["scheduleAuthority"], number>;
  currentMembershipCounts: Record<CurrentRouteFact["membershipStatus"], number>;
  targetModeCounts: Record<string, number>;
  admittedRouteCount: number;
  blockedRouteCount: number;
  policyDecisionRouteCount: number;
  excludedRouteCount: number;
  currentDueCount: number;
  targetMappedDueCount: number;
  sessionCap: number;
  currentDueLearnerCount: number;
  targetDueLearnerCount: number;
  currentOverCapLearnerCount: number;
  targetOverCapLearnerCount: number;
  currentDeferredByCapCount: number;
  targetDeferredByCapCount: number;
  currentMaximumLearnerQueue: number;
  targetMaximumLearnerQueue: number;
  hypotheticalPassBranchCounts: Record<string, number>;
  hypotheticalFailBranchCounts: Record<string, number>;
  storageImpact: {
    existingPerWordRungUsable: boolean;
    existingPolicyVersionUsableForCoexistence: boolean;
    consecutiveFailureStateStored: boolean;
    targetEventVocabularyStored: boolean;
    currentSecondCatchUpCompatible: boolean;
    migrationRequiredForImplementation: boolean;
  };
};

export type SchedulerSimulationResult = {
  controlledDecisions: ControlledGraduationDecision[];
  routeDecisions: RouteMigrationDecision[];
  reconciliation: SchedulerSimulationReconciliation;
};
