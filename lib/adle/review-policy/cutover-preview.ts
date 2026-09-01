import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { IsoDate } from "../review-scheduler";
import {
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  LEGACY_BUNDLE_STATE_SHAPE_VERSION,
  REVIEW_RUNGS,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type ReviewRung,
  type TargetFailureLineage,
  type TargetReviewRoute,
} from "./contracts";
import {
  hydratePersistedReviewSchedule,
  targetPolicyConfigFromRegistry,
  type PersistedLegacyBundleAuthority,
  type PersistedReviewPolicyRow,
  type PersistedReviewScheduleStateC2B2,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "./runtime-coexistence";

export const C2B5_CUTOVER_PREVIEW_VERSION = "ADLE_C2B5_CUTOVER_PREVIEW_V1" as const;

export type CutoverEligibility = "ELIGIBLE" | "INELIGIBLE" | "REQUIRES_OWNER_REVIEW";

export type CutoverEligibilityReason =
  | "CLEAN_PER_WORD_V1_SCHEDULED_PRE_FINAL_RUNG"
  | "ROW_NOT_ACTIVE"
  | "ALREADY_TARGET_V2"
  | "LEGACY_BUNDLE_AUTHORITY_PREREQUISITE"
  | "CATCH_UP_EPISODE_UNRESOLVED"
  | "CONTROLLED_RETEACH_BOUNDARY_REQUIRED"
  | "PARENT_PAUSE_PRESERVED"
  | "FINAL_RUNG_AUTHORITY_PRESERVED"
  | "PRE_RETIREMENT_AUTHORITY_PRESERVED"
  | "RETIRED_AUTHORITY_PRESERVED"
  | "MALFORMED_CURRENT_STATE"
  | "UNSUPPORTED_POLICY_STATE_PAIR"
  | "TARGET_POLICY_REGISTRY_MALFORMED"
  | "PROPOSED_TARGET_STATE_REJECTED";

export type CutoverPreviewCurrentState = {
  policyVersion: string | null;
  stateShapeVersion: string | null;
  authority: "PER_WORD_V1" | "LEGACY_BUNDLE" | "TARGET_V2" | "UNSUPPORTED";
  rowStatus: string;
  membership: string;
  intervalIndex: number | null;
  rung: ReviewRung | null;
  dueOn: IsoDate | null;
  dueStatus: "DUE" | "NOT_DUE" | "NOT_APPLICABLE";
  stateRevision: number;
  catchUpStage: number;
  nextRetestDueOn: IsoDate | null;
  failedReviewOn: IsoDate | null;
  preRetirementCheckDueOn: IsoDate | null;
  last28DayReviewOn: IsoDate | null;
  reteachCycleCount: number;
  wordLastReviewCompletedOn: IsoDate | null;
  wordLastReviewCompletedAt: string | null;
};

export type CutoverPreviewProposedState = {
  policyVersion: typeof TARGET_REVIEW_POLICY_VERSION;
  stateShapeVersion: typeof TARGET_PER_WORD_STATE_SHAPE_VERSION;
  route: TargetReviewRoute;
  failureLineage: TargetFailureLineage;
  persistedState: PersistedReviewScheduleStateC2B2;
  cutoverTransitionKind: "POLICY_CUTOVER_APPLIED";
  expectedStateRevision: number;
  appliedStateRevision: number;
};

export type CutoverPreviewRecord = {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  current: CutoverPreviewCurrentState;
  proposed: CutoverPreviewProposedState | null;
  eligibility: CutoverEligibility;
  reason: CutoverEligibilityReason;
};

export type CutoverPreviewResult = {
  previewVersion: typeof C2B5_CUTOVER_PREVIEW_VERSION;
  asOfDate: IsoDate;
  targetPolicyVersion: typeof TARGET_REVIEW_POLICY_VERSION;
  targetStateShapeVersion: typeof TARGET_PER_WORD_STATE_SHAPE_VERSION;
  records: readonly CutoverPreviewRecord[];
  summary: {
    inspected: number;
    eligible: number;
    ineligible: number;
    requiresOwnerReview: number;
    byReason: Readonly<Record<string, number>>;
    byAuthority: Readonly<Record<string, number>>;
    byMembership: Readonly<Record<string, number>>;
    eligibleByRung: Readonly<Record<string, number>>;
    eligibleByDueStatus: Readonly<Record<string, number>>;
  };
  fingerprint: string;
};

function isoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validNullableDate(value: unknown): value is IsoDate | null {
  return value === null || isoDate(value);
}

function validNullableInstant(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(new Date(value).getTime()));
}

