import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { CONTEXT_FAMILY_MANIFESTS, type ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import {
  FAMILY_RELEASES,
  G2_LIMITS,
  G2_PACKAGE_VERSION,
  G2_POLICY_VERSION,
  buildFinalGold,
  corpusVariety,
  evaluateFamily,
  readJsonLines,
  recordFingerprint,
  runtimeFingerprints,
  sha256,
  validateCandidate,
  type Adjudication,
  type CandidateCase,
  type FinalGold,
  type IndependentLabel,
  type SecondaryReview,
  type ValidationIssue,
} from "./lib/whole-writing-g2-corpus";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageRoot = resolve(process.env.G2_CORPUS_ROOT ?? join(repositoryRoot, "data/whole-writing/g2-context-family-corpora"));
const manifestPath = join(packageRoot, "manifest.json");
const packageManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  packageVersion: string;
  packageFingerprint: string;
  runtime: ReturnType<typeof runtimeFingerprints>;
  families: Record<string, { corpusFingerprint: string }>;
  [key: string]: unknown;
};
const manifestWithoutFingerprint = Object.fromEntries(Object.entries(packageManifest).filter(([key]) => key !== "packageFingerprint"));
if (recordFingerprint(manifestWithoutFingerprint) !== packageManifest.packageFingerprint) throw new Error("Package manifest fingerprint mismatch");
if (packageManifest.packageVersion !== G2_PACKAGE_VERSION) throw new Error("Package manifest version mismatch");

function attributedRecordsIn<T extends Record<string, unknown>>(
  directory: string,
  family: ContextFamilyKey,
  fingerprintKey: string,
): { records: T[]; issues: ValidationIssue[] } {
  if (!existsSync(directory)) return { records: [], issues: [] };
  const issues: ValidationIssue[] = [];
  const records: T[] = [];
  for (const name of readdirSync(directory).filter((item) => item.startsWith(`${family}.`) && item.endsWith(".jsonl")).sort()) {
    const path = join(directory, name);
    const content = readFileSync(path, "utf8");
    const fileRecords = readJsonLines<T>(path);
    records.push(...fileRecords);
    const receiptPath = `${path}.receipt.json`;
    if (!existsSync(receiptPath)) {
      issues.push({ code: "IMPORT_RECEIPT_MISSING", message: `${name} lacks its append-only import receipt` });
      continue;
    }
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    const body = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "receiptFingerprint"));
    if (recordFingerprint(body) !== receipt.receiptFingerprint) issues.push({ code: "IMPORT_RECEIPT_FINGERPRINT_MISMATCH", message: `${name} receipt fingerprint differs` });
    if (receipt.dataFile !== name || receipt.dataSha256 !== sha256(content)) issues.push({ code: "POST_HOC_IMPORT_MUTATION", message: `${name} content differs from its import receipt` });
    if (receipt.recordCount !== fileRecords.length) issues.push({ code: "IMPORT_RECEIPT_COUNT_MISMATCH", message: `${name} receipt count differs` });
    const expectedFingerprints = fileRecords.map((record) => record[fingerprintKey]);
    if (JSON.stringify(receipt.recordFingerprints) !== JSON.stringify(expectedFingerprints)) issues.push({ code: "IMPORT_RECEIPT_RECORD_MISMATCH", message: `${name} record fingerprints differ from receipt` });
  }
  return { records, issues };
}

function packetLeakageIssues(family: ContextFamilyKey): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const suffix of ["a", "b"]) {
    const path = join(packageRoot, "packets", `${family}.label-packet-${suffix}.jsonl`);
    const packet = readJsonLines<Record<string, unknown>>(path);
    for (const row of packet) {
      for (const forbidden of ["proposedClassification", "proposedExpectedAlternative", "analyserResult", "proposedApproval", "otherLabel"]) {
        if (forbidden in row) issues.push({ code: "BLINDING_LEAK", message: `${basename(path)} exposes ${forbidden}`, caseId: String(row.caseId) });
      }
    }
  }
  return issues;
}

