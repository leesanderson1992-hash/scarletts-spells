import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { canonicalUtcTimestampMilliseconds } from "../lib/adle/review-policy/canonical-timestamp";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import {
  hydratePersistedReviewSchedule,
  type PersistedReviewScheduleWordRow,
} from "../lib/adle/review-policy/runtime-coexistence";
import { buildTargetReviewTransitionPlan } from "../lib/adle/review-policy/target-transition-persistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";

const MICROSECOND = "2026-09-01T12:04:44.123456+00:00";
const MILLISECOND = "2026-09-01T12:04:44.123+00:00";
assert.equal(canonicalUtcTimestampMilliseconds(MICROSECOND), MILLISECOND);
assert.equal(canonicalUtcTimestampMilliseconds(MILLISECOND), MILLISECOND);
assert.equal(canonicalUtcTimestampMilliseconds("2026-09-01T12:04:44Z"), "2026-09-01T12:04:44+00:00");
assert.throws(() => canonicalUtcTimestampMilliseconds("not-an-instant"), /adle_canonical_timestamp_invalid/);

const ids = {
  child: "00000000-0000-4000-8000-000000000701",
  word: "00000000-0000-4000-8000-000000000702",
  schedule: "00000000-0000-4000-8000-000000000703",
  outcome: "00000000-0000-4000-8000-000000000704",
};
const row: PersistedReviewScheduleWordRow = {
  id: ids.schedule,
  child_id: ids.child,
  canonical_word_id: ids.word,
  bundle_id: null,
  membership_status: "scheduled",
  taught_on: "2026-08-28",
  row_status: "active",
  word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  word_interval_index: 0,
  word_next_due_on: "2026-09-01",
  catch_up_stage: 0,
  next_retest_due_on: null,
  failed_review_on: null,
  pre_retirement_check_due_on: null,
  last_28_day_review_on: null,
  reteach_cycle_count: 0,
  word_schedule_transition_count: 0,
  word_last_review_completed_on: null,
  word_last_review_completed_at: null,
  consecutive_independent_failures: 0,
  failure_episode_id: null,
};
const hydrated = hydratePersistedReviewSchedule({ row });
if (hydrated.disposition !== "HYDRATED") throw new Error(`target fixture rejected: ${hydrated.reason}`);
assert.equal(hydrated.schedule.kind, "TARGET_REGRESSION_V1");
const schedule = hydrated.schedule;

function plan(completedAt: string) {
  return buildTargetReviewTransitionPlan({
    schedule,
    source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: {
      id: ids.outcome,
      schedule_word_id: ids.schedule,
      child_id: ids.child,
      canonical_word_id: ids.word,
      schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
      word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
      due_kind: "scheduled_review",
      frozen_interval_index: 0,
      original_result: "success",
      review_completed_on: "2026-09-01",
      completed_at: completedAt,
    } },
    policyConfig: TARGET_REVIEW_POLICY_CONFIG,
  });
}

const microsecondPlan = plan(MICROSECOND);
const millisecondPlan = plan(MILLISECOND);
assert.equal(microsecondPlan.disposition, "PLANNED");
assert.equal(millisecondPlan.disposition, "PLANNED");
if (microsecondPlan.disposition !== "PLANNED" || millisecondPlan.disposition !== "PLANNED") {
  throw new Error("target plan unexpectedly rejected");
}
assert.equal(microsecondPlan.value.occurredAt, MILLISECOND);
assert.deepEqual(microsecondPlan.value.toState, millisecondPlan.value.toState);
assert.equal(microsecondPlan.value.sourceFingerprint, millisecondPlan.value.sourceFingerprint);

const migration = readFileSync(resolve(
  "supabase/migrations/20260901130000_normalize_adle_c2b6_review_completion_milliseconds.sql",
), "utf8");
assert.match(migration, /v_completed_at:=date_trunc\('milliseconds',clock_timestamp\(\)\)/);
assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into\s+)?public\.adle_review_/i);
assert.match(migration, /grant execute on function public\.prepare_adle_review_finalization_c2b6\(uuid,text\)\s+to service_role/);
assert.doesNotMatch(migration, /grant execute[\s\S]*to (public|anon|authenticated)/i);

const parityEnvelope = {
  scheduleWordId: ids.schedule,
  transitionKind: "REVIEW_OUTCOME_APPLIED",
  sourceReviewOutcomeEventId: ids.outcome,
  sourceControlledGraduationReceiptId: null,
  idempotencyKey: `review-outcome:${ids.outcome}`,
  expectedStateRevision: 0,
  fromState: schedule.kind === "TARGET_REGRESSION_V1"
    ? schedule.persistedState
    : null,
  toState: microsecondPlan.value.toState,
  transitionReason: microsecondPlan.value.decisionReason,
  reducerVersion: microsecondPlan.value.reducerVersion,
  occurredAt: MILLISECOND,
};
assert.equal(fingerprintSnapshotValue(parityEnvelope), microsecondPlan.value.sourceFingerprint);

console.log(JSON.stringify({
  status: "PASS",
  canonicalMicrosecondInput: MICROSECOND,
  canonicalMillisecondOutput: MILLISECOND,
  targetPlanFingerprint: microsecondPlan.value.sourceFingerprint,
  microsecondMillisecondPlansIdentical: true,
  migrationDataMutation: false,
}, null, 2));
