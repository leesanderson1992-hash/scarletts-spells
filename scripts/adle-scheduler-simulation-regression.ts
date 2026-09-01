import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type {
  ControlledAttemptFact,
  CurrentRouteFact,
  ReviewRung,
  SchedulerRouteState,
} from "../lib/adle/proficiency/scheduler-simulation/contracts";
import { buildSchedulerSimulation } from "../lib/adle/proficiency/scheduler-simulation/reconciliation";
import {
  initialTargetControlledState,
  initialTargetScheduledState,
  targetNoFailureLineage,
} from "../lib/adle/review-policy/target-regression-v1";
import {
  ROLLING_DUE_DATE_SIMULATION,
  evaluateControlledGraduation,
  mapCurrentRouteToTarget,
  simulateSchedulerEvent,
} from "../lib/adle/proficiency/scheduler-simulation/simulator";

const baseControlled: SchedulerRouteState = initialTargetControlledState();

function controlledPair(
  cycle: string,
  cover: "pass" | "fail",
  dictation: "pass" | "fail",
): ControlledAttemptFact[] {
  return [
    { eventId: `${cycle}:cover`, learnerId: "learner", canonicalWordId: `word:${cycle}`, controlledCycleId: cycle, opportunity: "COVER_WRITE", outcome: cover, occurredOn: "2026-01-01" },
    { eventId: `${cycle}:dictation`, learnerId: "learner", canonicalWordId: `word:${cycle}`, controlledCycleId: cycle, opportunity: "SENTENCE_DICTATION", outcome: dictation, occurredOn: "2026-01-01" },
  ];
}

const controlled = evaluateControlledGraduation([
  ...controlledPair("both-pass", "pass", "pass"),
  ...controlledPair("cover-pass", "pass", "fail"),
  ...controlledPair("dictation-pass", "fail", "pass"),
  ...controlledPair("both-fail", "fail", "fail"),
]);
assert.equal(controlled.filter((entry) => entry.controlledPass === true).length, 3);
assert.equal(controlled.filter((entry) => entry.controlledPass === false).length, 1);
assert.ok(controlled.every((entry) => entry.coverWriteEventId && entry.sentenceDictationEventId));

const incomplete = evaluateControlledGraduation(controlledPair("incomplete", "pass", "fail").slice(0, 1));
assert.equal(incomplete[0].disposition, "BLOCKED");
assert.equal(incomplete[0].reason, "CONTROLLED_OPPORTUNITY_MISSING");
const duplicate = evaluateControlledGraduation([
  ...controlledPair("duplicate", "pass", "pass"),
  { ...controlledPair("duplicate", "pass", "pass")[0], eventId: "duplicate:cover:again" },
]);
assert.equal(duplicate[0].disposition, "AMBIGUOUS");

const dayOne = simulateSchedulerEvent(baseControlled, {
  eventId: "controlled-pass", kind: "CONTROLLED_PASS", occurredOn: "2026-01-01",
});
assert.deepEqual(dayOne, {
  route: { membership: "SCHEDULED", rung: "DAY_1", dueOn: "2026-01-02", regressionOrigin: null },
  failureLineage: targetNoFailureLineage(), appliedEventIds: ["controlled-pass"],
});
const dayThree = simulateSchedulerEvent(dayOne, {
  eventId: "day1-pass", kind: "SCHEDULED_CHECK", rung: "DAY_1", outcome: "pass", occurredOn: "2026-01-02",
});
assert.equal(dayThree.route.membership, "SCHEDULED");
assert.equal(dayThree.route.membership === "SCHEDULED" ? dayThree.route.rung : null, "DAY_3");
assert.equal(dayThree.route.membership === "SCHEDULED" ? dayThree.route.dueOn : null, "2026-01-05");