function currentDueOn(row: PersistedReviewScheduleWordRow): IsoDate | null {
  if (row.membership_status === "scheduled") return row.word_next_due_on as IsoDate | null;
  if (row.membership_status === "catch_up") return row.next_retest_due_on as IsoDate | null;
  if (row.membership_status === "awaiting_pre_retirement_check") {
    return row.pre_retirement_check_due_on as IsoDate | null;
  }
  return null;
}

function exactCurrentState(input: {
  row: PersistedReviewScheduleWordRow;
  legacyBundle?: PersistedLegacyBundleAuthority;
  asOfDate: IsoDate;
}): CutoverPreviewCurrentState {
  const { row, legacyBundle } = input;
  const isLegacy = row.word_schedule_version === null && row.word_schedule_policy_version === null;
  const isCurrent = row.word_schedule_version === CURRENT_PER_WORD_STATE_SHAPE_VERSION
    && row.word_schedule_policy_version === CURRENT_REVIEW_POLICY_VERSION;
  const isTarget = row.word_schedule_version === TARGET_PER_WORD_STATE_SHAPE_VERSION
    && row.word_schedule_policy_version === TARGET_REVIEW_POLICY_VERSION;
  const intervalIndex = isLegacy
    ? legacyBundle?.interval_index ?? null
    : row.word_interval_index;
  const dueOn = isLegacy
    ? (row.membership_status === "scheduled" ? legacyBundle?.next_due_on as IsoDate | undefined : currentDueOn(row)) ?? null
    : currentDueOn(row);
  return {
    policyVersion: isLegacy
      ? legacyBundle?.schedule_policy_version ?? null
      : row.word_schedule_policy_version,
    stateShapeVersion: isLegacy ? LEGACY_BUNDLE_STATE_SHAPE_VERSION : row.word_schedule_version,
    authority: isLegacy
      ? "LEGACY_BUNDLE"
      : isCurrent
        ? "PER_WORD_V1"
        : isTarget
          ? "TARGET_V2"
          : "UNSUPPORTED",
    rowStatus: row.row_status,
    membership: row.membership_status,
    intervalIndex,
    rung: intervalIndex !== null && intervalIndex >= 0 && intervalIndex < REVIEW_RUNGS.length
      ? REVIEW_RUNGS[intervalIndex] as ReviewRung
      : null,
    dueOn,
    dueStatus: dueOn === null ? "NOT_APPLICABLE" : dueOn <= input.asOfDate ? "DUE" : "NOT_DUE",
    stateRevision: row.word_schedule_transition_count,
    catchUpStage: row.catch_up_stage,
    nextRetestDueOn: row.next_retest_due_on as IsoDate | null,
    failedReviewOn: row.failed_review_on as IsoDate | null,
    preRetirementCheckDueOn: row.pre_retirement_check_due_on as IsoDate | null,
    last28DayReviewOn: row.last_28_day_review_on as IsoDate | null,
    reteachCycleCount: row.reteach_cycle_count,
    wordLastReviewCompletedOn: row.word_last_review_completed_on as IsoDate | null,
    wordLastReviewCompletedAt: row.word_last_review_completed_at,
  };
}

function excluded(input: {
  row: PersistedReviewScheduleWordRow;
  current: CutoverPreviewCurrentState;
  eligibility: Exclude<CutoverEligibility, "ELIGIBLE">;
  reason: Exclude<CutoverEligibilityReason, "CLEAN_PER_WORD_V1_SCHEDULED_PRE_FINAL_RUNG">;
}): CutoverPreviewRecord {
  return {
    scheduleWordId: input.row.id,
    childId: input.row.child_id,
    canonicalWordId: input.row.canonical_word_id,
    sourceBundleId: input.row.bundle_id,
    current: input.current,
    proposed: null,
    eligibility: input.eligibility,
    reason: input.reason,
  };
}

function currentStateWellFormed(row: PersistedReviewScheduleWordRow): boolean {
  return Number.isInteger(row.word_schedule_transition_count)
    && row.word_schedule_transition_count >= 0
    && Number.isInteger(row.reteach_cycle_count)
    && row.reteach_cycle_count >= 0
    && isoDate(row.taught_on)
    && validNullableDate(row.word_next_due_on)
    && validNullableDate(row.next_retest_due_on)
    && validNullableDate(row.failed_review_on)
    && validNullableDate(row.pre_retirement_check_due_on)
    && validNullableDate(row.last_28_day_review_on)
    && validNullableDate(row.word_last_review_completed_on)
    && validNullableInstant(row.word_last_review_completed_at);
}

