import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewEvent,
  type TargetReviewState,
  type TargetTransitionDecision,
} from "../lib/adle/review-policy/contracts";
import {
  initialTargetScheduledState,
  reduceTargetReviewTransition,
} from "../lib/adle/review-policy/target-regression-v1";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
  type FinalRungRetirementAuthorityState,
  type FinalRungRetirementDecision,
  type FinalRungRetirementEvent,
  type PostCheckSchedulerOrchestrationDecision,
  type RetirementAuthenticUseEvidence,
} from "../lib/adle/review-retirement/contracts";
import {
  FINAL_RUNG_RETIREMENT_POLICY_CONFIG,
  initialFinalRungRetirementAuthorityState,
  reduceFinalRungRetirementV1,
} from "../lib/adle/review-retirement/final-rung-retirement-v1";
import { orchestratePostCheckTargetReviewTransitionV1 } from "../lib/adle/review-retirement/target-retirement-orchestrator";

type AppliedTarget = Extract<TargetTransitionDecision, { disposition: "APPLIED" }>;
type AppliedRetirement = Extract<FinalRungRetirementDecision, { disposition: "APPLIED" }>;
type AppliedOrchestration = Extract<PostCheckSchedulerOrchestrationDecision, { disposition: "APPLIED" }>;

const matrix: Array<{ caseId: string; result: unknown }> = [];

function record<T>(caseId: string, result: T): T {
  matrix.push({ caseId, result });
  return result;
}

function targetApplied(decision: TargetTransitionDecision): AppliedTarget {
  assert.equal(decision.disposition, "APPLIED");
  return decision as AppliedTarget;
}

function retirementApplied(decision: FinalRungRetirementDecision): AppliedRetirement {
  assert.equal(decision.disposition, "APPLIED");
  return decision as AppliedRetirement;
}

function orchestrationApplied(decision: PostCheckSchedulerOrchestrationDecision): AppliedOrchestration {
  assert.equal(decision.disposition, "APPLIED");
  return decision as AppliedOrchestration;
}

function rejected(
  caseId: string,
  decision: FinalRungRetirementDecision | PostCheckSchedulerOrchestrationDecision,
  expected: Extract<FinalRungRetirementDecision, { disposition: "REJECTED" }>["reason"],
): void {
  record(caseId, decision);
  assert.equal(decision.disposition, "REJECTED");
  assert.equal(decision.reason, expected);
}

function day56State(input: { revision?: number; dueOn?: string; recovery?: boolean } = {}): FinalRungRetirementAuthorityState {
  const dueOn = input.dueOn ?? "2026-01-10";
  const schedulerState: TargetReviewState = input.recovery
    ? {
        route: { membership: "NEXT_DAY_RECOVERY", failedRung: "DAY_56", dueOn },
        failureLineage: {
          resolution: "UNRESOLVED",
          episodeId: "prior-day56-failure",
          consecutiveIndependentFailures: 1,
        },
        appliedEventIds: ["prior-day56-failure"],
      }
    : initialTargetScheduledState({ rung: "DAY_56", dueOn });
  return initialFinalRungRetirementAuthorityState({
    scheduleWordId: "schedule-word-1",
    childId: "child-1",
    canonicalWordId: "word-1",
    stateRevision: input.revision ?? 7,
    schedulerState,
  });
}

function authentic(overrides: Partial<RetirementAuthenticUseEvidence> = {}): RetirementAuthenticUseEvidence {
  return {
    eventId: "authentic-1",
    childId: "child-1",
    canonicalWordId: "word-1",
    occurredOn: "2025-12-20",
    useKind: "authentic_correct_use",
    parentVerified: true,
    provenanceKind: "independent_or_parent_verified_application",
    rowStatus: "active",
    ...overrides,
  };
}

