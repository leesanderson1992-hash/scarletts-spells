import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const auditDirectory = resolve(
  process.env.R8E_HISTORICAL_AUDIT_DIR?.trim() ||
    "../scarletts-spells-phase-e/outputs/r8e-historical-audit",
);

const expectedHashes: Record<string, string> = {
  "R8E-HISTORICAL-AUDIT.md":
    "f1a1f5fb8f8091f3091509620a2832b0f02125cc189e86212205a9e10af234fd",
  "r8e-anomalies.csv":
    "101ff1d87d785a5fcbb955b73d244990615eb562ac758bc3c8dd076d4af70fa4",
  "r8e-audit-receipt.json":
    "088a8e359180c0652fb7d62759fee2c53f2597444300b0d4985b3b9796c73620",
  "r8e-learning-occurrences.csv":
    "c62685de1334df8853165f75c1c129cc3d312b3e25c72071b131cc484abe3a94",
  "r8e-repair-candidates.csv":
    "ec1eb76bfe24295aa08371b5703083a0e294ae316779cc494497d1a8c783e297",
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

for (const [file, expectedHash] of Object.entries(expectedHashes)) {
  const path = resolve(auditDirectory, file);
  assert.ok(existsSync(path), `Missing R8E audit artifact: ${path}`);
  assert.equal(sha256(path), expectedHash, `R8E artifact changed: ${file}`);
}

const receipt = JSON.parse(
  readFileSync(resolve(auditDirectory, "r8e-audit-receipt.json"), "utf8"),
) as {
  baselineCommit: string;
  transactionReadOnly: boolean;
  mutationPerformed: boolean;
  metrics: Record<string, number>;
};
assert.equal(
  receipt.baselineCommit,
  "c07e37ffd6537594d077f9740d6686ca338e1f83",
);
assert.equal(receipt.transactionReadOnly, true);
assert.equal(receipt.mutationPerformed, false);
assert.equal(receipt.metrics.deterministic_repair_candidates, 19);
assert.equal(receipt.metrics.repair_after_r8d_candidates, 0);
assert.equal(receipt.metrics.ambiguous_manual_review_cases, 4);
assert.equal(receipt.metrics.missing_canonical_intake_candidates, 10);

const csvRows = parseCsv(
  readFileSync(resolve(auditDirectory, "r8e-repair-candidates.csv"), "utf8"),
);
const headers = csvRows[0] ?? [];
const records = csvRows.slice(1).map((values) =>
  Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
);
const safeRepairs = records.filter(
  (record) => record.future_repair_eligibility === "SAFE_DETERMINISTIC_REPAIR",
);
const ambiguous = records.filter(
  (record) => record.future_repair_eligibility === "AMBIGUOUS_MANUAL_REVIEW",
);
const repairAfterR8D = records.filter(
  (record) => record.future_repair_eligibility === "REPAIR_AFTER_R8D",
);
assert.equal(safeRepairs.length, 19);
assert.equal(ambiguous.length, 4);
assert.equal(repairAfterR8D.length, 0);
assert.ok(
  safeRepairs.every(
    (record) =>
      record.protected_assignment_count === "0" &&
      record.protected_schedule_count === "0" &&
      record.protected_encounter_count === "0",
  ),
  "R8E deterministic repair unexpectedly contains protected history",
);

const missingIntakeRepairs = safeRepairs.filter((record) =>
  record.classification.startsWith("MISSING_INTAKE_CANDIDATE"),
);
assert.ok(missingIntakeRepairs.length > 0);
assert.ok(
  missingIntakeRepairs.every(
    (record) =>
      record.governed_source_id !== "" &&
      record.intake_candidate_id === "" &&
      record.adle_learning_item_id === "" &&
      record.lineage_id === "",
  ),
  "R8E missing-intake repair would be falsely classified as consumed by R8D",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      artifactsUnchanged: true,
      deterministicRepairs: safeRepairs.length,
      repairAfterR8D: repairAfterR8D.length,
      ambiguousManual: ambiguous.length,
      missingIntakeRepairsRemainUnconsumed: missingIntakeRepairs.length,
      protectedHistoryRowsInDeterministicRepairs: 0,
      mutationPerformed: false,
    },
    null,
    2,
  )}\n`,
);
