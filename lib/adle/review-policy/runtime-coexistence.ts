import type { IsoDate } from "../review-scheduler";
import {
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  type PerWordReviewMembershipStatus,
  type PerWordScheduleTransitionStateV1,
} from "../review-v3/per-word-scheduler";
import {
  ADLE_REVIEW_DUE_ANCHOR_V1,
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  LEGACY_BUNDLE_STATE_SHAPE_VERSION,
  REVIEW_RUNGS,
  ROLLING_FROM_COMPLETION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type ReviewRung,
  type TargetReviewPolicyConfig,
  type TargetReviewState,
} from "./contracts";
import {
  resolvePureReviewPolicyExecutor,
  type SupportedPureReviewPolicyExecutor,
} from "./pure-dispatch";
import { TARGET_REVIEW_POLICY_CONFIG } from "./target-regression-v1";

export const TARGET_REVIEW_REDUCER_VERSION = TARGET_REVIEW_POLICY_VERSION;

export type PersistedReviewScheduleStateC2B2 = {
  stateShapeVersion: string;
  schedulePolicyVersion: string;
  membershipStatus: string;
  wordIntervalIndex: number;
  wordNextDueOn: IsoDate | null;
  consecutiveIndependentFailures: number;
  failureEpisodeId: string | null;
  preRetirementCheckDueOn: IsoDate | null;
  last28DayReviewOn: IsoDate | null;
  wordLastReviewCompletedOn: IsoDate | null;
  wordLastReviewCompletedAt: string | null;
};

export type PersistedReviewScheduleWordRow = {
  id: string;
  child_id: string;
  canonical_word_id: string;
  bundle_id: string | null;
  membership_status: string;
  taught_on: string;
  row_status: string;
  word_schedule_version: string | null;
  word_schedule_policy_version: string | null;
  word_interval_index: number | null;
  word_next_due_on: string | null;
  catch_up_stage: number;
  next_retest_due_on: string | null;
  failed_review_on: string | null;
  pre_retirement_check_due_on: string | null;
  last_28_day_review_on: string | null;
  reteach_cycle_count: number;
  word_schedule_transition_count: number;
  word_last_review_completed_on: string | null;
  word_last_review_completed_at: string | null;
  consecutive_independent_failures: number | null;
  failure_episode_id: string | null;
};

export type PersistedLegacyBundleAuthority = {
  schedule_policy_version: string;
  interval_index: number;
  next_due_on: string;
};

export type PersistedTargetTransitionRow = {
  schedule_word_id: string;
  schedule_policy_version: string;
  state_shape_version: string;
  transition_kind: "REVIEW_OUTCOME_APPLIED" | "CONTROLLED_PASS_APPLIED" | "POLICY_CUTOVER_APPLIED";
  source_review_outcome_event_id: string | null;
  source_controlled_graduation_receipt_id: string | null;
  expected_state_revision: number;
  applied_state_revision: number;
  from_state: unknown;
  to_state: unknown;
  transition_reason: string;
};

export type PersistedReviewPolicyRow = {
  schedule_policy_version: string;
  is_active: boolean;
  is_default_for_new_schedules: boolean;
  transition_family: string;
  interval_ladder_days: number[];
  catch_up_offsets_days: number[] | null;
  recovery_delay_days: number | null;
  due_anchor: string;
  controlled_graduation_policy_version: string | null;
  session_cap: number;
};

type HydratedBase = {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  stateRevision: number;
  executor: SupportedPureReviewPolicyExecutor;
};

export type HydratedReviewSchedule =
  | (HydratedBase & {
      kind: "CURRENT_V1";
      stateShapeVersion:
        | typeof CURRENT_PER_WORD_STATE_SHAPE_VERSION
        | typeof LEGACY_BUNDLE_STATE_SHAPE_VERSION;
      state: PerWordScheduleTransitionStateV1;
    })
  | (HydratedBase & {
      kind: "TARGET_REGRESSION_V1";
      stateShapeVersion: typeof TARGET_PER_WORD_STATE_SHAPE_VERSION;
      state: TargetReviewState;
      persistedState: PersistedReviewScheduleStateC2B2;
    });

export type HydrateReviewScheduleResult =
  | { disposition: "HYDRATED"; schedule: HydratedReviewSchedule }
  | {
      disposition: "REJECTED";
      reason:
        | "SCHEDULE_PIN_MISSING"
        | "UNKNOWN_POLICY_VERSION"
        | "POLICY_STATE_SHAPE_MISMATCH"
        | "CURRENT_STATE_MALFORMED"
        | "TARGET_STATE_MALFORMED"
        | "TARGET_TRANSITION_HISTORY_MALFORMED";
    };

function isoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nullableIsoDate(value: unknown): value is IsoDate | null {
  return value === null || isoDate(value);
}

function stateRecord(value: unknown): value is PersistedReviewScheduleStateC2B2 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const exactKeys = [
    "stateShapeVersion", "schedulePolicyVersion", "membershipStatus",
    "wordIntervalIndex", "wordNextDueOn", "consecutiveIndependentFailures",
    "failureEpisodeId", "preRetirementCheckDueOn", "last28DayReviewOn",
    "wordLastReviewCompletedOn", "wordLastReviewCompletedAt",
  ];
  return Object.keys(row).sort().join("|") === [...exactKeys].sort().join("|")
    && typeof row.stateShapeVersion === "string"
    && typeof row.schedulePolicyVersion === "string"
    && typeof row.membershipStatus === "string"
    && Number.isInteger(row.wordIntervalIndex)
    && nullableIsoDate(row.wordNextDueOn)
    && Number.isInteger(row.consecutiveIndependentFailures)
    && (row.failureEpisodeId === null || typeof row.failureEpisodeId === "string")
    && nullableIsoDate(row.preRetirementCheckDueOn)
    && nullableIsoDate(row.last28DayReviewOn)
    && nullableIsoDate(row.wordLastReviewCompletedOn)
    && (row.wordLastReviewCompletedAt === null || (
      typeof row.wordLastReviewCompletedAt === "string"
      && !Number.isNaN(new Date(row.wordLastReviewCompletedAt).getTime())
    ));
}

export function persistedTargetStateFromRow(
  row: PersistedReviewScheduleWordRow,
): PersistedReviewScheduleStateC2B2 | null {
  if (
    row.word_schedule_version !== TARGET_PER_WORD_STATE_SHAPE_VERSION
    || row.word_schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
    || row.word_interval_index === null
    || row.consecutive_independent_failures === null
  ) return null;
  const result: PersistedReviewScheduleStateC2B2 = {
    stateShapeVersion: row.word_schedule_version,
    schedulePolicyVersion: row.word_schedule_policy_version,
    membershipStatus: row.membership_status,
    wordIntervalIndex: row.word_interval_index,
    wordNextDueOn: row.word_next_due_on as IsoDate | null,
    consecutiveIndependentFailures: row.consecutive_independent_failures,
    failureEpisodeId: row.failure_episode_id,
    preRetirementCheckDueOn: row.pre_retirement_check_due_on as IsoDate | null,
    last28DayReviewOn: row.last_28_day_review_on as IsoDate | null,
    wordLastReviewCompletedOn: row.word_last_review_completed_on as IsoDate | null,
    wordLastReviewCompletedAt: row.word_last_review_completed_at,
  };
  return stateRecord(result) ? result : null;
}

function sameState(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(left) === canonical(right);
}

