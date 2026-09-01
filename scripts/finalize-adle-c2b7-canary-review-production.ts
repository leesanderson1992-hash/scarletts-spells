#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

import { finalizeReviewStageR6 } from "../lib/adle/review-v3/r6-persistence";
import { ensureSpecialistStageR6 } from "../lib/adle/review-v3/r6-specialist-stage";
import { loadReviewScheduleForExecution } from "../lib/adle/review-policy/runtime-repository";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const SESSION_ID = "71865eb0-8ecd-5141-9550-da761dc2d4a2";
const ASSIGNMENT_ID = "25c6f1ad-b5ab-5c83-b545-d3325d690b03";
const CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const SCHEDULE_ID = "5d5e843f-df5d-4188-ae53-65158b02021d";
const CONFIRMATION = `ADLE-C2B7-FINALIZE-SAVED-REVIEW:${PROJECT_REF}:${SESSION_ID}:${SCHEDULE_ID}`;

loadEnvConfig(process.cwd());

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`C2B.7 canary finalization refused: missing ${name}`);
  return value;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (argument("--environment") !== "production" || argument("--confirm") !== CONFIRMATION) {
    throw new Error(`C2B.7 canary finalization refused: use --environment production --confirm '${CONFIRMATION}'`);
  }
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname !== `${PROJECT_REF}.supabase.co`) {
    throw new Error("C2B.7 canary finalization refused: Supabase URL is not pinned Production");
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || required("SB_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [session, assignment, encounters, attempts, receipt, targetBefore, policies] = await Promise.all([
    client.from("adle_review_sessions").select("id,daily_assignment_id,assignment_item_id,child_id,parent_user_id,snapshot_fingerprint,stage,completed_at,state_version").eq("id", SESSION_ID).maybeSingle(),
    client.from("daily_assignments").select("id,child_id,parent_user_id,assignment_date,status,compiled_review_snapshot,compiled_lesson_snapshot").eq("id", ASSIGNMENT_ID).maybeSingle(),
    client.from("adle_review_word_encounters").select("id,schedule_word_id,original_outcome,repair_state,review_outcome_event_id").eq("review_session_id", SESSION_ID),
    client.from("adle_assignment_attempt_events").select("id", { count: "exact", head: true })
      .eq("daily_assignment_id", ASSIGNMENT_ID).eq("evidence_class", "scheduled_review_attempt"),
    client.from("adle_review_completion_receipts").select("id", { count: "exact", head: true }).eq("review_session_id", SESSION_ID),
    client.from("adle_review_schedule_words").select("id,word_schedule_version,word_schedule_policy_version,membership_status,word_interval_index,word_next_due_on,word_schedule_transition_count,consecutive_independent_failures,failure_episode_id").eq("id", SCHEDULE_ID).maybeSingle(),
    client.from("adle_review_policy_versions").select("schedule_policy_version,is_active,is_default_for_new_schedules").in("schedule_policy_version", ["review_policy_v1_2026-07-04", "ADLE_SPACED_REVIEW_REGRESSION_V1"]),
  ]);
  for (const [boundary, result] of [
    ["session", session], ["assignment", assignment], ["encounters", encounters],
    ["attempts", attempts], ["receipt", receipt], ["target", targetBefore], ["policies", policies],
  ] as const) {
    if (result.error) throw new Error(`C2B.7 canary preflight failed at ${boundary}: ${JSON.stringify({
      message: result.error.message, code: result.error.code,
      details: result.error.details, hint: result.error.hint,
    })}`);
  }
  if (!session.data || !assignment.data || !targetBefore.data
    || session.data.daily_assignment_id !== ASSIGNMENT_ID || session.data.child_id !== CHILD_ID
    || assignment.data.child_id !== CHILD_ID || session.data.stage !== "ready_to_complete"
    || session.data.completed_at !== null || receipt.count !== 0 || attempts.count !== 10
    || encounters.data?.length !== 10
    || encounters.data.some((row) => !["success", "failure"].includes(row.original_outcome)
      || !["not_required", "completed_correct", "attempted_not_secured"].includes(row.repair_state)
      || row.review_outcome_event_id !== null)
    || targetBefore.data.word_schedule_version !== "adle_review_per_word_schedule_v2"
    || targetBefore.data.word_schedule_policy_version !== "ADLE_SPACED_REVIEW_REGRESSION_V1"
    || targetBefore.data.word_schedule_transition_count !== 1
    || !policies.data?.some((row) => row.schedule_policy_version === "ADLE_SPACED_REVIEW_REGRESSION_V1"
      && row.is_active === false && row.is_default_for_new_schedules === false)) {
    throw new Error("C2B.7 canary preflight failed: saved Review or target pin drifted");
  }

  const finalization = await finalizeReviewStageR6({
    client,
    reviewSessionId: SESSION_ID,
    snapshotFingerprint: session.data.snapshot_fingerprint,
    idempotencyKey: `c2b7-canary-finalize:${SESSION_ID}`,
  });
  const specialist = await ensureSpecialistStageR6({
    userClient: client,
    serviceClient: client,
    parentUserId: session.data.parent_user_id,
    childId: CHILD_ID,
    assignmentId: ASSIGNMENT_ID,
    assignmentDate: assignment.data.assignment_date,
  });

  const [sessionAfter, receiptAfter, outcomesAfter, targetAfter, transitionAfter, assignmentAfter, policyAfter, v2After] = await Promise.all([
    client.from("adle_review_sessions").select("stage,completed_at,state_version").eq("id", SESSION_ID).maybeSingle(),
    client.from("adle_review_completion_receipts").select("id,idempotency_key,completed_at,result_payload").eq("review_session_id", SESSION_ID),
    client.from("adle_review_outcome_events").select("id,schedule_word_id,event_type,completed_at,review_completed_on").eq("review_session_id", SESSION_ID),
    client.from("adle_review_schedule_words").select("id,word_schedule_version,word_schedule_policy_version,membership_status,word_interval_index,word_next_due_on,word_schedule_transition_count,consecutive_independent_failures,failure_episode_id,word_last_review_completed_at").eq("id", SCHEDULE_ID).maybeSingle(),
    client.from("adle_review_schedule_transition_events").select("id,transition_kind,expected_state_revision,applied_state_revision,source_review_outcome_event_id,from_state,to_state,source_fingerprint,occurred_at").eq("schedule_word_id", SCHEDULE_ID).eq("transition_kind", "REVIEW_OUTCOME_APPLIED"),
    client.from("daily_assignments").select("status,compiled_lesson_snapshot").eq("id", ASSIGNMENT_ID).maybeSingle(),
    client.from("adle_review_policy_versions").select("is_active,is_default_for_new_schedules").eq("schedule_policy_version", "ADLE_SPACED_REVIEW_REGRESSION_V1").maybeSingle(),
    client.from("adle_review_schedule_words").select("id", { count: "exact", head: true }).eq("word_schedule_version", "adle_review_per_word_schedule_v2"),
  ]);
  for (const result of [sessionAfter, receiptAfter, outcomesAfter, targetAfter, transitionAfter, assignmentAfter, policyAfter, v2After]) {
    if (result.error) throw new Error(`C2B.7 canary post-verification failed: ${result.error.message}`);
  }
  const toState = transitionAfter.data?.[0]?.to_state as Record<string, unknown> | undefined;
  if (!sessionAfter.data?.completed_at || receiptAfter.data?.length !== 1
    || outcomesAfter.data?.length !== 10 || transitionAfter.data?.length !== 1
    || !targetAfter.data || targetAfter.data.word_schedule_transition_count !== 2
    || transitionAfter.data[0]?.expected_state_revision !== 1
    || transitionAfter.data[0]?.applied_state_revision !== 2
    || !toState
    || toState.stateShapeVersion !== targetAfter.data.word_schedule_version
    || toState.schedulePolicyVersion !== targetAfter.data.word_schedule_policy_version
    || toState.membershipStatus !== targetAfter.data.membership_status
    || toState.wordIntervalIndex !== targetAfter.data.word_interval_index
    || toState.wordNextDueOn !== targetAfter.data.word_next_due_on
    || toState.consecutiveIndependentFailures !== targetAfter.data.consecutive_independent_failures
    || toState.failureEpisodeId !== targetAfter.data.failure_episode_id
    || toState.wordLastReviewCompletedAt !== targetAfter.data.word_last_review_completed_at
    || policyAfter.data?.is_active !== false || policyAfter.data.is_default_for_new_schedules !== false
    || v2After.count !== 1) {
    throw new Error("C2B.7 canary post-verification failed: atomic finalization/transition mismatch");
  }
  const hydrated = await loadReviewScheduleForExecution({ client, scheduleWordId: SCHEDULE_ID });
  if (hydrated.disposition !== "HYDRATED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
    throw new Error("C2B.7 canary post-verification failed: target row no longer hydrates");
  }
  console.log(JSON.stringify({
    status: "PASS",
    sessionId: SESSION_ID,
    assignmentId: ASSIGNMENT_ID,
    finalization,
    specialist,
    reviewCompletedAt: sessionAfter.data.completed_at,
    outcomeEvents: outcomesAfter.data.length,
    targetTransition: transitionAfter.data[0],
    targetSchedule: targetAfter.data,
    targetHydration: hydrated.schedule.kind,
    assignmentHasSpecialistSnapshot: assignmentAfter.data?.compiled_lesson_snapshot !== null,
    targetRegistryActive: policyAfter.data.is_active,
    targetRegistryDefault: policyAfter.data.is_default_for_new_schedules,
    productionV2ScheduleCount: v2After.count,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