mkdirSync(join(packageRoot, "reports"), { recursive: true });
mkdirSync(join(packageRoot, "release-artifacts"), { recursive: true });
const actualRuntime = runtimeFingerprints(repositoryRoot);
let passCount = 0;

for (const familyManifest of CONTEXT_FAMILY_MANIFESTS) {
  const family = familyManifest.familyKey;
  const candidates = readJsonLines<CandidateCase>(join(packageRoot, "candidates", `${family}.jsonl`));
  const labelImport = attributedRecordsIn<IndependentLabel & Record<string, unknown>>(join(packageRoot, "labels"), family, "labelFingerprint");
  const reviewImport = attributedRecordsIn<SecondaryReview & Record<string, unknown>>(join(packageRoot, "reviews"), family, "reviewFingerprint");
  const adjudicationImport = attributedRecordsIn<Adjudication & Record<string, unknown>>(join(packageRoot, "adjudications"), family, "adjudicationFingerprint");
  const goldImport = attributedRecordsIn<FinalGold & Record<string, unknown>>(join(packageRoot, "gold"), family, "goldFingerprint");
  const labels = labelImport.records;
  const reviews = reviewImport.records;
  const adjudications = adjudicationImport.records;
  const lockedGold = goldImport.records;
  const prerequisiteIssues: ValidationIssue[] = candidates.flatMap(validateCandidate);
  prerequisiteIssues.push(...labelImport.issues, ...reviewImport.issues, ...adjudicationImport.issues, ...goldImport.issues);
  const corpusFingerprint = recordFingerprint(candidates.map((item) => item.candidateFingerprint));
  if (corpusFingerprint !== packageManifest.families[family]?.corpusFingerprint) prerequisiteIssues.push({ code: "CORPUS_FINGERPRINT_MISMATCH", message: "candidate set does not match package manifest" });
  const variety = corpusVariety(candidates);
  if (variety.exactDuplicates.length) prerequisiteIssues.push({ code: "EXACT_DUPLICATES", message: `${variety.exactDuplicates.length} exact duplicate pairs found` });
  prerequisiteIssues.push(...packetLeakageIssues(family));
  const { gold: derivedGold, issues: goldIssues } = buildFinalGold(candidates, labels, reviews, adjudications);
  prerequisiteIssues.push(...goldIssues);
  for (const gold of lockedGold) {
    if (recordFingerprint(gold, "goldFingerprint") !== gold.goldFingerprint) prerequisiteIssues.push({ code: "GOLD_FINGERPRINT_MISMATCH", message: "locked gold fingerprint is stale or invalid", caseId: gold.caseId });
  }
  if (lockedGold.length !== candidates.length) prerequisiteIssues.push({ code: "LOCKED_GOLD_INCOMPLETE", message: `expected ${candidates.length} locked gold records, found ${lockedGold.length}` });
  if (JSON.stringify(lockedGold) !== JSON.stringify(derivedGold)) prerequisiteIssues.push({ code: "LOCKED_GOLD_DERIVATION_MISMATCH", message: "locked gold does not exactly reproduce from primary labels, non-gold reviews and adjudications" });
  const evaluation = evaluateFamily({
    candidates,
    gold: lockedGold,
    prerequisiteIssues,
    expectedRuntimeFingerprints: packageManifest.runtime,
    actualRuntimeFingerprints: actualRuntime,
  });
  if (evaluation.disposition === "PASS") passCount += 1;
  const report = {
    schemaVersion: 1,
    reportVersion: `${G2_PACKAGE_VERSION}:${family}:EVALUATION_V1`,
    evaluationMode: "LOCAL_DETERMINISTIC_RELEASE_EVALUATION",
    disposition: evaluation.disposition,
    policyVersion: G2_POLICY_VERSION,
    packageVersion: G2_PACKAGE_VERSION,
    family,
    release: {
      ...FAMILY_RELEASES[family],
      analyserVersion: actualRuntime.analyserVersion,
      analyserSourceSha256: actualRuntime.analyserSourceSha256,
      ruleFingerprint: actualRuntime.familyRuleFingerprints[family],
      registryVersion: actualRuntime.registryVersion,
      registryFingerprint: actualRuntime.registryFingerprint,
      corpusVersion: actualRuntime.corpusVersion,
      corpusFingerprint,
      manifestFingerprint: familyManifest.fingerprint,
      releaseMigrationSha256: actualRuntime.releaseMigrationSha256,
    },
    provenance: {
      documentationAuthorityBaseline: "f7865ab9edab410a3a6f5aba6965457705319b5f",
      candidateCount: candidates.length,
      primaryHumanLabelCount: labels.length,
      nonGoldReviewCount: reviews.length,
      reviewDisagreementCount: reviews.filter((review) => review.disposition === "DISAGREE").length,
      adjudicationCount: adjudications.length,
      finalGoldCount: lockedGold.length,
      authorProposalsUsedAsGold: false,
    },
    variety,
    metrics: evaluation,
  };
  const reportFingerprint = recordFingerprint(report);
  writeFileSync(join(packageRoot, "reports", `${family}.evaluation.json`), `${JSON.stringify({ ...report, reportFingerprint }, null, 2)}\n`);
  const approvalIdentity = `g2:${G2_PACKAGE_VERSION}:${family}:${evaluation.evaluationFingerprint}`;
  const releaseArtifact = evaluation.disposition === "PASS"
    ? {
      schemaVersion: 1,
      artifactVersion: `${G2_PACKAGE_VERSION}:${family}:APPROVAL_CANDIDATE_V1`,
      status: "PASS_REVIEWABLE_NOT_PUBLISHED",
      family,
      approvalIdentity,
      approvalEventInterface: {
        environment_key: "LOCAL_REVIEW_ONLY_NOT_FOR_INSERT",
        family_key: family,
        release_id: FAMILY_RELEASES[family].releaseId,
        action: "approved",
        corpus_version: actualRuntime.corpusVersion,
        evaluation_fingerprint: evaluation.evaluationFingerprint,
        quality_limits: G2_LIMITS,
        evaluation_metrics: evaluation,
        authority_reference: approvalIdentity,
        approved_by: "SEPARATELY_AUTHORISED_REVIEWER_UUID_REQUIRED",
      },
      publicationPerformed: false,
      parentDeliveryEnabled: false,
    }
    : {
      schemaVersion: 1,
      artifactVersion: `${G2_PACKAGE_VERSION}:${family}:BLOCKED_V1`,
      status: "BLOCKED",
      family,
      approvalIdentity: null,
      exactRelease: report.release,
      metrics: evaluation,
      nextAction: labels.length < candidates.length || reviews.length < candidates.length
        ? "Obtain one complete primary human label set and one complete non-gold secondary review, then adjudicate every flagged substantive disagreement and rerun the deterministic evaluator."
        : "Review exact failed cases and propose a later S8 rule or declared-scope release; do not change gold truth or current runtime merely to pass.",
      publicationPerformed: false,
      parentDeliveryEnabled: false,
      confirmation: "No family activation, runtime policy, database, staging, Production, context_review_enabled, or family delivery-control change was performed.",
    };
  writeFileSync(join(packageRoot, "release-artifacts", `${family}.${evaluation.disposition === "PASS" ? "approval-candidate" : "blocked"}.json`), `${JSON.stringify({ ...releaseArtifact, artifactFingerprint: recordFingerprint(releaseArtifact) }, null, 2)}\n`);
  console.log(`${family}: ${evaluation.disposition}; ${labels.length}/${candidates.length} primary labels; ${reviews.length}/${candidates.length} reviews; ${lockedGold.length}/${candidates.length} final gold; ${evaluation.blockingFailureCount} blocking failures; ${evaluation.monitoringSupportedMissCount} monitored supported misses.`);
}

if (passCount !== CONTEXT_FAMILY_MANIFESTS.length) {
  console.error(`G2 evaluation blocked: ${passCount}/${CONTEXT_FAMILY_MANIFESTS.length} family approval candidates passed.`);
  process.exitCode = 2;
} else {
  console.log("All four G2 family approval candidates passed. No approval event was published.");
}
