import crypto from "crypto";

const MAX_SEED_UPLOAD_ROWS = 1000;
const NORMALIZATION_VERSION = "spelling_normalize_v1";
const REPORT_SCHEMA_VERSION = "version_2_slice_4d_2_upload";

const REQUIRED_COLUMNS = [
  "misspelling",
  "correction",
  "suggested_micro_skill_key",
  "confidence",
  "source",
  "note",
] as const;

const OPTIONAL_COLUMNS = [
  "dialect",
  "age_band",
  "source_url",
  "source_dataset",
  "pattern_hint",
  "route_hint",
  "source_row_id",
  "import_batch_name",
] as const;

const KNOWN_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

export type SeedUploadBucket =
  | "pending_candidate_review"
  | "manual_review_required"
  | "rejected_from_import";

export type SeedUploadMicroSkill = {
  micro_skill_key: string;
  mastery_domain_key: string | null;
  is_active: boolean | null;
  is_assignable: boolean | null;
};

export type SeedUploadCanonicalMapping = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  dialect_code: string | null;
  normalization_version: string | null;
  mapping_status: string | null;
  micro_skill_key: string;
};

export type SeedUploadPreviewRow = {
  row_number: number;
  source_row_id: string | null;
  import_batch_name: string | null;
  misspelling: string;
  correction: string;
  misspelling_normalized: string | null;
  correct_spelling_normalized: string | null;
  dialect_code: string;
  uploaded_micro_skill_key: string;
  stored_micro_skill_key: string | null;
  micro_skill_validation_status:
    | "blank"
    | "unknown"
    | "active_assignable_d4"
    | "inactive"
    | "non_assignable"
    | "non_d4";
  confidence_original: string;
  confidence_normalized: number | null;
  source: string;
  source_dataset: string | null;
  source_url: string | null;
  note: string;
  age_band: string | null;
  pattern_hint: string | null;
  route_hint: string | null;
  bucket: SeedUploadBucket;
  reasons: string[];
  blocking_errors: string[];
  manual_review_warnings: string[];
  canonical_match_ids: string[];
  canonical_conflict_ids: string[];
  duplicate_group_key: string | null;
  conflict_group_key: string | null;
  recommended_next_action: string;
};

export type SeedUploadPreview = {
  schema_version: string;
  generated_at: string;
  input_file: string;
  input_format: "csv";
  normalization_version: string;
  source_file_sha256: string;
  summary: {
    total_rows: number;
    importable_rows: number;
    manual_review_rows: number;
    rejected_rows: number;
  };
  rows: SeedUploadPreviewRow[];
  warnings: string[];
};

export type SeedUploadImportPlan = {
  batch: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  sourceFileSha256: string;
};

type CsvRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeCell(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeSpellingLookupText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeDialect(value: string | undefined) {
  const normalized = normalizeCell(value);
  return normalized.length > 0 ? normalized : "en-GB";
}

function normalizeConfidence(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized === "low") {
    return 0.25;
  }

  if (normalized === "medium") {
    return 0.5;
  }

  if (normalized === "high") {
    return 0.85;
  }

  const numericValue = Number(normalized);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (numericValue >= 0 && numericValue <= 1) {
    return numericValue;
  }

  if (numericValue >= 0 && numericValue <= 100) {
    return numericValue / 100;
  }

  return null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((csvRow, rowIndex) => {
    if (rowIndex === 0) {
      return true;
    }
    return csvRow.some((value) => value.trim().length > 0);
  });
}

function buildCsvRecords(csvText: string) {
  const rows = parseCsv(csvText);

  if (rows.length === 0 || rows[0].every((value) => value.trim().length === 0)) {
    throw new Error("CSV file must include a header row.");
  }

  const headers = rows[0].map((value) => value.trim());
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );

  if (duplicateHeaders.length > 0) {
    throw new Error(
      `CSV header contains duplicate columns: ${Array.from(new Set(duplicateHeaders)).join(", ")}`,
    );
  }

  const records = rows.slice(1).map((row, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      values[header] = normalizeCell(row[headerIndex]);
    });
    return {
      rowNumber: index + 2,
      values,
    };
  });

  return { headers, records };
}

function getKnownValue(values: Record<string, string>, key: string) {
  return normalizeCell(values[key]);
}

function addUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function addBlockingError(row: SeedUploadPreviewRow, reason: string, error: string) {
  addUnique(row.reasons, reason);
  addUnique(row.blocking_errors, error);
}

