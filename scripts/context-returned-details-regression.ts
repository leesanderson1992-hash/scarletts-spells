import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { loadReturnedContextExcerpts } from "../lib/writing-engine/whole-writing/returned-context-excerpts";

const writing = "Their coats were dry, but their bags were wet. The owner checked their bags twice.";
const target = writing.indexOf("their bags");
const issue = {
  id: "issue", task_submission_id: "original", parent_user_id: "owner", child_id: "writer",
  source_writing_occurrence_id: "occurrence", observed_text: "their",
  metadata: { source_kind: "contextual_advisory_v4" },
};
const occurrence = {
  id: "occurrence", snapshot_id: "snapshot", field_path: "/rawSubmissionText",
  field_hash: fingerprint(writing), start_utf16: target, end_utf16: target + 5,
  observed_text: "their", provenance: "learner_response",
};
const snapshot = {
  id: "snapshot", submission_id: "original", task_id: "task", parent_user_id: "owner",
  child_id: "writer", source_revision: "1", occurred_at: "2026-09-30T00:00:00Z",
  envelope: { rawSubmissionText: writing },
};

function client(tables: Record<string, Array<Record<string, unknown>>>) {
  return { from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column])); return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value); return query;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: (tables[table] ?? []).filter((row) => filters.every((test) => test(row))), error: null })),
    };
    return query;
  } } as unknown as SupabaseClient;
}

async function load(overrides: {
  issue?: Partial<typeof issue>;
  occurrence?: Partial<typeof occurrence>;
  snapshot?: Partial<typeof snapshot>;
  issueIds?: string[];
} = {}) {
  return loadReturnedContextExcerpts({
    client: client({ writing_issues: [{ ...issue, ...overrides.issue }],
      writing_occurrences: [{ ...occurrence, ...overrides.occurrence }],
      writing_source_snapshots: [{ ...snapshot, ...overrides.snapshot }] }),
    issueIds: overrides.issueIds ?? [issue.id], parentUserId: "owner", childId: "writer", taskId: "task",
  });
}

async function main() {
  const result = await load();
  assert.equal(result.issue.focus, "their", "The exact second occurrence is selected");
  assert.equal(result.issue.before + result.issue.focus + result.issue.after, writing,
    "The excerpt reconstructs the immutable source for this short fixture");
  assert.match(result.issue.before, /^Their coats were dry, but $/);
  const longWriting = `${"Earlier ".repeat(30)}their bags were wet.${" Later".repeat(30)}`;
  const longStart = longWriting.indexOf("their bags");
  const longResult = await load({
    occurrence: { field_hash: fingerprint(longWriting), start_utf16: longStart,
      end_utf16: longStart + 5 },
    snapshot: { envelope: { rawSubmissionText: longWriting } },
  });
  assert.match(longResult.issue.before, /^…Earlier /, "A long excerpt starts at a word boundary");
  assert.match(longResult.issue.after, /Later…$/, "A long excerpt ends after a complete word");
  assert.deepEqual(await load({ issueIds: ["other"] }), {}, "Unrequested issues remain hidden");
  assert.deepEqual(await load({ issue: { parent_user_id: "other" } }), {}, "Wrong owner is denied");
  assert.deepEqual(await load({ snapshot: { task_id: "other" } }), {}, "Wrong task is denied");
  assert.deepEqual(await load({ snapshot: { submission_id: "other" } }), {}, "Wrong source submission is denied");
  assert.deepEqual(await load({ occurrence: { field_hash: "wrong" } }), {}, "Hash mismatch is denied");
  assert.deepEqual(await load({ occurrence: { start_utf16: target + 1 } }), {}, "Span mismatch is denied");
  assert.deepEqual(await load({ occurrence: { provenance: "unknown" } }), {}, "Unknown authorship is denied");
  assert.deepEqual(await load({ issue: { metadata: { source_kind: "ordinary" } } }), {},
    "Only contextual returned issues receive excerpts");
  console.log("Returned context Details regression passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
