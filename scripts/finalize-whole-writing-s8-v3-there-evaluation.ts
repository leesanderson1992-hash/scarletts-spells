import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const REPORT_PATH = "reports/s8-v3-there-their-theyre/THERE_THEIR_THEYRE.evaluation.json";
const PRE_EVALUATION_DISPOSITION_PATH = "dispositions/s8-v3-there-their-theyre.primary-label-in-progress.blocked.json";
const EXPECTED_REPORT_SHA256 = "259196afcc4b098072c2b341ce3d64edf8715b0366f2a3cdd164c5f6b92e7baf";
const EXPECTED_REPORT_FINGERPRINT = "ba102e584795502dccbaffc9095f8e55fcb7aa4807b9a79533d62a5685463f84";

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function main() {
  const write = process.argv.includes("--write");
  const reportBytes = readFileSync(join(ROOT, REPORT_PATH));
  assert.equal(sha256(reportBytes), EXPECTED_REPORT_SHA256);
  const report = JSON.parse(reportBytes.toString("utf8"));
  const preEvaluation = JSON.parse(readFileSync(join(ROOT, PRE_EVALUATION_DISPOSITION_PATH), "utf8"));
  assert.equal(report.disposition, "BLOCKED");
  assert.equal(report.reportFingerprint, EXPECTED_REPORT_FINGERPRINT);
  assert.equal(report.releaseFingerprint, preEvaluation.exactRelease.manifestFingerprint);
  assert.equal(report.corpusFingerprint, preEvaluation.evidence.corpusFingerprint);

  const repeatabilityCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    runCount: 2,
    governedReportWrittenAfterComparison: true,
    firstRunReportFingerprint: report.reportFingerprint,
    secondRunReportFingerprint: report.reportFingerprint,
    byteIdenticalOutput: true,
    reportSha256: EXPECTED_REPORT_SHA256,
  };
  const repeatability = {
    ...repeatabilityCore,
    repeatabilityFingerprint: ordinaryEvaluationFingerprint(repeatabilityCore),
  };
  const dispositionCore = {
    schemaVersion: 1,
    family: "THERE_THEIR_THEYRE",
    disposition: "BLOCKED",
    blockerType: "ANALYSER_BEHAVIOUR",
    exactRelease: preEvaluation.exactRelease,
    evidence: {
      ...preEvaluation.evidence,
      reportFingerprint: report.reportFingerprint,
      reportSha256: EXPECTED_REPORT_SHA256,
      repeatabilityFingerprint: repeatability.repeatabilityFingerprint,
    },
    humanWorkflow: preEvaluation.humanWorkflow,
    coverage: preEvaluation.coverage,
    failedGates: report.issues,
    failedCases: report.findings,
    metrics: report.metrics,
    byConstruction: report.byConstruction,
    bySubtype: report.bySubtype,
    repeatability,
    g2Compatibility: "PRESERVED_SEPARATELY_NOT_POOLED",
    analyserBehaviour: "FAILED_FROZEN_HOLDOUT_GATES",
    familyDeliveryRemainsDisabled: true,
    publicationPerformed: false,
    selectionPerformed: false,
    approvalEventCreated: false,
    activationPerformed: false,
  };
  const disposition = {
    ...dispositionCore,
    dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore),
  };
  const outputs = new Map([
    ["repeatability/THERE_THEIR_THEYRE.repeatability.json", `${JSON.stringify(repeatability, null, 2)}\n`],
    ["dispositions/s8-v3-there-their-theyre.evaluation.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) {
    const path = join(ROOT, relativePath);
    if (write) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    } else {
      assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: final evidence differs`);
    }
  }
  console.log(JSON.stringify({
    disposition: disposition.disposition,
    reportFingerprint: report.reportFingerprint,
    reportSha256: EXPECTED_REPORT_SHA256,
    repeatabilityFingerprint: repeatability.repeatabilityFingerprint,
    dispositionFingerprint: disposition.dispositionFingerprint,
    failedCaseFindings: report.findings.length,
    uniqueFailedCases: new Set(report.findings.map((finding: { caseId: string }) => finding.caseId)).size,
    wroteArtifacts: write,
  }, null, 2));
}

main();
