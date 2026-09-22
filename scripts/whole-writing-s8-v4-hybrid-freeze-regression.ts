import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import {
  analyseFamilyContextsV4WithFallbackParsers, fallbackEligibilityV4,
  type ContextInputV4, type DetailedContextDecisionV4, type StructuralParserV4,
} from "../lib/writing-engine/whole-writing/context-family-v4";
import type { StructuralResultV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Family = "THERE_THEIR_THEYRE" | "TO_TOO_TWO" | "YOUR_YOURE" | "ITS_ITS";
type Classification = "VALID" | "INVALID" | "UNCERTAIN";
type Candidate = Readonly<{ caseId: string; sourceText: string; startUtf16: number; endUtf16: number; protectedSetTags: readonly string[] }>;
type Gold = Readonly<{ classification: Classification; expectedAlternative: string | null; supported: boolean }>;
type Row = Readonly<{ evidence: "ordinary_exposed" | "frozen_g2"; candidate: Candidate; gold: Gold }>;
type Decision = NonNullable<DetailedContextDecisionV4["decision"]>;

const evaluationRoot = "data/whole-writing/v3-ordinary-writing-evaluation";
const comparisonRoot = join(evaluationRoot, "development-analysis/s8-v4-four-family-parser-cost-optimisation");
const outputPath = join(evaluationRoot, "development-analysis/s8-v4-implementation-freeze/hybrid-regression.json");
const write = process.argv.includes("--write");

function lines<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function rows(family: Family): Row[] {
  type G2Gold = { caseId: string; classification: Classification; expectedAlternative: string | null; supportedConstructionStatus: "SUPPORTED" | "UNSUPPORTED" };
  const g2Candidates = lines<Candidate>(`data/whole-writing/g2-context-family-corpora/candidates/${family}.jsonl`);
  const g2Gold = new Map(lines<G2Gold>(`data/whole-writing/g2-context-family-corpora/gold/${family}.final-gold.jsonl`).map((gold) => [gold.caseId, gold]));
  const g2 = g2Candidates.map((candidate) => {
    const gold = g2Gold.get(candidate.caseId)!;
    return { evidence: "frozen_g2" as const, candidate, gold: { classification: gold.classification, expectedAlternative: gold.expectedAlternative, supported: gold.supportedConstructionStatus === "SUPPORTED" } };
  });
  if (family === "YOUR_YOURE" || family === "ITS_ITS") return g2;
  type OrdinaryGold = { caseId: string; classification: Classification; intendedAlternative: string | null; supportedConstruction: boolean };
  const candidates = lines<Candidate>(join(evaluationRoot, `candidates/${family}.jsonl`));
  const gold = new Map(lines<OrdinaryGold>(join(evaluationRoot, `gold/${family}.final-gold.jsonl`)).map((row) => [row.caseId, row]));
  return [...candidates.map((candidate) => {
    const final = gold.get(candidate.caseId)!;
    return { evidence: "ordinary_exposed" as const, candidate, gold: { classification: final.classification, expectedAlternative: final.intendedAlternative, supported: final.supportedConstruction } };
  }), ...g2];
}
function checkpoint(model: "sm" | "trf", family: Family) {
  const path = join(comparisonRoot, `checkpoints/v8-${model}-${family}.jsonl`);
  const results = new Map<string, StructuralResultV4>();
  for (const row of lines<{ type?: string; result?: StructuralResultV4 }>(path)) {
    if (row.result) results.set(row.result.requestId, row.result);
  }
  return results;
}
function parserFor(target: readonly Row[], results: ReadonlyMap<string, StructuralResultV4>): StructuralParserV4 {
  const resultByInput = new Map<string, StructuralResultV4>();
  for (const row of target) {
    const result = results.get(row.candidate.caseId);
    if (result) resultByInput.set(fingerprint([row.candidate.sourceText, row.candidate.startUtf16, row.candidate.endUtf16]), result);
  }
  return (requests) => requests.map((request) => {
    const result = resultByInput.get(fingerprint([request.sourceText, request.startUtf16, request.endUtf16]));
    return result ? { ...result, requestId: request.requestId } : { requestId: request.requestId, status: "blocked", reason: "FREEZE_FIXTURE_RESULT_MISSING", variants: {} };
  });
}
function metrics(target: readonly Row[], decisions: readonly Decision[]) {
  const indexes = target.map((_, index) => index);
  const suggestions = indexes.filter((index) => decisions[index]!.status === "INVALID");
  const correctSuggestions = suggestions.filter((index) => target[index]!.gold.classification === "INVALID" && decisions[index]!.alternativeMember === target[index]!.gold.expectedAlternative);
  const supported = indexes.filter((index) => target[index]!.gold.classification === "INVALID" && target[index]!.gold.supported);
  const recalled = supported.filter((index) => decisions[index]!.status === "INVALID" && decisions[index]!.alternativeMember === target[index]!.gold.expectedAlternative);
  const valid = indexes.filter((index) => target[index]!.gold.classification === "VALID");
  const recognised = valid.filter((index) => decisions[index]!.status === "VALID");
  const falseValid = indexes.filter((index) => target[index]!.gold.classification !== "VALID" && decisions[index]!.status === "VALID").length;
  const wrongAlternatives = suggestions.length - correctSuggestions.length;
  const protectedFailures = indexes.filter((index) => target[index]!.candidate.protectedSetTags.length && decisions[index]!.status !== "UNCERTAIN").length;
  return {
    cases: target.length,
    decisions: Object.fromEntries((["VALID", "INVALID", "UNCERTAIN"] as const).map((status) => [status, decisions.filter((decision) => decision.status === status).length])),
    precision: suggestions.length ? correctSuggestions.length / suggestions.length : 0,
    supportedRecall: supported.length ? recalled.length / supported.length : 0,
    validRecognition: valid.length ? recognised.length / valid.length : 0,
    falseValid, wrongAlternatives, protectedFailures,
  };
}

const families = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => {
  const family = candidate.manifest.familyKey;
  const target = rows(family);
  const primary = checkpoint("sm", family);
  const fallback = family === "THERE_THEIR_THEYRE" || family === "TO_TOO_TWO" ? checkpoint("trf", family) : new Map<string, StructuralResultV4>();
  const details = analyseFamilyContextsV4WithFallbackParsers(
    candidate.manifest,
    target.map((row) => ({ fieldText: row.candidate.sourceText, startUtf16: row.candidate.startUtf16, endUtf16: row.candidate.endUtf16 })),
    parserFor(target, primary),
    parserFor(target, fallback),
  );
  const fallbackAttempts = details.filter((detail) => detail.trace.fallback);
  const acceptedFallbacks = fallbackAttempts.filter((detail) => detail.trace.fallback?.accepted);
  if (family === "YOUR_YOURE" || family === "ITS_ITS") assert.equal(fallbackAttempts.length, 0, `${family}:small-only`);
  const byEvidence = Object.fromEntries((["ordinary_exposed", "frozen_g2"] as const).map((evidence) => {
    const indexes = target.flatMap((row, index) => row.evidence === evidence ? [index] : []);
    return [evidence, indexes.length ? metrics(indexes.map((index) => target[index]!), indexes.map((index) => details[index]!.decision!)) : null];
  }));
  const all = metrics(target, details.map((detail) => detail.decision!));
  assert.equal(all.falseValid, 0, `${family}:false-valid`);
  assert.equal(all.wrongAlternatives, 0, `${family}:wrong-alternative`);
  assert.equal(all.protectedFailures, 0, `${family}:protected`);
  for (const detail of fallbackAttempts) assert(fallbackEligibilityV4(candidate.manifest, { ...detail, decision: detail.trace.fallback!.primaryDecision }) !== null);
  return { family, fallbackAttempts: fallbackAttempts.length, acceptedFallbacks: acceptedFallbacks.length, byEvidence, all };
});