function delegated(input: {
  state: FinalRungRetirementAuthorityState;
  eventId?: string;
  occurredOn?: string;
  last28DayReviewOn?: string | null;
  evidence?: readonly RetirementAuthenticUseEvidence[];
  targetDecision?: AppliedTarget;
}): FinalRungRetirementEvent {
  const eventId = input.eventId ?? "day56-pass-1";
  const occurredOn = input.occurredOn ?? "2026-01-10";
  const route = input.state.schedulerState.route;
  const targetEvent: TargetReviewEvent = route.membership === "NEXT_DAY_RECOVERY"
    ? { eventId, kind: "RECOVERY_CHECK", failedRung: "DAY_56", outcome: "pass", occurredOn }
    : { eventId, kind: "SCHEDULED_CHECK", rung: "DAY_56", outcome: "pass", occurredOn };
  const schedulerDecision = input.targetDecision ?? targetApplied(
    reduceTargetReviewTransition(input.state.schedulerState, targetEvent),
  );
  return {
    kind: "FINAL_RUNG_DELEGATION",
    expectedStateRevision: input.state.stateRevision,
    source: {
      reviewOutcomeEventId: eventId,
      childId: input.state.childId,
      canonicalWordId: input.state.canonicalWordId,
      dueKind: route.membership === "NEXT_DAY_RECOVERY" ? "next_day_recovery" : "scheduled_review",
      rung: "DAY_56",
      outcome: "pass",
      occurredOn,
    },
    schedulerDecision,
    last28DayReviewOn: input.last28DayReviewOn === undefined ? "2025-12-13" : input.last28DayReviewOn,
    authenticUseEvidence: input.evidence ?? [],
  };
}

function checkEvent(input: {
  state: FinalRungRetirementAuthorityState;
  eventId?: string;
  outcome: "pass" | "fail";
  occurredOn?: string;
}): FinalRungRetirementEvent {
  assert.equal(input.state.retirementLifecycle.status, "AWAITING_PRE_RETIREMENT_CHECK");
  return {
    kind: "PRE_RETIREMENT_CHECK",
    expectedStateRevision: input.state.stateRevision,
    source: {
      reviewOutcomeEventId: input.eventId ?? `retirement-check-${input.outcome}`,
      childId: input.state.childId,
      canonicalWordId: input.state.canonicalWordId,
      dueKind: "pre_retirement_check",
      outcome: input.outcome,
      occurredOn: input.occurredOn ?? input.state.retirementLifecycle.dueOn,
    },
  };
}

// Day-56 entry is an exact C2B.1 delegation, never a second ladder table.
const initial = day56State();
const day56Decision = targetApplied(reduceTargetReviewTransition(initial.schedulerState, {
  eventId: "day56-boundary",
  kind: "SCHEDULED_CHECK",
  rung: "DAY_56",
  outcome: "pass",
  occurredOn: "2026-01-10",
}));
assert.equal(day56Decision.reason, "DAY_56_PASS_DELEGATED");
assert.equal(day56Decision.nextState.route.membership, "FINAL_RUNG_DELEGATED");
record("day56-delegates", day56Decision);

// Qualifying authentic use retires. Selection is earliest occurred date then ID.
const authenticRetirement = retirementApplied(reduceFinalRungRetirementV1(initial, delegated({
  state: initial,
  eventId: "day56-authentic",
  evidence: [
    authentic({ eventId: "authentic-later", occurredOn: "2025-12-25" }),
    authentic({ eventId: "authentic-b", occurredOn: "2025-12-20" }),
    authentic({ eventId: "authentic-a", occurredOn: "2025-12-20" }),
  ],
})));
record("day56-authentic-retirement", authenticRetirement);
assert.equal(authenticRetirement.decision, "RETIRE");
assert.equal(authenticRetirement.reason, "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE");
assert.equal(authenticRetirement.eligibility.status, "QUALIFIED");
assert.equal(authenticRetirement.requiredProvenance.qualifyingAuthenticUseEventId, "authentic-a");
assert.equal(authenticRetirement.nextState.schedulerState.route.membership, "RETIRED_PRESERVED");
assert.equal(authenticRetirement.finalForCurrentScheduleEpisode, true);
assert.equal(authenticRetirement.requiredProvenance.appliedStateRevision, 8);

