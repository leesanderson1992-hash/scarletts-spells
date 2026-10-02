import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reconstructOccurrenceContext } from "./context-source";
import { extractWholeWriting, type SourceSnapshot } from "./source";

export type PassageReviewRow = {
  findingId: string; occurrenceId: string; observed: string; correction: string;
  suggestedCorrection: string; fieldPath: string; startUtf16: number; endUtf16: number;
  fieldHash: string; excerpt: string; dismissed: boolean; confirmed: boolean; sourceStatus: "ready" | "blocked";
  issueStatus: string | null; issueCorrection: string | null; issueSourceKind: string | null;
};
export type PassageReview = { status: "unavailable" | "pending" | "complete" | "failed";
  rows: PassageReviewRow[]; sourceFields: { path: string; text: string }[]; readError: boolean; canRetry: boolean };

export async function loadPassageContextReview(input: { client: SupabaseClient; submissionId: string;
  parentUserId: string; childId: string }): Promise<PassageReview> {
  const loaded = await input.client.from("writing_source_snapshots").select("*")
    .eq("submission_id", input.submissionId).eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId).maybeSingle();
  if (loaded.error) return { status: "failed", rows: [], sourceFields: [], readError: true, canRetry: false };
  if (!loaded.data) return { status: "unavailable", rows: [], sourceFields: [], readError: false, canRetry: false };
  const snapshot = loaded.data as SourceSnapshot;
  if (snapshot.source_purpose !== "REAL_LEARNER")
    return { status: "unavailable", rows: [], sourceFields: [], readError: false, canRetry: false };
  const sourceFields = extractWholeWriting(snapshot).fields
    .filter((field) => field.provenance === "learner_response")
    .map((field) => ({ path: field.key, text: field.rawText }));
  if (snapshot.envelope.contextAiShadowCapture !== true)
    return { status: "unavailable", rows: [], sourceFields, readError: false, canRetry: false };
  const [job, findings, control] = await Promise.all([
    input.client.from("writing_context_shadow_jobs").select("status,error_code,claimed_at")
      .eq("snapshot_id", snapshot.id).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(1).maybeSingle(),
    input.client.from("writing_context_passage_findings").select("id,attempt_id,occurrence_id,field_hash,start_utf16,end_utf16,observed_text,correction")
      .eq("snapshot_id", snapshot.id).eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId).order("start_utf16"),
    input.client.from("writing_context_advisory_control").select("enabled,ai_mode")
      .eq("singleton", true).maybeSingle(),
  ]);
  if (job.error || findings.error || control.error || !control.data)
    return { status: "failed", rows: [], sourceFields, readError: true, canRetry: false };
  const processingEnabled = control.data.enabled === false && control.data.ai_mode === "shadow";
  const leaseStale = typeof job.data?.claimed_at === "string" &&
    Date.parse(job.data.claimed_at) < Date.now() - 60000;
  const status = job.data?.status === "complete" ? "complete" as const
    : job.data?.status === "failed" || (!processingEnabled &&
      (job.data?.status !== "processing" || leaseStale))
      ? "failed" as const : "pending" as const;
  const canRetry = processingEnabled && status === "failed" && job.data?.error_code === "AI_PROVIDER_UNAVAILABLE";
  if (!findings.data?.length) return { status, rows: [], sourceFields, readError: false, canRetry };
  const ids = findings.data.map((f) => f.id);
  const occurrenceIds = findings.data.map((f) => f.occurrence_id);
  const [occurrences, events, issues] = await Promise.all([
    input.client.from("writing_occurrences").select("id,field_path,field_hash,start_utf16,end_utf16,observed_text")
      .in("id", occurrenceIds),
    input.client.from("writing_context_passage_review_events").select("finding_id,action,correction,created_at,id")
      .in("finding_id", ids).eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
    input.client.from("writing_issues").select("source_writing_occurrence_id,issue_status,approved_replacement,metadata")
      .eq("task_submission_id", input.submissionId).eq("parent_user_id", input.parentUserId)
      .in("source_writing_occurrence_id", occurrenceIds),
  ]);
  if (occurrences.error || events.error || issues.error) return { status: "failed", rows: [], sourceFields, readError: true, canRetry: false };
  const indexed = new Map((occurrences.data ?? []).map((o) => [o.id, o]));
  const latest = new Map<string, { action: string; correction: string | null }>();
  const edited = new Map<string, string>();
  for (const event of events.data ?? []) {
    latest.set(event.finding_id, event);
    if (event.action === "EDIT" && event.correction) edited.set(event.finding_id, event.correction);
  }
  const issue = new Map((issues.data ?? []).map((i) => [i.source_writing_occurrence_id, i]));
  const rows = findings.data.map((f): PassageReviewRow => {
    const occurrence = indexed.get(f.occurrence_id);
    const context = occurrence ? reconstructOccurrenceContext({ snapshot,
      fieldPath: occurrence.field_path, fieldHash: occurrence.field_hash,
      startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16,
      observedText: occurrence.observed_text }) : null;
    const ready = Boolean(occurrence && context?.status === "ready" &&
      occurrence.field_hash === f.field_hash && occurrence.start_utf16 === f.start_utf16 &&
      occurrence.end_utf16 === f.end_utf16 && occurrence.observed_text === f.observed_text);
    return { findingId: f.id, occurrenceId: f.occurrence_id, observed: f.observed_text,
      correction: edited.get(f.id) ?? f.correction, suggestedCorrection: f.correction,
      fieldPath: occurrence?.field_path ?? "", startUtf16: f.start_utf16, endUtf16: f.end_utf16,
      fieldHash: f.field_hash, excerpt: context?.status === "ready" ? context.excerpt : f.observed_text,
      dismissed: latest.get(f.id)?.action === "DISMISS",
      confirmed: edited.has(f.id) && latest.get(f.id)?.action !== "DISMISS",
      sourceStatus: ready ? "ready" : "blocked",
      issueStatus: issue.get(f.occurrence_id)?.issue_status ?? null,
      issueCorrection: issue.get(f.occurrence_id)?.approved_replacement ?? null,
      issueSourceKind: (issue.get(f.occurrence_id)?.metadata as Record<string, unknown> | null)?.source_kind as string ?? null };
  });
  return { status, rows, sourceFields, readError: false, canRetry };
}
