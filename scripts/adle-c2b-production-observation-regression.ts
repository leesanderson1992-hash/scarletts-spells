import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import {
  buildC2BProductionObservation,
  type C2BProductionObservationReceipt,
  type ObservationInput,
  type ObservationOutcomeRow,
  type ObservationScheduleRow,
  type ObservationTransitionRow,
} from "../lib/adle/review-policy/production-observation";
import {
  hydratePersistedReviewSchedule,
  type PersistedReviewPolicyRow,
} from "../lib/adle/review-policy/runtime-coexistence";
import { buildTargetReviewTransitionPlan } from "../lib/adle/review-policy/target-transition-persistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";

const ids = {
  child: "00000000-0000-4000-8000-000000008001",
  word: "00000000-0000-4000-8000-000000008002",
  schedule: "00000000-0000-4000-8000-000000008003",
  session: "00000000-0000-4000-8000-000000008004",
  encounter: "00000000-0000-4000-8000-000000008005",
  outcome: "00000000-0000-4000-8000-000000008006",
  transition: "00000000-0000-4000-8000-000000008007",
  completion: "00000000-0000-4000-8000-000000008008",
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

function initialRow(rung = 0, due = "2026-09-01"): ObservationScheduleRow {
  return {
    id: ids.schedule, child_id: ids.child, canonical_word_id: ids.word, bundle_id: null,
    membership_status: "scheduled", taught_on: "2026-08-01", row_status: "active",
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_interval_index: rung, word_next_due_on: due, catch_up_stage: 0,
    next_retest_due_on: null, failed_review_on: null, pre_retirement_check_due_on: null,
    last_28_day_review_on: null, reteach_cycle_count: 0, word_schedule_transition_count: 0,
    word_last_review_completed_on: null, word_last_review_completed_at: null,
    consecutive_independent_failures: 0, failure_episode_id: null,
    pre_retirement_check_outcome_event_id: null,
  };
}

function fixture(result: "success" | "failure" = "success", rung = 0): ObservationInput {
  const before = initialRow(rung);
  const hydrated = hydratePersistedReviewSchedule({ row: before });
  if (hydrated.disposition !== "HYDRATED") throw new Error("fixture hydration rejected");
  const outcome: ObservationOutcomeRow = {
    id: ids.outcome, schedule_word_id: ids.schedule, child_id: ids.child,
    canonical_word_id: ids.word, schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION, due_kind: "scheduled_review",
    frozen_interval_index: rung, original_result: result, review_completed_on: "2026-09-01",
    completed_at: "2026-09-01T10:00:00.000+00:00", review_session_id: ids.session,
    review_encounter_id: ids.encounter, event_type: result === "success" ? "review_pass" : "review_fail",
    result_source: "review_audio_check", frozen_due_on: "2026-09-01",
    assignment_practice_date: "2026-09-01", source_provenance: { fixture: true },
    created_at: "2026-09-01T10:00:00.001Z",
  };
  const planned = buildTargetReviewTransitionPlan({
    schedule: hydrated.schedule,
    source: { kind: "REVIEW_OUTCOME_APPLIED", outcome },
    policyConfig: TARGET_REVIEW_POLICY_CONFIG,
  });
  if (planned.disposition !== "PLANNED") throw new Error("fixture transition rejected");
  const transition: ObservationTransitionRow = {
    id: ids.transition, schedule_word_id: ids.schedule, child_id: ids.child,
    canonical_word_id: ids.word, schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "REVIEW_OUTCOME_APPLIED", source_review_outcome_event_id: ids.outcome,
    source_controlled_graduation_receipt_id: null, cutover_approval_reference: null,
    idempotency_key: `review-outcome:${ids.outcome}`, expected_state_revision: 0,
    applied_state_revision: 1, from_state: hydrated.schedule.kind === "TARGET_REGRESSION_V1"
      ? hydrated.schedule.persistedState : {}, to_state: planned.value.toState,
    transition_reason: planned.value.decisionReason, reducer_version: planned.value.reducerVersion,
    source_fingerprint: planned.value.sourceFingerprint,
    occurred_at: planned.value.occurredAt, created_at: "2026-09-01T10:00:00.002Z",
  };
  const after: ObservationScheduleRow = {
    ...before,
    membership_status: planned.value.toState.membershipStatus,
    word_interval_index: planned.value.toState.wordIntervalIndex,
    word_next_due_on: planned.value.toState.wordNextDueOn,
    word_schedule_transition_count: 1,
    word_last_review_completed_on: planned.value.toState.wordLastReviewCompletedOn,
    word_last_review_completed_at: planned.value.toState.wordLastReviewCompletedAt,
    consecutive_independent_failures: planned.value.toState.consecutiveIndependentFailures,
    failure_episode_id: planned.value.toState.failureEpisodeId,
  };
  return {
    observedAt: "2026-09-01T11:00:00.000Z", sourceBaseline: "716aab3",
    deploymentIdentity: "fixture-deployment", productionProjectRef: "fixture-production",
    learnerId: ids.child, approvedTargetScheduleIds: [ids.schedule], targetSchedules: [after],
    retirementCapability: "ABSENT",
    targetPolicy: policy, transitions: [transition], outcomes: [outcome],
    encounters: [{
      id: ids.encounter, review_session_id: ids.session, schedule_word_id: ids.schedule,
      canonical_word_id: ids.word, target_order: 1, original_outcome: result,
      original_outcome_source: "audio_retrieval_check", review_outcome_event_id: ids.outcome,
      repair_state: result === "success" ? "not_required" : "completed_correct",
      created_at: "2026-09-01T09:00:00.000Z",
    }],
    sessions: [{
      id: ids.session, child_id: ids.child, daily_assignment_id: "assignment", assignment_date: "2026-09-01",
      snapshot_fingerprint: "a".repeat(64), stage: "completed", state_version: 1,
      completed_at: "2026-09-01T10:00:00.000Z", created_at: "2026-09-01T09:00:00.000Z",
      target_schedule_word_ids: [ids.schedule], target_v2_schedule_word_ids: [ids.schedule],
      target_snapshot_facts: [{ scheduleWordId: ids.schedule,
        schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
        wordScheduleVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
        membershipStatus: "scheduled_review", intervalIndex: rung, dueOn: "2026-09-01" }],
    }],
    completionReceipts: [{
      id: ids.completion, review_session_id: ids.session, snapshot_fingerprint: "a".repeat(64),
      request_fingerprint: "b".repeat(64), completed_at: "2026-09-01T10:00:00.000Z",
      review_completed_on: "2026-09-01", result_payload: { ok: true },
      created_at: "2026-09-01T10:00:00.003Z",
    }],
    controlledReceipts: [], retirementReceipts: [], authenticUseEvidence: [],
    logs: [], previous: null,
  };
}

function observe(input: ObservationInput): C2BProductionObservationReceipt {
  return buildC2BProductionObservation(input);
}

const pass = observe(fixture("success", 0));
assert.equal(pass.alerts.length, 0);
assert(pass.progress.some((row) => row.code === "SCHEDULED_PASS_ADVANCED"));
assert(pass.invariantChecks.every((row) => row.passed));

const sameInput = fixture("success", 0);
sameInput.observedAt = "2026-09-01T12:00:00.000Z";
const repeated = observe(sameInput);
assert.equal(repeated.normalizedStateFingerprint, pass.normalizedStateFingerprint);

const deltaInput = fixture("success", 0);
deltaInput.previous = pass;
const noChange = observe(deltaInput);
assert.equal(noChange.newlyObservedTargetTransitions.length, 0);
assert.equal(noChange.progress.length, 0);
assert.equal(noChange.alerts.length, 0);
assert.equal(noChange.noChange[0]?.code, "NO_NEW_C2B_FACTS");

const failure = observe(fixture("failure", 1));
assert.equal(failure.alerts.length, 0);
assert(failure.interestingEvidence.some((row) =>
  row.code === "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY"));

const duplicateInput = fixture();
duplicateInput.transitions = [...duplicateInput.transitions, {
  ...duplicateInput.transitions[0], id: "00000000-0000-4000-8000-000000008009",
}];
assert(observe(duplicateInput).alerts.some((row) => row.code === "DUPLICATE_SOURCE_TRANSITION"));

const missingInput = fixture();
missingInput.transitions = [];
missingInput.targetSchedules = [{ ...missingInput.targetSchedules[0], word_schedule_transition_count: 0 }];
assert(observe(missingInput).alerts.some((row) => row.code === "MISSING_TARGET_TRANSITION"));

const revisionInput = fixture();
revisionInput.targetSchedules = [{ ...revisionInput.targetSchedules[0], word_schedule_transition_count: 2 }];
assert(observe(revisionInput).alerts.some((row) => row.code === "REVISION_DISCONTINUITY"));

const v1Input = fixture();
v1Input.outcomes = [{ ...v1Input.outcomes[0],
  schedule_policy_version: "review_policy_v1_2026-07-04",
  word_schedule_version: "adle_review_per_word_schedule_v1" }];
assert(observe(v1Input).alerts.some((row) => row.code === "TARGET_OUTCOME_USED_V1_AUTHORITY"));

const replayInput = fixture();
replayInput.previous = pass;
const replay = observe(replayInput);
assert.equal(replay.newlyObservedTargetTransitions.length, 0);
assert(!replay.alerts.some((row) => row.code.includes("REPLAY")));

const earlyInput = fixture();
earlyInput.sessions = [{ ...earlyInput.sessions[0], assignment_date: "2026-08-31" }];
assert(observe(earlyInput).alerts.some((row) => row.code === "TARGET_WORD_APPEARED_BEFORE_DUE"));

const expectedDue = observe(fixture());
assert(!expectedDue.alerts.some((row) => row.code === "TARGET_WORD_APPEARED_BEFORE_DUE"));

const policyInput = fixture();
policyInput.targetPolicy = { ...policyInput.targetPolicy, is_active: true };
assert(observe(policyInput).alerts.some((row) => row.code === "TARGET_POLICY_REGISTRY_DRIFT"));

const rewrittenInput = fixture();
rewrittenInput.previous = pass;
rewrittenInput.completionReceipts = [{ ...rewrittenInput.completionReceipts[0], result_payload: { ok: false } }];
assert(observe(rewrittenInput).alerts.some((row) => row.code === "PROTECTED_HISTORY_REWRITTEN"));

const runner = readFileSync(resolve("scripts/adle-c2b-production-observation.ts"), "utf8");
assert.match(runner, /begin transaction isolation level repeatable read read only/i);
assert.match(runner, /show transaction_read_only/i);
assert.match(runner, /await client\.query\("rollback"\)/);
assert.doesNotMatch(runner, /\.rpc\s*\(/);
assert.doesNotMatch(runner, /\b(apply|finalize|prepare)_adle_[a-z0-9_]+\s*\(/i);
assert.match(runner, /const forbidden = \["--apply", "--write"/);
assert.match(runner, /--expected-retirement-capability/);
assert.equal(fingerprintSnapshotValue(pass), fingerprintSnapshotValue(pass));

console.log(JSON.stringify({
  status: "PASS",
  fixtureClasses: 14,
  normalizedFingerprintStable: true,
  deltaDoesNotRepeatOldFacts: true,
  productionRunnerMutationSurface: false,
}, null, 2));
