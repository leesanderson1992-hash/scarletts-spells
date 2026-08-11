import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";

export const CANONICAL_PACKAGE_TYPE = "canonical_word_batch_v1";
export const CANONICAL_REPAIR_PACKAGE_TYPE = "canonical_word_repair_v1";
export type CanonicalPackageType =
  | typeof CANONICAL_PACKAGE_TYPE
  | typeof CANONICAL_REPAIR_PACKAGE_TYPE;
export const CANONICAL_PACKAGE_SCHEMA = "canonical_word_release_manifest_v2";
export const IMPORTER_VERSION = "teaching_dictionary_release_v1";
export const REQUIRED_MIGRATION_VERSIONS = [
  "20260724140000",
  "20260726150000",
  "20260726170000",
  "20260726173000",
  "20260726174000",
] as const;
export const MAX_CANONICAL_WORDS = 1000;

export const CANONICAL_REQUIRED_FILES = [
  "canonical_words.csv",
  "canonical_word_metadata.csv",
  "canonical_word_morphology.csv",
  "dictation_sentences.csv",
  "teaching_content_sources.csv",
] as const;

export const CANONICAL_OPTIONAL_FILES = ["canonical_word_repairs.csv"] as const;
export const CANONICAL_REPAIR_REQUIRED_FILES = ["canonical_word_repairs.csv"] as const;

export const PROHIBITED_TABLE_FAMILIES = [
  "learner",
  "assignment",
  "evidence",
  "proficiency",
  "reward",
  "word_treasure",
] as const;

export type TargetEnvironment = "staging" | "production";

export type CsvRow = Record<string, string>;

export type ReleaseCounts = {
  sources: number;
  words: number;
  metadata: number;
  morphology: number;
  dictations: number;
  repairs: number;
  deferredRepairIntents: number;
};

export type ReleaseManifest = {
  schemaVersion: typeof CANONICAL_PACKAGE_SCHEMA;
  releaseId: string;
  packageType: CanonicalPackageType;
  packageSchemaVersion: "v2";
  packageSha256: string;
  workbookSha256: string;
  sourceCommit: string | null;
  requiredMigrationVersions: string[];
  fileSha256: Record<string, string>;
  rowCounts: ReleaseCounts;
  reviewerSummary: {
    reviewers: string[];
    reviewedDates: string[];
  };
  sourceApprovalSummary: {
    importable: number;
    legalPassedOrNotRequired: number;
  };
  expectedTargetTables: string[];
  prohibitedTableFamilies: string[];
  deferredRepairIntentFile: string | null;
  deferredRepairIntentsSha256: string | null;
  productionBaselineReconciliation?: {
    targetEnvironment: "production";
    stagingEvidenceReleaseId: string;
    stagingEvidencePackageSha256: string;
    approvedBy: string;
    approvedAt: string;
    justification: string;
  };
};

export type ReleaseManifestFingerprint = Omit<ReleaseManifest, "packageSha256">;

export type LoadedCanonicalPackage = {
  releaseDir: string;
  packageDir: string;
  manifest: ReleaseManifest;
  csv: Record<string, CsvRow[]>;
};

export function requiredFilesForPackage(packageType: CanonicalPackageType): readonly string[] {
  return packageType === CANONICAL_REPAIR_PACKAGE_TYPE
    ? CANONICAL_REPAIR_REQUIRED_FILES
    : CANONICAL_REQUIRED_FILES;
}

export function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

/**
 * Fingerprint every release-authorising manifest field, not just its data
 * files. This makes a change to migrations, target tables, provenance or
 * review policy a different immutable package.
 */
export function packageSha256(input: ReleaseManifestFingerprint): string {
  return sha256Bytes(canonicalJson(input));
}

/**
 * Small RFC 4180 parser used to keep the release tool dependency-light. It
 * supports quoted commas, quotes, CRLF and embedded newlines.
 */
