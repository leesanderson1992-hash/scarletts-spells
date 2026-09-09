import { createHash } from "node:crypto";

import type { ContextFamilyKey, ContextResultStatus } from "../../lib/writing-engine/whole-writing/context";

export const ORDINARY_WRITING_V3_EVALUATION_POLICY = Object.freeze({
  version: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_EVALUATION_V3_2026_09_09",
  minimumPrimaryPerFamily: 400,
  minimumValid: 150,
  minimumInvalid: 150,
  minimumUncertain: 100,
  minimumTopLevelValid: 30,
  minimumTopLevelInvalid: 30,
  minimumSubtypeValid: 20,
  minimumSubtypeInvalid: 20,
  minimumProtectedCategory: 10,
  minimumPrecision: 0.98,
  minimumWilsonLower95: 0.95,
  minimumAggregateRecall: 0.8,
  minimumConstructionRecall: 0.8,
  minimumValidRecognition: 0.8,
  maximumFalseValid: 0,
  maximumWrongAlternatives: 0,
  maximumProtectedFailures: 0,
});

export type OrdinaryWritingV3Case = Readonly<{
  schemaVersion: 1;
  passageId: string;
  caseId: string;
  family: ContextFamilyKey;
  sourceText: string;
  focusSurface: string;
  startUtf16: number;
  endUtf16: number;
  declaredConstruction: string;
  declaredSubtype: string;
  primaryFocus: boolean;
  protectedSetTags: readonly ("fragment" | "quotation" | "gerund" | "run_on" | "task_dependent")[];
  sourceReference: string;
  authoredBy: string;
  candidateFingerprint: string;
}>;

export type OrdinaryWritingV3Gold = Readonly<{
  schemaVersion: 1;
  caseId: string;
  family: ContextFamilyKey;
  classification: Exclude<ContextResultStatus, "NOT_ASSESSED">;
  intendedAlternative: string | null;
  supportedConstruction: boolean;
  primaryLabelId: string;
  nonGoldReviewId: string;
  adjudicationId: string | null;
  goldFingerprint: string;
}>;

export type OrdinaryEvaluationDecision = Readonly<{
  status: ContextResultStatus;
  familyKey: ContextFamilyKey;
  observedMember: string;
  alternativeMember: string | null;
  assessedScope: string;
  reasonCode: string;
  ruleId: string;
  analyserVersion: string;
  manifestFingerprint: string;
}>;
type Analyser = (input: { fieldText: string; startUtf16: number; endUtf16: number }) => OrdinaryEvaluationDecision | null;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function ordinaryEvaluationFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function wilsonLower95(successes: number, total: number) {
  if (total === 0) return 0;
  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = proportion + (z * z) / (2 * total);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * total)) / total);
  return (centre - margin) / denominator;
}

function increment(map: Map<string, { valid: number; invalid: number }>, key: string, classification: OrdinaryWritingV3Gold["classification"]) {
  const row = map.get(key) ?? { valid: 0, invalid: 0 };
  if (classification === "VALID") row.valid += 1;
  if (classification === "INVALID") row.invalid += 1;
  map.set(key, row);
}

