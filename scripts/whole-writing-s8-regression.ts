import assert from "node:assert/strict";

import { extractOccurrences, fingerprint } from "../lib/writing-engine/baseline/source";
import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  contextFamilyForMember,
} from "../lib/writing-engine/whole-writing/context";
import { reconstructOccurrenceContext } from "../lib/writing-engine/whole-writing/context-source";
import type { SourceSnapshot } from "../lib/writing-engine/whole-writing/source";

function analyse(text: string, surface: string, occurrenceNumber = 1) {
  let start = -1;
  let cursor = 0;
  for (let index = 0; index < occurrenceNumber; index += 1) {
    start = text.indexOf(surface, cursor);
    assert.notEqual(start, -1, `missing ${surface} occurrence ${occurrenceNumber}`);
    cursor = start + surface.length;
  }
  return analyseDeterministicContext({ fieldText: text, startUtf16: start, endUtf16: start + surface.length });
}

const cases = [
  ["There is a fox outside.", "There", "VALID", "EXISTENTIAL_THERE", null],
  ["Put it over there.", "there", "VALID", "LOCATIVE_THERE", null],
  ["Their dog is friendly.", "Their", "VALID", "POSSESSIVE_THEIR", null],
  ["Their happy dog is friendly.", "Their", "VALID", "POSSESSIVE_THEIR", null],
  ["Their going home was unexpected.", "Their", "VALID", "POSSESSIVE_THEIR_GERUND", null],
  ["Their running.", "Their", "UNCERTAIN", "INSUFFICIENT_CONTEXT", null],
  ["Their going to the park.", "Their", "INVALID", "EXPECTED_THEYRE", "they're"],
  ["Their dog is friendly, but their going home now.", "their", "INVALID", "EXPECTED_THEYRE", "they're"],
  ["They're going to the park.", "They're", "VALID", "CONTRACTION_THEY_ARE", null],
  ["They're home.", "They're", "VALID", "CONTRACTION_THEY_ARE", null],
  ["They're dog is friendly.", "They're", "INVALID", "EXPECTED_THEIR", "their"],
  ["We walked to school.", "to", "VALID", "PREPOSITIONAL_TO", null],
  ["I want to read.", "to", "VALID", "INFINITIVAL_TO", null],
  ["I want one too.", "too", "VALID", "ADDITIVE_TOO", null],
  ["The bag is too heavy.", "too", "VALID", "DEGREE_TOO", null],
  ["I have two cats.", "two", "VALID", "NUMERAL_TWO", null],
  ["I have to cats.", "to", "INVALID", "EXPECTED_TWO", "two"],
  ["I want too go.", "too", "INVALID", "EXPECTED_TO", "to"],
  ["Your coat is wet.", "Your", "VALID", "POSSESSIVE_YOUR", null],
  ["Your happy dog is here.", "Your", "VALID", "POSSESSIVE_YOUR", null],
  ["Your very kind.", "Your", "INVALID", "EXPECTED_YOURE", "you're"],
  ["You’re very kind.", "You’re", "VALID", "CONTRACTION_YOU_ARE", null],
  ["The dog wagged its tail.", "its", "VALID", "POSSESSIVE_ITS", null],
  ["The roof lost its running water.", "its", "VALID", "POSSESSIVE_ITS", null],
  ["It's raining.", "It's", "VALID", "CONTRACTION_IT_IS", null],
  ["Itʼs been raining.", "Itʼs", "VALID", "CONTRACTION_IT_HAS", null],
  ["It's tail is wet.", "It's", "INVALID", "EXPECTED_POSSESSIVE_ITS", "its"],
  ["It's home.", "It's", "UNCERTAIN", "INSUFFICIENT_CONTEXT", null],
  ["She copied ‘their’ from the prompt.", "their", "UNCERTAIN", "QUOTED_FORM_NOT_AUTHENTIC_USE", null],
  ["Their dog is friendly. Happy children play there.", "Their", "VALID", "POSSESSIVE_THEIR", null],
] as const;

for (const [text, surface, status, reason, alternative] of cases) {
  const result = analyse(text, surface);
  assert(result, `${text} must select a family`);
  assert.equal(result.status, status, text);
  assert.equal(result.reasonCode, reason, text);
  assert.equal(result.alternativeMember, alternative, text);
}

assert.equal(analyseDeterministicContext({ fieldText: "The weather changed.", startUtf16: 4, endUtf16: 11 }), null);
assert.equal(contextFamilyForMember("whether"), null, "unsupported near homophones remain explicit gaps");
assert.equal(CONTEXT_FAMILY_MANIFESTS.length, 4);

const raw = "There is a fox. Their dog waited there.";
const snapshot: SourceSnapshot = {
  id: "snapshot", submission_id: "submission", child_id: "child", parent_user_id: "parent",
  source_revision: "1", occurred_at: "2026-09-07T10:00:00Z",
  envelope: { draftPayload: { answer: raw } },
};
const field = { key: "/draftPayload/answer", rawText: raw, textHash: fingerprint(raw), selectedForBaseline: true };
const occurrences = extractOccurrences({
  kind: "course_draft", sourceId: "submission", revision: "1", promptText: null,
  fields: [field], provenance: "field_metadata_selection",
}, field).filter((occurrence) => occurrence.observedText.toLowerCase().startsWith("there"));
assert.equal(occurrences.length, 2, "repeated spellings retain separate occurrences");
const reconstructed = reconstructOccurrenceContext({
  snapshot, fieldPath: field.key, fieldHash: field.textHash,
  startUtf16: occurrences[1].start, endUtf16: occurrences[1].end, observedText: occurrences[1].observedText,
});
assert.equal(reconstructed.status, "ready");
assert.equal(reconstructed.status === "ready" && reconstructed.fieldText, raw);
assert.equal(reconstructOccurrenceContext({
  snapshot, fieldPath: field.key, fieldHash: "wrong", startUtf16: 0, endUtf16: 5, observedText: "There",
}).status, "blocked");
assert.equal(occurrences[0].id, extractOccurrences({
  kind: "course_draft", sourceId: "submission", revision: "1", promptText: null,
  fields: [field], provenance: "field_metadata_selection",
}, field)[0].id, "context analysis does not change occurrence identity");

console.log(`Whole-writing S8 regression passed: ${cases.length} governed examples, four family manifests, conservative abstention, and exact source reconstruction.`);
