import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decideControlledGraduationV1,
  decideLaterCleanControlledProductionV1,
} from "../lib/adle/review-policy/controlled-graduation-v1";
import {
  ADLE_REVIEW_DUE_ANCHOR_V1,
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  LEGACY_BUNDLE_STATE_SHAPE_VERSION,
  REVIEW_RUNGS,
  ROLLING_FROM_COMPLETION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type PostDayOneReviewRung,
  type ReviewRung,
  type TargetFailureLineage,
  type TargetReviewState,
  type TargetTransitionDecision,
} from "../lib/adle/review-policy/contracts";
import { resolvePureReviewPolicyExecutor } from "../lib/adle/review-policy/pure-dispatch";
import {
  TARGET_REVIEW_POLICY_CONFIG,
  initialTargetControlledState,
  initialTargetScheduledState,
  reduceTargetReviewTransition,
  targetNoFailureLineage,
} from "../lib/adle/review-policy/target-regression-v1";
import { createReviewBundle, REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { simulationFingerprint } from "../lib/adle/proficiency/scheduler-simulation/simulator";

const NEXT_RUNG: Record<ReviewRung, ReviewRung | null> = {
  DAY_1: "DAY_3",
  DAY_3: "DAY_7",
  DAY_7: "DAY_14",
  DAY_14: "DAY_28",
  DAY_28: "DAY_56",
  DAY_56: null,
};
const PREVIOUS_RUNG: Record<PostDayOneReviewRung, ReviewRung> = {
  DAY_3: "DAY_1",
  DAY_7: "DAY_3",
  DAY_14: "DAY_7",
  DAY_28: "DAY_14",
  DAY_56: "DAY_28",
};
const RUNG_GAP: Record<ReviewRung, number> = {
  DAY_1: 1, DAY_3: 3, DAY_7: 7, DAY_14: 14, DAY_28: 28, DAY_56: 56,
};

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function lineage(failures: 0 | 1 | 2): TargetFailureLineage {
  return failures === 0
    ? targetNoFailureLineage()
    : { resolution: "UNRESOLVED", episodeId: "failure:1", consecutiveIndependentFailures: failures };
}

function applied(decision: TargetTransitionDecision) {
  if (decision.disposition !== "APPLIED") throw new Error(`unexpected rejection: ${decision.reason}`);
  return decision;
}

function rejectReason(decision: TargetTransitionDecision): string {
  assert.equal(decision.disposition, "REJECTED");
  return decision.reason;
}

function normalized(state: TargetReviewState) {
  const route = state.route;
  return {
    membership: route.membership,
    rung: route.membership === "SCHEDULED" ? route.rung
      : route.membership === "NEXT_DAY_RECOVERY" ? route.failedRung
        : route.membership === "FINAL_RUNG_DELEGATED" ? route.completedRung : null,
    dueOn: route.membership === "SCHEDULED" || route.membership === "NEXT_DAY_RECOVERY"
      || route.membership === "PRE_RETIREMENT_PRESERVED" ? route.dueOn : null,
    regressionOrigin: route.membership === "SCHEDULED" ? route.regressionOrigin : null,
    requiredBecause: route.membership === "CONTROLLED_REACQUISITION" ? route.requiredBecause : null,
    completedOn: route.membership === "FINAL_RUNG_DELEGATED" ? route.completedOn : null,
    failureResolution: state.failureLineage.resolution,
    episodeId: state.failureLineage.episodeId,
    consecutiveIndependentFailures: state.failureLineage.consecutiveIndependentFailures,
    appliedEventIds: state.appliedEventIds,
  };
}

assert.equal(TARGET_REVIEW_POLICY_CONFIG.dueDates.dueAnchorVersion, ADLE_REVIEW_DUE_ANCHOR_V1);
assert.equal(TARGET_REVIEW_POLICY_CONFIG.dueDates.dueAnchorKind, ROLLING_FROM_COMPLETION);
assert.equal(TARGET_REVIEW_POLICY_CONFIG.schedulePolicyVersion, TARGET_REVIEW_POLICY_VERSION);

// Controlled OR: both source results remain independent and repair is not a voter.
for (const [cover, dictation, expected] of [
  ["pass", "pass", "PASS"],
  ["pass", "fail", "PASS"],
  ["fail", "pass", "PASS"],
  ["fail", "fail", "NOT_PASSED"],
] as const) {
  const decision = decideControlledGraduationV1({
    coverWrite: { eventId: `cover:${cover}:${dictation}`, outcome: cover },
    sentenceDictation: { eventId: `dictation:${cover}:${dictation}`, outcome: dictation },
  });
  assert.equal(decision.decision, expected);
  assert.equal(decision.coverWrite.outcome, cover);
  assert.equal(decision.sentenceDictation.outcome, dictation);
}
const repairCannotVote = decideControlledGraduationV1({
  coverWrite: { eventId: "cover:failed", outcome: "fail" },
  sentenceDictation: { eventId: "dictation:failed", outcome: "fail" },
  // @ts-expect-error Repair is deliberately not part of the governed voter contract.
  repair: { eventId: "repair:correct", outcome: "pass" },
});
assert.equal(repairCannotVote.decision, "NOT_PASSED");
const laterClean = decideLaterCleanControlledProductionV1({ eventId: "later:clean", outcome: "pass" });
assert.equal(laterClean.decisionKind, "LATER_CLEAN_CONTROLLED_PRODUCTION");
assert.equal(laterClean.decision, "PASS");

const parityCases: Array<{ caseId: string; decision: ReturnType<typeof applied> }> = [];

// Controlled entry with no lineage and controlled re-entry with retained lineage.
for (const state of [
  initialTargetControlledState(),
  {
    route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: "DAY_1_FAILURE" },
    failureLineage: lineage(1), appliedEventIds: [],
  } satisfies TargetReviewState,
  {
    route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: "THIRD_CONSECUTIVE_FAILURE" },
    failureLineage: { resolution: "UNRESOLVED", episodeId: "failure:1", consecutiveIndependentFailures: 3 },
    appliedEventIds: [],
  } satisfies TargetReviewState,
]) {
  const decision = applied(reduceTargetReviewTransition(state, {
    eventId: `controlled-pass:${state.failureLineage.consecutiveIndependentFailures}`,
    kind: "CONTROLLED_PASS",
    occurredOn: "2026-01-05",
  }));
  assert.equal(decision.nextState.route.membership, "SCHEDULED");
  assert.equal(decision.nextState.route.membership === "SCHEDULED" ? decision.nextState.route.rung : null, "DAY_1");
  assert.equal(decision.nextState.route.membership === "SCHEDULED" ? decision.nextState.route.dueOn : null, "2026-01-06");
  assert.deepEqual(decision.nextState.failureLineage, state.failureLineage);
  parityCases.push({ caseId: `controlled:${state.failureLineage.consecutiveIndependentFailures}`, decision });
}

