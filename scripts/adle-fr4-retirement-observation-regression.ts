import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import {
  buildC2BProductionObservation,
  C2B_PRODUCTION_OBSERVATION_LEGACY_VERSION,
  type C2BProductionObservationReceipt,
  type ObservationAuthenticUseRow,
  type ObservationInput,
  type ObservationOutcomeRow,
  type ObservationRetirementReceiptRow,
  type ObservationScheduleRow,
  type ObservationTransitionRow,
} from "../lib/adle/review-policy/production-observation";
import {
  hydratePersistedReviewSchedule,
  type PersistedReviewPolicyRow,
} from "../lib/adle/review-policy/runtime-coexistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";
import {
  FINAL_RUNG_RETIREMENT_POLICY_VERSION,
  FINAL_RUNG_RETIREMENT_STATE_VERSION,
} from "../lib/adle/review-retirement/contracts";
import {
  buildTargetRuntimeTransitionPlan,
  hydrateFinalRungRetirementAuthorityV1,
  type TargetRuntimeTransitionPlan,
} from "../lib/adle/review-retirement/runtime-integration";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";

const IDS = {
  child: "00000000-0000-4000-8000-000000004001",
  word: "00000000-0000-4000-8000-000000004002",
  schedule: "00000000-0000-4000-8000-000000004003",
  authentic: "00000000-0000-4000-8000-000000004004",
};

const policy: PersistedReviewPolicyRow = {
  schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  is_active: false,
  is_default_for_new_schedules: false,
  transition_family: "REGRESSION_V1",
  interval_ladder_days: [1, 3, 7, 14, 28, 56],
  catch_up_offsets_days: null,
  recovery_delay_days: 1,
  due_anchor: "ROLLING_FROM_COMPLETION",
  controlled_graduation_policy_version: "ADLE_CONTROLLED_GRADUATION_V1_OR",
  session_cap: 10,
};

function scheduleRow(): ObservationScheduleRow {
  return {
    id: IDS.schedule,
    child_id: IDS.child,
    canonical_word_id: IDS.word,
    bundle_id: null,
    membership_status: "scheduled",
    taught_on: "2026-01-01",
    row_status: "active",
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_interval_index: 5,
    word_next_due_on: "2026-09-01",
    catch_up_stage: 0,
    next_retest_due_on: null,
    failed_review_on: null,
    pre_retirement_check_due_on: null,
    last_28_day_review_on: "2026-08-01",
    reteach_cycle_count: 0,
    word_schedule_transition_count: 0,
    word_last_review_completed_on: "2026-08-01",
    word_last_review_completed_at: "2026-08-01T10:00:00.000Z",
    consecutive_independent_failures: 0,
    failure_episode_id: null,
    pre_retirement_check_outcome_event_id: null,
  };
}

function input(): ObservationInput {
  return {
    observedAt: "2026-09-02T12:00:00.000Z",
    sourceBaseline: "8545572",
    deploymentIdentity: "dpl_FR4Fixture",
    productionProjectRef: "fixture-production",
    learnerId: IDS.child,
    approvedTargetScheduleIds: [IDS.schedule],
    retirementCapability: "PRESENT",
    targetSchedules: [scheduleRow()],
    targetPolicy: policy,
    transitions: [],
    outcomes: [],
    encounters: [],
    sessions: [],
    completionReceipts: [],
    controlledReceipts: [],
    retirementReceipts: [],
    authenticUseEvidence: [],
    logs: [],
    previous: null,
  };
}