export function parseCsv(text: string): CsvRow[] {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      matrix.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    matrix.push(row);
  }
  if (!matrix.length) return [];
  const headers = matrix[0].map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim(),
  );
  if (headers.some((header) => !header)) throw new Error("CSV contains a blank header.");
  return matrix
    .slice(1)
    .filter((values) => values.some((value) => value !== ""))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

export function csvLine(values: string[]): string {
  return values
    .map((value) => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

export function stringifyCsv(headers: string[], rows: CsvRow[]): string {
  return `${[csvLine(headers), ...rows.map((row) => csvLine(headers.map((header) => row[header] ?? "")))].join("\n")}\n`;
}

export async function readCsv(path: string): Promise<CsvRow[]> {
  return parseCsv(await readFile(path, "utf8"));
}

function normaliseCell(value: string): string {
  return String(value ?? "").trim();
}

function requireColumns(fileName: string, rows: CsvRow[], columns: string[]): void {
  if (!rows.length) throw new Error(`${fileName} must contain at least one data row.`);
  const available = new Set(Object.keys(rows[0]));
  const missing = columns.filter((column) => !available.has(column));
  if (missing.length) throw new Error(`${fileName} is missing columns: ${missing.join(", ")}.`);
}

function uniqueValues(rows: CsvRow[], field: string, fileName: string): Set<string> {
  const values = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const value = normaliseCell(row[field]);
    if (!value) throw new Error(`${fileName} row ${index + 2} has a blank ${field}.`);
    if (values.has(value)) throw new Error(`${fileName} duplicates ${field}=${value}.`);
    values.add(value);
  }
  return values;
}

function validateRepairs(rows: CsvRow[]): void {
  if (!rows.length) return;
  requireColumns(
    "canonical_word_repairs.csv",
    rows,
    [
      "word_key",
      "repair_type",
      "expected_active_metadata_count",
      "syllables",
      "phoneme_hint",
      "stress_pattern",
      "has_schwa",
      "morphemes",
      "morphology_notes",
      "source_category",
      "source_name",
      "source_licence",
      "source_use_note",
      "confidence",
      "review_status",
      "reviewed_by",
      "reviewed_at",
    ],
  );
  uniqueValues(rows, "word_key", "canonical_word_repairs.csv");
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    if (!["metadata_add", "metadata_replace"].includes(row.repair_type)) {
      throw new Error(`canonical_word_repairs.csv row ${rowNumber} uses unsupported repair_type.`);
    }
    const expectedCount = row.repair_type === "metadata_add" ? "0" : "1";
    if (row.expected_active_metadata_count !== expectedCount) {
      throw new Error(`canonical_word_repairs.csv row ${rowNumber} has an invalid active-metadata precondition.`);
    }
    for (const field of [
      "syllables",
      "phoneme_hint",
      "stress_pattern",
      "has_schwa",
      "morphemes",
      "morphology_notes",
      "source_category",
      "source_name",
      "source_licence",
      "source_use_note",
      "confidence",
      "reviewed_by",
      "reviewed_at",
    ]) {
      if (!normaliseCell(row[field])) {
        throw new Error(`canonical_word_repairs.csv row ${rowNumber} is missing ${field}.`);
      }
    }
    if (!["approved", "approved_for_first_exposure"].includes(row.review_status)) {
      throw new Error(`canonical_word_repairs.csv row ${rowNumber} is not approved.`);
    }
    if (
      row.repair_type === "metadata_replace" &&
      !/^[a-f0-9]{64}$/i.test(normaliseCell(row.expected_active_metadata_sha256))
    ) {
      throw new Error(`canonical_word_repairs.csv row ${rowNumber} lacks an active metadata fingerprint.`);
    }
  }
}

