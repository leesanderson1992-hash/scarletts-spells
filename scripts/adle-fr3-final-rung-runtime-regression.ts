import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewState,
} from "../lib/adle/review-policy/contracts";
import { selectDueMixedReviewWords } from "../lib/adle/review-policy/mixed-due-selection";
import { resolvePureReviewPolicyExecutor } from "../lib/adle/review-policy/pure-dispatch";
import type {
  HydratedReviewSchedule,
  PersistedReviewScheduleStateC2B2,
} from "../lib/adle/review-policy/runtime-coexistence";
import type { TargetReviewOutcomeSourceFact } from "../lib/adle/review-policy/target-transition-persistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
  type FinalRungRetirementAuthorityState,
  type RetirementAuthenticUseEvidence,
} from "../lib/adle/review-retirement/contracts";
import {
  initialFinalRungRetirementAuthorityState,
} from "../lib/adle/review-retirement/final-rung-retirement-v1";
import {
  buildTargetRuntimeTransitionPlan,
  hydrateFinalRungRetirementAuthorityV1,
  type PersistedRetirementDecisionReceipt,
} from "../lib/adle/review-retirement/runtime-integration";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";

const IDS = {
  child: "00000000-0000-4000-8000-000000000301",
  word: "00000000-0000-4000-8000-000000000302",
  schedule: "00000000-0000-4000-8000-000000000303",
  day56: "00000000-0000-4000-8000-000000000304",
  check: "00000000-0000-4000-8000-000000000305",
  authentic: "00000000-0000-4000-8000-000000000306",
};

const dispatch = resolvePureReviewPolicyExecutor(
  TARGET_REVIEW_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
);
assert.equal(dispatch.disposition, "SUPPORTED");
if (dispatch.disposition !== "SUPPORTED" || dispatch.executor.kind !== "TARGET_REVIEW_REGRESSION_V1") {
  throw new Error("target executor unavailable");
}
const targetExecutor = dispatch.executor;

