import assert from "node:assert/strict";
import { extractWholeWriting, type SourceSnapshot } from "../lib/writing-engine/whole-writing/source";
import { buildIdentityIndex } from "../lib/writing-engine/whole-writing/identity";
import { buildRawLessonSourceDraft } from "../lib/lessons/source-capture";

const snapshot: SourceSnapshot = {
  id: "snapshot", submission_id: "submission", source_revision: "1", child_id: "child", parent_user_id: "parent", occurred_at: "2026-09-06T10:00:00Z",
  envelope: { draftPayload: {}, taskContext: { lessonSchema: { blocks: [] } } },
};
const blocks = [
  { block_id: "text", block_type: "question_textarea" },
  { block_id: "other", block_type: "question_text" },
  { block_id: "table", block_type: "question_table", columns: [{ column_id: "word", input_type: "text" }, { column_id: "option", input_type: "select" }] },
  { block_id: "interview", block_type: "question_repeatable_interview", questions: [{ question_id: "answer" }, { question_id: "copy", exclude_from_spelling: true }] },
  { block_id: "choice", block_type: "question_choice_single" },
  { block_id: "prompt", block_type: "rich_text" },
  { block_id: "future", block_type: "future_writing_block" },
];
const raw = "  🐕 I am I. They’re well-known. Cafe\u0301.  \n";
const rawDraft = buildRawLessonSourceDraft({answerMap:{text:raw,table:[{word:"  cat  "}]},taskId:"task",childId:"child"});
assert.equal(rawDraft.__structured_lesson_response.answers[0].value,raw);
const rawExtracted=extractWholeWriting({...snapshot,envelope:{draftPayload:rawDraft,taskContext:{lessonSchema:{blocks}}}});
assert.equal(rawExtracted.occurrences[0].start,5);
assert.equal(rawExtracted.fields[0].rawText,raw);
assert.equal(rawExtracted.occurrences.find(o=>o.observedText==="cat")?.start,2);
const table = [{ word: "cat", option: "supplied" }, { word: "cat", option: "supplied" }];
const draft = { text: raw, other: raw, table: JSON.stringify(table), interview: [{ answer: "hello", copy: "copied" }], choice: "option", prompt: "prompted", future: "retain", __structured_lesson_response: { answers: [{ block_id: "text", value: raw }, { block_id: "table", value: table }] } };
const source = { ...snapshot, envelope: { draftPayload: draft, taskContext: { lessonSchema: { blocks } } } };
const result = extractWholeWriting(source);
assert.equal(result.occurrences.filter((o) => o.observedText === "I").length, 4);
assert.equal(result.occurrences.filter((o) => o.observedText === "cat").length, 2);
assert.equal(result.occurrences.filter((o) => o.observedText === "hello").length, 1);
assert.equal(result.occurrences.find((o) => o.observedText === "retain")?.provenance, "unknown");
assert.ok(!result.occurrences.some((o) => ["copied", "prompted", "option", "supplied", "word"].includes(o.observedText)));
assert.equal(result.fields.find((f) => f.key === "/draftPayload/text")?.aliases.length, 1);
assert.equal(result.occurrences[0].start, 5);
assert.equal(new Set(result.occurrences.map((o) => o.id)).size, result.occurrences.length);
for (const occurrence of result.occurrences) {
  assert.equal(result.fields.find((f) => f.key === occurrence.fieldKey)!.rawText.slice(occurrence.start, occurrence.end), occurrence.observedText);
}
assert.deepEqual(extractWholeWriting(source), result);
assert.ok(result.occurrences.some((o) => o.observedText === "Cafe\u0301"));
assert.ok(result.occurrences.some((o) => o.observedText === "They’re"));
assert.ok(result.occurrences.some((o) => o.observedText === "well-known"));
const conflict = extractWholeWriting({ ...source, envelope: { ...source.envelope, draftPayload: { text: "different", __structured_lesson_response: { answers: [{ block_id: "text", value: "original" }] } } } });
assert.equal(conflict.occurrences.length, 2);
assert.ok(conflict.occurrences.every((o) => o.provenance === "unknown"));
const saved = extractWholeWriting({ ...source, envelope: { taskContext: source.envelope.taskContext, structuredPayloads: [{ type: "structured_test_response", value: { answers: [{ block_id: "other", value: "a" }] } }] } });
assert.equal(saved.occurrences.length, 1);
assert.equal(saved.occurrences[0].provenance, "learner_response");
assert.ok(saved.occurrences[0].fieldKey.startsWith("/structuredPayloads/0/value/"));
const untrimmed = extractWholeWriting({ ...source, envelope: { taskContext: source.envelope.taskContext, rawSubmissionText:"  a  ",captureMetadata:{structuredResponseOrigin:"derived_from_flat"},structuredPayloads:[{type:"structured_lesson_response",value:{answers:[{block_id:"other",value:"a"}]}}] } });
assert.equal(untrimmed.occurrences[0].fieldKey,"/rawSubmissionText");
assert.equal(untrimmed.occurrences[0].start,2,"generated fallback must anchor the original untrimmed input");
const unknown = extractWholeWriting({ ...snapshot, envelope: { draftPayload: { nested: [{ unknown: "keep me" }] } } });
assert.equal(unknown.occurrences.length, 2);
assert.ok(unknown.occurrences.every((o) => o.provenance === "unknown"));
const words = [
  { id: "cat", normalised_word: "cat", dialect: "en-GB", row_status: "active" },
  { id: "cafe", normalised_word: "café", dialect: "en-GB", row_status: "active" },
  { id: "they", normalised_word: "they're", dialect: "en-GB", row_status: "active" },
  { id: "old", normalised_word: "old", dialect: "en-GB", row_status: "inactive" },
];
const index = buildIdentityIndex(words);
assert.equal(index.resolve("CAT", "en-GB").canonicalWordId, "cat");
assert.equal(index.resolve("Cafe\u0301", "en-GB").canonicalWordId, "cafe");
assert.equal(index.resolve("They’re", "en-GB").canonicalWordId, "they");
assert.equal(index.resolve("cats", "en-GB").status, "unmapped");
assert.equal(index.resolve("cat", "en-US").status, "unmapped");
assert.equal(index.resolve("old", "en-GB").status, "inactive");
assert.equal(index.resolve("cat", "en-GB").correctness, "NOT_ASSESSED");
const changed = buildIdentityIndex([...words, { ...words[0], id: "duplicate" }]);
assert.equal(changed.resolve("cat", "en-GB").status, "ambiguous");
assert.notEqual(changed.releaseFingerprint, index.releaseFingerprint);
assert.deepEqual(extractWholeWriting(source).occurrences, result.occurrences, "identity releases cannot alter anchors");
console.log("Whole-writing source/identity regression passed: complete word inventory, structured lineage, Unicode, uncertainty and release replay.");
