import fs from "fs";
import path from "path";

const SCHEMA_VERSION = "version_2_slice_4a_1";
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
  recommended_next_action: string;
};

export type SeedImportDryRunReport = {
  schema_version: string;
  generated_at: string;
  input_file: string;
  input_format: "csv";
  normalization_version: string;
  dry_run_only: true;
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
};

export type DryRunResult = {
  report: SeedImportDryRunReport;
  jsonPath: string;
  summaryPath: string;
  markdownSummary: string;
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
    row.recommended_next_action = "Review and deduplicate or resolve the file-local conflict.";
    return;
  }

  row.bucket = "safe_for_candidate_review";
  row.recommended_next_action = "Eligible for later candidate-review consideration after DB-backed validation.";
}

export function buildSeedImportDryRunReport(input: {
  csvText: string;
  inputFile: string;
  now?: Date;
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

  const summary = {
    total_rows: rows.length,
    safe_for_candidate_review: rows.filter(
      (row) => row.bucket === "safe_for_candidate_review",
    ).length,
    manual_review_required: rows.filter(
      (row) => row.bucket === "manual_review_required",
    ).length,
    rejected_from_import: rows.filter(
      (row) => row.bucket === "rejected_from_import",
    ).length,
  };

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: (input.now ?? new Date()).toISOString(),
    input_file: input.inputFile,
    input_format: "csv",
    normalization_version: NORMALIZATION_VERSION,
    dry_run_only: true,
    summary,
    rows,
    duplicate_groups: duplicateGroups,
    conflict_groups: conflictGroups,
    source_provenance_summary: Array.from(sourceProvenanceMap.values()).sort(
      (left, right) =>
        left.source.localeCompare(right.source) ||
        (left.source_dataset ?? "").localeCompare(right.source_dataset ?? ""),
    ),
    warnings,
    hard_boundaries: [
      "Slice 4A.1 is file-only validation.",
      "No Supabase connection is created.",
      "No database reads or writes are performed.",
      "Imported rows are not parent verification, child evidence, learning gaps, learning items, assignment items, mastery, rewards, parent-local truth, PCRM evidence, catalog-review cases, canonical truth, or resolver-visible truth.",
    ],
  };
}

export function renderMarkdownSummary(report: SeedImportDryRunReport) {
  const lines = [
    "# Writing Engine Seed Import Dry Run",
    "",
    `Input file: \`${report.input_file}\``,
    `Generated at: \`${report.generated_at}\``,
    `Dry run only: \`${String(report.dry_run_only)}\``,
    "",
    "## Summary",
    "",
    `- Total rows: ${report.summary.total_rows}`,
    `- Safe for candidate review: ${report.summary.safe_for_candidate_review}`,
    `- Manual review required: ${report.summary.manual_review_required}`,
    `- Rejected from import: ${report.summary.rejected_from_import}`,
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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
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
  };
}

export function runSeedImportDryRun(options: DryRunOptions): DryRunResult {
  const inputFile = path.resolve(options.inputFile);
  const csvText = fs.readFileSync(inputFile, "utf8");
  const report = buildSeedImportDryRunReport({
    csvText,
    inputFile,
    now: options.now,
  });
  const outDir = path.resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const jsonPath = path.resolve(
    options.jsonOut ?? path.join(outDir, "seed-import-dry-run-report.json"),
  );
  const summaryPath = path.resolve(
    options.summaryOut ?? path.join(outDir, "seed-import-dry-run-summary.md"),
  );
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

  if (!args.inputFile) {
    throw new Error(
      "Usage: npm run writing-engine:seed-import-dry-run -- path/to/candidates.csv [--out-dir .tmp/out] [--json-out report.json] [--summary-out report.md]",
    );
  }

  const result = runSeedImportDryRun(args);
  console.log(
    JSON.stringify(
      {
        status: "writing-engine-seed-import-dry-run: ok",
        dry_run_only: true,
        json_report: result.jsonPath,
        summary_report: result.summaryPath,
        summary: result.report.summary,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main();
}