const there = families.find((row) => row.family === "THERE_THEIR_THEYRE")!;
const to = families.find((row) => row.family === "TO_TOO_TWO")!;
const your = families.find((row) => row.family === "YOUR_YOURE")!;
const its = families.find((row) => row.family === "ITS_ITS")!;
assert.equal(there.fallbackAttempts, 54);
assert.equal(to.fallbackAttempts, 222);
assert.equal(there.byEvidence.ordinary_exposed!.supportedRecall, 0.9069767441860465);
assert.equal(there.byEvidence.ordinary_exposed!.validRecognition, 0.8306451612903226);
assert.equal(to.byEvidence.ordinary_exposed!.supportedRecall, 0.82);
assert.equal(to.byEvidence.ordinary_exposed!.validRecognition, 0.8127450980392157);
assert.equal(your.byEvidence.frozen_g2!.supportedRecall, 1);
assert.equal(your.byEvidence.frozen_g2!.validRecognition, 1);
assert.equal(its.byEvidence.frozen_g2!.supportedRecall, 0.9733333333333334);
assert.equal(its.byEvidence.frozen_g2!.validRecognition, 0.9733333333333334);

const unsafeCaseIds = [
  "v3-to-too-two-0345-to-too-two-01", "v3-to-too-two-0351-to-too-two-01", "v3-to-too-two-0352-to-too-two-01",
  "v3-to-too-two-0355-to-too-two-01", "v3-to-too-two-0356-to-too-two-01",
];
const toTarget = rows("TO_TOO_TWO");
const toDetails = (() => {
  const candidate = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === "TO_TOO_TWO")!;
  return analyseFamilyContextsV4WithFallbackParsers(candidate.manifest, toTarget.map((row) => ({ fieldText: row.candidate.sourceText, startUtf16: row.candidate.startUtf16, endUtf16: row.candidate.endUtf16 })), parserFor(toTarget, checkpoint("sm", "TO_TOO_TWO")), parserFor(toTarget, checkpoint("trf", "TO_TOO_TWO")));
})();
for (const caseId of unsafeCaseIds) {
  const index = toTarget.findIndex((row) => row.candidate.caseId === caseId);
  assert(index >= 0, caseId);
  assert.equal(toDetails[index]!.decision!.status, "UNCERTAIN", caseId);
  assert.equal(toDetails[index]!.trace.fallback?.accepted, false, `${caseId}:unsafe-different-scope-rejected`);
}

