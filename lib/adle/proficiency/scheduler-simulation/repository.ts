import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables intentionally lead generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CURRENT_REVIEW_POLICY_VERSION } from "../../review-policy/contracts";
import type { LearnerEvidenceProjectionResult } from "../evidence/contracts";
import type { ControlledAttemptFact, CurrentRouteFact, SchedulerSimulationResult } from "./contracts";
import { buildSchedulerSimulation } from "./reconciliation";

const PAGE_SIZE = 500;

async function readAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  configure: (query: any) => any = (query) => query,
  key = "id",
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = configure(client.from(table).select(columns)).order(key, { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt(key, after);
    const { data, error } = await query;
    if (error) throw new Error(`scheduler-simulation read ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    const last = page.at(-1) as Record<string, unknown>;
    if (typeof last[key] !== "string" || !last[key]) throw new Error(`scheduler-simulation read ${table}: paging identity missing`);
    after = last[key] as string;
  }
}

function reconstructedFailures(
  row: any,
  outcomes: readonly any[],
): number | null {
  let count = 0;
  for (const outcome of outcomes) {
    if (outcome.original_result === "success") count = 0;
    else if (outcome.original_result === "failure") count += 1;
  }
  if (row.membership_status === "catch_up" && row.catch_up_stage === 1) return Math.max(1, count);
  if (row.membership_status === "catch_up" && row.catch_up_stage === 2) return Math.max(2, count);
  if (["ejected_pending_reteach", "paused_parent_review"].includes(row.membership_status)) return Math.max(3, count);
  if (["scheduled", "awaiting_pre_retirement_check", "retired"].includes(row.membership_status)) return count;
  return null;
}

export async function loadSchedulerSimulation(input: {
  client: SupabaseClient;
  phaseC: LearnerEvidenceProjectionResult;
  asOfOn: string;
}): Promise<SchedulerSimulationResult> {
  const [attemptRows, assignmentRows, scheduleRows, bundleRows, outcomeRows, policyRows] = await Promise.all([
    readAll<any>(input.client, "adle_assignment_attempt_events", "id,child_id,daily_assignment_id,canonical_word_id,is_correct,attempt_kind,evidence_class,created_at", (query) =>
      query.eq("evidence_class", "first_exposure_lesson_attempt").in("attempt_kind", ["lesson_production", "lesson_dictation"])),
    readAll<any>(input.client, "daily_assignments", "id,assignment_date"),
    readAll<any>(input.client, "adle_review_schedule_words", "id,child_id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,failed_review_on,pre_retirement_check_due_on,row_status,word_schedule_version,word_interval_index,word_next_due_on,word_schedule_policy_version"),
    readAll<any>(input.client, "adle_review_bundles", "id,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status"),
    readAll<any>(input.client, "adle_review_outcome_events", "id,schedule_word_id,original_result,review_completed_on,event_type,due_kind"),
    readAll<any>(input.client, "adle_review_policy_versions", "schedule_policy_version,is_active,interval_ladder_days,catch_up_offsets_days,session_cap,pre_retirement_check_gap_days", undefined, "schedule_policy_version"),
  ]);
  const assignmentDate = new Map(assignmentRows.map((row) => [row.id as string, row.assignment_date as string]));
  const controlledPhaseCBySourceId = new Map<string, string>();
  for (const event of input.phaseC.events) {
    if (event.environment !== "CONTROLLED_LESSON" || event.independence !== "independent" || event.verificationState !== "verified") continue;
    for (const source of event.provenance.sourceRepresentations) {
      if (source.sourceKind === "adle_assignment_attempt_event") controlledPhaseCBySourceId.set(source.sourceEntityId, event.eventId);
    }
  }
  const controlledAttempts: ControlledAttemptFact[] = [];
  for (const row of attemptRows) {
    const eventId = controlledPhaseCBySourceId.get(row.id);
    if (!eventId || !row.canonical_word_id || typeof row.is_correct !== "boolean") continue;
    controlledAttempts.push({
      eventId,
      learnerId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      controlledCycleId: row.daily_assignment_id,
      opportunity: row.attempt_kind === "lesson_production" ? "COVER_WRITE" : "SENTENCE_DICTATION",
      outcome: row.is_correct ? "pass" : "fail",
      occurredOn: assignmentDate.get(row.daily_assignment_id) ?? String(row.created_at).slice(0, 10),
    });
  }
  const bundleById = new Map(bundleRows.map((row) => [row.id as string, row]));
  const policyByVersion = new Map(policyRows.map((row) => [row.schedule_policy_version as string, row]));
  const outcomesByScheduleWord = new Map<string, any[]>();
  for (const row of outcomeRows) {
    if (!row.schedule_word_id || !row.original_result) continue;
    outcomesByScheduleWord.set(row.schedule_word_id, [...(outcomesByScheduleWord.get(row.schedule_word_id) ?? []), row]);
  }
  for (const rows of outcomesByScheduleWord.values()) {
    rows.sort((left, right) => String(left.review_completed_on).localeCompare(String(right.review_completed_on)) || String(left.id).localeCompare(String(right.id)));
  }
  const currentRoutes: CurrentRouteFact[] = scheduleRows.map((row) => {
    const bundle = bundleById.get(row.bundle_id);
    const perWord = row.word_schedule_version === "adle_review_per_word_schedule_v1"
      && row.word_interval_index !== null && row.word_schedule_policy_version;
    const legacy = row.word_schedule_version === null
      && row.word_interval_index === null && row.word_next_due_on === null
      && row.word_schedule_policy_version === null && bundle;
    const scheduleAuthority: CurrentRouteFact["scheduleAuthority"] = perWord
      ? "PER_WORD_V1" : legacy ? "LEGACY_BUNDLE" : "CONFLICTING";
    const effectiveIntervalIndex = perWord ? row.word_interval_index : legacy ? bundle.interval_index : null;
    const scheduledDue = perWord ? row.word_next_due_on : legacy ? bundle.next_due_on : null;
    const effectiveDueOn = row.membership_status === "catch_up"
      ? row.next_retest_due_on
      : row.membership_status === "scheduled" ? scheduledDue : null;
    const currentPolicyVersion = perWord ? row.word_schedule_policy_version : legacy ? bundle.schedule_policy_version : null;
    const currentPolicy = currentPolicyVersion ? policyByVersion.get(currentPolicyVersion) : null;
    return {
      scheduleWordId: row.id,
      learnerId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      membershipStatus: row.membership_status,
      catchUpStage: row.catch_up_stage,
      effectiveIntervalIndex,
      effectiveDueOn,
      failedReviewOn: row.failed_review_on,
      preRetirementCheckDueOn: row.pre_retirement_check_due_on,
      rowStatus: row.row_status,
      scheduleAuthority,
      currentPolicyVersion,
      currentPolicyLadderCompatible: JSON.stringify(currentPolicy?.interval_ladder_days ?? null) === JSON.stringify([1, 3, 7, 14, 28, 56]),
      reconstructedConsecutiveFailures: reconstructedFailures(row, outcomesByScheduleWord.get(row.id) ?? []),
    } satisfies CurrentRouteFact;
  });
  const currentPolicies = policyRows.filter((row) => row.schedule_policy_version === CURRENT_REVIEW_POLICY_VERSION);
  if (currentPolicies.length !== 1 || !Number.isInteger(currentPolicies[0].session_cap) || currentPolicies[0].session_cap < 1) {
    throw new Error("scheduler-simulation pinned current policy missing or ambiguous");
  }
  return buildSchedulerSimulation({
    controlledAttempts,
    currentRoutes,
    asOfOn: input.asOfOn,
    sessionCap: currentPolicies[0].session_cap,
    sourceFactsForFingerprint: {
      phaseCEventFingerprint: input.phaseC.reconciliation.eventFingerprint,
      attempts: attemptRows,
      assignments: assignmentRows,
      schedules: scheduleRows,
      bundles: bundleRows,
      outcomes: outcomeRows,
      policies: policyRows,
    },
  });
}
