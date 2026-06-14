import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SCHEMA_VERSION = "version_2_slice_4a_4";
const NORMALIZATION_VERSION = "spelling_normalize_v1";
const DEFAULT_DIALECT_CODE = "en-GB";
const DEFAULT_OUT_DIR = ".tmp/writing-engine-seed-import-dry-run";

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

type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
type KnownColumn = RequiredColumn | OptionalColumn;

export type DryRunBucket =
  | "safe_for_candidate_review"
  | "manual_review_required"
  | "rejected_from_import";

type CsvRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

type DatabaseComparisonMode =
  | "none"
  | "fixture"
  | "local_read_only"
  | "hosted_read_only"
  | "unavailable";

type MicroSkillCatalogComparisonRow = {
  micro_skill_key: string;
  mastery_domain_key: string | null;
  is_active: boolean | null;
  is_assignable: boolean | null;
};

type CanonicalMappingComparisonRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  mapping_status: string | null;
  dialect_code: string | null;
  normalization_version: string | null;
};

type ParentLocalMappingComparisonRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: string | null;
  promotion_scope: string | null;
};

type CatalogReviewCaseComparisonRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  case_status: string | null;
};

type CatalogReviewDecisionComparisonRow = {
  id: string;
  case_id: string;
  decision_type: string | null;
  linked_micro_skill_key: string | null;
};

type PcrmRecommendationComparisonRow = {
  id: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  recommendation_status: string | null;
  canonical_mapping_id: string | null;
};

type ComparisonData = {
  microSkills: MicroSkillCatalogComparisonRow[];
  canonicalMappings: CanonicalMappingComparisonRow[];
  parentLocalMappings?: ParentLocalMappingComparisonRow[];
  catalogReviewCases?: CatalogReviewCaseComparisonRow[];
  catalogReviewDecisions?: CatalogReviewDecisionComparisonRow[];
  pcrmRecommendations?: PcrmRecommendationComparisonRow[];
};

export type SeedImportDryRunRow = {
  row_number: number;
  source_row_id: string | null;
  import_batch_name: string | null;
  misspelling: string;
  correction: string;
  misspelling_normalized: string | null;
  correct_spelling_normalized: string | null;
  dialect_code: string;
  suggested_micro_skill_key: string;
  confidence_original: string;
  confidence_normalized: number | null;
  source: string;
  source_dataset: string | null;
  source_url: string | null;
  note: string;
  age_band: string | null;
  pattern_hint: string | null;
  route_hint: string | null;
  bucket: DryRunBucket;
  reasons: string[];
  blocking_errors: string[];
  manual_review_warnings: string[];
  skill_validation_status:
    | "not_checked"
    | "active_assignable_d4"
    | "unknown"
    | "inactive"
    | "non_assignable"
    | "non_d4";
  matching_existing_canonical_mapping_ids: string[];
  conflicting_existing_canonical_mapping_ids: string[];
  supporting_evidence_counts: {
    parent_local_same_skill: number;
    parent_local_different_skill: number;
    open_catalog_review_cases: number;
    closed_catalog_review_cases: number;
    catalog_review_decisions: number;
    pcrm_same_skill: number;
    pcrm_different_skill: number;
    pcrm_adopted: number;
  };
  supporting_evidence_ids: {
    parent_local_mapping_ids: string[];
    catalog_review_case_ids: string[];
    catalog_review_decision_ids: string[];
    pcrm_recommendation_ids: string[];
  };
  recommended_next_action: string;
};

export type SeedImportDryRunReport = {
  schema_version: string;
  generated_at: string;
  input_file: string;
  input_format: "csv";
  normalization_version: string;
  dry_run_only: true;
  database_comparison_mode: DatabaseComparisonMode;
  summary: {
    total_rows: number;
    safe_for_candidate_review: number;
    manual_review_required: number;
    rejected_from_import: number;
  };
  rows: SeedImportDryRunRow[];
  duplicate_groups: Array<{
    key: string;
    row_numbers: number[];
  }>;
  conflict_groups: Array<{
    key: string;
    row_numbers: number[];
    suggested_micro_skill_keys: string[];
  }>;
  skill_validation_summary: {
    not_checked: number;
    active_assignable_d4: number;
    unknown: number;
    inactive: number;
    non_assignable: number;
    non_d4: number;
  };
  canonical_mapping_summary: {
    not_checked: boolean;
    same_pair_same_skill_matches: number;
    same_pair_different_skill_conflicts: number;
    hidden_or_non_visible_matches_counted: number;
  };
  supporting_evidence_summary: {
    not_checked: boolean;
    parent_local_mapping_matches: number;
    catalog_review_case_matches: number;
    catalog_review_decision_matches: number;
    pcrm_recommendation_matches: number;
    unavailable_sources: string[];
  };
  source_provenance_summary: Array<{
    source: string;
    source_dataset: string | null;
    row_count: number;
  }>;
  warnings: string[];
  hard_boundaries: string[];
};

type DryRunOptions = {
  inputFile: string;
  outDir?: string;
  jsonOut?: string;
  summaryOut?: string;
  now?: Date;
  allowLocalReadOnlyDb?: boolean;
  allowHostedReadOnlyDb?: boolean;
  dbUrl?: string;
  supabaseAnonKey?: string;
  help?: boolean;
};

export type DryRunResult = {
  report: SeedImportDryRunReport;
  jsonPath: string;
  summaryPath: string;
  markdownSummary: string;
};

type ReadOnlySupabaseClient = {
  from(table: string): {
    select(columns?: string, options?: { count?: "exact"; head?: boolean }): PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
      count?: number | null;
    }>;
  };
  rpc(name: string, args?: unknown): never;
};

function normalizeHeader(value: string) {
  return value.trim();
}

function normalizeCell(value: string | undefined) {
  return (value ?? "").trim();
}

