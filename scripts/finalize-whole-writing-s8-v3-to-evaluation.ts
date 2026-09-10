import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const ROOT = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const REPORT_PATH = "reports/s8-v3-to-too-two/TO_TOO_TWO.evaluation.json";
const PRE_EVALUATION_PATH = "dispositions/s8-v3-to-too-two.evaluation-pending.blocked.json";
const EXPECTED_REPORT_SHA256 = "a025840591313b617879a7848f626c9409fb086abb795ea05204989be9e72d8e";
const EXPECTED_REPORT_FINGERPRINT = "c048721a7e9f8674e7a03d36906bc9db30fd740626fe7da0e3913932fe08a04f";
const REPEAT_STDOUT_SHA256 = "8d62e308833194f0e3e6a2f81e9f6d050c3581679320f22eeffb44eee74b242e";

function sha256(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }

function main() {
  const write = process.argv.includes("--write");
  const reportBytes = readFileSync(join(ROOT, REPORT_PATH));
  assert.equal(sha256(reportBytes), EXPECTED_REPORT_SHA256);
  const report = JSON.parse(reportBytes.toString("utf8"));
  const preEvaluation = JSON.parse(readFileSync(join(ROOT, PRE_EVALUATION_PATH), "utf8"));
  assert.equal(report.disposition, "BLOCKED");
  assert.equal(report.reportFingerprint, EXPECTED_REPORT_FINGERPRINT);
  assert.equal(report.releaseFingerprint, preEvaluation.exactRelease.manifestFingerprint);
  assert.equal(report.corpusFingerprint, preEvaluation.evidence.corpusFingerprint);
  assert.equal(report.findings.length, 43);
  assert.equal(new Set(report.findings.map((finding: { caseId: string }) => finding.caseId)).size, 30);

  const repeatabilityCore = { schemaVersion: 1, family: "TO_TOO_TWO", runCount: 2, governedReportWrittenAfterComparison: true, firstRunStdoutSha256: REPEAT_STDOUT_SHA256, secondRunStdoutSha256: REPEAT_STDOUT_SHA256, firstRunReportFingerprint: report.reportFingerprint, secondRunReportFingerprint: report.reportFingerprint, byteIdenticalOutput: true, reportSha256: EXPECTED_REPORT_SHA256 };
  const repeatability = { ...repeatabilityCore, repeatabilityFingerprint: ordinaryEvaluationFingerprint(repeatabilityCore) };
  const dispositionCore = { schemaVersion: 1, family: "TO_TOO_TWO", disposition: "BLOCKED", blockerType: "ANALYSER_BEHAVIOUR", exactRelease: preEvaluation.exactRelease, evidence: { ...preEvaluation.evidence, reportFingerprint: report.reportFingerprint, reportSha256: EXPECTED_REPORT_SHA256, repeatabilityFingerprint: repeatability.repeatabilityFingerprint }, humanWorkflow: preEvaluation.humanWorkflow, coverage: preEvaluation.coverage, failedGates: report.issues, failedCases: report.findings, metrics: report.metrics, byConstruction: report.byConstruction, bySubtype: report.bySubtype, repeatability, evaluatorPolicyObservation: { authorizedUnsupportedSentinel: "not_applicable/not_applicable", evaluatorReportedAdditionalGates: ["TOP_LEVEL_QUOTA_FAILED:not_applicable", "SUBTYPE_QUOTA_FAILED:not_applicable"], handling: "Preserved exactly; no analyser, label or evaluator modification was made after holdout exposure." }, g2Compatibility: "PRESERVED_SEPARATELY_NOT_POOLED", analyserBehaviour: "FAILED_FROZEN_HOLDOUT_GATES", familyDeliveryRemainsDisabled: true, publicationPerformed: false, selectionPerformed: false, approvalEventCreated: false, activationPerformed: false };
  const disposition = { ...dispositionCore, dispositionFingerprint: ordinaryEvaluationFingerprint(dispositionCore) };
  const outputs = new Map<string, string>([
    ["repeatability/TO_TOO_TWO.repeatability.json", `${JSON.stringify(repeatability, null, 2)}\n`],
    ["dispositions/s8-v3-to-too-two.evaluation.blocked.json", `${JSON.stringify(disposition, null, 2)}\n`],
  ]);
  for (const [relativePath, content] of outputs) {
    const path = join(ROOT, relativePath);
    if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    else assert.equal(readFileSync(path, "utf8"), content, `${relativePath}: final evaluation evidence differs`);
  }
  console.log(JSON.stringify({ disposition: disposition.disposition, reportFingerprint: report.reportFingerprint, reportSha256: EXPECTED_REPORT_SHA256, repeatabilityFingerprint: repeatability.repeatabilityFingerprint, dispositionFingerprint: disposition.dispositionFingerprint, failedFindings: report.findings.length, uniqueFailedCases: new Set(report.findings.map((finding: { caseId: string }) => finding.caseId)).size, wroteArtifacts: write }, null, 2));
}

main();
