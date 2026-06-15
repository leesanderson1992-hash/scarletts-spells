import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

import {
  buildCandidateReviewImportPlan,
  CandidateReviewImportAdapter,
  runCandidateReviewImport,
} from "./writing-engine-seed-import-candidate-review";
import { buildSeedImportDryRunReport } from "./writing-engine-seed-import-dry-run";

const CONFIRM = "IMPORT_SEED_CANDIDATE_REVIEW_ROWS";

type FixtureFiles = {
  tempDir: string;
  csvPath: string;
  reportPath: string;
};

class FakeImportAdapter implements CandidateReviewImportAdapter {
  activeBatch: { id: string } | null = null;
  insertedBatch: Record<string, unknown> | null = null;
  insertedRows: Array<Record<string, unknown>> = [];
  protectedCountsBefore: Record<string, number> = {
    micro_skill_catalog: 3,
    spelling_canonical_mappings: 1,
    spelling_canonical_mapping_events: 0,
    spelling_canonical_mapping_recommendations: 0,
    spelling_catalog_review_cases: 0,
    spelling_catalog_review_case_decisions: 0,
    parent_verified_spelling_candidate_mappings: 0,
    learning_items: 0,
    assignment_items: 0,
    learning_item_evidence: 0,
    writing_issues: 0,
    parent_verifications: 0,
  };
  protectedCountsAfter: Record<string, number> = { ...this.protectedCountsBefore };
  fetchProtectedCountsCalls = 0;
  storageReady = true;
  rowInsertFailure: Error | null = null;
  quarantinedBatch: Record<string, unknown> | null = null;
  skills = [
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
  ];

  async assertSeedStorageReady() {
    if (!this.storageReady) {
      throw new Error("seed storage missing");
    }
  }

  async findActiveBatchBySourceHash() {
    return this.activeBatch;
  }

  async fetchMicroSkills(keys: string[]) {
    return this.skills.filter((skill) => keys.includes(skill.micro_skill_key));
  }

  async fetchProtectedCounts() {
    this.fetchProtectedCountsCalls += 1;
    return this.fetchProtectedCountsCalls === 1
      ? this.protectedCountsBefore
      : this.protectedCountsAfter;
  }

  async insertBatch(batch: Record<string, unknown>) {
    this.insertedBatch = batch;
    return { id: "seed-batch-1" };
  }

  async insertRows(rows: Array<Record<string, unknown>>) {
    if (this.rowInsertFailure) {
      throw this.rowInsertFailure;
    }
    this.insertedRows = rows;
  }

  async updateBatchStatus(batchId: string, update: Record<string, unknown>) {
    this.quarantinedBatch = { batchId, ...update };
  }
}

function validSchemaProof(kind: "local" | "staging" | "production" = "local") {
  return {
    schema_version: "slice_4c_seed_import_storage_v1" as const,
    generated_at: "2026-06-15T10:00:00.000Z",
    database_target: {
      kind,
      url_host: kind === "local" ? "127.0.0.1" : "example.supabase.co",
    },
    tables: [
      {
        table_name: "spelling_seed_import_batches",
        rls_enabled: true,
        anon_grants: [],
        authenticated_grants: [],
        service_role_grants: ["SELECT", "INSERT", "UPDATE", "DELETE"],
        policy_count: 0,
      },
      {
        table_name: "spelling_seed_import_rows",
        rls_enabled: true,
        anon_grants: [],
        authenticated_grants: [],
        service_role_grants: ["SELECT", "INSERT", "UPDATE", "DELETE"],
        policy_count: 0,
      },
    ],
    required_indexes: [
      "spelling_seed_import_batches_active_source_hash_idx",
      "spelling_seed_import_rows_batch_normalized_triple_idx",
    ],
    required_constraints: [
      "spelling_seed_import_rows_normalized_pair_check",
      "spelling_seed_import_rows_confidence_check",
      "spelling_seed_import_rows_dry_run_bucket_check",
      "spelling_seed_import_rows_status_check",
    ],
  };
}

function baseOptions(fixture: FixtureFiles, confirmationToken = CONFIRM) {
  return {
    sourceCsvPath: fixture.csvPath,
    dryRunReportPath: fixture.reportPath,
    slice4cSchemaProof: validSchemaProof(),
    sourceLicenseNote: "licensed",
    confirmationToken,
  };
}