export function normalizeSpellingLookupText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeDialect(value: string | undefined) {
  const normalized = normalizeCell(value);
  return normalized.length > 0 ? normalized : DEFAULT_DIALECT_CODE;
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

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
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

  const headers = rows[0].map(normalizeHeader);
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );

  if (duplicateHeaders.length > 0) {
    throw new Error(
      `CSV header contains duplicate columns: ${Array.from(new Set(duplicateHeaders)).join(", ")}`,
    );
  }

  const records: CsvRecord[] = rows.slice(1).map((row, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      values[header] = normalizeCell(row[headerIndex]);
    });
    return {
      rowNumber: index + 2,
      values,
    };
  });

  return {
    headers,
    records,
  };
}

function getKnownValue(values: Record<string, string>, key: KnownColumn) {
  return normalizeCell(values[key]);
}

function buildPairDialectKey(row: SeedImportDryRunRow) {
  return [
    row.misspelling_normalized ?? "",
    row.correct_spelling_normalized ?? "",
    row.dialect_code,
  ].join("|");
}

function buildDuplicateKey(row: SeedImportDryRunRow) {
  return [buildPairDialectKey(row), row.suggested_micro_skill_key].join("|");
}

function addManualWarning(
  row: SeedImportDryRunRow,
  reason: string,
  warning: string,
) {
  if (!row.reasons.includes(reason)) {
    row.reasons.push(reason);
  }
  if (!row.manual_review_warnings.includes(warning)) {
    row.manual_review_warnings.push(warning);
  }
}

function applyBucket(row: SeedImportDryRunRow) {
  if (row.blocking_errors.length > 0) {
    row.bucket = "rejected_from_import";
    row.recommended_next_action = "Fix blocking errors before this row can be reconsidered.";
    return;
  }

  if (row.manual_review_warnings.length > 0) {
    row.bucket = "manual_review_required";
    row.recommended_next_action =
      "Review file-local and read-only comparison signals before candidate-review import.";
    return;
  }

  row.bucket = "safe_for_candidate_review";
  row.recommended_next_action = "Eligible for later candidate-review consideration after DB-backed validation.";
}

function addBlockingError(
  row: SeedImportDryRunRow,
  reason: string,
  error: string,
) {
  if (!row.reasons.includes(reason)) {
    row.reasons.push(reason);
  }
  if (!row.blocking_errors.includes(error)) {
    row.blocking_errors.push(error);
  }
}

function isActiveCanonicalMapping(row: CanonicalMappingComparisonRow) {
  return row.mapping_status === "active";
}

function isSameDialect(
  row: CanonicalMappingComparisonRow,
  dialectCode: string,
) {
  return (row.dialect_code ?? DEFAULT_DIALECT_CODE) === dialectCode;
}

function validateMicroSkill(
  row: SeedImportDryRunRow,
  microSkillsByKey: Map<string, MicroSkillCatalogComparisonRow>,
) {
  const skill = microSkillsByKey.get(row.suggested_micro_skill_key);

  if (!row.suggested_micro_skill_key) {
    return;
  }

  if (!skill) {
    row.skill_validation_status = "unknown";
    addBlockingError(
      row,
      "unknown_micro_skill",
      `Suggested micro-skill key ${row.suggested_micro_skill_key} was not found in micro_skill_catalog.`,
    );
    return;
  }

  if (skill.is_active !== true) {
    row.skill_validation_status = "inactive";
    addBlockingError(
      row,
      "inactive_micro_skill",
      `Suggested micro-skill key ${row.suggested_micro_skill_key} is inactive.`,
    );
    return;
  }

  if (skill.is_assignable !== true) {
    row.skill_validation_status = "non_assignable";
    addBlockingError(
      row,
      "non_assignable_micro_skill",
      `Suggested micro-skill key ${row.suggested_micro_skill_key} is not assignable.`,
    );
    return;
  }

  if (skill.mastery_domain_key !== "D4") {
    row.skill_validation_status = "non_d4";
    addBlockingError(
      row,
      "non_d4_micro_skill",
      `Suggested micro-skill key ${row.suggested_micro_skill_key} is not Domain 4.`,
    );
    return;
  }

  row.skill_validation_status = "active_assignable_d4";
}

function compareCanonicalMappings(
  row: SeedImportDryRunRow,
  canonicalMappings: CanonicalMappingComparisonRow[],
) {
  if (!row.misspelling_normalized || !row.correct_spelling_normalized) {
    return {
      hiddenOrNonVisibleCounted: 0,
    };
  }

  let hiddenOrNonVisibleCounted = 0;
  const matchingMappings = canonicalMappings.filter((mapping) => {
    return (
      isActiveCanonicalMapping(mapping) &&
      isSameDialect(mapping, row.dialect_code) &&
      mapping.normalization_version === NORMALIZATION_VERSION &&
      mapping.misspelling_normalized === row.misspelling_normalized &&
      mapping.correct_spelling_normalized === row.correct_spelling_normalized
    );
  });

  for (const mapping of matchingMappings) {
    hiddenOrNonVisibleCounted += 1;
    if (mapping.micro_skill_key === row.suggested_micro_skill_key) {
      row.matching_existing_canonical_mapping_ids.push(mapping.id);
      addManualWarning(
        row,
        "existing_canonical_same_pair_same_skill",
        `Existing active canonical mapping ${mapping.id} already matches this pair and skill.`,
      );
    } else {
      row.conflicting_existing_canonical_mapping_ids.push(mapping.id);
      addBlockingError(
        row,
        "canonical_same_pair_different_skill_conflict",
        `Existing active canonical mapping ${mapping.id} maps this pair to ${mapping.micro_skill_key}.`,
      );
    }
  }

  return {
    hiddenOrNonVisibleCounted,
  };
}

function isSamePair(row: SeedImportDryRunRow, candidate: {
  misspelling_normalized: string;
  correct_spelling_normalized: string;
}) {
  return (
    row.misspelling_normalized !== null &&
    row.correct_spelling_normalized !== null &&
    candidate.misspelling_normalized === row.misspelling_normalized &&
    candidate.correct_spelling_normalized === row.correct_spelling_normalized
  );
}

