import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { reconstructOccurrenceContext } from "./context-source";
import type { SourceSnapshot } from "./source";

/** Read only historical context for issues in this owner's task thread. */
export type ReturnedContextExcerpt = { before: string; focus: string; after: string };

export async function loadReturnedContextExcerpts(input: {
  client: SupabaseClient;
  issueIds: string[];
  parentUserId: string;
  childId: string;
  taskId: string;
}): Promise<Record<string, ReturnedContextExcerpt>> {
  const issueIds = [...new Set(input.issueIds)];
  if (issueIds.length === 0) return {};

  const issuesResult = await input.client.from("writing_issues")
    .select("id,task_submission_id,parent_user_id,child_id,source_writing_occurrence_id,observed_text,metadata")
    .in("id", issueIds).eq("parent_user_id", input.parentUserId).eq("child_id", input.childId);
  if (issuesResult.error || !issuesResult.data?.length) return {};

  const issues = issuesResult.data.filter((issue) =>
    issueIds.includes(issue.id) && issue.parent_user_id === input.parentUserId &&
    issue.child_id === input.childId &&
    issue.metadata?.source_kind === "contextual_advisory_v4" &&
    typeof issue.source_writing_occurrence_id === "string" &&
    typeof issue.task_submission_id === "string" &&
    typeof issue.observed_text === "string");
  if (issues.length === 0) return {};

  const occurrenceResult = await input.client.from("writing_occurrences")
    .select("id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance")
    .in("id", [...new Set(issues.map((issue) => issue.source_writing_occurrence_id))]);
  if (occurrenceResult.error || !occurrenceResult.data?.length) return {};
  const occurrences = new Map(occurrenceResult.data.map((occurrence) => [occurrence.id, occurrence]));

  const snapshotResult = await input.client.from("writing_source_snapshots")
    .select("id,submission_id,task_id,parent_user_id,child_id,source_revision,occurred_at,envelope")
    .in("id", [...new Set(occurrenceResult.data.map((occurrence) => occurrence.snapshot_id))])
    .eq("parent_user_id", input.parentUserId).eq("child_id", input.childId)
    .eq("task_id", input.taskId);
  if (snapshotResult.error || !snapshotResult.data?.length) return {};
  const snapshots = new Map(snapshotResult.data.map((snapshot) => [snapshot.id, snapshot]));

  const excerpts: Record<string, ReturnedContextExcerpt> = {};
  for (const issue of issues) {
    const occurrence = occurrences.get(issue.source_writing_occurrence_id);
    const snapshot = occurrence && snapshots.get(occurrence.snapshot_id);
    if (!occurrence || !snapshot || occurrence.provenance !== "learner_response" ||
        occurrence.observed_text !== issue.observed_text ||
        snapshot.submission_id !== issue.task_submission_id ||
        snapshot.task_id !== input.taskId ||
        snapshot.parent_user_id !== input.parentUserId || snapshot.child_id !== input.childId) continue;

    const context = reconstructOccurrenceContext({
      snapshot: snapshot as SourceSnapshot,
      fieldPath: occurrence.field_path,
      fieldHash: occurrence.field_hash,
      startUtf16: occurrence.start_utf16,
      endUtf16: occurrence.end_utf16,
      observedText: occurrence.observed_text,
    });
    if (context.status === "ready") {
      let excerptStart = context.excerptStartUtf16;
      let excerptEnd = context.excerptEndUtf16;
      while (excerptStart > 0 &&
        occurrence.start_utf16 - excerptStart < 100 &&
        !/\s/u.test(context.fieldText[excerptStart - 1])) excerptStart--;
      while (excerptEnd < context.fieldText.length &&
        excerptEnd - occurrence.end_utf16 < 100 &&
        !/\s/u.test(context.fieldText[excerptEnd])) excerptEnd++;
      excerpts[issue.id] = {
        before: `${excerptStart > 0 ? "…" : ""}${context.fieldText.slice(excerptStart, occurrence.start_utf16)}`,
        focus: context.fieldText.slice(occurrence.start_utf16, occurrence.end_utf16),
        after: `${context.fieldText.slice(occurrence.end_utf16, excerptEnd)}${excerptEnd < context.fieldText.length ? "…" : ""}`,
      };
    }
  }
  return excerpts;
}
