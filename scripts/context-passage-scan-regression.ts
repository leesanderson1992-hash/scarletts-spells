import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gatePassageFindings, indexedPassageWords, passageContextSchema, passageRequestBody, planPassageWindows } from
  "../lib/writing-engine/whole-writing/context-passage-scan";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = "🦊 A fox went threw the gate, then threw the ball.";
const fieldHash = hash(JSON.stringify(text));
const windows = planPassageWindows({ fields: [{ path: "/rawSubmissionText", hash: fieldHash, text }] });
assert(windows && windows.length === 1);
const window = windows[0];
const occurrences = [...text.matchAll(/[\p{L}][\p{L}'’ʼ-]*/gu)].map((match, i) => ({
  id: `occurrence-${i}`, fieldKey: window.fieldPath, textHash: fieldHash,
  start: match.index!, end: match.index! + match[0].length, observedText: match[0], provenance: "learner_response",
}));
const words = indexedPassageWords(window, occurrences.slice().reverse());
const index = words.findIndex(o => o.observedText === "threw");
const finding = { word_index: index, observed: "threw", correction: "through" };
const gate = (findings: unknown[]) => gatePassageFindings({ case_id: window.caseId, findings }, window, occurrences);
assert.deepEqual(gate([finding]).findings?.map(f => [f.occurrenceId, f.startUtf16, f.endUtf16, f.correction]),
  [[words[index].id, text.indexOf("threw"), text.indexOf("threw") + 5, "through"]]);
assert.equal(words[index].start, 14, "Surrogate pair remains two UTF-16 units");
assert.equal(gate([{ ...finding, word_index: index + 1 }]).findings, null, "Wrong word index fails");
assert.equal(gate([{ ...finding, word_index: -1 }]).findings, null);
assert.equal(gate([{ ...finding, word_index: 99999 }]).findings, null);
assert.equal(gate([{ ...finding, word_index: 1.5 }]).findings, null);
assert.equal(gate([{ ...finding, observed: "Threw" }]).findings, null, "Exact case required");
assert.equal(gate([{ ...finding, correction: "through the" }]).findings, null);
assert.equal(gate([{ ...finding, correction: "threw" }]).findings, null);
assert.equal(gate([finding, finding]).findings, null, "One occurrence cannot be repeated");
assert.equal(gate([{ start_utf16: 13, end_utf16: 18, observed: "threw", correction: "through" }]).findings, null,
  "Former model-counted offsets cannot bypass indexed contract");
const lastIndex = words.findLastIndex(o => o.observedText === "threw");
assert.equal(gate([{ ...finding, word_index: lastIndex }]).findings?.[0].startUtf16, text.lastIndexOf("threw"),
  "Repeated words map to the selected instance without searching or fuzzy reanchoring");
const corrupt = occurrences.map(o => o.id === words[index].id ? { ...o, start: o.start + 1 } : o);
assert.throws(() => passageRequestBody(window, corrupt), /OCCURRENCE_MISMATCH/);
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [finding] }, window, corrupt).reason, "AI_PASSAGE_SOURCE");
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [finding] },
  { ...window, text: text + "changed" }, occurrences).reason, "AI_PASSAGE_SOURCE");
assert.equal(gatePassageFindings({ case_id: "wrong", findings: [finding] }, window, occurrences).findings, null);
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [finding] }, window,
  occurrences.map(o => ({ ...o, provenance: "unknown" }))).findings, null);
assert.equal(gatePassageFindings({ case_id: window.caseId, findings: [finding] }, window,
  occurrences.map(o => ({ ...o, textHash: "other" }))).findings, null);
// A later window must retain global immutable coordinates, not window-relative offsets.
const longText = "x ".repeat(3000) + text;
const later = planPassageWindows({ fields: [{ path: window.fieldPath, hash: hash(JSON.stringify(longText)), text: longText }] });
assert(later?.length === 3);
assert.equal(later.map(w => w.text).join(""), longText, "Every character is covered exactly once");
const laterWords = [...longText.matchAll(/[\p{L}][\p{L}'’ʼ-]*/gu)].map((m, i) => ({ id: `later-${i}`,
  fieldKey: window.fieldPath, textHash: later[2].fieldHash, start: m.index!, end: m.index! + m[0].length,
  observedText: m[0], provenance: "learner_response" }));
const laterIndex = indexedPassageWords(later[2], laterWords).findIndex(o => o.observedText === "threw");
assert.equal(gatePassageFindings({ case_id: later[2].caseId, findings: [{ ...finding, word_index: laterIndex }] },
  later[2], laterWords).findings?.[0].startUtf16, longText.indexOf("threw"));
assert.equal(planPassageWindows({ fields: [{ path: window.fieldPath, hash: "0".repeat(64), text }] }), null);
assert.equal(planPassageWindows({ fields: [{ path: window.fieldPath, hash: hash(JSON.stringify("x ".repeat(5000))),
  text: "x ".repeat(5000) }] }), null, "Four-window work fails closed without a partial scan");
const body = JSON.parse(passageRequestBody(window, occurrences));
assert.equal(body.store, false); assert.equal(body.service_tier, "default");
assert.deepEqual(body.text.format.schema.properties.case_id.enum, [window.caseId],
  "Provider schema binds the response to the exact window case");
assert.throws(() => passageContextSchema("invalid"), /CASE_ID_INVALID/);
assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
const request = JSON.parse(body.input[1].content);
assert.deepEqual(Object.keys(request).sort(), ["case_id", "dialect", "indexed_words", "source_text"]);
assert.deepEqual(request.indexed_words, words.map((o, i) => [i, o.observedText]));
assert(!JSON.stringify(body).includes("occurrence-"), "Database identities do not leave the server");
assert(!JSON.stringify(body).includes("parent_user_id")); assert(!JSON.stringify(body).includes("child_id"));
console.log("PASS: indexed passage references, repeated words, Unicode/global spans, source integrity, rejection and payload minimisation");
