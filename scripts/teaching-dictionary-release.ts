#!/usr/bin/env node
/* Guarded Teaching Dictionary package preparation and hosted release CLI. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  CANONICAL_OPTIONAL_FILES,
  CANONICAL_REPAIR_PACKAGE_TYPE,
  CANONICAL_PACKAGE_SCHEMA,
  CANONICAL_PACKAGE_TYPE,
  CANONICAL_REQUIRED_FILES,
  IMPORTER_VERSION,
  PROHIBITED_TABLE_FAMILIES,
  REQUIRED_MIGRATION_VERSIONS,
  canonicalJson,
  loadCanonicalPackage,
  packageSha256,
  parseCsv,
  sha256Bytes,
  sha256File,
  validateCanonicalCsv,
  validateCanonicalRepairCsv,
  type CsvRow,
  type LoadedCanonicalPackage,
  type ReleaseManifest,
  type ReleaseManifestFingerprint,
  type TargetEnvironment,
} from "./teaching-dictionary-release-contract";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RELEASE_ROOT = resolve(
  ROOT,
  "docs/implementation/seed-data/teaching-dictionary/releases",
);
const FINALIZER = resolve(ROOT, "scripts/finalize-next-teaching-dictionary-batch.py");
const VALIDATOR = resolve(ROOT, "scripts/validate-teaching-dictionary-csv.py");
const RELEASE_ROLE = "teaching_dictionary_releaser";
const ADVISORY_LOCK = "canonical_teaching_dictionary_release";
const UUID_NAMESPACE = "12345678-1234-5678-1234-567812345678";
const CHUNK_SIZE = 100;

export const TARGETS = {
  staging: {
    projectRef: "jlhotktspjvffslvuyfz",
    databaseUrlEnv: "SUPABASE_STAGING_DB_URL",
    importMode: "staging_release",
  },
  production: {
    projectRef: "wwohrqtunajrbwxyssjf",
    databaseUrlEnv: "SUPABASE_PRODUCTION_DB_URL",
    importMode: "production_release",
  },
} as const;

const PROTECTED_TABLES = [
  "children",
  "learning_items",
  "learning_item_evidence",
  "assignment_items",
  "daily_assignments",
  "adle_learning_items",
  "adle_assignment_attempt_events",
  "adle_authentic_use_events",
  "adle_slippage_events",
  "adle_word_proficiency",
  "spelling_canonical_mappings",
  "spelling_canonical_mapping_events",
  "spelling_catalog_review_cases",
  "child_word_treasures",
  "child_word_treasure_events",
] as const;

type DatabasePlan = {
  status: "ready" | "already_applied";
  target: TargetEnvironment;
  projectRef: string;
  releaseId: string;
  packageSha256: string;
  batchId: string;
  requiredConfirmation: string;
  activeWordCountBefore: number;
  expectedActiveWordCountAfter: number;
  newSourceKeys: string[];
  reusedSourceKeys: string[];
  newWords: number;
  reusedWords: number;
  reusedWordIds: Record<string, string>;
  repairs: number;
  deferredRepairIntents: number;
  protectedCounts: Record<string, number>;
  stagingProof?: Record<string, unknown>;
};

type TableRows = Record<string, Record<string, unknown>[]>;

type TableSpec = {
  table: string;
  columns: string[];
};

const TABLE_SPECS: Record<string, TableSpec> = {
  sources: {
    table: "canonical_teaching_dictionary_sources",
    columns: [
      "id",
      "import_batch_id",
      "row_status",
      "source_sheet",
      "source_row_number",
      "source_row_hash",
      "source_metadata",
      "source_key",
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "importability_status",
      "legal_review_status",
    ],
  },
  words: {
    table: "canonical_teaching_dictionary_words",
    columns: [
      "id",
      "import_batch_id",
      "source_id",
      "row_status",
      "source_sheet",
      "source_row_number",
      "source_row_hash",
      "source_metadata",
      "word_key",
      "normalised_word",
      "display_word",
      "dialect_code",
      "frequency_band",
      "age_band",
      "complexity_band",
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "confidence",
      "review_status",
    ],
  },
  metadata: {
    table: "canonical_teaching_dictionary_word_metadata",
    columns: [
      "id",
      "import_batch_id",
      "canonical_word_id",
      "source_id",
      "row_status",
      "source_sheet",
      "source_row_number",
      "source_row_hash",
      "source_metadata",
      "syllables",
      "phoneme_hint",
      "grapheme_notes",
      "stress_pattern",
      "has_schwa",
      "morphemes",
      "morphology_notes",
      "irregularity_notes",
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "confidence",
      "review_status",
      "reviewed_by",
      "reviewed_at",
    ],
  },
  morphology: {
    table: "canonical_teaching_dictionary_word_morphology",
    columns: [
      "id",
      "import_batch_id",
      "canonical_word_id",
      "row_status",
      "source_sheet",
      "source_row_number",
      "source_row_hash",
      "source_metadata",
      "raw_morpholex_segmentation",
      "raw_morpholex_pos",
      "morphology_parts",
      "feature_keys",
      "morphology_joins",
      "transformation_notes",
      "word_sum",
      "analysis_status",
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "confidence",
      "review_status",
      "reviewed_by",
      "reviewed_at",
      "review_notes",
    ],
  },
  dictations: {
    table: "canonical_teaching_dictionary_dictation_sentences",
    columns: [
      "id",
      "import_batch_id",
      "canonical_word_id",
      "row_status",
      "source_sheet",
      "source_row_number",
      "source_row_hash",
      "source_metadata",
      "dictation_sentence",
      "dictation_target_token_index",
      "audio_text",
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "confidence",
      "review_status",
      "reviewed_by",
      "reviewed_at",
    ],
  },
};

const RELEASE_OWNED_TABLES = [
  "canonical_teaching_dictionary_import_batches",
  ...Object.values(TABLE_SPECS).map((spec) => spec.table),
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function command(): string {
  return process.argv[2] ?? "";
}

function nullable(value: string | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

function parseBoolean(value: string): boolean {
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  return fail(`Invalid boolean value ${JSON.stringify(value)}.`);
}

const METADATA_REPLACEMENT_FIELDS = [
  "syllables",
  "phoneme_hint",
  "grapheme_notes",
  "stress_pattern",
  "has_schwa",
  "morphemes",
  "morphology_notes",
  "irregularity_notes",
  "source_category",
  "source_name",
  "source_url",
  "source_licence",
  "source_use_note",
  "confidence",
  "review_status",
  "reviewed_by",
  "reviewed_at",
] as const;

function metadataFingerprint(metadata: Record<string, unknown>): string {
  return sha256Bytes(
    canonicalJson(
      Object.fromEntries(
        METADATA_REPLACEMENT_FIELDS.map((field) => [field, metadata[field] ?? null]),
      ),
    ),
  );
}

function assertReplacementPreservesFacts(
  repair: CsvRow,
  metadata: Record<string, unknown>,
): void {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["syllables", repair.syllables, metadata.syllables ?? ""],
    ["phoneme_hint", repair.phoneme_hint, metadata.phoneme_hint ?? ""],
    ["grapheme_notes", nullable(repair.grapheme_notes), metadata.grapheme_notes ?? null],
    ["stress_pattern", repair.stress_pattern, metadata.stress_pattern ?? ""],
    ["has_schwa", parseBoolean(repair.has_schwa), metadata.has_schwa],
    ["morphemes", repair.morphemes, metadata.morphemes ?? ""],
    ["morphology_notes", repair.morphology_notes, metadata.morphology_notes ?? ""],
    ["irregularity_notes", nullable(repair.irregularity_notes), metadata.irregularity_notes ?? null],
    ["source_category", repair.source_category, metadata.source_category ?? ""],
    ["source_name", nullable(repair.source_name), metadata.source_name ?? null],
    ["source_url", nullable(repair.source_url), metadata.source_url ?? null],
    ["source_licence", nullable(repair.source_licence), metadata.source_licence ?? null],
    ["source_use_note", nullable(repair.source_use_note), metadata.source_use_note ?? null],
    ["confidence", repair.confidence, metadata.confidence ?? ""],
    ["review_status", "approved_for_first_exposure", metadata.review_status ?? ""],
  ];
  for (const [field, replacement, existing] of comparisons) {
    if (replacement !== existing) {
      fail(`Replacement repair for ${repair.word_key} would alter ${field}; use a separately reviewed factual repair.`);
    }
  }
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) fail(`Unsafe SQL identifier ${value}.`);
  return `"${value.replace(/"/g, '""')}"`;
}

function namespaceBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

export function stableUuid(kind: string, key: string): string {
  const hash = createHash("sha1")
    .update(namespaceBytes(UUID_NAMESPACE))
    .update(`${kind}:${key}`, "utf8")
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourceCommit(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runPython(args: string[]): void {
  const python = process.env.TEACHING_DICTIONARY_PYTHON ?? process.env.PYTHON ?? "python3";
  const result = spawnSync(python, args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  }
}

function reviewersFrom(csv: Record<string, CsvRow[]>): { reviewers: string[]; reviewedDates: string[] } {
  const rows = [
    ...(csv["canonical_word_morphology.csv"] ?? []),
    ...(csv["dictation_sentences.csv"] ?? []),
    ...(csv["canonical_word_repairs.csv"] ?? []),
  ];
  return {
    reviewers: [...new Set(rows.map((row) => row.reviewed_by).filter(Boolean))].sort(),
    reviewedDates: [...new Set(rows.map((row) => row.reviewed_at).filter(Boolean))].sort(),
  };
}

const RECONCILIATION_FACT_FIELDS = [
  "word_key", "syllables", "phoneme_hint", "grapheme_notes", "stress_pattern",
  "has_schwa", "morphemes", "morphology_notes", "irregularity_notes",
  "source_category", "source_name", "source_url", "source_licence",
  "source_use_note", "confidence", "review_status", "reviewed_by", "reviewed_at",
] as const;

function reconciliationFacts(row: CsvRow): Record<string, string> {
  return Object.fromEntries(RECONCILIATION_FACT_FIELDS.map((field) => [field, row[field] ?? ""]));
}

function assertReconciliationMatchesEvidence(
  repairs: CsvRow[],
  evidence: LoadedCanonicalPackage,
): void {
  const evidenceRows = evidence.csv["canonical_word_repairs.csv"] ?? [];
  const byKey = new Map(evidenceRows.map((row) => [row.word_key, row]));
  for (const repair of repairs) {
    const evidenceRow = byKey.get(repair.word_key);
    if (!evidenceRow || canonicalJson(reconciliationFacts(repair)) !== canonicalJson(reconciliationFacts(evidenceRow))) {
      fail(`Production reconciliation facts for ${repair.word_key} do not match verified staging evidence.`);
    }
  }
}

async function prepare(): Promise<void> {
  const workbook = resolve(arg("--workbook") ?? fail("--workbook is required."));
  const candidateCsv = resolve(arg("--candidate-csv") ?? fail("--candidate-csv is required."));
  const releaseId = arg("--release-id") ?? fail("--release-id is required.");
  if (!/^[a-z0-9][a-z0-9._-]{7,119}$/i.test(releaseId)) {
    fail("--release-id must be an explicit 8-120 character identifier.");
  }
  const releaseRoot = resolve(arg("--release-root") ?? DEFAULT_RELEASE_ROOT);
  const releaseDir = resolve(releaseRoot, releaseId);
  if (relative(releaseRoot, releaseDir).startsWith("..")) fail("Release path escapes the release root.");
  try {
    await readdir(releaseDir);
    fail(`Release ${releaseId} already exists. Approved releases are immutable; use a new release ID.`);
  } catch (error) {
    if (error instanceof Error && !("code" in error && error.code === "ENOENT")) throw error;
  }

  const tempRoot = await mkdtemp(resolve(tmpdir(), "teaching-dictionary-release-"));
  const tempPackage = resolve(tempRoot, "package");
  try {
    await mkdir(tempPackage, { recursive: true });
    runPython([
      FINALIZER,
      "--workbook",
      workbook,
      "--candidate-csv",
      candidateCsv,
      "--output",
      tempPackage,
    ]);
    const allowed = new Set<string>([...CANONICAL_REQUIRED_FILES, ...CANONICAL_OPTIONAL_FILES]);
    for (const fileName of await readdir(tempPackage)) {
      if (!allowed.has(fileName)) fail(`Finalizer emitted unsupported package file ${fileName}.`);
    }
    runPython([VALIDATOR, tempPackage, "--report", resolve(tempRoot, "validation-report.json")]);

    const csv: Record<string, CsvRow[]> = {};
    const fileSha256: Record<string, string> = {};
    for (const fileName of [...CANONICAL_REQUIRED_FILES, ...CANONICAL_OPTIONAL_FILES]) {
      const filePath = resolve(tempPackage, fileName);
      try {
        const content = await readFile(filePath, "utf8");
        csv[fileName] = parseCsv(content);
        fileSha256[fileName] = sha256Bytes(content);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
    }
    const counts = validateCanonicalCsv(csv);
    const deferredPath = resolve(tempRoot, "approved-existing-row-repairs.json");
    let deferredRepairIntents: unknown[] = [];
    try {
      deferredRepairIntents = JSON.parse(await readFile(deferredPath, "utf8"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    counts.deferredRepairIntents = deferredRepairIntents.length;

    const workbookSha256 = await sha256File(workbook);
    const deferredRepairIntentFile = deferredRepairIntents.length
      ? "deferred-repair-intentions.json"
      : null;
    const deferredRepairIntentContent = deferredRepairIntentFile
      ? `${JSON.stringify(deferredRepairIntents, null, 2)}\n`
      : null;
    const deferredRepairIntentsSha256 = deferredRepairIntentFile
      ? sha256Bytes(deferredRepairIntentContent!)
      : null;
    const sources = csv["teaching_content_sources.csv"];
    const fingerprint: ReleaseManifestFingerprint = {
      schemaVersion: CANONICAL_PACKAGE_SCHEMA,
      releaseId,
      packageType: CANONICAL_PACKAGE_TYPE,
      packageSchemaVersion: "v2",
      workbookSha256,
      sourceCommit: sourceCommit(),
      requiredMigrationVersions: [...REQUIRED_MIGRATION_VERSIONS],
      fileSha256,
      rowCounts: counts,
      reviewerSummary: reviewersFrom(csv),
      sourceApprovalSummary: {
        importable: sources.filter((row) => row.importability_status === "importable").length,
        legalPassedOrNotRequired: sources.filter((row) =>
          ["passed", "not_required"].includes(row.legal_review_status),
        ).length,
      },
      expectedTargetTables: Object.values(TABLE_SPECS).map((spec) => spec.table),
      prohibitedTableFamilies: [...PROHIBITED_TABLE_FAMILIES],
      deferredRepairIntentFile,
      deferredRepairIntentsSha256,
    };
    const compositeSha = packageSha256(fingerprint);
    const manifest: ReleaseManifest = { ...fingerprint, packageSha256: compositeSha };

    await mkdir(resolve(releaseDir, "package"), { recursive: true });
    await mkdir(resolve(releaseDir, "receipts"), { recursive: true });
    await copyFile(workbook, resolve(releaseDir, "approved-workbook.xlsx"));
    for (const fileName of Object.keys(fileSha256)) {
      await copyFile(resolve(tempPackage, fileName), resolve(releaseDir, "package", fileName));
    }
    await copyFile(
      resolve(tempRoot, "validation-report.json"),
      resolve(releaseDir, "validation-report.json"),
    );
    if (deferredRepairIntents.length) {
      await writeFile(
        resolve(releaseDir, "deferred-repair-intentions.json"),
        deferredRepairIntentContent!,
      );
    }
    await writeFile(
      resolve(releaseDir, "package", "release-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await loadCanonicalPackage(releaseDir);
    console.log(
      JSON.stringify(
        {
          status: "prepared_and_verified",
          releaseDir,
          releaseId,
          packageSha256: compositeSha,
          rowCounts: counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** Prepare an immutable, metadata-only factual repair release. */
