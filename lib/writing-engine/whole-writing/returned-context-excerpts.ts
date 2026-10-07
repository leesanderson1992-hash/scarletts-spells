import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readSnapshotField, reconstructOccurrenceContext } from "./context-source";
import { sentenceContext } from "./sentence-context";
import { object, type SourceSnapshot } from "./source";

/** Read only historical context for issues in this owner's task thread. */
export type ReturnedContextExcerpt = {
  before: string;
  focus: string;
  after: string;
  /** Verified source answer block, for placing feedback beside that answer. */
  answerBlockId: string | null;
};

function sourceAnswerBlockId(snapshot: SourceSnapshot, fieldPath: string): string | null {
  const envelope = snapshot.envelope;
  const blocks = object(object(envelope.taskContext).lessonSchema).blocks;
  const blockRows = Array.isArray(blocks) ? blocks.map(object) : [];
  const draft = object(envelope.draftPayload);
  const payloads = Array.isArray(envelope.structuredPayloads)
    ? envelope.structuredPayloads.map(object) : [];
  const embeddedAnswers = object(draft.__structured_lesson_response).answers;
  const savedResponses = payloads.filter((payload) =>
    payload.type === "structured_lesson_response" || payload.type === "structured_test_response");
  const savedAnswers = savedResponses.length === 1 ? object(savedResponses[0].value).answers : null;
  const primaryAnswers = Array.isArray(embeddedAnswers)
    ? embeddedAnswers : Array.isArray(savedAnswers) ? savedAnswers : [];
  const fieldText = readSnapshotField(snapshot, fieldPath);
  if (fieldText === null) return null;

  let blockId: unknown = null;
  const flatMatch = /^\/draftPayload\/([^/]+)$/.exec(fieldPath);
  const embeddedMatch = /^\/draftPayload\/__structured_lesson_response\/answers\/(\d+)\/value$/.exec(fieldPath);
  const durableMatch = /^\/structuredPayloads\/(\d+)\/value\/answers\/(\d+)\/value$/.exec(fieldPath);
  if (flatMatch) {
    const key = flatMatch[1].replace(/~1/g, "/").replace(/~0/g, "~");
    const mirroredAnswers = primaryAnswers.map(object).filter((answer) => answer.block_id === key);
    if (draft[key] === fieldText && mirroredAnswers.length === 1 &&
        mirroredAnswers[0].value === fieldText) blockId = key;
  } else if (embeddedMatch) {
    const answers = Array.isArray(embeddedAnswers) ? embeddedAnswers.map(object) : [];
    const answer = answers[Number(embeddedMatch[1])] ?? {};
    if (answer.value === fieldText &&
        answers.filter((row) => row.block_id === answer.block_id).length === 1) blockId = answer.block_id;
  } else if (durableMatch) {
    const payload = payloads[Number(durableMatch[1])];
    const rows = object(payload?.value).answers;
    const answers = Array.isArray(rows) ? rows.map(object) : [];
    const answer = answers[Number(durableMatch[2])] ?? {};
    if (answer.value === fieldText &&
        answers.filter((row) => row.block_id === answer.block_id).length === 1) blockId = answer.block_id;
  } else if (fieldPath === "/rawSubmissionText" &&
      object(envelope.captureMetadata).structuredResponseOrigin === "derived_from_flat") {
    const answers = primaryAnswers;
    if (answers.length === 1) {
      const answer = object(answers[0]);
      if (answer.value === fieldText) blockId = answer.block_id;
    }
  }

  if (typeof blockId !== "string" || !blockId) return null;
  const matches = blockRows.filter((block) => block.block_id === blockId &&
    (block.block_type === "question_text" || block.block_type === "question_textarea"));
  return matches.length === 1 ? blockId : null;
}

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
      const sentence = sentenceContext(context.fieldText,
        occurrence.start_utf16, occurrence.end_utf16);
      if (!sentence) continue;
      excerpts[issue.id] = {
        before: context.fieldText.slice(sentence.startUtf16, occurrence.start_utf16),
        focus: context.fieldText.slice(occurrence.start_utf16, occurrence.end_utf16),
        after: context.fieldText.slice(occurrence.end_utf16, sentence.endUtf16),
        answerBlockId: sourceAnswerBlockId(snapshot as SourceSnapshot, occurrence.field_path),
      };
    }
  }
  return excerpts;
}
