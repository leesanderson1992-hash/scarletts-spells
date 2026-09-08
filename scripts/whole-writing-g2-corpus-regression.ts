import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  validatePrimaryLabels,
  validateSecondaryReviews,
  wilsonLowerBound,
  type AuthorProposal,
  type CandidateCase,
  type IndependentLabel,
  type SecondaryReview,
} from "./lib/whole-writing-g2-corpus";
import { parseCsv, serialiseCsv } from "./lib/deterministic-csv";
import { G2_ADJUDICATION_ANSWER_HEADERS, G2_ADJUDICATION_CSV_HEADERS } from "./lib/whole-writing-g2-adjudication-csv";
import { G2_CSV_ANSWER_HEADERS, G2_CSV_HEADERS, G2_CSV_PACKET_EXPORT_VERSION } from "./lib/whole-writing-g2-csv";

const repositoryRoot = resolve(import.meta.dirname, "..");
const root = join(repositoryRoot, "data/whole-writing/g2-context-family-corpora");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const manifestBody = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "packageFingerprint"));
assert.equal(recordFingerprint(manifestBody), manifest.packageFingerprint, "package manifest must be immutable");
assert.equal(manifest.packageVersion, G2_PACKAGE_VERSION);
assert.deepEqual(manifest.runtime, runtimeFingerprints(repositoryRoot), "runtime dependencies remain exact");
const csvManifest = JSON.parse(readFileSync(join(root, "packets-csv", "manifest.json"), "utf8"));
const csvManifestBody = Object.fromEntries(Object.entries(csvManifest).filter(([key]) => key !== "exportFingerprint"));
assert.equal(recordFingerprint(csvManifestBody), csvManifest.exportFingerprint, "CSV export manifest must be immutable");
assert.equal(csvManifest.exportVersion, G2_CSV_PACKET_EXPORT_VERSION);
assert.equal(csvManifest.sourcePackageFingerprint, manifest.packageFingerprint, "CSV export must derive from the locked governed package");
const csvRoundTripFixture = [{ first: "comma, quote \"kept\"", second: "line one\nline two" }];
assert.deepEqual(parseCsv(serialiseCsv(["first", "second"], csvRoundTripFixture)).rows, csvRoundTripFixture, "CSV parser must preserve quoted commas, quotes and newlines");

