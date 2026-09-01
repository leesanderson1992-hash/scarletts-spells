import assert from "node:assert/strict";

import {
  canonicalUtcTimestampExactComparison,
  canonicalUtcTimestampMilliseconds,
} from "../lib/adle/review-policy/canonical-timestamp";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import {
  equalPersistedTargetStatesForHistory,
  hydratePersistedReviewSchedule,
  type PersistedReviewScheduleStateC2B2,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "../lib/adle/review-policy/runtime-coexistence";

const CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";

type Shape = {
  id: string;
  canonicalWordId: string;
  revision: number;
  intervalIndex: number;
  dueOn: string;
  historicalTimestamp: string | null;
  canonicalTimestamp: string | null;
};

const shapes: Shape[] = [
  ["09b3011a-251e-4965-83b3-c9543207f1f9", "66577bba-d406-51f0-b826-75b19d234d5c", 2, 1, "2026-09-04", "2026-09-01 12:03:43.643+00", "2026-09-01T12:03:43.643+00:00"],
  ["0ac95e15-b2fa-4aed-9017-0cc82a4fe50b", "73efe7d1-9186-5e4b-933c-4f1d6a1a0ba9", 2, 1, "2026-09-04", "2026-09-01 12:03:43.643+00", "2026-09-01T12:03:43.643+00:00"],
  ["0daad7b6-f09d-452f-ad40-12d77f43774a", "a32cdc9f-88c0-5dd5-b844-9e2f2fa52713", 2, 1, "2026-08-30", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["21176bb1-3587-40be-a53e-19e9ccd964a7", "ec7d7616-676c-5d4d-b986-dfd2a7c1f97c", 2, 1, "2026-09-04", "2026-09-01 12:03:43.643+00", "2026-09-01T12:03:43.643+00:00"],
  ["43c8c5cf-d6e2-4a7f-962d-12848e456c19", "d9350337-6486-56bf-ba48-f7fdd063e748", 2, 1, "2026-08-30", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["4d72c04c-cfd1-4d70-aae0-19bd41120536", "e2c0f099-ac92-5ded-ac80-05f40f1135f0", 2, 2, "2026-09-03", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["5d5e843f-df5d-4188-ae53-65158b02021d", "0ea41f17-bd7c-5f7d-b264-ea94567388f8", 2, 1, "2026-09-04", "2026-09-01T12:03:43.643+00:00", "2026-09-01T12:03:43.643+00:00"],
  ["64c8a1a1-ebd0-4fe8-b210-254e9caa131f", "2c8be08f-1205-5422-9799-f95b43a455f8", 2, 1, "2026-09-04", "2026-09-01 12:03:43.643+00", "2026-09-01T12:03:43.643+00:00"],
  ["74713a4b-d9ac-4e12-9029-2ca616540cc2", "dab17452-f475-5ffc-96f8-cc9358e36abe", 2, 1, "2026-09-01", "2026-08-29 07:33:01.868278+00", "2026-08-29T07:33:01.868278+00:00"],
  ["93f641f4-e8ef-484a-8709-b6b4ba49f657", "abd80ebb-ca67-47c2-8cdb-ae58f8cef11f", 2, 1, "2026-09-01", "2026-08-29 07:33:01.868278+00", "2026-08-29T07:33:01.868278+00:00"],
  ["9444b26e-9546-4e3d-95bf-ce39d7c4616c", "1f459c84-8f54-4dab-bed3-1f0d4c954536", 2, 1, "2026-08-30", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["9a31a74b-57dc-409a-9806-82c0ecb36566", "856d90b2-a871-41db-8597-7707fa30acfd", 1, 0, "2026-08-29", null, null],
  ["9bddf825-80d1-4158-9e27-3fbda6c27e32", "5791a5dd-6576-5fed-9e25-427e9efe7673", 2, 1, "2026-08-30", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["9e8b4953-a11e-4e0d-b8ee-9d381f91127f", "e36f28b7-519b-5f86-99ee-4e3521db21e7", 2, 1, "2026-09-04", "2026-09-01 12:03:43.643+00", "2026-09-01T12:03:43.643+00:00"],
  ["ab948cda-7baf-4662-9cb1-6d2caff84b1a", "821f2a3f-1cbe-4068-b7c3-483efb839ada", 2, 1, "2026-09-01", "2026-08-29 07:33:01.868278+00", "2026-08-29T07:33:01.868278+00:00"],
  ["b0623db0-bbef-4a95-a798-87f3ec802410", "8393ad7f-5987-5731-8ac1-b7c306f58838", 3, 2, "2026-09-05", "2026-08-29 07:33:01.868278+00", "2026-08-29T07:33:01.868278+00:00"],
  ["b88454c0-13ee-4892-857d-92a06821aba6", "dcc56b79-450f-4213-b340-b097c33813ae", 2, 1, "2026-08-30", "2026-08-27 10:03:48.542852+00", "2026-08-27T10:03:48.542852+00:00"],
  ["f54f2ea3-5bbb-477d-881d-baedbc27b69a", "bf239c62-fdcb-5982-87b3-7dfe295304ce", 2, 1, "2026-09-01", "2026-08-29 07:33:01.868278+00", "2026-08-29T07:33:01.868278+00:00"],
].map(([id, canonicalWordId, revision, intervalIndex, dueOn, historicalTimestamp, canonicalTimestamp]) => ({
  id: id as string,
  canonicalWordId: canonicalWordId as string,
  revision: revision as number,
  intervalIndex: intervalIndex as number,
  dueOn: dueOn as string,
  historicalTimestamp: historicalTimestamp as string | null,
  canonicalTimestamp: canonicalTimestamp as string | null,
}));

function state(shape: Shape, timestamp: string | null): PersistedReviewScheduleStateC2B2 {
  return {
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    membershipStatus: "scheduled",
    wordIntervalIndex: shape.intervalIndex,
    wordNextDueOn: shape.dueOn,
    consecutiveIndependentFailures: 0,
    failureEpisodeId: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: null,
    wordLastReviewCompletedOn: timestamp === null ? null : timestamp.slice(0, 10),
    wordLastReviewCompletedAt: timestamp,
  };
}

function row(shape: Shape, override: Partial<PersistedReviewScheduleWordRow> = {}): PersistedReviewScheduleWordRow {
  return {
    id: shape.id,
    child_id: CHILD_ID,
    canonical_word_id: shape.canonicalWordId,
    bundle_id: null,
    membership_status: "scheduled",
    taught_on: "2026-07-01",
    row_status: "active",
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_interval_index: shape.intervalIndex,
    word_next_due_on: shape.dueOn,
    catch_up_stage: 0,
    next_retest_due_on: null,
    failed_review_on: null,
    pre_retirement_check_due_on: null,
    last_28_day_review_on: null,
    reteach_cycle_count: 0,
    word_schedule_transition_count: shape.revision,
    word_last_review_completed_on: shape.canonicalTimestamp?.slice(0, 10) ?? null,
    word_last_review_completed_at: shape.canonicalTimestamp,
    consecutive_independent_failures: 0,
    failure_episode_id: null,
    ...override,
  };
}

function cutover(shape: Shape): PersistedTargetTransitionRow {
  return {
    schedule_word_id: shape.id,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "POLICY_CUTOVER_APPLIED",
    source_review_outcome_event_id: null,
    source_controlled_graduation_receipt_id: null,
    expected_state_revision: shape.revision - 1,
    applied_state_revision: shape.revision,
    from_state: {
      stateShapeVersion: "adle_review_per_word_schedule_v1",
      schedulePolicyVersion: "review_policy_v1_2026-07-04",
      membershipStatus: "scheduled",
      wordIntervalIndex: shape.intervalIndex,
      wordNextDueOn: shape.dueOn,
      stateRevision: shape.revision - 1,
    },
    to_state: state(shape, shape.historicalTimestamp),
    transition_reason: "POLICY_CUTOVER_APPROVED_CLEAN_SCHEDULED",
  };
}

function hydrates(shape: Shape, override: Partial<PersistedReviewScheduleWordRow> = {}): boolean {
  return hydratePersistedReviewSchedule({ row: row(shape, override), transitions: [cutover(shape)] })
    .disposition === "HYDRATED";
}

const legacy = state(shapes[2], "2026-08-27 10:03:48.542852+00");
const canonical = state(shapes[2], "2026-08-27T10:03:48.542852+00:00");
assert.equal(equalPersistedTargetStatesForHistory(legacy, canonical), true);
assert.equal(equalPersistedTargetStatesForHistory(canonical, canonical), true);
assert.equal(canonicalUtcTimestampExactComparison(legacy.wordLastReviewCompletedAt!),
  canonicalUtcTimestampExactComparison(canonical.wordLastReviewCompletedAt!));
assert.equal(equalPersistedTargetStatesForHistory(
  legacy,
  { ...canonical, wordLastReviewCompletedAt: "2026-08-27T10:03:48.542853+00:00" },
), false, "different microsecond instants must remain different");

assert.equal(hydrates(shapes[2]), true, "legacy microsecond transport must hydrate");
assert.equal(hydrates(shapes[0]), true, "legacy millisecond transport must hydrate");
assert.equal(hydrates(shapes[6]), true, "canonical canary transport must hydrate");
assert.equal(hydrates(shapes[11]), true, "null historical timestamp must hydrate");
assert.equal(shapes.filter((shape) => hydrates(shape)).length, 18,
  "all 18 Production-shaped target rows must hydrate");

const base = shapes[2];
assert.equal(hydrates(base, { word_interval_index: 2 }), false, "rung mismatch must reject");
assert.equal(hydrates(base, { word_next_due_on: "2026-08-31" }), false, "due mismatch must reject");
assert.equal(hydrates(base, { membership_status: "next_day_recovery" }), false, "route mismatch must reject");
assert.equal(hydrates(base, { word_schedule_transition_count: base.revision + 1 }), false,
  "revision mismatch must reject");
assert.equal(hydrates(base, {
  consecutive_independent_failures: 1,
  failure_episode_id: "00000000-0000-4000-8000-000000008888",
}), false, "failure-lineage mismatch must reject");
assert.equal(hydrates(base, {
  word_last_review_completed_at: "2026-08-27T10:03:48.542853+00:00",
}), false, "different timestamp instant must reject");

assert.equal(canonicalUtcTimestampMilliseconds("2026-09-01T12:04:44.123456+00:00"),
  "2026-09-01T12:04:44.123+00:00",
  "C2B.7 persistence fingerprint authority remains unchanged");

console.log(JSON.stringify({
  status: "PASS",
  productionShapedRows: shapes.length,
  legacyCanonicalEquivalent: true,
  microsecondPrecisionPreservedForComparison: true,
  nonTimestampStateStillExact: true,
  canaryHistoryHydrates: true,
  nullHistoryHydrates: true,
  reducerAndPersistenceFingerprintAuthorityChanged: false,
}, null, 2));
