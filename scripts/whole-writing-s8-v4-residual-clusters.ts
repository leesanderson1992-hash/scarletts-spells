import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import type { StructuralVariantV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Candidate = Readonly<{
  caseId: string; sourceText: string; startUtf16: number; endUtf16: number;
  declaredConstruction: string; declaredSubtype: string; protectedSetTags: readonly string[];
}>;
type Residual = Readonly<{
  family: string; caseId: string; declaredConstruction: string; declaredSubtype: string;
  protectedSetTags: readonly string[]; gold: string; intendedAlternative: string | null;
  decision: Readonly<{ reasonCode: string }>; reasons: readonly string[]; rootCause: string;
}>;

const root = process.env.S8_V3_EVALUATION_ROOT ?? "data/whole-writing/v3-ordinary-writing-evaluation";
const outputRoot = join(root, "development-analysis", "s8-v4-structural-adapter");
const write = process.argv.includes("--write");

function lines<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function compactVariant(variant: StructuralVariantV4 | undefined) {
  if (!variant || variant.status !== "ready") return variant;
  const focus = new Set(variant.focusTokenIndices);
  return {
    focus: variant.tokens.filter((token) => focus.has(token.index)).map((token) => ({
      surface: token.surface, lemma: token.lemma, coarsePos: token.coarsePos, fineTag: token.fineTag,
      dependency: token.dependency, sourceDependency: token.sourceDependency, headIndex: token.headIndex,
    })),
    sentence: variant.tokens.map((token) => ({
      index: token.index, surface: token.surface, lemma: token.lemma, coarsePos: token.coarsePos,
      fineTag: token.fineTag, dependency: token.dependency, sourceDependency: token.sourceDependency, headIndex: token.headIndex,
    })),
  };
}

const residuals = lines<Residual>(join(outputRoot, "residual-failures.jsonl"));
const byFamily = new Map(CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => [candidate.manifest.familyKey, candidate]));
const cases = new Map<string, Candidate>();
for (const family of byFamily.keys()) {
  for (const candidate of lines<Candidate>(join(root, "candidates", `${family}.jsonl`))) cases.set(`${family}:${candidate.caseId}`, candidate);
}

const grouped = new Map<string, Residual[]>();
for (const residual of residuals) {
  const key = [residual.family, residual.rootCause, residual.declaredConstruction, residual.declaredSubtype, residual.decision.reasonCode].join("|");
  grouped.set(key, [...(grouped.get(key) ?? []), residual]);
}
const clusters = [...grouped.entries()].map(([key, rows]) => ({ key, count: rows.length, rows })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

const sampledClusters = clusters.flatMap((cluster) => {
  const family = cluster.rows[0]?.family;
  const records = family ? cluster.rows.slice(0, 3).map((row) => cases.get(`${family}:${row.caseId}`)!).filter(Boolean) : [];
  return cluster.count >= 5 && records.length ? [{ cluster, family, records }] : [];
});
const detailsByFamily = new Map<string, Map<string, ReturnType<(typeof CONTEXT_V4_DEVELOPMENT_CANDIDATES)[number]["analyseBatch"]>[number]>>();
for (const family of byFamily.keys()) {
  const candidate = byFamily.get(family)!;
  const records = sampledClusters.filter((sample) => sample.family === family).flatMap((sample) => sample.records);
  const details = candidate.analyseBatch(records.map((record) => ({ fieldText: record.sourceText, startUtf16: record.startUtf16, endUtf16: record.endUtf16 })));
  detailsByFamily.set(family, new Map(records.map((record, index) => [record.caseId, details[index]!])));
}
const examples = sampledClusters.map(({ cluster, family, records }) => ({
  key: cluster.key, count: cluster.count,
  examples: records.map((record) => {
    const detail = detailsByFamily.get(family)!.get(record.caseId)!;
    return {
      caseId: record.caseId, sourceText: record.sourceText, focusSurface: record.sourceText.slice(record.startUtf16, record.endUtf16),
      decision: detail.decision, candidates: detail.trace.candidates,
      variants: detail.trace.structural?.status === "ready"
        ? Object.fromEntries(Object.entries(detail.trace.structural.variants).map(([member, variant]) => [member, compactVariant(variant)]))
        : detail.trace.structural,
    };
  }),
}));

const artifact = { schemaVersion: 1, purpose: "development_regression_residual_structural_clustering_only", clusters: clusters.map(({ rows, ...cluster }) => ({ ...cluster, caseIds: rows.map((row) => row.caseId) })), examples };
if (write) {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "residual-clusters.json"), `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(JSON.stringify(artifact, null, 2));