function proposedScheduledState(input: {
  row: PersistedReviewScheduleWordRow;
  current: CutoverPreviewCurrentState;
}): CutoverPreviewProposedState | null {
  const intervalIndex = input.current.intervalIndex;
  const dueOn = input.current.dueOn;
  if (intervalIndex === null || dueOn === null) return null;
  const persistedState: PersistedReviewScheduleStateC2B2 = {
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    membershipStatus: "scheduled",
    wordIntervalIndex: intervalIndex,
    wordNextDueOn: dueOn,
    consecutiveIndependentFailures: 0,
    failureEpisodeId: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: input.row.last_28_day_review_on as IsoDate | null,
    wordLastReviewCompletedOn: input.row.word_last_review_completed_on as IsoDate | null,
    wordLastReviewCompletedAt: input.row.word_last_review_completed_at,
  };
  const expectedRevision = input.row.word_schedule_transition_count;
  const appliedRevision = expectedRevision + 1;
  const transition: PersistedTargetTransitionRow = {
    schedule_word_id: input.row.id,
    schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    state_shape_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    transition_kind: "POLICY_CUTOVER_APPLIED",
    source_review_outcome_event_id: null,
    source_controlled_graduation_receipt_id: null,
    expected_state_revision: expectedRevision,
    applied_state_revision: appliedRevision,
    from_state: {
      stateShapeVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
      schedulePolicyVersion: CURRENT_REVIEW_POLICY_VERSION,
      membershipStatus: input.row.membership_status,
      wordIntervalIndex: input.row.word_interval_index,
      wordNextDueOn: input.row.word_next_due_on,
      stateRevision: expectedRevision,
    },
    to_state: persistedState,
    transition_reason: "POLICY_CUTOVER_PREVIEW_CLEAN_SCHEDULED",
  };
  const synthetic: PersistedReviewScheduleWordRow = {
    ...input.row,
    membership_status: "scheduled",
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_interval_index: intervalIndex,
    word_next_due_on: dueOn,
    catch_up_stage: 0,
    next_retest_due_on: null,
    failed_review_on: null,
    pre_retirement_check_due_on: null,
    word_schedule_transition_count: appliedRevision,
    consecutive_independent_failures: 0,
    failure_episode_id: null,
  };
  const hydrated = hydratePersistedReviewSchedule({ row: synthetic, transitions: [transition] });
  if (hydrated.disposition !== "HYDRATED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
    return null;
  }
  return {
    policyVersion: TARGET_REVIEW_POLICY_VERSION,
    stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    route: hydrated.schedule.state.route,
    failureLineage: hydrated.schedule.state.failureLineage,
    persistedState,
    cutoverTransitionKind: "POLICY_CUTOVER_APPLIED",
    expectedStateRevision: expectedRevision,
    appliedStateRevision: appliedRevision,
  };
}

export function previewScheduleWordCutover(input: {
  row: PersistedReviewScheduleWordRow;
  legacyBundle?: PersistedLegacyBundleAuthority;
  targetPolicy: PersistedReviewPolicyRow;
  asOfDate: IsoDate;
}): CutoverPreviewRecord {
  if (!isoDate(input.asOfDate)) throw new Error("c2b5_preview_as_of_date_invalid");
  const current = exactCurrentState(input);
  if (input.row.row_status !== "active") {
    return excluded({ row: input.row, current, eligibility: "INELIGIBLE", reason: "ROW_NOT_ACTIVE" });
  }
  if (!targetPolicyConfigFromRegistry(input.targetPolicy)) {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW",
      reason: "TARGET_POLICY_REGISTRY_MALFORMED",
    });
  }
  if (current.authority === "TARGET_V2") {
    return excluded({ row: input.row, current, eligibility: "INELIGIBLE", reason: "ALREADY_TARGET_V2" });
  }
  if (current.authority === "LEGACY_BUNDLE") {
    const hydration = hydratePersistedReviewSchedule({ row: input.row, legacyBundle: input.legacyBundle });
    return excluded({
      row: input.row,
      current,
      eligibility: "REQUIRES_OWNER_REVIEW",
      reason: hydration.disposition === "HYDRATED"
        ? "LEGACY_BUNDLE_AUTHORITY_PREREQUISITE"
        : "MALFORMED_CURRENT_STATE",
    });
  }
  if (current.authority !== "PER_WORD_V1") {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW",
      reason: "UNSUPPORTED_POLICY_STATE_PAIR",
    });
  }
  const hydration = hydratePersistedReviewSchedule({ row: input.row });
  if (hydration.disposition !== "HYDRATED" || !currentStateWellFormed(input.row)) {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW", reason: "MALFORMED_CURRENT_STATE",
    });
  }
  if (input.row.membership_status === "catch_up") {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW", reason: "CATCH_UP_EPISODE_UNRESOLVED",
    });
  }
  if (input.row.membership_status === "ejected_pending_reteach") {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW", reason: "CONTROLLED_RETEACH_BOUNDARY_REQUIRED",
    });
  }
  if (input.row.membership_status === "paused_parent_review") {
    return excluded({ row: input.row, current, eligibility: "INELIGIBLE", reason: "PARENT_PAUSE_PRESERVED" });
  }
  if (input.row.membership_status === "awaiting_pre_retirement_check") {
    return excluded({
      row: input.row, current, eligibility: "INELIGIBLE", reason: "PRE_RETIREMENT_AUTHORITY_PRESERVED",
    });
  }
  if (input.row.membership_status === "retired") {
    return excluded({ row: input.row, current, eligibility: "INELIGIBLE", reason: "RETIRED_AUTHORITY_PRESERVED" });
  }
  if (
    input.row.membership_status !== "scheduled"
    || input.row.word_interval_index === null
    || input.row.word_interval_index < 0
    || input.row.word_interval_index >= REVIEW_RUNGS.length
    || input.row.word_next_due_on === null
    || input.row.catch_up_stage !== 0
    || input.row.next_retest_due_on !== null
    || input.row.failed_review_on !== null
    || input.row.pre_retirement_check_due_on !== null
    || input.row.consecutive_independent_failures !== null
    || input.row.failure_episode_id !== null
  ) {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW", reason: "MALFORMED_CURRENT_STATE",
    });
  }
  if (input.row.word_interval_index === REVIEW_RUNGS.length - 1) {
    return excluded({
      row: input.row, current, eligibility: "INELIGIBLE", reason: "FINAL_RUNG_AUTHORITY_PRESERVED",
    });
  }
  const proposed = proposedScheduledState({ row: input.row, current });
  if (!proposed) {
    return excluded({
      row: input.row, current, eligibility: "REQUIRES_OWNER_REVIEW", reason: "PROPOSED_TARGET_STATE_REJECTED",
    });
  }
  return {
    scheduleWordId: input.row.id,
    childId: input.row.child_id,
    canonicalWordId: input.row.canonical_word_id,
    sourceBundleId: input.row.bundle_id,
    current,
    proposed,
    eligibility: "ELIGIBLE",
    reason: "CLEAN_PER_WORD_V1_SCHEDULED_PRE_FINAL_RUNG",
  };
}

