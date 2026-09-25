import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const corpus = join(root, "data/whole-writing/g2-context-family-corpora");
const families = ["THERE_THEIR_THEYRE", "TO_TOO_TWO", "YOUR_YOURE", "ITS_ITS"];
const tags = ["fragment", "quotation", "gerund", "run_on", "task_dependent"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJsonl = (path) => readFileSync(path, "utf8").trim().split("\n").map(JSON.parse);
const rank = (row) => sha256(`ai-context-calibration-v1:${row.caseId}`);
const take = (rows, count, label) => {
  assert(rows.length >= count, `Insufficient ${label}: ${rows.length}`);
  return [...rows].sort((a, b) => rank(a).localeCompare(rank(b)) || a.caseId.localeCompare(b.caseId)).slice(0, count);
};

const sourceFiles = [];
const cases = [];
for (const family of families) {
  const candidateRelative = `data/whole-writing/g2-context-family-corpora/candidates/${family}.jsonl`;
  const goldRelative = `data/whole-writing/g2-context-family-corpora/gold/${family}.final-gold.jsonl`;
  const candidateBytes = readFileSync(join(root, candidateRelative));
  const goldBytes = readFileSync(join(root, goldRelative));
  sourceFiles.push({ path: candidateRelative, sha256: sha256(candidateBytes) }, { path: goldRelative, sha256: sha256(goldBytes) });
  const candidates = readJsonl(join(root, candidateRelative));
  const gold = new Map(readJsonl(join(root, goldRelative)).map((row) => [row.caseId, row]));
  assert.equal(candidates.length, 400, family);
  assert.equal(gold.size, 400, family);
  for (const candidate of candidates) {
    const expected = gold.get(candidate.caseId);
    assert(expected && expected.candidateFingerprint === candidate.candidateFingerprint, candidate.caseId);
    assert.equal(candidate.family, family);
    assert.equal(candidate.provenance.sourceType, "AUTHORED_EXAMPLE");
    assert.equal(candidate.provenance.licence, "PROJECT_AUTHORED");
    assert.equal(candidate.sourceText.slice(candidate.startUtf16, candidate.endUtf16), candidate.focusSurface);
  }
  const withGold = candidates.map((candidate) => ({ candidate, expected: gold.get(candidate.caseId) }));
  const valid = take(withGold.filter((row) => row.expected.classification === "VALID" && row.candidate.protectedSetTags.length === 0).map((row) => row.candidate), 20, `${family} VALID`);
  const invalid = take(withGold.filter((row) => row.expected.classification === "INVALID" && row.candidate.protectedSetTags.length === 0).map((row) => row.candidate), 20, `${family} INVALID`);
  const protectedUncertain = tags.flatMap((tag) => take(withGold.filter((row) => row.expected.classification === "UNCERTAIN" && row.candidate.protectedSetTags.includes(tag)).map((row) => row.candidate), 4, `${family} ${tag}`));
  const selected = [...valid, ...invalid, ...protectedUncertain];
  assert.equal(selected.length, 60);
  assert.equal(new Set(selected.map((row) => row.caseId)).size, 60);
  for (const candidate of selected) {
    const expected = gold.get(candidate.caseId);
    cases.push({ caseId: candidate.caseId, family, stratum: expected.classification, protectedSetTags: candidate.protectedSetTags, candidateFingerprint: candidate.candidateFingerprint, goldFingerprint: expected.goldFingerprint });
  }
}

const body = { schemaVersion: 1, purpose: "synthetic_g2_reasoning_effort_calibration_only", selection: "SHA-256 rank of ai-context-calibration-v1:<caseId>; per family 20 unprotected VALID, 20 unprotected INVALID, and 4 protected UNCERTAIN for each of five tags", sourceFiles, cases };
const manifest = { ...body, fingerprint: sha256(JSON.stringify(body)) };
const output = `${JSON.stringify(manifest, null, 2)}\n`;
const outputPath = join(here, "calibration-subset.json");
if (process.argv.includes("--write")) writeFileSync(outputPath, output);
else assert.equal(readFileSync(outputPath, "utf8"), output, "Calibration subset changed; inspect source evidence before updating it");
console.log(JSON.stringify({ cases: cases.length, byFamily: Object.fromEntries(families.map((family) => [family, cases.filter((row) => row.family === family).length])), fingerprint: manifest.fingerprint }));