const secondPersonCsvPath = join(root, "packets-csv", "THERE_THEIR_THEYRE.second-person-adjudication.csv");
if (existsSync(secondPersonCsvPath)) {
  const content = readFileSync(secondPersonCsvPath, "utf8");
  const parsed = parseCsv(content);
  assert.deepEqual(parsed.headers, [...G2_ADJUDICATION_CSV_HEADERS]);
  assert.equal(parsed.rows.length, 20, "second-person packet must contain only the 20 substantive disagreements");
  assert.equal(serialiseCsv(G2_ADJUDICATION_CSV_HEADERS, parsed.rows), content, "second-person CSV serialization must be deterministic");
  assert(parsed.rows.every((row) => G2_ADJUDICATION_ANSWER_HEADERS.every((header) => row[header] === "")), "second-person adjudication answers must be blank");
  assert(parsed.rows.every((row) => row.primary_labeler_id === "Katherine Sanderson"), "primary human attribution must be retained");
  for (const forbidden of ["prediction", "proposal", "gold", "approval", "reference_answer"]) {
    assert(!parsed.headers.some((header) => header.includes(forbidden)), `second-person packet must not expose ${forbidden}`);
  }
}

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
  for (const [packetLabel, governedPacket] of [["a", packetA], ["b", packetB]] as const) {
    const csvContent = readFileSync(join(root, "packets-csv", `${family}.labeler-${packetLabel}.csv`), "utf8");
    const csv = parseCsv(csvContent);
    assert.deepEqual(csv.headers, [...G2_CSV_HEADERS]);
    assert.equal(csv.rows.length, 400);
    assert.equal(serialiseCsv(G2_CSV_HEADERS, csv.rows), csvContent, `${family} CSV serialization must be deterministic`);
    assert.deepEqual(csv.rows.map((row) => row.case_id), governedPacket.map((row) => row.caseId));
    for (let index = 0; index < csv.rows.length; index += 1) {
      const row = csv.rows[index];
      const governed = governedPacket[index];
      assert.equal(row.family, governed.family);
      assert.equal(row.source_text, governed.sourceText);
      assert.equal(row.focus_surface, governed.focusSurface);
      assert.equal(row.start_utf16, String(governed.startUtf16));
      assert.equal(row.end_utf16, String(governed.endUtf16));
      assert(G2_CSV_ANSWER_HEADERS.every((header) => row[header] === ""), `${family} ${packetLabel} answers must be blank`);
      for (const forbidden of ["prediction", "proposal", "other_label", "adjudication", "gold", "reference_answer", "candidate_fingerprint", "release_id"]) assert(!csv.headers.some((header) => header.includes(forbidden)));
    }
  }
  const empty = buildFinalGold(candidates, [], [], []);
  assert.equal(empty.gold.length, 0);
  assert.equal(empty.issues.filter((issue) => issue.code === "PRIMARY_LABEL_COUNT").length, 400, "unlabelled release fails closed by case");
  assert.equal(empty.issues.filter((issue) => issue.code === "SECONDARY_REVIEW_COUNT").length, 400, "unreviewed release fails closed by case");
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
    packetId: `${G2_PACKAGE_VERSION}:${candidate.family}:LABEL_PACKET_A`,
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
const first = label("Katherine Sanderson", "VALID", null);
assert.deepEqual(validatePrimaryLabels([candidate], [first]), []);
assert(validatePrimaryLabels([candidate], [first, first]).some((issue) => issue.code === "PRIMARY_LABEL_COUNT"));
const mutated = { ...first, rationale: "Changed after import." };
assert(validatePrimaryLabels([candidate], [first, mutated]).some((issue) => issue.code === "POST_HOC_LABEL_MUTATION"));
function review(disposition: "AGREE" | "DISAGREE", classification: IndependentLabel["classification"], alternative: string | null): SecondaryReview {
  const body = {
    schemaVersion: 1 as const,
    reviewId: `test:review:${candidate.caseId}`,
    caseId: candidate.caseId,
    family: candidate.family,
    reviewerId: "CODEX_NON_GOLD_REVIEW",
    reviewerKind: "AI_NON_GOLD_REVIEW" as const,
    reviewedAt: "2026-09-08T00:00:00.000Z",
    primaryLabelFingerprint: first.labelFingerprint,
    disposition,
    classification,
    intendedAlternative: alternative,
    supportedConstructionStatus: "SUPPORTED" as const,
    rationale: "Non-gold review fixture.",
    releaseId: candidate.releaseId,
    familyManifestFingerprint: candidate.familyManifestFingerprint,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
    candidateFingerprint: candidate.candidateFingerprint,
  };
  return { ...body, reviewFingerprint: recordFingerprint(body) };
}
const agreedReview = review("AGREE", "VALID", null);
assert.deepEqual(validateSecondaryReviews([candidate], [first], [agreedReview]), []);
const disagreement = buildFinalGold([candidate], [first], [review("DISAGREE", "INVALID", "their")], []);
assert(disagreement.issues.some((issue) => issue.code === "ADJUDICATION_REQUIRED"));

const runtime = runtimeFingerprints(repositoryRoot);
const deterministicLeft = evaluateFamily({ candidates: [candidate], gold: [], prerequisiteIssues: [], expectedRuntimeFingerprints: runtime, actualRuntimeFingerprints: runtime });
const deterministicRight = evaluateFamily({ candidates: [candidate], gold: [], prerequisiteIssues: [], expectedRuntimeFingerprints: runtime, actualRuntimeFingerprints: runtime });
assert.deepEqual(deterministicLeft, deterministicRight, "metric reproduction must be byte-stable for identical inputs");

console.log("Whole-writing G2 corpus regression passed: four 400-case packages, blinded and disagreement CSVs, span/variety checks, fail-closed label/review provenance, deterministic metrics, and Wilson bounds.");
