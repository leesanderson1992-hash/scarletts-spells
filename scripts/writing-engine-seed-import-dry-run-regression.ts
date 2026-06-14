import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

import {
  buildSeedImportDryRunReport,
  renderMarkdownSummary,
  runSeedImportDryRun,
} from "./writing-engine-seed-import-dry-run";

function assertIncludes(values: string[], expected: string) {
  assert(
    values.includes(expected),
    `Expected ${JSON.stringify(values)} to include ${expected}`,
  );
}

function testFileOnlyValidation() {
  const csv = [
    "misspelling,correction,suggested_micro_skill_key,confidence,source,note,dialect,source_dataset,source_row_id,import_batch_name,pattern_hint,route_hint",
    "Buisness,business,D4_IRREGULAR_HIGH_FREQUENCY,high,manual_workbook,curated by operator,en-GB,manual-v1,row-1,batch-a,irregular,word_practice",
    "Buisness,business,D4_IRREGULAR_HIGH_FREQUENCY,85,manual_workbook,duplicate row,en-GB,manual-v1,row-2,batch-a,irregular,word_practice",
    "Buisness,business,D4_OTHER_SKILL,0.8,manual_workbook,conflicting skill,en-GB,manual-v1,row-3,batch-a,irregular,word_practice",
    "same,same,D4_IRREGULAR_HIGH_FREQUENCY,medium,manual_workbook,not useful,en-GB,manual-v1,row-4,batch-a,,",
    ",correction,D4_IRREGULAR_HIGH_FREQUENCY,120,manual_workbook,,en-GB,manual-v1,row-5,batch-a,,",
    '"quote,word",quoted,D4_QUOTED,low,wikipedia,"quoted CSV provenance",en-US,wiki,row-6,batch-b,,',
  ].join("\n");

  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: "fixture.csv",
    now: new Date("2026-06-14T12:00:00.000Z"),
  });

  assert.strictEqual(report.schema_version, "version_2_slice_4a_1");
  assert.strictEqual(report.dry_run_only, true);
  assert.strictEqual(report.input_format, "csv");
  assert.strictEqual(report.normalization_version, "spelling_normalize_v1");
  assert.strictEqual(report.summary.total_rows, 6);
  assert.strictEqual(report.summary.safe_for_candidate_review, 1);
  assert.strictEqual(report.summary.manual_review_required, 3);
  assert.strictEqual(report.summary.rejected_from_import, 2);
  assert.strictEqual(report.duplicate_groups.length, 1);
  assert.deepStrictEqual(report.duplicate_groups[0].row_numbers, [2, 3]);
  assert.strictEqual(report.conflict_groups.length, 1);
  assert.deepStrictEqual(report.conflict_groups[0].row_numbers, [2, 3, 4]);
  assert.deepStrictEqual(report.conflict_groups[0].suggested_micro_skill_keys, [
    "D4_IRREGULAR_HIGH_FREQUENCY",
    "D4_OTHER_SKILL",
  ]);

  const duplicateRow = report.rows.find((row) => row.row_number === 2);
  assert(duplicateRow);
  assert.strictEqual(duplicateRow.bucket, "manual_review_required");
  assertIncludes(duplicateRow.reasons, "duplicate_row_in_file");
  assertIncludes(duplicateRow.reasons, "conflicting_suggested_micro_skill_in_file");
  assert.strictEqual(duplicateRow.confidence_normalized, 0.85);

  const equalPairRow = report.rows.find((row) => row.row_number === 5);
  assert(equalPairRow);
  assert.strictEqual(equalPairRow.bucket, "rejected_from_import");
  assertIncludes(equalPairRow.reasons, "same_normalized_pair");
  assert.strictEqual(equalPairRow.confidence_normalized, 0.5);

  const invalidRow = report.rows.find((row) => row.row_number === 6);
  assert(invalidRow);
  assert.strictEqual(invalidRow.bucket, "rejected_from_import");
  assertIncludes(invalidRow.reasons, "empty_misspelling");
  assertIncludes(invalidRow.reasons, "invalid_confidence");
  assertIncludes(invalidRow.reasons, "missing_note_provenance");

  const quotedRow = report.rows.find((row) => row.row_number === 7);
  assert(quotedRow);
  assert.strictEqual(quotedRow.bucket, "safe_for_candidate_review");
  assert.strictEqual(quotedRow.misspelling, "quote,word");
  assert.strictEqual(quotedRow.misspelling_normalized, "quote,word");
  assert.strictEqual(quotedRow.dialect_code, "en-US");
  assert.strictEqual(quotedRow.confidence_normalized, 0.25);

  const summary = renderMarkdownSummary(report);
  assert(summary.includes("Dry run only: `true`"));
  assert(summary.includes("Row 5: Misspelling and correction normalize to the same value."));
  assert(summary.includes("No Supabase connection is created."));
}

function testMissingRequiredColumns() {
  const csv = [
    "misspelling,correction,confidence,source,note",
    "hav,have,0.7,manual,curated",
  ].join("\n");
  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: "missing-column.csv",
    now: new Date("2026-06-14T12:00:00.000Z"),
  });

  assert.strictEqual(report.summary.rejected_from_import, 1);
  assertIncludes(report.rows[0].reasons, "missing_required_column");
  assert(
    report.rows[0].blocking_errors.some((error) =>
      error.includes("suggested_micro_skill_key"),
    ),
  );
}

function testReportWrites() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-import-dry-run-"));
  const inputPath = path.join(tempDir, "candidates.csv");
  fs.writeFileSync(
    inputPath,
    [
      "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
      "natral,natural,D4_PATTERN,0.75,manual,curated",
    ].join("\n"),
  );

  const result = runSeedImportDryRun({
    inputFile: inputPath,
    outDir: path.join(tempDir, "reports"),
    now: new Date("2026-06-14T12:00:00.000Z"),
  });

  assert(fs.existsSync(result.jsonPath));
  assert(fs.existsSync(result.summaryPath));

  const writtenReport = JSON.parse(fs.readFileSync(result.jsonPath, "utf8"));
  assert.strictEqual(writtenReport.dry_run_only, true);
  assert.strictEqual(writtenReport.summary.safe_for_candidate_review, 1);
  assert(fs.readFileSync(result.summaryPath, "utf8").includes("Total rows: 1"));
}

function testNoSupabaseBoundary() {
  const scriptText = fs.readFileSync(
    path.join(process.cwd(), "scripts/writing-engine-seed-import-dry-run.ts"),
    "utf8",
  );

  assert(!scriptText.includes("@supabase"));
  assert(!scriptText.includes("createClient"));
  assert(!scriptText.includes("createServiceRoleClient"));
  assert(!/\n\s*\.from\(/.test(scriptText));
  assert(!scriptText.includes(".insert("));
  assert(!scriptText.includes(".update("));
  assert(!scriptText.includes(".upsert("));
  assert(!scriptText.includes(".delete("));
  assert(!scriptText.includes(".rpc("));
}

function run() {
  testFileOnlyValidation();
  testMissingRequiredColumns();
  testReportWrites();
  testNoSupabaseBoundary();
  console.log("writing-engine-seed-import-dry-run-regression: ok");
}

run();