async function prepareRepair(): Promise<void> {
  const workbook = resolve(arg("--workbook") ?? fail("--workbook is required."));
  const repairsPath = resolve(arg("--repairs") ?? fail("--repairs is required."));
  const releaseId = arg("--release-id") ?? fail("--release-id is required.");
  if (!/^[a-z0-9][a-z0-9._-]{7,119}$/i.test(releaseId)) {
    fail("--release-id must be an explicit 8-120 character identifier.");
  }
  const releaseRoot = resolve(arg("--release-root") ?? DEFAULT_RELEASE_ROOT);
  const releaseDir = resolve(releaseRoot, releaseId);
  if (relative(releaseRoot, releaseDir).startsWith("..")) fail("Release path escapes the release root.");
  try {
    await readdir(releaseDir);
    fail(`Release ${releaseId} already exists. Approved releases are immutable; use a new release ID.`);
  } catch (error) {
    if (error instanceof Error && !("code" in error && error.code === "ENOENT")) throw error;
  }

  const repairsContent = await readFile(repairsPath, "utf8");
  const csv = { "canonical_word_repairs.csv": parseCsv(repairsContent) };
  const counts = validateCanonicalRepairCsv(csv);
  const evidenceReleaseId = arg("--production-reconciliation-evidence");
  let productionBaselineReconciliation: ReleaseManifest["productionBaselineReconciliation"];
  if (evidenceReleaseId) {
    const evidence = await loadCanonicalPackage(resolve(DEFAULT_RELEASE_ROOT, evidenceReleaseId));
    if (evidence.manifest.packageType !== CANONICAL_REPAIR_PACKAGE_TYPE) {
      fail("Production reconciliation evidence must be a canonical repair release.");
    }
    assertReconciliationMatchesEvidence(csv["canonical_word_repairs.csv"], evidence);
    const approvals = reviewersFrom(csv);
    if (approvals.reviewers.length !== 1 || approvals.reviewedDates.length !== 1) {
      fail("Production reconciliation requires exactly one named approval and review date.");
    }
    productionBaselineReconciliation = {
      targetEnvironment: "production",
      stagingEvidenceReleaseId: evidence.manifest.releaseId,
      stagingEvidencePackageSha256: evidence.manifest.packageSha256,
      approvedBy: approvals.reviewers[0],
      approvedAt: approvals.reviewedDates[0],
      justification: "Production lacks the approved metadata rows already present and verified in staging; factual values are identical to the staging evidence package.",
    };
  }
  const fileSha256 = { "canonical_word_repairs.csv": sha256Bytes(repairsContent) };
  const fingerprint: ReleaseManifestFingerprint = {
    schemaVersion: CANONICAL_PACKAGE_SCHEMA,
    releaseId,
    packageType: CANONICAL_REPAIR_PACKAGE_TYPE,
    packageSchemaVersion: "v2",
    workbookSha256: await sha256File(workbook),
    sourceCommit: sourceCommit(),
    requiredMigrationVersions: [...REQUIRED_MIGRATION_VERSIONS],
    fileSha256,
    rowCounts: counts,
    reviewerSummary: reviewersFrom(csv),
    sourceApprovalSummary: { importable: 0, legalPassedOrNotRequired: 0 },
    expectedTargetTables: [TABLE_SPECS.metadata.table],
    prohibitedTableFamilies: [...PROHIBITED_TABLE_FAMILIES],
    deferredRepairIntentFile: null,
    deferredRepairIntentsSha256: null,
    ...(productionBaselineReconciliation ? { productionBaselineReconciliation } : {}),
  };
  const manifest: ReleaseManifest = {
    ...fingerprint,
    packageSha256: packageSha256(fingerprint),
  };
  await mkdir(resolve(releaseDir, "package"), { recursive: true });
  await mkdir(resolve(releaseDir, "receipts"), { recursive: true });
  await copyFile(workbook, resolve(releaseDir, "approved-workbook.xlsx"));
  await writeFile(resolve(releaseDir, "package", "canonical_word_repairs.csv"), repairsContent);
  await writeFile(
    resolve(releaseDir, "package", "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await loadCanonicalPackage(releaseDir);
  console.log(JSON.stringify({
    status: "prepared_and_verified",
    releaseDir,
    releaseId,
    packageSha256: manifest.packageSha256,
    rowCounts: counts,
  }, null, 2));
}

function databaseUrl(target: TargetEnvironment): string {
  const envName = TARGETS[target].databaseUrlEnv;
  const value = process.env[envName];
  if (!value) fail(`${envName} is required.`);
  return value;
}

export function assertDatabaseTarget(databaseUrlValue: string, target: TargetEnvironment): void {
  const parsed = new URL(databaseUrlValue);
  const expectedRef = TARGETS[target].projectRef;
  const identity = `${parsed.hostname}|${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(expectedRef)) {
    fail(`Database URL does not identify the configured ${target} project ${expectedRef}.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail("Database URL must use PostgreSQL.");
  }
}

function clientFor(target: TargetEnvironment): pg.Client {
  const url = databaseUrl(target);
  assertDatabaseTarget(url, target);
  const rejectUnauthorized = process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== "false";
  return new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized },
  });
}

