import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import { resolvePureReviewPolicyExecutor } from "../lib/adle/review-policy/pure-dispatch";
import {
  currentNewSchedulePolicyVersion,
  hydratePersistedReviewSchedule,
  targetPolicyConfigFromRegistry,
  type PersistedReviewPolicyRow,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "../lib/adle/review-policy/runtime-coexistence";
import {
  persistTargetReviewTransition,
  type TargetReviewOutcomeSourceFact,
} from "../lib/adle/review-policy/target-transition-persistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";
import {
  REVIEW_POLICY_V1,
} from "../lib/adle/review-scheduler";
import { transitionPerWordScheduleV1 } from "../lib/adle/review-v3/per-word-scheduler";

const UUID = {
  child: "00000000-0000-0000-0000-000000000001",
  word: "00000000-0000-0000-0000-000000000002",
  scheduleV1: "00000000-0000-0000-0000-000000000003",
  scheduleV2: "00000000-0000-0000-0000-000000000004",
  outcome1: "00000000-0000-0000-0000-000000000005",
  outcome2: "00000000-0000-0000-0000-000000000006",
  episode: "00000000-0000-0000-0000-000000000007",
  receipt: "00000000-0000-0000-0000-000000000008",
};

function row(overrides: Partial<PersistedReviewScheduleWordRow> = {}): PersistedReviewScheduleWordRow {
  return {
    id: UUID.scheduleV1,
    child_id: UUID.child,
    canonical_word_id: UUID.word,
    bundle_id: null,
    membership_status: "scheduled",
    taught_on: "2026-08-01",
    row_status: "active",
    word_schedule_version: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: CURRENT_REVIEW_POLICY_VERSION,
    word_interval_index: 1,
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
    consecutive_independent_failures: null,
    failure_episode_id: null,
    ...overrides,
  };
}

function targetRow(overrides: Partial<PersistedReviewScheduleWordRow> = {}): PersistedReviewScheduleWordRow {
  return row({
    id: UUID.scheduleV2,
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    consecutive_independent_failures: 0,
    failure_episode_id: null,
    ...overrides,
  });
}

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

async function main(): Promise<void> {
// 1-4. Exact coexistence hydration and dispatch.
const currentHydration = hydratePersistedReviewSchedule({ row: row() });
assert.equal(currentHydration.disposition, "HYDRATED");
assert.equal(currentHydration.disposition === "HYDRATED" && currentHydration.schedule.kind, "CURRENT_V1");
assert.equal(
  currentHydration.disposition === "HYDRATED" && currentHydration.schedule.executor.kind,
  "CURRENT_REVIEW_POLICY_V1",
);

const targetHydration = hydratePersistedReviewSchedule({ row: targetRow() });
assert.equal(targetHydration.disposition, "HYDRATED");
assert.equal(targetHydration.disposition === "HYDRATED" && targetHydration.schedule.kind, "TARGET_REGRESSION_V1");
assert.equal(
  targetHydration.disposition === "HYDRATED" && targetHydration.schedule.executor.kind,
  "TARGET_REVIEW_REGRESSION_V1",
);

// 5-6. Unknown and incompatible pins fail closed with no current fallback.
assert.deepEqual(resolvePureReviewPolicyExecutor("unknown-policy", CURRENT_PER_WORD_STATE_SHAPE_VERSION), {
  disposition: "REJECTED",
  reason: "UNKNOWN_POLICY_VERSION",
  policyVersion: "unknown-policy",
  stateShapeVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
});
assert.deepEqual(resolvePureReviewPolicyExecutor(
  TARGET_REVIEW_POLICY_VERSION,
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
), {
  disposition: "REJECTED",
  reason: "POLICY_STATE_SHAPE_MISMATCH",
  policyVersion: TARGET_REVIEW_POLICY_VERSION,
  stateShapeVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
});
assert.equal(hydratePersistedReviewSchedule({
  row: targetRow({ word_schedule_version: CURRENT_PER_WORD_STATE_SHAPE_VERSION }),
}).disposition, "REJECTED");

const cutoverState = {
  stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
  membershipStatus: "scheduled",
  wordIntervalIndex: 1,
  wordNextDueOn: "2026-09-01",
  consecutiveIndependentFailures: 0,
  failureEpisodeId: null,
  preRetirementCheckDueOn: null,
  last28DayReviewOn: null,
  wordLastReviewCompletedOn: null,
  wordLastReviewCompletedAt: null,
};
assert.equal(hydratePersistedReviewSchedule({
  row: targetRow({ word_schedule_transition_count: 5 }),
  transitions: [{
    schedule_word_id: UUID.scheduleV2,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "POLICY_CUTOVER_APPLIED",
    source_review_outcome_event_id: null,
    source_controlled_graduation_receipt_id: null,
    expected_state_revision: 4,
    applied_state_revision: 5,
    from_state: cutoverState,
    to_state: cutoverState,
    transition_reason: "CLEAN_BOUNDARY_POLICY_CUTOVER",
  }],
}).disposition, "HYDRATED", "a governed cutover may inherit a nonzero v1 revision baseline");

// 7-9. Registry rollout/default metadata cannot disable a pinned target word;
// normal creation remains explicitly current v1.
const config = targetPolicyConfigFromRegistry(targetPolicy);
assert.ok(config);
assert.equal(config?.schedulePolicyVersion, TARGET_REVIEW_POLICY_VERSION);
assert.equal(targetPolicy.is_active, false);
assert.equal(targetPolicy.is_default_for_new_schedules, false);
assert.equal(currentNewSchedulePolicyVersion(), CURRENT_REVIEW_POLICY_VERSION);

// 10. The released per-word v1 reducer remains byte-for-byte available and
// behaves exactly under the released policy.
assert.equal(REVIEW_POLICY_V1.schedulePolicyVersion, CURRENT_REVIEW_POLICY_VERSION);
if (currentHydration.disposition !== "HYDRATED" || currentHydration.schedule.kind !== "CURRENT_V1") {
  throw new Error("current fixture failed to hydrate");
}
const currentBefore = structuredClone(currentHydration.schedule.state);
const currentDecision = transitionPerWordScheduleV1({
  policy: { ...REVIEW_POLICY_V1, completionGraceMinutes: 120 },
  word: currentHydration.schedule.state,
  dueKind: "scheduled_review",
  frozenDueOn: "2026-09-01",
  completedOn: "2026-09-01",
  originalOutcome: "success",
});
assert.equal(currentDecision.eventType, "review_pass");
assert.equal(currentDecision.word.intervalIndex, 2);
assert.deepEqual(currentHydration.schedule.state, currentBefore, "pure current fixture must not mutate");

if (targetHydration.disposition !== "HYDRATED" || targetHydration.schedule.kind !== "TARGET_REGRESSION_V1") {
  throw new Error("target fixture failed to hydrate");
}

type RpcArgs = Record<string, unknown>;
const persistedCalls: RpcArgs[] = [];
const appliedByKey = new Map<string, { fingerprint: string; result: Record<string, unknown> }>();
let databaseRevision = 0;
const fakeClient = {
  async rpc(name: string, args: RpcArgs) {
    assert.equal(name, "persist_adle_review_schedule_transition_c2b2");
    persistedCalls.push(structuredClone(args));
    const key = String(args.p_idempotency_key);
    const fingerprint = String(args.p_source_fingerprint);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    const existing = appliedByKey.get(key);
    if (existing) {
      assert.equal(existing.fingerprint, fingerprint, "semantic replay fingerprint must be exact");
      return { data: { ...existing.result, status: "already_applied" }, error: null };
    }
    if (args.p_expected_state_revision !== databaseRevision) {
      return { data: null, error: { message: "adle_c2b2_stale_state_revision" } };
    }
    databaseRevision += 1;
    const result = {
      status: "applied",
      transitionEventId: `00000000-0000-0000-0000-${String(databaseRevision).padStart(12, "0")}`,
      appliedStateRevision: databaseRevision,
    };
    appliedByKey.set(key, { fingerprint, result });
    return { data: result, error: null };
  },
};

const outcome1: TargetReviewOutcomeSourceFact = {
  id: UUID.outcome1,
  schedule_word_id: UUID.scheduleV2,
  child_id: UUID.child,
  canonical_word_id: UUID.word,
  schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  due_kind: "scheduled_review",
  frozen_interval_index: 1,
  original_result: "failure",
  review_completed_on: "2026-09-01",
  completed_at: "2026-09-01T12:00:00.000Z",
};

// 11. The target executor's exact decision is serialized into the C2B.2 CAS,
// not re-decided in SQL/application persistence.
const firstPersistence = await persistTargetReviewTransition({
  client: fakeClient as never,
  schedule: targetHydration.schedule,
  source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: outcome1 },
  policyConfig: config ?? TARGET_REVIEW_POLICY_CONFIG,
});
assert.deepEqual(firstPersistence, {
  disposition: "PERSISTED",
  decisionReason: "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY",
  transitionEventId: "00000000-0000-0000-0000-000000000001",
  appliedStateRevision: 1,
});
const firstCall = persistedCalls[0];
assert.equal(firstCall.p_expected_state_revision, 0);
assert.equal(firstCall.p_transition_reason, "SCHEDULED_FAILURE_TO_NEXT_DAY_RECOVERY");
assert.equal((firstCall.p_to_state as Record<string, unknown>).membershipStatus, "next_day_recovery");
assert.equal((firstCall.p_to_state as Record<string, unknown>).wordNextDueOn, "2026-09-02");
assert.equal((firstCall.p_to_state as Record<string, unknown>).consecutiveIndependentFailures, 1);
assert.equal((firstCall.p_to_state as Record<string, unknown>).failureEpisodeId, UUID.outcome1);

// 12. A distinct event submitted with a stale expected revision fails closed.
await assert.rejects(() => persistTargetReviewTransition({
  client: fakeClient as never,
  schedule: targetHydration.schedule,
  source: {
    kind: "REVIEW_OUTCOME_APPLIED",
    outcome: { ...outcome1, id: UUID.outcome2 },
  },
  policyConfig: config ?? TARGET_REVIEW_POLICY_CONFIG,
}), /adle_c2b2_stale_state_revision/);

// 13. Exact duplicate source replay is idempotent and cannot increment again.
const replay = await persistTargetReviewTransition({
  client: fakeClient as never,
  schedule: targetHydration.schedule,
  source: { kind: "REVIEW_OUTCOME_APPLIED", outcome: outcome1 },
  policyConfig: config ?? TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(replay.disposition, "IDEMPOTENT_REPLAY");
assert.equal(databaseRevision, 1);

// 14. Route and lineage round-trip independently through the ledger-derived
// event identity and the separately persisted target columns.
const transition1: PersistedTargetTransitionRow = {
  schedule_word_id: UUID.scheduleV2,
  schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
  state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
  transition_kind: "REVIEW_OUTCOME_APPLIED",
  source_review_outcome_event_id: UUID.outcome1,
  source_controlled_graduation_receipt_id: null,
  expected_state_revision: 0,
  applied_state_revision: 1,
  from_state: firstCall.p_from_state,
  to_state: firstCall.p_to_state,
  transition_reason: String(firstCall.p_transition_reason),
};
const recoveryHydration = hydratePersistedReviewSchedule({
  row: targetRow({
    membership_status: "next_day_recovery",
    word_next_due_on: "2026-09-02",
    consecutive_independent_failures: 1,
    failure_episode_id: UUID.outcome1,
    word_schedule_transition_count: 1,
    word_last_review_completed_on: "2026-09-01",
    word_last_review_completed_at: String(
      (firstCall.p_to_state as Record<string, unknown>).wordLastReviewCompletedAt,
    ),
  }),
  transitions: [transition1],
});
assert.equal(recoveryHydration.disposition, "HYDRATED");
if (recoveryHydration.disposition !== "HYDRATED" || recoveryHydration.schedule.kind !== "TARGET_REGRESSION_V1") {
  throw new Error("recovery fixture failed to hydrate");
}
assert.equal(recoveryHydration.schedule.state.route.membership, "NEXT_DAY_RECOVERY");
assert.deepEqual(recoveryHydration.schedule.state.failureLineage, {
  resolution: "UNRESOLVED",
  episodeId: UUID.outcome1,
  consecutiveIndependentFailures: 1,
});
assert.deepEqual(recoveryHydration.schedule.state.appliedEventIds, [UUID.outcome1]);

// 15. Controlled reacquisition -> scheduled Day 1 preserves unresolved
// lineage. This explicitly exercises the future C2B.4 source kind without
// connecting it to lesson completion.
databaseRevision = 0;
appliedByKey.clear();
const controlledHydration = hydratePersistedReviewSchedule({
  row: targetRow({
    membership_status: "controlled_reacquisition",
    word_interval_index: 2,
    word_next_due_on: null,
    consecutive_independent_failures: 3,
    failure_episode_id: UUID.episode,
  }),
});
assert.equal(controlledHydration.disposition, "HYDRATED");
if (controlledHydration.disposition !== "HYDRATED" || controlledHydration.schedule.kind !== "TARGET_REGRESSION_V1") {
  throw new Error("controlled fixture failed to hydrate");
}
const controlledPersistence = await persistTargetReviewTransition({
  client: fakeClient as never,
  schedule: controlledHydration.schedule,
  source: {
    kind: "CONTROLLED_PASS_APPLIED",
    receipt: {
      id: UUID.receipt,
      child_id: UUID.child,
      canonical_word_id: UUID.word,
      controlled_policy_version: "ADLE_CONTROLLED_GRADUATION_V1_OR",
      decision: "PASS",
      completed_on: "2026-09-03",
      decided_at: "2026-09-03T12:00:00Z",
    },
  },
  policyConfig: config ?? TARGET_REVIEW_POLICY_CONFIG,
});
assert.equal(controlledPersistence.disposition, "PERSISTED");
const controlledCall = persistedCalls.at(-1) as RpcArgs;
const controlledTo = controlledCall.p_to_state as Record<string, unknown>;
assert.equal(controlledTo.membershipStatus, "scheduled");
assert.equal(controlledTo.wordIntervalIndex, 0);
assert.equal(controlledTo.wordNextDueOn, "2026-09-04");
assert.equal(controlledTo.consecutiveIndependentFailures, 3);
assert.equal(controlledTo.failureEpisodeId, UUID.episode);
const controlledRoundTrip = hydratePersistedReviewSchedule({
  row: targetRow({
    membership_status: "scheduled",
    word_interval_index: 0,
    word_next_due_on: "2026-09-04",
    consecutive_independent_failures: 3,
    failure_episode_id: UUID.episode,
    word_schedule_transition_count: 1,
  }),
  transitions: [{
    schedule_word_id: UUID.scheduleV2,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "CONTROLLED_PASS_APPLIED",
    source_review_outcome_event_id: null,
    source_controlled_graduation_receipt_id: UUID.receipt,
    expected_state_revision: 0,
    applied_state_revision: 1,
    from_state: controlledCall.p_from_state,
    to_state: controlledCall.p_to_state,
    transition_reason: String(controlledCall.p_transition_reason),
  }],
});
assert.equal(controlledRoundTrip.disposition, "HYDRATED");
if (controlledRoundTrip.disposition === "HYDRATED"
  && controlledRoundTrip.schedule.kind === "TARGET_REGRESSION_V1") {
  assert.equal(controlledRoundTrip.schedule.state.route.membership, "SCHEDULED");
  assert.equal(controlledRoundTrip.schedule.state.failureLineage.resolution, "UNRESOLVED");
  assert.equal(
    controlledRoundTrip.schedule.state.failureLineage.consecutiveIndependentFailures,
    3,
  );
} else {
  throw new Error("controlled Day-1 retained-lineage round trip failed");
}

// 16-17. C2B.6 supersedes the fixture-only queue boundary with exact mixed-pin
// selection. V1-only sessions still take the released path and an admitted v2
// row must first pass the C2B.3 hydrator; neither registry flag dispatches it.
const r6Generation = readFileSync(resolve("lib/adle/review-v3/r6-generation.ts"), "utf8");
assert.match(r6Generation, /selectDueMixedReviewWords/);
assert.match(r6Generation, /loadReviewScheduleForExecution/);
assert.match(r6Generation, /CURRENT_PER_WORD_STATE_SHAPE_VERSION/);
assert.match(r6Generation, /TARGET_PER_WORD_STATE_SHAPE_VERSION/);
assert.match(r6Generation, /\.eq\("schedule_policy_version", CURRENT_REVIEW_POLICY_VERSION\)/);
assert.doesNotMatch(r6Generation, /\.eq\("is_active", true\)/);
const targetPersistenceSource = readFileSync(
  resolve("lib/adle/review-policy/target-transition-persistence.ts"), "utf8",
);
assert.match(targetPersistenceSource, /persist_adle_review_schedule_transition_c2b2/);
assert.doesNotMatch(
  targetPersistenceSource,
  /\.from\("adle_review_schedule_words"\)[\s\S]*\.(?:insert|update|upsert|delete)/,
);
const c2b2Migration = readFileSync(
  resolve("supabase/migrations/20260831120000_add_adle_c2b2_scheduler_persistence.sql"), "utf8",
);
assert.match(c2b2Migration, /'ADLE_SPACED_REVIEW_REGRESSION_V1',\s*false,\s*false,/);
assert.doesNotMatch(c2b2Migration, /create or replace function public\.(?:finalize_adle_review_r5|persist_adle_review_assignment_r6)/);

console.log(JSON.stringify({
  status: "PASS",
  requiredCoexistenceCases: 17,
  coexistence: {
    current: `${CURRENT_REVIEW_POLICY_VERSION}+${CURRENT_PER_WORD_STATE_SHAPE_VERSION}`,
    target: `${TARGET_REVIEW_POLICY_VERSION}+${TARGET_PER_WORD_STATE_SHAPE_VERSION}`,
  },
  targetActive: false,
  targetDefault: false,
  liveQueueTargetRows: "exactly_pinned_and_hydrated_only",
  targetPersistenceAuthority: "persist_adle_review_schedule_transition_c2b2",
  controlledRuntimeIntegrated: false,
}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
