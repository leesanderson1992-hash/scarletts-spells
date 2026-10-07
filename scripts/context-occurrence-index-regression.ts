import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { indexSnapshotOccurrences } from "../lib/writing-engine/whole-writing/occurrence-index";
import { sentenceContext } from "../lib/writing-engine/whole-writing/sentence-context";
import type { SourceSnapshot } from "../lib/writing-engine/whole-writing/source";

async function main() {
const writing = "😀 Their bag is here. Their book is there!";
const snapshot: SourceSnapshot = {
  id: randomUUID(), submission_id: randomUUID(), parent_user_id: randomUUID(),
  child_id: randomUUID(), source_revision: "1", occurred_at: new Date().toISOString(),
  source_purpose: "REAL_LEARNER",
  envelope: { contextAiModeAtCapture: "disabled", contextAiShadowCapture: false,
    draftPayload: { answer: writing },
    taskContext: { lessonSchema: { blocks: [{ block_id: "answer", block_type: "question_textarea" }] } } },
};
type Row = Record<string, unknown> & { id: string };
const rows = new Map<string, Row>();
let writes = 0;
const client = {
  from(table: string) {
    assert.equal(table, "writing_occurrences");
    return {
      async upsert(batch: Row[]) {
        writes += 1;
        for (const row of batch) if (!rows.has(row.id)) rows.set(row.id, row);
        return { error: null };
      },
      select() {
        return { async in(_key: string, ids: string[]) {
          return { data: ids.map((id) => rows.get(id)).filter(Boolean), error: null };
        } };
      },
    };
  },
} as unknown as SupabaseClient;

const first = await indexSnapshotOccurrences(client, snapshot);
assert.equal(first.reason, null);
assert(first.learnerResponses > 0);
const count = rows.size;
const repeated = [...rows.values()].filter((row) => row.observed_text === "Their");
assert.equal(repeated.length, 2);
assert.notEqual(repeated[0].start_utf16, repeated[1].start_utf16);
const second = await indexSnapshotOccurrences(client, snapshot);
assert.equal(second.indexed, first.indexed);
assert.equal(rows.size, count);
assert.equal(writes, 2);

const firstSentence = sentenceContext(writing, writing.indexOf("Their"), writing.indexOf("Their") + 5);
const secondStart = writing.lastIndexOf("Their");
const secondSentence = sentenceContext(writing, secondStart, secondStart + 5);
assert.equal(firstSentence?.text, "😀 Their bag is here.");
assert.equal(secondSentence?.text, "Their book is there!");

rows.set(repeated[0].id, { ...repeated[0], field_hash: "wrong" });
await assert.rejects(indexSnapshotOccurrences(client, snapshot), /WRITING_OCCURRENCE_IDENTITY_MISMATCH/);
console.log("Context occurrence indexing works with AI disabled, repeated words, and collision rejection.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