// Every valid scheduled rung/outcome/failure-count combination.
for (const rung of REVIEW_RUNGS) {
  for (const failures of [0, 1, 2] as const) {
    for (const outcome of ["pass", "fail"] as const) {
      const state = initialTargetScheduledState({ rung, dueOn: "2026-01-10", failureLineage: lineage(failures) });
      const eventId = `scheduled:${rung}:${failures}:${outcome}`;
      const decision = applied(reduceTargetReviewTransition(state, {
        eventId, kind: "SCHEDULED_CHECK", rung, outcome, occurredOn: "2026-01-10",
      }));
      if (outcome === "pass") {
        assert.equal(decision.nextState.failureLineage.resolution, "NONE");
        assert.equal(decision.sequenceReset, failures > 0);
        const forward = NEXT_RUNG[rung];
        if (forward === null) {
          assert.equal(decision.nextState.route.membership, "FINAL_RUNG_DELEGATED");
          assert.equal(decision.finalRungDelegated, true);
        } else {
          assert.equal(decision.nextState.route.membership, "SCHEDULED");
          if (decision.nextState.route.membership === "SCHEDULED") {
            assert.equal(decision.nextState.route.rung, forward);
            assert.equal(decision.nextState.route.dueOn, addDays("2026-01-10", RUNG_GAP[forward]));
          }
        }
      } else {
        const nextFailures = failures + 1;
        assert.equal(decision.nextState.failureLineage.consecutiveIndependentFailures, nextFailures);
        if (rung === "DAY_1" || nextFailures >= 3) {
          assert.equal(decision.nextState.route.membership, "CONTROLLED_REACQUISITION");
        } else {
          assert.equal(decision.nextState.route.membership, "NEXT_DAY_RECOVERY");
          if (decision.nextState.route.membership === "NEXT_DAY_RECOVERY") {
            assert.equal(decision.nextState.route.failedRung, rung);
            assert.equal(decision.nextState.route.dueOn, "2026-01-11");
          }
        }
      }
      parityCases.push({ caseId: eventId, decision });
    }
  }
}