function addManualWarning(row: SeedUploadPreviewRow, reason: string, warning: string) {
  addUnique(row.reasons, reason);
  addUnique(row.manual_review_warnings, warning);
}

function buildPairDialectKey(row: SeedUploadPreviewRow) {
  return [
    row.misspelling_normalized ?? "",
    row.correct_spelling_normalized ?? "",
    row.dialect_code,
  ].join("|");
}

function applyBucket(row: SeedUploadPreviewRow) {
  if (row.blocking_errors.length > 0) {
    row.bucket = "rejected_from_import";
    row.recommended_next_action = "Fix blocking errors before this row can be imported.";
    return;
  }

  if (row.manual_review_warnings.length > 0 || !row.stored_micro_skill_key) {
    row.bucket = "manual_review_required";
    row.recommended_next_action =
      "Import for admin review; assign or confirm the micro-skill before canonical adoption.";
    return;
  }

  row.bucket = "pending_candidate_review";
  row.recommended_next_action = "Import as a pending candidate-review seed row.";
}

function classifySkill(
  row: SeedUploadPreviewRow,
  microSkillsByKey: Map<string, SeedUploadMicroSkill>,
) {
  const key = row.uploaded_micro_skill_key.trim();

  if (!key) {
    row.micro_skill_validation_status = "blank";
    row.stored_micro_skill_key = null;
    addManualWarning(
      row,
      "missing_suggested_micro_skill_key",
      "No suggested micro-skill key was provided; the row will need manual skill review.",
    );
    return;
  }

  const skill = microSkillsByKey.get(key);

  if (!skill) {
    row.micro_skill_validation_status = "unknown";
    row.stored_micro_skill_key = null;
    addManualWarning(
      row,
      "unknown_micro_skill",
      `Suggested micro-skill key ${key} was not found; it will be stored blank for review.`,
    );
    return;
  }

  row.stored_micro_skill_key = key;

  if (skill.is_active !== true) {
    row.micro_skill_validation_status = "inactive";
    addManualWarning(row, "inactive_micro_skill", `${key} exists but is inactive.`);
    return;
  }

  if (skill.is_assignable !== true) {
    row.micro_skill_validation_status = "non_assignable";
    addManualWarning(row, "non_assignable_micro_skill", `${key} exists but is not assignable.`);
    return;
  }

  if (skill.mastery_domain_key !== "D4") {
    row.micro_skill_validation_status = "non_d4";
    addManualWarning(row, "non_d4_micro_skill", `${key} exists but is not Domain 4.`);
    return;
  }

  row.micro_skill_validation_status = "active_assignable_d4";
}

function compareCanonicalMappings(
  row: SeedUploadPreviewRow,
  mappings: SeedUploadCanonicalMapping[],
) {
  if (!row.misspelling_normalized || !row.correct_spelling_normalized) {
    return;
  }

  const matchingMappings = mappings.filter(
    (mapping) =>
      mapping.mapping_status === "active" &&
      (mapping.dialect_code ?? "en-GB") === row.dialect_code &&
      mapping.normalization_version === NORMALIZATION_VERSION &&
      mapping.misspelling_normalized === row.misspelling_normalized &&
      mapping.correct_spelling_normalized === row.correct_spelling_normalized,
  );

  for (const mapping of matchingMappings) {
    if (mapping.micro_skill_key === row.stored_micro_skill_key) {
      row.canonical_match_ids.push(mapping.id);
      addManualWarning(
        row,
        "existing_canonical_same_pair_same_skill",
        `Existing active canonical mapping ${mapping.id} already matches this pair and skill.`,
      );
    } else {
      row.canonical_conflict_ids.push(mapping.id);
      addBlockingError(
        row,
        "canonical_same_pair_different_skill_conflict",
        `Existing active canonical mapping ${mapping.id} maps this pair to ${mapping.micro_skill_key}.`,
      );
    }
  }
}

