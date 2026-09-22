import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { analyseItsContextsV4Detailed } from "../lib/writing-engine/whole-writing/context-its-v4";
import { analyseYourContextsV4Detailed } from "../lib/writing-engine/whole-writing/context-your-v4";
import { parseStructuralFeaturesV4, type StructuralTokenV4, type StructuralVariantV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Family = "YOUR_YOURE" | "ITS_ITS";
type Fixture = Readonly<{ id: string; family: Family; text: string; surface: string; occurrence?: number; expected: "VALID" | "INVALID" | "UNCERTAIN"; reason?: string }>;
const fixtures: readonly Fixture[] = [
  { id: "your-possessive", family: "YOUR_YOURE", text: "Your book seems happy in this light.", surface: "Your", expected: "VALID" },
  { id: "your-adjective-noun", family: "YOUR_YOURE", text: "Your new book seems happy in this light.", surface: "Your", expected: "VALID" },
  { id: "your-coordinated-nominal", family: "YOUR_YOURE", text: "Your brother and sister seem ready.", surface: "Your", expected: "VALID" },
  { id: "youre-progressive", family: "YOUR_YOURE", text: "You're carrying the boxes.", surface: "You're", expected: "VALID" },
  { id: "youre-adjectival", family: "YOUR_YOURE", text: "You're ready for lunch.", surface: "You're", expected: "VALID" },
  { id: "youre-passive", family: "YOUR_YOURE", text: "You're being watched by the coach.", surface: "You're", expected: "VALID" },
  { id: "youre-subordinate", family: "YOUR_YOURE", text: "Although you're ready, your coat is still wet.", surface: "you're", expected: "VALID" },
  { id: "your-multiple-possessive", family: "YOUR_YOURE", text: "Your coat seems warm, and you're ready.", surface: "Your", expected: "VALID" },
  { id: "youre-multiple-contraction", family: "YOUR_YOURE", text: "Your coat seems warm, and you're ready.", surface: "you're", expected: "VALID" },
  { id: "youre-ambiguous-predicate", family: "YOUR_YOURE", text: "You're prepared to present first.", surface: "You're", expected: "UNCERTAIN", reason: "GENUINE_PREDICATE_AMBIGUITY" },
  { id: "your-protected-quotation", family: "YOUR_YOURE", text: "The copied note said “your”.", surface: "your", expected: "UNCERTAIN", reason: "PROTECTED_QUOTATION" },
  { id: "its-possessive", family: "ITS_ITS", text: "Its book seems happy in this light.", surface: "Its", expected: "VALID" },
  { id: "its-adjective-noun", family: "ITS_ITS", text: "Its large wooden door seems open.", surface: "Its", expected: "VALID" },
  { id: "its-coordinated-nominal", family: "ITS_ITS", text: "Its tail and paws seem muddy.", surface: "Its", expected: "VALID" },
  { id: "its-progressive", family: "ITS_ITS", text: "It's getting late.", surface: "It's", expected: "VALID" },
  { id: "its-adjectival", family: "ITS_ITS", text: "It's ready for lunch.", surface: "It's", expected: "VALID" },
  { id: "its-passive", family: "ITS_ITS", text: "It's being watched by the coach.", surface: "It's", expected: "VALID" },
  { id: "its-perfect", family: "ITS_ITS", text: "It's been ready since early morning.", surface: "It's", expected: "VALID" },
  { id: "its-multiple-possessive", family: "ITS_ITS", text: "Its coat seems warm, and it's ready.", surface: "Its", expected: "VALID" },
  { id: "its-multiple-contraction", family: "ITS_ITS", text: "Its coat seems warm, and it's ready.", surface: "it's", expected: "VALID" },
  { id: "its-ambiguous-predicate", family: "ITS_ITS", text: "It's prepared to present first.", surface: "It's", expected: "UNCERTAIN", reason: "GENUINE_PREDICATE_AMBIGUITY" },
  { id: "its-protected-quotation", family: "ITS_ITS", text: "The copied note said “its”.", surface: "its", expected: "UNCERTAIN", reason: "PROTECTED_QUOTATION" },
];

function input(fixture: Fixture) {
  let start = -1; let from = 0;
  for (let count = 0; count <= (fixture.occurrence ?? 0); count += 1) {
    start = fixture.text.toLowerCase().indexOf(fixture.surface.toLowerCase(), from);
    from = start + fixture.surface.length;
  }
  assert(start >= 0, fixture.id);
  return { fieldText: fixture.text, startUtf16: start, endUtf16: start + fixture.surface.length };
}

const yourFixtures = fixtures.filter((fixture) => fixture.family === "YOUR_YOURE");
const itsFixtures = fixtures.filter((fixture) => fixture.family === "ITS_ITS");
const results = [
  ...analyseYourContextsV4Detailed(yourFixtures.map(input)),
  ...analyseItsContextsV4Detailed(itsFixtures.map(input)),
];
for (const [index, result] of results.entries()) {
  const fixture = fixtures[index]!;
  assert.equal(result.decision?.status, fixture.expected, fixture.id);
  if (fixture.reason) assert.equal(result.decision?.reasonCode, fixture.reason, fixture.id);
  if (result.trace.structural?.status !== "ready") continue;
  const request = input(fixture);
  const members = fixture.family === "YOUR_YOURE" ? ["your", "you're"] : ["its", "it's"];
  for (const member of members) {
    const variant: StructuralVariantV4 = result.trace.structural.variants[member]!;
    assert.equal(variant.status, "ready", `${fixture.id}:${member}`);
    if (variant.status === "ready") {
      assert.equal(variant.focusStartUtf16, request.startUtf16, `${fixture.id}:${member}`);
      assert.equal(variant.focusEndUtf16, request.startUtf16 + member.length, `${fixture.id}:${member}`);
      const focus = variant.tokens.filter((token: StructuralTokenV4) => variant.focusTokenIndices.includes(token.index)).map((token: StructuralTokenV4) => token.surface).join("");
      assert.equal(focus.toLowerCase(), member, `${fixture.id}:${member}`);
    }
  }
}

const core = {
  schemaVersion: 1,
  purpose: "your_its_structural_feature_golden_development_regression_not_approval_evidence",
  fixtures: fixtures.map((fixture, index) => ({ fixture, input: input(fixture), decision: results[index]!.decision, structural: results[index]!.trace.structural })),
};
const artifact = { ...core, fixtureFingerprint: fingerprint(core) };
const path = "data/whole-writing/v3-ordinary-writing-evaluation/development-analysis/s8-v4-four-family-baseline/your-its-structural-feature-fixtures.json";
if (process.argv.includes("--write")) writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
else assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), artifact);

const savedPython = process.env.S8_V4_PYTHON;
delete process.env.S8_V4_PYTHON;
const unavailable = parseStructuralFeaturesV4([{
  requestId: "unavailable-your", family: "YOUR_YOURE", sourceText: "Your coat is warm.", startUtf16: 0, endUtf16: 4, familyMembers: ["your", "you're"],
}]);
assert.equal(unavailable[0]?.status, "blocked");
if (savedPython) process.env.S8_V4_PYTHON = savedPython;
console.log(JSON.stringify({ fixtures: fixtures.length, fixtureFingerprint: artifact.fixtureFingerprint, adapterUnavailableFailsClosed: true, sourceAlignmentCovered: true }, null, 2));
