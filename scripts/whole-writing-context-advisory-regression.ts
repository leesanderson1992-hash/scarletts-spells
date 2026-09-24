import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractOccurrences, fingerprint } from "../lib/writing-engine/baseline/source";
import { extractAuthenticUseCandidates } from "../lib/adle/authentic-use";
import {
  governedContextFamily,
  governedEvidenceExclusionWords,
  isGovernedContextMember,
} from "../lib/writing-engine/whole-writing/context-advisory-routing";

assert.equal(governedContextFamily("their"), "THERE_THEIR_THEYRE");
assert.equal(governedContextFamily("They’re"), "THERE_THEIR_THEYRE");
assert.equal(governedContextFamily("TOO"), "TO_TOO_TWO");
assert.equal(governedContextFamily("you're"), "YOUR_YOURE");
assert.equal(governedContextFamily("Itʼs"), "ITS_ITS");
for (const malformed of ["thier", "youre", "its'", "tooo"]) {
  assert.equal(isGovernedContextMember(malformed), false, malformed);
}

const text = "Their dog ran, but their should be two toys. It's your turn to try too.";
const field = { key: "/text", rawText: text, textHash: fingerprint(text), selectedForBaseline: true };
const source = { kind: "writing_sample" as const, sourceId: "fixture", revision: "1",
  promptText: null, provenance: "field_metadata_selection" as const, fields: [field] };
const occurrences = extractOccurrences(source, field).filter((item) => isGovernedContextMember(item.observedText));
assert.equal(occurrences.length, 7);
assert.notEqual(occurrences[0].id, occurrences[1].id);
for (const item of occurrences) assert.equal(text.slice(item.start, item.end), item.observedText);

const excluded = governedEvidenceExclusionWords(text);
for (const member of ["their", "two", "it", "s", "your", "to", "too"]) {
  assert(excluded.has(member), member);
}
assert(!excluded.has("dog"));
assert(!excluded.has("toys"));

const candidates = extractAuthenticUseCandidates({
  childId: "child", writingSampleId: "sample", sampleText: text,
  flaggedMisspellings: [], occurredOn: "2026-09-24",
});
assert(candidates.every((item) => !excluded.has(item.observedWord.toLowerCase())));
assert(candidates.some((item) => item.observedWord.toLowerCase() === "dog"));

const retryProcessor = readFileSync("lib/courses/submission-processing.ts", "utf8");
assert.match(retryProcessor, /source_kind === "contextual_advisory_v4"/);
assert.match(retryProcessor, /assistance_state: contextualRepair \? "scaffolded" : evidence\.assistanceState/);
assert.match(retryProcessor, /answer_visibility: evidence\.answerVisibility/);
assert.match(retryProcessor, /evidence_kind: "REPAIR_ONLY", prompt_scope: "targeted_word"/);

console.log("context advisory routing regression passed");
