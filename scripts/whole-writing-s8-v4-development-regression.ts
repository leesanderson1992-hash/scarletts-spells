import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { readJsonLines, sha256 } from "./lib/whole-writing-g2-corpus";
import { evaluateOrdinaryWritingV3, type OrdinaryWritingV3Case, type OrdinaryWritingV3Gold } from "./lib/whole-writing-v3-ordinary-evaluation";

const root = process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation";
const outputRoot = join(root, "development-analysis", "s8-v4-structural-adapter");
const write = process.argv.includes("--write");
type G2Case = { caseId: string; sourceText: string; startUtf16: number; endUtf16: number; protectedSetTags: string[] };
type G2Gold = { caseId: string; classification: "VALID" | "INVALID" | "UNCERTAIN"; expectedAlternative: string | null; supportedConstructionStatus: "SUPPORTED" | "UNSUPPORTED" };

function key(input: { fieldText: string; startUtf16: number; endUtf16: number }) {
  return fingerprint([input.fieldText, input.startUtf16, input.endUtf16]);
}

const outputs = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => {
  const family = candidate.manifest.familyKey;
  const candidatePath = join(root, "candidates", `${family}.jsonl`);
  const goldPath = join(root, "gold", `${family}.final-gold.jsonl`);
  const cases = readJsonLines<OrdinaryWritingV3Case>(candidatePath);
  const gold = readJsonLines<OrdinaryWritingV3Gold>(goldPath);
  const inputs = cases.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }));
  const g2Cases = readJsonLines<G2Case>(join("data/whole-writing/g2-context-family-corpora/candidates", `${family}.jsonl`));
  const g2Gold = readJsonLines<G2Gold>(join("data/whole-writing/g2-context-family-corpora/gold", `${family}.final-gold.jsonl`));
  const g2Inputs = g2Cases.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }));
  const allDetails = candidate.analyseBatch([...inputs, ...g2Inputs]);
  assert.equal(allDetails.length, cases.length + g2Cases.length);
  const details = allDetails.slice(0, cases.length);
  const g2Details = allDetails.slice(cases.length);
  const decisions = new Map(details.map((detail, index) => [key(inputs[index]), detail.decision]));
  const corpusFingerprint = sha256(Buffer.concat([readFileSync(candidatePath), readFileSync(goldPath)]));
  const report = evaluateOrdinaryWritingV3({
    family, cases, gold,
    analyser: (input) => decisions.get(key(input)) ?? null,
    releaseFingerprint: candidate.fingerprint,
    corpusFingerprint,
  });
  const goldByCase = new Map(gold.map((row) => [row.caseId, row]));
  const residuals = cases.flatMap((row, index) => {
    const finalGold = goldByCase.get(row.caseId)!;
    const decision = details[index].decision!;
    const reasons: string[] = [];
    if (decision.status === "INVALID" && !(finalGold.classification === "INVALID" && decision.alternativeMember === finalGold.intendedAlternative)) reasons.push("WRONG_OR_UNSUPPORTED_ALTERNATIVE");
    if (finalGold.classification !== "VALID" && decision.status === "VALID") reasons.push("FALSE_VALID");
    if (row.protectedSetTags.length && decision.status !== "UNCERTAIN") reasons.push("PROTECTED_POLICY_VIOLATION");
    if (finalGold.classification === "INVALID" && finalGold.supportedConstruction && !(decision.status === "INVALID" && decision.alternativeMember === finalGold.intendedAlternative)) reasons.push("MISSED_SUPPORTED_MISUSE");
    if (finalGold.classification === "VALID" && decision.status !== "VALID") reasons.push("MISSED_VALID_USE");
    if (!reasons.length) return [];
    let rootCause = "family_rule";
    if (row.protectedSetTags.length && finalGold.classification === "VALID" && decision.status === "UNCERTAIN") rootCause = "evaluator_contract";
    else if (decision.reasonCode.includes("ALIGNMENT")) rootCause = "parser_alignment";
    else if (decision.reasonCode.includes("COMPETING")) rootCause = "structural_parser_ambiguity";
    else if (decision.reasonCode.includes("ADAPTER")) rootCause = "implementation_defect";
    else if (decision.reasonCode.includes("PROTECTED")) rootCause = "protected_policy";
    else if (decision.reasonCode.includes("UNSUPPORTED")) rootCause = finalGold.supportedConstruction ? "family_rule" : "unsupported_construction";
    return [{ family, caseId: row.caseId, declaredConstruction: row.declaredConstruction, declaredSubtype: row.declaredSubtype, protectedSetTags: row.protectedSetTags, gold: finalGold.classification, intendedAlternative: finalGold.intendedAlternative, decision, reasons, rootCause }];
  });
  const v3 = JSON.parse(readFileSync(join(root, "reports", candidate.manifest.releaseKey.replace("s8-v4", "s8-v3"), `${family}.evaluation.json`), "utf8"));
  const g2GoldByCase = new Map(g2Gold.map((row) => [row.caseId, row]));
  const g2Rows = g2Cases.map((row, index) => ({ row, gold: g2GoldByCase.get(row.caseId)!, decision: g2Details[index].decision! }));
  const g2Suggestions = g2Rows.filter(({ decision }) => decision.status === "INVALID");
  const g2CorrectSuggestions = g2Suggestions.filter(({ gold: g, decision }) => g.classification === "INVALID" && decision.alternativeMember === g.expectedAlternative).length;
  const g2SupportedInvalid = g2Rows.filter(({ gold: g }) => g.classification === "INVALID" && g.supportedConstructionStatus === "SUPPORTED");
  const g2Metrics = {
    cases: g2Rows.length,
    precision: g2Suggestions.length ? g2CorrectSuggestions / g2Suggestions.length : 0,
    supportedRecall: g2SupportedInvalid.length ? g2SupportedInvalid.filter(({ gold: g, decision }) => decision.status === "INVALID" && decision.alternativeMember === g.expectedAlternative).length / g2SupportedInvalid.length : 0,
    validRecognition: g2Rows.filter(({ gold: g }) => g.classification === "VALID").length ? g2Rows.filter(({ gold: g, decision }) => g.classification === "VALID" && decision.status === "VALID").length / g2Rows.filter(({ gold: g }) => g.classification === "VALID").length : 0,
    falseValid: g2Rows.filter(({ gold: g, decision }) => g.classification !== "VALID" && decision.status === "VALID").length,
    wrongAlternatives: g2Suggestions.length - g2CorrectSuggestions,
    protectedFailures: g2Rows.filter(({ row, decision }) => row.protectedSetTags.length > 0 && decision.status !== "UNCERTAIN").length,
  };
  const contractConflicts = cases.filter((row) => row.protectedSetTags.length > 0 && goldByCase.get(row.caseId)?.classification === "VALID").map((row) => ({ caseId: row.caseId, protectedSetTags: row.protectedSetTags, analyserRequiredByProtection: "UNCERTAIN", evaluatorValidRecognitionRequires: "VALID" }));
  const decisionCounts = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((status) => [status, details.filter((detail) => detail.decision?.status === status).length]));
  const unprotectedGoldValid = cases.filter((row) => goldByCase.get(row.caseId)?.classification === "VALID" && row.protectedSetTags.length === 0);
  const conflictAdjustedValidRecognition = unprotectedGoldValid.length ? unprotectedGoldValid.filter((row) => decisions.get(key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }))?.status === "VALID").length / unprotectedGoldValid.length : 0;
  return { family, releaseKey: candidate.manifest.releaseKey, releaseId: candidate.manifest.releaseId, manifestFingerprint: candidate.fingerprint, decisionCounts, report, conflictAdjustedValidRecognition, v3: { releaseFingerprint: v3.releaseFingerprint, metrics: v3.metrics, byConstruction: v3.byConstruction, bySubtype: v3.bySubtype }, g2Metrics, contractConflicts, residuals };
});