function compareSupportingEvidence(
  row: SeedImportDryRunRow,
  comparisonData: ComparisonData,
) {
  if (!row.misspelling_normalized || !row.correct_spelling_normalized) {
    return;
  }

  const parentLocalMatches = (comparisonData.parentLocalMappings ?? []).filter(
    (mapping) =>
      isSamePair(row, mapping) &&
      mapping.candidate_status === "parent_local_promoted" &&
      mapping.promotion_scope === "parent_local",
  );
  const catalogCaseMatches = (comparisonData.catalogReviewCases ?? []).filter((reviewCase) =>
    isSamePair(row, reviewCase),
  );
  const decisionsByCaseId = new Map<string, CatalogReviewDecisionComparisonRow[]>();
  for (const decision of comparisonData.catalogReviewDecisions ?? []) {
    decisionsByCaseId.set(decision.case_id, [
      ...(decisionsByCaseId.get(decision.case_id) ?? []),
      decision,
    ]);
  }
  const catalogDecisionMatches = catalogCaseMatches.flatMap(
    (reviewCase) => decisionsByCaseId.get(reviewCase.id) ?? [],
  );
  const pcrmMatches = (comparisonData.pcrmRecommendations ?? []).filter((recommendation) =>
    isSamePair(row, recommendation),
  );

  row.supporting_evidence_counts.parent_local_same_skill = parentLocalMatches.filter(
    (mapping) => mapping.micro_skill_key === row.suggested_micro_skill_key,
  ).length;
  row.supporting_evidence_counts.parent_local_different_skill =
    parentLocalMatches.length - row.supporting_evidence_counts.parent_local_same_skill;
  row.supporting_evidence_counts.open_catalog_review_cases = catalogCaseMatches.filter(
    (reviewCase) => reviewCase.case_status === "open",
  ).length;
  row.supporting_evidence_counts.closed_catalog_review_cases =
    catalogCaseMatches.length - row.supporting_evidence_counts.open_catalog_review_cases;
  row.supporting_evidence_counts.catalog_review_decisions = catalogDecisionMatches.length;
  row.supporting_evidence_counts.pcrm_same_skill = pcrmMatches.filter(
    (recommendation) => recommendation.micro_skill_key === row.suggested_micro_skill_key,
  ).length;
  row.supporting_evidence_counts.pcrm_different_skill =
    pcrmMatches.length - row.supporting_evidence_counts.pcrm_same_skill;
  row.supporting_evidence_counts.pcrm_adopted = pcrmMatches.filter(
    (recommendation) => Boolean(recommendation.canonical_mapping_id),
  ).length;

  row.supporting_evidence_ids.parent_local_mapping_ids = parentLocalMatches.map(
    (mapping) => mapping.id,
  );
  row.supporting_evidence_ids.catalog_review_case_ids = catalogCaseMatches.map(
    (reviewCase) => reviewCase.id,
  );
  row.supporting_evidence_ids.catalog_review_decision_ids = catalogDecisionMatches.map(
    (decision) => decision.id,
  );
  row.supporting_evidence_ids.pcrm_recommendation_ids = pcrmMatches.map(
    (recommendation) => recommendation.id,
  );

  if (parentLocalMatches.length > 0) {
    addManualWarning(
      row,
      "supporting_parent_local_mapping_exists",
      `Parent-local promoted mapping evidence exists for this pair (${parentLocalMatches.length}).`,
    );
  }

  if (catalogCaseMatches.length > 0) {
    addManualWarning(
      row,
      "supporting_catalog_review_case_exists",
      `Catalog-review case evidence exists for this pair (${catalogCaseMatches.length}).`,
    );
  }

  if (pcrmMatches.length > 0) {
    addManualWarning(
      row,
      "supporting_pcrm_recommendation_exists",
      `PCRM recommendation evidence exists for this pair (${pcrmMatches.length}).`,
    );
  }
}

export function applyReadOnlyCatalogCanonicalComparison(
  report: SeedImportDryRunReport,
  comparisonData: ComparisonData & { unavailableSources?: string[] },
  mode: Exclude<DatabaseComparisonMode, "none" | "unavailable"> = "fixture",
) {
  report.database_comparison_mode = mode;
  report.supporting_evidence_summary.unavailable_sources =
    comparisonData.unavailableSources ?? [];

  const microSkillsByKey = new Map(
    comparisonData.microSkills.map((row) => [row.micro_skill_key, row]),
  );
  let hiddenOrNonVisibleCounted = 0;

  for (const row of report.rows) {
    validateMicroSkill(row, microSkillsByKey);
    const canonicalComparison = compareCanonicalMappings(
      row,
      comparisonData.canonicalMappings,
    );
    hiddenOrNonVisibleCounted += canonicalComparison.hiddenOrNonVisibleCounted;
    compareSupportingEvidence(row, comparisonData);
  }

  report.rows.forEach(applyBucket);
  updateReportSummaries(report);
  report.canonical_mapping_summary.hidden_or_non_visible_matches_counted =
    hiddenOrNonVisibleCounted;
}

