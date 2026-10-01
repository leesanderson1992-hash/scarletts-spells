import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { loadPassageContextReview } from "../lib/writing-engine/whole-writing/context-passage-review";

const text = "We walked threw the gate.";
const fieldHash = fingerprint(text);
const finding = { id: "finding", occurrence_id: "occurrence", field_hash: fieldHash,
  start_utf16: 10, end_utf16: 15, observed_text: "threw", correction: "through" };
type Event = { finding_id: string; action: string; correction: string | null };
async function load(events: Event[], options: { proof?: boolean; corrupt?: boolean; issueStatus?: string } = {}) {
  const reads: string[] = [];
  const tables: Record<string, unknown> = {
    writing_source_snapshots: { id: "snapshot", submission_id: "submission", child_id: "writer",
      parent_user_id: "owner", source_revision: "1", occurred_at: "2026-09-30T00:00:00Z",
      source_purpose: options.proof ? "DISPOSABLE_PROVIDER_PROOF" : "REAL_LEARNER",
      envelope: { rawSubmissionText: text, contextAiShadowCapture: true, contextAiModeAtCapture: "shadow" } },
    writing_context_shadow_jobs: { status: "complete" },
    writing_context_advisory_control: { enabled: false, ai_mode: "disabled" },
    writing_context_passage_findings: [finding],
    writing_occurrences: [{ id: "occurrence", field_path: "/rawSubmissionText", field_hash: fieldHash,
      start_utf16: options.corrupt ? 11 : 10, end_utf16: 15, observed_text: "threw" }],
    writing_context_passage_review_events: events,
    writing_issues: options.issueStatus ? [{ source_writing_occurrence_id: "occurrence",
      issue_status: options.issueStatus, approved_replacement: "through",
      metadata: { source_kind: "contextual_advisory_v4" } }] : [],
  };
  const client = { from(table: string) {
    reads.push(table);
    const result = Promise.resolve({ data: tables[table], error: null });
    const query = { select: () => query, eq: () => query, in: () => query,
      order: () => query, limit: () => query, maybeSingle: () => result,
      then: result.then.bind(result) };
    return query;
  } } as unknown as SupabaseClient;
  const review = await loadPassageContextReview({ client, submissionId: "submission",
    parentUserId: "owner", childId: "writer" });
  assert(reads.every(t => Object.hasOwn(tables, t)), "Read model uses only existing tables");
  return review;
}
async function main() {
  const reviewTable = readFileSync(new URL("../app/courses/review/unified-spelling-review-table.tsx", import.meta.url), "utf8");
  assert.match(reviewTable,
    /readOnly=\{reviewWorkflowPhase === "read_only" \|\| reviewWorkflowPhase === "adle_observational"\}/,
    "Reviewer flow keeps fresh passage suggestions actionable before approval");
  const edit = { finding_id: "finding", action: "EDIT", correction: "through" };
  assert.equal((await load([])).rows[0].confirmed, false, "Unreviewed model output is only Suggested");
  const saved = (await load([edit])).rows[0];
  assert.equal(saved.confirmed, true, "Save confirms even an unchanged suggested correction");
  assert.equal(saved.correction, "through");
  assert.equal(saved.issueStatus, null, "Confirmation alone does not create an educational issue");
  assert.equal((await load([edit])).rows[0].confirmed, true, "Confirmation survives a fresh loader/reload");
  assert.equal((await load([edit, { ...edit, correction: "throughout" }])).rows[0].correction, "throughout");
  const dismissed = (await load([edit, { ...edit, action: "DISMISS", correction: null }])).rows[0];
  assert.equal(dismissed.dismissed, true); assert.equal(dismissed.confirmed, false);
  assert.equal((await load([{ ...edit, action: "RESTORE", correction: null }])).rows[0].confirmed, false,
    "Restoring an unconfirmed suggestion does not invent confirmation");
  assert.equal((await load([edit, { ...edit, action: "DISMISS", correction: null },
    { ...edit, action: "RESTORE", correction: null }])).rows[0].confirmed, true);
  assert.equal((await load([edit], { corrupt: true })).rows[0].sourceStatus, "blocked");
  assert.equal((await load([edit], { issueStatus: "sent_back_to_child" })).rows[0].issueStatus, "sent_back_to_child");
  assert.equal((await load([edit], { proof: true })).rows.length, 0, "Disposable proof remains excluded");
  console.log("PASS: persisted Save confirmation, reload, edits, dismiss/restore, exact source and proof isolation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