export function buildSeedUploadPreview(input: {
  csvText: string;
  fileName: string;
  now?: Date;
  microSkills: SeedUploadMicroSkill[];
  canonicalMappings?: SeedUploadCanonicalMapping[];
}): SeedUploadPreview {
  const warnings: string[] = [];
  const { headers, records } = buildCsvRecords(input.csvText);
  const missingRequiredColumns = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  const unknownColumns = headers.filter((header) => !KNOWN_COLUMNS.has(header));

  if (records.length > MAX_SEED_UPLOAD_ROWS) {
    throw new Error(`CSV upload is limited to ${MAX_SEED_UPLOAD_ROWS} data rows.`);
  }

  if (unknownColumns.length > 0) {
    warnings.push(`Unknown columns ignored: ${unknownColumns.join(", ")}`);
  }

  const microSkillsByKey = new Map(
    input.microSkills.map((skill) => [skill.micro_skill_key, skill]),
  );

  const rows: SeedUploadPreviewRow[] = records.map((record) => {
    const values = record.values;
    const misspelling = getKnownValue(values, "misspelling");
    const correction = getKnownValue(values, "correction");
    const source = getKnownValue(values, "source");
    const note = getKnownValue(values, "note");
    const uploadedMicroSkillKey = getKnownValue(values, "suggested_micro_skill_key");
    const confidenceOriginal = getKnownValue(values, "confidence");
    const confidenceNormalized = normalizeConfidence(confidenceOriginal);
    const misspellingNormalized = normalizeSpellingLookupText(misspelling);
    const correctSpellingNormalized = normalizeSpellingLookupText(correction);
    const dialectCode = normalizeDialect(values.dialect);
    const reasons: string[] = [];
    const blockingErrors: string[] = [];

    for (const column of missingRequiredColumns) {
      blockingErrors.push(`Missing required column: ${column}`);
      reasons.push("missing_required_column");
    }

    const row: SeedUploadPreviewRow = {
      row_number: record.rowNumber,
      source_row_id: getKnownValue(values, "source_row_id") || null,
      import_batch_name: getKnownValue(values, "import_batch_name") || null,
      misspelling,
      correction,
      misspelling_normalized: misspellingNormalized,
      correct_spelling_normalized: correctSpellingNormalized,
      dialect_code: dialectCode,
      uploaded_micro_skill_key: uploadedMicroSkillKey,
      stored_micro_skill_key: null,
      micro_skill_validation_status: "blank",
      confidence_original: confidenceOriginal,
      confidence_normalized: confidenceNormalized,
      source,
      source_dataset: getKnownValue(values, "source_dataset") || null,
      source_url: getKnownValue(values, "source_url") || null,
      note,
      age_band: getKnownValue(values, "age_band") || null,
      pattern_hint: getKnownValue(values, "pattern_hint") || null,
      route_hint: getKnownValue(values, "route_hint") || null,
      bucket: "pending_candidate_review",
      reasons,
      blocking_errors: blockingErrors,
      manual_review_warnings: [],
      canonical_match_ids: [],
      canonical_conflict_ids: [],
      duplicate_group_key: null,
      conflict_group_key: null,
      recommended_next_action: "",
    };

    if (!misspellingNormalized) {
      addBlockingError(row, "empty_misspelling", "Misspelling is empty after normalization.");
    }

    if (!correctSpellingNormalized) {
      addBlockingError(row, "empty_correction", "Correction is empty after normalization.");
    }

    if (
      misspellingNormalized &&
      correctSpellingNormalized &&
      misspellingNormalized === correctSpellingNormalized
    ) {
      addBlockingError(
        row,
        "same_normalized_pair",
        "Misspelling and correction normalize to the same value.",
      );
    }

    if (confidenceNormalized === null) {
      addBlockingError(
        row,
        "invalid_confidence",
        "Confidence must be 0..1, 0..100, or low/medium/high.",
      );
    }

    if (!source) {
      addBlockingError(row, "missing_source", "Source is required.");
    }

    if (!note) {
      addBlockingError(row, "missing_note_provenance", "Note/provenance is required.");
    }

    classifySkill(row, microSkillsByKey);
    compareCanonicalMappings(row, input.canonicalMappings ?? []);
    return row;
  });

  const seenTriples = new Set<string>();
  const duplicateGroups = new Map<string, SeedUploadPreviewRow[]>();
  const conflictGroups = new Map<string, Map<string, SeedUploadPreviewRow[]>>();

  for (const row of rows) {
    if (!row.misspelling_normalized || !row.correct_spelling_normalized) {
      continue;
    }

    const tripleKey = buildPairDialectKey(row);
    duplicateGroups.set(tripleKey, [...(duplicateGroups.get(tripleKey) ?? []), row]);

    const skillKey = row.uploaded_micro_skill_key || "[blank]";
    const skillRows = conflictGroups.get(tripleKey) ?? new Map<string, SeedUploadPreviewRow[]>();
    skillRows.set(skillKey, [...(skillRows.get(skillKey) ?? []), row]);
    conflictGroups.set(tripleKey, skillRows);

    if (seenTriples.has(tripleKey)) {
      addBlockingError(
        row,
        "duplicate_normalized_triple_in_file",
        "Only the first row for a normalized misspelling/correction/dialect can be imported in one batch.",
      );
    }
    seenTriples.add(tripleKey);
  }

  for (const [key, groupRows] of duplicateGroups.entries()) {
    if (groupRows.length <= 1) {
      continue;
    }
    groupRows.forEach((row) => {
      row.duplicate_group_key = key;
      addManualWarning(
        row,
        "duplicate_row_in_file",
        `Duplicate normalized pair appears in rows ${groupRows
          .map((groupRow) => groupRow.row_number)
          .join(", ")}.`,
      );
    });
  }

  for (const [key, skillRows] of conflictGroups.entries()) {
    if (skillRows.size <= 1) {
      continue;
    }
    const groupRows = Array.from(skillRows.values()).flat();
    const skillKeys = Array.from(skillRows.keys()).sort();
    groupRows.forEach((row) => {
      row.conflict_group_key = key;
      addManualWarning(
        row,
        "conflicting_suggested_micro_skill_in_file",
        `Same normalized pair/dialect has competing suggested skills: ${skillKeys.join(", ")}.`,
      );
    });
  }

  rows.forEach(applyBucket);

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: (input.now ?? new Date()).toISOString(),
    input_file: input.fileName,
    input_format: "csv",
    normalization_version: NORMALIZATION_VERSION,
    source_file_sha256: sha256Text(input.csvText),
    summary: {
      total_rows: rows.length,
      importable_rows: rows.filter((row) => row.bucket === "pending_candidate_review").length,
      manual_review_rows: rows.filter((row) => row.bucket === "manual_review_required").length,
      rejected_rows: rows.filter((row) => row.bucket === "rejected_from_import").length,
    },
    rows,
    warnings,
  };
}

