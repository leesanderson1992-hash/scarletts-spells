import assert from "node:assert/strict";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../../lib/writing-engine/whole-writing/context-candidates-v4";
import type { ContextFamilyKey } from "../../lib/writing-engine/whole-writing/context";
import {
  ordinaryEvaluationFingerprint,
  type OrdinaryEvaluationDecision,
  type OrdinaryWritingV3Case,
  type OrdinaryWritingV3Gold,
} from "./whole-writing-v3-ordinary-evaluation";
import { coverageLedger, HOLDOUT_V4_ADMIN_VERSION, type InventoryRow, type UncertainReason } from "./whole-writing-v4-holdout-admin";

/** Separate V4 qualification contract. No V3 evaluator or historic report is changed. */
export const HOLDOUT_V4_EVALUATOR_POLICY = Object.freeze({
  version: "S8_V4_ORDINARY_WRITING_EVALUATOR_V1_PROTECTED_VALID_SEPARATE",
  minimumPrimary: 400,
  minimumValid: 150,
  minimumInvalid: 150,
  minimumUncertain: 100,
  minimumTopLevelPerClass: 30,
  minimumSubtypePerClass: 20,
  minimumProtectedPerCategory: 10,
  minimumPrecision: 0.98,
  minimumWilsonLower95: 0.95,
  minimumRecall: 0.8,
  minimumValidRecognition: 0.8,
  minimumFallbackAttempts: 10,
  minimumAuthors: 20,
  maximumAuthorPrimaryShare: 0.10,
});

type Row = Readonly<{
  candidate: OrdinaryWritingV3Case;
  gold: OrdinaryWritingV3Gold;
  decision: OrdinaryEvaluationDecision;
  inventory: InventoryRow;
}>;

function wilsonLower95(successes: number, total: number): number {
  if (!total) return 0;
  const z = 1.959963984540054;
  const p = successes / total;
  return (p + z * z / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / (1 + z * z / total);
}

function measure(rows: readonly Row[]) {
  let suggestions = 0;
  let correctSuggestions = 0;
  let supportedInvalid = 0;
  let recalledInvalid = 0;
  let ordinaryValid = 0;
  let recognisedOrdinaryValid = 0;
  let historicAllValid = 0;
  let historicRecognisedValid = 0;
  let protectedValid = 0;
  let protectedAbstention = 0;
  let falseValid = 0;
  let wrongAlternatives = 0;
  let protectedFailures = 0;
  const findings: { caseId: string; reason: string }[] = [];
  const construction = new Map<string, { supported: number; recalled: number }>();
  const subtype = new Map<string, { supported: number; recalled: number }>();
  for (const { candidate, gold, decision } of rows) {
    const protectedCase = candidate.protectedSetTags.length > 0;
    const correctInvalid = decision.status === "INVALID" && gold.classification === "INVALID" && decision.alternativeMember === gold.intendedAlternative;
    if (decision.status === "INVALID") {
      suggestions += 1;
      if (correctInvalid) correctSuggestions += 1;
      else { wrongAlternatives += 1; findings.push({ caseId: candidate.caseId, reason: "WRONG_OR_UNSUPPORTED_ALTERNATIVE" }); }
    }
    if (decision.status === "VALID" && gold.classification !== "VALID") {
      falseValid += 1;
      findings.push({ caseId: candidate.caseId, reason: "FALSE_VALID" });
    }
    if (gold.classification === "VALID") {
      historicAllValid += 1;
      if (decision.status === "VALID") historicRecognisedValid += 1;
      if (protectedCase) protectedValid += 1;
      else {
        ordinaryValid += 1;
        if (decision.status === "VALID") recognisedOrdinaryValid += 1;
      }
    }
    if (gold.classification === "INVALID" && gold.supportedConstruction) {
      supportedInvalid += 1;
      if (correctInvalid) recalledInvalid += 1;
      for (const [map, key] of [[construction, candidate.declaredConstruction], [subtype, candidate.declaredSubtype]] as const) {
        const count = map.get(key) ?? { supported: 0, recalled: 0 };
        count.supported += 1;
        if (correctInvalid) count.recalled += 1;
        map.set(key, count);
      }
    }
    if (protectedCase) {
      if (decision.status === "UNCERTAIN") protectedAbstention += 1;
      else { protectedFailures += 1; findings.push({ caseId: candidate.caseId, reason: "PROTECTED_ABSTENTION_CHANGED" }); }
    }
  }
  return {
    counts: { suggestions, correctSuggestions, supportedInvalid, recalledInvalid, ordinaryValid, recognisedOrdinaryValid, historicAllValid, historicRecognisedValid, protectedValid, protectedAbstention },
    precision: suggestions ? correctSuggestions / suggestions : 0,
    wilsonLower95: wilsonLower95(correctSuggestions, suggestions),
    supportedRecall: supportedInvalid ? recalledInvalid / supportedInvalid : 0,
    validRecognition: ordinaryValid ? recognisedOrdinaryValid / ordinaryValid : 0,
    historicV3ValidRecognitionDiagnostic: historicAllValid ? historicRecognisedValid / historicAllValid : 0,
    falseValid, wrongAlternatives, protectedFailures,
    byConstruction: Object.fromEntries([...construction].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => [name, { ...count, recall: count.recalled / count.supported }])),
    bySubtype: Object.fromEntries([...subtype].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => [name, { ...count, recall: count.recalled / count.supported }])),
    findings,
  };
}