const dayOneFailure = simulateSchedulerEvent(dayOne, {
  eventId: "day1-fail", kind: "SCHEDULED_CHECK", rung: "DAY_1", outcome: "fail", occurredOn: "2026-01-02",
});
assert.equal(dayOneFailure.route.membership, "CONTROLLED_REACQUISITION");
assert.equal(dayOneFailure.failureLineage.consecutiveIndependentFailures, 1);
const repaired = simulateSchedulerEvent(dayOneFailure, { eventId: "repair", kind: "REPAIR", occurredOn: "2026-01-02" });
assert.equal(repaired.route.membership, "CONTROLLED_REACQUISITION");
assert.equal(repaired.failureLineage.consecutiveIndependentFailures, 1);
const dayOneAgain = simulateSchedulerEvent(repaired, { eventId: "controlled-again", kind: "CONTROLLED_PASS", occurredOn: "2026-01-03" });
assert.equal(dayOneAgain.route.membership, "SCHEDULED");
assert.equal(dayOneAgain.failureLineage.consecutiveIndependentFailures, 1);
const resetAtDayOne = simulateSchedulerEvent(dayOneAgain, {
  eventId: "later-day1-pass", kind: "SCHEDULED_CHECK", rung: "DAY_1", outcome: "pass", occurredOn: "2026-01-04",
});
assert.equal(resetAtDayOne.route.membership, "SCHEDULED");
assert.equal(resetAtDayOne.failureLineage.consecutiveIndependentFailures, 0);

const regressionCases: Array<[Exclude<ReviewRung, "DAY_1">, ReviewRung]> = [
  ["DAY_3", "DAY_1"], ["DAY_7", "DAY_3"], ["DAY_14", "DAY_7"],
  ["DAY_28", "DAY_14"], ["DAY_56", "DAY_28"],
];
for (const [failedRung, regressedRung] of regressionCases) {
  const scheduled: SchedulerRouteState = initialTargetScheduledState({ rung: failedRung, dueOn: "2026-02-01" });
  const recovery = simulateSchedulerEvent(scheduled, {
    eventId: `${failedRung}:fail`, kind: "SCHEDULED_CHECK", rung: failedRung, outcome: "fail", occurredOn: "2026-02-01",
  });
  assert.equal(recovery.route.membership, "NEXT_DAY_RECOVERY");
  assert.equal(recovery.route.membership === "NEXT_DAY_RECOVERY" ? recovery.route.dueOn : null, "2026-02-02");
  const regressed = simulateSchedulerEvent(recovery, {
    eventId: `${failedRung}:recovery-fail`, kind: "RECOVERY_CHECK", failedRung, outcome: "fail", occurredOn: "2026-02-02",
  });
  assert.equal(regressed.route.membership, "SCHEDULED");
  assert.equal(regressed.route.membership === "SCHEDULED" ? regressed.route.rung : null, regressedRung);
  assert.equal(regressed.route.membership === "SCHEDULED" ? regressed.route.regressionOrigin : null, failedRung);
  const recoveryPass = simulateSchedulerEvent(recovery, {
    eventId: `${failedRung}:recovery-pass`, kind: "RECOVERY_CHECK", failedRung, outcome: "pass", occurredOn: "2026-02-02",
  });
  const expectedForward = failedRung === "DAY_56" ? "FINAL_RUNG_DELEGATED" : "SCHEDULED";
  assert.equal(recoveryPass.route.membership, expectedForward);
  if (recoveryPass.route.membership === "SCHEDULED") assert.equal(recoveryPass.failureLineage.consecutiveIndependentFailures, 0);
}

const thirdFailureState: SchedulerRouteState = initialTargetScheduledState({
  rung: "DAY_7", dueOn: "2026-03-01", regressionOrigin: "DAY_14",
  failureLineage: { resolution: "UNRESOLVED", episodeId: "first-fail", consecutiveIndependentFailures: 2 },
});
const thirdFailure = simulateSchedulerEvent(thirdFailureState, {
  eventId: "third-fail", kind: "SCHEDULED_CHECK", rung: "DAY_7", outcome: "fail", occurredOn: "2026-03-01",
});
assert.equal(thirdFailure.route.membership, "CONTROLLED_REACQUISITION");
assert.equal(thirdFailure.route.membership === "CONTROLLED_REACQUISITION" ? thirdFailure.route.requiredBecause : null, "THIRD_CONSECUTIVE_FAILURE");