function persisted(state: TargetReviewState, overrides: Partial<PersistedReviewScheduleStateC2B2> = {}): PersistedReviewScheduleStateC2B2 {
  const route = state.route;
  return {
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    membershipStatus: route.membership === "SCHEDULED" ? "scheduled"
      : route.membership === "NEXT_DAY_RECOVERY" ? "next_day_recovery"
        : route.membership === "CONTROLLED_REACQUISITION" ? "controlled_reacquisition"
          : route.membership === "PRE_RETIREMENT_PRESERVED" ? "awaiting_pre_retirement_check"
            : "retired",
    wordIntervalIndex: route.membership === "SCHEDULED"
      ? ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_28", "DAY_56"].indexOf(route.rung)
      : route.membership === "NEXT_DAY_RECOVERY"
        ? ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_28", "DAY_56"].indexOf(route.failedRung)
        : 5,
    wordNextDueOn: route.membership === "SCHEDULED" || route.membership === "NEXT_DAY_RECOVERY"
      ? route.dueOn : null,
    consecutiveIndependentFailures: state.failureLineage.consecutiveIndependentFailures,
    failureEpisodeId: state.failureLineage.episodeId,
    preRetirementCheckDueOn: route.membership === "PRE_RETIREMENT_PRESERVED" ? route.dueOn : null,
    last28DayReviewOn: "2026-08-01",
    wordLastReviewCompletedOn: "2026-08-01",
    wordLastReviewCompletedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function schedule(state: TargetReviewState, revision = 0, overrides: Partial<PersistedReviewScheduleStateC2B2> = {}): Extract<HydratedReviewSchedule, { kind: "TARGET_REGRESSION_V1" }> {
  return {
    kind: "TARGET_REGRESSION_V1",
    scheduleWordId: IDS.schedule,
    childId: IDS.child,
    canonicalWordId: IDS.word,
    sourceBundleId: null,
    stateRevision: revision,
    executor: targetExecutor,
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    state,
    persistedState: persisted(state, overrides),
  };
}

function source(input: Partial<TargetReviewOutcomeSourceFact> = {}): TargetReviewOutcomeSourceFact {
  return {
    id: IDS.day56,
    schedule_word_id: IDS.schedule,
    child_id: IDS.child,
    canonical_word_id: IDS.word,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    due_kind: "scheduled_review",
    frozen_interval_index: 5,
    original_result: "success",
    review_completed_on: "2026-09-01",
    completed_at: "2026-09-01T10:00:00.000Z",
    ...input,
  };
}

const day56State: TargetReviewState = {
  route: { membership: "SCHEDULED", rung: "DAY_56", dueOn: "2026-09-01", regressionOrigin: null },
  failureLineage: { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 },
  appliedEventIds: [],
};
const baseSchedule = schedule(day56State);
const baseRetirement = initialFinalRungRetirementAuthorityState({
  scheduleWordId: IDS.schedule,
  childId: IDS.child,
  canonicalWordId: IDS.word,
  stateRevision: 0,
  schedulerState: day56State,
});
const authentic: RetirementAuthenticUseEvidence = {
  eventId: IDS.authentic,
  childId: IDS.child,
  canonicalWordId: IDS.word,
  occurredOn: "2026-08-15",
  useKind: "authentic_correct_use",
  parentVerified: true,
  provenanceKind: "independent_or_parent_verified_application",
  rowStatus: "active",
};

const immediate = buildTargetRuntimeTransitionPlan({
  schedule: baseSchedule,
  retirementState: baseRetirement,
  source: source(),
  authenticUseEvidence: [authentic],
  policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(immediate.disposition, "PLANNED");
if (immediate.disposition !== "PLANNED" || immediate.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
assert.equal(immediate.value.decision, "RETIRE");
assert.equal(immediate.value.decisionReason, "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE");
assert.equal(immediate.value.qualifyingAuthenticUseEventId, IDS.authentic);
assert.equal(immediate.value.transition.toState.membershipStatus, "retired");

for (const evidence of [
  { ...authentic, occurredOn: "2026-07-31" as const },
  { ...authentic, provenanceKind: "prompted_review_writing_application" as const },
]) {
  const result = buildTargetRuntimeTransitionPlan({
    schedule: baseSchedule, retirementState: baseRetirement, source: source(),
    authenticUseEvidence: [evidence], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
  });
  assert.equal(result.disposition, "PLANNED");
  if (result.disposition !== "PLANNED" || result.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(result.value.decision, "AWAIT_PRE_RETIREMENT_CHECK");
}

const awaiting = buildTargetRuntimeTransitionPlan({
  schedule: baseSchedule,
  retirementState: baseRetirement,
  source: source(),
  authenticUseEvidence: [],
  policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(awaiting.disposition, "PLANNED");
if (awaiting.disposition !== "PLANNED" || awaiting.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
assert.equal(awaiting.value.decision, "AWAIT_PRE_RETIREMENT_CHECK");
assert.equal(awaiting.value.transition.toState.preRetirementCheckDueOn, "2026-12-22");
assert.equal(awaiting.value.transition.toState.wordNextDueOn, null);

const awaitingState: TargetReviewState = {
  route: { membership: "PRE_RETIREMENT_PRESERVED", dueOn: "2026-12-22" },
  failureLineage: { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 },
  appliedEventIds: [IDS.day56],
};
const awaitingSchedule = schedule(awaitingState, 1, awaiting.value.transition.toState);
const awaitReceipt: PersistedRetirementDecisionReceipt = {
  source_review_outcome_event_id: IDS.day56,
  qualifying_authentic_use_event_id: null,
  pre_retirement_check_outcome_event_id: null,
  schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  retirement_policy_version: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  retirement_state_version: FINAL_RUNG_RETIREMENT_STATE_VERSION,
  decision: "AWAIT_PRE_RETIREMENT_CHECK",
  decision_reason: "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK",
  expected_state_revision: 0,
  applied_state_revision: 1,
  occurred_at: "2026-09-01T10:00:00.000Z",
};
const hydratedAwait = hydrateFinalRungRetirementAuthorityV1({
  schedule: awaitingSchedule,
  persistedCheckOutcomeEventId: null,
  receipts: [awaitReceipt],
  checkOutcomes: [{ id: IDS.day56, event_type: "review_pass", occurred_on: "2026-09-01", frozen_due_on: "2026-09-01" }],
});
assert.equal(hydratedAwait.disposition, "HYDRATED");
if (hydratedAwait.disposition !== "HYDRATED") throw new Error();

assert.equal(selectDueMixedReviewWords({
  today: "2026-12-21", sessionCap: 10, currentWords: [],
  targetWords: [{ schedule: awaitingSchedule, taughtOn: "2026-01-01" }],
}).length, 0, "112-day check cannot appear early");
assert.equal(selectDueMixedReviewWords({
  today: "2026-12-22", sessionCap: 10, currentWords: [],
  targetWords: [{ schedule: awaitingSchedule, taughtOn: "2026-01-01" }],
})[0]?.dueKind, "pre_retirement_check");
assert.equal(selectDueMixedReviewWords({
  today: "2026-09-01", sessionCap: 10, currentWords: [],
  targetWords: [{ schedule: baseSchedule, taughtOn: "2026-01-01" }],
})[0]?.intervalIndex, 5, "due DAY_56 must now be admitted");

const earlyCheck = buildTargetRuntimeTransitionPlan({
  schedule: awaitingSchedule,
  retirementState: hydratedAwait.state,
  source: source({
    id: IDS.check, due_kind: "pre_retirement_check", original_result: "success",
    review_completed_on: "2026-12-21", completed_at: "2026-12-21T10:00:00.000Z",
  }),
  authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.deepEqual(earlyCheck, { disposition: "REJECTED", reason: "PRE_RETIREMENT_CHECK_NOT_DUE" });

const staleRetirementState = { ...baseRetirement, stateRevision: 1 };
const stale = buildTargetRuntimeTransitionPlan({
  schedule: baseSchedule, retirementState: staleRetirementState,
  source: source(), authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.deepEqual(stale, { disposition: "REJECTED", reason: "RETIREMENT_SCHEDULER_STATE_CONFLICT" });

const duplicateState: TargetReviewState = { ...day56State, appliedEventIds: [IDS.day56] };
const duplicate = buildTargetRuntimeTransitionPlan({
  schedule: schedule(duplicateState),
  retirementState: initialFinalRungRetirementAuthorityState({
    scheduleWordId: IDS.schedule, childId: IDS.child, canonicalWordId: IDS.word,
    stateRevision: 0, schedulerState: duplicateState,
  }),
  source: source(), authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(duplicate.disposition, "REJECTED", "duplicate learner outcome must fail closed");

const day3State: TargetReviewState = {
  route: { membership: "SCHEDULED", rung: "DAY_3", dueOn: "2026-09-01", regressionOrigin: null },
  failureLineage: { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 },
  appliedEventIds: [],
};
const ordinary = buildTargetRuntimeTransitionPlan({
  schedule: schedule(day3State),
  retirementState: initialFinalRungRetirementAuthorityState({
    scheduleWordId: IDS.schedule, childId: IDS.child, canonicalWordId: IDS.word,
    stateRevision: 0, schedulerState: day3State,
  }),
  source: source({ frozen_interval_index: 1 }),
  authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(ordinary.disposition, "PLANNED");
if (ordinary.disposition !== "PLANNED") throw new Error();
assert.equal(ordinary.value.authority, "TARGET_REGRESSION_V1");
assert.equal(ordinary.value.transition.toState.wordIntervalIndex, 2,
  "ordinary target reviews below final rung remain C2B.1-owned");

const checkPass = buildTargetRuntimeTransitionPlan({
  schedule: awaitingSchedule,
  retirementState: hydratedAwait.state,
  source: source({
    id: IDS.check, due_kind: "pre_retirement_check", original_result: "success",
    review_completed_on: "2026-12-22", completed_at: "2026-12-22T10:00:00.000Z",
  }),
  authenticUseEvidence: [],
  policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(checkPass.disposition, "PLANNED");
if (checkPass.disposition !== "PLANNED" || checkPass.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
assert.equal(checkPass.value.decisionReason, "PRE_RETIREMENT_CHECK_PASS_RETIRED");
assert.equal(checkPass.value.qualifyingAuthenticUseEventId, null,
  "prompted governed check pass is sufficient without authentic evidence");
assert.equal(checkPass.value.transition.toState.membershipStatus, "retired");

const checkFail = buildTargetRuntimeTransitionPlan({
  schedule: awaitingSchedule,
  retirementState: hydratedAwait.state,
  source: source({
    id: IDS.check, due_kind: "pre_retirement_check", original_result: "failure",
    review_completed_on: "2026-12-22", completed_at: "2026-12-22T10:00:00.000Z",
  }),
  authenticUseEvidence: [],
  policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(checkFail.disposition, "PLANNED");
if (checkFail.disposition !== "PLANNED" || checkFail.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
assert.equal(checkFail.value.decisionReason, "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY");
assert.equal(checkFail.value.transition.toState.membershipStatus, "next_day_recovery");
assert.equal(checkFail.value.transition.toState.wordNextDueOn, "2026-12-23");
assert.equal(checkFail.value.preRetirementCheckOutcomeEventId, IDS.check);
assert.notEqual(checkFail.value.schedulerReducerInputState, null);

const postCheckRecoveryState: TargetReviewState = {
  route: { membership: "NEXT_DAY_RECOVERY", failedRung: "DAY_56", dueOn: "2026-12-23" },
  failureLineage: {
    resolution: "UNRESOLVED",
    episodeId: `failure:${IDS.check}`,
    consecutiveIndependentFailures: 1,
  },
  appliedEventIds: [IDS.day56, IDS.check],
};
const postCheckRetirement: FinalRungRetirementAuthorityState = {
  ...hydratedAwait.state,
  stateRevision: 2,
  schedulerState: postCheckRecoveryState,
  retirementLifecycle: {
    status: "POST_CHECK_RECOVERY",
    checkOutcomeLineage: {
      outcomeEventId: IDS.check,
      outcome: "fail",
      occurredOn: "2026-12-22",
      governedDueOn: "2026-12-22",
    },
  },
  appliedRetirementEventIds: [IDS.day56, IDS.check],
};
const recoverySchedule = schedule(postCheckRecoveryState, 2, checkFail.value.transition.toState);
const recoveryFail = buildTargetRuntimeTransitionPlan({
  schedule: recoverySchedule,
  retirementState: postCheckRetirement,
  source: source({
    id: "00000000-0000-4000-8000-000000000307",
    due_kind: "next_day_recovery", original_result: "failure",
    review_completed_on: "2026-12-23", completed_at: "2026-12-23T10:00:00.000Z",
  }),
  authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(recoveryFail.disposition, "PLANNED");
if (recoveryFail.disposition !== "PLANNED") throw new Error();
assert.equal(recoveryFail.value.authority, "TARGET_REGRESSION_V1");
assert.equal(recoveryFail.value.transition.toState.wordIntervalIndex, 4);
assert.equal(recoveryFail.value.transition.toState.membershipStatus, "scheduled");

const controlledAfterCheck: TargetReviewState = {
  route: { membership: "CONTROLLED_REACQUISITION", requiredBecause: "THIRD_CONSECUTIVE_FAILURE" },
  failureLineage: {
    resolution: "UNRESOLVED", episodeId: `failure:${IDS.check}`,
    consecutiveIndependentFailures: 3,
  },
  appliedEventIds: [IDS.day56, IDS.check, "recovery-fail", "regressed-fail"],
};
const controlledHydration = hydrateFinalRungRetirementAuthorityV1({
  schedule: schedule(controlledAfterCheck, 4),
  persistedCheckOutcomeEventId: IDS.check,
  receipts: [awaitReceipt, {
    ...awaitReceipt,
    source_review_outcome_event_id: IDS.check,
    pre_retirement_check_outcome_event_id: IDS.check,
    decision: "CONTINUE_V2_RECOVERY",
    decision_reason: "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY",
    expected_state_revision: 1,
    applied_state_revision: 2,
    occurred_at: "2026-12-22T10:00:00.000Z",
  }],
  checkOutcomes: [
    { id: IDS.day56, event_type: "review_pass", occurred_on: "2026-09-01", frozen_due_on: "2026-09-01" },
    { id: IDS.check, event_type: "retirement_check_fail", occurred_on: "2026-12-22", frozen_due_on: "2026-12-22" },
  ],
});
assert.equal(controlledHydration.disposition, "HYDRATED",
  "failed-check lineage survives controlled reacquisition independently of route");

const laterDay56Id = "00000000-0000-4000-8000-000000000308";
const rebuiltState: TargetReviewState = {
  route: { membership: "SCHEDULED", rung: "DAY_56", dueOn: "2027-02-01", regressionOrigin: null },
  failureLineage: { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 },
  appliedEventIds: [IDS.day56, IDS.check, "recovery-fail", "day28-pass"],
};
const rebuiltRetirement: FinalRungRetirementAuthorityState = {
  ...postCheckRetirement,
  stateRevision: 4,
  schedulerState: rebuiltState,
};
const later = buildTargetRuntimeTransitionPlan({
  schedule: schedule(rebuiltState, 4),
  retirementState: rebuiltRetirement,
  source: source({
    id: laterDay56Id, review_completed_on: "2027-02-01",
    completed_at: "2027-02-01T10:00:00.000Z",
  }),
  authenticUseEvidence: [], policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(later.disposition, "PLANNED");
if (later.disposition !== "PLANNED" || later.value.authority !== "TARGET_RETIREMENT_V1") throw new Error();
assert.equal(later.value.decisionReason, "POST_CHECK_FINAL_RUNG_PASS_RETIRED");
assert.equal(later.value.transition.toState.membershipStatus, "retired");
assert.equal(later.value.transition.toState.preRetirementCheckDueOn, null,
  "post-check rebuild must never start a second wait");
assert.equal(later.value.expectedPreRetirementCheckOutcomeEventId, IDS.check);

const retiredProjection = computeWordEvidenceState(EVIDENCE_POLICY_V1, {
  childId: IDS.child, canonicalWordId: IDS.word, score: 0, entries: [], productions: [],
}, {
  outcomeEvents: [], taughtHistory: [], slippageEvents: [],
  retirementReceipts: [{
    receiptId: "00000000-0000-4000-8000-000000000399",
    scheduleWordId: IDS.schedule,
    childId: IDS.child, canonicalWordId: IDS.word,
    sourceReviewOutcomeEventId: laterDay56Id,
    decision: "RETIRE",
    decisionReason: "POST_CHECK_FINAL_RUNG_PASS_RETIRED",
    occurredOn: "2027-02-01", appliedStateRevision: 7,
  }],
});
assert.equal(retiredProjection.state, "review_retired");
assert.match(retiredProjection.explanation.join(" "), /immutable target retirement receipt/);

const migration = readFileSync(resolve(
  "supabase/migrations/20260902120000_integrate_adle_fr3_final_rung_runtime.sql",
), "utf8");
assert.match(migration, /membership_status='awaiting_pre_retirement_check'/);
assert.match(migration, /persist_adle_final_rung_retirement_decision_fr2/);
assert.match(migration, /TARGET_RETIREMENT_V1/);
assert.match(migration, /pre_retirement_check/);
assert.doesNotMatch(migration, /word_interval_index\s*<\s*5/);
assert.doesNotMatch(migration, /is_active\s*=\s*true|is_default_for_new_schedules\s*=\s*true/i);
assert.doesNotMatch(migration, /update\s+public\.adle_review_policy_versions/i);
assert.doesNotMatch(migration, /DAY_1|DAY_3|DAY_7|DAY_14|DAY_28|DAY_56/,
  "SQL must not implement the target rung/retirement algorithm");

const cases = {
  immediateAuthenticRetirement: immediate.value.transition.sourceFingerprint,
  awaitingCheck: awaiting.value.transition.sourceFingerprint,
  checkPass: checkPass.value.transition.sourceFingerprint,
  checkFail: checkFail.value.transition.sourceFingerprint,
  recoveryFail: recoveryFail.value.transition.sourceFingerprint,
  laterRetirement: later.value.transition.sourceFingerprint,
};
const fingerprint = createHash("sha256")
  .update(fingerprintSnapshotValue(cases))
  .digest("hex");
console.log(JSON.stringify({
  status: "PASS",
  requiredCases: 19,
  fixtureFingerprint: fingerprint,
  retirementPolicy: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  v1PathChanged: false,
  productionActivated: false,
}, null, 2));
