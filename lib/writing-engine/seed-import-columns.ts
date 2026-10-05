export const SEED_IMPORT_REQUIRED_COLUMNS = [
  "misspelling",
  "correction",
  "suggested_micro_skill_key",
  "confidence",
  "source",
  "note",
] as const;

export const SEED_IMPORT_OPTIONAL_COLUMNS = [
  "dialect",
  "age_band",
  "source_url",
  "source_dataset",
  "pattern_hint",
  "route_hint",
  "source_row_id",
  "import_batch_name",
] as const;

export const SEED_IMPORT_TEMPLATE_HEADER = [
  ...SEED_IMPORT_REQUIRED_COLUMNS,
  ...SEED_IMPORT_OPTIONAL_COLUMNS,
].join(",");
