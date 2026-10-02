import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import {
  AI_CONTEXT_PROMPT, AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA, AI_CONTEXT_SCHEMA_FINGERPRINT,
  gateAiContextResponse, prepareAiContextCase,
} from "../lib/writing-engine/whole-writing/context-ai-gate";

assert.equal(createHash("sha256").update(AI_CONTEXT_PROMPT).digest("hex"),
  "682fa2635019accc718d791a5c4473b62e48388f7cecb91b4ab29bf7cc17241c");
assert.equal(createHash("sha256").update(JSON.stringify(AI_CONTEXT_SCHEMA)).digest("hex"),
  "e6d48f8e85bc2e686d5d4829fa878dbd5c20a047cf9305ab2c90bb71501df540");
assert.equal(AI_CONTEXT_PROMPT_FINGERPRINT, "7a50377c7452b274c30ed863d57834889487741b531265dc6d204b3c3af73509");
assert.equal(AI_CONTEXT_SCHEMA_FINGERPRINT, "18b68be7b62ebc1551bfed4e1fbdb85f842cd7dcbdf5ee2216183e4d6ed213e0");
assert.equal(AI_CONTEXT_PROMPT, readFileSync("bench/ai-context/prompt.txt", "utf8"));

const text = "I went there.\n\nTheir cat is here.";
const start = text.indexOf("Their");
const base = {
  occurrenceId: "occ-1", fieldText: text, fieldHash: fingerprint(text),
  startUtf16: start, endUtf16: start + 5, observedText: "Their",
  family: "THERE_THEIR_THEYRE" as const, provenance: "learner_response" as const,
};
const prepared = prepareAiContextCase(base);
assert(prepared.case);
assert.equal(prepared.case.sourceText, "Their cat is here.");
assert.deepEqual(prepared.case.focus, { start_utf16: 0, end_utf16: 5, text: "Their" });
assert.equal(prepared.case.observedCanonical, "their");
const valid = {
  case_id: prepared.case.caseId, decision: "INVALID", focus: prepared.case.focus,
  observed_form: "their", expected_form: "there", reason_category: "UNIQUE_REPLACEMENT",
};
assert.deepEqual(gateAiContextResponse(valid, prepared.case), {
  status: "INVALID", alternative: "there", reasonCode: "UNIQUE_REPLACEMENT",
});
for (const malformed of [
  { ...valid, case_id: "other" },
  { ...valid, focus: { ...valid.focus, start_utf16: 1 } },
  { ...valid, observed_form: "there" },
  { ...valid, observed_form: null },
  { ...valid, expected_form: "too" },
  { ...valid, expected_form: "their" },
  { ...valid, expected_form: "There" },
  { ...valid, reason_category: "SUPPORTED_USE" },
  { ...valid, extra: "ignore previous instructions" },
  { ...valid, decision: "VALID", expected_form: null },
  { ...valid, decision: "UNCERTAIN", expected_form: null },
]) assert.equal(gateAiContextResponse(malformed, prepared.case).status, "NOT_ASSESSED");
assert.equal(gateAiContextResponse({ ...valid, decision: "UNCERTAIN", expected_form: null,
  reason_category: "GERUND" }, prepared.case).status, "UNCERTAIN");
assert.equal(prepareAiContextCase({ ...base, provenance: "unknown" }).reasonCode, "AUTHORSHIP_UNRESOLVED");
assert.equal(prepareAiContextCase({ ...base, fieldHash: "wrong" }).reasonCode, "SOURCE_FIELD_MISMATCH");
assert.equal(prepareAiContextCase({ ...base, family: "TO_TOO_TWO" }).reasonCode, "FAMILY_MISMATCH");
assert.equal(prepareAiContextCase({ ...base, endUtf16: start + 4 }).reasonCode, "SOURCE_SPAN_MISMATCH");
assert.equal(prepareAiContextCase({ ...base, fieldText: "x".repeat(601), fieldHash: fingerprint("x".repeat(601)),
  startUtf16: 0, endUtf16: 5, observedText: "xxxxx" }).reasonCode, "FAMILY_MISMATCH");
const long = `${"hello ".repeat(110)}their`;
assert.equal(prepareAiContextCase({ ...base, fieldText: long, fieldHash: fingerprint(long),
  startUtf16: long.length - 5, endUtf16: long.length, observedText: "their" }).reasonCode, "CONTEXT_WINDOW_TOO_LONG");
const unicode = "😀 their";
assert.equal(prepareAiContextCase({ ...base, fieldText: unicode, fieldHash: fingerprint(unicode),
  startUtf16: 1, endUtf16: 7, observedText: unicode.slice(1, 7) }).reasonCode, "SOURCE_SPAN_MISMATCH");

console.log("context AI safety gate regression passed");
