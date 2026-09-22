import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import type { ContextInputV4, DetailedContextDecisionV4 } from "../lib/writing-engine/whole-writing/context-family-v4";

type G2Candidate = Readonly<{
  caseId: string; family: string; sourceText: string; focusSurface: string;
  startUtf16: number; endUtf16: number; declaredConstruction: string;
  protectedSetTags: readonly string[];
}>;
type G2Gold = Readonly<{
  caseId: string; classification: "VALID" | "INVALID" | "UNCERTAIN";
  expectedAlternative: string | null; supportedConstructionStatus: "SUPPORTED" | "UNSUPPORTED";
}>;
type Decision = NonNullable<DetailedContextDecisionV4["decision"]>;

const root = "data/whole-writing/g2-context-family-corpora";
const outputRoot = "data/whole-writing/v3-ordinary-writing-evaluation/development-analysis/s8-v4-four-family-baseline";
const write = process.argv.includes("--write");

function lines<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function wilsonLower95(successes: number, total: number) {
  if (!total) return 0;
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  return (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
}
function chunked(
  analyser: (inputs: readonly ContextInputV4[]) => DetailedContextDecisionV4[],
  inputs: readonly ContextInputV4[],
) {
  const output: DetailedContextDecisionV4[] = [];
  // Each request parses every finite counterfactual. Keep the diagnostic batch
  // beneath the adapter's process timeout rather than converting late rows to
  // an artificial analyser residual.
  for (let index = 0; index < inputs.length; index += 25) output.push(...analyser(inputs.slice(index, index + 25)));
  return output;
}
function residualRoot(candidate: G2Candidate, gold: G2Gold, decision: Decision) {
  if (candidate.protectedSetTags.length) return decision.status === "UNCERTAIN" ? "protected_policy" : "protected_policy_violation";
  if (decision.reasonCode.includes("ALIGNMENT")) return "parser_alignment";
  if (decision.reasonCode.includes("ADAPTER") || decision.reasonCode.includes("RESOURCE")) return "implementation_defect";
  if (decision.reasonCode.includes("COMPETING")) return "structural_ambiguity";
  if (decision.reasonCode.includes("SEMANTIC") || decision.reasonCode.includes("PREDICATE_AMBIGUITY")) return "genuine_semantic_ambiguity";
  if (decision.reasonCode.includes("UNSUPPORTED")) return gold.supportedConstructionStatus === "UNSUPPORTED" ? "unsupported_construction" : "family_rule_limitation";
  return "family_rule_limitation";
}

const families = CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => {
  const family = candidate.manifest.familyKey;
  const candidates = lines<G2Candidate>(join(root, "candidates", `${family}.jsonl`));
  const goldByCase = new Map(lines<G2Gold>(join(root, "gold", `${family}.final-gold.jsonl`)).map((gold) => [gold.caseId, gold]));
  const details = chunked(candidate.analyseBatch, candidates.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 })));
  const decisions = details.map((detail) => detail.decision!);
  const rows = candidates.map((candidateRow, index) => ({ candidate: candidateRow, gold: goldByCase.get(candidateRow.caseId)!, decision: decisions[index]! }));
  const suggestions = rows.filter((row) => row.decision.status === "INVALID");
  const correctSuggestions = suggestions.filter((row) => row.gold.classification === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative);
  const supportedInvalid = rows.filter((row) => row.gold.classification === "INVALID" && row.gold.supportedConstructionStatus === "SUPPORTED");
  const recalledInvalid = supportedInvalid.filter((row) => row.decision.status === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative);
  const goldValid = rows.filter((row) => row.gold.classification === "VALID");
  const recognisedValid = goldValid.filter((row) => row.decision.status === "VALID");
  const byConstruction = Object.fromEntries([...new Set(supportedInvalid.map((row) => row.candidate.declaredConstruction))].sort().map((construction) => {
    const denominator = supportedInvalid.filter((row) => row.candidate.declaredConstruction === construction);
    const recalled = denominator.filter((row) => row.decision.status === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative);
    return [construction, { supported: denominator.length, recalled: recalled.length, recall: denominator.length ? recalled.length / denominator.length : 0 }];
  }));
  const failures = rows.flatMap((row) => {
    const correctInvalid = row.decision.status === "INVALID" && row.gold.classification === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative;
    const falseValid = row.gold.classification !== "VALID" && row.decision.status === "VALID";
    const wrongAlternative = row.decision.status === "INVALID" && !correctInvalid;
    const protectedFailure = row.candidate.protectedSetTags.length > 0 && row.decision.status !== "UNCERTAIN";
    const missedValid = row.gold.classification === "VALID" && row.decision.status !== "VALID";
    const missedSupported = row.gold.classification === "INVALID" && row.gold.supportedConstructionStatus === "SUPPORTED" && !correctInvalid;
    if (!falseValid && !wrongAlternative && !protectedFailure && !missedValid && !missedSupported) return [];
    return [{ caseId: row.candidate.caseId, declaredConstruction: row.candidate.declaredConstruction, protectedSetTags: row.candidate.protectedSetTags, gold: row.gold.classification, expectedAlternative: row.gold.expectedAlternative, decision: row.decision, rootCause: residualRoot(row.candidate, row.gold, row.decision) }];
  });
  const residualClusters = Object.entries(failures.reduce<Record<string, string[]>>((map, row) => {
    const key = `${row.rootCause}|${row.declaredConstruction}|${row.decision.reasonCode}`;
    (map[key] ??= []).push(row.caseId); return map;
  }, {})).map(([key, caseIds]) => ({ key, count: caseIds.length, caseIds })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  const decisionCounts = Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((status) => [status, decisions.filter((decision) => decision.status === status).length]));
  return {
    family, releaseKey: candidate.manifest.releaseKey, releaseId: candidate.manifest.releaseId,
    manifestFingerprint: candidate.fingerprint, evidence: "DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE",
    decisionCounts,
    metrics: {
      precision: suggestions.length ? correctSuggestions.length / suggestions.length : 0,
      wilsonLower95: wilsonLower95(correctSuggestions.length, suggestions.length),
      supportedRecall: supportedInvalid.length ? recalledInvalid.length / supportedInvalid.length : 0,
      validRecognition: goldValid.length ? recognisedValid.length / goldValid.length : 0,
      falseValid: rows.filter((row) => row.gold.classification !== "VALID" && row.decision.status === "VALID").length,
      wrongAlternatives: suggestions.length - correctSuggestions.length,
      protectedFailures: rows.filter((row) => row.candidate.protectedSetTags.length > 0 && row.decision.status !== "UNCERTAIN").length,
    },
    byConstruction, subtypeRecall: "not_available_in_frozen_g2_candidate_schema", failures, residualClusters,
  };
});
const core = {
  schemaVersion: 1, purpose: "four_family_v4_small_model_development_regression_not_approval_evidence",
  productionRuntimeChanged: false, families,
};
const artifact = { ...core, baselineFingerprint: fingerprint(core) };
if (write) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "four-family-development-regression.json"), `${JSON.stringify(artifact, null, 2)}\n`);
} else assert.deepEqual(JSON.parse(readFileSync(join(outputRoot, "four-family-development-regression.json"), "utf8")), artifact);
console.log(JSON.stringify(artifact, null, 2));
if (families.some((family) => family.metrics.falseValid || family.metrics.wrongAlternatives || family.metrics.protectedFailures)) process.exitCode = 1;