function outcome(input: ObservationInput, options: {
  ordinal: number;
  result: "success" | "failure";
  completedOn: `${number}-${number}-${number}`;
  dueKind?: "scheduled_review" | "next_day_recovery" | "pre_retirement_check";
}): ObservationOutcomeRow {
  const row = input.targetSchedules[0];
  const suffix = String(options.ordinal).padStart(3, "0");
  const dueKind = options.dueKind ?? (row.membership_status === "next_day_recovery"
    ? "next_day_recovery" : row.membership_status === "awaiting_pre_retirement_check"
      ? "pre_retirement_check" : "scheduled_review");
  const id = `00000000-0000-4000-8000-000000004${suffix}`;
  return {
    id,
    schedule_word_id: IDS.schedule,
    child_id: IDS.child,
    canonical_word_id: IDS.word,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    due_kind: dueKind,
    frozen_interval_index: 5,
    original_result: options.result,
    review_completed_on: options.completedOn,
    completed_at: `${options.completedOn}T10:00:00.000Z`,
    review_session_id: `00000000-0000-4000-8000-000000005${suffix}`,
    review_encounter_id: `00000000-0000-4000-8000-000000006${suffix}`,
    event_type: dueKind === "pre_retirement_check"
      ? options.result === "success" ? "retirement_check_pass" : "retirement_check_fail"
      : options.result === "success" ? "review_pass" : "review_fail",
    result_source: "review_audio_check",
    frozen_due_on: (dueKind === "pre_retirement_check"
      ? row.pre_retirement_check_due_on : row.word_next_due_on) as `${number}-${number}-${number}`,
    assignment_practice_date: options.completedOn,
    source_provenance: { fixture: true, dueKind },
    created_at: `${options.completedOn}T10:00:00.001Z`,
  };
}

function currentAuthorities(state: ObservationInput) {
  const row = state.targetSchedules[0];
  const hydrated = hydratePersistedReviewSchedule({ row, transitions: state.transitions });
  assert.equal(hydrated.disposition, "HYDRATED");
  if (hydrated.disposition !== "HYDRATED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
    throw new Error("target fixture did not hydrate");
  }
  const retirement = hydrateFinalRungRetirementAuthorityV1({
    schedule: hydrated.schedule,
    persistedCheckOutcomeEventId: row.pre_retirement_check_outcome_event_id,
    receipts: state.retirementReceipts,
    checkOutcomes: state.outcomes.flatMap((item) =>
      ["review_pass", "retirement_check_pass", "retirement_check_fail"].includes(item.event_type)
        ? [{
            id: item.id,
            event_type: item.event_type as "review_pass" | "retirement_check_pass"
              | "retirement_check_fail",
            occurred_on: item.review_completed_on,
            frozen_due_on: item.frozen_due_on,
          }]
        : []),
  });
  assert.equal(retirement.disposition, "HYDRATED");
  if (retirement.disposition !== "HYDRATED") throw new Error("retirement fixture did not hydrate");
  return { schedule: hydrated.schedule, retirement: retirement.state };
}

