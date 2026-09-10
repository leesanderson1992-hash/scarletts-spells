import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ContextFamilyKey } from "../lib/writing-engine/whole-writing/context";
import { CONTEXT_V3_CANDIDATES } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { ordinaryEvaluationFingerprint } from "./lib/whole-writing-v3-ordinary-evaluation";

const root = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation");
const mutableReviewColumns = [
  "declared_construction",
  "declared_subtype",
  "protected_set_tags_json",
  "classification",
  "intended_alternative",
  "supported_construction",
  "primary_focus_approved",
  "primary_label_id",
  "primary_labeler",
  "primary_label_timestamp_utc",
  "primary_notes",
] as const;
const expectedCounts: Record<ContextFamilyKey, { occurrences: number; passages: number; primary: number }> = {
  THERE_THEIR_THEYRE: { occurrences: 472, passages: 446, primary: 400 },
  YOUR_YOURE: { occurrences: 400, passages: 400, primary: 400 },
  TO_TOO_TWO: { occurrences: 1209, passages: 977, primary: 400 },
  ITS_ITS: { occurrences: 411, passages: 400, primary: 400 },
};

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      assert.equal(field, "");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  assert(!quoted);
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

const manifest = JSON.parse(readFileSync(join(root, "source-intake/source-manifest.json"), "utf8"));
const { sourceManifestFingerprint, ...manifestCore } = manifest;
assert.equal(ordinaryEvaluationFingerprint(manifestCore), sourceManifestFingerprint);
assert.equal(manifest.baselineCommit, "4139430dd8011c41a7e285e50b71312c1839d936");
assert.equal(manifest.sources.length, 4);

const provenance = JSON.parse(readFileSync(join(root, "source-intake/authorship-resolution.json"), "utf8"));
const { provenanceResolutionFingerprint, ...provenanceCore } = provenance;
assert.equal(ordinaryEvaluationFingerprint(provenanceCore), provenanceResolutionFingerprint);
assert.equal(provenance.sourceTextAuthorship, "HUMAN_AUTHORED");
assert.equal(provenance.identifierGeneration, "AI_ASSISTED");

const sourceRows = new Map<string, { sourceText: string; authoredBy: string }>();
for (const source of manifest.sources) {
  const rawPath = join(root, source.preservedPath);
  const raw = readFileSync(rawPath);
  assert.equal(raw.length, source.byteLength);
  assert.equal(sha256(raw), source.sha256);
  const rows = parseCsv(raw.toString("utf8").replace(/^\uFEFF/u, ""));
  assert.deepEqual(rows[0], source.headers);
  assert.equal(rows.length, source.passageCount + 1);
  for (let index = 1; index < rows.length; index += 1) {
    sourceRows.set(`${source.preservedPath}#row=${index + 1}`, { sourceText: rows[index][1], authoredBy: rows[index][2] });
  }
}

const inventory = readFileSync(join(root, "source-intake/occurrence-inventory.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(inventory.length, 2492);
assert.equal(new Set(inventory.map((record) => record.caseId)).size, inventory.length);
for (const record of inventory) {
  const { inventoryFingerprint, ...core } = record;
  assert.equal(ordinaryEvaluationFingerprint(core), inventoryFingerprint, record.caseId);
  assert.equal(record.sourceText.slice(record.startUtf16, record.endUtf16), record.focusSurface, record.caseId);
  assert.equal(record.spanValidated, true, record.caseId);
  const source = sourceRows.get(record.sourceReference);
  assert(source, record.sourceReference);
  assert.equal(source.sourceText, record.sourceText, record.caseId);
  assert.equal(source.authoredBy, record.authoredByClaim, record.caseId);
  assert.equal(record.authorshipResolutionId, provenance.resolutionId, record.caseId);
}

for (const [family, expected] of Object.entries(expectedCounts) as Array<[ContextFamilyKey, (typeof expectedCounts)[ContextFamilyKey]]>) {
  const records = inventory.filter((record) => record.family === family);
  const primary = records.filter((record) => record.primaryFocusPreselected);
  assert.equal(records.length, expected.occurrences, family);
  assert.equal(new Set(records.map((record) => record.passageId)).size, expected.passages, family);
  assert.equal(primary.length, expected.primary, family);
  assert.equal(new Set(primary.map((record) => record.passageId)).size, primary.length, family);

  const reviewPath = join(root, "human-review/primary-label", `${family}.primary-label-review.csv`);
  const review = parseCsv(readFileSync(reviewPath, "utf8"));
  const headers = review[0];
  const rows = review.slice(1);
  assert.equal(rows.length, expected.occurrences, family);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  for (const column of mutableReviewColumns) assert(headerIndex.has(column), `${family}:${column}`);
  const inventoryFingerprints = new Set(records.map((record) => record.inventoryFingerprint));
  for (const row of rows) {
    assert(inventoryFingerprints.has(row[headerIndex.get("inventory_fingerprint")!]), family);
    for (const column of mutableReviewColumns) assert.equal(row[headerIndex.get(column)!], "", `${family}:${column}`);
  }
}

const coverage = JSON.parse(readFileSync(join(root, "source-intake/coverage-ledger.pre-label.json"), "utf8"));
for (const [family, expected] of Object.entries(expectedCounts) as Array<[ContextFamilyKey, (typeof expectedCounts)[ContextFamilyKey]]>) {
  assert.equal(coverage.coverage[family].totalAnnotatedOccurrences, expected.occurrences);
  assert.equal(coverage.coverage[family].passagesWithFamily, expected.passages);
  assert.equal(coverage.coverage[family].preselectedPrimary, expected.primary);
  assert.equal(coverage.coverage[family].confirmedPrimaryHumanDecisions, 0);
}

for (const candidate of CONTEXT_V3_CANDIDATES) {
  const disposition = JSON.parse(readFileSync(join(root, "dispositions", `${candidate.manifest.releaseKey}.holdout-intake.blocked.json`), "utf8"));
  const { dispositionFingerprint, ...core } = disposition;
  assert.equal(ordinaryEvaluationFingerprint(core), dispositionFingerprint);
  assert.equal(disposition.family, candidate.manifest.familyKey);
  assert.equal(disposition.disposition, "BLOCKED");
  assert.equal(disposition.exactRelease.manifestFingerprint, candidate.fingerprint);
  assert.equal(disposition.humanWorkflow.primaryLabelsComplete, false);
  assert.equal(disposition.metrics, null);
  assert.equal(disposition.analyserBehaviour, "NOT_EVALUATED");
  assert.equal(disposition.familyDeliveryRemainsDisabled, true);
}

assert(!existsSync(join(root, "candidates")), "Candidate records must not exist before human decisions are complete");
assert(!existsSync(join(root, "gold")), "Gold must not exist before review and adjudication are complete");
assert(!existsSync(join(root, "reports")), "Evaluation reports must not exist before final gold is locked");

console.log("S8 V3 intake regression passed: four byte-identical sources, 1,600 passages, 2,492 fingerprinted occurrences, 1,600 source-order primaries, blank human decisions, and no analyser reports.");
