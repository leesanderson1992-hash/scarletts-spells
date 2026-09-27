import assert from "node:assert/strict";

import { getFreeWritingEvidenceCandidatesForReview } from "../lib/rewards/free-writing-evidence";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { reconstructOccurrenceContext } from "../lib/writing-engine/whole-writing/context-source";

const writing = "😀 peace";
const snapshot = { envelope: { rawSubmissionText: writing } } as never;
assert.equal(reconstructOccurrenceContext({ snapshot, fieldPath: "/rawSubmissionText",
  fieldHash: fingerprint(writing), startUtf16: 3, endUtf16: 8,
  observedText: "peace" }).status, "ready");
assert.equal(reconstructOccurrenceContext({ snapshot, fieldPath: "/rawSubmissionText",
  fieldHash: "wrong", startUtf16: 3, endUtf16: 8,
  observedText: "peace" }).status, "blocked");
assert.equal(reconstructOccurrenceContext({ snapshot, fieldPath: "/rawSubmissionText",
  fieldHash: fingerprint(writing), startUtf16: 1, endUtf16: 2,
  observedText: writing.slice(1, 2) }).status, "blocked");

const tableCalls: string[] = [];
const resultByTable: Record<string, unknown> = {
  child_word_treasure_evidence_candidates: [
    { id: "wrong-word", task_submission_id: "submission", matched_word_normalized: "peace",
      confirmation_status: "pending_parent_confirmation", duplicate_status: "unique_candidate" },
    { id: "intended-word", task_submission_id: "submission", matched_word_normalized: "piece",
      confirmation_status: "pending_parent_confirmation", duplicate_status: "unique_candidate" },
    { id: "unrelated", task_submission_id: "submission", matched_word_normalized: "banana",
      confirmation_status: "pending_parent_confirmation", duplicate_status: "unique_candidate" },
  ],
  writing_source_snapshots: { id: "snapshot" },
  writing_context_parent_added_cases: [
    { occurrence_id: "occurrence", intended_member: "piece" },
  ],
  writing_occurrences: [{ observed_text: "peace" }],
};
const client = {
  from(table: string) {
    tableCalls.push(table);
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      order() { return Promise.resolve({ data: resultByTable[table], error: null }); },
      maybeSingle() { return Promise.resolve({ data: resultByTable[table], error: null }); },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: resultByTable[table], error: null }).then(resolve);
      },
    };
    return query;
  },
};

async function main() {
  const candidates = await getFreeWritingEvidenceCandidatesForReview({
    supabase: client as never, parentUserId: "parent", childId: "child",
    taskSubmissionId: "submission",
  });
  assert.deepEqual(candidates.map((item) => [item.id, item.canConfirm]), [
    ["wrong-word", false], ["intended-word", false], ["unrelated", true],
  ]);
  assert(tableCalls.includes("writing_context_parent_added_cases"));
  console.log("context feedback Gold exclusion regression passed");
}
void main();
