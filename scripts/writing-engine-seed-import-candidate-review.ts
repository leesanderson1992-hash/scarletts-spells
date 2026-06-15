import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

import { buildSeedImportDryRunReport } from "./writing-engine-seed-import-dry-run";
import type {
  SeedImportDryRunReport,
  SeedImportDryRunRow,
} from "./writing-engine-seed-import-dry-run";

const APPROVED_DRY_RUN_SCHEMA_VERSION = "version_2_slice_4a_4";
const REQUIRED_NORMALIZATION_VERSION = "spelling_normalize_v1";
const CONFIRMATION_TOKEN = "IMPORT_SEED_CANDIDATE_REVIEW_ROWS";

const SEED_TABLES = [
  "spelling_seed_import_batches",
  "spelling_seed_import_rows",
] as const;

const PROTECTED_TABLES = [
  "micro_skill_catalog",
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
  "spelling_canonical_mapping_recommendations",
  "spelling_catalog_review_cases",
  "spelling_catalog_review_case_decisions",
  "parent_verified_spelling_candidate_mappings",
  "learning_items",
  "assignment_items",
  "learning_item_evidence",
  "writing_issues",
  "parent_verifications",
] as const;

type ProtectedCounts = Record<string, number>;

type MicroSkillEligibility = {
  micro_skill_key: string;
  mastery_domain_key: string | null;
  is_active: boolean | null;
  is_assignable: boolean | null;
};

type CandidateReviewImportOptions = {
  sourceCsvPath: string;
  dryRunReportPath: string;
  slice4cSchemaProofPath?: string;
  slice4cSchemaProof?: Slice4CSchemaProof;
  batchName?: string;
  sourceName?: string;
  sourceDataset?: string;
  sourceUrl?: string;
  sourceLicenseNote: string;
  dryRunReportArtifactRef?: string;
  createdByAdminUserId?: string;
  createdByAdminEmail?: string;
  expectedSourceFileSha256?: string;
  expectedDryRunReportSha256?: string;
  allowHostedWrite?: boolean;
  confirmationToken: string;
  now?: Date;
};

type CandidateReviewImportPlan = {
  batch: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  sourceFileSha256: string;
  dryRunReportSha256: string;
  protectedCountsBefore: ProtectedCounts;
};

type CandidateReviewImportResult = {
  batchId: string;
  insertedRowCount: number;
  sourceFileSha256: string;
  dryRunReportSha256: string;
  protectedCountsBefore: ProtectedCounts;
  protectedCountsAfter: ProtectedCounts;
};

export type CandidateReviewImportAdapter = {
  assertSeedStorageReady(): Promise<void>;
  findActiveBatchBySourceHash(sourceFileSha256: string): Promise<{ id: string } | null>;
  fetchMicroSkills(keys: string[]): Promise<MicroSkillEligibility[]>;
  fetchProtectedCounts(): Promise<ProtectedCounts>;
  insertBatch(batch: Record<string, unknown>): Promise<{ id: string }>;
  insertRows(rows: Array<Record<string, unknown>>): Promise<void>;
  updateBatchStatus?(
    batchId: string,
    update: Record<string, unknown>,
  ): Promise<void>;
};

type ParsedArgs = CandidateReviewImportOptions & {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  help?: boolean;
};

type Slice4CSchemaProofTable = {
  table_name: string;
  rls_enabled: boolean;
  anon_grants: string[];
  authenticated_grants: string[];
  service_role_grants: string[];
  policy_count: number;
};

type Slice4CSchemaProof = {
  schema_version: "slice_4c_seed_import_storage_v1";
  generated_at: string;
  database_target: {
    kind: "local" | "staging" | "production";
    url_host?: string;
  };
  tables: Slice4CSchemaProofTable[];
  required_indexes: string[];
  required_constraints: string[];
};

