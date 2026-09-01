import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildApprovedCutoverCandidate } from "../lib/adle/review-policy/cutover-persistence";
import { previewScheduleWordCutover } from "../lib/adle/review-policy/cutover-preview";
import { selectDueMixedReviewWords } from "../lib/adle/review-policy/mixed-due-selection";
import {
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import { hydratePersistedReviewSchedule, type PersistedReviewPolicyRow, type PersistedReviewScheduleWordRow } from "../lib/adle/review-policy/runtime-coexistence";
import { buildTargetReviewTransitionPlan } from "../lib/adle/review-policy/target-transition-persistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";

const ID = {
  child: "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e",
  schedule: "5d5e843f-df5d-4188-ae53-65158b02021d",
  word: "0ea41f17-bd7c-5f7d-b264-ea94567388f8",
};
const previewFingerprint = "afcc63a76c0f9d0943ec62606407faecd01182606875b32dc7930993cf1559e4";
const targetPolicy: PersistedReviewPolicyRow = {
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
const row: PersistedReviewScheduleWordRow = {
  id: ID.schedule, child_id: ID.child, canonical_word_id: ID.word, bundle_id: null,
  membership_status: "scheduled", taught_on: "2026-08-01", row_status: "active",
  word_schedule_version: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  word_schedule_policy_version: CURRENT_REVIEW_POLICY_VERSION,
  word_interval_index: 1, word_next_due_on: "2026-09-01", catch_up_stage: 0,
  next_retest_due_on: null, failed_review_on: null, pre_retirement_check_due_on: null,
  last_28_day_review_on: null, reteach_cycle_count: 0, word_schedule_transition_count: 4,
  word_last_review_completed_on: "2026-08-29", word_last_review_completed_at: "2026-08-29T12:00:00Z",
  consecutive_independent_failures: null, failure_episode_id: null,
};

const preview = previewScheduleWordCutover({ row, targetPolicy, asOfDate: "2026-09-01" });
assert.equal(preview.eligibility, "ELIGIBLE");
const candidate = buildApprovedCutoverCandidate({
  record: preview, reviewedPreviewFingerprint: previewFingerprint,
  approvalReference: "OWNER_DECISION_C2B6_2026-09-01",
});
assert.equal(candidate.expectedRevision, 4);
assert.equal(candidate.expectedIntervalIndex, 1);
assert.equal(candidate.expectedDueOn, "2026-09-01");
assert.equal(candidate.toState.wordIntervalIndex, 1);
assert.equal(candidate.toState.wordNextDueOn, "2026-09-01");
assert.equal(candidate.toState.consecutiveIndependentFailures, 0);
assert.equal(candidate.toState.failureEpisodeId, null);

const cutoverTransition = {
  schedule_word_id: ID.schedule,
  schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  transition_kind: "POLICY_CUTOVER_APPLIED" as const,
  source_review_outcome_event_id: null,
  source_controlled_graduation_receipt_id: null,
  expected_state_revision: 4,
  applied_state_revision: 5,
  from_state: {
    stateShapeVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
    schedulePolicyVersion: CURRENT_REVIEW_POLICY_VERSION,
    membershipStatus: "scheduled", wordIntervalIndex: 1,
    wordNextDueOn: "2026-09-01", stateRevision: 4,
  },
  to_state: candidate.toState,
  transition_reason: "POLICY_CUTOVER_APPROVED_CLEAN_SCHEDULED",
};
const hydrated = hydratePersistedReviewSchedule({
  row: {
    ...row, word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    consecutive_independent_failures: 0, failure_episode_id: null,
    word_schedule_transition_count: 5,
  },
  transitions: [cutoverTransition],
});
assert.equal(hydrated.disposition, "HYDRATED");
if (hydrated.disposition !== "HYDRATED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
  throw new Error("target cutover hydration failed");
}
assert.equal(hydrated.schedule.state.route.membership, "SCHEDULED");
assert.equal(hydrated.schedule.state.failureLineage.resolution, "NONE");
const targetExecution = buildTargetReviewTransitionPlan({
  schedule: hydrated.schedule,
  source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: {
    id: "00000000-0000-4000-8000-000000000021",
    schedule_word_id: ID.schedule, child_id: ID.child, canonical_word_id: ID.word,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    due_kind: "scheduled_review", frozen_interval_index: 1,
    original_result: "success", review_completed_on: "2026-09-01",
    completed_at: "2026-09-01T12:00:00Z",
  } },
  policyConfig: TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(targetExecution.disposition, "PLANNED");
if (targetExecution.disposition === "PLANNED") {
  assert.equal(targetExecution.value.toState.wordIntervalIndex, 2);
  assert.equal(targetExecution.value.toState.wordNextDueOn, "2026-09-08");
}

const v1Word = {
  scheduleWordId: "00000000-0000-4000-8000-000000000011", childId: ID.child,
  canonicalWordId: "00000000-0000-4000-8000-000000000012", sourceBundleId: null,
  scheduleVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  schedulePolicyVersion: CURRENT_REVIEW_POLICY_VERSION, intervalIndex: 0,
  nextDueOn: "2026-09-01", membershipStatus: "scheduled" as const, catchUpStage: 0 as const,
  nextRetestDueOn: null, preRetirementCheckDueOn: null, taughtOn: "2026-08-01", rowStatus: "active" as const,
};
const mixed = selectDueMixedReviewWords({
  today: "2026-09-01", sessionCap: 10, currentWords: [v1Word],
  targetWords: [{ schedule: hydrated.schedule, taughtOn: "2026-08-01" }],
});
assert.equal(mixed.length, 2);
assert.deepEqual(new Set(mixed.map((item) => item.wordScheduleVersion)), new Set([
  CURRENT_PER_WORD_STATE_SHAPE_VERSION, TARGET_PER_WORD_STATE_SHAPE_VERSION,
]));
assert.equal(selectDueMixedReviewWords({
  today: "2026-09-01", sessionCap: 10, currentWords: [v1Word], targetWords: [],
})[0]?.scheduleWordId, v1Word.scheduleWordId, "v1-only selection must remain exact");

const migration = readFileSync(resolve("supabase/migrations/20260901120000_add_adle_c2b6_controlled_opt_in.sql"), "utf8");
assert.match(migration, /for update/);
assert.match(migration, /adle_c2b6_cutover_preview_drift/);
assert.match(migration, /adle_c2b6_cutover_stale_revision/);
assert.match(migration, /POLICY_CUTOVER_APPLIED/);
assert.match(migration, /word_schedule_transition_count = word_schedule_transition_count \+ 1/);
assert.match(migration, /membership_status <> 'scheduled'/);
assert.match(migration, /word_interval_index\s*<\s*5/);
assert.match(migration, /transition_kind = 'REVIEW_OUTCOME_APPLIED'|REVIEW_OUTCOME_APPLIED/);
assert.match(migration, /p_transition_plans jsonb/);
assert.match(migration, /v_plan->'toState'/);
assert.doesNotMatch(migration, /is_active\s*=\s*true|is_default_for_new_schedules\s*=\s*true/i);
assert.doesNotMatch(migration, /update\s+public\.adle_review_policy_versions/i);
assert.doesNotMatch(migration, /update\s+public\.adle_review_bundles/i);
assert.doesNotMatch(migration, /DAY_1|DAY_3|DAY_7|DAY_14|DAY_28|DAY_56/,
  "SQL must not contain the target rung transition table");

const generation = readFileSync(resolve("lib/adle/review-v3/r6-generation.ts"), "utf8");
assert.match(generation, /selectDueMixedReviewWords/);
assert.match(generation, /loadReviewScheduleForExecution/);
assert.match(generation, /persist_adle_review_assignment_c2b6/);
assert.match(generation, /CURRENT_REVIEW_POLICY_VERSION/);
assert.doesNotMatch(generation, /\.eq\("is_active", true\)/);
const persistence = readFileSync(resolve("lib/adle/review-v3/r6-persistence.ts"), "utf8");
assert.match(persistence, /reviewSessionContainsTargetV2/);
assert.match(persistence, /finalizeMixedPolicyReviewSessionC2B6/);
assert.match(persistence, /finalize_adle_review_stage_r6/,
  "released v1-only finalizer remains the unchanged fallback");

console.log(JSON.stringify({
  status: "PASS",
  requiredCases: 15,
  previewFingerprint,
  cohortChildId: ID.child,
  maximumApprovedCohort: 19,
  targetActive: false,
  targetDefault: false,
  currentOnlySelectionStable: true,
  mixedHydrationAndSelection: true,
}, null, 2));