async function existingTables(client: pg.Client, names: readonly string[]): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `
      select candidate.table_name
      from unnest($1::text[]) candidate(table_name)
      where to_regclass('public.' || candidate.table_name) is not null
      order by candidate.table_name
    `,
    [names],
  );
  return result.rows.map((row) => row.table_name);
}

async function tableCounts(client: pg.Client, names: readonly string[]): Promise<Record<string, number>> {
  const present = await existingTables(client, names);
  const counts: Record<string, number> = {};
  for (const name of present) {
    const result = await client.query<{ count: string }>(
      `select count(*)::text as count from public.${quoteIdentifier(name)}`,
    );
    counts[name] = Number(result.rows[0].count);
  }
  return counts;
}

function sourceComparable(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    [
      "source_category",
      "source_name",
      "source_url",
      "source_licence",
      "source_use_note",
      "importability_status",
      "legal_review_status",
    ].map((field) => [field, nullable(String(row[field] ?? ""))]),
  );
}

async function verifyStagingProof(pkg: LoadedCanonicalPackage): Promise<Record<string, unknown>> {
  const reconciliation = pkg.manifest.productionBaselineReconciliation;
  const evidence = reconciliation
    ? await loadCanonicalPackage(resolve(DEFAULT_RELEASE_ROOT, reconciliation.stagingEvidenceReleaseId))
    : pkg;
  if (reconciliation) {
    if (reconciliation.targetEnvironment !== "production") fail("Invalid reconciliation target policy.");
    if (evidence.manifest.packageSha256 !== reconciliation.stagingEvidencePackageSha256) {
      fail("Production reconciliation evidence hash does not match its manifest.");
    }
    assertReconciliationMatchesEvidence(pkg.csv["canonical_word_repairs.csv"] ?? [], evidence);
  }
  const client = clientFor("staging");
  await client.connect();
  try {
    const result = await client.query(
      `
        select id, release_id, package_sha256, batch_status, verification_summary
        from public.canonical_teaching_dictionary_import_batches
        where release_id = $1
      `,
      [evidence.manifest.releaseId],
    );
    if (
      result.rowCount !== 1 ||
      result.rows[0].package_sha256 !== evidence.manifest.packageSha256 ||
      result.rows[0].batch_status !== "applied" ||
      result.rows[0].verification_summary?.status !== "verified"
    ) {
      fail(reconciliation
        ? "Production reconciliation requires its factual evidence package to be applied and verified in staging."
        : "Production release requires the exact package to be applied and verified in staging.");
    }
    return {
      stagingBatchId: result.rows[0].id,
      stagingPackageSha256: result.rows[0].package_sha256,
      stagingVerificationStatus: result.rows[0].verification_summary.status,
      ...(reconciliation ? {
        proofMode: "production_baseline_reconciliation",
        evidenceReleaseId: evidence.manifest.releaseId,
        reconciliationApprovedBy: reconciliation.approvedBy,
        reconciliationApprovedAt: reconciliation.approvedAt,
      } : {}),
    };
  } finally {
    await client.end();
  }
}