const toManifest = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === "TO_TOO_TWO")!.manifest;
const eligibleIndex = toDetails.findIndex((detail) => detail.trace.fallback !== null);
assert(eligibleIndex >= 0);
const eligibleInput: ContextInputV4 = {
  fieldText: toTarget[eligibleIndex]!.candidate.sourceText,
  startUtf16: toTarget[eligibleIndex]!.candidate.startUtf16,
  endUtf16: toTarget[eligibleIndex]!.candidate.endUtf16,
};
const eligiblePrimary = toDetails[eligibleIndex]!.trace.fallback!.primaryStructural!;
const primaryFixture: StructuralParserV4 = (requests) => requests.map((request) => ({ ...eligiblePrimary, requestId: request.requestId }));
const blockedFallback: StructuralParserV4 = (requests) => requests.map((request) => ({ requestId: request.requestId, status: "blocked", reason: "TEST_FALLBACK_UNAVAILABLE", variants: {} }));
const unavailable = analyseFamilyContextsV4WithFallbackParsers(toManifest, [eligibleInput], primaryFixture, blockedFallback)[0]!;
assert.equal(unavailable.decision?.status, "UNCERTAIN");
assert.equal(unavailable.trace.fallback?.disposition, "FALLBACK_EXECUTION_FAILED");
const crashed = analyseFamilyContextsV4WithFallbackParsers(toManifest, [eligibleInput], primaryFixture, () => { throw new Error("TEST_FALLBACK_CRASH"); })[0]!;
assert.equal(crashed.decision?.status, "UNCERTAIN");
assert.equal(crashed.trace.fallback?.disposition, "FALLBACK_EXECUTION_FAILED");
const timedOut = analyseFamilyContextsV4WithFallbackParsers(toManifest, [eligibleInput], primaryFixture, (requests) => requests.map((request) => ({ requestId: request.requestId, status: "blocked", reason: "FALLBACK_STRUCTURAL_ADAPTER_TIMEOUT", variants: {} })))[0]!;
assert.equal(timedOut.decision?.status, "UNCERTAIN");
assert.equal(timedOut.trace.fallback?.fallbackStructural?.status, "blocked");
if (timedOut.trace.fallback?.fallbackStructural?.status === "blocked") assert.equal(timedOut.trace.fallback.fallbackStructural.reason, "FALLBACK_STRUCTURAL_ADAPTER_TIMEOUT");
const malformed = analyseFamilyContextsV4WithFallbackParsers(toManifest, [eligibleInput], primaryFixture, () => [])[0]!;
assert.equal(malformed.decision?.status, "UNCERTAIN");
assert.equal(malformed.trace.fallback?.disposition, "FALLBACK_EXECUTION_FAILED");
const malformedResponse = analyseFamilyContextsV4WithFallbackParsers(toManifest, [eligibleInput], primaryFixture, (requests) => requests.map((request) => ({ requestId: request.requestId, status: "blocked", reason: "FALLBACK_MALFORMED_STRUCTURAL_RESPONSE", variants: {} })))[0]!;
assert.equal(malformedResponse.decision?.status, "UNCERTAIN");
assert.equal(malformedResponse.trace.fallback?.disposition, "FALLBACK_EXECUTION_FAILED");