function targetStateFromPersistence(input: {
  persisted: PersistedReviewScheduleStateC2B2;
  transitions: readonly PersistedTargetTransitionRow[];
  revision: number;
  scheduleWordId: string;
}): TargetReviewState | null {
  const { persisted } = input;
  if (
    persisted.stateShapeVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION
    || persisted.schedulePolicyVersion !== TARGET_REVIEW_POLICY_VERSION
    || persisted.wordIntervalIndex < 0
    || persisted.wordIntervalIndex >= REVIEW_RUNGS.length
    || persisted.consecutiveIndependentFailures < 0
    || (persisted.consecutiveIndependentFailures === 0) !== (persisted.failureEpisodeId === null)
  ) return null;

  const transitions = [...input.transitions].sort((a, b) =>
    a.applied_state_revision - b.applied_state_revision);
  if ((input.revision === 0) !== (transitions.length === 0)) return null;
  const firstExpectedRevision = transitions[0]?.expected_state_revision ?? 0;
  if (firstExpectedRevision > 0 && transitions[0]?.transition_kind !== "POLICY_CUTOVER_APPLIED") {
    return null;
  }
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index];
    const expectedRevision = firstExpectedRevision + index;
    const cutoverFromState = index === 0
      && transition.transition_kind === "POLICY_CUTOVER_APPLIED";
    if (
      transition.schedule_word_id !== input.scheduleWordId
      || transition.schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
      || transition.state_shape_version !== TARGET_PER_WORD_STATE_SHAPE_VERSION
      || transition.expected_state_revision !== expectedRevision
      || transition.applied_state_revision !== expectedRevision + 1
      || (!cutoverFromState && !stateRecord(transition.from_state))
      || (cutoverFromState && (
        typeof transition.from_state !== "object"
        || transition.from_state === null
        || Array.isArray(transition.from_state)
      ))
      || !stateRecord(transition.to_state)
      || (index > 0 && !sameState(transitions[index - 1].to_state, transition.from_state))
    ) return null;
  }
  if (transitions.length > 0 && transitions.at(-1)?.applied_state_revision !== input.revision) {
    return null;
  }
  if (transitions.length > 0 && !sameState(transitions.at(-1)?.to_state, persisted)) return null;

  const appliedEventIds = transitions.flatMap((transition) => {
    if (transition.transition_kind === "REVIEW_OUTCOME_APPLIED") {
      return transition.source_review_outcome_event_id ? [transition.source_review_outcome_event_id] : [];
    }
    if (transition.transition_kind === "CONTROLLED_PASS_APPLIED") {
      return transition.source_controlled_graduation_receipt_id
        ? [transition.source_controlled_graduation_receipt_id]
        : [];
    }
    return [];
  });
  if (new Set(appliedEventIds).size !== appliedEventIds.length) return null;

  const failureLineage: TargetReviewState["failureLineage"] =
    persisted.consecutiveIndependentFailures === 0
      ? { resolution: "NONE", episodeId: null, consecutiveIndependentFailures: 0 }
      : {
          resolution: "UNRESOLVED",
          episodeId: persisted.failureEpisodeId as string,
          consecutiveIndependentFailures: persisted.consecutiveIndependentFailures,
        };
  const rung = REVIEW_RUNGS[persisted.wordIntervalIndex] as ReviewRung;
  const latest = transitions.at(-1);
  const regressionOrigin = latest?.transition_reason === "RECOVERY_FAILURE_REGRESSED_ONE_RUNG"
    && stateRecord(latest.from_state)
    ? REVIEW_RUNGS[latest.from_state.wordIntervalIndex] ?? null
    : null;

  let route: TargetReviewState["route"];
  if (persisted.membershipStatus === "scheduled" && persisted.wordNextDueOn !== null) {
    route = { membership: "SCHEDULED", rung, dueOn: persisted.wordNextDueOn, regressionOrigin };
  } else if (
    persisted.membershipStatus === "next_day_recovery"
    && rung !== "DAY_1"
    && persisted.wordNextDueOn !== null
  ) {
    route = { membership: "NEXT_DAY_RECOVERY", failedRung: rung, dueOn: persisted.wordNextDueOn };
  } else if (persisted.membershipStatus === "controlled_reacquisition") {
    if (failureLineage.resolution !== "UNRESOLVED") return null;
    route = {
      membership: "CONTROLLED_REACQUISITION",
      requiredBecause: failureLineage.consecutiveIndependentFailures >= 3
        ? "THIRD_CONSECUTIVE_FAILURE"
        : "DAY_1_FAILURE",
    };
  } else if (
    persisted.membershipStatus === "awaiting_pre_retirement_check"
    && persisted.preRetirementCheckDueOn !== null
  ) {
    route = { membership: "PRE_RETIREMENT_PRESERVED", dueOn: persisted.preRetirementCheckDueOn };
  } else if (persisted.membershipStatus === "retired") {
    route = { membership: "RETIRED_PRESERVED" };
  } else {
    return null;
  }
  return { route, failureLineage, appliedEventIds };
}

function currentStateFromRow(input: {
  row: PersistedReviewScheduleWordRow;
  stateShapeVersion: typeof CURRENT_PER_WORD_STATE_SHAPE_VERSION | typeof LEGACY_BUNDLE_STATE_SHAPE_VERSION;
  policyVersion: string;
  legacyBundle?: PersistedLegacyBundleAuthority;
}): PerWordScheduleTransitionStateV1 | null {
  const { row } = input;
  const intervalIndex = input.stateShapeVersion === LEGACY_BUNDLE_STATE_SHAPE_VERSION
    ? input.legacyBundle?.interval_index
    : row.word_interval_index;
  const nextDueOn = input.stateShapeVersion === LEGACY_BUNDLE_STATE_SHAPE_VERSION
    ? input.legacyBundle?.next_due_on
    : row.word_next_due_on;
  if (
    intervalIndex === null || intervalIndex === undefined || !Number.isInteger(intervalIndex)
    || row.catch_up_stage < 0 || row.catch_up_stage > 2
    || row.consecutive_independent_failures !== null || row.failure_episode_id !== null
  ) return null;
  const memberships: readonly string[] = [
    "scheduled", "catch_up", "ejected_pending_reteach", "paused_parent_review",
    "awaiting_pre_retirement_check", "retired",
  ];
  if (!memberships.includes(row.membership_status)) return null;
  return {
    scheduleWordId: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    sourceBundleId: row.bundle_id,
    scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
    schedulePolicyVersion: input.policyVersion,
    intervalIndex,
    membershipStatus: row.membership_status as PerWordReviewMembershipStatus,
    nextDueOn: (nextDueOn ?? null) as IsoDate | null,
    catchUpStage: row.catch_up_stage as 0 | 1 | 2,
    nextRetestDueOn: row.next_retest_due_on as IsoDate | null,
    failedReviewOn: row.failed_review_on as IsoDate | null,
    preRetirementCheckDueOn: row.pre_retirement_check_due_on as IsoDate | null,
    last28DayReviewOn: row.last_28_day_review_on as IsoDate | null,
    reteachCycleCount: row.reteach_cycle_count,
    rowStatus: row.row_status === "active" ? "active" : "superseded",
  };
}