async function schemaPreflight(
  client: pg.Client,
  target: TargetEnvironment,
  pkg: LoadedCanonicalPackage,
): Promise<void> {
  const migrations = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations where version = any($1::text[])",
    [pkg.manifest.requiredMigrationVersions],
  );
  const present = new Set(migrations.rows.map((row) => row.version));
  const missing = pkg.manifest.requiredMigrationVersions.filter((version) => !present.has(version));
  if (missing.length) fail(`${target} migration ledger is missing: ${missing.join(", ")}.`);

  const expectedTables = [
    "canonical_teaching_dictionary_import_batches",
    ...pkg.manifest.expectedTargetTables,
  ];
  const tables = new Set(await existingTables(client, expectedTables));
  const missingTables = expectedTables.filter((table) => !tables.has(table));
  if (missingTables.length) fail(`${target} is missing Teaching Dictionary tables: ${missingTables.join(", ")}.`);

  const columns = await client.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'canonical_teaching_dictionary_import_batches'
        and column_name = any($1::text[])
    `,
    [
      [
        "release_id",
        "package_type",
        "package_schema_version",
        "workbook_sha256",
        "package_sha256",
        "target_environment",
        "importer_version",
        "verification_summary",
        "verified_at",
      ],
    ],
  );
  if (columns.rowCount !== 9) fail(`${target} release-ledger schema is incomplete.`);

  const role = await client.query<{
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolbypassrls: boolean;
  }>(
    `
      select rolcanlogin, rolinherit, rolbypassrls
      from pg_roles
      where rolname = $1
    `,
    [RELEASE_ROLE],
  );
  if (
    role.rowCount !== 1 ||
    role.rows[0].rolcanlogin ||
    role.rows[0].rolinherit ||
    !role.rows[0].rolbypassrls
  ) {
    fail(`${target} requires ${RELEASE_ROLE} as NOLOGIN NOINHERIT BYPASSRLS.`);
  }
  const membership = await client.query<{ allowed: boolean }>(
    "select pg_has_role(current_user, $1, 'MEMBER') as allowed",
    [RELEASE_ROLE],
  );
  if (!membership.rows[0].allowed) {
    fail(`${target} database operator cannot assume ${RELEASE_ROLE}.`);
  }
  const dictionaryPrivileges = await client.query<{ table_name: string }>(
    `
      select table_name
      from unnest($2::text[]) table_name
      where not has_table_privilege($1, 'public.' || table_name, 'SELECT')
         or not has_table_privilege($1, 'public.' || table_name, 'INSERT')
         or not has_table_privilege($1, 'public.' || table_name, 'UPDATE')
         or has_table_privilege($1, 'public.' || table_name, 'DELETE')
    `,
    [RELEASE_ROLE, RELEASE_OWNED_TABLES],
  );
  if (dictionaryPrivileges.rowCount) {
    fail(
      `${RELEASE_ROLE} has incomplete or excessive privileges on release tables: ${dictionaryPrivileges.rows
        .map((row) => row.table_name)
        .join(", ")}.`,
    );
  }
  const nonPackageDictionaryTables = await client.query<{ table_name: string }>(
    `
      select tablename as table_name
      from pg_tables
      where schemaname = 'public'
        and tablename like 'canonical_teaching_dictionary_%'
        and not (tablename = any($1::text[]))
    `,
    [RELEASE_OWNED_TABLES],
  );
  if (nonPackageDictionaryTables.rowCount) {
    const excessive = await client.query<{ table_name: string }>(
      `
        select table_name
        from unnest($2::text[]) table_name
        where has_table_privilege($1, 'public.' || table_name, 'SELECT')
           or has_table_privilege($1, 'public.' || table_name, 'INSERT')
           or has_table_privilege($1, 'public.' || table_name, 'UPDATE')
           or has_table_privilege($1, 'public.' || table_name, 'DELETE')
      `,
      [RELEASE_ROLE, nonPackageDictionaryTables.rows.map((row) => row.table_name)],
    );
    if (excessive.rowCount) {
      fail(
        `${RELEASE_ROLE} has forbidden access outside canonical-word package tables: ${excessive.rows
          .map((row) => row.table_name)
          .join(", ")}.`,
      );
    }
  }
  const protectedTables = await existingTables(client, PROTECTED_TABLES);
  if (protectedTables.length) {
    const forbidden = await client.query<{ table_name: string }>(
      `
        select table_name
        from unnest($2::text[]) table_name
        where has_table_privilege($1, 'public.' || table_name, 'INSERT')
           or has_table_privilege($1, 'public.' || table_name, 'UPDATE')
           or has_table_privilege($1, 'public.' || table_name, 'DELETE')
      `,
      [RELEASE_ROLE, protectedTables],
    );
    if (forbidden.rowCount) {
      fail(`${RELEASE_ROLE} can write protected tables: ${forbidden.rows.map((row) => row.table_name).join(", ")}.`);
    }
  }
}

async function databasePlan(
  client: pg.Client,
  target: TargetEnvironment,
  pkg: LoadedCanonicalPackage,
  stagingProof?: Record<string, unknown>,
): Promise<DatabasePlan> {
  await schemaPreflight(client, target, pkg);
  const targetConfig = TARGETS[target];
  const existingBatch = await client.query(
    `
      select id, release_id, package_sha256, batch_status, verification_summary
      from public.canonical_teaching_dictionary_import_batches
      where release_id = $1 or package_sha256 = $2
    `,
    [pkg.manifest.releaseId, pkg.manifest.packageSha256],
  );
  if (existingBatch.rowCount) {
    const exact = existingBatch.rows.find(
      (row) =>
        row.release_id === pkg.manifest.releaseId &&
        row.package_sha256 === pkg.manifest.packageSha256 &&
        row.batch_status === "applied" &&
        row.verification_summary?.status === "verified",
    );
    if (!exact || existingBatch.rowCount !== 1) {
      fail("Release ID or package hash already exists in a conflicting database state.");
    }
    const activeCount = await client.query<{ count: string }>(
      "select count(*)::text as count from public.canonical_teaching_dictionary_words where row_status = 'active'",
    );
    return {
      status: "already_applied",
      target,
      projectRef: targetConfig.projectRef,
      releaseId: pkg.manifest.releaseId,
      packageSha256: pkg.manifest.packageSha256,
      batchId: exact.id,
      requiredConfirmation: confirmationToken(pkg, target),
      activeWordCountBefore: Number(activeCount.rows[0].count),
      expectedActiveWordCountAfter: Number(activeCount.rows[0].count),
      newSourceKeys: [],
      reusedSourceKeys: [],
      newWords: 0,
      reusedWords: 0,
      reusedWordIds: {},
      repairs: 0,
      deferredRepairIntents: pkg.manifest.rowCounts.deferredRepairIntents,
      protectedCounts: await tableCounts(client, PROTECTED_TABLES),
      stagingProof,
    };
  }

  const sources = pkg.csv["teaching_content_sources.csv"] ?? [];
  const sourceKeys = sources.map((row) => row.source_key);
  const sourceResult = await client.query(
    `
      select id, source_key, source_category, source_name, source_url, source_licence,
             source_use_note, importability_status, legal_review_status, row_status
      from public.canonical_teaching_dictionary_sources
      where source_key = any($1::text[])
    `,
    [sourceKeys],
  );
  const existingSourceByKey = new Map(sourceResult.rows.map((row) => [row.source_key, row]));
  const newSourceKeys: string[] = [];
  const reusedSourceKeys: string[] = [];
  for (const source of sources) {
    const existing = existingSourceByKey.get(source.source_key);
    if (!existing) {
      newSourceKeys.push(source.source_key);
      continue;
    }
    if (existing.row_status !== "active") {
      fail(
        `Source ${source.source_key} already exists but is ${existing.row_status}; use a reviewed, versioned source key.`,
      );
    }
    if (canonicalJson(sourceComparable(existing)) !== canonicalJson(sourceComparable(source))) {
      fail(`Source ${source.source_key} exists with different factual or legal fields.`);
    }
    reusedSourceKeys.push(source.source_key);
  }

  const words = pkg.csv["canonical_words.csv"] ?? [];
  const wordKeys = words.map((row) => row.word_key);
  const normalisedWords = words.map((row) => row.normalised_word);
  const collisions = await client.query<{
    id: string;
    word_key: string;
    normalised_word: string;
    dialect_code: string;
    row_status: string;
  }>(
    `
      select id, word_key, normalised_word, dialect_code, row_status
      from public.canonical_teaching_dictionary_words
      where word_key = any($1::text[])
         or (normalised_word = any($2::text[]) and dialect_code = 'en-GB')
    `,
    [wordKeys, normalisedWords],
  );
  const packageWordByKey = new Map(words.map((row) => [row.word_key, row]));
  const reusedWordIds: Record<string, string> = {};
  for (const collision of collisions.rows) {
    const exactKey = packageWordByKey.get(collision.word_key);
    if (
      !exactKey ||
      collision.row_status !== "active" ||
      collision.dialect_code !== "en-GB"
    ) {
      fail(
        `Canonical word identity collision is not reusable: ${collision.word_key}/${collision.normalised_word}/${collision.row_status}.`,
      );
    }
    if (reusedWordIds[collision.word_key]) {
      fail(`Canonical word ${collision.word_key} resolves to more than one database row.`);
    }
    reusedWordIds[collision.word_key] = collision.id;
  }

  const repairRows = pkg.csv["canonical_word_repairs.csv"] ?? [];
  for (const repair of repairRows) {
    const word = await client.query<{ id: string }>(
      `
        select id
        from public.canonical_teaching_dictionary_words
        where word_key = $1 and row_status = 'active'
      `,
      [repair.word_key],
    );
    if (word.rowCount !== 1) fail(`Repair target ${repair.word_key} is not one active canonical word.`);
    const metadata = await client.query<Record<string, unknown>>(
      `
        select *
        from public.canonical_teaching_dictionary_word_metadata
        where canonical_word_id = $1 and row_status = 'active'
      `,
      [word.rows[0].id],
    );
    if ((metadata.rowCount ?? metadata.rows.length) !== Number(repair.expected_active_metadata_count)) {
      fail(`Repair precondition failed for ${repair.word_key}: active metadata count changed.`);
    }
    if (repair.repair_type === "metadata_replace") {
      const active = metadata.rows[0];
      if (metadataFingerprint(active) !== repair.expected_active_metadata_sha256) {
        fail(`Repair precondition failed for ${repair.word_key}: active metadata facts changed.`);
      }
      assertReplacementPreservesFacts(repair, active);
    }
  }

  const activeCount = await client.query<{ count: string }>(
    "select count(*)::text as count from public.canonical_teaching_dictionary_words where row_status = 'active'",
  );
  const before = Number(activeCount.rows[0].count);
  return {
    status: "ready",
    target,
    projectRef: targetConfig.projectRef,
    releaseId: pkg.manifest.releaseId,
    packageSha256: pkg.manifest.packageSha256,
    batchId: stableUuid("release", `${pkg.manifest.releaseId}:${pkg.manifest.packageSha256}`),
    requiredConfirmation: confirmationToken(pkg, target),
    activeWordCountBefore: before,
    expectedActiveWordCountAfter: before + words.length - Object.keys(reusedWordIds).length,
    newSourceKeys,
    reusedSourceKeys,
    newWords: words.length - Object.keys(reusedWordIds).length,
    reusedWords: Object.keys(reusedWordIds).length,
    reusedWordIds,
    repairs: repairRows.length,
    deferredRepairIntents: pkg.manifest.rowCounts.deferredRepairIntents,
    protectedCounts: await tableCounts(client, PROTECTED_TABLES),
    stagingProof,
  };
}

function confirmationToken(pkg: LoadedCanonicalPackage, target: TargetEnvironment): string {
  return `${pkg.manifest.releaseId}:${pkg.manifest.packageSha256.slice(0, 12)}:${target}`;
}

function rowHash(fileName: string, row: CsvRow): string {
  return sha256Bytes(canonicalJson({ file: fileName, content: row }));
}

function provenance(
  pkg: LoadedCanonicalPackage,
  fileName: string,
  row: CsvRow,
  rowNumber: number,
): Record<string, unknown> {
  return {
    release_id: pkg.manifest.releaseId,
    package_sha256: pkg.manifest.packageSha256,
    workbook_sha256: pkg.manifest.workbookSha256,
    csv_file: fileName,
    source_row_number: rowNumber,
    row_source: row,
  };
}

function auditBase(
  pkg: LoadedCanonicalPackage,
  fileName: string,
  row: CsvRow,
  index: number,
): Record<string, unknown> {
  return {
    source_sheet: fileName,
    source_row_number: index + 2,
    source_row_hash: rowHash(fileName, row),
    source_metadata: provenance(pkg, fileName, row, index + 2),
  };
}

async function repairWordIds(
  client: pg.Client,
  repairs: CsvRow[],
): Promise<Map<string, string>> {
  if (!repairs.length) return new Map();
  const result = await client.query<{ id: string; word_key: string }>(
    `
      select id, word_key
      from public.canonical_teaching_dictionary_words
      where word_key = any($1::text[]) and row_status = 'active'
    `,
    [repairs.map((row) => row.word_key)],
  );
  return new Map(result.rows.map((row) => [row.word_key, row.id]));
}

async function buildTableRows(
  client: pg.Client,
  pkg: LoadedCanonicalPackage,
  plan: DatabasePlan,
): Promise<TableRows> {
  const batchId = plan.batchId;
  const sourceRows = pkg.csv["teaching_content_sources.csv"] ?? [];
  const wordRows = pkg.csv["canonical_words.csv"] ?? [];
  const metadataRows = pkg.csv["canonical_word_metadata.csv"] ?? [];
  const morphologyRows = pkg.csv["canonical_word_morphology.csv"] ?? [];
  const dictationRows = pkg.csv["dictation_sentences.csv"] ?? [];
  const repairs = pkg.csv["canonical_word_repairs.csv"] ?? [];
  const wordIds = new Map(
    wordRows.map((row) => [
      row.word_key,
      plan.reusedWordIds[row.word_key] ?? stableUuid("word", row.word_key),
    ]),
  );
  const existingRepairWordIds = await repairWordIds(client, repairs);

  const sources = sourceRows
    .filter((row) => plan.newSourceKeys.includes(row.source_key))
    .map((row) => ({
      id: stableUuid("source", row.source_key),
      import_batch_id: batchId,
      row_status: "active",
      ...auditBase(pkg, "teaching_content_sources.csv", row, sourceRows.indexOf(row)),
      source_key: row.source_key,
      source_category: row.source_category,
      source_name: nullable(row.source_name),
      source_url: nullable(row.source_url),
      source_licence: nullable(row.source_licence),
      source_use_note: nullable(row.source_use_note),
      importability_status: row.importability_status,
      legal_review_status: row.legal_review_status,
    }));
  const words = wordRows.map((row, index) => ({
    id: wordIds.get(row.word_key),
    import_batch_id: batchId,
    source_id: null,
    row_status: row.row_status,
    ...auditBase(pkg, "canonical_words.csv", row, index),
    word_key: row.word_key,
    normalised_word: row.normalised_word,
    display_word: row.display_word,
    dialect_code: row.dialect_code,
    frequency_band: nullable(row.frequency_band),
    age_band: nullable(row.age_band),
    complexity_band: nullable(row.complexity_band),
    source_category: row.source_category,
    source_name: nullable(row.source_name),
    source_url: nullable(row.source_url),
    source_licence: nullable(row.source_licence),
    source_use_note: nullable(row.source_use_note),
    confidence: row.confidence,
    review_status: row.review_status,
  }));
  const wordInserts = words.filter(
    (row) => !Object.values(plan.reusedWordIds).includes(String(row.id)),
  );

  const metadata: Record<string, unknown>[] = metadataRows.map((row, index) => ({
    id: stableUuid("word_metadata_release", `${pkg.manifest.releaseId}:${row.word_key}`),
    import_batch_id: batchId,
    canonical_word_id: wordIds.get(row.word_key),
    source_id: null,
    row_status: "active",
    ...auditBase(pkg, "canonical_word_metadata.csv", row, index),
    syllables: nullable(row.syllables),
    phoneme_hint: nullable(row.phoneme_hint),
    grapheme_notes: nullable(row.grapheme_notes),
    stress_pattern: nullable(row.stress_pattern),
    has_schwa: row.has_schwa ? parseBoolean(row.has_schwa) : null,
    morphemes: nullable(row.morphemes),
    morphology_notes: nullable(row.morphology_notes),
    irregularity_notes: nullable(row.irregularity_notes),
    source_category: row.source_category,
    source_name: nullable(row.source_name),
    source_url: nullable(row.source_url),
    source_licence: nullable(row.source_licence),
    source_use_note: nullable(row.source_use_note),
    confidence: row.confidence,
    review_status: row.review_status,
    reviewed_by: null,
    reviewed_at: null,
  }));
  for (const [index, row] of repairs.entries()) {
    metadata.push({
      id: stableUuid("repair_metadata", `${pkg.manifest.releaseId}:${row.word_key}`),
      import_batch_id: batchId,
      canonical_word_id: existingRepairWordIds.get(row.word_key),
      source_id: null,
      row_status: "active",
      ...auditBase(pkg, "canonical_word_repairs.csv", row, index),
      syllables: nullable(row.syllables),
      phoneme_hint: nullable(row.phoneme_hint),
      grapheme_notes: nullable(row.grapheme_notes),
      stress_pattern: nullable(row.stress_pattern),
      has_schwa: parseBoolean(row.has_schwa),
      morphemes: nullable(row.morphemes),
      morphology_notes: nullable(row.morphology_notes),
      irregularity_notes: nullable(row.irregularity_notes),
      source_category: row.source_category,
      source_name: nullable(row.source_name),
      source_url: nullable(row.source_url),
      source_licence: nullable(row.source_licence),
      source_use_note: nullable(row.source_use_note),
      confidence: row.confidence,
      review_status: "approved_for_first_exposure",
      reviewed_by: nullable(row.reviewed_by),
      reviewed_at: nullable(row.reviewed_at),
    });
  }

  const morphology = morphologyRows.map((row, index) => ({
    id: stableUuid("word_morphology_release", `${pkg.manifest.releaseId}:${row.word_key}`),
    import_batch_id: batchId,
    canonical_word_id: wordIds.get(row.word_key),
    row_status: "active",
    ...auditBase(pkg, "canonical_word_morphology.csv", row, index),
    raw_morpholex_segmentation: nullable(row.raw_morpholex_segmentation),
    raw_morpholex_pos: nullable(row.raw_morpholex_pos),
    morphology_parts: JSON.parse(row.morphology_parts),
    feature_keys: JSON.parse(row.feature_keys),
    morphology_joins: JSON.parse(row.morphology_joins),
    transformation_notes: nullable(row.transformation_notes),
    word_sum: nullable(row.word_sum),
    analysis_status: row.analysis_status,
    source_category: row.source_category,
    source_name: nullable(row.source_name),
    source_url: nullable(row.source_url),
    source_licence: nullable(row.source_licence),
    source_use_note: nullable(row.source_use_note),
    confidence: row.confidence,
    review_status: row.review_status,
    reviewed_by: nullable(row.reviewed_by),
    reviewed_at: nullable(row.reviewed_at),
    review_notes: nullable(row.review_notes),
  }));

  const dictations = dictationRows.map((row, index) => ({
    id: stableUuid("dictation_sentence_release", `${pkg.manifest.releaseId}:${row.word_key}`),
    import_batch_id: batchId,
    canonical_word_id: wordIds.get(row.word_key),
    row_status: "active",
    ...auditBase(pkg, "dictation_sentences.csv", row, index),
    dictation_sentence: row.dictation_sentence,
    dictation_target_token_index: Number.parseInt(row.dictation_target_token_index, 10),
    audio_text: row.audio_text,
    source_category: row.source_category,
    source_name: nullable(row.source_name),
    source_url: nullable(row.source_url),
    source_licence: nullable(row.source_licence),
    source_use_note: nullable(row.source_use_note),
    confidence: row.confidence,
    review_status: row.review_status,
    reviewed_by: nullable(row.reviewed_by),
    reviewed_at: nullable(row.reviewed_at),
  }));

  return { sources, words, wordInserts, metadata, morphology, dictations };
}

async function captureReusedWordState(
  client: pg.Client,
  plan: DatabasePlan,
): Promise<Record<string, unknown>[]> {
  const ids = Object.values(plan.reusedWordIds);
  if (!ids.length) return [];
  const words = await client.query(
    `
      select *
      from public.canonical_teaching_dictionary_words
      where id = any($1::uuid[]) and row_status = 'active'
      order by word_key
      for update
    `,
    [ids],
  );
  if (words.rowCount !== ids.length) {
    fail("A reusable canonical word changed after preflight.");
  }
  const facts: Record<string, Record<string, unknown>[]> = {};
  for (const [key, spec] of Object.entries({
    metadata: TABLE_SPECS.metadata,
    morphology: TABLE_SPECS.morphology,
    dictations: TABLE_SPECS.dictations,
  })) {
    const result = await client.query(
      `
        select *
        from public.${quoteIdentifier(spec.table)}
        where canonical_word_id = any($1::uuid[]) and row_status = 'active'
        order by canonical_word_id, id
        for update
      `,
      [ids],
    );
    facts[key] = result.rows;
  }
  return words.rows.map((word) => ({
    word,
    metadata: facts.metadata.filter((row) => row.canonical_word_id === word.id),
    morphology: facts.morphology.filter((row) => row.canonical_word_id === word.id),
    dictations: facts.dictations.filter((row) => row.canonical_word_id === word.id),
  }));
}

async function supersedeReusedWordFacts(
  client: pg.Client,
  plan: DatabasePlan,
  rows: TableRows,
): Promise<void> {
  const ids = Object.values(plan.reusedWordIds);
  if (!ids.length) return;
  await client.query(
    `
      update public.canonical_teaching_dictionary_word_metadata
      set row_status = 'superseded', updated_at = now()
      where canonical_word_id = any($1::uuid[]) and row_status = 'active'
    `,
    [ids],
  );
  await client.query(
    `
      update public.canonical_teaching_dictionary_dictation_sentences
      set row_status = 'superseded', updated_at = now()
      where canonical_word_id = any($1::uuid[]) and row_status = 'active'
    `,
    [ids],
  );
  await client.query(
    `
      update public.canonical_teaching_dictionary_word_morphology
      set row_status = 'retired'
      where canonical_word_id = any($1::uuid[]) and row_status = 'active'
    `,
    [ids],
  );

  const expectedById = new Map(
    (rows.words ?? []).map((row) => [String(row.id), row]),
  );
  const columns = TABLE_SPECS.words.columns.filter((column) => column !== "id");
  for (const id of ids) {
    const expected = expectedById.get(id);
    if (!expected) fail(`Expected canonical row is missing for reusable word ${id}.`);
    const values = columns.map((column) => expected[column] ?? null);
    const assignments = columns.map(
      (column, index) => `${quoteIdentifier(column)} = $${index + 1}`,
    );
    const result = await client.query(
      `
        update public.canonical_teaching_dictionary_words
        set ${assignments.join(", ")}, updated_at = now()
        where id = $${values.length + 1} and row_status = 'active'
      `,
      [...values, id],
    );
    if (result.rowCount !== 1) {
      fail(`Reusable canonical word ${id} changed during release.`);
    }
  }
}

/** Preserve the old metadata row as audit history before a review-only replacement. */
async function supersedeReplacementRepairMetadata(
  client: pg.Client,
  pkg: LoadedCanonicalPackage,
): Promise<void> {
  const replacements = (pkg.csv["canonical_word_repairs.csv"] ?? []).filter(
    (repair) => repair.repair_type === "metadata_replace",
  );
  if (!replacements.length) return;
  const ids = await repairWordIds(client, replacements);
  if (ids.size !== replacements.length) fail("A metadata replacement target changed after preflight.");
  const active = await client.query<Record<string, unknown>>(
    `select * from public.canonical_teaching_dictionary_word_metadata
     where canonical_word_id = any($1::uuid[]) and row_status = 'active'
     order by canonical_word_id for update`,
    [[...ids.values()]],
  );
  if ((active.rowCount ?? active.rows.length) !== replacements.length) {
    fail("A metadata replacement target no longer has exactly one active row.");
  }
  for (const replacement of replacements) {
    const wordId = ids.get(replacement.word_key)!;
    const current = active.rows.find((row) => row.canonical_word_id === wordId);
    if (!current || metadataFingerprint(current) !== replacement.expected_active_metadata_sha256) {
      fail(`Replacement repair precondition changed for ${replacement.word_key}.`);
    }
    assertReplacementPreservesFacts(replacement, current);
  }
  const result = await client.query(
    `update public.canonical_teaching_dictionary_word_metadata
     set row_status = 'superseded', updated_at = now()
     where canonical_word_id = any($1::uuid[]) and row_status = 'active'`,
    [[...ids.values()]],
  );
  if (result.rowCount !== replacements.length) {
    fail("Unable to supersede every replaced metadata row.");
  }
}

async function insertRows(
  client: pg.Client,
  spec: TableSpec,
  rows: Record<string, unknown>[],
): Promise<void> {
  const jsonColumns = new Set([
    "source_metadata",
    "morphology_parts",
    "feature_keys",
    "morphology_joins",
  ]);
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHUNK_SIZE);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = spec.columns.map((column) => {
        const value = row[column] ?? null;
        values.push(
          value !== null && jsonColumns.has(column)
            ? JSON.stringify(value)
            : value,
        );
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into public.${quoteIdentifier(spec.table)} (${spec.columns
        .map(quoteIdentifier)
        .join(",")}) values ${tuples.join(",")}`,
      values,
    );
  }
}