function applyOutcome(state: ObservationInput, source: ObservationOutcomeRow): TargetRuntimeTransitionPlan {
  const before = state.targetSchedules[0];
  const authorities = currentAuthorities(state);
  const planned = buildTargetRuntimeTransitionPlan({
    schedule: authorities.schedule,
    retirementState: authorities.retirement,
    source,
    authenticUseEvidence: state.authenticUseEvidence.flatMap((row) =>
      ["authentic_correct_use", "self_correction_in_writing"].includes(row.use_kind)
        && ["independent_or_parent_verified_application",
          "prompted_review_writing_application"].includes(row.provenance_kind ?? "")
        ? [{
            eventId: row.id,
            childId: row.child_id,
            canonicalWordId: row.canonical_word_id,
            occurredOn: row.occurred_on,
            useKind: row.use_kind as "authentic_correct_use" | "self_correction_in_writing",
            parentVerified: row.parent_verified,
            provenanceKind: row.provenance_kind as "independent_or_parent_verified_application"
              | "prompted_review_writing_application",
            rowStatus: row.row_status,
          }] : []),
    policyConfig: TARGET_REVIEW_POLICY_CONFIG,
  });
  if (planned.disposition !== "PLANNED") throw new Error(planned.reason);
  const transitionId = `00000000-0000-4000-8000-000000007${String(
    before.word_schedule_transition_count + 1).padStart(3, "0")}`;
  const transition: ObservationTransitionRow = {
    id: transitionId,
    schedule_word_id: IDS.schedule,
    child_id: IDS.child,
    canonical_word_id: IDS.word,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "REVIEW_OUTCOME_APPLIED",
    source_review_outcome_event_id: source.id,
    source_controlled_graduation_receipt_id: null,
    cutover_approval_reference: null,
    idempotency_key: planned.value.transition.idempotencyKey,
    expected_state_revision: before.word_schedule_transition_count,
    applied_state_revision: before.word_schedule_transition_count + 1,
    from_state: authorities.schedule.persistedState,
    to_state: planned.value.transition.toState,
    transition_reason: planned.value.transition.decisionReason,
    reducer_version: planned.value.transition.reducerVersion,
    source_fingerprint: planned.value.transition.sourceFingerprint,
    occurred_at: planned.value.transition.occurredAt,
    created_at: source.completed_at,
  };
  state.transitions = [...state.transitions, transition];
  state.outcomes = [...state.outcomes, source];
  state.encounters = [...state.encounters, {
    id: source.review_encounter_id,
    review_session_id: source.review_session_id,
    schedule_word_id: IDS.schedule,
    canonical_word_id: IDS.word,
    target_order: 1,
    original_outcome: source.original_result,
    original_outcome_source: "audio_retrieval_check",
    review_outcome_event_id: source.id,
    repair_state: source.original_result === "success" ? "not_required" : "completed_correct",
    created_at: source.completed_at,
  }];
  if (planned.value.authority === "TARGET_RETIREMENT_V1") {
    const receipt: ObservationRetirementReceiptRow = {
      id: `00000000-0000-4000-8000-000000008${String(
        before.word_schedule_transition_count + 1).padStart(3, "0")}`,
      schedule_word_id: IDS.schedule,
      child_id: IDS.child,
      canonical_word_id: IDS.word,
      schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
      state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
      retirement_policy_version: FINAL_RUNG_RETIREMENT_POLICY_VERSION,
      retirement_state_version: FINAL_RUNG_RETIREMENT_STATE_VERSION,
      source_review_outcome_event_id: source.id,
      qualifying_authentic_use_event_id: planned.value.qualifyingAuthenticUseEventId,
      pre_retirement_check_outcome_event_id: planned.value.preRetirementCheckOutcomeEventId,
      decision: planned.value.decision,
      decision_reason: planned.value.decisionReason,
      scheduler_reducer_input_state: planned.value.schedulerReducerInputState,
      schedule_transition_event_id: transitionId,
      idempotency_key: planned.value.transition.idempotencyKey,
      expected_state_revision: before.word_schedule_transition_count,
      applied_state_revision: before.word_schedule_transition_count + 1,
      source_fingerprint: planned.value.retirementSourceFingerprint,
      occurred_at: planned.value.transition.occurredAt,
      created_at: source.completed_at,
    };
    state.retirementReceipts = [...state.retirementReceipts, receipt];
  }
  const next = planned.value.transition.toState;
  state.targetSchedules = [{
    ...before,
    membership_status: next.membershipStatus,
    word_interval_index: next.wordIntervalIndex,
    word_next_due_on: next.wordNextDueOn,
    pre_retirement_check_due_on: next.preRetirementCheckDueOn,
    last_28_day_review_on: next.last28DayReviewOn,
    word_schedule_transition_count: before.word_schedule_transition_count + 1,
    word_last_review_completed_on: next.wordLastReviewCompletedOn,
    word_last_review_completed_at: next.wordLastReviewCompletedAt,
    consecutive_independent_failures: next.consecutiveIndependentFailures,
    failure_episode_id: next.failureEpisodeId,
    pre_retirement_check_outcome_event_id: planned.value.authority === "TARGET_RETIREMENT_V1"
      ? planned.value.preRetirementCheckOutcomeEventId
      : before.pre_retirement_check_outcome_event_id,
  }];
  return planned.value;
}

function observe(state: ObservationInput): C2BProductionObservationReceipt {
  return buildC2BProductionObservation(state);
}