function writeFixtureFiles(transform?: (report: ReturnType<typeof buildSeedImportDryRunReport>) => void): FixtureFiles {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-import-candidate-review-"));
  const csvPath = path.join(tempDir, "candidates.csv");
  const reportPath = path.join(tempDir, "dry-run-report.json");
  const csv = [
    "misspelling,correction,suggested_micro_skill_key,confidence,source,note,dialect,source_dataset,source_row_id,import_batch_name",
    "buisness,business,D4_ACTIVE,0.9,manual_workbook,curated source note,en-GB,manual-v1,row-1,batch-one",
    "hav,have,D4_ACTIVE,0.7,manual_workbook,already canonical,en-GB,manual-v1,row-2,batch-one",
    "same,same,D4_ACTIVE,0.8,manual_workbook,not useful,en-GB,manual-v1,row-3,batch-one",
  ].join("\n");
  fs.writeFileSync(csvPath, `${csv}\n`);

  const report = buildSeedImportDryRunReport({
    csvText: csv,
    inputFile: csvPath,
    now: new Date("2026-06-15T09:30:00.000Z"),
    comparisonData: {
      microSkills: [
        {
          micro_skill_key: "D4_ACTIVE",
          mastery_domain_key: "D4",
          is_active: true,
          is_assignable: true,
        },
      ],
      canonicalMappings: [
        {
          id: "canonical-have",
          misspelling_normalized: "hav",
          correct_spelling_normalized: "have",
          micro_skill_key: "D4_ACTIVE",
          mapping_status: "active",
          dialect_code: "en-GB",
          normalization_version: "spelling_normalize_v1",
        },
      ],
    },
  });
  transform?.(report);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { tempDir, csvPath, reportPath };
}

async function assertRejectsWith(
  action: () => Promise<unknown>,
  expectedMessage: string,
) {
  await assert.rejects(action, (error) => {
    assert(error instanceof Error);
    assert(
      error.message.includes(expectedMessage),
      `Expected ${JSON.stringify(error.message)} to include ${expectedMessage}`,
    );
    return true;
  });
}

async function testSuccessfulImportPlanAndRun() {
  const fixture = writeFixtureFiles();
  const adapter = new FakeImportAdapter();
  const result = await runCandidateReviewImport(
    {
      ...baseOptions(fixture),
      sourceLicenseNote: "operator-owned seed file",
      createdByAdminEmail: "admin@example.test",
      now: new Date("2026-06-15T10:00:00.000Z"),
    },
    adapter,
  );

  assert.strictEqual(result.batchId, "seed-batch-1");
  assert.strictEqual(result.insertedRowCount, 1);
  assert.strictEqual(adapter.insertedRows.length, 1);
  assert.strictEqual(adapter.insertedRows[0].raw_misspelling, "buisness");
  assert.strictEqual(adapter.insertedRows[0].batch_id, "seed-batch-1");
  assert.strictEqual(adapter.insertedRows[0].row_status, "pending_candidate_review");
  assert.strictEqual(adapter.insertedRows[0].canonical_mapping_id, undefined);
  assert(adapter.insertedBatch);
  assert.strictEqual(adapter.insertedBatch.batch_status, "pending_candidate_review");
  assert.strictEqual(adapter.insertedBatch.total_row_count, 3);
  assert.strictEqual(adapter.insertedBatch.candidate_review_row_count, 1);
  assert.strictEqual(adapter.insertedBatch.manual_review_row_count, 1);
  assert.strictEqual(adapter.insertedBatch.rejected_row_count, 1);
  assert.strictEqual(adapter.insertedBatch.source_license_note, "operator-owned seed file");
}

async function testRejectsWithoutConfirmation() {
  const fixture = writeFixtureFiles();
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture, ""),
        new FakeImportAdapter(),
      ),
    "Refusing import without --confirm",
  );
}

async function testRejectsInvalidSchemaVersion() {
  const fixture = writeFixtureFiles((report) => {
    report.schema_version = "old_schema";
  });
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        new FakeImportAdapter(),
      ),
    "Unsupported dry-run schema version",
  );
}

async function testRejectsStaleReportWhenCsvChanges() {
  const fixture = writeFixtureFiles();
  const changedCsv = fs
    .readFileSync(fixture.csvPath, "utf8")
    .replace("buisness,business", "busness,business");
  fs.writeFileSync(fixture.csvPath, changedCsv);

  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        new FakeImportAdapter(),
      ),
    "Source CSV no longer matches the approved dry-run report",
  );
}

async function testRejectsMissingSchemaProof() {
  const fixture = writeFixtureFiles();
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        {
          sourceCsvPath: fixture.csvPath,
          dryRunReportPath: fixture.reportPath,
          sourceLicenseNote: "licensed",
          confirmationToken: CONFIRM,
        },
        new FakeImportAdapter(),
      ),
    "Slice 4C schema proof is required",
  );
}

async function testRejectsHostedSchemaProofWithoutHostedFlag() {
  const fixture = writeFixtureFiles();
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        {
          ...baseOptions(fixture),
          slice4cSchemaProof: validSchemaProof("staging"),
        },
        new FakeImportAdapter(),
      ),
    "Hosted seed import writes require --allow-hosted-write",
  );
}