// A third-failure lineage may be retained through controlled re-entry only at
// Day 1. The next independent Day-1 result either resets it or returns to
// controlled; it is not an active recovery route while controlled.
for (const outcome of ["pass", "fail"] as const) {
  const state = initialTargetScheduledState({
    rung: "DAY_1",
    dueOn: "2026-01-10",
    failureLineage: { resolution: "UNRESOLVED", episodeId: "failure:third", consecutiveIndependentFailures: 3 },
  });
  const eventId = `scheduled:DAY_1:retained-third:${outcome}`;
  const decision = applied(reduceTargetReviewTransition(state, {
    eventId, kind: "SCHEDULED_CHECK", rung: "DAY_1", outcome, occurredOn: "2026-01-10",
  }));
  if (outcome === "pass") {
    assert.equal(decision.nextState.route.membership, "SCHEDULED");
    assert.equal(decision.nextState.failureLineage.resolution, "NONE");
    assert.equal(decision.sequenceReset, true);
  } else {
    assert.equal(decision.nextState.route.membership, "CONTROLLED_REACQUISITION");
    assert.equal(decision.nextState.failureLineage.consecutiveIndependentFailures, 4);
  }
  parityCases.push({ caseId: eventId, decision });
}

// Every valid recovery rung/outcome/failure-count combination.
for (const failedRung of REVIEW_RUNGS.slice(1) as readonly PostDayOneReviewRung[]) {
  for (const failures of [1, 2] as const) {
    for (const outcome of ["pass", "fail"] as const) {
      const state: TargetReviewState = {
        route: { membership: "NEXT_DAY_RECOVERY", failedRung, dueOn: "2026-01-11" },
        failureLineage: lineage(failures),
        appliedEventIds: [],
      };
      const eventId = `recovery:${failedRung}:${failures}:${outcome}`;
      const decision = applied(reduceTargetReviewTransition(state, {
        eventId, kind: "RECOVERY_CHECK", failedRung, outcome, occurredOn: "2026-01-11",
      }));
      if (outcome === "pass") {
        assert.equal(decision.nextState.failureLineage.resolution, "NONE");
        assert.equal(decision.sequenceReset, true);
        const forward = NEXT_RUNG[failedRung];
        if (forward === null) assert.equal(decision.nextState.route.membership, "FINAL_RUNG_DELEGATED");
        else if (decision.nextState.route.membership === "SCHEDULED") {
          assert.equal(decision.nextState.route.rung, forward);
          assert.equal(decision.nextState.route.dueOn, addDays("2026-01-11", RUNG_GAP[forward]));
        } else assert.fail("recovery pass did not schedule the next rung");
      } else if (failures === 2) {
        assert.equal(decision.nextState.route.membership, "CONTROLLED_REACQUISITION");
        assert.equal(decision.reason, "THIRD_CONSECUTIVE_FAILURE_TO_CONTROLLED");
      } else {
        assert.equal(decision.nextState.route.membership, "SCHEDULED");
        if (decision.nextState.route.membership === "SCHEDULED") {
          const regressed = PREVIOUS_RUNG[failedRung];
          assert.equal(decision.nextState.route.rung, regressed);
          assert.equal(decision.nextState.route.regressionOrigin, failedRung);
          assert.equal(decision.nextState.route.dueOn, addDays("2026-01-11", RUNG_GAP[regressed]));
        }
      }
      parityCases.push({ caseId: eventId, decision });
    }
  }
}