const batchSizes: number[] = [];
const repeated = analyseFamilyContextsV4WithFallbackParsers(toManifest, Array.from({ length: 513 }, () => eligibleInput), primaryFixture, (requests) => {
  batchSizes.push(requests.length); return blockedFallback(requests);
});
assert.deepEqual(batchSizes, [512, 1]);
assert(repeated.every((detail) => detail.decision?.status === "UNCERTAIN"));
let isolatedBatchCalls = 0;
const isolated = analyseFamilyContextsV4WithFallbackParsers(toManifest, Array.from({ length: 513 }, () => eligibleInput), primaryFixture, (requests) => {
  isolatedBatchCalls += 1;
  if (isolatedBatchCalls === 1) throw new Error("TEST_FIRST_BATCH_CRASH");
  return blockedFallback(requests);
});
assert.equal(isolatedBatchCalls, 2);
assert(isolated.every((detail) => detail.decision?.status === "UNCERTAIN"));
const excludedNumeralAmbiguities = toDetails.filter((detail) =>
  detail.decision?.reasonCode === "COMPETING_STRUCTURAL_INTERPRETATIONS" &&
  detail.trace.candidates.some((candidate) => candidate.scope === "numeral:ordinary_count_numeral") &&
  !detail.trace.candidates.some((candidate) => candidate.scope === "infinitive:governed_infinitive") &&
  detail.trace.fallback === null,
).length;
assert(excludedNumeralAmbiguities > 0);

const core = {
  schemaVersion: 1, evidenceQualification: "DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE", families,
  unsafeBroadFallbackCases: unsafeCaseIds,
  failureBoundary: {
    unavailableRetainedUncertain: true, crashRetainedUncertain: true, timeoutReasonPreserved: true,
    malformedOrMissingResultRetainedUncertain: true, malformedResponseReasonRetainedUncertain: true,
    boundedBatchSizes: batchSizes, failedBatchIsolated: true,
    excludedNumeralAmbiguities,
  },
};
const artifact = { ...core, regressionFingerprint: fingerprint(core) };
if (write) { mkdirSync(join(evaluationRoot, "development-analysis/s8-v4-implementation-freeze"), { recursive: true }); writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`); }
else assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), artifact);
console.log(JSON.stringify(artifact, null, 2));