async function testAcceptsHostedSchemaProofWithHostedFlag() {
  const fixture = writeFixtureFiles();
  const plan = await buildCandidateReviewImportPlan(
    {
      ...baseOptions(fixture),
      slice4cSchemaProof: validSchemaProof("staging"),
      allowHostedWrite: true,
    },
    new FakeImportAdapter(),
  );
  assert.strictEqual(plan.rows.length, 1);
}

async function testRejectsIncompleteSchemaProof() {
  const fixture = writeFixtureFiles();
  const proof = validSchemaProof();
  proof.tables[0].rls_enabled = false;
  proof.required_indexes = [];
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        {
          ...baseOptions(fixture),
          slice4cSchemaProof: proof,
        },
        new FakeImportAdapter(),
      ),
    "Slice 4C schema proof failed",
  );
}

async function testRejectsHashMismatch() {
  const fixture = writeFixtureFiles();
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        {
          ...baseOptions(fixture),
          expectedSourceFileSha256: "not-the-hash",
        },
        new FakeImportAdapter(),
      ),
    "Source CSV SHA-256 does not match",
  );
}

async function testRejectsInvalidNormalizationVersion() {
  const fixture = writeFixtureFiles((report) => {
    report.normalization_version = "future_normalizer";
  });
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        new FakeImportAdapter(),
      ),
    "Unsupported normalization version",
  );
}

async function testRejectsBadCandidateRowFields() {
  const fixture = writeFixtureFiles((report) => {
    report.rows[0].dialect_code = "";
    report.rows[0].confidence_normalized = 1.5;
  });
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        new FakeImportAdapter(),
      ),
    "Source CSV no longer matches the approved dry-run report",
  );
}

async function testRejectsMicroSkillImportTimeFailure() {
  const fixture = writeFixtureFiles();
  const adapter = new FakeImportAdapter();
  adapter.skills = [
    {
      micro_skill_key: "D4_ACTIVE",
      mastery_domain_key: "D4",
      is_active: false,
      is_assignable: true,
    },
  ];
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        adapter,
      ),
    "Import-time micro-skill validation failed",
  );
}

async function testRejectsCanonicalConflictOnCandidateRow() {
  const fixture = writeFixtureFiles((report) => {
    report.rows[0].conflicting_existing_canonical_mapping_ids = ["canonical-conflict"];
  });
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        new FakeImportAdapter(),
      ),
    "canonical conflict ids are present",
  );
}

async function testRejectsDuplicateActiveSourceHash() {
  const fixture = writeFixtureFiles();
  const adapter = new FakeImportAdapter();
  adapter.activeBatch = { id: "existing-batch" };
  await assertRejectsWith(
    () =>
      buildCandidateReviewImportPlan(
        baseOptions(fixture),
        adapter,
      ),
    "Active seed import batch already exists",
  );
}

async function testRejectsProtectedCountChange() {
  const fixture = writeFixtureFiles();
  const adapter = new FakeImportAdapter();
  adapter.protectedCountsAfter = {
    ...adapter.protectedCountsBefore,
    learning_items: 1,
  };
  await assertRejectsWith(
    () =>
      runCandidateReviewImport(
        baseOptions(fixture),
        adapter,
      ),
    "Protected table counts changed",
  );
  assert(adapter.quarantinedBatch);
  assert.strictEqual(adapter.quarantinedBatch.batch_status, "quarantined");
}

async function testQuarantinesBatchAfterRowInsertFailure() {
  const fixture = writeFixtureFiles();
  const adapter = new FakeImportAdapter();
  adapter.rowInsertFailure = new Error("row insert blocked");
  await assertRejectsWith(
    () =>
      runCandidateReviewImport(
        baseOptions(fixture),
        adapter,
      ),
    "row insert blocked",
  );
  assert(adapter.quarantinedBatch);
  assert.strictEqual(adapter.quarantinedBatch.batch_status, "quarantined");
}

async function main() {
  await testSuccessfulImportPlanAndRun();
  await testRejectsWithoutConfirmation();
  await testRejectsInvalidSchemaVersion();
  await testRejectsStaleReportWhenCsvChanges();
  await testRejectsMissingSchemaProof();
  await testRejectsHostedSchemaProofWithoutHostedFlag();
  await testAcceptsHostedSchemaProofWithHostedFlag();
  await testRejectsIncompleteSchemaProof();
  await testRejectsHashMismatch();
  await testRejectsInvalidNormalizationVersion();
  await testRejectsBadCandidateRowFields();
  await testRejectsMicroSkillImportTimeFailure();
  await testRejectsCanonicalConflictOnCandidateRow();
  await testRejectsDuplicateActiveSourceHash();
  await testRejectsProtectedCountChange();
  await testQuarantinesBatchAfterRowInsertFailure();
  console.log("writing-engine-seed-import-candidate-review-regression: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
