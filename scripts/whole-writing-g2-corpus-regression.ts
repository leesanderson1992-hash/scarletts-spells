import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
} from "../lib/writing-engine/whole-writing/context";
import {
  G2_PACKAGE_VERSION,
  buildFinalGold,
  corpusVariety,
  evaluateFamily,
  readJsonLines,
  recordFingerprint,
  runtimeFingerprints,
  validateCandidate,
  validateIndependentLabels,
  wilsonLowerBound,
  type AuthorProposal,
  type CandidateCase,
  type IndependentLabel,
} from "./lib/whole-writing-g2-corpus";

const repositoryRoot = resolve(import.meta.dirname, "..");
const root = join(repositoryRoot, "data/whole-writing/g2-context-family-corpora");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const manifestBody = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "packageFingerprint"));
assert.equal(recordFingerprint(manifestBody), manifest.packageFingerprint, "package manifest must be immutable");
assert.equal(manifest.packageVersion, G2_PACKAGE_VERSION);
assert.deepEqual(manifest.runtime, runtimeFingerprints(repositoryRoot), "runtime dependencies remain exact");

for (const familyManifest of CONTEXT_FAMILY_MANIFESTS) {
  const family = familyManifest.familyKey;
  const candidates = readJsonLines<CandidateCase>(join(root, "candidates", `${family}.jsonl`));
  const proposals = readJsonLines<AuthorProposal>(join(root, "author-proposals", `${family}.jsonl`));
  assert.equal(candidates.length, 400, `${family} candidate count`);
  assert.equal(proposals.length, 400, `${family} proposal count`);
  assert.deepEqual(candidates.flatMap(validateCandidate), [], `${family} schema/span/fingerprint validation`);
  assert.equal(recordFingerprint(candidates.map((item) => item.candidateFingerprint)), manifest.families[family].corpusFingerprint);
  assert.deepEqual(
    proposals.reduce((counts, proposal) => ({ ...counts, [proposal.proposedClassification]: counts[proposal.proposedClassification] + 1 }), { VALID: 0, INVALID: 0, UNCERTAIN: 0 }),
    { VALID: 150, INVALID: 150, UNCERTAIN: 100 },
    `${family} authored proposal coverage`,
  );
  assert(proposals.every((proposal) => proposal.authority === "CORPUS_AUTHOR_PROPOSAL_NOT_GOLD"));
  assert(proposals.every((proposal) => recordFingerprint(proposal, "proposalFingerprint") === proposal.proposalFingerprint));
  assert.equal(recordFingerprint(proposals.map((proposal) => proposal.proposalFingerprint)), manifest.families[family].authorProposalFingerprint);
  const variety = corpusVariety(candidates);
  assert.equal(variety.uniqueNormalizedTexts, 400);
  assert.equal(variety.exactDuplicates.length, 0);
  assert.equal(variety.nearDuplicates.length, 0);
  assert(variety.distinctTemplateIds >= 60, `${family} must retain broad template variety`);
  for (const tag of ["fragment", "quotation", "gerund", "run_on", "task_dependent"] as const) {
    assert.equal(candidates.filter((candidate) => candidate.protectedSetTags.includes(tag)).length, 20, `${family} ${tag} protected coverage`);
  }
  assert(candidates.filter((candidate) => candidate.sourceText.match(new RegExp(candidate.focusSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"))!.length > 1).length >= 10, `${family} repeated occurrence coverage`);
  for (const candidate of candidates) {
    const result = analyseDeterministicContext({ fieldText: candidate.sourceText, startUtf16: candidate.startUtf16, endUtf16: candidate.endUtf16 });
    assert(result, `${candidate.caseId} must select an S8 family`);
    assert.equal(result.familyKey, family);
  }
  const packetA = readJsonLines<Record<string, unknown>>(join(root, "packets", `${family}.label-packet-a.jsonl`));
  const packetB = readJsonLines<Record<string, unknown>>(join(root, "packets", `${family}.label-packet-b.jsonl`));
  assert.equal(packetA.length, 400);
  assert.equal(packetB.length, 400);
  assert.deepEqual(new Set(packetA.map((row) => row.caseId)), new Set(candidates.map((row) => row.caseId)));
  assert.deepEqual(new Set(packetB.map((row) => row.caseId)), new Set(candidates.map((row) => row.caseId)));
  assert.notDeepEqual(packetA.map((row) => row.caseId), packetB.map((row) => row.caseId), "packet order must be independently blinded");
  for (const row of [...packetA, ...packetB]) {
    for (const forbidden of ["proposedClassification", "proposedExpectedAlternative", "analyserResult", "proposedApproval", "otherLabel"]) assert(!(forbidden in row));
  }
  const empty = buildFinalGold(candidates, [], []);
  assert.equal(empty.gold.length, 0);
  assert.equal(empty.issues.filter((issue) => issue.code === "INDEPENDENT_LABEL_COUNT").length, 400, "unlabelled release fails closed by case");
}

assert(Math.abs(wilsonLowerBound(98, 100) - 0.9299882092714561) < 1e-12, "Wilson calculation is reproducible");
assert(wilsonLowerBound(98, 100) < 0.95, "98% point precision alone is insufficient at n=100");
assert(wilsonLowerBound(294, 300) > 0.95, "larger 98% sample can clear the Wilson gate");
assert.equal(wilsonLowerBound(0, 0), 0, "zero suggestions cannot pass precision confidence");

const candidate = readJsonLines<CandidateCase>(join(root, "candidates", "THERE_THEIR_THEYRE.jsonl"))[0];
function label(labelerId: string, classification: IndependentLabel["classification"], alternative: string | null): IndependentLabel {
  const body = {
    schemaVersion: 1 as const,
    labelId: `test:${labelerId}:${candidate.caseId}`,
    packetId: `NON_RELEASE_TEST_PACKET:${labelerId}`,
    caseId: candidate.caseId,
    family: candidate.family,
    labelerId,
    classification,
    intendedAlternative: alternative,
    supportedConstructionStatus: "SUPPORTED" as const,
    ambiguityOrExclusionReason: null,
    confidence: 5 as const,
    rationale: "Non-release validator test fixture.",
    labelledAt: "2026-09-08T00:00:00.000Z",
    releaseId: candidate.releaseId,
    familyManifestFingerprint: candidate.familyManifestFingerprint,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
    candidateFingerprint: candidate.candidateFingerprint,
  };
  return { ...body, labelFingerprint: recordFingerprint(body) };
}
const first = label("independent-a", "VALID", null);
const samePerson = label("independent-a", "VALID", null);
assert(validateIndependentLabels([candidate], [first, samePerson]).some((issue) => issue.code === "LABELERS_NOT_DISTINCT"));
const mutated = { ...first, rationale: "Changed after import." };
assert(validateIndependentLabels([candidate], [first, mutated]).some((issue) => issue.code === "POST_HOC_LABEL_MUTATION"));
const disagreement = buildFinalGold([candidate], [first, label("independent-b", "INVALID", "their")], []);
assert(disagreement.issues.some((issue) => issue.code === "ADJUDICATION_REQUIRED"));

const runtime = runtimeFingerprints(repositoryRoot);
const deterministicLeft = evaluateFamily({ candidates: [candidate], gold: [], prerequisiteIssues: [], expectedRuntimeFingerprints: runtime, actualRuntimeFingerprints: runtime });
const deterministicRight = evaluateFamily({ candidates: [candidate], gold: [], prerequisiteIssues: [], expectedRuntimeFingerprints: runtime, actualRuntimeFingerprints: runtime });
assert.deepEqual(deterministicLeft, deterministicRight, "metric reproduction must be byte-stable for identical inputs");

console.log("Whole-writing G2 corpus regression passed: four 400-case packages, blinded packets, span/variety checks, fail-closed label provenance, deterministic metrics, and Wilson bounds.");
