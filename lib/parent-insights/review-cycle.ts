import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ReviewPillStatus = "neutral" | "advancing" | "staying" | "regressed";
export type ReviewBucket = {
  key: string;
  label: string;
  words: { id: string; word: string; status: ReviewPillStatus; dueOn: string | null }[];
};

type ScheduleRow = {
  id: string;
  canonical_word_id: string;
  bundle_id: string | null;
  membership_status: string;
  catch_up_stage: number;
  next_retest_due_on: string | null;
  taught_on: string;
  word_interval_index: number | null;
  word_next_due_on: string | null;
  word_last_review_completed_on: string | null;
};

export function classifyReviewWord(input: {
  row: ScheduleRow;
  intervalIndex: number | null;
  dueOn: string | null;
  today: string;
  latestReason: string | null;
  latestOutcome: string | null;
}): { bucket: number | "waiting" | "exception"; status: ReviewPillStatus } {
  const { row, intervalIndex, dueOn, today, latestReason, latestOutcome } = input;
  if (row.membership_status === "scheduled" && intervalIndex === 0 &&
      !row.word_last_review_completed_on && dueOn && dueOn > today) {
    return { bucket: "waiting", status: "neutral" };
  }
  if (row.membership_status === "next_day_recovery" || row.membership_status === "catch_up") {
    return { bucket: intervalIndex ?? "exception", status: "staying" };
  }
  if (row.membership_status !== "scheduled" || intervalIndex === null || intervalIndex < 0 || intervalIndex > 5) {
    return { bucket: "exception", status: "neutral" };
  }
  if (latestReason === "RECOVERY_FAILURE_REGRESSED_ONE_RUNG") {
    return { bucket: intervalIndex, status: "regressed" };
  }
  if (latestReason === "SCHEDULED_PASS_ADVANCED" || latestReason === "RECOVERY_PASS_ADVANCED" ||
      latestOutcome === "review_pass" || latestOutcome === "retest_pass") {
    return { bucket: intervalIndex, status: "advancing" };
  }
  return { bucket: intervalIndex, status: "neutral" };
}

export async function loadReviewCycle(childId: string, today: string) {
  const service = createServiceRoleClient();
  const scheduleResult = await service.from("adle_review_schedule_words")
    .select("id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,taught_on,word_interval_index,word_next_due_on,word_last_review_completed_on")
    .eq("child_id", childId).eq("row_status", "active");
  if (scheduleResult.error) throw scheduleResult.error;
  const rows = (scheduleResult.data ?? []) as ScheduleRow[];
  const buckets: ReviewBucket[] = [
    { key: "waiting", label: "Waiting", words: [] },
    ...[1, 3, 7, 14, 28, 56].map((day, index) => ({ key: String(index), label: `Day ${day}`, words: [] })),
  ];
  if (!rows.length) return { buckets, exceptionCount: 0 };
  const wordIds = [...new Set(rows.map((row) => row.canonical_word_id))];
  const bundleIds = [...new Set(rows.map((row) => row.bundle_id).filter((id): id is string => !!id))];
  const scheduleIds = rows.map((row) => row.id);
  const [wordResult, bundleResult, transitionResult, outcomeResult] = await Promise.all([
    service.from("canonical_teaching_dictionary_words").select("id,display_word,normalised_word").in("id", wordIds),
    bundleIds.length ? service.from("adle_review_bundles").select("id,interval_index,next_due_on").in("id", bundleIds) : Promise.resolve({ data: [], error: null }),
    service.from("adle_review_schedule_transition_events")
      .select("schedule_word_id,transition_reason,applied_state_revision")
      .in("schedule_word_id", scheduleIds).order("applied_state_revision", { ascending: false }),
    service.from("adle_review_outcome_events")
      .select("canonical_word_id,event_type,occurred_on,created_at")
      .eq("child_id", childId).in("canonical_word_id", wordIds)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [wordResult, bundleResult, transitionResult, outcomeResult]) {
    if (result.error) throw result.error;
  }
  const words = new Map((wordResult.data ?? []).map((row) => [row.id, row.display_word || row.normalised_word]));
  const bundles = new Map((bundleResult.data ?? []).map((row) => [row.id, row]));
  const reasons = new Map<string, string>();
  for (const row of transitionResult.data ?? []) {
    if (!reasons.has(row.schedule_word_id)) reasons.set(row.schedule_word_id, row.transition_reason);
  }
  const outcomes = new Map<string, string>();
  for (const row of outcomeResult.data ?? []) {
    if (!outcomes.has(row.canonical_word_id)) outcomes.set(row.canonical_word_id, row.event_type);
  }
  let exceptionCount = 0;
  for (const row of rows) {
    const bundle = row.bundle_id ? bundles.get(row.bundle_id) : null;
    const intervalIndex = row.word_interval_index ?? bundle?.interval_index ?? null;
    const dueOn = row.membership_status === "catch_up" ? row.next_retest_due_on : row.word_next_due_on ?? bundle?.next_due_on ?? null;
    const classification = classifyReviewWord({
      row, intervalIndex, dueOn, today,
      latestReason: reasons.get(row.id) ?? null,
      latestOutcome: outcomes.get(row.canonical_word_id) ?? null,
    });
    if (classification.bucket === "exception") {
      exceptionCount += 1;
      continue;
    }
    const bucket = classification.bucket === "waiting" ? buckets[0] : buckets[classification.bucket + 1];
    bucket.words.push({ id: row.canonical_word_id, word: words.get(row.canonical_word_id) ?? "Word unavailable", status: classification.status, dueOn });
  }
  for (const bucket of buckets) bucket.words.sort((a, b) => a.word.localeCompare(b.word));
  return { buckets, exceptionCount };
}