function rowHash(row: SeedUploadPreviewRow) {
  return sha256Text(
    JSON.stringify({
      row_number: row.row_number,
      source_row_id: row.source_row_id,
      misspelling_normalized: row.misspelling_normalized,
      correct_spelling_normalized: row.correct_spelling_normalized,
      dialect_code: row.dialect_code,
      stored_micro_skill_key: row.stored_micro_skill_key,
      uploaded_micro_skill_key: row.uploaded_micro_skill_key,
    }),
  );
}

function getSourceName(rows: SeedUploadPreviewRow[], explicitSourceName?: string | null) {
  if (explicitSourceName?.trim()) {
    return explicitSourceName.trim();
  }

  const sourceNames = [...new Set(rows.map((row) => row.source.trim()).filter(Boolean))];
  return sourceNames.length === 1 ? sourceNames[0] : "admin_csv_upload";
}

function getSourceDataset(rows: SeedUploadPreviewRow[], explicitSourceDataset?: string | null) {
  if (explicitSourceDataset?.trim()) {
    return explicitSourceDataset.trim();
  }

  const datasets = [
    ...new Set(rows.map((row) => row.source_dataset?.trim()).filter(Boolean)),
  ];
  return datasets.length === 1 ? datasets[0] : null;
}

function getSourceUrl(rows: SeedUploadPreviewRow[]) {
  const urls = [...new Set(rows.map((row) => row.source_url?.trim()).filter(Boolean))];
  return urls.length === 1 ? urls[0] : null;
}