export function validateCanonicalCsv(csv: Record<string, CsvRow[]>): ReleaseCounts {
  const words = csv["canonical_words.csv"] ?? [];
  const metadata = csv["canonical_word_metadata.csv"] ?? [];
  const morphology = csv["canonical_word_morphology.csv"] ?? [];
  const dictations = csv["dictation_sentences.csv"] ?? [];
  const sources = csv["teaching_content_sources.csv"] ?? [];
  const repairs = csv["canonical_word_repairs.csv"] ?? [];

  requireColumns("canonical_words.csv", words, [
    "word_key",
    "normalised_word",
    "display_word",
    "dialect_code",
    "frequency_band",
    "age_band",
    "complexity_band",
    "review_status",
    "row_status",
  ]);
  requireColumns("canonical_word_metadata.csv", metadata, [
    "word_key",
    "syllables",
    "phoneme_hint",
    "stress_pattern",
    "has_schwa",
    "review_status",
  ]);
  requireColumns("canonical_word_morphology.csv", morphology, [
    "word_key",
    "morphology_parts",
    "feature_keys",
    "morphology_joins",
    "word_sum",
    "analysis_status",
    "review_status",
    "reviewed_by",
    "reviewed_at",
  ]);
  requireColumns("dictation_sentences.csv", dictations, [
    "word_key",
    "display_word",
    "dictation_sentence",
    "dictation_target_token_index",
    "audio_text",
    "review_status",
    "reviewed_by",
    "reviewed_at",
  ]);
  requireColumns("teaching_content_sources.csv", sources, [
    "source_key",
    "importability_status",
    "legal_review_status",
  ]);

  if (words.length < 1 || words.length > MAX_CANONICAL_WORDS) {
    throw new Error(`Canonical word batches must contain 1-${MAX_CANONICAL_WORDS} words.`);
  }
  if (metadata.length !== words.length || morphology.length !== words.length || dictations.length !== words.length) {
    throw new Error("Every canonical word requires exactly one metadata, morphology and dictation row.");
  }

  const wordKeys = uniqueValues(words, "word_key", "canonical_words.csv");
  uniqueValues(words, "normalised_word", "canonical_words.csv");
  const metadataKeys = uniqueValues(metadata, "word_key", "canonical_word_metadata.csv");
  const morphologyKeys = uniqueValues(morphology, "word_key", "canonical_word_morphology.csv");
  const dictationKeys = uniqueValues(dictations, "word_key", "dictation_sentences.csv");
  uniqueValues(sources, "source_key", "teaching_content_sources.csv");

  for (const [label, keys] of [
    ["metadata", metadataKeys],
    ["morphology", morphologyKeys],
    ["dictation", dictationKeys],
  ] as const) {
    if (keys.size !== wordKeys.size || [...wordKeys].some((key) => !keys.has(key))) {
      throw new Error(`${label} word keys do not exactly match canonical_words.csv.`);
    }
  }

  const displayByKey = new Map(words.map((row) => [row.word_key, row.display_word]));
  for (const [index, row] of words.entries()) {
    if (
      row.row_status !== "active" ||
      row.review_status !== "approved_for_first_exposure" ||
      row.dialect_code !== "en-GB"
    ) {
      throw new Error(`canonical_words.csv row ${index + 2} is not an active approved en-GB word.`);
    }
    for (const field of ["frequency_band", "age_band", "complexity_band"]) {
      if (!normaliseCell(row[field])) throw new Error(`canonical_words.csv row ${index + 2} is missing ${field}.`);
    }
  }
  for (const [index, row] of metadata.entries()) {
    if (
      row.review_status !== "approved_for_first_exposure" ||
      !normaliseCell(row.phoneme_hint) ||
      !/^[1-9][0-9]*$/.test(normaliseCell(row.syllables)) ||
      ["", "in_review", "unknown"].includes(normaliseCell(row.stress_pattern)) ||
      !/^(TRUE|FALSE)$/i.test(normaliseCell(row.has_schwa))
    ) {
      throw new Error(`canonical_word_metadata.csv row ${index + 2} lacks approved pronunciation metadata.`);
    }
  }
  for (const [index, row] of morphology.entries()) {
    const rowNumber = index + 2;
    if (!["approved", "not_applicable", "rejected"].includes(row.analysis_status)) {
      throw new Error(`canonical_word_morphology.csv row ${rowNumber} has unresolved analysis_status.`);
    }
    for (const field of ["morphology_parts", "feature_keys", "morphology_joins"]) {
      try {
        const parsed = JSON.parse(row[field]);
        if (!Array.isArray(parsed)) throw new Error();
      } catch {
        throw new Error(`canonical_word_morphology.csv row ${rowNumber} has invalid ${field}.`);
      }
    }
    if (
      row.analysis_status === "approved" &&
      (!normaliseCell(row.word_sum) || JSON.parse(row.morphology_parts).length === 0)
    ) {
      throw new Error(`canonical_word_morphology.csv row ${rowNumber} approves an empty word sum.`);
    }
    if (
      row.review_status !== "approved_for_first_exposure" ||
      !normaliseCell(row.reviewed_by) ||
      !normaliseCell(row.reviewed_at)
    ) {
      throw new Error(`canonical_word_morphology.csv row ${rowNumber} lacks named approval.`);
    }
  }
  for (const [index, row] of dictations.entries()) {
    const rowNumber = index + 2;
    const target = displayByKey.get(row.word_key);
    const tokens = row.dictation_sentence
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, ""));
    const targetIndex = Number.parseInt(row.dictation_target_token_index, 10);
    const targetEndExclusive = normaliseCell(row.dictation_target_end_exclusive)
      ? Number.parseInt(row.dictation_target_end_exclusive, 10)
      : targetIndex + 1;
    const exactGovernedAnswer = normaliseCell(row.exact_governed_answer) || target || "";
    const governedTokenCount = targetEndExclusive - targetIndex;
    const occurrences = tokens.filter((_, tokenIndex) =>
      tokens.slice(tokenIndex, tokenIndex + governedTokenCount).join(" ").toLocaleLowerCase("en-GB") ===
      exactGovernedAnswer.toLocaleLowerCase("en-GB")
    ).length;
    if (
      row.review_status !== "approved_for_first_exposure" ||
      row.dictation_sentence !== row.audio_text ||
      !Number.isInteger(targetIndex) ||
      !Number.isInteger(targetEndExclusive) || targetEndExclusive <= targetIndex ||
      exactGovernedAnswer.toLocaleLowerCase("en-GB") !== target?.toLocaleLowerCase("en-GB") ||
      tokens.slice(targetIndex, targetEndExclusive).join(" ").toLocaleLowerCase("en-GB") !== exactGovernedAnswer.toLocaleLowerCase("en-GB") ||
      occurrences !== 1 ||
      !normaliseCell(row.reviewed_by) ||
      !normaliseCell(row.reviewed_at)
    ) {
      throw new Error(`dictation_sentences.csv row ${rowNumber} fails the reviewed contextual-dictation contract.`);
    }
  }
  for (const [index, row] of sources.entries()) {
    if (
      row.importability_status !== "importable" ||
      !["passed", "not_required"].includes(row.legal_review_status)
    ) {
      throw new Error(`teaching_content_sources.csv row ${index + 2} is not importable and legally approved.`);
    }
  }
  validateRepairs(repairs);

  return {
    sources: sources.length,
    words: words.length,
    metadata: metadata.length,
    morphology: morphology.length,
    dictations: dictations.length,
    repairs: repairs.length,
    deferredRepairIntents: 0,
  };
}

