import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { analyseFamilyContextsV4WithParser, type ContextInputV4, type DetailedContextDecisionV4 } from "../lib/writing-engine/whole-writing/context-family-v4";
import type { StructuralRequestV4, StructuralResultV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Family = "THERE_THEIR_THEYRE" | "TO_TOO_TWO" | "YOUR_YOURE" | "ITS_ITS";
type Classification = "VALID" | "INVALID" | "UNCERTAIN";
type Candidate = Readonly<{ caseId: string; sourceText: string; startUtf16: number; endUtf16: number; declaredConstruction: string; protectedSetTags: readonly string[] }>;
type Gold = Readonly<{ classification: Classification; expectedAlternative: string | null; supported: boolean }>;
type Row = Readonly<{ family: Family; evidence: "ordinary_exposed" | "frozen_g2"; candidate: Candidate; gold: Gold }>;
type Decision = NonNullable<DetailedContextDecisionV4["decision"]>;
type ModelIdentity = Readonly<Record<string, unknown>>;
type ModelConfig = Readonly<{ key: "sm" | "md" | "lg" | "trf" | "trf-no-ner"; model: "en_core_web_sm" | "en_core_web_md" | "en_core_web_lg" | "en_core_web_trf"; exclude?: readonly string[] }>;

const python = process.env.S8_V4_COMPARISON_PYTHON;
if (!python) throw new Error("S8_V4_COMPARISON_PYTHON_REQUIRED");
const root = process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation";
const outputRoot = join(root, "development-analysis", "s8-v4-four-family-parser-cost-optimisation");
const write = process.argv.includes("--write");
const allModels: readonly ModelConfig[] = [
  { key: "sm", model: "en_core_web_sm" },
  { key: "md", model: "en_core_web_md" },
  { key: "lg", model: "en_core_web_lg" },
  { key: "trf", model: "en_core_web_trf" },
  // NER is never consumed by the normalized S8 contract. This is a diagnostic
  // component-exclusion experiment, not a production runtime configuration.
  { key: "trf-no-ner", model: "en_core_web_trf", exclude: ["ner"] },
];
const onlyModels = process.argv.find((arg) => arg.startsWith("--models="))?.slice("--models=".length).split(",").filter(Boolean);
const models = onlyModels?.length ? allModels.filter((model) => onlyModels.includes(model.key)) : allModels;
const gatedOnly = new Set(process.argv.find((arg) => arg.startsWith("--gated-only="))?.slice("--gated-only=".length).split(",").filter(Boolean) ?? []);
if (!models.length) throw new Error("NO_REQUESTED_COMPARISON_MODELS");
const families = ["THERE_THEIR_THEYRE", "TO_TOO_TWO", "YOUR_YOURE", "ITS_ITS"] as const;
const HARNESS_VERSION = "S8_V4_WORKER_COMPARISON_V8";
const REQUEST_BATCH_SIZE = 25;

function fileFingerprint(path: string) {
  return fingerprint(readFileSync(resolve(process.cwd(), path), "utf8"));
}

// Checkpoint compatibility binds every code/configuration layer that can
// change normalized parser facts or their interpretation.  Keeping these
// fingerprints outside the governed release manifests makes this strictly a
// development-harness concern.
const semanticImplementationIdentity = Object.freeze({
  comparisonRunnerFingerprint: fileFingerprint("scripts/whole-writing-s8-v4-parser-cost-optimisation.ts"),
  workerImplementationFingerprint: fileFingerprint("python/s8-v4-spacy/model-comparison-worker.py"),
  adapterImplementationFingerprint: fileFingerprint("python/s8-v4-spacy/adapter.py"),
  structuralContractFingerprint: fileFingerprint("lib/writing-engine/whole-writing/context-structure-v4.ts"),
  familyStructuralHelperFingerprint: fileFingerprint("lib/writing-engine/whole-writing/context-family-v4.ts"),
});

function lines<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function key(family: Family, input: ContextInputV4) {
  return fingerprint([family, input.fieldText, input.startUtf16, input.endUtf16]);
}
function wilsonLower95(successes: number, total: number) {
  if (!total) return 0;
  const z = 1.959963984540054; const p = successes / total; const denominator = 1 + (z * z) / total;
  return (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
}
function inputs(rows: readonly Row[]) { return rows.map((row) => ({ fieldText: row.candidate.sourceText, startUtf16: row.candidate.startUtf16, endUtf16: row.candidate.endUtf16 })); }
function correct(row: Row, decision: Decision) {
  return (row.gold.classification === "VALID" && decision.status === "VALID") ||
    (row.gold.classification === "INVALID" && row.gold.supported && decision.status === "INVALID" && decision.alternativeMember === row.gold.expectedAlternative) ||
    (row.gold.classification === "UNCERTAIN" && decision.status === "UNCERTAIN");
}
function metrics(rows: readonly Row[], decisions: readonly Decision[]) {
  const suggestions = rows.filter((_, index) => decisions[index]!.status === "INVALID");
  const correctSuggestions = suggestions.filter((row) => {
    const index = rows.indexOf(row); const decision = decisions[index]!;
    return row.gold.classification === "INVALID" && decision.alternativeMember === row.gold.expectedAlternative;
  });
  const supported = rows.filter((row) => row.gold.classification === "INVALID" && row.gold.supported);
  const valid = rows.filter((row) => row.gold.classification === "VALID");
  const recalled = supported.filter((row) => {
    const index = rows.indexOf(row); const decision = decisions[index]!;
    return decision.status === "INVALID" && decision.alternativeMember === row.gold.expectedAlternative;
  });
  const recognised = valid.filter((row) => decisions[rows.indexOf(row)]!.status === "VALID");
  const falseValid = rows.filter((row) => decisions[rows.indexOf(row)]!.status === "VALID" && row.gold.classification !== "VALID").length;
  const wrongAlternatives = suggestions.length - correctSuggestions.length;
  const protectedFailures = rows.filter((row) => row.candidate.protectedSetTags.length && decisions[rows.indexOf(row)]!.status !== "UNCERTAIN").length;
  return {
    cases: rows.length,
    decisions: Object.fromEntries((["VALID", "INVALID", "UNCERTAIN"] as const).map((status) => [status, decisions.filter((decision) => decision.status === status).length])),
    precision: suggestions.length ? correctSuggestions.length / suggestions.length : 0,
    wilsonLower95: wilsonLower95(correctSuggestions.length, suggestions.length),
    supportedRecall: supported.length ? recalled.length / supported.length : 0,
    validRecognition: valid.length ? recognised.length / valid.length : 0,
    falseValid, wrongAlternatives, protectedFailures,
    safetyPasses: falseValid === 0 && wrongAlternatives === 0 && protectedFailures === 0,
  };
}
function sourceRows(family: Family): Row[] {
  type G2Candidate = Candidate;
  type G2Gold = { caseId: string; classification: Classification; expectedAlternative: string | null; supportedConstructionStatus: "SUPPORTED" | "UNSUPPORTED" };
  const g2Candidates = lines<G2Candidate>(join("data/whole-writing/g2-context-family-corpora/candidates", `${family}.jsonl`));
  const g2Gold = new Map(lines<G2Gold>(join("data/whole-writing/g2-context-family-corpora/gold", `${family}.final-gold.jsonl`)).map((gold) => [gold.caseId, gold]));
  const g2 = g2Candidates.map((candidate) => {
    const gold = g2Gold.get(candidate.caseId)!;
    return { family, evidence: "frozen_g2" as const, candidate, gold: { classification: gold.classification, expectedAlternative: gold.expectedAlternative, supported: gold.supportedConstructionStatus === "SUPPORTED" } };
  });
  if (family !== "THERE_THEIR_THEYRE" && family !== "TO_TOO_TWO") return g2;
  type OrdinaryGold = { caseId: string; classification: Classification; intendedAlternative: string | null; supportedConstruction: boolean };
  const ordinaryCandidates = lines<Candidate>(join(root, "candidates", `${family}.jsonl`));
  const ordinaryGold = new Map(lines<OrdinaryGold>(join(root, "gold", `${family}.final-gold.jsonl`)).map((gold) => [gold.caseId, gold]));
  return [...ordinaryCandidates.map((candidate) => {
    const gold = ordinaryGold.get(candidate.caseId)!;
    return { family, evidence: "ordinary_exposed" as const, candidate, gold: { classification: gold.classification, expectedAlternative: gold.intendedAlternative, supported: gold.supportedConstruction } };
  }), ...g2];
}
function candidateFor(family: Family) {
  const candidate = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((item) => item.manifest.familyKey === family);
  if (!candidate) throw new Error(`MISSING_V4_CANDIDATE:${family}`);
  return candidate;
}
function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
type WorkerRecord = Readonly<{ type: string; identity?: ModelIdentity; results?: StructuralResultV4[]; reason?: string; parseElapsedMs?: number; counterfactuals?: number; rssAfterParseBytes?: number; processed?: number }>;
class WorkerSession {
  private readonly child;
  private readonly records: WorkerRecord[] = [];
  private readonly waiters: Array<(record: WorkerRecord) => void> = [];
  private terminalError: Error | null = null;
  readonly stderr: string[] = [];
  readonly batches: Array<{ requests: number; counterfactuals: number; parseElapsedMs: number; rssAfterParseBytes: number; nodeHeapUsedBytes: number; nodeRssBytes: number }> = [];
  constructor(private readonly model: ModelConfig) {
    this.child = spawn(python!, [resolve(process.cwd(), "python/s8-v4-spacy/model-comparison-worker.py")], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, S8_V4_EXPERIMENT_MODEL: model.model, S8_V4_EXPERIMENT_EXCLUDE: (model.exclude ?? []).join(","), PYTHONHASHSEED: "0", CUDA_VISIBLE_DEVICES: "" } });
    createInterface({ input: this.child.stdout! }).on("line", (line) => { try { const row=JSON.parse(line) as WorkerRecord; const waiter=this.waiters.shift(); if (waiter) waiter(row); else this.records.push(row); } catch { this.records.push({ type:"error",reason:"MALFORMED_JSONL" }); } });
    createInterface({ input: this.child.stderr! }).on("line", (line) => this.stderr.push(line));
    this.child.once("error", (error) => { this.terminalError = new Error(`WORKER_PROCESS_ERROR:${error.message}`); this.releaseTerminalWaiter(); });
    this.child.once("exit", (code, signal) => { if (code !== 0 || signal) this.terminalError = new Error(`WORKER_DIED:${code ?? "null"}:${signal ?? "none"}`); this.releaseTerminalWaiter(); });
  }
  private releaseTerminalWaiter() { if (!this.terminalError) return; const waiter=this.waiters.shift(); if (waiter) waiter({ type:"error",reason:this.terminalError.message }); }
  private next(timeoutMs=120_000) { return new Promise<WorkerRecord>((resolvePromise, reject) => { const existing=this.records.shift(); if (existing) return resolvePromise(existing); if (this.terminalError) return reject(this.terminalError); const timer=setTimeout(()=>reject(new Error("WORKER_RECORD_TIMEOUT")),timeoutMs); this.waiters.push((row)=>{clearTimeout(timer);resolvePromise(row);}); }); }
  async ready() { const row=await this.next(); if (row.type!=="ready" || row.identity?.modelName!==this.model.model || row.identity?.modelVersion!=="3.8.0" || row.identity?.spacyVersion!=="3.8.16") throw new Error(`WORKER_READY_OR_IDENTITY_INVALID:${this.model.key}`); return row.identity; }
  async parse(requests: readonly StructuralRequestV4[]) { this.child.stdin!.write(`${JSON.stringify({type:"parse",requests})}\n`); const row=await this.next(); if (row.type!=="result" || !row.results || row.results.length!==requests.length) throw new Error(`WORKER_RESULT_INVALID:${row.reason??row.type}`); const memory=process.memoryUsage(); this.batches.push({ requests:requests.length,counterfactuals:Number(row.counterfactuals??0),parseElapsedMs:Number(row.parseElapsedMs??0),rssAfterParseBytes:Number(row.rssAfterParseBytes??0),nodeHeapUsedBytes:memory.heapUsed,nodeRssBytes:memory.rss }); return row.results; }
  async close() { this.child.stdin!.write('{"type":"shutdown"}\n'); const row=await this.next(); this.child.stdin!.end(); if (row.type!=="complete") throw new Error(`WORKER_COMPLETE_MISSING:${row.reason??row.type}`); }
}
function stableModelIdentity(identity: ModelIdentity): ModelIdentity {
  return Object.fromEntries(Object.entries(identity).filter(([key]) => !["loadElapsedMs","rssAfterLoadBytes"].includes(key)));
}
async function analyseModel(model: ModelConfig, family: Family, target: readonly Row[]) {
  const candidate=candidateFor(family), session=new WorkerSession(model), identity=await session.ready(), details: DetailedContextDecisionV4[]=[];
  const evidenceFingerprint=fingerprint(target.map((row)=>[row.evidence,row.candidate.caseId,row.candidate.sourceText,row.candidate.startUtf16,row.candidate.endUtf16,row.candidate.protectedSetTags,row.gold]));
  // V3 is a new checkpoint namespace.  V1/V2 remain preserved as evidence of
  // the invalidated semantics and are never silently reused.
  const checkpointPath=join(outputRoot,"checkpoints",`v8-${model.key}-${family}.jsonl`); mkdirSync(join(outputRoot,"checkpoints"),{recursive:true});
  const stableIdentity={
    adapterSchemaVersion:identity.adapterSchemaVersion,adapterVersion:identity.adapterVersion,
    adapterImplementationSha256:identity.adapterImplementationSha256,
    dependencyMatcherFingerprint:identity.dependencyMatcherFingerprint,
    parserBatchSize:identity.parserBatchSize,
    modelName:identity.modelName,modelVersion:identity.modelVersion,spacyVersion:identity.spacyVersion,
    modelTreeSha256:identity.modelTreeSha256,pipeline:identity.pipeline,
  };
  const header={
    type:"header",harness:HARNESS_VERSION,evidenceFingerprint,
    manifestFingerprint:candidate.fingerprint,familyMembers:candidate.manifest.members,
    semanticImplementationIdentity,requestBatchSize:REQUEST_BATCH_SIZE,identity:stableIdentity,
  }; const cached=new Map<string,StructuralResultV4>();
  if (existsSync(checkpointPath)) { const rows=lines<Record<string, unknown>>(checkpointPath); if (JSON.stringify(rows[0])!==JSON.stringify(header)) { await session.close(); throw new Error(`CHECKPOINT_INCOMPATIBLE:${model.key}:${family}`); } for(const row of rows.slice(1)) { if(typeof row.requestFingerprint!=="string" || !row.result) { await session.close(); throw new Error(`CHECKPOINT_RECORD_INVALID:${model.key}:${family}`); } cached.set(row.requestFingerprint,row.result as StructuralResultV4); } }
  else writeFileSync(checkpointPath,`${JSON.stringify(header)}\n`);
  for (const part of chunks(target,REQUEST_BATCH_SIZE)) {
    const requests=part.map((row)=>({requestId:row.candidate.caseId,family,sourceText:row.candidate.sourceText,startUtf16:row.candidate.startUtf16,endUtf16:row.candidate.endUtf16,familyMembers:candidate.manifest.members}));
    const requestFingerprint=(request: StructuralRequestV4)=>fingerprint([request.requestId,family,request.sourceText,request.startUtf16,request.endUtf16,request.familyMembers]);
    const missing=requests.flatMap((request,index)=>cached.has(requestFingerprint(request))?[]:[{request,index}]);
    if (missing.length) { const results=await session.parse(missing.map((item)=>item.request)); for(const [index,item] of missing.entries()) { const result=results[index]!; const resultFingerprint=requestFingerprint(item.request); cached.set(resultFingerprint,result); appendFileSync(checkpointPath,`${JSON.stringify({requestFingerprint:resultFingerprint,result})}\n`); } }
    const byInput=new Map(requests.map((request)=>[key(family,{fieldText:request.sourceText,startUtf16:request.startUtf16,endUtf16:request.endUtf16}),cached.get(requestFingerprint(request))!]));
    details.push(...analyseFamilyContextsV4WithParser(candidate.manifest,inputs(part),(next)=>next.map((request)=>({ ...(byInput.get(key(family,{fieldText:request.sourceText,startUtf16:request.startUtf16,endUtf16:request.endUtf16}))!),requestId:request.requestId }))));
  }
  await session.close(); return { identity:stableModelIdentity(identity), runtime:{ loadElapsedMs:Number(identity.loadElapsedMs??0),rssAfterLoadBytes:Number(identity.rssAfterLoadBytes??0),batches:session.batches }, details };
}
function fallbackEligible(family: Family, detail: DetailedContextDecisionV4) {
  const decision = detail.decision;
  if (decision?.reasonCode !== "COMPETING_STRUCTURAL_INTERPRETATIONS") return false;
  const scopes = detail.trace.candidates.map((candidate) => candidate.scope);
  // The gates use only the small-model structural candidate signatures—not
  // gold labels or declared construction—and deliberately omit numeral and
  // protected/policy paths, where the prior evidence shows no fallback value.
  if (family === "TO_TOO_TWO") return scopes.includes("infinitive:governed_infinitive");
  if (family === "THERE_THEIR_THEYRE") return scopes.some((scope) => scope.startsWith("they_are_contraction:"));
  if (family === "YOUR_YOURE") return scopes.some((scope) => scope.startsWith("you_are_contraction:"));
  return scopes.some((scope) => scope.startsWith("it_is_contraction:"));
}
function fallbackResultMatchesCluster(family: Family, decision: Decision) {
  if (decision.status === "UNCERTAIN") return false;
  if (family === "TO_TOO_TWO") return decision.assessedScope === "infinitive:governed_infinitive";
  if (family === "THERE_THEIR_THEYRE") return decision.assessedScope.startsWith("they_are_contraction:");
  if (family === "YOUR_YOURE") return decision.assessedScope.startsWith("you_are_contraction:");
  return decision.assessedScope.startsWith("it_is_contraction:");
}
function perEvidence(target: readonly Row[], decisions: readonly Decision[]) {
  return Object.fromEntries((["ordinary_exposed", "frozen_g2"] as const).map((evidence) => {
    const indexes = target.flatMap((row, index) => row.evidence === evidence ? [index] : []);
    return [evidence, indexes.length ? metrics(indexes.map((index) => target[index]!), indexes.map((index) => decisions[index]!)) : null];
  }));
}

