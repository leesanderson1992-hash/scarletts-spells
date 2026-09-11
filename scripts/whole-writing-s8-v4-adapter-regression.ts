import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { analyseThereContextsV4Detailed } from "../lib/writing-engine/whole-writing/context-there-v4";
import { analyseToContextsV4Detailed } from "../lib/writing-engine/whole-writing/context-to-v4";
import { parseStructuralFeaturesV4, type StructuralTokenV4, type StructuralVariantV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Fixture = { id: string; family: "THERE_THEIR_THEYRE" | "TO_TOO_TWO"; text: string; surface: string; occurrence?: number };
const fixtures: Fixture[] = [
  { id: "there-existential", family: "THERE_THEIR_THEYRE", text: "Mia knows there are two spare chairs.", surface: "there" },
  { id: "there-locative", family: "THERE_THEIR_THEYRE", text: "The red scarf was there under the box.", surface: "there" },
  { id: "their-possessive", family: "THERE_THEIR_THEYRE", text: "The children finished their posters.", surface: "their" },
  { id: "theyre-progressive", family: "THERE_THEIR_THEYRE", text: "They're carrying the boxes.", surface: "They're" },
  { id: "theyre-adjectival", family: "THERE_THEIR_THEYRE", text: "They're ready for lunch.", surface: "They're" },
  { id: "theyre-passive", family: "THERE_THEIR_THEYRE", text: "They're being watched by the coach.", surface: "They're" },
  { id: "theyre-ambiguous-prepared", family: "THERE_THEIR_THEYRE", text: "They're prepared to present first.", surface: "They're" },
  { id: "to-going-look", family: "TO_TOO_TWO", text: "I am going to look at the poster.", surface: "to" },
  { id: "to-gerund-preposition", family: "TO_TOO_TWO", text: "I look forward to beating the other team.", surface: "to" },
  { id: "to-destination", family: "TO_TOO_TWO", text: "We walked to the library.", surface: "to" },
  { id: "to-recipient", family: "TO_TOO_TWO", text: "I gave the note to her.", surface: "to" },
  { id: "to-governed-infinitive", family: "TO_TOO_TWO", text: "We need to finish the poster.", surface: "to" },
  { id: "too-additive", family: "TO_TOO_TWO", text: "I want to join too.", surface: "too" },
  { id: "too-degree", family: "TO_TOO_TWO", text: "The bag is too heavy.", surface: "too" },
  { id: "two-numeral", family: "TO_TOO_TWO", text: "We packed two books.", surface: "two" },
];
const requiredDependencyMatches: Readonly<Record<string, readonly string[]>> = {
  "there-existential": ["EXISTENTIAL_NOMINAL_FRAME"],
  "there-locative": ["LOCATIVE_ADVERBIAL_FRAME"],
  "their-possessive": ["POSSESSIVE_NOMINAL_FRAME"],
  "theyre-progressive": ["CONTRACTION_VERBAL_FRAME"],
  "theyre-adjectival": ["CONTRACTION_COPULAR_ADJECTIVAL_FRAME"],
  "to-going-look": ["INFINITIVE_MARKER_VERB_FRAME"],
  "to-destination": ["PREPOSITION_NOMINAL_FRAME"],
  "two-numeral": ["NUMERAL_NOMINAL_FRAME"],
};

function input(fixture: Fixture) {
  let start = -1;
  let from = 0;
  for (let count = 0; count <= (fixture.occurrence ?? 0); count += 1) {
    start = fixture.text.indexOf(fixture.surface, from);
    from = start + fixture.surface.length;
  }
  assert(start >= 0);
  return { fieldText: fixture.text, startUtf16: start, endUtf16: start + fixture.surface.length };
}

const thereFixtures = fixtures.filter((fixture) => fixture.family === "THERE_THEIR_THEYRE");
const toFixtures = fixtures.filter((fixture) => fixture.family === "TO_TOO_TWO");
const results = [
  ...analyseThereContextsV4Detailed(thereFixtures.map(input)),
  ...analyseToContextsV4Detailed(toFixtures.map(input)),
];
assert.equal(results.length, fixtures.length);
for (const [index, result] of results.entries()) {
  assert(result.decision, fixtures[index].id);
  assert(result.trace.structural, fixtures[index].id);
  if (result.trace.structural.status === "ready") {
    const request = input(fixtures[index]);
    const members = fixtures[index].family === "THERE_THEIR_THEYRE" ? ["there", "their", "they're"] : ["to", "too", "two"];
    for (const member of members) {
      const variant: StructuralVariantV4 = result.trace.structural.variants[member];
      assert.equal(variant.status, "ready", `${fixtures[index].id}:${member}`);
      if (variant.status === "ready") {
        assert.equal(variant.focusStartUtf16, request.startUtf16);
        assert.equal(variant.focusEndUtf16, request.startUtf16 + member.length);
        const focus = variant.tokens.filter((token: StructuralTokenV4) => variant.focusTokenIndices.includes(token.index)).map((token: StructuralTokenV4) => token.surface).join("");
        assert.equal(focus.toLowerCase(), member);
        const observed = fixtures[index].surface.toLowerCase();
        if (member === observed) for (const match of requiredDependencyMatches[fixtures[index].id] ?? []) {
          assert(variant.dependencyMatches.includes(match), `${fixtures[index].id}:${member}:${match}`);
        }
      }
    }
  }
}
assert.equal(results.find((_, index) => fixtures[index].id === "to-gerund-preposition")?.decision?.status, "UNCERTAIN");
assert.equal(results.find((_, index) => fixtures[index].id === "theyre-ambiguous-prepared")?.decision?.status, "UNCERTAIN");

const protectedCases = [
  { text: "The copied note said “there”.", surface: "there", reason: "PROTECTED_QUOTATION" },
  { text: "The unfinished line was There walking...", surface: "There", reason: "PROTECTED_FRAGMENT" },
  { text: "The unseen exercise prompt is unavailable and the answer to question five is to.", surface: "to", reason: "PROTECTED_TASK_DEPENDENT", last: true },
  { text: "I went to school he ran home she called me.", surface: "to", reason: "PROTECTED_RUN_ON" },
];
for (const row of protectedCases) {
  const start = row.last ? row.text.lastIndexOf(row.surface) : row.text.indexOf(row.surface);
  const detail = row.surface.toLowerCase() === "there"
    ? analyseThereContextsV4Detailed([{ fieldText: row.text, startUtf16: start, endUtf16: start + row.surface.length }])[0]
    : analyseToContextsV4Detailed([{ fieldText: row.text, startUtf16: start, endUtf16: start + row.surface.length }])[0];
  assert.equal(detail.decision?.status, "UNCERTAIN", row.reason);
  assert.equal(detail.decision?.reasonCode, row.reason);
}

const core = {
  schemaVersion: 1,
  purpose: "deterministic_structural_feature_golden_not_approval_evidence",
  fixtures: fixtures.map((fixture, index) => ({ fixture, input: input(fixture), decision: results[index].decision, structural: results[index].trace.structural })),
};
const artifact = { ...core, fixtureFingerprint: fingerprint(core) };
const path = "data/whole-writing/v3-ordinary-writing-evaluation/development-analysis/s8-v4-structural-adapter/structural-feature-fixtures.json";
if (process.argv.includes("--write")) writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
else assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), artifact);

const savedPython = process.env.S8_V4_PYTHON;
delete process.env.S8_V4_PYTHON;
const unavailable = parseStructuralFeaturesV4([{
  requestId: "unavailable", family: "TO_TOO_TWO", sourceText: "We need to go.", startUtf16: 8, endUtf16: 10,
  familyMembers: ["to", "too", "two"],
}]);
assert.equal(unavailable[0].status, "blocked");
if (savedPython) process.env.S8_V4_PYTHON = savedPython;

const malformed = parseStructuralFeaturesV4([{
  requestId: "misaligned", family: "TO_TOO_TWO", sourceText: "We need to go.", startUtf16: 9, endUtf16: 11,
  familyMembers: ["to", "too", "two"],
}]);
assert.equal(malformed[0].status, "blocked");
console.log(JSON.stringify({ fixtures: fixtures.length, protectedPolicyFixtures: protectedCases.length, fixtureFingerprint: artifact.fixtureFingerprint, adapterUnavailableFailsClosed: true, sourceAlignmentFailsClosed: true }, null, 2));