export function validateCanonicalRepairCsv(csv: Record<string, CsvRow[]>): ReleaseCounts {
  const repairs = csv["canonical_word_repairs.csv"] ?? [];
  validateRepairs(repairs);
  return {
    sources: 0,
    words: 0,
    metadata: 0,
    morphology: 0,
    dictations: 0,
    repairs: repairs.length,
    deferredRepairIntents: 0,
  };
}

export function validatePackageCsv(
  packageType: CanonicalPackageType,
  csv: Record<string, CsvRow[]>,
): ReleaseCounts {
  return packageType === CANONICAL_REPAIR_PACKAGE_TYPE
    ? validateCanonicalRepairCsv(csv)
    : validateCanonicalCsv(csv);
}

export async function loadCanonicalPackage(releasePath: string): Promise<LoadedCanonicalPackage> {
  const releaseDir = resolve(releasePath);
  const packageDir = resolve(releaseDir, "package");
  const manifestPath = resolve(packageDir, "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ReleaseManifest;
  if (
    manifest.schemaVersion !== CANONICAL_PACKAGE_SCHEMA ||
    ![CANONICAL_PACKAGE_TYPE, CANONICAL_REPAIR_PACKAGE_TYPE].includes(manifest.packageType) ||
    manifest.packageSchemaVersion !== "v2"
  ) {
    throw new Error("Release manifest has an unsupported canonical package type.");
  }
  if (manifest.productionBaselineReconciliation) {
    const reconciliation = manifest.productionBaselineReconciliation;
    if (
      manifest.packageType !== CANONICAL_REPAIR_PACKAGE_TYPE ||
      reconciliation.targetEnvironment !== "production" ||
      !reconciliation.stagingEvidenceReleaseId ||
      !/^[a-f0-9]{64}$/i.test(reconciliation.stagingEvidencePackageSha256) ||
      !reconciliation.approvedBy ||
      !reconciliation.approvedAt ||
      !reconciliation.justification
    ) {
      throw new Error("Release manifest has an invalid production reconciliation policy.");
    }
  }

  const names = (await readdir(packageDir)).sort();
  const accepted = new Set<string>([
    ...requiredFilesForPackage(manifest.packageType),
    ...(manifest.packageType === CANONICAL_PACKAGE_TYPE ? CANONICAL_OPTIONAL_FILES : []),
    "release-manifest.json",
  ]);
  const unexpected = names.filter((name) => !accepted.has(name));
  if (unexpected.length) throw new Error(`Release package contains unexpected files: ${unexpected.join(", ")}.`);
  for (const fileName of requiredFilesForPackage(manifest.packageType)) {
    if (!names.includes(fileName)) throw new Error(`Release package is missing ${fileName}.`);
  }

  const csv: Record<string, CsvRow[]> = {};
  const fileSha256: Record<string, string> = {};
  for (const fileName of [
    ...requiredFilesForPackage(manifest.packageType),
    ...(manifest.packageType === CANONICAL_PACKAGE_TYPE ? CANONICAL_OPTIONAL_FILES : []),
  ]) {
    if (!names.includes(fileName)) continue;
    const path = resolve(packageDir, fileName);
    csv[fileName] = await readCsv(path);
    fileSha256[fileName] = await sha256File(path);
  }
  if (canonicalJson(fileSha256) !== canonicalJson(manifest.fileSha256)) {
    throw new Error("Release package file hashes do not match the manifest.");
  }
  const workbookSha = await sha256File(resolve(releaseDir, "approved-workbook.xlsx"));
  if (workbookSha !== manifest.workbookSha256) {
    throw new Error("Approved workbook SHA-256 does not match the manifest.");
  }
  if (manifest.deferredRepairIntentFile) {
    if (!manifest.deferredRepairIntentsSha256) {
      throw new Error("Release manifest is missing the deferred-repair hash.");
    }
    const deferredSha = await sha256File(resolve(releaseDir, manifest.deferredRepairIntentFile));
    if (deferredSha !== manifest.deferredRepairIntentsSha256) {
      throw new Error("Deferred repair intentions SHA-256 does not match the manifest.");
    }
  } else if (manifest.deferredRepairIntentsSha256 !== null) {
    throw new Error("Release manifest declares a deferred-repair hash without its file.");
  }
  const { packageSha256: declaredPackageSha, ...fingerprint } = manifest;
  const calculatedPackageSha = packageSha256(fingerprint);
  if (calculatedPackageSha !== declaredPackageSha) {
    throw new Error("Release package SHA-256 does not match the manifest.");
  }
  const counts = validatePackageCsv(manifest.packageType, csv);
  counts.deferredRepairIntents = manifest.rowCounts.deferredRepairIntents ?? 0;
  if (canonicalJson(counts) !== canonicalJson(manifest.rowCounts)) {
    throw new Error("Release package row counts do not match the manifest.");
  }
  return { releaseDir, packageDir, manifest, csv };
}

export function fileLabel(path: string): string {
  return basename(path);
}