function clusterSensitivity(rows: readonly Row[], grouping: (row: Row) => string) {
  const groups = [...new Set(rows.map(grouping))].sort();
  const leaveOneOut = groups.map((group) => ({ group, metrics: measure(rows.filter((row) => grouping(row) !== group)) }));
  return {
    groupCount: groups.length,
    worstLeaveOneOut: leaveOneOut.length ? {
      precision: Math.min(...leaveOneOut.map((row) => row.metrics.precision)),
      wilsonLower95: Math.min(...leaveOneOut.map((row) => row.metrics.wilsonLower95)),
      supportedRecall: Math.min(...leaveOneOut.map((row) => row.metrics.supportedRecall)),
      validRecognition: Math.min(...leaveOneOut.map((row) => row.metrics.validRecognition)),
    } : null,
  };
}

export function evaluateOrdinaryWritingV4(args: {
  family: ContextFamilyKey;
  cases: readonly OrdinaryWritingV3Case[];
  gold: readonly OrdinaryWritingV3Gold[];
  inventory: readonly InventoryRow[];
  decisions: ReadonlyMap<string, OrdinaryEvaluationDecision>;
  fallbackAttempts: number;
  fallbackAccepted: number;
  uncertaintyReasonCounts: Readonly<Record<UncertainReason, number>>;
  corpusFingerprint: string;
}) {
  const release = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === args.family);
  assert(release, `Unknown V4 family: ${args.family}`);
  const issues: string[] = [];
  const goldByCase = new Map(args.gold.filter((row) => row.family === args.family).map((row) => [row.caseId, row]));
  const inventoryByCase = new Map(args.inventory.filter((row) => row.family === args.family).map((row) => [row.caseId, row]));
  const cases = args.cases.filter((row) => row.family === args.family);
  assert.equal(new Set(cases.map((row) => row.caseId)).size, cases.length, "Duplicate cases");
  assert.equal(goldByCase.size, cases.length, "Gold count does not match cases");
  assert.equal(inventoryByCase.size, cases.length, "Inventory count does not match cases");
  assert.equal(args.decisions.size, cases.length, "Decision count does not match cases");
  const rows: Row[] = cases.map((candidate) => {
    const gold = goldByCase.get(candidate.caseId);
    const inventory = inventoryByCase.get(candidate.caseId);
    const decision = args.decisions.get(candidate.caseId);
    assert(gold && inventory && decision, `Missing evidence: ${candidate.caseId}`);
    assert.equal(candidate.sourceText, inventory.sourceText, `Source mismatch: ${candidate.caseId}`);
    assert.equal(candidate.focusSurface, inventory.focusSurface, `Surface mismatch: ${candidate.caseId}`);
    assert.equal(candidate.startUtf16, inventory.startUtf16, `Start mismatch: ${candidate.caseId}`);
    assert.equal(candidate.endUtf16, inventory.endUtf16, `End mismatch: ${candidate.caseId}`);
    assert.equal(candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16), candidate.focusSurface, `Span mismatch: ${candidate.caseId}`);
    assert.equal(decision.familyKey, args.family, `Analyser family mismatch: ${candidate.caseId}`);
    assert.equal(decision.manifestFingerprint, release.fingerprint, `Frozen release mismatch: ${candidate.caseId}`);
    const { candidateFingerprint, ...candidateCore } = candidate;
    const { goldFingerprint, ...goldCore } = gold;
    assert.equal(ordinaryEvaluationFingerprint(candidateCore), candidateFingerprint, `Candidate fingerprint mismatch: ${candidate.caseId}`);
    assert.equal(ordinaryEvaluationFingerprint(goldCore), goldFingerprint, `Gold fingerprint mismatch: ${candidate.caseId}`);
    return { candidate, gold, inventory, decision };
  });
  const primaryRows = rows.filter((row) => row.candidate.primaryFocus);
  assert.equal(new Set(primaryRows.map((row) => row.inventory.writingSnapshotId)).size, primaryRows.length, `Duplicate primary writing snapshot: ${args.family}`);
  const all = measure(rows);
  const primary = measure(primaryRows);
  const ledger = coverageLedger(args.cases, args.gold).find((row) => row.family === args.family)!;
  issues.push(...ledger.issues);
  const scope = release.manifest;
  for (const name of scope.supportedConstructions) {
    const count = all.byConstruction[name];
    if (!count || count.recall < HOLDOUT_V4_EVALUATOR_POLICY.minimumRecall) issues.push(`CONSTRUCTION_RECALL_BELOW_POLICY:${name}`);
  }
  for (const name of scope.supportedSubtypes) {
    const count = all.bySubtype[name];
    if (!count || count.recall < HOLDOUT_V4_EVALUATOR_POLICY.minimumRecall) issues.push(`SUBTYPE_RECALL_BELOW_POLICY:${name}`);
  }
  for (const [name, metrics] of [["ALL", all], ["PRIMARY_ONLY", primary]] as const) {
    if (metrics.precision < 0.98) issues.push(`${name}:PRECISION_BELOW_POLICY`);
    if (metrics.wilsonLower95 < 0.95) issues.push(`${name}:WILSON_BELOW_POLICY`);
    if (metrics.supportedRecall < 0.8) issues.push(`${name}:SUPPORTED_RECALL_BELOW_POLICY`);
    if (metrics.validRecognition < 0.8) issues.push(`${name}:VALID_RECOGNITION_BELOW_POLICY`);
  }
  if (all.falseValid) issues.push("FALSE_VALID_PRESENT");
  if (all.wrongAlternatives) issues.push("WRONG_ALTERNATIVE_PRESENT");
  if (all.protectedFailures) issues.push("PROTECTED_FAILURE_PRESENT");
  const requiresFallback = args.family === "THERE_THEIR_THEYRE" || args.family === "TO_TOO_TWO";
  if (requiresFallback && args.fallbackAttempts < HOLDOUT_V4_EVALUATOR_POLICY.minimumFallbackAttempts) issues.push("FALLBACK_EXERCISE_BELOW_MINIMUM");
  if (!requiresFallback && args.fallbackAttempts !== 0) issues.push("UNAUTHORIZED_FALLBACK_INVOCATION");
  assert(args.fallbackAccepted <= args.fallbackAttempts, "Fallback accepted exceeds attempts");
  if (args.uncertaintyReasonCounts.GENUINE_SEMANTIC_AMBIGUITY < 10) issues.push("GENUINE_AMBIGUITY_COVERAGE_BELOW_MINIMUM");
  if (args.uncertaintyReasonCounts.UNSUPPORTED_CONSTRUCTION_OR_MEANING < 10) issues.push("UNSUPPORTED_MEANING_COVERAGE_BELOW_MINIMUM");
  const byAuthor = new Map<string, number>();
  for (const row of primaryRows) byAuthor.set(row.inventory.authorId, (byAuthor.get(row.inventory.authorId) ?? 0) + 1);
  const maximumAuthorShare = Math.max(0, ...byAuthor.values()) / Math.max(primaryRows.length, 1);
  if (byAuthor.size < HOLDOUT_V4_EVALUATOR_POLICY.minimumAuthors) issues.push("AUTHOR_DIVERSITY_REVIEW_REQUIRED");
  if (maximumAuthorShare > HOLDOUT_V4_EVALUATOR_POLICY.maximumAuthorPrimaryShare) issues.push("AUTHOR_CONCENTRATION_REVIEW_REQUIRED");
  const reportCore = {
    schemaVersion: 1 as const,
    policyVersion: HOLDOUT_V4_EVALUATOR_POLICY.version,
    administrationVersion: HOLDOUT_V4_ADMIN_VERSION,
    family: args.family,
    releaseKey: release.manifest.releaseKey,
    releaseId: release.manifest.releaseId,
    manifestFingerprint: release.fingerprint,
    corpusFingerprint: args.corpusFingerprint,
    evidence: "FRESH_HUMAN_HOLDOUT_AFTER_GOLD_LOCK" as const,
    ledger,
    uncertaintyReasonCounts: args.uncertaintyReasonCounts,
    allOccurrences: all,
    primaryOnly: primary,
    fallback: { attempts: args.fallbackAttempts, accepted: args.fallbackAccepted, minimumRequired: requiresFallback ? HOLDOUT_V4_EVALUATOR_POLICY.minimumFallbackAttempts : 0 },
    clustering: {
      distinctAuthors: byAuthor.size,
      maximumAuthorPrimaryShare: maximumAuthorShare,
      authorSensitivity: clusterSensitivity(primaryRows, (row) => row.inventory.authorId),
      snapshotSensitivity: clusterSensitivity(primaryRows, (row) => row.inventory.writingSnapshotId),
    },
    issues: [...new Set(issues)].sort(),
  };
  return {
    ...reportCore,
    disposition: reportCore.issues.length ? "BLOCKED" as const : "PASS_REVIEWABLE_NOT_PUBLISHED" as const,
    reportFingerprint: ordinaryEvaluationFingerprint(reportCore),
  };
}