const comparisonCore = {
  schemaVersion: 1,
  purpose: "development_regression_only_not_approval_evidence",
  frozenEvaluatorUnchanged: true,
  releasesDefaultOff: true,
  families: outputs.map(({ residuals, ...output }) => ({
    ...output,
    residualRootCauses: Object.fromEntries(["parser_alignment", "structural_parser_ambiguity", "parser_misleading_output", "family_rule", "protected_policy", "lexical_governance", "semantic_ambiguity", "evaluator_contract", "unsupported_construction", "implementation_defect"].map((cause) => [cause, residuals.filter((row) => row.rootCause === cause).length])),
  })),
};
const comparison = { ...comparisonCore, comparisonFingerprint: fingerprint(comparisonCore) };
if (write) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  writeFileSync(join(outputRoot, "residual-failures.jsonl"), `${outputs.flatMap((output) => output.residuals).map((row) => JSON.stringify(row)).join("\n")}\n`);
  writeFileSync(join(outputRoot, "evaluator-contract-conflicts.json"), `${JSON.stringify({ schemaVersion: 1, evaluatorVersion: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_EVALUATION_V3_2026_09_09", conflicts: outputs.flatMap((output) => output.contractConflicts) }, null, 2)}\n`);
  for (const output of outputs) writeFileSync(join(outputRoot, `${output.family}.development-regression.json`), `${JSON.stringify(output.report, null, 2)}\n`);
}
console.log(JSON.stringify(comparison, null, 2));
if (outputs.some((output) => output.report.metrics.falseValid > 0 || output.report.metrics.wrongAlternatives > 0 || output.report.metrics.protectedFailures > 0)) process.exitCode = 1;