/**
 * Hydrates only an exact persisted policy/state pair. Registry rollout/default
 * flags are intentionally absent: they cannot disable or reinterpret a pinned
 * schedule. Legacy bundle state requires an explicit bundle authority input.
 */
export function hydratePersistedReviewSchedule(input: {
  row: PersistedReviewScheduleWordRow;
  transitions?: readonly PersistedTargetTransitionRow[];
  legacyBundle?: PersistedLegacyBundleAuthority;
}): HydrateReviewScheduleResult {
  const { row } = input;
  const legacy = row.word_schedule_version === null && row.word_schedule_policy_version === null;
  const stateShapeVersion = legacy
    ? LEGACY_BUNDLE_STATE_SHAPE_VERSION
    : row.word_schedule_version;
  const policyVersion = legacy
    ? input.legacyBundle?.schedule_policy_version
    : row.word_schedule_policy_version;
  if (!stateShapeVersion || !policyVersion) {
    return { disposition: "REJECTED", reason: "SCHEDULE_PIN_MISSING" };
  }
  const dispatch = resolvePureReviewPolicyExecutor(policyVersion, stateShapeVersion);
  if (dispatch.disposition === "REJECTED") return dispatch;

  const base: HydratedBase = {
    scheduleWordId: row.id,
    childId: row.child_id,
    canonicalWordId: row.canonical_word_id,
    sourceBundleId: row.bundle_id,
    stateRevision: row.word_schedule_transition_count,
    executor: dispatch.executor,
  };
  if (dispatch.executor.kind === "CURRENT_REVIEW_POLICY_V1") {
    const shape = stateShapeVersion as
      | typeof CURRENT_PER_WORD_STATE_SHAPE_VERSION
      | typeof LEGACY_BUNDLE_STATE_SHAPE_VERSION;
    const state = currentStateFromRow({
      row, stateShapeVersion: shape, policyVersion, legacyBundle: input.legacyBundle,
    });
    return state
      ? { disposition: "HYDRATED", schedule: { ...base, kind: "CURRENT_V1", stateShapeVersion: shape, state } }
      : { disposition: "REJECTED", reason: "CURRENT_STATE_MALFORMED" };
  }

  const persistedState = persistedTargetStateFromRow(row);
  if (!persistedState) return { disposition: "REJECTED", reason: "TARGET_STATE_MALFORMED" };
  const state = targetStateFromPersistence({
    persisted: persistedState,
    transitions: input.transitions ?? [],
    revision: row.word_schedule_transition_count,
    scheduleWordId: row.id,
  });
  return state
    ? {
        disposition: "HYDRATED",
        schedule: {
          ...base,
          kind: "TARGET_REGRESSION_V1",
          stateShapeVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
          state,
          persistedState,
        },
      }
    : { disposition: "REJECTED", reason: "TARGET_TRANSITION_HISTORY_MALFORMED" };
}

/** Validates target registry semantics without using its active/default flags. */
export function targetPolicyConfigFromRegistry(
  row: PersistedReviewPolicyRow,
): TargetReviewPolicyConfig | null {
  if (
    row.schedule_policy_version !== TARGET_REVIEW_POLICY_VERSION
    || row.transition_family !== "REGRESSION_V1"
    || row.interval_ladder_days.join(",") !== "1,3,7,14,28,56"
    || row.catch_up_offsets_days !== null
    || row.recovery_delay_days !== 1
    || row.due_anchor !== ROLLING_FROM_COMPLETION
    || row.controlled_graduation_policy_version !== "ADLE_CONTROLLED_GRADUATION_V1_OR"
  ) return null;
  return {
    ...TARGET_REVIEW_POLICY_CONFIG,
    dueDates: {
      ...TARGET_REVIEW_POLICY_CONFIG.dueDates,
      dueAnchorVersion: ADLE_REVIEW_DUE_ANCHOR_V1,
    },
  };
}

export function currentNewSchedulePolicyVersion(): typeof CURRENT_REVIEW_POLICY_VERSION {
  return CURRENT_REVIEW_POLICY_VERSION;
}