function sha256File(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertNonEmpty(value: string | undefined, label: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function parseJsonReport(filePath: string): SeedImportDryRunReport {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SeedImportDryRunReport;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
    throw new Error("Dry-run report is not a valid Slice 4A report.");
  }
  return parsed;
}

function parseSlice4CSchemaProof(options: CandidateReviewImportOptions) {
  if (options.slice4cSchemaProof) {
    return options.slice4cSchemaProof;
  }

  if (!options.slice4cSchemaProofPath) {
    throw new Error(
      "Slice 4C schema proof is required. Pass --slice-4c-schema-proof path/to/proof.json.",
    );
  }

  const proofPath = path.resolve(options.slice4cSchemaProofPath);
  if (!fs.existsSync(proofPath) || !fs.statSync(proofPath).isFile()) {
    throw new Error(`Slice 4C schema proof file not found: ${proofPath}`);
  }
  return JSON.parse(fs.readFileSync(proofPath, "utf8")) as Slice4CSchemaProof;
}

function validateSlice4CSchemaProof(proof: Slice4CSchemaProof, allowHostedWrite?: boolean) {
  if (proof.schema_version !== "slice_4c_seed_import_storage_v1") {
    throw new Error("Slice 4C schema proof has an unsupported schema_version.");
  }

  if (!proof.generated_at || Number.isNaN(Date.parse(proof.generated_at))) {
    throw new Error("Slice 4C schema proof must include a valid generated_at timestamp.");
  }

  if (proof.database_target.kind !== "local" && allowHostedWrite !== true) {
    throw new Error(
      "Hosted seed import writes require --allow-hosted-write and separate release approval.",
    );
  }

  const tableMap = new Map(proof.tables.map((table) => [table.table_name, table]));
  const errors: string[] = [];

  for (const tableName of SEED_TABLES) {
    const table = tableMap.get(tableName);
    if (!table) {
      errors.push(`${tableName}: missing from Slice 4C schema proof.`);
      continue;
    }

    if (table.rls_enabled !== true) {
      errors.push(`${tableName}: RLS is not enabled.`);
    }

    if (table.policy_count !== 0) {
      errors.push(`${tableName}: expected zero RLS policies.`);
    }

    if (table.anon_grants.length > 0) {
      errors.push(`${tableName}: anon grants are present.`);
    }

    if (table.authenticated_grants.length > 0) {
      errors.push(`${tableName}: authenticated grants are present.`);
    }

    if (!table.service_role_grants.includes("INSERT")) {
      errors.push(`${tableName}: service_role INSERT grant is missing.`);
    }

    if (!table.service_role_grants.includes("SELECT")) {
      errors.push(`${tableName}: service_role SELECT grant is missing.`);
    }
  }

  const requiredIndexes = [
    "spelling_seed_import_batches_active_source_hash_idx",
    "spelling_seed_import_rows_batch_normalized_triple_idx",
  ];
  for (const indexName of requiredIndexes) {
    if (!proof.required_indexes.includes(indexName)) {
      errors.push(`${indexName}: required Slice 4C index missing from proof.`);
    }
  }

  const requiredConstraints = [
    "spelling_seed_import_rows_normalized_pair_check",
    "spelling_seed_import_rows_confidence_check",
    "spelling_seed_import_rows_dry_run_bucket_check",
    "spelling_seed_import_rows_status_check",
  ];
  for (const constraintName of requiredConstraints) {
    if (!proof.required_constraints.includes(constraintName)) {
      errors.push(`${constraintName}: required Slice 4C constraint missing from proof.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Slice 4C schema proof failed:\n- ${errors.join("\n- ")}`);
  }
}

function getSourceName(rows: SeedImportDryRunRow[], explicitSourceName?: string) {
  if (explicitSourceName?.trim()) {
    return explicitSourceName.trim();
  }

  const sourceNames = [...new Set(rows.map((row) => row.source.trim()).filter(Boolean))];
  if (sourceNames.length === 1) {
    return sourceNames[0];
  }

  throw new Error(
    "Import has multiple or missing source names; pass --source-name explicitly.",
  );
}

function getSourceDataset(rows: SeedImportDryRunRow[], explicitSourceDataset?: string) {
  if (explicitSourceDataset?.trim()) {
    return explicitSourceDataset.trim();
  }

  const datasets = [
    ...new Set(rows.map((row) => row.source_dataset?.trim()).filter(Boolean)),
  ];
  return datasets.length === 1 ? datasets[0] : null;
}

function getSourceUrl(rows: SeedImportDryRunRow[], explicitSourceUrl?: string) {
  if (explicitSourceUrl?.trim()) {
    return explicitSourceUrl.trim();
  }

  const urls = [...new Set(rows.map((row) => row.source_url?.trim()).filter(Boolean))];
  return urls.length === 1 ? urls[0] : null;
}

function rowHash(row: SeedImportDryRunRow) {
  return sha256Text(
    JSON.stringify({
      row_number: row.row_number,
      source_row_id: row.source_row_id,
      misspelling_normalized: row.misspelling_normalized,
      correct_spelling_normalized: row.correct_spelling_normalized,
      dialect_code: row.dialect_code,
      suggested_micro_skill_key: row.suggested_micro_skill_key,
    }),
  );
}

function requireReportBasics(
  report: SeedImportDryRunReport,
  sourceCsvPath: string,
  dryRunReportPath: string,
) {
  if (report.schema_version !== APPROVED_DRY_RUN_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported dry-run schema version: ${report.schema_version}. Expected ${APPROVED_DRY_RUN_SCHEMA_VERSION}.`,
    );
  }

  if (report.normalization_version !== REQUIRED_NORMALIZATION_VERSION) {
    throw new Error(
      `Unsupported normalization version: ${report.normalization_version}. Expected ${REQUIRED_NORMALIZATION_VERSION}.`,
    );
  }

  if (report.dry_run_only !== true) {
    throw new Error("Dry-run report must have dry_run_only: true.");
  }

  if (report.input_format !== "csv") {
    throw new Error("Slice 4D candidate-review import accepts CSV dry-run reports only.");
  }

  if (path.resolve(report.input_file) !== path.resolve(sourceCsvPath)) {
    throw new Error(
      `Dry-run report input_file does not match source CSV. Report: ${report.input_file}; source: ${sourceCsvPath}`,
    );
  }

  if (!fs.existsSync(sourceCsvPath) || !fs.statSync(sourceCsvPath).isFile()) {
    throw new Error(`Source CSV file not found: ${sourceCsvPath}`);
  }

  if (!fs.existsSync(dryRunReportPath) || !fs.statSync(dryRunReportPath).isFile()) {
    throw new Error(`Dry-run JSON report file not found: ${dryRunReportPath}`);
  }
}

function nullableString(value: string | null | undefined) {
  return value?.trim() || null;
}

function requireSourceCsvMatchesReport(csvText: string, report: SeedImportDryRunReport) {
  const currentReport = buildSeedImportDryRunReport({
    csvText,
    inputFile: report.input_file,
    now: new Date(report.generated_at),
  });

  const errors: string[] = [];
  if (currentReport.rows.length !== report.rows.length) {
    errors.push(
      `row count changed: current CSV has ${currentReport.rows.length}, report has ${report.rows.length}`,
    );
  }

  const length = Math.min(currentReport.rows.length, report.rows.length);
  for (let index = 0; index < length; index += 1) {
    const current = currentReport.rows[index];
    const approved = report.rows[index];
    const fields: Array<[string, unknown, unknown]> = [
      ["row_number", current.row_number, approved.row_number],
      ["misspelling", current.misspelling, approved.misspelling],
      ["correction", current.correction, approved.correction],
      [
        "misspelling_normalized",
        current.misspelling_normalized,
        approved.misspelling_normalized,
      ],
      [
        "correct_spelling_normalized",
        current.correct_spelling_normalized,
        approved.correct_spelling_normalized,
      ],
      ["dialect_code", current.dialect_code, approved.dialect_code],
      [
        "suggested_micro_skill_key",
        current.suggested_micro_skill_key,
        approved.suggested_micro_skill_key,
      ],
      ["confidence_original", current.confidence_original, approved.confidence_original],
      [
        "confidence_normalized",
        current.confidence_normalized,
        approved.confidence_normalized,
      ],
      ["source", current.source, approved.source],
      [
        "source_dataset",
        nullableString(current.source_dataset),
        nullableString(approved.source_dataset),
      ],
      [
        "source_url",
        nullableString(current.source_url),
        nullableString(approved.source_url),
      ],
      ["note", current.note, approved.note],
      ["age_band", nullableString(current.age_band), nullableString(approved.age_band)],
      [
        "pattern_hint",
        nullableString(current.pattern_hint),
        nullableString(approved.pattern_hint),
      ],
      ["route_hint", nullableString(current.route_hint), nullableString(approved.route_hint)],
      [
        "source_row_id",
        nullableString(current.source_row_id),
        nullableString(approved.source_row_id),
      ],
      [
        "import_batch_name",
        nullableString(current.import_batch_name),
        nullableString(approved.import_batch_name),
      ],
    ];

    for (const [field, currentValue, approvedValue] of fields) {
      if (currentValue !== approvedValue) {
        errors.push(
          `row ${approved.row_number} ${field} changed: current=${JSON.stringify(
            currentValue,
          )}, report=${JSON.stringify(approvedValue)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Source CSV no longer matches the approved dry-run report:\n- ${errors.join("\n- ")}`,
    );
  }
}

function validateCandidateRows(report: SeedImportDryRunReport) {
  const candidateRows = report.rows.filter(
    (row) => row.bucket === "safe_for_candidate_review",
  );

  if (candidateRows.length === 0) {
    throw new Error("No safe_for_candidate_review rows are eligible for Slice 4D import.");
  }

  const duplicateRows = new Set(
    report.duplicate_groups.flatMap((group) => group.row_numbers),
  );
  const conflictRows = new Set(
    report.conflict_groups.flatMap((group) => group.row_numbers),
  );
  const normalizedTriples = new Set<string>();
  const errors: string[] = [];

  for (const row of candidateRows) {
    const rowLabel = `Row ${row.row_number}`;

    if (!row.misspelling_normalized?.trim()) {
      errors.push(`${rowLabel}: normalized misspelling is missing.`);
    }

    if (!row.correct_spelling_normalized?.trim()) {
      errors.push(`${rowLabel}: normalized correction is missing.`);
    }

    if (
      row.misspelling_normalized?.trim() &&
      row.correct_spelling_normalized?.trim() &&
      row.misspelling_normalized.trim() === row.correct_spelling_normalized.trim()
    ) {
      errors.push(`${rowLabel}: normalized misspelling and correction are equal.`);
    }

    if (!row.dialect_code?.trim()) {
      errors.push(`${rowLabel}: dialect is missing.`);
    }

    if (
      row.confidence_normalized !== null &&
      (row.confidence_normalized < 0 || row.confidence_normalized > 1)
    ) {
      errors.push(`${rowLabel}: confidence is outside 0..1.`);
    }

    if (row.skill_validation_status !== "active_assignable_d4") {
      errors.push(
        `${rowLabel}: suggested micro-skill is not validated active/assignable/D4.`,
      );
    }

    if (row.conflicting_existing_canonical_mapping_ids.length > 0) {
      errors.push(`${rowLabel}: canonical conflict ids are present.`);
    }

    if (row.matching_existing_canonical_mapping_ids.length > 0) {
      errors.push(`${rowLabel}: existing same-skill canonical mapping ids are present.`);
    }

    if (duplicateRows.has(row.row_number)) {
      errors.push(`${rowLabel}: row belongs to a duplicate group.`);
    }

    if (conflictRows.has(row.row_number)) {
      errors.push(`${rowLabel}: row belongs to a same-file conflict group.`);
    }

    if (!row.source?.trim()) {
      errors.push(`${rowLabel}: source is missing.`);
    }

    if (!row.note?.trim()) {
      errors.push(`${rowLabel}: provenance note is missing.`);
    }

    const triple = [
      row.misspelling_normalized,
      row.correct_spelling_normalized,
      row.dialect_code,
    ].join("\u0000");
    if (normalizedTriples.has(triple)) {
      errors.push(`${rowLabel}: duplicate normalized triple among candidate rows.`);
    }
    normalizedTriples.add(triple);
  }

  if (errors.length > 0) {
    throw new Error(`Candidate-review import validation failed:\n- ${errors.join("\n- ")}`);
  }

  return candidateRows;
}

async function requireMicroSkillEligibility(
  adapter: CandidateReviewImportAdapter,
  rows: SeedImportDryRunRow[],
) {
  const keys = [...new Set(rows.map((row) => row.suggested_micro_skill_key))];
  const found = new Map(
    (await adapter.fetchMicroSkills(keys)).map((row) => [row.micro_skill_key, row]),
  );
  const errors: string[] = [];

  for (const key of keys) {
    const skill = found.get(key);
    if (!skill) {
      errors.push(`${key}: missing from micro_skill_catalog.`);
      continue;
    }

    if (
      skill.mastery_domain_key !== "D4" ||
      skill.is_active !== true ||
      skill.is_assignable !== true
    ) {
      errors.push(`${key}: not active, assignable, and D4 in micro_skill_catalog.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Import-time micro-skill validation failed:\n- ${errors.join("\n- ")}`);
  }
}

function countRowsInGroups(groups: Array<{ row_numbers: number[] }>) {
  return new Set(groups.flatMap((group) => group.row_numbers)).size;
}

export async function buildCandidateReviewImportPlan(
  options: CandidateReviewImportOptions,
  adapter: CandidateReviewImportAdapter,
): Promise<CandidateReviewImportPlan> {
  const sourceCsvPath = path.resolve(options.sourceCsvPath);
  const dryRunReportPath = path.resolve(options.dryRunReportPath);
  const sourceLicenseNote = assertNonEmpty(
    options.sourceLicenseNote,
    "Source license note",
  );

  if (options.confirmationToken !== CONFIRMATION_TOKEN) {
    throw new Error(
      `Refusing import without --confirm ${CONFIRMATION_TOKEN}.`,
    );
  }

  const report = parseJsonReport(dryRunReportPath);
  requireReportBasics(report, sourceCsvPath, dryRunReportPath);
  const csvText = fs.readFileSync(sourceCsvPath, "utf8");
  requireSourceCsvMatchesReport(csvText, report);
  validateSlice4CSchemaProof(
    parseSlice4CSchemaProof(options),
    options.allowHostedWrite,
  );

  const sourceFileSha256 = sha256File(sourceCsvPath);
  const dryRunReportSha256 = sha256File(dryRunReportPath);

  if (
    options.expectedSourceFileSha256 &&
    options.expectedSourceFileSha256 !== sourceFileSha256
  ) {
    throw new Error("Source CSV SHA-256 does not match the approved hash.");
  }

  if (
    options.expectedDryRunReportSha256 &&
    options.expectedDryRunReportSha256 !== dryRunReportSha256
  ) {
    throw new Error("Dry-run report SHA-256 does not match the approved hash.");
  }

  const candidateRows = validateCandidateRows(report);

  await adapter.assertSeedStorageReady();
  const existingBatch = await adapter.findActiveBatchBySourceHash(sourceFileSha256);
  if (existingBatch) {
    throw new Error(
      `Active seed import batch already exists for source hash ${sourceFileSha256}: ${existingBatch.id}`,
    );
  }
  await requireMicroSkillEligibility(adapter, candidateRows);
  const protectedCountsBefore = await adapter.fetchProtectedCounts();

  const now = (options.now ?? new Date()).toISOString();
  const sourceName = getSourceName(candidateRows, options.sourceName);
  const sourceDataset = getSourceDataset(candidateRows, options.sourceDataset);
  const sourceUrl = getSourceUrl(candidateRows, options.sourceUrl);
  const batchName =
    options.batchName?.trim() ||
    candidateRows.find((row) => row.import_batch_name?.trim())?.import_batch_name?.trim() ||
    `${sourceName} seed candidate import ${now.slice(0, 10)}`;

  const importedRowNumbers = candidateRows.map((row) => row.row_number);
  const batch = {
    batch_name: batchName,
    source_name: sourceName,
    source_dataset: sourceDataset,
    source_url: sourceUrl,
    source_license_note: sourceLicenseNote,
    source_file_name: path.basename(sourceCsvPath),
    source_file_sha256: sourceFileSha256,
    input_format: "csv",
    normalization_version: report.normalization_version,
    dry_run_report_schema_version: report.schema_version,
    dry_run_report_path: dryRunReportPath,
    dry_run_report_artifact_ref: options.dryRunReportArtifactRef ?? null,
    dry_run_report_sha256: dryRunReportSha256,
    dry_run_generated_at: report.generated_at,
    validation_context: {
      slice: "4D",
      approved_dry_run_schema_version: APPROVED_DRY_RUN_SCHEMA_VERSION,
      database_comparison_mode: report.database_comparison_mode,
      hard_boundaries: report.hard_boundaries,
      imported_row_numbers: importedRowNumbers,
    },
    batch_status: "pending_candidate_review",
    total_row_count: report.summary.total_rows,
    candidate_review_row_count: candidateRows.length,
    manual_review_row_count: report.summary.manual_review_required,
    rejected_row_count: report.summary.rejected_from_import,
    duplicate_row_count: countRowsInGroups(report.duplicate_groups),
    conflict_row_count: countRowsInGroups(report.conflict_groups),
    created_by_admin_user_id: options.createdByAdminUserId ?? null,
    created_by_admin_email: options.createdByAdminEmail ?? null,
    metadata: {
      slice: "4D",
      command: "writing-engine:seed-import-candidate-review",
      actual_imported_row_count: candidateRows.length,
      skipped_manual_review_row_count: report.summary.manual_review_required,
      skipped_rejected_row_count: report.summary.rejected_from_import,
      source_file_sha256: sourceFileSha256,
      dry_run_report_sha256: dryRunReportSha256,
      slice_4c_schema_proof_path: options.slice4cSchemaProofPath
        ? path.resolve(options.slice4cSchemaProofPath)
        : null,
      generated_at: now,
      safety_boundaries: [
        "seed rows are not parent verification",
        "seed rows are not child evidence",
        "seed rows are not learning gaps",
        "seed rows do not create learning_items",
        "seed rows do not create assignment_items",
        "seed rows do not create canonical mappings",
        "seed rows do not create resolver visibility",
      ],
    },
  };

  const rows = candidateRows.map((row) => ({
    source_row_number: row.row_number,
    source_row_id: row.source_row_id,
    source_row_hash: rowHash(row),
    raw_misspelling: row.misspelling,
    raw_correction: row.correction,
    misspelling_normalized: row.misspelling_normalized,
    correct_spelling_normalized: row.correct_spelling_normalized,
    dialect_code: row.dialect_code,
    normalization_version: report.normalization_version,
    suggested_micro_skill_key: row.suggested_micro_skill_key,
    source_confidence_raw: row.confidence_original,
    source_confidence_normalized: row.confidence_normalized,
    source_note: row.note,
    source_url: row.source_url,
    source_dataset: row.source_dataset,
    age_band: row.age_band,
    pattern_hint: row.pattern_hint,
    route_hint: row.route_hint,
    dry_run_bucket: row.bucket,
    dry_run_report_row_number: row.row_number,
    dry_run_recommended_next_action: row.recommended_next_action,
    row_status: "pending_candidate_review",
    status_reason: null,
    validation_reasons: row.reasons,
    blocking_errors: row.blocking_errors,
    manual_review_warnings: row.manual_review_warnings,
    canonical_match_ids: row.matching_existing_canonical_mapping_ids,
    canonical_conflict_ids: row.conflicting_existing_canonical_mapping_ids,
    supporting_evidence_ids: row.supporting_evidence_ids,
    supporting_evidence_counts: row.supporting_evidence_counts,
    duplicate_group_key: null,
    conflict_group_key: null,
    metadata: {
      slice: "4D",
      dry_run_schema_version: report.schema_version,
      source_file_sha256: sourceFileSha256,
      dry_run_report_sha256: dryRunReportSha256,
      import_time_skill_validation: "active_assignable_d4_rechecked",
    },
  }));

  return {
    batch,
    rows,
    sourceFileSha256,
    dryRunReportSha256,
    protectedCountsBefore,
  };
}

function assertProtectedCountsUnchanged(before: ProtectedCounts, after: ProtectedCounts) {
  const changed = Object.keys(before).filter((table) => before[table] !== after[table]);
  if (changed.length > 0) {
    throw new Error(
      `Protected table counts changed during seed import: ${changed
        .map((table) => `${table} ${before[table]} -> ${after[table]}`)
        .join(", ")}`,
    );
  }
}

export async function runCandidateReviewImport(
  options: CandidateReviewImportOptions,
  adapter: CandidateReviewImportAdapter,
): Promise<CandidateReviewImportResult> {
  const plan = await buildCandidateReviewImportPlan(options, adapter);
  const batch = await adapter.insertBatch(plan.batch);
  try {
    await adapter.insertRows(
      plan.rows.map((row) => ({
        ...row,
        batch_id: batch.id,
      })),
    );
  } catch (error) {
    if (adapter.updateBatchStatus) {
      await adapter.updateBatchStatus(batch.id, {
        batch_status: "quarantined",
        closed_at: new Date().toISOString(),
        close_note: `Slice 4D row insert failed after batch creation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    throw error;
  }

  let protectedCountsAfter: ProtectedCounts;
  try {
    protectedCountsAfter = await adapter.fetchProtectedCounts();
    assertProtectedCountsUnchanged(plan.protectedCountsBefore, protectedCountsAfter);
  } catch (error) {
    if (adapter.updateBatchStatus) {
      await adapter.updateBatchStatus(batch.id, {
        batch_status: "quarantined",
        closed_at: new Date().toISOString(),
        close_note: `Slice 4D protected-table count check failed after import: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    throw error;
  }

  return {
    batchId: batch.id,
    insertedRowCount: plan.rows.length,
    sourceFileSha256: plan.sourceFileSha256,
    dryRunReportSha256: plan.dryRunReportSha256,
    protectedCountsBefore: plan.protectedCountsBefore,
    protectedCountsAfter,
  };
}

async function countTable(client: { from: (table: string) => any }, table: string) {
  const { count, error } = await client.from(table).select("*", {
    count: "exact",
    head: true,
  });
  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

function createSupabaseCandidateReviewImportAdapter(
  supabaseUrl: string,
  serviceRoleKey: string,
): CandidateReviewImportAdapter {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    async assertSeedStorageReady() {
      for (const table of SEED_TABLES) {
        await countTable(client, table);
      }
    },
    async findActiveBatchBySourceHash(sourceFileSha256) {
      const { data, error } = await client
        .from("spelling_seed_import_batches")
        .select("id")
        .eq("source_file_sha256", sourceFileSha256)
        .not("batch_status", "in", "(superseded,cancelled,quarantined)")
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`Unable to check existing seed import batches: ${error.message}`);
      }
      return data as { id: string } | null;
    },
    async fetchMicroSkills(keys) {
      const { data, error } = await client
        .from("micro_skill_catalog")
        .select("micro_skill_key, mastery_domain_key, is_active, is_assignable")
        .in("micro_skill_key", keys);
      if (error) {
        throw new Error(`Unable to validate micro_skill_catalog: ${error.message}`);
      }
      return (data ?? []) as MicroSkillEligibility[];
    },
    async fetchProtectedCounts() {
      const entries = await Promise.all(
        PROTECTED_TABLES.map(async (table) => [table, await countTable(client, table)] as const),
      );
      return Object.fromEntries(entries);
    },
    async insertBatch(batch) {
      const { data, error } = await client
        .from("spelling_seed_import_batches")
        .insert(batch)
        .select("id")
        .single();
      if (error) {
        throw new Error(`Unable to insert spelling_seed_import_batches row: ${error.message}`);
      }
      return data as { id: string };
    },
    async insertRows(rows) {
      const { error } = await client.from("spelling_seed_import_rows").insert(rows);
      if (error) {
        throw new Error(`Unable to insert spelling_seed_import_rows: ${error.message}`);
      }
    },
    async updateBatchStatus(batchId, update) {
      const { error } = await client
        .from("spelling_seed_import_batches")
        .update(update)
        .eq("id", batchId);
      if (error) {
        throw new Error(`Unable to quarantine seed import batch ${batchId}: ${error.message}`);
      }
    },
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: Partial<ParsedArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--source-csv":
        args.sourceCsvPath = next();
        break;
      case "--dry-run-report":
        args.dryRunReportPath = next();
        break;
      case "--slice-4c-schema-proof":
        args.slice4cSchemaProofPath = next();
        break;
      case "--batch-name":
        args.batchName = next();
        break;
      case "--source-name":
        args.sourceName = next();
        break;
      case "--source-dataset":
        args.sourceDataset = next();
        break;
      case "--source-url":
        args.sourceUrl = next();
        break;
      case "--source-license-note":
        args.sourceLicenseNote = next();
        break;
      case "--dry-run-report-artifact-ref":
        args.dryRunReportArtifactRef = next();
        break;
      case "--created-by-admin-user-id":
        args.createdByAdminUserId = next();
        break;
      case "--created-by-admin-email":
        args.createdByAdminEmail = next();
        break;
      case "--expected-source-file-sha256":
        args.expectedSourceFileSha256 = next();
        break;
      case "--expected-dry-run-report-sha256":
        args.expectedDryRunReportSha256 = next();
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      case "--supabase-service-role-key":
        args.supabaseServiceRoleKey = next();
        break;
      case "--confirm":
        args.confirmationToken = next();
        break;
      case "--allow-hosted-write":
        args.allowHostedWrite = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.supabaseUrl = args.supabaseUrl ?? process.env.SUPABASE_URL;
  args.supabaseServiceRoleKey =
    args.supabaseServiceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  args.confirmationToken = args.confirmationToken ?? "";

  return args as ParsedArgs;
}

export function getCandidateReviewImportHelp() {
  return [
    "Writing Engine seed candidate-review importer",
    "",
    "Usage:",
    "  npm run writing-engine:seed-import-candidate-review -- --source-csv path/to/candidates.csv --dry-run-report path/to/seed-import-dry-run-report.json --slice-4c-schema-proof path/to/slice-4c-schema-proof.json --source-license-note \"...\" --confirm IMPORT_SEED_CANDIDATE_REVIEW_ROWS",
    "",
    "Required:",
    "  --source-csv path/to/candidates.csv",
    "  --dry-run-report path/to/seed-import-dry-run-report.json",
    "  --slice-4c-schema-proof path/to/slice-4c-schema-proof.json",
    "  --source-license-note provenance/license note",
    "  --confirm IMPORT_SEED_CANDIDATE_REVIEW_ROWS",
    "  --supabase-url or SUPABASE_URL",
    "  --supabase-service-role-key or SUPABASE_SERVICE_ROLE_KEY",
    "",
    "Optional safety pins:",
    "  --expected-source-file-sha256 hex",
    "  --expected-dry-run-report-sha256 hex",
    "  --created-by-admin-email email",
    "  --created-by-admin-user-id uuid",
    "  --batch-name label",
    "  --source-name label",
    "  --source-dataset label",
    "  --source-url url",
    "  --allow-hosted-write (requires separate hosted release approval)",
    "",
    "Boundaries:",
    "  Writes only spelling_seed_import_batches and spelling_seed_import_rows.",
    "  Imports only safe_for_candidate_review rows from approved Slice 4A reports.",
    "  Does not create canonical mappings, resolver visibility, learning_items, or assignment_items.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(getCandidateReviewImportHelp());
    return;
  }

  const supabaseUrl = assertNonEmpty(args.supabaseUrl, "Supabase URL");
  const serviceRoleKey = assertNonEmpty(
    args.supabaseServiceRoleKey,
    "Supabase service-role key",
  );
  const sourceCsvPath = assertNonEmpty(args.sourceCsvPath, "Source CSV path");
  const dryRunReportPath = assertNonEmpty(
    args.dryRunReportPath,
    "Dry-run JSON report path",
  );

  const adapter = createSupabaseCandidateReviewImportAdapter(
    supabaseUrl,
    serviceRoleKey,
  );

  const result = await runCandidateReviewImport(
    {
      ...args,
      sourceCsvPath,
      dryRunReportPath,
      sourceLicenseNote: args.sourceLicenseNote,
    },
    adapter,
  );

  console.log(
    JSON.stringify(
      {
        status: "writing-engine-seed-import-candidate-review: ok",
        batch_id: result.batchId,
        inserted_row_count: result.insertedRowCount,
        source_file_sha256: result.sourceFileSha256,
        dry_run_report_sha256: result.dryRunReportSha256,
        protected_counts_unchanged: true,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