async function main() {
const rowsByFamily = new Map<Family, Row[]>(families.map((family) => [family, sourceRows(family)]));
const small = new Map<Family, DetailedContextDecisionV4[]>();
const runtimeMeasurements: Array<{ model:string;family:Family;runtime:unknown }> = [];
for (const family of families) { const parsed=await analyseModel(allModels[0]!, family, rowsByFamily.get(family)!); small.set(family, parsed.details); runtimeMeasurements.push({model:"sm",family,runtime:parsed.runtime}); }

const configurations = [];
const directDecisionMaps = new Map<string, Map<Family, Decision[]>>();
for (const model of models) {
  if (gatedOnly.has(model.key)) continue;
  console.error(`S8_V4_MODEL_COMPARISON_START ${model.key}`);
  const familyResults = [];
  const decisionsByFamily = new Map<Family, Decision[]>();
  for (const family of families) {
    const target = rowsByFamily.get(family)!;
    const parsed = await analyseModel(model, family, target);
    runtimeMeasurements.push({model:model.key,family,runtime:parsed.runtime});
    const decisions = parsed.details.map((detail) => detail.decision!);
    decisionsByFamily.set(family, decisions);
    const baseline = small.get(family)!;
    const changedFromSmall = target.flatMap((row, index) => {
      const before = baseline[index]!.decision!; const after = decisions[index]!;
      if (JSON.stringify(before) === JSON.stringify(after)) return [];
      const classification = before.status === "UNCERTAIN" && correct(row, after) ? "SAFE_RESOLUTION"
        : before.status === "UNCERTAIN" && after.status !== "UNCERTAIN" ? "MODEL_MISLEADING"
          : "OTHER_DECISION_CHANGE";
      return [{ caseId: row.candidate.caseId, evidence: row.evidence, declaredConstruction: row.candidate.declaredConstruction, before, after, classification }];
    });
    familyResults.push({ family, identity: parsed.identity, metrics: perEvidence(target, decisions), allEvidenceSafety: metrics(target, decisions), changedFromSmall });
  }
  configurations.push({ key: model.key, kind: "single_model", model: model.model, excludedComponents: model.exclude ?? [], familyResults });
  directDecisionMaps.set(model.key, decisionsByFamily);
}

for (const fallback of models.filter((model) => gatedOnly.has(model.key))) {
  console.error(`S8_V4_CLUSTER_GATED_COMPARISON_START ${fallback.key}`);
  const familyResults = [];
  for (const family of families) {
    const target=rowsByFamily.get(family)!, baseline=small.get(family)!;
    const eligibleIndexes=baseline.flatMap((detail,index)=>fallbackEligible(family,detail)?[index]:[]);
    const composite=baseline.map((detail)=>detail.decision!);
    let fallbackDecisions: Decision[]=[];
    if (eligibleIndexes.length) {
      const eligibleRows=eligibleIndexes.map((index)=>target[index]!);
      const parsed=await analyseModel(fallback,family,eligibleRows);
      runtimeMeasurements.push({model:fallback.key,family,runtime:parsed.runtime});
      fallbackDecisions=parsed.details.map((detail)=>detail.decision!);
      eligibleIndexes.forEach((originalIndex,eligibleIndex)=>{ const decision=fallbackDecisions[eligibleIndex]!; if(fallbackResultMatchesCluster(family,decision)) composite[originalIndex]=decision; });
    }
    const recovery=eligibleIndexes.reduce((out,originalIndex,eligibleIndex)=>{
      const proposed=fallbackDecisions[eligibleIndex]!, decision=fallbackResultMatchesCluster(family,proposed)?proposed:baseline[originalIndex]!.decision!, row=target[originalIndex]!;
      if (correct(row,decision)) out.safe+=1;
      else if (decision.status==="UNCERTAIN") out.stillUncertain+=1;
      else out.misleading+=1;
      return out;
    },{safe:0,stillUncertain:0,misleading:0});
    familyResults.push({family,fallbackEligibleCases:eligibleIndexes.length,fallbackRecovery:recovery,metrics:perEvidence(target,composite),allEvidenceSafety:metrics(target,composite)});
  }
  configurations.push({key:`sm-to-${fallback.key}`,kind:"cluster_gated_fallback",primary:"sm",fallback:fallback.key,familyResults});
}

for (const fallback of models.filter((model) => model.key !== "sm" && model.key !== "trf-no-ner")) {
  if (gatedOnly.has(fallback.key)) continue;
  const direct = configurations.find((configuration) => configuration.key === fallback.key) as unknown as { familyResults: Array<{ family: Family; identity: ModelIdentity; metrics: unknown; allEvidenceSafety: unknown; changedFromSmall: unknown[] }> };
  const familyResults: Array<{ family: Family; fallbackEligibleCases: number; fallbackRecovery: { safe: number; stillUncertain: number; misleading: number }; metrics: ReturnType<typeof perEvidence>; allEvidenceSafety: ReturnType<typeof metrics> }> = direct.familyResults.map((modelResult) => {
    const family = modelResult.family; const target = rowsByFamily.get(family)!; const baseline = small.get(family)!;
    const eligibleIndexes = baseline.flatMap((detail, index) => fallbackEligible(family, detail) ? [index] : []);
    if (!eligibleIndexes.length) return { family, fallbackEligibleCases: 0, fallbackRecovery: { safe: 0, stillUncertain: 0, misleading: 0 }, metrics: perEvidence(target, baseline.map((detail) => detail.decision!)), allEvidenceSafety: metrics(target, baseline.map((detail) => detail.decision!) ) };
    const eligibleRows = eligibleIndexes.map((index) => target[index]!);
    const fallbackAll = directDecisionMaps.get(fallback.key)?.get(family);
    if (!fallbackAll) throw new Error(`MISSING_DIRECT_MODEL_DECISIONS:${fallback.key}:${family}`);
    const fallbackDecisions = eligibleIndexes.map((index) => fallbackAll[index]!);
    const composite = baseline.map((detail) => detail.decision!);
    eligibleIndexes.forEach((originalIndex, eligibleIndex) => { composite[originalIndex] = fallbackDecisions[eligibleIndex]!; });
    const recovery = eligibleRows.reduce((out, row, index) => {
      const decision = fallbackDecisions[index]!;
      if (correct(row, decision)) out.safe += 1;
      else if (decision.status === "UNCERTAIN") out.stillUncertain += 1;
      else out.misleading += 1;
      return out;
    }, { safe: 0, stillUncertain: 0, misleading: 0 });
    return { family, fallbackEligibleCases: eligibleIndexes.length, fallbackRecovery: recovery, metrics: perEvidence(target, composite), allEvidenceSafety: metrics(target, composite) };
  });
  configurations.push({ key: `sm-to-${fallback.key}`, kind: "cluster_gated_fallback", primary: "sm", fallback: fallback.key, familyResults });
}

const core = {
  schemaVersion: 1,
  purpose: "four_family_parser_cost_performance_optimisation_development_regression_not_approval_evidence",
  productionRuntimeChanged: false,
  frozenApprovalEvidenceChanged: false,
  fallbackEligibility: {
    TO_TOO_TWO: "small COMPETING_STRUCTURAL_INTERPRETATIONS with infinitive:governed_infinitive candidate; numeral-only competition excluded",
    THERE_THEIR_THEYRE: "small COMPETING_STRUCTURAL_INTERPRETATIONS with they_are_contraction candidate",
    YOUR_YOURE: "small COMPETING_STRUCTURAL_INTERPRETATIONS with you_are_contraction candidate",
    ITS_ITS: "small COMPETING_STRUCTURAL_INTERPRETATIONS with it_is_contraction candidate",
  },
  configurations,
};
const artifact = { ...core, comparisonFingerprint: fingerprint(core) };
if (write) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "parser-cost-performance-comparison.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(join(outputRoot, "parser-runtime-measurements.json"), `${JSON.stringify({capturedAt:new Date().toISOString(),measurements:runtimeMeasurements}, null, 2)}\n`);
} else {
  assert.deepEqual(JSON.parse(readFileSync(join(outputRoot, "parser-cost-performance-comparison.json"), "utf8")), artifact);
}
console.log(JSON.stringify({ comparisonFingerprint: artifact.comparisonFingerprint, configurations: configurations.map((configuration) => ({ key: configuration.key, kind: configuration.kind, families: configuration.familyResults.map((family: { family: Family; allEvidenceSafety: { safetyPasses: boolean }; fallbackEligibleCases?: number; fallbackRecovery?: unknown }) => ({ family: family.family, safety: family.allEvidenceSafety.safetyPasses, fallbackEligibleCases: family.fallbackEligibleCases ?? 0, fallbackRecovery: family.fallbackRecovery ?? null })) })) }, null, 2));
if (configurations.some((configuration) => configuration.familyResults.some((family: { allEvidenceSafety: { safetyPasses: boolean } }) => !family.allEvidenceSafety.safetyPasses))) process.exitCode = 1;
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
