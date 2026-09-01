import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildCutoverPreview,
  type CutoverPreviewRecord,
} from "../lib/adle/review-policy/cutover-preview";
import {
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import type {
  PersistedLegacyBundleAuthority,
  PersistedReviewPolicyRow,
  PersistedReviewScheduleWordRow,
} from "../lib/adle/review-policy/runtime-coexistence";

const uuid = (suffix: number): string =>
  `00000000-0000-0000-0000-${String(suffix).padStart(12, "0")}`;

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

function scheduledRow(input: {
  suffix: number;
  interval?: number;
  dueOn?: string | null;
  membership?: string;
  rowStatus?: string;
}): PersistedReviewScheduleWordRow {
  const membership = input.membership ?? "scheduled";
  return {
    id: uuid(input.suffix),
    child_id: uuid(100),
    canonical_word_id: uuid(1000 + input.suffix),
    bundle_id: uuid(200),
    membership_status: membership,
    taught_on: "2026-08-01",
    row_status: input.rowStatus ?? "active",
    word_schedule_version: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: CURRENT_REVIEW_POLICY_VERSION,
    word_interval_index: input.interval ?? 2,
    word_next_due_on: input.dueOn === undefined
      ? (membership === "scheduled" ? "2026-09-01" : null)
      : input.dueOn,
    catch_up_stage: membership === "catch_up" ? 1 : 0,
    next_retest_due_on: membership === "catch_up" ? "2026-09-02" : null,
    failed_review_on: membership === "catch_up" ? "2026-09-01" : null,
    pre_retirement_check_due_on: membership === "awaiting_pre_retirement_check"
      ? "2026-12-22"
      : null,
    last_28_day_review_on: null,
    reteach_cycle_count: 0,
    word_schedule_transition_count: 7,
    word_last_review_completed_on: "2026-08-25",
    word_last_review_completed_at: "2026-08-25T10:30:00Z",
    consecutive_independent_failures: null,
    failure_episode_id: null,
  };
}

function record(records: readonly CutoverPreviewRecord[], suffix: number): CutoverPreviewRecord {
  const result = records.find((candidate) => candidate.scheduleWordId === uuid(suffix));
  assert.ok(result, `missing preview row ${suffix}`);
  return result;
}

function main(): void {
  const due = scheduledRow({ suffix: 1, interval: 2, dueOn: "2026-09-01" });
  const notDue = scheduledRow({ suffix: 2, interval: 3, dueOn: "2026-09-15" });
  const preRetirement = scheduledRow({ suffix: 3, interval: 5, membership: "awaiting_pre_retirement_check" });
  const retired = scheduledRow({ suffix: 4, interval: 5, membership: "retired" });
  const malformed = scheduledRow({ suffix: 5, dueOn: null });
  const unsupported = {
    ...scheduledRow({ suffix: 6 }),
    word_schedule_policy_version: "unsupported_policy",
  };
  const catchUp = scheduledRow({ suffix: 7, membership: "catch_up" });
  const ejected = scheduledRow({ suffix: 8, membership: "ejected_pending_reteach" });
  const paused = scheduledRow({ suffix: 9, membership: "paused_parent_review" });
  const finalRung = scheduledRow({ suffix: 10, interval: 5, dueOn: "2026-10-01" });
  const legacy = {
    ...scheduledRow({ suffix: 11, interval: 0 }),
    word_schedule_version: null,
    word_schedule_policy_version: null,
    word_interval_index: null,
    word_next_due_on: null,
  };
  const rows = [
    due, notDue, preRetirement, retired, malformed, unsupported,
    catchUp, ejected, paused, finalRung, legacy,
  ];
  const legacyAuthority: PersistedLegacyBundleAuthority = {
    schedule_policy_version: CURRENT_REVIEW_POLICY_VERSION,
    interval_index: 0,
    next_due_on: "2026-09-01",
  };
  const legacyBundles = new Map([[legacy.bundle_id as string, legacyAuthority]]);
  const before = structuredClone(rows);
  const preview = buildCutoverPreview({
    rows,
    legacyBundles,
    targetPolicy,
    asOfDate: "2026-09-01",
  });

  // 1-2. Ordinary due/not-due clean v1 rows map exactly and remain eligible.
  assert.equal(record(preview.records, 1).eligibility, "ELIGIBLE");
  assert.equal(record(preview.records, 1).current.dueStatus, "DUE");
  assert.equal(record(preview.records, 2).eligibility, "ELIGIBLE");
  assert.equal(record(preview.records, 2).current.dueStatus, "NOT_DUE");
  assert.equal(record(preview.records, 2).proposed?.route.membership, "SCHEDULED");
  assert.equal(record(preview.records, 2).proposed?.persistedState.wordIntervalIndex, 3);
  assert.equal(record(preview.records, 2).proposed?.persistedState.wordNextDueOn, "2026-09-15");

  // 3. Final authority, pre-retirement, and retired states are preserved old.
  assert.equal(record(preview.records, 3).reason, "PRE_RETIREMENT_AUTHORITY_PRESERVED");
  assert.equal(record(preview.records, 4).reason, "RETIRED_AUTHORITY_PRESERVED");
  assert.equal(record(preview.records, 10).reason, "FINAL_RUNG_AUTHORITY_PRESERVED");
  for (const suffix of [3, 4, 10]) assert.equal(record(preview.records, suffix).proposed, null);

  // 4-5. The cutover ledger starts at the exact current revision, while route
  // and failure lineage remain distinct target facts.
  const eligible = record(preview.records, 1);
  assert.equal(eligible.proposed?.expectedStateRevision, 7);
  assert.equal(eligible.proposed?.appliedStateRevision, 8);
  assert.deepEqual(eligible.proposed?.failureLineage, {
    resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0,
  });
  assert.deepEqual(eligible.proposed?.route, {
    membership: "SCHEDULED", rung: "DAY_7", dueOn: "2026-09-01", regressionOrigin: null,
  });

  // 6-7. Malformed and unsupported rows fail closed without a proposal.
  assert.equal(record(preview.records, 5).reason, "MALFORMED_CURRENT_STATE");
  assert.equal(record(preview.records, 6).reason, "UNSUPPORTED_POLICY_STATE_PAIR");
  assert.equal(record(preview.records, 5).proposed, null);
  assert.equal(record(preview.records, 6).proposed, null);

  // Additional governed classes are not forced into the ordinary mapping.
  assert.equal(record(preview.records, 7).reason, "CATCH_UP_EPISODE_UNRESOLVED");
  assert.equal(record(preview.records, 8).reason, "CONTROLLED_RETEACH_BOUNDARY_REQUIRED");
  assert.equal(record(preview.records, 9).reason, "PARENT_PAUSE_PRESERVED");
  assert.equal(record(preview.records, 11).reason, "LEGACY_BUNDLE_AUTHORITY_PREREQUISITE");

  // 8. Active/default registry flags are deliberately absent from eligibility.
  const flagsChanged = buildCutoverPreview({
    rows,
    legacyBundles,
    targetPolicy: { ...targetPolicy, is_active: true, is_default_for_new_schedules: true },
    asOfDate: "2026-09-01",
  });
  assert.deepEqual(flagsChanged, preview);

  // 9-11. The pure projection mutates no source row and contains no database
  // write surface; the Production tool has a SELECT-only guard and read-only transaction.
  assert.deepEqual(rows, before);
  const productionTool = readFileSync(resolve("scripts/adle-c2b5-production-cutover-preview.ts"), "utf8");
  assert.match(productionTool, /repeatable read read only/);
  assert.match(productionTool, /transaction_read_only/);
  assert.doesNotMatch(productionTool, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);

  // 12-13. Identical ordered facts produce byte-equivalent output and a stable
  // canonical fingerprint, independent of input row order.
  const repeated = buildCutoverPreview({
    rows: [...rows].reverse(), legacyBundles, targetPolicy, asOfDate: "2026-09-01",
  });
  assert.deepEqual(repeated, preview);
  assert.equal(
    preview.fingerprint,
    "71941f81cf61157b025915fa51fdbfb756c69bec489bddbb30c859986cdc3103",
  );

  // 14. Released creation remains v1. C2B.6 queue compatibility is exact-pin
  // only and cannot create or infer a v2 row from this read-only preview.
  const coexistence = readFileSync(resolve("lib/adle/review-policy/runtime-coexistence.ts"), "utf8");
  assert.match(coexistence, /return CURRENT_REVIEW_POLICY_VERSION/);
  const r6 = readFileSync(resolve("lib/adle/review-v3/r6-generation.ts"), "utf8");
  assert.match(r6, /selectDueMixedReviewWords/);
  assert.match(r6, /loadReviewScheduleForExecution/);
  assert.match(r6, /TARGET_PER_WORD_STATE_SHAPE_VERSION/);
  assert.doesNotMatch(r6, /\.eq\("is_active", true\)/);

  console.log(JSON.stringify({
    status: "PASS",
    requiredCases: 14,
    inspected: preview.summary.inspected,
    eligible: preview.summary.eligible,
    fingerprint: preview.fingerprint,
    mutationSurface: "NONE",
  }, null, 2));
}

main();