function updateReportSummaries(report: SeedImportDryRunReport) {
  report.summary = {
    total_rows: report.rows.length,
    safe_for_candidate_review: report.rows.filter(
      (row) => row.bucket === "safe_for_candidate_review",
    ).length,
    manual_review_required: report.rows.filter(
      (row) => row.bucket === "manual_review_required",
    ).length,
    rejected_from_import: report.rows.filter(
      (row) => row.bucket === "rejected_from_import",
    ).length,
  };

  report.skill_validation_summary = {
    not_checked: report.rows.filter((row) => row.skill_validation_status === "not_checked")
      .length,
    active_assignable_d4: report.rows.filter(
      (row) => row.skill_validation_status === "active_assignable_d4",
    ).length,
    unknown: report.rows.filter((row) => row.skill_validation_status === "unknown").length,
    inactive: report.rows.filter((row) => row.skill_validation_status === "inactive").length,
    non_assignable: report.rows.filter(
      (row) => row.skill_validation_status === "non_assignable",
    ).length,
    non_d4: report.rows.filter((row) => row.skill_validation_status === "non_d4").length,
  };

  report.canonical_mapping_summary = {
    not_checked: report.database_comparison_mode === "none",
    same_pair_same_skill_matches: report.rows.reduce(
      (sum, row) => sum + row.matching_existing_canonical_mapping_ids.length,
      0,
    ),
    same_pair_different_skill_conflicts: report.rows.reduce(
      (sum, row) => sum + row.conflicting_existing_canonical_mapping_ids.length,
      0,
    ),
    hidden_or_non_visible_matches_counted:
      report.canonical_mapping_summary.hidden_or_non_visible_matches_counted,
  };

  report.supporting_evidence_summary = {
    not_checked: report.database_comparison_mode === "none",
    parent_local_mapping_matches: report.rows.reduce(
      (sum, row) =>
        sum +
        row.supporting_evidence_counts.parent_local_same_skill +
        row.supporting_evidence_counts.parent_local_different_skill,
      0,
    ),
    catalog_review_case_matches: report.rows.reduce(
      (sum, row) =>
        sum +
        row.supporting_evidence_counts.open_catalog_review_cases +
        row.supporting_evidence_counts.closed_catalog_review_cases,
      0,
    ),
    catalog_review_decision_matches: report.rows.reduce(
      (sum, row) => sum + row.supporting_evidence_counts.catalog_review_decisions,
      0,
    ),
    pcrm_recommendation_matches: report.rows.reduce(
      (sum, row) =>
        sum +
        row.supporting_evidence_counts.pcrm_same_skill +
        row.supporting_evidence_counts.pcrm_different_skill,
      0,
    ),
    unavailable_sources: report.supporting_evidence_summary.unavailable_sources,
  };
}

