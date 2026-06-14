import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

import {
  applyReadOnlyCatalogCanonicalComparison,
  buildSeedImportDryRunReport,
  getSeedImportDryRunHelp,
  renderMarkdownSummary,
  runSeedImportDryRun,
  wrapReadOnlySupabaseClient,
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

  assert.strictEqual(report.schema_version, "version_2_slice_4a_4");
  assert.strictEqual(report.dry_run_only, true);
  assert.strictEqual(report.input_format, "csv");
  assert.strictEqual(report.normalization_version, "spelling_normalize_v1");
  assert.strictEqual(report.database_comparison_mode, "none");
  assert.strictEqual(report.summary.total_rows, 6);
  assert.strictEqual(report.summary.safe_for_candidate_review, 1);
  assert.strictEqual(report.summary.manual_review_required, 3);
  assert.strictEqual(report.summary.rejected_from_import, 2);
  assert.strictEqual(report.skill_validation_summary.not_checked, 6);
  assert.strictEqual(report.canonical_mapping_summary.not_checked, true);
  assert.strictEqual(report.supporting_evidence_summary.not_checked, true);
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
  assert(summary.includes("Database comparison mode: `none`"));
  assert(summary.includes("Parent-local mapping matches: 0"));
  assert(summary.includes("Row 5: Misspelling and correction normalize to the same value."));
  assert(summary.includes("Supabase comparison is optional and read-only."));
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

function testCatalogAndCanonicalComparison() {
  const csv = [
    "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
    "buisness,business,D4_ACTIVE,0.9,manual,curated",
    "natrual,natural,D4_UNKNOWN,0.9,manual,curated",
    "hav,have,D4_INACTIVE,0.9,manual,curated",
    "gras,grass,D4_NON_ASSIGNABLE,0.9,manual,curated",
    "taik,take,D3_NON_D4,0.9,manual,curated",
    "recieve,receive,D4_CONFLICT,0.9,manual,curated",
    "hidden,hid,D4_ACTIVE,0.9,manual,curated",
  ].join("\n");
  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: "comparison.csv",
    now: new Date("2026-06-14T12:00:00.000Z"),
    comparisonData: {
      microSkills: [
        {
          micro_skill_key: "D4_ACTIVE",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
        {
          micro_skill_key: "D4_INACTIVE",
          mastery_domain_key: "D4",
          is_active: false,
          is_assignable: true,
        },
        {
          micro_skill_key: "D4_NON_ASSIGNABLE",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: false,
        },
        {
          micro_skill_key: "D3_NON_D4",
          mastery_domain_key: "D3",
          is_active: true,
          is_assignable: true,
        },
        {
          micro_skill_key: "D4_CONFLICT",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
        {
          micro_skill_key: "D4_CANONICAL_OTHER",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
      ],
      canonicalMappings: [
        {
          id: "canonical-business",
          misspelling_normalized: "buisness",
          correct_spelling_normalized: "business",
          micro_skill_key: "D4_ACTIVE",
          mapping_status: "active",
          dialect_code: "en-GB",
          normalization_version: "spelling_normalize_v1",
        },
        {
          id: "canonical-receive-conflict",
          misspelling_normalized: "recieve",
          correct_spelling_normalized: "receive",
          micro_skill_key: "D4_CANONICAL_OTHER",
          mapping_status: "active",
          dialect_code: "en-GB",
          normalization_version: "spelling_normalize_v1",
        },
        {
          id: "canonical-hidden",
          misspelling_normalized: "hidden",
          correct_spelling_normalized: "hid",
          micro_skill_key: "D4_ACTIVE",
          mapping_status: "active",
          dialect_code: "en-GB",
          normalization_version: "spelling_normalize_v1",
        },
      ],
    },
  });

  assert.strictEqual(report.database_comparison_mode, "fixture");
  assert.strictEqual(report.summary.safe_for_candidate_review, 0);
  assert.strictEqual(report.summary.manual_review_required, 2);
  assert.strictEqual(report.summary.rejected_from_import, 5);
  assert.strictEqual(report.skill_validation_summary.active_assignable_d4, 3);
  assert.strictEqual(report.skill_validation_summary.unknown, 1);
  assert.strictEqual(report.skill_validation_summary.inactive, 1);
  assert.strictEqual(report.skill_validation_summary.non_assignable, 1);
  assert.strictEqual(report.skill_validation_summary.non_d4, 1);
  assert.strictEqual(report.canonical_mapping_summary.same_pair_same_skill_matches, 2);
  assert.strictEqual(report.canonical_mapping_summary.same_pair_different_skill_conflicts, 1);
  assert.strictEqual(report.canonical_mapping_summary.hidden_or_non_visible_matches_counted, 3);

  const sameSkillRow = report.rows.find((row) => row.row_number === 2);
  assert(sameSkillRow);
  assert.strictEqual(sameSkillRow.bucket, "manual_review_required");
  assert.deepStrictEqual(sameSkillRow.matching_existing_canonical_mapping_ids, [
    "canonical-business",
  ]);

  const unknownSkillRow = report.rows.find((row) => row.row_number === 3);
  assert(unknownSkillRow);
  assert.strictEqual(unknownSkillRow.bucket, "rejected_from_import");
  assert.strictEqual(unknownSkillRow.skill_validation_status, "unknown");

  const inactiveSkillRow = report.rows.find((row) => row.row_number === 4);
  assert(inactiveSkillRow);
  assert.strictEqual(inactiveSkillRow.skill_validation_status, "inactive");

  const nonAssignableSkillRow = report.rows.find((row) => row.row_number === 5);
  assert(nonAssignableSkillRow);
  assert.strictEqual(nonAssignableSkillRow.skill_validation_status, "non_assignable");

  const nonD4SkillRow = report.rows.find((row) => row.row_number === 6);
  assert(nonD4SkillRow);
  assert.strictEqual(nonD4SkillRow.skill_validation_status, "non_d4");

  const conflictRow = report.rows.find((row) => row.row_number === 7);
  assert(conflictRow);
  assert.strictEqual(conflictRow.bucket, "rejected_from_import");
  assert.deepStrictEqual(conflictRow.conflicting_existing_canonical_mapping_ids, [
    "canonical-receive-conflict",
  ]);
}

function testSupportingEvidenceComparison() {
  const csv = [
    "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
    "lok,look,D4_ACTIVE,0.9,manual,curated",
    "lern,learn,D4_ACTIVE,0.9,manual,curated",
    "frend,friend,D4_ACTIVE,0.9,manual,curated",
  ].join("\n");
  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: "supporting-evidence.csv",
    now: new Date("2026-06-14T12:00:00.000Z"),
    comparisonData: {
      unavailableSources: ["spelling_catalog_review_case_decisions"],
      microSkills: [
        {
          micro_skill_key: "D4_ACTIVE",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
        {
          micro_skill_key: "D4_OTHER",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
      ],
      canonicalMappings: [],
      parentLocalMappings: [
        {
          id: "parent-local-same",
          misspelling_normalized: "lok",
          correct_spelling_normalized: "look",
          micro_skill_key: "D4_ACTIVE",
          candidate_status: "parent_local_promoted",
          promotion_scope: "parent_local",
        },
        {
          id: "parent-local-different",
          misspelling_normalized: "lok",
          correct_spelling_normalized: "look",
          micro_skill_key: "D4_OTHER",
          candidate_status: "parent_local_promoted",
          promotion_scope: "parent_local",
        },
      ],
      catalogReviewCases: [
        {
          id: "catalog-open",
          misspelling_normalized: "lern",
          correct_spelling_normalized: "learn",
          case_status: "open",
        },
        {
          id: "catalog-closed",
          misspelling_normalized: "lern",
          correct_spelling_normalized: "learn",
          case_status: "word_level_only",
        },
      ],
      catalogReviewDecisions: [
        {
          id: "decision-word-level",
          case_id: "catalog-closed",
          decision_type: "word_level_only",
          linked_micro_skill_key: null,
        },
      ],
      pcrmRecommendations: [
        {
          id: "pcrm-same",
          misspelling_normalized: "frend",
          correct_spelling_normalized: "friend",
          micro_skill_key: "D4_ACTIVE",
          recommendation_status: "accepted",
          canonical_mapping_id: null,
        },
        {
          id: "pcrm-different-adopted",
          misspelling_normalized: "frend",
          correct_spelling_normalized: "friend",
          micro_skill_key: "D4_OTHER",
          recommendation_status: "accepted",
          canonical_mapping_id: "canonical-friend",
        },
      ],
    },
  });

  assert.strictEqual(report.database_comparison_mode, "fixture");
  assert.strictEqual(report.summary.safe_for_candidate_review, 0);
  assert.strictEqual(report.summary.manual_review_required, 3);
  assert.strictEqual(report.summary.rejected_from_import, 0);
  assert.strictEqual(report.supporting_evidence_summary.not_checked, false);
  assert.strictEqual(report.supporting_evidence_summary.parent_local_mapping_matches, 2);
  assert.strictEqual(report.supporting_evidence_summary.catalog_review_case_matches, 2);
  assert.strictEqual(report.supporting_evidence_summary.catalog_review_decision_matches, 1);
  assert.strictEqual(report.supporting_evidence_summary.pcrm_recommendation_matches, 2);
  assert.deepStrictEqual(report.supporting_evidence_summary.unavailable_sources, [
    "spelling_catalog_review_case_decisions",
  ]);

  const parentLocalRow = report.rows.find((row) => row.row_number === 2);
  assert(parentLocalRow);
  assert.strictEqual(parentLocalRow.bucket, "manual_review_required");
  assert.strictEqual(parentLocalRow.supporting_evidence_counts.parent_local_same_skill, 1);
  assert.strictEqual(parentLocalRow.supporting_evidence_counts.parent_local_different_skill, 1);
  assert.deepStrictEqual(parentLocalRow.supporting_evidence_ids.parent_local_mapping_ids, [
    "parent-local-same",
    "parent-local-different",
  ]);
  assertIncludes(parentLocalRow.reasons, "supporting_parent_local_mapping_exists");

  const catalogReviewRow = report.rows.find((row) => row.row_number === 3);
  assert(catalogReviewRow);
  assert.strictEqual(catalogReviewRow.supporting_evidence_counts.open_catalog_review_cases, 1);
  assert.strictEqual(catalogReviewRow.supporting_evidence_counts.closed_catalog_review_cases, 1);
  assert.strictEqual(catalogReviewRow.supporting_evidence_counts.catalog_review_decisions, 1);
  assert.deepStrictEqual(catalogReviewRow.supporting_evidence_ids.catalog_review_case_ids, [
    "catalog-open",
    "catalog-closed",
  ]);
  assertIncludes(catalogReviewRow.reasons, "supporting_catalog_review_case_exists");

  const pcrmRow = report.rows.find((row) => row.row_number === 4);
  assert(pcrmRow);
  assert.strictEqual(pcrmRow.supporting_evidence_counts.pcrm_same_skill, 1);
  assert.strictEqual(pcrmRow.supporting_evidence_counts.pcrm_different_skill, 1);
  assert.strictEqual(pcrmRow.supporting_evidence_counts.pcrm_adopted, 1);
  assert.deepStrictEqual(pcrmRow.supporting_evidence_ids.pcrm_recommendation_ids, [
    "pcrm-same",
    "pcrm-different-adopted",
  ]);
  assertIncludes(pcrmRow.reasons, "supporting_pcrm_recommendation_exists");

  const summary = renderMarkdownSummary(report);
  assert(summary.includes("Supporting Evidence Comparison"));
  assert(summary.includes("PCRM recommendation matches: 2"));
  assert(summary.includes("Unavailable sources: spelling_catalog_review_case_decisions"));
}

async function testReportWrites() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-import-dry-run-"));
  const inputPath = path.join(tempDir, "candidates.csv");
  fs.writeFileSync(
    inputPath,
    [
      "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
      "natral,natural,D4_PATTERN,0.75,manual,curated",
    ].join("\n"),
  );

  const result = await runSeedImportDryRun({
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

async function testOperatorHardening() {
  const help = getSeedImportDryRunHelp();
  assert(help.includes("Usage:"));
  assert(help.includes("Default reports are written under .tmp/ and should not be committed."));
  assert(help.includes("scripts/fixtures/writing-engine-seed-import-sample.csv"));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-import-hardening-"));
  const nonCsvPath = path.join(tempDir, "candidates.txt");
  fs.writeFileSync(nonCsvPath, "not,csv\n");
  await assert.rejects(
    () =>
      runSeedImportDryRun({
        inputFile: nonCsvPath,
      }),
    /CSV input required/,
  );

  await assert.rejects(
    () =>
      runSeedImportDryRun({
        inputFile: path.join(tempDir, "missing.csv"),
      }),
    /Input CSV file not found/,
  );

  const csvPath = path.join(tempDir, "candidates.csv");
  fs.writeFileSync(
    csvPath,
    [
      "misspelling,correction,suggested_micro_skill_key,confidence,source,note",
      "sinthetic,synthetic,D4_PATTERN,0.8,operator_sample,synthetic hardening row",
    ].join("\n"),
  );
  await assert.rejects(
    () =>
      runSeedImportDryRun({
        inputFile: csvPath,
        jsonOut: path.join(tempDir, "same-report-path"),
        summaryOut: path.join(tempDir, "same-report-path"),
      }),
    /must be different/,
  );
}

function testNoSupabaseBoundary() {
  const scriptText = fs.readFileSync(
    path.join(process.cwd(), "scripts/writing-engine-seed-import-dry-run.ts"),
    "utf8",
  );

  assert(!scriptText.includes("createServiceRoleClient"));
  assert(!scriptText.includes(".insert("));
  assert(!scriptText.includes(".update("));
  assert(!scriptText.includes(".upsert("));
  assert(!scriptText.includes(".delete("));
}

function testNoMutationGuardRefusesWritesAndRpc() {
  const fakeBuilder = {
    select() {
      return Promise.resolve({ data: [], error: null, count: 0 });
    },
    insert() {
      return Promise.resolve({ data: [], error: null });
    },
    update() {
      return Promise.resolve({ data: [], error: null });
    },
    upsert() {
      return Promise.resolve({ data: [], error: null });
    },
    delete() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  const fakeClient = {
    from(_table: string) {
      return fakeBuilder;
    },
  };
  const readOnlyClient = wrapReadOnlySupabaseClient(fakeClient) as ReturnType<
    typeof wrapReadOnlySupabaseClient<typeof fakeClient>
  > & { rpc: (name: string) => never };

  assert.throws(() => readOnlyClient.from("micro_skill_catalog").insert(), /refuses insert/);
  assert.throws(() => readOnlyClient.from("micro_skill_catalog").update(), /refuses update/);
  assert.throws(() => readOnlyClient.from("micro_skill_catalog").upsert(), /refuses upsert/);
  assert.throws(() => readOnlyClient.from("micro_skill_catalog").delete(), /refuses delete/);
  assert.throws(() => readOnlyClient.rpc("unsafe_write"), /refuses rpc/);
}

async function run() {
  testFileOnlyValidation();
  testMissingRequiredColumns();
  testCatalogAndCanonicalComparison();
  testSupportingEvidenceComparison();
  await testReportWrites();
  await testOperatorHardening();
  testNoSupabaseBoundary();
  testNoMutationGuardRefusesWritesAndRpc();
  console.log("writing-engine-seed-import-dry-run-regression: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