function digestValue(value: unknown, key?: string): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (key?.endsWith("_at") && typeof value === "string") return new Date(value).toISOString();
  if (Array.isArray(value)) return value.map((entry) => digestValue(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([childKey, childValue]) => [childKey, digestValue(childValue, childKey)]),
    );
  }
  return value;
}

function rowsDigest(rows: Record<string, unknown>[], columns: string[]): string {
  const normalised = rows
    .map((row) =>
      Object.fromEntries(columns.map((column) => [column, digestValue(row[column], column)])),
    )
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return sha256Bytes(canonicalJson(normalised));
}

async function verification(
  client: pg.Client,
  pkg: LoadedCanonicalPackage,
  plan: DatabasePlan,
  expectedRows?: TableRows,
): Promise<Record<string, unknown>> {
  const rows = expectedRows ?? (await buildTableRows(client, pkg, plan));
  const counts: Record<string, number> = {};
  const digests: Record<string, string> = {};
  for (const [key, spec] of Object.entries(TABLE_SPECS)) {
    const expected = rows[key] ?? [];
    const result = await client.query(
      `select ${spec.columns.map(quoteIdentifier).join(",")}
       from public.${quoteIdentifier(spec.table)}
       where import_batch_id = $1
       order by id`,
      [plan.batchId],
    );
    counts[spec.table] = result.rowCount ?? result.rows.length;
    const expectedDigest = rowsDigest(expected, spec.columns);
    const actualDigest = rowsDigest(result.rows, spec.columns);
    if ((result.rowCount ?? result.rows.length) !== expected.length || actualDigest !== expectedDigest) {
      fail(`Persisted row verification failed for ${spec.table}.`);
    }
    digests[spec.table] = actualDigest;
  }
  const activeCount = await client.query<{ count: string }>(
    "select count(*)::text as count from public.canonical_teaching_dictionary_words where row_status = 'active'",
  );
  if (Number(activeCount.rows[0].count) !== plan.expectedActiveWordCountAfter) {
    fail("Active canonical word count does not reconcile to the release plan.");
  }
  return {
    status: "verified",
    releaseId: pkg.manifest.releaseId,
    packageSha256: pkg.manifest.packageSha256,
    batchId: plan.batchId,
    counts,
    digests,
    activeWordCountBefore: plan.activeWordCountBefore,
    activeWordCountAfter: Number(activeCount.rows[0].count),
    newWords: plan.newWords,
    reusedWords: plan.reusedWords,
    restrictedRole: RELEASE_ROLE,
    deferredRepairIntents: pkg.manifest.rowCounts.deferredRepairIntents,
  };
}

