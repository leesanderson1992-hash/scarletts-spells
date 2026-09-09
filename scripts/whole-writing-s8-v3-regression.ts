import assert from "node:assert/strict";

import { CONTEXT_V2_CANDIDATES, CONTEXT_V3_CANDIDATES, contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { analyseItsContextV3, analyseItsContextV3Detailed } from "../lib/writing-engine/whole-writing/context-its-v3";
import { analyseThereContextV3, analyseThereContextV3Detailed } from "../lib/writing-engine/whole-writing/context-there-v3";
import { analyseToContextV3, analyseToContextV3Detailed } from "../lib/writing-engine/whole-writing/context-to-v3";
import { analyseYourContextV3, analyseYourContextV3Detailed } from "../lib/writing-engine/whole-writing/context-your-v3";
import { parseContextV3 } from "../lib/writing-engine/whole-writing/context-syntax-v3";
import { evaluateFamily, readJsonLines, runtimeFingerprints, type CandidateCase, type FinalGold } from "./lib/whole-writing-g2-corpus";

type Analyser = (input: { fieldText: string; startUtf16: number; endUtf16: number }) => { status: string; alternativeMember: string | null; reasonCode: string; assessedScope: string } | null;

function occurrence(text: string, surface: string, analyser: Analyser, number = 1) {
  let start = -1;
  let found = 0;
  while (found < number) {
    start = text.indexOf(surface, start + 1);
    if (start < 0) break;
    const before = text[start - 1] ?? "";
    const after = text[start + surface.length] ?? "";
    if (!/[\p{L}\p{M}]/u.test(before) && !/[\p{L}\p{M}]/u.test(after)) found += 1;
  }
  assert(start >= 0, `${surface} occurrence ${number} absent`);
  return analyser({ fieldText: text, startUtf16: start, endUtf16: start + surface.length });
}

const examples: Array<[Analyser, string, string, string, string | null]> = [
  [analyseThereContextV3, "After lunch, their coats were still wet, but they're leaving them here.", "their", "VALID", null],
  [analyseThereContextV3, "After lunch, there is another drink beside the bag.", "there", "VALID", null],
  [analyseThereContextV3, "Mia put the coats over their before lunch.", "their", "INVALID", "there"],
  [analyseThereContextV3, "I think their walking to school now.", "their", "INVALID", "they're"],
  [analyseThereContextV3, "Their walking to school was tiring.", "Their", "VALID", null],
  [analyseThereContextV3, "Their walking.", "Their", "UNCERTAIN", null],
  [analyseYourContextV3, "Although your bag is heavy, you're ready to leave.", "your", "VALID", null],
  [analyseYourContextV3, "Although your bag is heavy, you're ready to leave.", "you're", "VALID", null],
  [analyseYourContextV3, "Your supposed to bring a coat.", "Your", "INVALID", "you're"],
  [analyseYourContextV3, "I found you're coat beside the door.", "you're", "INVALID", "your"],
  [analyseYourContextV3, "Your singing was brilliant.", "Your", "VALID", null],
  [analyseYourContextV3, "Your singing.", "Your", "UNCERTAIN", null],
  [analyseToContextV3, "We went too the library, and then we walked home.", "too", "INVALID", "to"],
  [analyseToContextV3, "She wanted two read the book before lunch.", "two", "INVALID", "to"],
  [analyseToContextV3, "The bag was to heavy, so I left it there.", "to", "INVALID", "too"],
  [analyseToContextV3, "Please bring too drinks and a sandwich.", "too", "INVALID", "two"],
  [analyseToContextV3, "I wanted a drink to, but the bottle was empty.", "to", "INVALID", "too"],
  [analyseToContextV3, "The teacher is to fast before lunch.", "to", "UNCERTAIN", null],
  [analyseToContextV3, "The puppy was running to fast down the path.", "to", "INVALID", "too"],
  [analyseItsContextV3, "The puppy wagged it's tail while its owner smiled.", "it's", "INVALID", "its"],
  [analyseItsContextV3, "The puppy wagged it's tail while its owner smiled.", "its", "VALID", null],
  [analyseItsContextV3, "I think its getting late now.", "its", "INVALID", "it's"],
  [analyseItsContextV3, "Its singing was loud.", "Its", "VALID", null],
  [analyseItsContextV3, "Its singing.", "Its", "UNCERTAIN", null],
];

for (const [analyser, text, surface, expectedStatus, expectedAlternative] of examples) {
  const result = occurrence(text, surface, analyser);
  assert.equal(result?.status, expectedStatus, text);
  assert.equal(result?.alternativeMember, expectedAlternative, text);
}

const quoted = 'The teacher copied “your” onto the card.';
assert.equal(occurrence(quoted, "your", analyseYourContextV3)?.reasonCode, "QUOTED_FORM_NOT_AUTHENTIC_USE");
const fragment = "Maybe their ... because the page is missing.";
assert.equal(occurrence(fragment, "their", analyseThereContextV3)?.status, "UNCERTAIN");
const runOn = "Zoe wrote quickly the lights went out your the meaning changes if a full stop is added a picture was hidden.";
assert.equal(occurrence(runOn, "your", analyseYourContextV3)?.reasonCode, "RUN_ON_OR_UNMARKED_CLAUSE");
const taskDependent = "In the unseen picture, the label beside the arrow might be its.";
assert.equal(occurrence(taskDependent, "its", analyseItsContextV3)?.reasonCode, "TASK_CONTEXT_REQUIRED");

const unicode = "🌱 Cafe\u0301. Although youʼre ready, your bag is heavy.";
const unicodeStart = unicode.indexOf("youʼre");
const parsedUnicode = parseContextV3({ fieldText: unicode, startUtf16: unicodeStart, endUtf16: unicodeStart + "youʼre".length });
assert.equal(parsedUnicode.status, "ready");
if (parsedUnicode.status === "ready") assert.equal(parsedUnicode.context.words[parsedUnicode.context.focus].start, unicodeStart);
const tooLong = `${Array.from({ length: 257 }, () => "word").join(" ")} your bag is heavy.`;
const tooLongStart = tooLong.indexOf("your");
assert.equal(parseContextV3({ fieldText: tooLong, startUtf16: tooLongStart, endUtf16: tooLongStart + 4 }).status, "blocked");
const tooEmbedded = "You're ready and I agree and she knows and he thinks and we wait and they leave.";
const tooEmbeddedStart = tooEmbedded.indexOf("You're");
const embeddedResult = parseContextV3({ fieldText: tooEmbedded, startUtf16: tooEmbeddedStart, endUtf16: tooEmbeddedStart + "You're".length });
assert.equal(embeddedResult.status, "blocked");
if (embeddedResult.status === "blocked") assert.equal(embeddedResult.reason, "RESOURCE_LIMIT");

for (const detailed of [
  analyseThereContextV3Detailed({ fieldText: "I think they're walking home.", startUtf16: 8, endUtf16: 15 }),
  analyseYourContextV3Detailed({ fieldText: "Your bag is heavy.", startUtf16: 0, endUtf16: 4 }),
  analyseToContextV3Detailed({ fieldText: "We went to school.", startUtf16: 8, endUtf16: 10 }),
  analyseItsContextV3Detailed({ fieldText: "Its tail is wet.", startUtf16: 0, endUtf16: 3 }),
]) {
  assert(detailed.trace.syntax, "ready decisions expose source-preserving trace");
  assert(detailed.trace.candidates.length > 0);
}

assert.equal(CONTEXT_V3_CANDIDATES.length, 4);
assert.equal(new Set(CONTEXT_V3_CANDIDATES.map((candidate) => candidate.manifest.releaseId)).size, 4);
for (const candidate of CONTEXT_V3_CANDIDATES) {
  const manifest = candidate.manifest;
  const release = {
    id: manifest.releaseId,
    release_key: manifest.releaseKey,
    family_key: manifest.familyKey,
    analyser_version: manifest.analyserVersion,
    registry_version: manifest.registryVersion,
    corpus_version: manifest.corpusVersion,
    manifest_fingerprint: candidate.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(release)?.analyse, candidate.analyse, `${manifest.familyKey} exact V3 dispatch`);
  for (const key of Object.keys(release)) assert.equal(contextAnalyserForRelease({ ...release, [key]: "tampered" }), null, `${manifest.familyKey} ${key}`);
}
for (const candidate of CONTEXT_V2_CANDIDATES) {
  const manifest = candidate.manifest;
  assert.equal(contextAnalyserForRelease({
    id: manifest.releaseId,
    release_key: manifest.releaseKey,
    family_key: manifest.familyKey,
    analyser_version: manifest.analyserVersion,
    registry_version: manifest.registryVersion,
    corpus_version: manifest.corpusVersion,
    manifest_fingerprint: candidate.fingerprint,
  })?.analyse, candidate.analyse, `${manifest.familyKey} V2 remains exact`);
}

const g2Root = "data/whole-writing/g2-context-family-corpora";
const expectedG2 = {
  THERE_THEIR_THEYRE: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
  YOUR_YOURE: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
  TO_TOO_TWO: { truePositives: 148, falseNegatives: 2, abstentions: 103 },
  ITS_ITS: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
} as const;
const runtime = runtimeFingerprints(process.cwd());
for (const candidate of CONTEXT_V3_CANDIDATES) {
  const family = candidate.manifest.familyKey;
  const result = evaluateFamily({
    candidates: readJsonLines<CandidateCase>(`${g2Root}/candidates/${family}.jsonl`),
    gold: readJsonLines<FinalGold>(`${g2Root}/gold/${family}.final-gold.jsonl`),
    analyser: candidate.analyse,
    prerequisiteIssues: [],
    expectedRuntimeFingerprints: runtime,
    actualRuntimeFingerprints: runtime,
  });
  assert.equal(result.disposition, "PASS", `${family} frozen G2 regression`);
  assert.deepEqual(result.confusion, {
    ...expectedG2[family],
    falsePositives: 0,
    trueNegatives: 250,
  });
  assert.equal(result.invalidAlternativeAccuracy, 1);
  for (const protectedResult of Object.values(result.byProtectedSet)) assert.equal(protectedResult.failures, 0, `${family} protected set`);
}

console.log(`S8 V3 ordinary-writing regression passed: ${examples.length} natural-prose contrasts plus frozen G2 safety.`);