// Repair is exhaustive over each route class and cannot change route/lineage.
const repairStates: TargetReviewState[] = [
  initialTargetControlledState(),
  initialTargetScheduledState({ rung: "DAY_7", dueOn: "2026-01-20", failureLineage: lineage(2) }),
  { route: { membership: "NEXT_DAY_RECOVERY", failedRung: "DAY_7", dueOn: "2026-01-20" }, failureLineage: lineage(1), appliedEventIds: [] },
  { route: { membership: "FINAL_RUNG_DELEGATED", completedRung: "DAY_56", completedOn: "2026-01-20" }, failureLineage: targetNoFailureLineage(), appliedEventIds: [] },
  { route: { membership: "PRE_RETIREMENT_PRESERVED", dueOn: "2026-05-01" }, failureLineage: targetNoFailureLineage(), appliedEventIds: [] },
  { route: { membership: "RETIRED_PRESERVED" }, failureLineage: targetNoFailureLineage(), appliedEventIds: [] },
];
for (const [index, state] of repairStates.entries()) {
  const decision = applied(reduceTargetReviewTransition(state, {
    eventId: `repair:${index}`, kind: "REPAIR", occurredOn: "2026-01-20",
  }));
  assert.equal(decision.routeChanged, false);
  assert.deepEqual(decision.nextState.route, state.route);
  assert.deepEqual(decision.nextState.failureLineage, state.failureLineage);
  parityCases.push({ caseId: `repair:${index}`, decision });
}

// Fail-closed boundaries.
const scheduledDay7 = initialTargetScheduledState({ rung: "DAY_7", dueOn: "2026-02-01" });
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "before-due", kind: "SCHEDULED_CHECK", rung: "DAY_7", outcome: "pass", occurredOn: "2026-01-31",
})), "EVENT_BEFORE_DUE");
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "wrong-rung", kind: "SCHEDULED_CHECK", rung: "DAY_14", outcome: "pass", occurredOn: "2026-02-01",
})), "EVENT_ROUTE_CONFLICT");
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "controlled-conflict", kind: "CONTROLLED_PASS", occurredOn: "2026-02-01",
})), "EVENT_ROUTE_CONFLICT");
assert.equal(rejectReason(reduceTargetReviewTransition(
  { ...scheduledDay7, appliedEventIds: ["duplicate"] },
  { eventId: "duplicate", kind: "REPAIR", occurredOn: "2026-02-01" },
)), "DUPLICATE_EVENT");
assert.equal(rejectReason(reduceTargetReviewTransition({
  ...scheduledDay7,
  failureLineage: { resolution: "UNRESOLVED", episodeId: "bad", consecutiveIndependentFailures: -1 },
} as TargetReviewState, { eventId: "bad-state", kind: "REPAIR", occurredOn: "2026-02-01" })), "STATE_MALFORMED");
assert.equal(rejectReason(reduceTargetReviewTransition({
  route: { membership: "NEXT_DAY_RECOVERY", failedRung: "DAY_1", dueOn: "2026-02-01" },
  failureLineage: lineage(1), appliedEventIds: [],
} as unknown as TargetReviewState, {
  eventId: "impossible-recovery", kind: "RECOVERY_CHECK", failedRung: "DAY_1", outcome: "pass", occurredOn: "2026-02-01",
} as never)), "STATE_MALFORMED");
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "bad-event", kind: "SCHEDULED_CHECK", rung: "DAY_7", outcome: "unknown", occurredOn: "2026-02-01",
} as never)), "EVENT_MALFORMED");
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "unknown-policy", kind: "REPAIR", occurredOn: "2026-02-01",
}, { ...TARGET_REVIEW_POLICY_CONFIG, schedulePolicyVersion: "UNKNOWN" } as never)), "POLICY_VERSION_UNSUPPORTED");
assert.equal(rejectReason(reduceTargetReviewTransition(scheduledDay7, {
  eventId: "malformed-config", kind: "REPAIR", occurredOn: "2026-02-01",
}, { ...TARGET_REVIEW_POLICY_CONFIG, recoveryDelayDays: 2 } as never)), "POLICY_CONFIG_MALFORMED");