async function writeReceipt(
  pkg: LoadedCanonicalPackage,
  target: TargetEnvironment,
  plan: DatabasePlan,
  verificationSummary: Record<string, unknown>,
  protectedAfter: Record<string, number>,
): Promise<string> {
  const receipt = {
    schemaVersion: "teaching_dictionary_release_receipt_v1",
    target,
    projectRef: TARGETS[target].projectRef,
    releaseId: pkg.manifest.releaseId,
    packageSha256: pkg.manifest.packageSha256,
    workbookSha256: pkg.manifest.workbookSha256,
    sourceCommit: pkg.manifest.sourceCommit,
    importerVersion: IMPORTER_VERSION,
    batchId: plan.batchId,
    verification: verificationSummary,
    protectedCountsBefore: plan.protectedCounts,
    protectedCountsAfter: protectedAfter,
    generatedAt: new Date().toISOString(),
  };
  const path = resolve(pkg.releaseDir, "receipts", `${target}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

async function planCommand(): Promise<void> {
  const releasePath = resolve(arg("--release") ?? fail("--release is required."));
  const target = (arg("--target") ?? fail("--target is required.")) as TargetEnvironment;
  if (!(target in TARGETS)) fail("--target must be staging or production.");
  const pkg = await loadCanonicalPackage(releasePath);
  if (pkg.manifest.productionBaselineReconciliation && target !== "production") {
    fail("Production baseline reconciliation packages cannot be applied to staging.");
  }
  const stagingProof = target === "production" ? await verifyStagingProof(pkg) : undefined;
  const client = clientFor(target);
  await client.connect();
  try {
    await client.query("begin read only");
    const plan = await databasePlan(client, target, pkg, stagingProof);
    await client.query("rollback");
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function releaseCommand(): Promise<void> {
  const releasePath = resolve(arg("--release") ?? fail("--release is required."));
  const target = (arg("--target") ?? fail("--target is required.")) as TargetEnvironment;
  if (!(target in TARGETS)) fail("--target must be staging or production.");
  const pkg = await loadCanonicalPackage(releasePath);
  if (pkg.manifest.productionBaselineReconciliation && target !== "production") {
    fail("Production baseline reconciliation packages cannot be applied to staging.");
  }
  const confirmation = arg("--confirm");
  if (confirmation !== confirmationToken(pkg, target)) {
    fail(`Exact confirmation required: ${confirmationToken(pkg, target)}`);
  }
  const stagingProof = target === "production" ? await verifyStagingProof(pkg) : undefined;
  const client = clientFor(target);
  await client.connect();
  let plan: DatabasePlan | undefined;
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
    plan = await databasePlan(client, target, pkg, stagingProof);
    if (plan.status === "already_applied") {
      await client.query("rollback");
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const rows = await buildTableRows(client, pkg, plan);
    const reusedWordBeforeState = await captureReusedWordState(client, plan);
    await client.query(`set local role ${quoteIdentifier(RELEASE_ROLE)}`);
    await client.query(
      `
        insert into public.canonical_teaching_dictionary_import_batches (
          id, source_folder_path, source_folder_sha256, source_commit,
          validator_version, validation_summary, row_counts, readiness_summary,
          import_mode, batch_status, source_metadata, imported_by, imported_at,
          release_id, package_type, package_schema_version, workbook_sha256,
          package_sha256, target_environment, importer_version, verification_summary
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'validated',$10,$11,now(),
          $12,$13,$14,$15,$16,$17,$18,'{}'::jsonb
        )
      `,
      [
        plan.batchId,
        relative(ROOT, pkg.packageDir),
        pkg.manifest.packageSha256,
        pkg.manifest.sourceCommit,
        "version_3_phase_5c_teaching_dictionary_csv_v4",
        { errors: 0, warnings: 0, package_schema: pkg.manifest.schemaVersion },
        {
          ...pkg.manifest.rowCounts,
          newWords: plan.newWords,
          reusedWords: plan.reusedWords,
        },
        {
          canonical_word_capability_ready: true,
          support_links: 0,
          teaching_content_versions: 0,
          prohibited_writes: 0,
        },
        TARGETS[target].importMode,
        {
          release_manifest: pkg.manifest,
          staging_proof: stagingProof ?? null,
          restricted_role: RELEASE_ROLE,
          reused_word_before_state: reusedWordBeforeState,
        },
        process.env.TEACHING_DICTIONARY_RELEASE_ACTOR ?? "teaching-dictionary-release-cli",
        pkg.manifest.releaseId,
        pkg.manifest.packageType,
        pkg.manifest.packageSchemaVersion,
        pkg.manifest.workbookSha256,
        pkg.manifest.packageSha256,
        target,
        IMPORTER_VERSION,
      ],
    );
    await supersedeReusedWordFacts(client, plan, rows);
    await supersedeReplacementRepairMetadata(client, pkg);
    await insertRows(client, TABLE_SPECS.sources, rows.sources ?? []);
    await insertRows(client, TABLE_SPECS.words, rows.wordInserts ?? []);
    await insertRows(client, TABLE_SPECS.metadata, rows.metadata ?? []);
    await insertRows(client, TABLE_SPECS.morphology, rows.morphology ?? []);
    await insertRows(client, TABLE_SPECS.dictations, rows.dictations ?? []);
    const verified = await verification(client, pkg, plan, rows);
    await client.query(
      `
        update public.canonical_teaching_dictionary_import_batches
        set batch_status = 'applied',
            verification_summary = $2,
            verified_at = now(),
            updated_at = now()
        where id = $1
      `,
      [plan.batchId, verified],
    );
    // The governed release is the authoritative content-ready event. Enqueue
    // only already-pending candidates, inside the same transaction, when the
    // additive canonical-intake migration is present. This writes no learner
    // item or assignment and remains a no-op for pre-migration deployments.
    await client.query("reset role");
    const intakeQueueFunction = await client.query<{ available: boolean }>(
      `select to_regprocedure('public.adle_enqueue_canonical_intake_by_target(text,text,text)') is not null as available`,
    );
    if (intakeQueueFunction.rows[0]?.available) {
      const releasedTargets = new Set(
        (pkg.csv["canonical_words.csv"] ?? [])
          .map((row) => row.normalised_word?.trim().toLowerCase())
          .filter(Boolean),
      );
      for (const targetToken of releasedTargets) {
        await client.query(
          "select public.adle_enqueue_canonical_intake_by_target($1,$2,$3)",
          [
            targetToken,
            "teaching_dictionary_release",
            `teaching-dictionary-release:${pkg.manifest.releaseId}`,
          ],
        );
      }
    }
    await client.query("commit");

    const protectedAfter = await tableCounts(client, PROTECTED_TABLES);
    const receiptPath = await writeReceipt(pkg, target, plan, verified, protectedAfter);
    console.log(
      JSON.stringify(
        {
          status: "applied_and_verified",
          target,
          releaseId: pkg.manifest.releaseId,
          batchId: plan.batchId,
          packageSha256: pkg.manifest.packageSha256,
          receiptPath,
          verification: verified,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function verifyCommand(): Promise<void> {
  const releasePath = resolve(arg("--release") ?? fail("--release is required."));
  const target = (arg("--target") ?? fail("--target is required.")) as TargetEnvironment;
  if (!(target in TARGETS)) fail("--target must be staging or production.");
  const pkg = await loadCanonicalPackage(releasePath);
  const client = clientFor(target);
  await client.connect();
  try {
    const existing = await client.query(
      `
        select id, batch_status, verification_summary, source_metadata
        from public.canonical_teaching_dictionary_import_batches
        where release_id = $1 and package_sha256 = $2
      `,
      [pkg.manifest.releaseId, pkg.manifest.packageSha256],
    );
    if (existing.rowCount !== 1 || existing.rows[0].batch_status !== "applied") {
      fail("Exact applied release batch was not found.");
    }
    const active = await client.query<{ count: string }>(
      "select count(*)::text as count from public.canonical_teaching_dictionary_words where row_status='active'",
    );
    const insertedSources = await client.query<{ source_key: string }>(
      `
        select source_key
        from public.canonical_teaching_dictionary_sources
        where import_batch_id = $1
        order by source_key
      `,
      [existing.rows[0].id],
    );
    const previousSummary = existing.rows[0].verification_summary ?? {};
    const reusedBeforeState = (
      existing.rows[0].source_metadata?.reused_word_before_state ?? []
    ) as Array<{ word: { word_key: string; id: string } }>;
    const reusedWordIds = Object.fromEntries(
      reusedBeforeState.map((entry) => [
        entry.word.word_key,
        entry.word.id,
      ]),
    );
    const reusedWords =
      typeof previousSummary.reusedWords === "number"
        ? previousSummary.reusedWords
        : Object.keys(reusedWordIds).length;
    const newWords =
      typeof previousSummary.newWords === "number"
        ? previousSummary.newWords
        : pkg.manifest.rowCounts.words - reusedWords;
    const activeWordCountBefore =
      typeof previousSummary.activeWordCountBefore === "number"
        ? previousSummary.activeWordCountBefore
        : Number(active.rows[0].count) - pkg.manifest.rowCounts.words;
    const plan: DatabasePlan = {
      status: "already_applied",
      target,
      projectRef: TARGETS[target].projectRef,
      releaseId: pkg.manifest.releaseId,
      packageSha256: pkg.manifest.packageSha256,
      batchId: existing.rows[0].id,
      requiredConfirmation: confirmationToken(pkg, target),
      activeWordCountBefore,
      expectedActiveWordCountAfter: activeWordCountBefore + newWords,
      newSourceKeys: insertedSources.rows.map((row) => row.source_key),
      reusedSourceKeys: [],
      newWords,
      reusedWords,
      reusedWordIds,
      repairs: pkg.manifest.rowCounts.repairs,
      deferredRepairIntents: pkg.manifest.rowCounts.deferredRepairIntents,
      protectedCounts: await tableCounts(client, PROTECTED_TABLES),
    };
    const verified = await verification(client, pkg, plan);
    const protectedAfter = await tableCounts(client, PROTECTED_TABLES);
    const receiptPath = await writeReceipt(pkg, target, plan, verified, protectedAfter);
    console.log(JSON.stringify({ status: "verified", target, receiptPath, verification: verified }, null, 2));
  } finally {
    await client.end();
  }
}

async function dependencyCounts(
  client: pg.Client,
  wordIds: string[],
): Promise<Record<string, number>> {
  const ownedTables = new Set(Object.values(TABLE_SPECS).map((spec) => spec.table));
  const references = await client.query<{ table_name: string; column_name: string }>(
    `
      select c.conrelid::regclass::text as table_name, a.attname as column_name
      from pg_constraint c
      join unnest(c.conkey) with ordinality key(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
      where c.contype = 'f'
        and c.confrelid = 'public.canonical_teaching_dictionary_words'::regclass
    `,
  );
  const counts: Record<string, number> = {};
  for (const reference of references.rows) {
    const tableName = reference.table_name.replace(/^public\./, "");
    if (ownedTables.has(tableName)) continue;
    const result = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.${quoteIdentifier(tableName)}
       where ${quoteIdentifier(reference.column_name)} = any($1::uuid[])`,
      [wordIds],
    );
    const count = Number(result.rows[0].count);
    if (count) counts[`${tableName}.${reference.column_name}`] = count;
  }
  return counts;
}

