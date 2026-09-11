import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { analyseFamilyContextsV4WithParser, type ContextInputV4, type DetailedContextDecisionV4, type StructuralParserV4 } from "../lib/writing-engine/whole-writing/context-family-v4";
import type { StructuralRequestV4, StructuralResultV4, StructuralVariantV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";
import { readJsonLines, sha256 } from "./lib/whole-writing-g2-corpus";
import { evaluateOrdinaryWritingV3, type OrdinaryWritingV3Case, type OrdinaryWritingV3Gold } from "./lib/whole-writing-v3-ordinary-evaluation";

type Residual = Readonly<{
  family: "THERE_THEIR_THEYRE" | "TO_TOO_TWO"; caseId: string; declaredConstruction: string; declaredSubtype: string;
  protectedSetTags: readonly string[]; gold: "VALID" | "INVALID" | "UNCERTAIN"; intendedAlternative: string | null;
  decision: Readonly<{ status: string; alternativeMember: string | null; reasonCode: string }>; reasons: readonly string[]; rootCause: string;
}>;
type G2Case = Readonly<{ caseId: string; sourceText: string; startUtf16: number; endUtf16: number; protectedSetTags: readonly string[] }>;
type G2Gold = Readonly<{ caseId: string; classification: "VALID" | "INVALID" | "UNCERTAIN"; expectedAlternative: string | null; supportedConstructionStatus: "SUPPORTED" | "UNSUPPORTED" }>;
type TransformerResponse = Readonly<{ schemaVersion: string; identity: Record<string, unknown>; results: StructuralResultV4[] }>;

const root = process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation";
const outputRoot = join(root, "development-analysis", "s8-v4-spacy-transformer-feasibility");
const transformerPython = process.env.S8_V4_TRANSFORMER_PYTHON;
const write = process.argv.includes("--write");

if (!transformerPython) throw new Error("S8_V4_TRANSFORMER_PYTHON_REQUIRED");
if (!process.env.S8_V4_PYTHON) throw new Error("S8_V4_PYTHON_REQUIRED_FOR_SMALL_BASELINE");
const TRANSFORMER_PYTHON: string = transformerPython;

function key(input: ContextInputV4) { return fingerprint([input.fieldText, input.startUtf16, input.endUtf16]); }
function residualGroup(row: Residual) {
  if (row.family === "TO_TOO_TWO") {
    if (row.declaredConstruction === "infinitive") return "TO_GOVERNED_INFINITIVE";
    if (row.declaredConstruction === "numeral") return "TO_NUMERAL";
    return "TO_OTHER_STRUCTURAL_AMBIGUITY";
  }
  return row.declaredConstruction === "they_are_contraction" ? "THERE_CONTRACTION_AMBIGUITY" : "THERE_OTHER_STRUCTURAL_AMBIGUITY";
}
function compactSignature(variant: StructuralVariantV4 | undefined) {
  if (!variant || variant.status !== "ready") return variant?.status ?? "missing";
  const focus = new Set(variant.focusTokenIndices);
  return variant.tokens.filter((token) => focus.has(token.index) || variant.focusTokenIndices.includes(token.headIndex)).map((token) => [token.index, token.surface, token.lemma, token.coarsePos, token.fineTag, token.sourceDependency, token.headIndex]).concat([variant.dependencyMatches.join(",")]);
}
function structuralDifference(small: DetailedContextDecisionV4, transformer: DetailedContextDecisionV4) {
  const left = small.trace.structural;
  const right = transformer.trace.structural;
  if (left?.status !== "ready" || right?.status !== "ready") return left?.status !== right?.status;
  return Object.keys(left.variants).some((member) => JSON.stringify(compactSignature(left.variants[member])) !== JSON.stringify(compactSignature(right.variants[member])));
}
function transformerResults(requests: readonly StructuralRequestV4[]): { response: TransformerResponse; parser: StructuralParserV4 } {
  const child = spawnSync(TRANSFORMER_PYTHON, [resolve(process.cwd(), "python/s8-v4-spacy/transformer-experiment.py")], {
    input: JSON.stringify({ schemaVersion: "ADLE_S8_STRUCTURAL_FEATURES_V2", requests }), encoding: "utf8", timeout: 20 * 60_000,
    maxBuffer: 512 * 1024 * 1024, env: { ...process.env, PYTHONHASHSEED: "0", CUDA_VISIBLE_DEVICES: "" },
  });
  if (child.error || child.status !== 0) throw new Error(`TRANSFORMER_EXPERIMENT_FAILED:${child.error?.message ?? child.stderr}`);
  const response = JSON.parse(child.stdout) as TransformerResponse;
  if (response.schemaVersion !== "ADLE_S8_STRUCTURAL_FEATURES_V2" || !Array.isArray(response.results) || response.results.length !== requests.length ||
      response.identity.modelName !== "en_core_web_trf" || response.identity.modelVersion !== "3.8.0" || response.identity.spacyVersion !== "3.8.16") throw new Error("TRANSFORMER_EXPERIMENT_IDENTITY_OR_SCHEMA_INVALID");
  const byInput = new Map(requests.map((request, index) => [key({ fieldText: request.sourceText, startUtf16: request.startUtf16, endUtf16: request.endUtf16 }), response.results[index]! ]));
  return { response, parser: (next) => next.map((request) => byInput.get(key({ fieldText: request.sourceText, startUtf16: request.startUtf16, endUtf16: request.endUtf16 })) ?? {
    requestId: request.requestId, status: "blocked" as const, reason: "TRANSFORMER_EXPERIMENT_RESULT_MISSING", variants: {},
  }) };
}
function g2Metrics(rows: readonly { candidate: G2Case; gold: G2Gold; decision: NonNullable<DetailedContextDecisionV4["decision"]> }[]) {
  const suggestions = rows.filter((row) => row.decision.status === "INVALID");
  const correct = suggestions.filter((row) => row.gold.classification === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative);
  const supported = rows.filter((row) => row.gold.classification === "INVALID" && row.gold.supportedConstructionStatus === "SUPPORTED");
  const valid = rows.filter((row) => row.gold.classification === "VALID");
  return {
    cases: rows.length, precision: suggestions.length ? correct.length / suggestions.length : 0,
    supportedRecall: supported.length ? supported.filter((row) => row.decision.status === "INVALID" && row.decision.alternativeMember === row.gold.expectedAlternative).length / supported.length : 0,
    validRecognition: valid.length ? valid.filter((row) => row.decision.status === "VALID").length / valid.length : 0,
    falseValid: rows.filter((row) => row.gold.classification !== "VALID" && row.decision.status === "VALID").length,
    wrongAlternatives: suggestions.length - correct.length,
    protectedFailures: rows.filter((row) => row.candidate.protectedSetTags.length && row.decision.status !== "UNCERTAIN").length,
  };
}
function analyseSmallInChunks(
  analyser: (inputs: readonly ContextInputV4[]) => DetailedContextDecisionV4[],
  inputs: readonly ContextInputV4[],
) {
  const results: DetailedContextDecisionV4[] = [];
  for (let start = 0; start < inputs.length; start += 128) results.push(...analyser(inputs.slice(start, start + 128)));
  return results;
}

const residuals = readJsonLines<Residual>(join(root, "development-analysis", "s8-v4-structural-adapter", "residual-failures.jsonl"))
  .filter((row) => row.rootCause === "structural_parser_ambiguity" && row.decision.reasonCode === "COMPETING_STRUCTURAL_INTERPRETATIONS");
const candidatesByFamily = new Map<string, OrdinaryWritingV3Case[]>();
const goldByFamily = new Map<string, OrdinaryWritingV3Gold[]>();
for (const family of ["THERE_THEIR_THEYRE", "TO_TOO_TWO"] as const) {
  candidatesByFamily.set(family, readJsonLines<OrdinaryWritingV3Case>(join(root, "candidates", `${family}.jsonl`)));
  goldByFamily.set(family, readJsonLines<OrdinaryWritingV3Gold>(join(root, "gold", `${family}.final-gold.jsonl`)));
}
const candidateByKey = new Map([...candidatesByFamily.entries()].flatMap(([family, rows]) => rows.map((row) => [`${family}:${row.caseId}`, row])));
const controls: Array<{ family: "THERE_THEIR_THEYRE" | "TO_TOO_TWO"; candidate: G2Case; gold: G2Gold }> = [];
const familyResults = [];
const normalizedFeatures: Array<{ family: string; caseId: string; sourceText: string; startUtf16: number; endUtf16: number; transformer: StructuralResultV4 }> = [];

for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
  const family = candidate.manifest.familyKey;
  const rows = residuals.filter((row) => row.family === family).map((row) => ({ residual: row, candidate: candidateByKey.get(`${family}:${row.caseId}`)! }));
  const allCases = candidatesByFamily.get(family)!;
  const allInputs = allCases.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }));
  const smallAll = analyseSmallInChunks(candidate.analyseBatch, allInputs);
  const smallByInput = new Map(allInputs.map((input, index) => [key(input), smallAll[index]! ]));
  const g2Cases = readJsonLines<G2Case>(join("data/whole-writing/g2-context-family-corpora/candidates", `${family}.jsonl`));
  const g2Gold = readJsonLines<G2Gold>(join("data/whole-writing/g2-context-family-corpora/gold", `${family}.final-gold.jsonl`));
  const g2GoldByCase = new Map(g2Gold.map((row) => [row.caseId, row]));
  const g2Inputs = g2Cases.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }));
  const smallG2 = analyseSmallInChunks(candidate.analyseBatch, g2Inputs);
  const g2Targets = g2Cases.flatMap((row, index) => smallG2[index]!.decision?.reasonCode === "COMPETING_STRUCTURAL_INTERPRETATIONS" ? [{ candidate: row, gold: g2GoldByCase.get(row.caseId)! }] : []);
  controls.push(...g2Targets.map((row) => ({ family, ...row })));
  const parseInputs = [...rows.map(({ candidate: row }) => row), ...g2Targets.map(({ candidate: row }) => row)].map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }));
  const requests: StructuralRequestV4[] = parseInputs.map((input, index) => ({ requestId: String(index), family, sourceText: input.fieldText, startUtf16: input.startUtf16, endUtf16: input.endUtf16, familyMembers: candidate.manifest.members }));
  const transformer = transformerResults(requests);
  const transformedRows = analyseFamilyContextsV4WithParser(candidate.manifest, rows.map(({ candidate: row }) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 })), transformer.parser);
  const transformedG2 = analyseFamilyContextsV4WithParser(candidate.manifest, g2Targets.map(({ candidate: row }) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 })), transformer.parser);
  const transformerByInput = new Map<string, DetailedContextDecisionV4>();
  for (const [index, { candidate: row }] of rows.entries()) transformerByInput.set(key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }), transformedRows[index]!);
  for (const [index, { candidate: row }] of g2Targets.entries()) transformerByInput.set(key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }), transformedG2[index]!);
  const classifications = rows.map(({ residual, candidate: row }, index) => {
    const small = smallByInput.get(key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }))!;
    const transformed = transformedRows[index]!;
    const decision = transformed.decision!;
    const correct = (decision.status === "VALID" && residual.gold === "VALID") || (decision.status === "INVALID" && residual.gold === "INVALID" && decision.alternativeMember === residual.intendedAlternative);
    const classification = correct ? "SAFE_RESOLUTION" : decision.status !== "UNCERTAIN" ? "TRANSFORMER_MISLEADING" : structuralDifference(small, transformed) ? "PARSER_DISAGREEMENT" : "STILL_AMBIGUOUS";
    const raw = transformer.response.results[index]!;
    normalizedFeatures.push({ family, caseId: residual.caseId, sourceText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16, transformer: raw });
    return { group: residualGroup(residual), caseId: residual.caseId, declaredConstruction: residual.declaredConstruction, declaredSubtype: residual.declaredSubtype, gold: residual.gold, intendedAlternative: residual.intendedAlternative, smallDecision: small.decision, transformerDecision: decision, classification };
  });
  const overrides = new Map(rows.map(({ candidate: row }, index) => [key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }), transformedRows[index]!.decision!]));
  const ordinaryGold = goldByFamily.get(family)!;
  const composite = evaluateOrdinaryWritingV3({
    family, cases: allCases, gold: ordinaryGold, releaseFingerprint: `${candidate.fingerprint}:transformer-experiment`,
    corpusFingerprint: sha256(Buffer.concat([readFileSync(join(root, "candidates", `${family}.jsonl`)), readFileSync(join(root, "gold", `${family}.final-gold.jsonl`))])),
    analyser: (input) => overrides.get(key(input)) ?? smallByInput.get(key(input))?.decision ?? null,
  });
  const transformedG2Rows = g2Cases.map((row, index) => ({ candidate: row, gold: g2GoldByCase.get(row.caseId)!, decision: transformerByInput.get(key({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 }))?.decision ?? smallG2[index]!.decision! }));
  familyResults.push({ family, residualCases: rows.length, g2FallbackControls: g2Targets.length, transformerIdentity: transformer.response.identity, classifications, prototypeRegression: composite, g2PrototypeRegression: g2Metrics(transformedG2Rows) });
}