export function buildSeedUploadImportPlan(input: {
  preview: SeedUploadPreview;
  csvText: string;
  sourceLicenseNote: string;
  adminUserId: string;
  adminEmail: string | null;
  now?: Date;
}): SeedUploadImportPlan {
  const now = (input.now ?? new Date()).toISOString();
  const storableRows = input.preview.rows.filter(
    (row) => row.bucket === "pending_candidate_review" || row.bucket === "manual_review_required",
  );

  if (storableRows.length === 0) {
    throw new Error("No candidate or manual-review rows are available to import.");
  }

  const sourceName = getSourceName(storableRows);
  const sourceDataset = getSourceDataset(storableRows);
  const batchName =
    storableRows.find((row) => row.import_batch_name?.trim())?.import_batch_name?.trim() ||
    `${sourceName} seed upload ${now.slice(0, 10)}`;

  const batch = {
    batch_name: batchName,
    source_name: sourceName,
    source_dataset: sourceDataset,
    source_url: getSourceUrl(storableRows),
    source_license_note: input.sourceLicenseNote,
    source_file_name: input.preview.input_file,
    source_file_sha256: input.preview.source_file_sha256,
    input_format: "csv",
    normalization_version: input.preview.normalization_version,
    dry_run_report_schema_version: input.preview.schema_version,
    dry_run_report_path: null,
    dry_run_report_artifact_ref: "admin_same_page_upload",
    dry_run_report_sha256: sha256Text(JSON.stringify(input.preview)),
    dry_run_generated_at: input.preview.generated_at,
    validation_context: {
      slice: "4D.2",
      upload_flow: "admin_same_page_csv_upload",
      max_rows: MAX_SEED_UPLOAD_ROWS,
      imported_row_numbers: storableRows.map((row) => row.row_number),
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
    batch_status: "pending_candidate_review",
    total_row_count: input.preview.summary.total_rows,
    candidate_review_row_count: input.preview.summary.importable_rows,
    manual_review_row_count: input.preview.summary.manual_review_rows,
    rejected_row_count: input.preview.summary.rejected_rows,
    duplicate_row_count: input.preview.rows.filter((row) => row.duplicate_group_key).length,
    conflict_row_count: input.preview.rows.filter((row) => row.conflict_group_key).length,
    created_by_admin_user_id: input.adminUserId,
    created_by_admin_email: input.adminEmail,
    metadata: {
      slice: "4D.2",
      command: "admin_same_page_csv_upload",
      source_file_sha256: input.preview.source_file_sha256,
      dry_run_report_sha256: sha256Text(JSON.stringify(input.preview)),
      generated_at: now,
      skipped_rejected_row_count: input.preview.summary.rejected_rows,
    },
  };

  const rows = storableRows.map((row) => ({
    source_row_number: row.row_number,
    source_row_id: row.source_row_id,
    source_row_hash: rowHash(row),
    raw_misspelling: row.misspelling,
    raw_correction: row.correction,
    misspelling_normalized: row.misspelling_normalized,
    correct_spelling_normalized: row.correct_spelling_normalized,
    dialect_code: row.dialect_code,
    normalization_version: input.preview.normalization_version,
    suggested_micro_skill_key: row.stored_micro_skill_key,
    source_confidence_raw: row.confidence_original,
    source_confidence_normalized: row.confidence_normalized,
    source_note: row.note,
    source_url: row.source_url,
    source_dataset: row.source_dataset,
    age_band: row.age_band,
    pattern_hint: row.pattern_hint,
    route_hint: row.route_hint,
    dry_run_bucket:
      row.bucket === "pending_candidate_review"
        ? "safe_for_candidate_review"
        : "manual_review_required",
    dry_run_report_row_number: row.row_number,
    dry_run_recommended_next_action: row.recommended_next_action,
    row_status: row.bucket,
    status_reason:
      row.bucket === "manual_review_required" ? "Imported from upload for manual review." : null,
    validation_reasons: row.reasons,
    blocking_errors: [],
    manual_review_warnings: row.manual_review_warnings,
    canonical_match_ids: row.canonical_match_ids,
    canonical_conflict_ids: row.canonical_conflict_ids,
    supporting_evidence_ids: {
      parent_local_mapping_ids: [],
      catalog_review_case_ids: [],
      catalog_review_decision_ids: [],
      pcrm_recommendation_ids: [],
    },
    supporting_evidence_counts: {
      parent_local_same_skill: 0,
      parent_local_different_skill: 0,
      open_catalog_review_cases: 0,
      closed_catalog_review_cases: 0,
      catalog_review_decisions: 0,
      pcrm_same_skill: 0,
      pcrm_different_skill: 0,
      pcrm_adopted: 0,
    },
    duplicate_group_key: row.duplicate_group_key,
    conflict_group_key: row.conflict_group_key,
    metadata: {
      slice: "4D.2",
      uploaded_micro_skill_key: row.uploaded_micro_skill_key || null,
      stored_micro_skill_key: row.stored_micro_skill_key,
      micro_skill_validation_status: row.micro_skill_validation_status,
      source_file_sha256: input.preview.source_file_sha256,
    },
  }));

  return {
    batch,
    rows,
    sourceFileSha256: input.preview.source_file_sha256,
  };
}

export function encodeSeedUploadPayload(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeSeedUploadPayload<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

export { MAX_SEED_UPLOAD_ROWS };