// Policy dispatch is exact-version + compatible-state-shape only. Registry
// is_active/default flags do not participate and cannot disable a pinned word.
const currentDispatch = resolvePureReviewPolicyExecutor(CURRENT_REVIEW_POLICY_VERSION, CURRENT_PER_WORD_STATE_SHAPE_VERSION);
assert.equal(currentDispatch.disposition, "SUPPORTED");
const currentLegacyDispatch = resolvePureReviewPolicyExecutor(CURRENT_REVIEW_POLICY_VERSION, LEGACY_BUNDLE_STATE_SHAPE_VERSION);
assert.equal(currentLegacyDispatch.disposition, "SUPPORTED");
const targetDispatch = resolvePureReviewPolicyExecutor(TARGET_REVIEW_POLICY_VERSION, TARGET_PER_WORD_STATE_SHAPE_VERSION);
assert.equal(targetDispatch.disposition, "SUPPORTED");
assert.equal(resolvePureReviewPolicyExecutor(TARGET_REVIEW_POLICY_VERSION, CURRENT_PER_WORD_STATE_SHAPE_VERSION).disposition, "REJECTED");
assert.equal(resolvePureReviewPolicyExecutor("unknown", TARGET_PER_WORD_STATE_SHAPE_VERSION).disposition, "REJECTED");

if (currentDispatch.disposition !== "SUPPORTED" || currentDispatch.executor.kind !== "CURRENT_REVIEW_POLICY_V1") {
  assert.fail("current reducer dispatch unavailable");
}
const directCurrent = createReviewBundle(REVIEW_POLICY_V1, {
  bundleId: "current", childId: "child", sourceRef: "lesson", taughtOn: "2026-01-01",
  words: [{ canonicalWordId: "word" }],
});
const dispatchedCurrent = currentDispatch.executor.createReviewBundle(currentDispatch.executor.policy, {
  bundleId: "current", childId: "child", sourceRef: "lesson", taughtOn: "2026-01-01",
  words: [{ canonicalWordId: "word" }],
});
assert.deepEqual(dispatchedCurrent, directCurrent);

const parityProjection = parityCases.map(({ caseId, decision }) => ({
  caseId,
  reason: decision.reason,
  sequenceReset: decision.sequenceReset,
  finalRungDelegated: decision.finalRungDelegated,
  next: normalized(decision.nextState),
}));
const exhaustiveParityFingerprint = simulationFingerprint(parityProjection);
const EXPECTED_EXHAUSTIVE_PARITY_FINGERPRINT = "bf7377408569a2112fdd9e4f84edb14637081c914e44f5c82e8be4a408718397";
assert.equal(exhaustiveParityFingerprint, EXPECTED_EXHAUSTIVE_PARITY_FINGERPRINT);

const targetReducerSource = readFileSync("lib/adle/review-policy/target-regression-v1.ts", "utf8");
for (const forbidden of ["process.env", "Date.now(", "new Date()", ".from(", ".rpc(", "fetch("]) {
  assert.equal(targetReducerSource.includes(forbidden), false, `target reducer must remain pure: ${forbidden}`);
}
const simulationAdapterSource = readFileSync("lib/adle/proficiency/scheduler-simulation/simulator.ts", "utf8");
assert.match(simulationAdapterSource, /requireAppliedTargetTransition\(state, event/);
assert.doesNotMatch(simulationAdapterSource, /if \(event\.kind ===/);

console.log(JSON.stringify({
  message: "ADLE target review reducer exhaustive regression passed.",
  appliedParityCases: parityCases.length,
  exhaustiveParityFingerprint,
}));