// Every non-qualifying authentic evidence class routes to one governed check.
const nonQualifyingEvidence: RetirementAuthenticUseEvidence[] = [
  authentic({ eventId: "prompted", provenanceKind: "prompted_review_writing_application" }),
  authentic({ eventId: "unverified", parentVerified: false }),
  authentic({ eventId: "rejected", rowStatus: "rejected" }),
  authentic({ eventId: "self-correction", useKind: "self_correction_in_writing" }),
  authentic({ eventId: "wrong-child", childId: "child-2" }),
  authentic({ eventId: "wrong-word", canonicalWordId: "word-2" }),
  authentic({ eventId: "before-day28", occurredOn: "2025-12-12" }),
  authentic({ eventId: "after-day56", occurredOn: "2026-01-11" }),
];
const awaiting = retirementApplied(reduceFinalRungRetirementV1(initial, delegated({
  state: initial,
  eventId: "day56-no-authentic",
  evidence: nonQualifyingEvidence,
})));
record("day56-awaiting-check", awaiting);
assert.equal(awaiting.decision, "AWAIT_PRE_RETIREMENT_CHECK");
assert.equal(awaiting.reason, "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK");
assert.equal(awaiting.eligibility.status, "NOT_QUALIFIED");
assert.equal(awaiting.nextState.retirementLifecycle.status, "AWAITING_PRE_RETIREMENT_CHECK");
if (awaiting.nextState.retirementLifecycle.status === "AWAITING_PRE_RETIREMENT_CHECK") {
  assert.equal(awaiting.nextState.retirementLifecycle.dueOn, "2026-05-02");
}

// The governed check pass retires with exact check lineage.
const checkPass = retirementApplied(reduceFinalRungRetirementV1(
  awaiting.nextState,
  checkEvent({ state: awaiting.nextState, eventId: "check-pass", outcome: "pass" }),
));
record("check-pass-retires", checkPass);
assert.equal(checkPass.reason, "PRE_RETIREMENT_CHECK_PASS_RETIRED");
assert.equal(checkPass.requiredProvenance.preRetirementCheckOutcomeEventId, "check-pass");
assert.equal(checkPass.nextState.retirementLifecycle.status, "RETIRED");

// The governed check failure calls C2B.1 and returns its exact Day-56 recovery.
const checkFail = retirementApplied(reduceFinalRungRetirementV1(
  awaiting.nextState,
  checkEvent({ state: awaiting.nextState, eventId: "check-fail", outcome: "fail" }),
));
record("check-fail-to-c2b1-recovery", checkFail);
assert.equal(checkFail.decision, "CONTINUE_V2_RECOVERY");
assert.equal(checkFail.returnsToC2B1Recovery, true);
assert.equal(checkFail.schedulerReducerDecision?.reason, "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY");
assert.equal(checkFail.nextState.schedulerState.route.membership, "NEXT_DAY_RECOVERY");
if (checkFail.nextState.schedulerState.route.membership === "NEXT_DAY_RECOVERY") {
  assert.equal(checkFail.nextState.schedulerState.route.failedRung, "DAY_56");
  assert.equal(checkFail.nextState.schedulerState.route.dueOn, "2026-05-03");
}
assert.equal(checkFail.nextState.retirementLifecycle.status, "POST_CHECK_RECOVERY");
if (checkFail.nextState.retirementLifecycle.status === "POST_CHECK_RECOVERY") {
  assert.equal(checkFail.nextState.retirementLifecycle.checkOutcomeLineage.outcomeEventId, "check-fail");
}

// Recovery pass reaches the existing delegation, then retires without another check.
const recoveryPass = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: checkFail.nextState,
  expectedStateRevision: checkFail.nextState.stateRevision,
  event: {
    eventId: "post-check-recovery-pass",
    kind: "RECOVERY_CHECK",
    failedRung: "DAY_56",
    outcome: "pass",
    occurredOn: "2026-05-03",
  },
}));
record("post-check-recovery-pass-retires", recoveryPass);
assert.equal(recoveryPass.schedulerReducerDecision.reason, "DAY_56_PASS_DELEGATED");
assert.equal(recoveryPass.reason, "POST_CHECK_FINAL_RUNG_RETIRED");
assert.equal(recoveryPass.retirementDecision?.reason, "POST_CHECK_FINAL_RUNG_PASS_RETIRED");
assert.equal(recoveryPass.nextState.retirementLifecycle.status, "RETIRED");
assert.equal(recoveryPass.nextState.stateRevision, checkFail.nextState.stateRevision + 1);

