import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { TARGET_REVIEW_POLICY_VERSION } from "./contracts";
import {
  hydratePersistedReviewSchedule,
  targetPolicyConfigFromRegistry,
  type HydrateReviewScheduleResult,
  type PersistedLegacyBundleAuthority,
  type PersistedReviewPolicyRow,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "./runtime-coexistence";

const SCHEDULE_SELECT = [
  "id", "child_id", "canonical_word_id", "bundle_id", "membership_status",
  "taught_on", "row_status", "word_schedule_version",
  "word_schedule_policy_version", "word_interval_index", "word_next_due_on",
  "catch_up_stage", "next_retest_due_on", "failed_review_on",
  "pre_retirement_check_due_on", "last_28_day_review_on", "reteach_cycle_count",
  "word_schedule_transition_count", "word_last_review_completed_on",
  "word_last_review_completed_at", "consecutive_independent_failures",
  "failure_episode_id",
].join(",");

const TRANSITION_SELECT = [
  "schedule_word_id", "schedule_policy_version", "state_shape_version",
  "transition_kind", "source_review_outcome_event_id",
  "source_controlled_graduation_receipt_id", "expected_state_revision",
  "applied_state_revision", "from_state", "to_state", "transition_reason",
].join(",");

function databaseError(boundary: string, error: { message?: string } | null): never {
  throw new Error(`${boundary}:${error?.message ?? "unknown_database_error"}`);
}

export type LoadedReviewScheduleForExecution = HydrateReviewScheduleResult & {
  targetPolicyConfig?: ReturnType<typeof targetPolicyConfigFromRegistry>;
};

/**
 * Server-only exact-pin loader. It never queries registry active/default flags
 * to choose an executor. Target registry flags are read only so regressions can
 * prove that an inactive/non-default pinned target word still executes.
 */
export async function loadReviewScheduleForExecution(input: {
  client: SupabaseClient;
  scheduleWordId: string;
}): Promise<LoadedReviewScheduleForExecution> {
  const wordResult = await input.client.from("adle_review_schedule_words")
    .select(SCHEDULE_SELECT)
    .eq("id", input.scheduleWordId)
    .maybeSingle();
  if (wordResult.error) databaseError("loadReviewScheduleForExecution:word", wordResult.error);
  if (!wordResult.data) return { disposition: "REJECTED", reason: "SCHEDULE_PIN_MISSING" };
  const row = wordResult.data as unknown as PersistedReviewScheduleWordRow;

  let legacyBundle: PersistedLegacyBundleAuthority | undefined;
  if (row.word_schedule_version === null && row.word_schedule_policy_version === null && row.bundle_id) {
    const bundleResult = await input.client.from("adle_review_bundles")
      .select("schedule_policy_version,interval_index,next_due_on")
      .eq("id", row.bundle_id)
      .maybeSingle();
    if (bundleResult.error) databaseError("loadReviewScheduleForExecution:legacyBundle", bundleResult.error);
    legacyBundle = bundleResult.data as PersistedLegacyBundleAuthority | undefined;
  }

  let transitions: PersistedTargetTransitionRow[] = [];
  let targetPolicy: PersistedReviewPolicyRow | null = null;
  if (row.word_schedule_policy_version === TARGET_REVIEW_POLICY_VERSION) {
    const [transitionResult, policyResult] = await Promise.all([
      input.client.from("adle_review_schedule_transition_events")
        .select(TRANSITION_SELECT)
        .eq("schedule_word_id", row.id)
        .order("applied_state_revision", { ascending: true }),
      input.client.from("adle_review_policy_versions")
        .select("schedule_policy_version,is_active,is_default_for_new_schedules,transition_family,interval_ladder_days,catch_up_offsets_days,recovery_delay_days,due_anchor,controlled_graduation_policy_version,session_cap")
        .eq("schedule_policy_version", row.word_schedule_policy_version)
        .maybeSingle(),
    ]);
    if (transitionResult.error) {
      databaseError("loadReviewScheduleForExecution:transitions", transitionResult.error);
    }
    if (policyResult.error) databaseError("loadReviewScheduleForExecution:policy", policyResult.error);
    transitions = (transitionResult.data ?? []) as unknown as PersistedTargetTransitionRow[];
    targetPolicy = policyResult.data as unknown as PersistedReviewPolicyRow | null;
  }

  const hydrated = hydratePersistedReviewSchedule({ row, transitions, legacyBundle });
  if (hydrated.disposition === "REJECTED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
    return hydrated;
  }
  const targetPolicyConfig = targetPolicy ? targetPolicyConfigFromRegistry(targetPolicy) : null;
  if (!targetPolicyConfig) {
    return { disposition: "REJECTED", reason: "TARGET_STATE_MALFORMED" };
  }
  return { ...hydrated, targetPolicyConfig };
}
