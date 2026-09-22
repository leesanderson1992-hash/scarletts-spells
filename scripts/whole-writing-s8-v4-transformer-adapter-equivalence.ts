import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { parseTransformerStructuralFeaturesV4, type StructuralRequestV4, type StructuralResultV4 } from "../lib/writing-engine/whole-writing/context-structure-v4";

type Family = "THERE_THEIR_THEYRE" | "TO_TOO_TWO";
type Candidate = Readonly<{ caseId: string; sourceText: string; startUtf16: number; endUtf16: number }>;
const root = "data/whole-writing/v3-ordinary-writing-evaluation";
const comparisonRoot = join(root, "development-analysis/s8-v4-four-family-parser-cost-optimisation/checkpoints");
const outputPath = join(root, "development-analysis/s8-v4-implementation-freeze/transformer-adapter-equivalence.json");

function lines<T>(path: string): T[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
function cases(family: Family) {
  return [
    ...lines<Candidate>(join(root, `candidates/${family}.jsonl`)),
    ...lines<Candidate>(`data/whole-writing/g2-context-family-corpora/candidates/${family}.jsonl`),
  ];
}
function expected(family: Family) {
  const results = new Map<string, StructuralResultV4>();
  for (const row of lines<{ result?: StructuralResultV4 }>(join(comparisonRoot, `v8-trf-${family}.jsonl`))) {
    if (row.result) results.set(row.result.requestId, row.result);
  }
  return results;
}

const families = (["THERE_THEIR_THEYRE", "TO_TOO_TWO"] as const).map((family) => {
  const candidate = CONTEXT_V4_DEVELOPMENT_CANDIDATES.find((row) => row.manifest.familyKey === family)!;
  const byCaseId = new Map(cases(family).map((row) => [row.caseId, row]));
  const expectedResults = expected(family);
  const requests: StructuralRequestV4[] = [...expectedResults.keys()].map((caseId) => {
    const row = byCaseId.get(caseId);
    assert(row, caseId);
    return { requestId: caseId, family, sourceText: row.sourceText, startUtf16: row.startUtf16, endUtf16: row.endUtf16, familyMembers: candidate.manifest.members };
  });
  const first = parseTransformerStructuralFeaturesV4(requests);
  const second = parseTransformerStructuralFeaturesV4(requests);
  assert.deepEqual(first, second, `${family}:transformer-repeatability`);
  assert.deepEqual(first, requests.map((request) => expectedResults.get(request.requestId)), `${family}:worker-adapter-normalized-equivalence`);
  return { family, cases: requests.length, normalizedResultsFingerprint: fingerprint(first) };
});

assert.deepEqual(families.map((row) => row.cases), [54, 222]);
const core = { schemaVersion: 1, purpose: "pinned_transformer_adapter_equals_selected_worker_normalized_features", families };
const artifact = { ...core, equivalenceFingerprint: fingerprint(core) };
mkdirSync(join(root, "development-analysis/s8-v4-implementation-freeze"), { recursive: true });
if (process.argv.includes("--write")) writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
else assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), artifact);
console.log(JSON.stringify(artifact, null, 2));