function awaitingScenario(): ObservationInput {
  const state = input();
  const plan = applyOutcome(state, outcome(state, {
    ordinal: 1, result: "success", completedOn: "2026-09-01",
  }));
  assert.equal(plan.authority, "TARGET_RETIREMENT_V1");
  if (plan.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(plan.decision, "AWAIT_PRE_RETIREMENT_CHECK");
  return state;
}

function authenticScenario(): ObservationInput {
  const state = input();
  const authentic: ObservationAuthenticUseRow = {
    id: IDS.authentic,
    child_id: IDS.child,
    canonical_word_id: IDS.word,
    occurred_on: "2026-08-15",
    use_kind: "authentic_correct_use",
    parent_verified: true,
    provenance_kind: "independent_or_parent_verified_application",
    row_status: "active",
    source_ref: "writing:fixture",
  };
  state.authenticUseEvidence = [authentic];
  const plan = applyOutcome(state, outcome(state, {
    ordinal: 2, result: "success", completedOn: "2026-09-01",
  }));
  assert.equal(plan.authority, "TARGET_RETIREMENT_V1");
  if (plan.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(plan.decisionReason, "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE");
  return state;
}

function checkPassScenario(): ObservationInput {
  const state = awaitingScenario();
  const plan = applyOutcome(state, outcome(state, {
    ordinal: 3,
    result: "success",
    completedOn: "2026-12-22",
    dueKind: "pre_retirement_check",
  }));
  assert.equal(plan.authority, "TARGET_RETIREMENT_V1");
  if (plan.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(plan.decisionReason, "PRE_RETIREMENT_CHECK_PASS_RETIRED");
  return state;
}

function postCheckScenario(): ObservationInput {
  const state = awaitingScenario();
  const failed = applyOutcome(state, outcome(state, {
    ordinal: 4,
    result: "failure",
    completedOn: "2026-12-22",
    dueKind: "pre_retirement_check",
  }));
  assert.equal(failed.authority, "TARGET_RETIREMENT_V1");
  if (failed.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(failed.decisionReason, "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY");
  const recovered = applyOutcome(state, outcome(state, {
    ordinal: 5,
    result: "success",
    completedOn: "2026-12-23",
    dueKind: "next_day_recovery",
  }));
  assert.equal(recovered.authority, "TARGET_RETIREMENT_V1");
  if (recovered.authority !== "TARGET_RETIREMENT_V1") throw new Error();
  assert.equal(recovered.decisionReason, "POST_CHECK_FINAL_RUNG_PASS_RETIRED");
  assert.equal(recovered.transition.toState.preRetirementCheckDueOn, null);
  return state;
}

const awaiting = awaitingScenario();
const awaitingReceipt = observe(awaiting);
assert.equal(awaitingReceipt.alerts.length, 0);
assert.equal(awaitingReceipt.targetStateCensus[0].retirementLifecycle.status,
  "AWAITING_PRE_RETIREMENT_CHECK");
assert.equal(awaitingReceipt.targetStateCensus[0].retirementLifecycle.projection, "NOT_RETIRED");
assert(awaitingReceipt.progress.some((row) => row.code === "DAY_56_PASS_TO_PRE_RETIREMENT_CHECK"));

const repeated = structuredClone(awaiting);
repeated.observedAt = "2026-09-02T13:00:00.000Z";
assert.equal(observe(repeated).normalizedStateFingerprint, awaitingReceipt.normalizedStateFingerprint);

const delta = structuredClone(awaiting);
delta.previous = awaitingReceipt;
const unchanged = observe(delta);
assert.equal(unchanged.newlyObservedRetirementReceipts.length, 0);
assert.equal(unchanged.noChange[0]?.code, "NO_NEW_C2B_FACTS");

const legacyDelta = structuredClone(awaiting);
legacyDelta.previous = {
  observationVersion: C2B_PRODUCTION_OBSERVATION_LEGACY_VERSION,
  stableRecordFingerprints: {
    transitions: Object.fromEntries(awaiting.transitions.map((row) =>
      [row.id, fingerprintSnapshotValue(row)])),
    outcomes: Object.fromEntries(awaiting.outcomes.map((row) =>
      [row.id, fingerprintSnapshotValue(row)])),
    sessions: {}, completionReceipts: {}, controlledReceipts: {},
  },
};
assert.equal(observe(legacyDelta).newlyObservedRetirementReceipts.length, 1,
  "V1 receipt compatibility starts an explicit FR baseline");

const immediate = observe(authenticScenario());
assert.equal(immediate.alerts.length, 0);
assert.equal(immediate.targetStateCensus[0].retirementLifecycle.projection, "REVIEW_RETIRED");
assert.equal(immediate.targetStateCensus[0].retirementLifecycle.retirementBasis,
  "QUALIFYING_AUTHENTIC_USE");

const checkPass = observe(checkPassScenario());
assert.equal(checkPass.alerts.length, 0);
assert.equal(checkPass.targetStateCensus[0].retirementLifecycle.retirementBasis,
  "PRE_RETIREMENT_CHECK_PASS");

const postCheck = observe(postCheckScenario());
assert.equal(postCheck.alerts.length, 0);
assert.equal(postCheck.targetStateCensus[0].retirementLifecycle.retirementBasis,
  "POST_CHECK_FINAL_RUNG_PASS");
assert(postCheck.interestingEvidence.some((row) =>
  row.code === "PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY"));

const prompted = authenticScenario();
prompted.authenticUseEvidence = prompted.authenticUseEvidence.map((row) => ({
  ...row, provenance_kind: "prompted_review_writing_application",
}));
assert(observe(prompted).alerts.some((row) =>
  row.code === "RETIREMENT_AUTHENTIC_PROVENANCE_CONFLICT"));

const beforeDay28 = authenticScenario();
beforeDay28.authenticUseEvidence = beforeDay28.authenticUseEvidence.map((row) => ({
  ...row, occurred_on: "2026-07-31",
}));
assert(observe(beforeDay28).alerts.some((row) =>
  row.code === "RETIREMENT_AUTHENTIC_PROVENANCE_CONFLICT"));

const missingReceipt = authenticScenario();
missingReceipt.retirementReceipts = [];
assert(observe(missingReceipt).alerts.some((row) => row.code === "RETIREMENT_HYDRATION_REJECTED"));

const duplicateReceipt = authenticScenario();
duplicateReceipt.retirementReceipts = [...duplicateReceipt.retirementReceipts, {
  ...duplicateReceipt.retirementReceipts[0],
  id: "00000000-0000-4000-8000-000000009001",
}];
const duplicateObserved = observe(duplicateReceipt);
assert(duplicateObserved.alerts.some((row) => row.code === "DUPLICATE_RETIREMENT_TRANSITION"));
assert(duplicateObserved.alerts.some((row) => row.code === "DUPLICATE_RETIREMENT_SOURCE"));

const wrongLineage = authenticScenario();
wrongLineage.retirementReceipts = wrongLineage.retirementReceipts.map((row) => ({
  ...row, canonical_word_id: "00000000-0000-4000-8000-000000009002",
}));
assert(observe(wrongLineage).alerts.some((row) => row.code === "RETIREMENT_RECEIPT_LINEAGE_CONFLICT"));

const secondWait = postCheckScenario();
secondWait.retirementReceipts = [...secondWait.retirementReceipts, {
  ...secondWait.retirementReceipts[0],
  id: "00000000-0000-4000-8000-000000009003",
  source_review_outcome_event_id: "00000000-0000-4000-8000-000000009004",
  schedule_transition_event_id: "00000000-0000-4000-8000-000000009005",
  expected_state_revision: 3,
  applied_state_revision: 4,
}];
assert(observe(secondWait).alerts.some((row) => row.code === "SECOND_PRE_RETIREMENT_WAIT"));

const repairCheck = checkPassScenario();
repairCheck.outcomes = repairCheck.outcomes.map((row) => row.due_kind === "pre_retirement_check"
  ? { ...row, event_type: "review_repair" } : row);
assert(observe(repairCheck).alerts.some((row) => row.code === "RETIREMENT_CHECK_LINEAGE_CONFLICT"));

const early = awaitingScenario();
early.sessions = [{
  id: "00000000-0000-4000-8000-000000009006",
  child_id: IDS.child,
  daily_assignment_id: "fixture-assignment",
  assignment_date: "2026-12-21",
  snapshot_fingerprint: "a".repeat(64),
  stage: "ready_to_complete",
  state_version: 1,
  completed_at: null,
  created_at: "2026-12-21T09:00:00.000Z",
  target_schedule_word_ids: [IDS.schedule],
  target_v2_schedule_word_ids: [IDS.schedule],
  target_snapshot_facts: [{
    scheduleWordId: IDS.schedule,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    wordScheduleVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    membershipStatus: "pre_retirement_check",
    intervalIndex: 5,
    dueOn: "2026-12-22",
  }],
}];
assert(observe(early).alerts.some((row) => row.code === "TARGET_WORD_APPEARED_BEFORE_DUE"));

const reappeared = postCheckScenario();
reappeared.sessions = [{
  ...early.sessions[0],
  id: "00000000-0000-4000-8000-000000009007",
  assignment_date: "2026-12-24",
  created_at: "2026-12-24T09:00:00.000Z",
  target_snapshot_facts: [{
    ...early.sessions[0].target_snapshot_facts[0],
    membershipStatus: "scheduled_review",
    dueOn: "2026-12-24",
  }],
}];
assert(observe(reappeared).alerts.some((row) => row.code === "RETIRED_TARGET_REAPPEARED"));

const rewritten = authenticScenario();
rewritten.previous = observe(authenticScenario());
rewritten.retirementReceipts = rewritten.retirementReceipts.map((row) => ({
  ...row, created_at: "2026-09-01T10:00:01.000Z",
}));
assert(observe(rewritten).alerts.some((row) => row.code === "PROTECTED_HISTORY_REWRITTEN"));

const policyDrift = awaitingScenario();
policyDrift.targetPolicy = { ...policyDrift.targetPolicy, is_default_for_new_schedules: true };
assert(observe(policyDrift).alerts.some((row) => row.code === "TARGET_POLICY_REGISTRY_DRIFT"));

const absent = input();
absent.retirementCapability = "ABSENT";
assert.equal(observe(absent).targetStateCensus[0].retirementLifecycle.status, "NOT_AVAILABLE");
const absentConflict = awaitingScenario();
absentConflict.retirementCapability = "ABSENT";
absentConflict.retirementReceipts = [];
assert(observe(absentConflict).alerts.some((row) =>
  row.code === "RETIREMENT_CAPABILITY_MISSING_FOR_STATE"));

const retiredProjection = computeWordEvidenceState(EVIDENCE_POLICY_V1, {
  childId: IDS.child, canonicalWordId: IDS.word, score: 0, entries: [], productions: [],
}, {
  outcomeEvents: [], taughtHistory: [], slippageEvents: [],
  retirementReceipts: [{
    receiptId: "00000000-0000-4000-8000-000000009008",
    scheduleWordId: IDS.schedule,
    childId: IDS.child,
    canonicalWordId: IDS.word,
    sourceReviewOutcomeEventId: "00000000-0000-4000-8000-000000009009",
    decision: "RETIRE",
    decisionReason: "PRE_RETIREMENT_CHECK_PASS_RETIRED",
    occurredOn: "2026-12-22",
    appliedStateRevision: 2,
  }],
});
assert.equal(retiredProjection.state, "review_retired");

const runner = readFileSync(resolve("scripts/adle-c2b-production-observation.ts"), "utf8");
assert.match(runner, /begin transaction isolation level repeatable read read only/i);
assert.match(runner, /--expected-retirement-capability absent\|present/);
assert.match(runner, /RETIREMENT_CAPABILITY_SQL/);
assert.match(runner, /RETIREMENT_PROTECTED_SQL/);
assert.doesNotMatch(runner, /\.rpc\s*\(/);
assert.doesNotMatch(runner, /\b(apply|finalize|prepare)_adle_[a-z0-9_]+\s*\(/i);
assert.match(runner, /await client\.query\("rollback"\)/);
const loader = readFileSync(resolve("lib/adle/loaders/composer-facts-loader.ts"), "utf8");
assert.match(loader, /\.eq\("decision", "RETIRE"\)/);
assert.match(loader, /retirement receipt lineage malformed/);
assert.match(loader, /sourceReviewOutcomeEventId: receipt\.source_review_outcome_event_id/);
assert.match(loader, /scheduleRow\.word_schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION/);

const matrix = {
  awaiting: awaitingReceipt.normalizedStateFingerprint,
  immediate: immediate.normalizedStateFingerprint,
  checkPass: checkPass.normalizedStateFingerprint,
  postCheck: postCheck.normalizedStateFingerprint,
  stableRepeat: observe(repeated).normalizedStateFingerprint,
};
const fixtureFingerprint = createHash("sha256")
  .update(fingerprintSnapshotValue(matrix))
  .digest("hex");

console.log(JSON.stringify({
  status: "PASS",
  fixtureClasses: 33,
  fixtureFingerprint,
  observationVersion: awaitingReceipt.observationVersion,
  exactRetirementParity: true,
  reviewRetiredReceiptProjection: true,
  v1PreviousReceiptCompatibility: true,
  productionRunnerMutationSurface: false,
}, null, 2));