export function buildCutoverPreview(input: {
  rows: readonly PersistedReviewScheduleWordRow[];
  legacyBundles?: ReadonlyMap<string, PersistedLegacyBundleAuthority>;
  targetPolicy: PersistedReviewPolicyRow;
  asOfDate: IsoDate;
}): CutoverPreviewResult {
  const records = [...input.rows].map((row) => previewScheduleWordCutover({
    row,
    legacyBundle: row.bundle_id ? input.legacyBundles?.get(row.bundle_id) : undefined,
    targetPolicy: input.targetPolicy,
    asOfDate: input.asOfDate,
  })).sort((left, right) =>
    left.childId.localeCompare(right.childId)
    || left.canonicalWordId.localeCompare(right.canonicalWordId)
    || left.scheduleWordId.localeCompare(right.scheduleWordId));
  const byReason: Record<string, number> = {};
  const byAuthority: Record<string, number> = {};
  const byMembership: Record<string, number> = {};
  const eligibleByRung: Record<string, number> = {};
  const eligibleByDueStatus: Record<string, number> = {};
  for (const record of records) {
    byReason[record.reason] = (byReason[record.reason] ?? 0) + 1;
    byAuthority[record.current.authority] = (byAuthority[record.current.authority] ?? 0) + 1;
    byMembership[record.current.membership] = (byMembership[record.current.membership] ?? 0) + 1;
    if (record.eligibility === "ELIGIBLE") {
      const rung = record.current.rung ?? "UNKNOWN";
      eligibleByRung[rung] = (eligibleByRung[rung] ?? 0) + 1;
      eligibleByDueStatus[record.current.dueStatus] =
        (eligibleByDueStatus[record.current.dueStatus] ?? 0) + 1;
    }
  }
  const sortedCounts = (counts: Record<string, number>): Readonly<Record<string, number>> =>
    Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
  const normalized = {
    previewVersion: C2B5_CUTOVER_PREVIEW_VERSION,
    asOfDate: input.asOfDate,
    targetPolicyVersion: TARGET_REVIEW_POLICY_VERSION,
    targetStateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    records,
    summary: {
      inspected: records.length,
      eligible: records.filter((record) => record.eligibility === "ELIGIBLE").length,
      ineligible: records.filter((record) => record.eligibility === "INELIGIBLE").length,
      requiresOwnerReview: records.filter((record) => record.eligibility === "REQUIRES_OWNER_REVIEW").length,
      byReason: sortedCounts(byReason),
      byAuthority: sortedCounts(byAuthority),
      byMembership: sortedCounts(byMembership),
      eligibleByRung: sortedCounts(eligibleByRung),
      eligibleByDueStatus: sortedCounts(eligibleByDueStatus),
    },
  };
  return { ...normalized, fingerprint: fingerprintSnapshotValue(normalized) };
}