export function buildSeedImportDryRunReport(input: {
  csvText: string;
  inputFile: string;
  now?: Date;
  comparisonData?: ComparisonData & { unavailableSources?: string[] };
}): SeedImportDryRunReport {
  const warnings: string[] = [];
  const { headers, records } = buildCsvRecords(input.csvText);
  const missingRequiredColumns = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  const unknownColumns = headers.filter((header) => !KNOWN_COLUMNS.has(header));

  if (unknownColumns.length > 0) {
    warnings.push(`Unknown columns ignored: ${unknownColumns.join(", ")}`);
  }

  const rows: SeedImportDryRunRow[] = records.map((record) => {
    const values = record.values;
    const misspelling = getKnownValue(values, "misspelling");
    const correction = getKnownValue(values, "correction");
    const source = getKnownValue(values, "source");
    const note = getKnownValue(values, "note");
    const suggestedMicroSkillKey = getKnownValue(values, "suggested_micro_skill_key");
    const confidenceOriginal = getKnownValue(values, "confidence");
    const confidenceNormalized = normalizeConfidence(confidenceOriginal);
    const misspellingNormalized = normalizeSpellingLookupText(misspelling);
    const correctSpellingNormalized = normalizeSpellingLookupText(correction);
    const dialectCode = normalizeDialect(values.dialect);
    const blockingErrors: string[] = [];
    const reasons: string[] = [];

    for (const column of missingRequiredColumns) {
      blockingErrors.push(`Missing required column: ${column}`);
      reasons.push("missing_required_column");
    }

    if (!misspellingNormalized) {
      blockingErrors.push("Misspelling is empty after normalization.");
      reasons.push("empty_misspelling");
    }

    if (!correctSpellingNormalized) {
      blockingErrors.push("Correction is empty after normalization.");
      reasons.push("empty_correction");
    }

    if (
      misspellingNormalized &&
      correctSpellingNormalized &&
      misspellingNormalized === correctSpellingNormalized
    ) {
      blockingErrors.push("Misspelling and correction normalize to the same value.");
      reasons.push("same_normalized_pair");
    }

    if (!suggestedMicroSkillKey) {
      blockingErrors.push("Suggested micro-skill key is required.");
      reasons.push("missing_suggested_micro_skill_key");
    }

    if (confidenceNormalized === null) {
      blockingErrors.push("Confidence must be 0..1, 0..100, or low/medium/high.");
      reasons.push("invalid_confidence");
    }

    if (!source) {
      blockingErrors.push("Source is required.");
      reasons.push("missing_source");
    }

    if (!note) {
      blockingErrors.push("Note/provenance is required.");
      reasons.push("missing_note_provenance");
    }

    return {
      row_number: record.rowNumber,
      source_row_id: getKnownValue(values, "source_row_id") || null,
      import_batch_name: getKnownValue(values, "import_batch_name") || null,
      misspelling,
      correction,
      misspelling_normalized: misspellingNormalized,
      correct_spelling_normalized: correctSpellingNormalized,
      dialect_code: dialectCode,
      suggested_micro_skill_key: suggestedMicroSkillKey,
      confidence_original: confidenceOriginal,
      confidence_normalized: confidenceNormalized,
      source,
      source_dataset: getKnownValue(values, "source_dataset") || null,
      source_url: getKnownValue(values, "source_url") || null,
      note,
      age_band: getKnownValue(values, "age_band") || null,
      pattern_hint: getKnownValue(values, "pattern_hint") || null,
      route_hint: getKnownValue(values, "route_hint") || null,
      bucket: "safe_for_candidate_review",
      reasons,
      blocking_errors: blockingErrors,
      manual_review_warnings: [],
      skill_validation_status: "not_checked",
      matching_existing_canonical_mapping_ids: [],
      conflicting_existing_canonical_mapping_ids: [],
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
      supporting_evidence_ids: {
        parent_local_mapping_ids: [],
        catalog_review_case_ids: [],
        catalog_review_decision_ids: [],
        pcrm_recommendation_ids: [],
      },
      recommended_next_action: "",
    };
  });

  const duplicateMap = new Map<string, SeedImportDryRunRow[]>();
  const conflictMap = new Map<string, Map<string, SeedImportDryRunRow[]>>();

  for (const row of rows) {
    if (
      !row.misspelling_normalized ||
      !row.correct_spelling_normalized ||
      !row.suggested_micro_skill_key
    ) {
      continue;
    }

    const duplicateKey = buildDuplicateKey(row);
    duplicateMap.set(duplicateKey, [...(duplicateMap.get(duplicateKey) ?? []), row]);

    const conflictKey = buildPairDialectKey(row);
    const skillRows = conflictMap.get(conflictKey) ?? new Map<string, SeedImportDryRunRow[]>();
    skillRows.set(row.suggested_micro_skill_key, [
      ...(skillRows.get(row.suggested_micro_skill_key) ?? []),
      row,
    ]);
    conflictMap.set(conflictKey, skillRows);
  }

  const duplicateGroups = Array.from(duplicateMap.entries())
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([key, groupRows]) => ({
      key,
      row_numbers: groupRows.map((row) => row.row_number),
    }));

  for (const group of duplicateGroups) {
    for (const rowNumber of group.row_numbers) {
      const row = rows.find((candidate) => candidate.row_number === rowNumber);
      if (row) {
        addManualWarning(
          row,
          "duplicate_row_in_file",
          `Duplicate normalized pair/skill appears in rows ${group.row_numbers.join(", ")}.`,
        );
      }
    }
  }

  const conflictGroups = Array.from(conflictMap.entries())
    .filter(([, skillRows]) => skillRows.size > 1)
    .map(([key, skillRows]) => {
      const groupRows = Array.from(skillRows.values()).flat();
      return {
        key,
        row_numbers: groupRows.map((row) => row.row_number).sort((a, b) => a - b),
        suggested_micro_skill_keys: Array.from(skillRows.keys()).sort(),
      };
    });

  for (const group of conflictGroups) {
    for (const rowNumber of group.row_numbers) {
      const row = rows.find((candidate) => candidate.row_number === rowNumber);
      if (row) {
        addManualWarning(
          row,
          "conflicting_suggested_micro_skill_in_file",
          `Same normalized pair/dialect has competing suggested skills: ${group.suggested_micro_skill_keys.join(", ")}.`,
        );
      }
    }
  }

  rows.forEach(applyBucket);

  const sourceProvenanceMap = new Map<string, { source: string; source_dataset: string | null; row_count: number }>();

  for (const row of rows) {
    const sourceKey = `${row.source || "[missing]"}|${row.source_dataset ?? ""}`;
    const existing = sourceProvenanceMap.get(sourceKey);
    if (existing) {
      existing.row_count += 1;
    } else {
      sourceProvenanceMap.set(sourceKey, {
        source: row.source || "[missing]",
        source_dataset: row.source_dataset,
        row_count: 1,
      });
    }
  }

  const report: SeedImportDryRunReport = {
    schema_version: SCHEMA_VERSION,
    generated_at: (input.now ?? new Date()).toISOString(),
    input_file: input.inputFile,
    input_format: "csv",
    normalization_version: NORMALIZATION_VERSION,
    dry_run_only: true,
    database_comparison_mode: "none",
    summary: {
      total_rows: 0,
      safe_for_candidate_review: 0,
      manual_review_required: 0,
      rejected_from_import: 0,
    },
    rows,
    duplicate_groups: duplicateGroups,
    conflict_groups: conflictGroups,
    skill_validation_summary: {
      not_checked: 0,
      active_assignable_d4: 0,
      unknown: 0,
      inactive: 0,
      non_assignable: 0,
      non_d4: 0,
    },
    canonical_mapping_summary: {
      not_checked: true,
      same_pair_same_skill_matches: 0,
      same_pair_different_skill_conflicts: 0,
      hidden_or_non_visible_matches_counted: 0,
    },
    supporting_evidence_summary: {
      not_checked: true,
      parent_local_mapping_matches: 0,
      catalog_review_case_matches: 0,
      catalog_review_decision_matches: 0,
      pcrm_recommendation_matches: 0,
      unavailable_sources: [],
    },
    source_provenance_summary: Array.from(sourceProvenanceMap.values()).sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        (left.source_dataset ?? "").localeCompare(right.source_dataset ?? ""),
    ),
    warnings,
    hard_boundaries: [
      "Slice 4A dry-run remains the only mode.",
      "Supabase comparison is optional and read-only.",
      "No database writes are performed.",
      "Imported rows are not parent verification, child evidence, learning gaps, learning items, assignment items, mastery, rewards, parent-local truth, PCRM evidence, catalog-review cases, canonical truth, or resolver-visible truth.",
    ],
  };

  updateReportSummaries(report);

  if (input.comparisonData) {
    applyReadOnlyCatalogCanonicalComparison(report, input.comparisonData);
  }

  return report;
}