const conflictRows = JSON.parse(readFileSync(join(root, "development-analysis", "s8-v4-structural-adapter", "evaluator-contract-conflicts.json"), "utf8")) as { conflicts: Array<{ caseId: string }> };
const toCases = candidatesByFamily.get("TO_TOO_TWO")!;
const toGold = new Map(goldByFamily.get("TO_TOO_TWO")!.map((row) => [row.caseId, row]));
const toSmall = analyseSmallInChunks(CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((candidate) => candidate.manifest.familyKey === "TO_TOO_TWO")!.analyseBatch, toCases.map((row) => ({ fieldText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16 })));
const conflicts = new Set(conflictRows.conflicts.map((row) => row.caseId));
const adjustedValid = toCases.filter((row) => toGold.get(row.caseId)?.classification === "VALID" && !conflicts.has(row.caseId));
const adjustedRecognised = adjustedValid.filter((row) => {
  const caseIndex = toCases.indexOf(row);
  return toSmall[caseIndex]!.decision?.status === "VALID";
});
const frozenTo = JSON.parse(readFileSync(join(root, "development-analysis", "s8-v4-structural-adapter", "TO_TOO_TWO.development-regression.json"), "utf8")) as { metrics: unknown };
const modelDirectory = "/tmp/s8-nlp-eval-codex-20260910/venv/lib/python3.12/site-packages/en_core_web_trf";
const core = {
  schemaVersion: 1, purpose: "offline_transformer_feasibility_development_regression_not_approval_evidence", productionRuntimeChanged: false,
  residualInventory: Object.fromEntries(["TO_GOVERNED_INFINITIVE", "TO_NUMERAL", "TO_OTHER_STRUCTURAL_AMBIGUITY", "THERE_CONTRACTION_AMBIGUITY", "THERE_OTHER_STRUCTURAL_AMBIGUITY"].map((group) => [group, residuals.filter((row) => residualGroup(row) === group).length])),
  excludedFromResidualParserSet: { evaluatorContract: 63, protectedPolicy: 52, unsupportedConstruction: 20, familyRuleOrSemantic: 36 },
  frozenToHistoricalMetrics: frozenTo.metrics,
  conflictAdjustedToDevelopmentDiagnostic: { excludedImpossibleProtectedValidCases: conflicts.size, validDenominator: adjustedValid.length, validRecognised: adjustedRecognised.length, validRecognition: adjustedValid.length ? adjustedRecognised.length / adjustedValid.length : 0 },
  transformerModel: { directoryBytes: statSync(modelDirectory).size, installedTreeBytes: (() => { const output = spawnSync("du", ["-sk", modelDirectory], { encoding: "utf8" }); return Number(output.stdout.split(/\s+/)[0]) * 1024; })() },
  families: familyResults,
};
const artifact = { ...core, feasibilityFingerprint: fingerprint(core) };
if (write) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "transformer-feasibility.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(join(outputRoot, "transformer-residual-set.jsonl"), `${residuals.map((row) => { const candidate = candidateByKey.get(`${row.family}:${row.caseId}`)!; return JSON.stringify({ ...row, group: residualGroup(row), sourceText: candidate.sourceText, startUtf16: candidate.startUtf16, endUtf16: candidate.endUtf16, focusSurface: candidate.focusSurface }); }).join("\n")}\n`);
  writeFileSync(join(outputRoot, "transformer-normalized-features.jsonl"), `${normalizedFeatures.map((row) => JSON.stringify(row)).join("\n")}\n`);
}
console.log(JSON.stringify({ feasibilityFingerprint: artifact.feasibilityFingerprint, residualInventory: artifact.residualInventory, conflictAdjustedToDevelopmentDiagnostic: artifact.conflictAdjustedToDevelopmentDiagnostic, families: familyResults.map((row) => ({ family: row.family, g2FallbackControls: row.g2FallbackControls, classificationCounts: Object.fromEntries(["SAFE_RESOLUTION", "STILL_AMBIGUOUS", "PARSER_DISAGREEMENT", "TRANSFORMER_MISLEADING", "RULE_LIMITATION", "NON_STRUCTURAL"].map((kind) => [kind, row.classifications.filter((item) => item.classification === kind).length])), prototypeMetrics: row.prototypeRegression.metrics, g2Metrics: row.g2PrototypeRegression, transformerIdentity: row.transformerIdentity })) }, null, 2));