/** Stage A can stop a family, but it can never qualify one. */
export function assessStageA(args: {
  cases: readonly OrdinaryWritingV3Case[];
  gold: readonly OrdinaryWritingV3Gold[];
  decisions: ReadonlyMap<string, OrdinaryEvaluationDecision>;
  family: ContextFamilyKey;
}) {
  const cases = args.cases.filter((row) => row.family === args.family);
  const primary = cases.filter((row) => row.primaryFocus);
  const gold = new Map(args.gold.map((row) => [row.caseId, row]));
  const rows = cases.map((candidate) => ({ candidate, gold: gold.get(candidate.caseId)!, decision: args.decisions.get(candidate.caseId)! }));
  assert(rows.every((row) => row.gold && row.decision), "Stage A gold or decisions missing");
  const safety = rows.flatMap(({ candidate, gold: final, decision }) => {
    const issues = [];
    if (decision.status === "VALID" && final.classification !== "VALID") issues.push(`${candidate.caseId}:FALSE_VALID`);
    if (decision.status === "INVALID" && !(final.classification === "INVALID" && decision.alternativeMember === final.intendedAlternative)) issues.push(`${candidate.caseId}:WRONG_ALTERNATIVE`);
    if (candidate.protectedSetTags.length && decision.status !== "UNCERTAIN") issues.push(`${candidate.caseId}:PROTECTED_FAILURE`);
    return issues;
  });
  // Only an arithmetic impossibility may stop a family early for coverage.
  // Do not extrapolate Stage A recall or tune a sequential significance test.
  const primaryCounts = {
    VALID: primary.filter((row) => gold.get(row.caseId)?.classification === "VALID").length,
    INVALID: primary.filter((row) => gold.get(row.caseId)?.classification === "INVALID").length,
    UNCERTAIN: primary.filter((row) => gold.get(row.caseId)?.classification === "UNCERTAIN").length,
  };
  const remainingSlots = 300;
  const impossibleFinalThreshold = primaryCounts.VALID + remainingSlots < 150
    || primaryCounts.INVALID + remainingSlots < 150
    || primaryCounts.UNCERTAIN + remainingSlots < 100;
  return {
    family: args.family,
    stage: "A" as const,
    primaryCount: primary.length,
    safetyFindings: safety,
    impossibleFinalThreshold,
    recommendation: safety.length || impossibleFinalThreshold ? "STOP_FAMILY" as const : "CONTINUE_TO_PREDECLARED_STAGE_B" as const,
    qualification: "NOT_A_PASS" as const,
  };
}