// Recovery failure regresses through C2B.1, retaining check lineage. A later
// rebuild to Day 56 retires without another 112-day wait or authentic evidence.
const recoveryFail = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: checkFail.nextState,
  expectedStateRevision: checkFail.nextState.stateRevision,
  event: {
    eventId: "post-check-recovery-fail",
    kind: "RECOVERY_CHECK",
    failedRung: "DAY_56",
    outcome: "fail",
    occurredOn: "2026-05-03",
  },
}));
record("post-check-recovery-fail-regresses", recoveryFail);
assert.equal(recoveryFail.schedulerReducerDecision.reason, "RECOVERY_FAILURE_REGRESSED_ONE_RUNG");
assert.equal(recoveryFail.nextState.schedulerState.route.membership, "SCHEDULED");
if (recoveryFail.nextState.schedulerState.route.membership === "SCHEDULED") {
  assert.equal(recoveryFail.nextState.schedulerState.route.rung, "DAY_28");
  assert.equal(recoveryFail.nextState.schedulerState.route.dueOn, "2026-05-31");
}
assert.deepEqual(recoveryFail.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

const day28RebuildPass = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: recoveryFail.nextState,
  expectedStateRevision: recoveryFail.nextState.stateRevision,
  event: {
    eventId: "post-check-day28-pass",
    kind: "SCHEDULED_CHECK",
    rung: "DAY_28",
    outcome: "pass",
    occurredOn: "2026-05-31",
  },
}));
record("post-check-day28-rebuild", day28RebuildPass);
assert.equal(day28RebuildPass.nextState.schedulerState.route.membership, "SCHEDULED");
if (day28RebuildPass.nextState.schedulerState.route.membership === "SCHEDULED") {
  assert.equal(day28RebuildPass.nextState.schedulerState.route.rung, "DAY_56");
  assert.equal(day28RebuildPass.nextState.schedulerState.route.dueOn, "2026-07-26");
}
assert.deepEqual(day28RebuildPass.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

const rebuiltDay56Pass = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: day28RebuildPass.nextState,
  expectedStateRevision: day28RebuildPass.nextState.stateRevision,
  event: {
    eventId: "post-check-rebuilt-day56-pass",
    kind: "SCHEDULED_CHECK",
    rung: "DAY_56",
    outcome: "pass",
    occurredOn: "2026-07-26",
  },
}));
record("post-check-rebuilt-day56-retires", rebuiltDay56Pass);
assert.equal(rebuiltDay56Pass.nextState.retirementLifecycle.status, "RETIRED");
assert.equal(rebuiltDay56Pass.retirementDecision?.eligibility.status, "NOT_APPLICABLE");