export function renderMarkdownSummary(report: SeedImportDryRunReport) {
  const lines = [
    "# Writing Engine Seed Import Dry Run",
    "",
    `Input file: \`${report.input_file}\``,
    `Generated at: \`${report.generated_at}\``,
    `Dry run only: \`${String(report.dry_run_only)}\``,
    `Database comparison mode: \`${report.database_comparison_mode}\``,
    "",
    "## Summary",
    "",
    `- Total rows: ${report.summary.total_rows}`,
    `- Safe for candidate review: ${report.summary.safe_for_candidate_review}`,
    `- Manual review required: ${report.summary.manual_review_required}`,
    `- Rejected from import: ${report.summary.rejected_from_import}`,
    "",
    "## Skill Validation",
    "",
    `- Not checked: ${report.skill_validation_summary.not_checked}`,
    `- Active assignable D4: ${report.skill_validation_summary.active_assignable_d4}`,
    `- Unknown: ${report.skill_validation_summary.unknown}`,
    `- Inactive: ${report.skill_validation_summary.inactive}`,
    `- Non-assignable: ${report.skill_validation_summary.non_assignable}`,
    `- Non-D4: ${report.skill_validation_summary.non_d4}`,
    "",
    "## Canonical Mapping Comparison",
    "",
    `- Not checked: ${String(report.canonical_mapping_summary.not_checked)}`,
    `- Same-pair/same-skill matches: ${report.canonical_mapping_summary.same_pair_same_skill_matches}`,
    `- Same-pair/different-skill conflicts: ${report.canonical_mapping_summary.same_pair_different_skill_conflicts}`,
    `- Hidden or non-visible mappings counted: ${report.canonical_mapping_summary.hidden_or_non_visible_matches_counted}`,
    "",
    "## Supporting Evidence Comparison",
    "",
    `- Not checked: ${String(report.supporting_evidence_summary.not_checked)}`,
    `- Parent-local mapping matches: ${report.supporting_evidence_summary.parent_local_mapping_matches}`,
    `- Catalog-review case matches: ${report.supporting_evidence_summary.catalog_review_case_matches}`,
    `- Catalog-review decision matches: ${report.supporting_evidence_summary.catalog_review_decision_matches}`,
    `- PCRM recommendation matches: ${report.supporting_evidence_summary.pcrm_recommendation_matches}`,
    `- Unavailable sources: ${
      report.supporting_evidence_summary.unavailable_sources.length > 0
        ? report.supporting_evidence_summary.unavailable_sources.join(", ")
        : "none"
    }`,
    "",
    "## Duplicate Groups",
    "",
  ];

  if (report.duplicate_groups.length === 0) {
    lines.push("- None");
  } else {
    for (const group of report.duplicate_groups) {
      lines.push(`- ${group.key}: rows ${group.row_numbers.join(", ")}`);
    }
  }

  lines.push("", "## Conflict Groups", "");

  if (report.conflict_groups.length === 0) {
    lines.push("- None");
  } else {
    for (const group of report.conflict_groups) {
      lines.push(
        `- ${group.key}: rows ${group.row_numbers.join(", ")}; skills ${group.suggested_micro_skill_keys.join(", ")}`,
      );
    }
  }

  lines.push("", "## Rejected Rows", "");

  const rejectedRows = report.rows.filter((row) => row.bucket === "rejected_from_import");
  if (rejectedRows.length === 0) {
    lines.push("- None");
  } else {
    for (const row of rejectedRows) {
      lines.push(
        `- Row ${row.row_number}: ${row.blocking_errors.join("; ")}`,
      );
    }
  }

  lines.push("", "## Manual Review Rows", "");

  const manualRows = report.rows.filter((row) => row.bucket === "manual_review_required");
  if (manualRows.length === 0) {
    lines.push("- None");
  } else {
    for (const row of manualRows) {
      lines.push(
        `- Row ${row.row_number}: ${row.manual_review_warnings.join("; ")}`,
      );
    }
  }

  lines.push("", "## Hard Boundaries", "");
  for (const boundary of report.hard_boundaries) {
    lines.push(`- ${boundary}`);
  }

  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  const knownOptions = new Set([
    "help",
    "out-dir",
    "json-out",
    "summary-out",
    "allow-local-read-only-db",
    "allow-hosted-read-only-db",
    "db-url",
    "supabase-url",
    "supabase-anon-key",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") {
      options.help = "true";
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!knownOptions.has(key)) {
        throw new Error(`Unknown option --${key}.\n\n${getSeedImportDryRunHelp()}`);
      }
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = "true";
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    inputFile: positional[0],
    outDir: options["out-dir"],
    jsonOut: options["json-out"],
    summaryOut: options["summary-out"],
    allowLocalReadOnlyDb: options["allow-local-read-only-db"] === "true",
    allowHostedReadOnlyDb: options["allow-hosted-read-only-db"] === "true",
    dbUrl: options["db-url"] ?? options["supabase-url"],
    supabaseAnonKey: options["supabase-anon-key"],
    help: options.help === "true",
  };
}

export function getSeedImportDryRunHelp() {
  return [
    "Writing Engine seed import dry-run planner",
    "",
    "Usage:",
    "  npm run writing-engine:seed-import-dry-run -- path/to/candidates.csv [options]",
    "",
    "Required CSV columns:",
    "  misspelling, correction, suggested_micro_skill_key, confidence, source, note",
    "",
    "Common options:",
    `  --out-dir ${DEFAULT_OUT_DIR}`,
    "  --json-out path/to/seed-import-dry-run-report.json",
    "  --summary-out path/to/seed-import-dry-run-summary.md",
    "  --allow-local-read-only-db --db-url http://127.0.0.1:54321",
    "  --allow-hosted-read-only-db --supabase-url https://... --supabase-anon-key ...",
    "",
    "Safety:",
    "  This command is dry-run/report-only. It never imports rows.",
    "  Default reports are written under .tmp/ and should not be committed.",
    "  DB comparison is optional, explicitly flagged, anon-key only, and guarded against mutation.",
    "",
    "Synthetic sample:",
    "  scripts/fixtures/writing-engine-seed-import-sample.csv",
  ].join("\n");
}

function isLocalSupabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function readSupabaseConfig(options: DryRunOptions) {
  const url =
    options.dbUrl ??
    process.env.SEED_IMPORT_DRY_RUN_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    options.supabaseAnonKey ??
    process.env.SEED_IMPORT_DRY_RUN_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function wrapReadOnlySupabaseClient<T extends { from: (table: string) => unknown }>(
  client: T,
) {
  const mutatingMethods = new Set(["insert", "update", "upsert", "delete", "rpc"]);

  return new Proxy(client as T & { rpc?: (name: string, args?: unknown) => never }, {
    get(target, property, receiver) {
      if (property === "rpc") {
        return () => {
          throw new Error("Slice 4A dry-run read-only client refuses rpc().");
        };
      }

      if (property === "from") {
        return (table: string) => {
          const builder = target.from(table);
          return new Proxy(builder as object, {
            get(builderTarget, builderProperty, builderReceiver) {
              if (
                typeof builderProperty === "string" &&
                mutatingMethods.has(builderProperty)
              ) {
                return () => {
                  throw new Error(
                    `Slice 4A dry-run read-only client refuses ${builderProperty}().`,
                  );
                };
              }
              return Reflect.get(builderTarget, builderProperty, builderReceiver);
            },
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

async function fetchTableCount(client: ReadOnlySupabaseClient, table: string) {
  const result = await client
    .from(table)
    .select("id", { count: "exact", head: true });

  if (result.error) {
    throw new Error(
      `Could not count ${table}: ${result.error.message ?? "unknown read error"}`,
    );
  }

  return result.count ?? 0;
}

async function fetchProtectedCounts(client: ReadOnlySupabaseClient) {
  const tables = [
    "micro_skill_catalog",
    "spelling_canonical_mappings",
    "parent_verified_spelling_candidate_mappings",
    "spelling_catalog_review_cases",
    "spelling_catalog_review_case_decisions",
    "spelling_canonical_mapping_recommendations",
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      counts[table] = await fetchTableCount(client, table);
    } catch (error) {
      if (table === "micro_skill_catalog" || table === "spelling_canonical_mappings") {
        throw error;
      }
    }
  }

  return counts;
}

function assertProtectedCountsUnchanged(
  beforeCounts: Record<string, number>,
  afterCounts: Record<string, number>,
) {
  for (const [table, beforeCount] of Object.entries(beforeCounts)) {
    if (afterCounts[table] !== beforeCount) {
      throw new Error(
        `Protected table count changed for ${table}: before ${beforeCount}, after ${afterCounts[table]}.`,
      );
    }
  }
}

function normaliseMicroSkillRows(data: unknown): MicroSkillCatalogComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      micro_skill_key: String(row.micro_skill_key ?? ""),
      mastery_domain_key:
        typeof row.mastery_domain_key === "string" ? row.mastery_domain_key : null,
      is_active: typeof row.is_active === "boolean" ? row.is_active : null,
      is_assignable:
        typeof row.is_assignable === "boolean" ? row.is_assignable : null,
    }))
    .filter((row) => row.micro_skill_key.length > 0);
}

function normaliseCanonicalMappingRows(data: unknown): CanonicalMappingComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      misspelling_normalized: String(row.misspelling_normalized ?? ""),
      correct_spelling_normalized: String(row.correct_spelling_normalized ?? ""),
      micro_skill_key: String(row.micro_skill_key ?? ""),
      mapping_status: typeof row.mapping_status === "string" ? row.mapping_status : null,
      dialect_code: typeof row.dialect_code === "string" ? row.dialect_code : null,
      normalization_version:
        typeof row.normalization_version === "string"
          ? row.normalization_version
          : null,
    }))
    .filter((row) => row.id.length > 0);
}

function normaliseParentLocalMappingRows(data: unknown): ParentLocalMappingComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      misspelling_normalized: String(row.misspelling_normalized ?? ""),
      correct_spelling_normalized: String(row.correct_spelling_normalized ?? ""),
      micro_skill_key: String(row.micro_skill_key ?? ""),
      candidate_status:
        typeof row.candidate_status === "string" ? row.candidate_status : null,
      promotion_scope:
        typeof row.promotion_scope === "string" ? row.promotion_scope : null,
    }))
    .filter((row) => row.id.length > 0);
}

function normaliseCatalogReviewCaseRows(data: unknown): CatalogReviewCaseComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      misspelling_normalized: String(row.misspelling_normalized ?? ""),
      correct_spelling_normalized: String(row.correct_spelling_normalized ?? ""),
      case_status: typeof row.case_status === "string" ? row.case_status : null,
    }))
    .filter((row) => row.id.length > 0);
}

function normaliseCatalogReviewDecisionRows(
  data: unknown,
): CatalogReviewDecisionComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      case_id: String(row.case_id ?? ""),
      decision_type: typeof row.decision_type === "string" ? row.decision_type : null,
      linked_micro_skill_key:
        typeof row.linked_micro_skill_key === "string"
          ? row.linked_micro_skill_key
          : null,
    }))
    .filter((row) => row.id.length > 0 && row.case_id.length > 0);
}

function normalisePcrmRecommendationRows(data: unknown): PcrmRecommendationComparisonRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: String(row.id ?? ""),
      misspelling_normalized: String(row.misspelling_normalized ?? ""),
      correct_spelling_normalized: String(row.correct_spelling_normalized ?? ""),
      micro_skill_key: String(row.micro_skill_key ?? ""),
      recommendation_status:
        typeof row.recommendation_status === "string"
          ? row.recommendation_status
          : null,
      canonical_mapping_id:
        typeof row.canonical_mapping_id === "string" ? row.canonical_mapping_id : null,
    }))
    .filter((row) => row.id.length > 0);
}

async function fetchOptionalComparisonRows<T>(
  client: ReadOnlySupabaseClient,
  table: string,
  columns: string,
  normalize: (data: unknown) => T[],
  warnings: string[],
  unavailableSources: string[],
) {
  const result = await client.from(table).select(columns);

  if (result.error) {
    unavailableSources.push(table);
    warnings.push(
      `Optional supporting evidence source ${table} unavailable: ${
        result.error.message ?? "unknown read error"
      }`,
    );
    return [];
  }

  return normalize(result.data);
}