const route = (overrides: Partial<CurrentRouteFact>): CurrentRouteFact => ({
  scheduleWordId: "schedule", learnerId: "learner", canonicalWordId: "word",
  membershipStatus: "scheduled", catchUpStage: 0, effectiveIntervalIndex: 2,
  effectiveDueOn: "2026-04-01", failedReviewOn: null,
  preRetirementCheckDueOn: null, rowStatus: "active",
  scheduleAuthority: "PER_WORD_V1", currentPolicyVersion: "review_policy_v1_2026-07-04",
  currentPolicyLadderCompatible: true,
  reconstructedConsecutiveFailures: 0, ...overrides,
});
assert.equal(mapCurrentRouteToTarget(route({})).reason, "DIRECT_RUNG_MAPPING");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "catch_up", catchUpStage: 1, reconstructedConsecutiveFailures: 1 })).reason, "FIRST_CATCH_UP_MAPS_TO_RECOVERY");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "catch_up", catchUpStage: 1, effectiveIntervalIndex: 0, reconstructedConsecutiveFailures: 1 })).reason, "DAY_1_CATCH_UP_MAPS_TO_CONTROLLED_REACQUISITION");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "catch_up", catchUpStage: 2, reconstructedConsecutiveFailures: 2 })).disposition, "REQUIRES_POLICY_DECISION");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "paused_parent_review" })).disposition, "REQUIRES_POLICY_DECISION");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "ejected_pending_reteach", reconstructedConsecutiveFailures: 3 })).reason, "EJECTED_MAPS_TO_CONTROLLED_REACQUISITION");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "awaiting_pre_retirement_check", preRetirementCheckDueOn: "2026-10-01" })).reason, "PRE_RETIREMENT_PRESERVED_SEPARATELY");
assert.equal(mapCurrentRouteToTarget(route({ membershipStatus: "retired" })).reason, "RETIRED_PRESERVED_SEPARATELY");
assert.equal(mapCurrentRouteToTarget(route({ scheduleAuthority: "CONFLICTING" })).reason, "SCHEDULE_AUTHORITY_CONFLICT");
assert.equal(mapCurrentRouteToTarget(route({ currentPolicyLadderCompatible: false })).reason, "CURRENT_POLICY_LADDER_UNSUPPORTED");

const finalScheduled: SchedulerRouteState = initialTargetScheduledState({ rung: "DAY_56", dueOn: "2026-05-01" });
assert.equal(simulateSchedulerEvent(finalScheduled, {
  eventId: "day56-pass", kind: "SCHEDULED_CHECK", rung: "DAY_56", outcome: "pass", occurredOn: "2026-05-01",
}).route.membership, "FINAL_RUNG_DELEGATED");

const simulation = buildSchedulerSimulation({
  controlledAttempts: controlledPair("stable", "pass", "fail"),
  currentRoutes: [route({})],
  asOfOn: "2026-04-01",
  sessionCap: 10,
  sourceFactsForFingerprint: { fixture: true },
  dueDateScenario: ROLLING_DUE_DATE_SIMULATION,
});
const repeated = buildSchedulerSimulation({
  controlledAttempts: [...controlledPair("stable", "pass", "fail")].reverse(),
  currentRoutes: [route({})],
  asOfOn: "2026-04-01",
  sessionCap: 10,
  sourceFactsForFingerprint: { fixture: true },
  dueDateScenario: ROLLING_DUE_DATE_SIMULATION,
});
assert.equal(simulation.reconciliation.controlledDecisionFingerprint, repeated.reconciliation.controlledDecisionFingerprint);
assert.equal(simulation.reconciliation.routeMigrationFingerprint, repeated.reconciliation.routeMigrationFingerprint);
assert.equal(simulation.reconciliation.queueFingerprint, repeated.reconciliation.queueFingerprint);
assert.equal(simulation.reconciliation.controlledCoverOnlyCorrectCount, 1);

const repositorySource = readFileSync("lib/adle/proficiency/scheduler-simulation/repository.ts", "utf8");
assert.match(repositorySource, /^import "server-only";/);
for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
  assert.equal(repositorySource.includes(forbidden), false, `repository must remain SELECT-only: ${forbidden}`);
}

console.log("ADLE C2 scheduler simulation regression passed.");
