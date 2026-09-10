import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { analyseThereContextV3Detailed } from "../../lib/writing-engine/whole-writing/context-there-v3";
import { analyseToContextV3Detailed } from "../../lib/writing-engine/whole-writing/context-to-v3";

type Family = "THERE_THEIR_THEYRE" | "TO_TOO_TWO";
type Candidate = {
  schemaVersion: number;
  passageId: string;
  caseId: string;
  family: Family;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  declaredConstruction: string;
  declaredSubtype: string;
  primaryFocus: boolean;
  protectedSetTags: string[];
  sourceReference: string;
  authoredBy: string;
  candidateFingerprint: string;
};
type Gold = {
  caseId: string;
  family: Family;
  classification: "VALID" | "INVALID" | "UNCERTAIN";
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  primaryLabelId: string;
  nonGoldReviewId: string;
  adjudicationId: string | null;
  goldFingerprint: string;
};
type Report = {
  reportFingerprint: string;
  releaseFingerprint: string;
  findings: Array<{ caseId: string; reason: string }>;
};

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

const evaluationRoot = resolve(process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation");
const outputPath = resolve(process.argv[2] ?? "/tmp/s8-nlp-eval-codex-20260910/exposed-failures-input.jsonl");
const families: Array<{ family: Family; releaseKey: string }> = [
  { family: "THERE_THEIR_THEYRE", releaseKey: "s8-v3-there-their-theyre" },
  { family: "TO_TOO_TWO", releaseKey: "s8-v3-to-too-two" },
];

const rows = families.flatMap(({ family, releaseKey }) => {
  const candidateRows = readJsonl<Candidate>(join(evaluationRoot, "candidates", `${family}.jsonl`));
  const goldRows = readJsonl<Gold>(join(evaluationRoot, "gold", `${family}.final-gold.jsonl`));
  const report = JSON.parse(readFileSync(join(evaluationRoot, "reports", releaseKey, `${family}.evaluation.json`), "utf8")) as Report;
  const findings = new Map<string, string[]>();
  for (const finding of report.findings) {
    const reasons = findings.get(finding.caseId) ?? [];
    if (!reasons.includes(finding.reason)) reasons.push(finding.reason);
    findings.set(finding.caseId, reasons);
  }
  const gold = new Map(goldRows.map((row) => [row.caseId, row]));
  return candidateRows.flatMap((candidate) => {
    const caseId = candidate.caseId;
    const finalGold = gold.get(caseId);
    assert(candidate, `Missing candidate ${caseId}`);
    assert(finalGold, `Missing gold ${caseId}`);
    const input = { fieldText: candidate.sourceText, startUtf16: candidate.startUtf16, endUtf16: candidate.endUtf16 };
    const v3 = family === "THERE_THEIR_THEYRE" ? analyseThereContextV3Detailed(input) : analyseToContextV3Detailed(input);
    const decision = v3.decision;
    assert(decision, `Missing frozen V3 decision ${caseId}`);
    const failureModes = [...(findings.get(caseId) ?? [])];
    const protectedCase = candidate.protectedSetTags.length > 0;
    if (finalGold.classification === "VALID" && decision.status !== "VALID") failureModes.push("MISSED_VALID_USE");
    if (finalGold.classification === "INVALID" && finalGold.supportedConstruction &&
        !(decision.status === "INVALID" && decision.alternativeMember === finalGold.intendedAlternative)) {
      failureModes.push("MISSED_SUPPORTED_MISUSE");
    }
    if ((finalGold.classification === "UNCERTAIN" || !finalGold.supportedConstruction) && decision.status !== "UNCERTAIN") {
      failureModes.push("FAILED_REQUIRED_ABSTENTION");
    }
    if (protectedCase && finalGold.classification === "VALID") failureModes.push("EVALUATOR_POLICY_CONFLICT_PROTECTED_VALID");
    if (candidate.sourceText.includes("going to look forward to beating")) failureModes.push("REQUESTED_STRUCTURE_DIAGNOSTIC");
    if (failureModes.length === 0) return [];
    return [{
      family,
      releaseKey,
      releaseFingerprint: report.releaseFingerprint,
      reportFingerprint: report.reportFingerprint,
      evaluatorReasons: [...new Set(failureModes)].sort(),
      candidate,
      gold: finalGold,
      frozenV3: v3,
    }];
  });
});

rows.sort((left, right) => left.family.localeCompare(right.family) || left.candidate.caseId.localeCompare(right.candidate.caseId));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
console.log(JSON.stringify({ outputPath, cases: rows.length, byFamily: Object.fromEntries(families.map(({ family }) => [family, rows.filter((row) => row.family === family).length])) }, null, 2));