async function fetchComparisonData(
  client: ReadOnlySupabaseClient,
  warnings: string[],
): Promise<ComparisonData & { unavailableSources: string[] }> {
  const unavailableSources: string[] = [];
  const [microSkillsResult, canonicalMappingsResult] = await Promise.all([
    client
      .from("micro_skill_catalog")
      .select("micro_skill_key, mastery_domain_key, is_active, is_assignable"),
    client
      .from("spelling_canonical_mappings")
      .select(
        "id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, mapping_status, dialect_code, normalization_version",
      ),
  ]);

  if (microSkillsResult.error) {
    throw new Error(
      `Could not read micro_skill_catalog: ${microSkillsResult.error.message ?? "unknown read error"}`,
    );
  }

  if (canonicalMappingsResult.error) {
    throw new Error(
      `Could not read spelling_canonical_mappings: ${canonicalMappingsResult.error.message ?? "unknown read error"}`,
    );
  }

  return {
    microSkills: normaliseMicroSkillRows(microSkillsResult.data),
    canonicalMappings: normaliseCanonicalMappingRows(canonicalMappingsResult.data),
    parentLocalMappings: await fetchOptionalComparisonRows(
      client,
      "parent_verified_spelling_candidate_mappings",
      "id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, candidate_status, promotion_scope",
      normaliseParentLocalMappingRows,
      warnings,
      unavailableSources,
    ),
    catalogReviewCases: await fetchOptionalComparisonRows(
      client,
      "spelling_catalog_review_cases",
      "id, misspelling_normalized, correct_spelling_normalized, case_status",
      normaliseCatalogReviewCaseRows,
      warnings,
      unavailableSources,
    ),
    catalogReviewDecisions: await fetchOptionalComparisonRows(
      client,
      "spelling_catalog_review_case_decisions",
      "id, case_id, decision_type, linked_micro_skill_key",
      normaliseCatalogReviewDecisionRows,
      warnings,
      unavailableSources,
    ),
    pcrmRecommendations: await fetchOptionalComparisonRows(
      client,
      "spelling_canonical_mapping_recommendations",
      "id, misspelling_normalized, correct_spelling_normalized, micro_skill_key, recommendation_status, canonical_mapping_id",
      normalisePcrmRecommendationRows,
      warnings,
      unavailableSources,
    ),
    unavailableSources,
  };
}

async function maybeLoadReadOnlyComparisonData(
  options: DryRunOptions,
  warnings: string[],
): Promise<{ mode: DatabaseComparisonMode; data: ComparisonData | null }> {
  if (!options.allowLocalReadOnlyDb && !options.allowHostedReadOnlyDb) {
    return { mode: "none", data: null };
  }

  const config = readSupabaseConfig(options);
  if (!config) {
    warnings.push(
      "Read-only DB comparison requested, but Supabase URL/key were not provided.",
    );
    return { mode: "unavailable", data: null };
  }

  const isLocal = isLocalSupabaseUrl(config.url);

  if (isLocal && !options.allowLocalReadOnlyDb) {
    warnings.push("Local read-only DB comparison was not explicitly allowed.");
    return { mode: "unavailable", data: null };
  }

  if (!isLocal && !options.allowHostedReadOnlyDb) {
    warnings.push("Hosted read-only DB comparison requires --allow-hosted-read-only-db.");
    return { mode: "unavailable", data: null };
  }

  const mode: DatabaseComparisonMode = isLocal ? "local_read_only" : "hosted_read_only";
  const baseClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const client = wrapReadOnlySupabaseClient(baseClient) as unknown as ReadOnlySupabaseClient;

  try {
    const beforeCounts = await fetchProtectedCounts(client);
    const data = await fetchComparisonData(client, warnings);
    const afterCounts = await fetchProtectedCounts(client);
    assertProtectedCountsUnchanged(beforeCounts, afterCounts);
    return { mode, data };
  } catch (error) {
    warnings.push(
      `Read-only DB comparison unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { mode: "unavailable", data: null };
  }
}

function validateInputFile(inputFile: string) {
  if (path.extname(inputFile).toLowerCase() !== ".csv") {
    throw new Error(
      `CSV input required for Slice 4A.4 dry-run planner. Received: ${inputFile}`,
    );
  }

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input CSV file not found: ${inputFile}`);
  }

  if (!fs.statSync(inputFile).isFile()) {
    throw new Error(`Input path must be a CSV file, not a directory: ${inputFile}`);
  }
}

function validateOutputPaths(jsonPath: string, summaryPath: string) {
  if (jsonPath === summaryPath) {
    throw new Error("JSON report path and summary report path must be different.");
  }
}

export async function runSeedImportDryRun(options: DryRunOptions): Promise<DryRunResult> {
  const inputFile = path.resolve(options.inputFile);
  validateInputFile(inputFile);
  const csvText = fs.readFileSync(inputFile, "utf8");
  const report = buildSeedImportDryRunReport({
    csvText,
    inputFile,
    now: options.now,
  });
  const comparison = await maybeLoadReadOnlyComparisonData(options, report.warnings);
  report.database_comparison_mode = comparison.mode;
  if (comparison.data) {
    applyReadOnlyCatalogCanonicalComparison(report, comparison.data, comparison.mode as Exclude<DatabaseComparisonMode, "none" | "unavailable">);
  }
  const outDir = path.resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const jsonPath = path.resolve(
    options.jsonOut ?? path.join(outDir, "seed-import-dry-run-report.json"),
  );
  const summaryPath = path.resolve(
    options.summaryOut ?? path.join(outDir, "seed-import-dry-run-summary.md"),
  );
  validateOutputPaths(jsonPath, summaryPath);
  const markdownSummary = renderMarkdownSummary(report);

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(summaryPath, markdownSummary);

  return {
    report,
    jsonPath,
    summaryPath,
    markdownSummary,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(getSeedImportDryRunHelp());
    return;
  }

  if (!args.inputFile) {
    throw new Error(`Missing input CSV file.\n\n${getSeedImportDryRunHelp()}`);
  }

  runSeedImportDryRun(args)
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            status: "writing-engine-seed-import-dry-run: ok",
            dry_run_only: true,
            database_comparison_mode: result.report.database_comparison_mode,
            json_report: result.jsonPath,
            summary_report: result.summaryPath,
            summary: result.report.summary,
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}