// Third failure and controlled re-entry retain check lineage; repair is a
// scheduler no-op and cannot become retirement evidence.
const thirdFailure = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: recoveryFail.nextState,
  expectedStateRevision: recoveryFail.nextState.stateRevision,
  event: {
    eventId: "post-check-third-failure",
    kind: "SCHEDULED_CHECK",
    rung: "DAY_28",
    outcome: "fail",
    occurredOn: "2026-05-31",
  },
}));
record("post-check-third-failure-controlled", thirdFailure);
assert.equal(thirdFailure.schedulerReducerDecision.reason, "THIRD_CONSECUTIVE_FAILURE_TO_CONTROLLED");
assert.equal(thirdFailure.nextState.schedulerState.route.membership, "CONTROLLED_REACQUISITION");
assert.deepEqual(thirdFailure.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

const repairPreserved = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: thirdFailure.nextState,
  expectedStateRevision: thirdFailure.nextState.stateRevision,
  event: { eventId: "repair-only", kind: "REPAIR", occurredOn: "2026-06-01" },
}));
record("post-check-repair-preserves", repairPreserved);
assert.equal(repairPreserved.schedulerReducerDecision.reason, "REPAIR_RECORDED_NO_ROUTE_CHANGE");
assert.equal(repairPreserved.retirementDecision, null);
assert.deepEqual(repairPreserved.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

const controlledPass = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: repairPreserved.nextState,
  expectedStateRevision: repairPreserved.nextState.stateRevision,
  event: { eventId: "controlled-pass", kind: "CONTROLLED_PASS", occurredOn: "2026-06-02" },
}));
record("post-check-controlled-pass-preserves", controlledPass);
assert.equal(controlledPass.nextState.schedulerState.route.membership, "SCHEDULED");
if (controlledPass.nextState.schedulerState.route.membership === "SCHEDULED") {
  assert.equal(controlledPass.nextState.schedulerState.route.rung, "DAY_1");
}
assert.deepEqual(controlledPass.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

const day1Reset = orchestrationApplied(orchestratePostCheckTargetReviewTransitionV1({
  state: controlledPass.nextState,
  expectedStateRevision: controlledPass.nextState.stateRevision,
  event: {
    eventId: "post-check-day1-pass",
    kind: "SCHEDULED_CHECK",
    rung: "DAY_1",
    outcome: "pass",
    occurredOn: "2026-06-03",
  },
}));
record("post-check-day1-sequence-reset", day1Reset);
assert.equal(day1Reset.nextState.schedulerState.failureLineage.resolution, "NONE");
assert.deepEqual(day1Reset.nextState.retirementLifecycle, checkFail.nextState.retirementLifecycle);

// Recovery-origin Day-56 delegation is also admitted before the one-check gate.
const initialRecovery = day56State({ recovery: true, dueOn: "2026-01-10" });
const recoveryOriginAwaiting = retirementApplied(reduceFinalRungRetirementV1(
  initialRecovery,
  delegated({ state: initialRecovery, eventId: "initial-recovery-day56-pass" }),
));
record("initial-day56-recovery-delegates", recoveryOriginAwaiting);
assert.equal(recoveryOriginAwaiting.decision, "AWAIT_PRE_RETIREMENT_CHECK");

// Fail-closed matrix.
rejected("repair-direct-rejected", reduceFinalRungRetirementV1(initial, {
  kind: "REPAIR", eventId: "repair-direct", occurredOn: "2026-01-10", expectedStateRevision: 7,
}), "REPAIR_NOT_RETIREMENT_EVIDENCE");

const wrongSchedulerPolicy = { ...initial, schedulePolicyVersion: "review_policy_v1_2026-07-04" };
rejected("wrong-scheduler-policy", reduceFinalRungRetirementV1(wrongSchedulerPolicy, delegated({ state: initial })), "SCHEDULER_POLICY_UNSUPPORTED");
const wrongRetirementPolicy = { ...initial, retirementPolicyVersion: "UNKNOWN_RETIREMENT" };
rejected("wrong-retirement-policy", reduceFinalRungRetirementV1(wrongRetirementPolicy, delegated({ state: initial })), "RETIREMENT_POLICY_UNSUPPORTED");
const wrongStateShape = { ...initial, stateShapeVersion: "adle_review_per_word_schedule_v1" };
rejected("wrong-state-shape", reduceFinalRungRetirementV1(wrongStateShape, delegated({ state: initial })), "STATE_SHAPE_UNSUPPORTED");
const wrongRetirementShape = { ...initial, retirementStateVersion: "unknown" };
rejected("wrong-retirement-state-shape", reduceFinalRungRetirementV1(wrongRetirementShape, delegated({ state: initial })), "RETIREMENT_STATE_SHAPE_UNSUPPORTED");
rejected("malformed-config", reduceFinalRungRetirementV1(initial, delegated({ state: initial }), {
  ...FINAL_RUNG_RETIREMENT_POLICY_CONFIG, preRetirementCheckGapDays: 111,
}), "POLICY_CONFIG_MALFORMED");
rejected("revision-conflict", reduceFinalRungRetirementV1(initial, {
  ...delegated({ state: initial }), expectedStateRevision: 6,
}), "REVISION_CONFLICT");
rejected("missing-day28-lineage", reduceFinalRungRetirementV1(initial, delegated({
  state: initial, last28DayReviewOn: null,
})), "DAY_28_LINEAGE_REQUIRED");
rejected("malformed-day28-lineage", reduceFinalRungRetirementV1(initial, delegated({
  state: initial, last28DayReviewOn: "2026-99-99",
})), "DAY_28_LINEAGE_REQUIRED");

const day7Previous = initialTargetScheduledState({ rung: "DAY_7", dueOn: "2026-01-10" });
const day7Decision = targetApplied(reduceTargetReviewTransition(day7Previous, {
  eventId: "not-day56", kind: "SCHEDULED_CHECK", rung: "DAY_7", outcome: "pass", occurredOn: "2026-01-10",
}));
rejected("non-day56-delegation", reduceFinalRungRetirementV1(initial, delegated({
  state: initial, eventId: "not-day56", targetDecision: day7Decision,
})), "DAY_56_DELEGATION_MALFORMED");

const mismatchedPreviousDecision = targetApplied(reduceTargetReviewTransition(
  initialTargetScheduledState({ rung: "DAY_56", dueOn: "2026-01-09" }),
  { eventId: "mismatched-previous", kind: "SCHEDULED_CHECK", rung: "DAY_56", outcome: "pass", occurredOn: "2026-01-10" },
));
rejected("delegation-previous-state-conflict", reduceFinalRungRetirementV1(initial, delegated({
  state: initial, eventId: "mismatched-previous", targetDecision: mismatchedPreviousDecision,
})), "DAY_56_DELEGATION_MALFORMED");

const mismatchedDueKind = delegated({ state: initial, eventId: "mismatched-due-kind" });
if (mismatchedDueKind.kind !== "FINAL_RUNG_DELEGATION") throw new Error("fixture construction failed");
rejected("delegation-due-kind-conflict", reduceFinalRungRetirementV1(initial, {
  ...mismatchedDueKind,
  source: { ...mismatchedDueKind.source, dueKind: "next_day_recovery" },
}), "DAY_56_DELEGATION_MALFORMED");

rejected("authentic-evidence-malformed", reduceFinalRungRetirementV1(initial, delegated({
  state: initial,
  evidence: [authentic({ occurredOn: "not-a-date" })],
})), "AUTHENTIC_EVIDENCE_CONFLICT");
rejected("authentic-evidence-duplicate-id", reduceFinalRungRetirementV1(initial, delegated({
  state: initial,
  evidence: [authentic({ eventId: "duplicate-auth" }), authentic({ eventId: "duplicate-auth", occurredOn: "2025-12-21" })],
})), "AUTHENTIC_EVIDENCE_CONFLICT");

rejected("early-check", reduceFinalRungRetirementV1(awaiting.nextState, checkEvent({
  state: awaiting.nextState, eventId: "early-check", outcome: "pass", occurredOn: "2026-05-01",
})), "PRE_RETIREMENT_CHECK_NOT_DUE");
const malformedCheckOutcome = checkEvent({ state: awaiting.nextState, eventId: "malformed-check-outcome", outcome: "pass" });
if (malformedCheckOutcome.kind !== "PRE_RETIREMENT_CHECK") throw new Error("fixture construction failed");
rejected("malformed-check-outcome", reduceFinalRungRetirementV1(awaiting.nextState, {
  ...malformedCheckOutcome,
  source: { ...malformedCheckOutcome.source, outcome: "unknown" },
} as unknown as FinalRungRetirementEvent), "EVENT_MALFORMED");
rejected("duplicate-day56-decision", reduceFinalRungRetirementV1(awaiting.nextState, {
  ...delegated({ state: initial, eventId: "day56-no-authentic" }),
  expectedStateRevision: awaiting.nextState.stateRevision,
} as FinalRungRetirementEvent), "DUPLICATE_EVENT");
rejected("duplicate-check", reduceFinalRungRetirementV1(checkFail.nextState, {
  ...checkEvent({ state: awaiting.nextState, eventId: "check-fail", outcome: "fail" }),
  expectedStateRevision: checkFail.nextState.stateRevision,
} as FinalRungRetirementEvent), "DUPLICATE_EVENT");
rejected("new-check-after-retired", reduceFinalRungRetirementV1(checkPass.nextState, {
  ...checkEvent({ state: awaiting.nextState, eventId: "second-check", outcome: "pass" }),
  expectedStateRevision: checkPass.nextState.stateRevision,
}), "EVENT_ROUTE_CONFLICT");

const malformedAwaiting: FinalRungRetirementAuthorityState = {
  ...awaiting.nextState,
  schedulerState: { ...awaiting.nextState.schedulerState, route: { membership: "RETIRED_PRESERVED" } },
};
rejected("malformed-awaiting-state", reduceFinalRungRetirementV1(malformedAwaiting, checkEvent({
  state: awaiting.nextState, outcome: "pass",
})), "STATE_MALFORMED");
const malformedPostCheck: FinalRungRetirementAuthorityState = {
  ...checkFail.nextState,
  retirementLifecycle: {
    status: "POST_CHECK_RECOVERY",
    checkOutcomeLineage: {
      outcomeEventId: "",
      outcome: "fail",
      occurredOn: "2026-05-02",
      governedDueOn: "2026-05-02",
    },
  },
};
rejected("malformed-check-lineage", reduceFinalRungRetirementV1(malformedPostCheck, delegated({
  state: checkFail.nextState,
  eventId: "post-check-malformed-lineage",
  occurredOn: "2026-05-03",
  last28DayReviewOn: null,
})), "STATE_MALFORMED");
rejected("orchestrator-malformed-check-lineage", orchestratePostCheckTargetReviewTransitionV1({
  state: malformedPostCheck,
  expectedStateRevision: malformedPostCheck.stateRevision,
  event: {
    eventId: "orchestrator-malformed-state",
    kind: "RECOVERY_CHECK",
    failedRung: "DAY_56",
    outcome: "pass",
    occurredOn: "2026-05-03",
  },
}), "STATE_MALFORMED");
rejected("post-check-authentic-conflict", reduceFinalRungRetirementV1(checkFail.nextState, delegated({
  state: checkFail.nextState,
  eventId: "post-check-auth-conflict",
  occurredOn: "2026-05-03",
  last28DayReviewOn: null,
  evidence: [authentic()],
})), "AUTHENTIC_EVIDENCE_CONFLICT");

const invalidRevisionState = { ...initial, stateRevision: -1 };
rejected("impossible-state-revision", reduceFinalRungRetirementV1(invalidRevisionState, delegated({ state: initial })), "STATE_MALFORMED");

const directRetiredState = authenticRetirement.nextState;
assert.equal(directRetiredState.retirementLifecycle.status, "RETIRED");
assert.equal(directRetiredState.schedulerState.route.membership, "RETIRED_PRESERVED");
record("retired-preserved-state", directRetiredState);
assert.equal(awaiting.nextState.schedulerState.route.membership, "PRE_RETIREMENT_PRESERVED");
record("pre-retirement-preserved-state", awaiting.nextState);

// Boundary proof by source: FR.1 imports the C2B.1 reducer, while C2B.1 has no
// dependency on retirement modules and remains byte-unchanged in this diff.
const reducerSource = readFileSync("lib/adle/review-policy/target-regression-v1.ts", "utf8");
const retirementSource = readFileSync("lib/adle/review-retirement/final-rung-retirement-v1.ts", "utf8");
const orchestratorSource = readFileSync("lib/adle/review-retirement/target-retirement-orchestrator.ts", "utf8");
assert.doesNotMatch(reducerSource, /review-retirement|ADLE_FINAL_RUNG_RETIREMENT_V1/);
assert.match(retirementSource, /reduceTargetReviewTransition/);
assert.match(orchestratorSource, /reduceTargetReviewTransition/);
assert.doesNotMatch(retirementSource + orchestratorSource, /Supabase|\.from\(|\.rpc\(|process\.env|Date\.now|new Date\(\)/);
assert.doesNotMatch(retirementSource, /DAY_3\s*.*DAY_1|DAY_7\s*.*DAY_3|catch_up_stage|next_retest_due_on/);

const fixtureFingerprint = fingerprintSnapshotValue(matrix);
const EXPECTED_FIXTURE_FINGERPRINT = "f9b09aef49e1acfdbf4eef766e75a5e94076659551cef9af6b378c2fcdd8107e";
assert.equal(fixtureFingerprint, EXPECTED_FIXTURE_FINGERPRINT);

console.log(JSON.stringify({
  status: "passed",
  policyVersion: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  retirementStateVersion: FINAL_RUNG_RETIREMENT_STATE_VERSION,
  schedulerPolicyVersion: TARGET_REVIEW_POLICY_VERSION,
  stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  decisionClasses: matrix.length,
  fixtureFingerprint,
}, null, 2));