async function deactivateCommand(): Promise<void> {
  const releasePath = resolve(arg("--release") ?? fail("--release is required."));
  const target = (arg("--target") ?? fail("--target is required.")) as TargetEnvironment;
  if (!(target in TARGETS)) fail("--target must be staging or production.");
  const pkg = await loadCanonicalPackage(releasePath);
  const expected = `${pkg.manifest.releaseId}:deactivate:${target}`;
  if (arg("--confirm") !== expected) fail(`Exact confirmation required: ${expected}`);
  const client = clientFor(target);
  await client.connect();
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
    const batch = await client.query<{
      id: string;
      batch_status: string;
      source_metadata: Record<string, unknown>;
    }>(
      `
        select id, batch_status, source_metadata
        from public.canonical_teaching_dictionary_import_batches
        where release_id=$1 and package_sha256=$2
        for update
      `,
      [pkg.manifest.releaseId, pkg.manifest.packageSha256],
    );
    if (batch.rowCount !== 1 || batch.rows[0].batch_status !== "applied") {
      fail("Only one exact applied release can be deactivated.");
    }
    const reusedBeforeState =
      (batch.rows[0].source_metadata?.reused_word_before_state as unknown[]) ?? [];
    if (reusedBeforeState.length) {
      fail(
        "This release refreshed existing canonical identities; deactivation requires a reviewed restoration release.",
      );
    }
    const words = await client.query<{ id: string }>(
      "select id from public.canonical_teaching_dictionary_words where import_batch_id=$1 for update",
      [batch.rows[0].id],
    );
    const dependencies = await dependencyCounts(client, words.rows.map((row) => row.id));
    if (Object.keys(dependencies).length) {
      fail(`Release has runtime dependencies and cannot be deactivated: ${JSON.stringify(dependencies)}.`);
    }
    await client.query(`set local role ${quoteIdentifier(RELEASE_ROLE)}`);
    await client.query(
      "update public.canonical_teaching_dictionary_dictation_sentences set row_status='superseded',updated_at=now() where import_batch_id=$1 and row_status='active'",
      [batch.rows[0].id],
    );
    await client.query(
      "update public.canonical_teaching_dictionary_word_morphology set row_status='retired' where import_batch_id=$1 and row_status='active'",
      [batch.rows[0].id],
    );
    await client.query(
      "update public.canonical_teaching_dictionary_word_metadata set row_status='superseded',updated_at=now() where import_batch_id=$1 and row_status='active'",
      [batch.rows[0].id],
    );
    await client.query(
      "update public.canonical_teaching_dictionary_words set row_status='superseded',updated_at=now() where import_batch_id=$1 and row_status='active'",
      [batch.rows[0].id],
    );
    await client.query(
      `
        update public.canonical_teaching_dictionary_import_batches
        set batch_status='deactivated',deactivated_at=now(),deactivation_note=$2,updated_at=now()
        where id=$1
      `,
      [
        batch.rows[0].id,
        `Guarded deactivation by ${process.env.TEACHING_DICTIONARY_RELEASE_ACTOR ?? "teaching-dictionary-release-cli"}`,
      ],
    );
    await client.query("commit");
    console.log(JSON.stringify({ status: "deactivated", target, releaseId: pkg.manifest.releaseId }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function usage(): string {
  return `
Teaching Dictionary release CLI

  prepare    --workbook <xlsx> --candidate-csv <folder> --release-id <id> [--release-root <folder>]
  prepare-repair --workbook <xlsx> --repairs <csv> --release-id <id> [--release-root <folder>]
  plan       --release <release-folder> --target staging|production
  release    --release <release-folder> --target staging|production --confirm <exact-token>
  verify     --release <release-folder> --target staging|production
  deactivate --release <release-folder> --target staging|production --confirm <exact-token>

Database credentials are read only from SUPABASE_STAGING_DB_URL and
SUPABASE_PRODUCTION_DB_URL.
`.trim();
}

export async function main(): Promise<void> {
  if (process.argv.includes("--help") || !command()) {
    console.log(usage());
    return;
  }
  switch (command()) {
    case "prepare":
      await prepare();
      break;
    case "prepare-repair":
      await prepareRepair();
      break;
    case "plan":
      await planCommand();
      break;
    case "release":
      await releaseCommand();
      break;
    case "verify":
      await verifyCommand();
      break;
    case "deactivate":
      await deactivateCommand();
      break;
    default:
      fail(`Unknown command ${command()}.\n\n${usage()}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