export function evaluateOrdinaryWritingV3(args: {
  family: ContextFamilyKey;
  cases: readonly OrdinaryWritingV3Case[];
  gold: readonly OrdinaryWritingV3Gold[];
  analyser: Analyser;
  releaseFingerprint: string;
  corpusFingerprint: string;
}) {
  const issues: string[] = [];
  const cases = args.cases.filter((candidate) => candidate.family === args.family);
  const goldByCase = new Map(args.gold.filter((row) => row.family === args.family).map((row) => [row.caseId, row]));
  if (cases.length !== new Set(cases.map((row) => row.caseId)).size) issues.push("DUPLICATE_CASE_ID");
  const primary = cases.filter((row) => row.primaryFocus);
  if (primary.length !== new Set(primary.map((row) => row.passageId)).size) issues.push("MORE_THAN_ONE_PRIMARY_FOCUS_PER_PASSAGE_AND_FAMILY");
  if (primary.length < ORDINARY_WRITING_V3_EVALUATION_POLICY.minimumPrimaryPerFamily) issues.push("INSUFFICIENT_PRIMARY_CASES");

  const counts = { valid: 0, invalid: 0, uncertain: 0 };
  const constructionCounts = new Map<string, { valid: number; invalid: number }>();
  const subtypeCounts = new Map<string, { valid: number; invalid: number }>();
  const protectedCounts = new Map<string, number>();
  let suggestions = 0;
  let correctSuggestions = 0;
  let supportedInvalid = 0;
  let recalledInvalid = 0;
  let goldValid = 0;
  let recognisedValid = 0;
  let falseValid = 0;
  let wrongAlternatives = 0;
  let protectedFailures = 0;
  const byConstruction = new Map<string, { supported: number; recalled: number }>();
  const bySubtype = new Map<string, { supported: number; recalled: number }>();
  const findings: Array<{ caseId: string; reason: string }> = [];

  for (const candidate of cases) {
    const gold = goldByCase.get(candidate.caseId);
    if (!gold) { issues.push(`MISSING_GOLD:${candidate.caseId}`); continue; }
    const { candidateFingerprint, ...candidateCore } = candidate;
    if (ordinaryEvaluationFingerprint(candidateCore) !== candidateFingerprint) issues.push(`CANDIDATE_FINGERPRINT_MISMATCH:${candidate.caseId}`);
    const { goldFingerprint, ...goldCore } = gold;
    if (ordinaryEvaluationFingerprint(goldCore) !== goldFingerprint) issues.push(`GOLD_FINGERPRINT_MISMATCH:${candidate.caseId}`);
    const exactSurface = candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16);
    if (exactSurface !== candidate.focusSurface) { issues.push(`SOURCE_SPAN_MISMATCH:${candidate.caseId}`); continue; }
    const result = args.analyser({ fieldText: candidate.sourceText, startUtf16: candidate.startUtf16, endUtf16: candidate.endUtf16 });
    if (!result || result.familyKey !== args.family) { issues.push(`ANALYSER_FAMILY_MISMATCH:${candidate.caseId}`); continue; }

    const correctInvalid = result.status === "INVALID" && gold.classification === "INVALID" && result.alternativeMember === gold.intendedAlternative;
    if (result.status === "INVALID") {
      suggestions += 1;
      if (correctInvalid) correctSuggestions += 1;
      else {
        wrongAlternatives += 1;
        findings.push({ caseId: candidate.caseId, reason: "WRONG_OR_UNSUPPORTED_ALTERNATIVE" });
      }
    }
    if (gold.classification !== "VALID" && result.status === "VALID") {
      falseValid += 1;
      findings.push({ caseId: candidate.caseId, reason: "FALSE_VALID" });
    }
    if (gold.classification === "VALID") {
      goldValid += 1;
      if (result.status === "VALID") recognisedValid += 1;
    }
    if (gold.classification === "INVALID" && gold.supportedConstruction) {
      supportedInvalid += 1;
      const construction = byConstruction.get(candidate.declaredConstruction) ?? { supported: 0, recalled: 0 };
      const subtype = bySubtype.get(candidate.declaredSubtype) ?? { supported: 0, recalled: 0 };
      construction.supported += 1;
      subtype.supported += 1;
      if (correctInvalid) { recalledInvalid += 1; construction.recalled += 1; subtype.recalled += 1; }
      byConstruction.set(candidate.declaredConstruction, construction);
      bySubtype.set(candidate.declaredSubtype, subtype);
    }
    if (candidate.protectedSetTags.length > 0) {
      for (const tag of candidate.protectedSetTags) protectedCounts.set(tag, (protectedCounts.get(tag) ?? 0) + 1);
      if (result.status !== "UNCERTAIN") {
        protectedFailures += 1;
        findings.push({ caseId: candidate.caseId, reason: "PROTECTED_ABSTENTION_CHANGED" });
      }
    }
    if (candidate.primaryFocus) {
      if (gold.classification === "VALID") counts.valid += 1;
      else if (gold.classification === "INVALID") counts.invalid += 1;
      else counts.uncertain += 1;
      increment(constructionCounts, candidate.declaredConstruction, gold.classification);
      increment(subtypeCounts, candidate.declaredSubtype, gold.classification);
    }
  }

  if (counts.valid < 150 || counts.invalid < 150 || counts.uncertain < 100) issues.push("PRIMARY_CLASS_BALANCE_FAILED");
  for (const [name, count] of constructionCounts) if (count.valid < 30 || count.invalid < 30) issues.push(`TOP_LEVEL_QUOTA_FAILED:${name}`);
  for (const [name, count] of subtypeCounts) if (count.valid < 20 || count.invalid < 20) issues.push(`SUBTYPE_QUOTA_FAILED:${name}`);
  for (const tag of ["fragment", "quotation", "gerund", "run_on", "task_dependent"]) if ((protectedCounts.get(tag) ?? 0) < 10) issues.push(`PROTECTED_QUOTA_FAILED:${tag}`);

  const precision = suggestions === 0 ? 0 : correctSuggestions / suggestions;
  const wilson = wilsonLower95(correctSuggestions, suggestions);
  const recall = supportedInvalid === 0 ? 0 : recalledInvalid / supportedInvalid;
  const validRecognition = goldValid === 0 ? 0 : recognisedValid / goldValid;
  if (precision < 0.98) issues.push("PRECISION_BELOW_POLICY");
  if (wilson < 0.95) issues.push("WILSON_BELOW_POLICY");
  if (recall < 0.8) issues.push("AGGREGATE_RECALL_BELOW_POLICY");
  if (validRecognition < 0.8) issues.push("VALID_RECOGNITION_BELOW_POLICY");
  for (const [name, row] of [...byConstruction, ...bySubtype]) if (row.supported > 0 && row.recalled / row.supported < 0.8) issues.push(`CONSTRUCTION_RECALL_BELOW_POLICY:${name}`);
  if (falseValid > 0) issues.push("FALSE_VALID_PRESENT");
  if (wrongAlternatives > 0) issues.push("WRONG_ALTERNATIVE_PRESENT");
  if (protectedFailures > 0) issues.push("PROTECTED_FAILURE_PRESENT");

  const reportCore = {
    schemaVersion: 1,
    policyVersion: ORDINARY_WRITING_V3_EVALUATION_POLICY.version,
    family: args.family,
    releaseFingerprint: args.releaseFingerprint,
    corpusFingerprint: args.corpusFingerprint,
    counts,
    totalPrimary: primary.length,
    totalAnnotatedOccurrences: cases.length,
    metrics: { precision, wilsonLower95: wilson, supportedRecall: recall, validRecognition, falseValid, wrongAlternatives, protectedFailures },
    byConstruction: Object.fromEntries([...byConstruction].map(([name, row]) => [name, { ...row, recall: row.supported ? row.recalled / row.supported : 0 }])),
    bySubtype: Object.fromEntries([...bySubtype].map(([name, row]) => [name, { ...row, recall: row.supported ? row.recalled / row.supported : 0 }])),
    issues: [...new Set(issues)].sort(),
    findings,
  };
  return {
    ...reportCore,
    disposition: reportCore.issues.length === 0 ? "PASS_REVIEWABLE_NOT_PUBLISHED" as const : "BLOCKED" as const,
    reportFingerprint: ordinaryEvaluationFingerprint(reportCore),
  };
}
