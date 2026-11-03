import { auditCanonicalMorphology } from "./canonical-morphology";
import { FLAT_IMPORT_PART_LIMIT, roundTripEditHash } from "./csv";
import { WORD_METADATA_FIELDS } from "./contracts";
import { overviewSourceHash } from "./overview-source-hash";

export type OverviewFamilySelection = {
  kind: "free_base" | "bound_root";
  familyKey: string;
  revision?: number;
  basePartOfSpeech: string;
  baseLemma?: string;
  baseMeaning?: string;
  rootDefinition?: string;
  rootOriginLanguage?: string;
  rootPronunciationApplicability?: string;
  rootPronunciationIpa?: string;
  reviewIssue?: string;
};

const PART_COLUMNS = Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => {
  const prefix = `part_${index + 1}_`;
  return [`${prefix}kind`, `${prefix}underlying_form`, `${prefix}visible_letters`, `${prefix}meaning`,
    ...(index ? [`${prefix}join_before`] : []), `${prefix}spelling_change_explanation`];
}).flat();

export const OVERVIEW_CSV_COLUMNS = [
  "tdm_export_version", "tdm_edit_hash", "canonical_word_id", "source_row_hash",
  "tdm_source_overview_hash", "tdm_source_family_key", "tdm_source_family_revision",
  "normalised_word", "display_word",
  "affected_micro_skills", "definition", "dictation_sentence", "dictation_target_token_index",
  "written_syllable_breakdown", "age_band", "frequency_band", "complexity_band", ...WORD_METADATA_FIELDS,
  "has_schwa", "raw_morpholex_segmentation", "raw_morpholex_pos", "analysis_status",
  "morphology_review_notes", ...PART_COLUMNS, "base_family_key", "base_part_of_speech",
  "root_family_key", "root_definition", "root_origin_language", "root_pronunciation_applicability",
  "root_pronunciation_ipa", "source_category", "source_name", "source_url", "source_licence",
  "source_use_note", "confidence", "missing_facts",
] as const;

function candidates(part: Record<string, unknown>, names: string[]): string {
  const values = [...new Set(names.map((name) => part[name]).filter((value): value is string =>
    typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))];
  return values.length === 1 ? values[0] : "";
}

function partRole(part: Record<string, unknown>): string {
  const values = ["kind", "role", "type", "partType"].map((name) => part[name])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value === "bound_root" ? "root" : value === "free_base" ? "base" : value);
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : "";
}

function partColumns(parts: unknown, joins: unknown, transformations: unknown,
  family?: OverviewFamilySelection) {
  const fields: Record<string, string> = {};
  const listed = Array.isArray(parts) ? parts : [];
  const boundaries = Array.isArray(joins) ? joins : [];
  const changes = Array.isArray(transformations) ? transformations : [];
  for (const [index, raw] of listed.slice(0, FLAT_IMPORT_PART_LIMIT).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const part = raw as Record<string, unknown>;
    const prefix = `part_${index + 1}_`;
    fields[`${prefix}kind`] = partRole(part);
    fields[`${prefix}underlying_form`] = candidates(part, ["sourceText", "text"]);
    fields[`${prefix}visible_letters`] = candidates(part, ["surfaceText", "text"]);
    const partMeaning = candidates(part, ["gloss", "meaning"]);
    fields[`${prefix}meaning`] = partMeaning || (["base", "root"].includes(fields[`${prefix}kind`])
      && fields[`${prefix}underlying_form`]?.toLowerCase() === family?.baseLemma?.toLowerCase()
      ? family.baseMeaning ?? "" : "");
    if (index) {
      const join = boundaries[index - 1];
      if (join && typeof join === "object" && !Array.isArray(join)) {
        const record = join as Record<string, unknown>;
        if (record.afterPartId === (listed[index - 1] as Record<string, unknown>)?.id
          && record.beforePartId === part.id
          && ["none", "space", "hyphen"].includes(String(record.joinType)))
          fields[`${prefix}join_before`] = String(record.joinType);
      }
    }
    const change = changes.find((item) => item && typeof item === "object" && !Array.isArray(item)
      && (item as Record<string, unknown>).sourcePartId === part.id) as Record<string, unknown> | undefined;
    fields[`${prefix}spelling_change_explanation`] = typeof change?.explanation === "string"
      ? change.explanation : "";
  }
  return fields;
}

/** One human-review row per word. Historical parts are suggestions, never silently approved. */
export function projectOverviewCsvRows(
  exportedRows: Record<string, unknown>[], families: ReadonlyMap<string, OverviewFamilySelection> = new Map(),
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];
  for (const source of exportedRows) {
    const wordId = String(source.canonical_word_id ?? "");
    if (!wordId || seen.has(wordId)) continue;
    seen.add(wordId);
    const parts = source.morphology_parts;
    const joins = source.morphology_joins;
    const audit = auditCanonicalMorphology({ parts, joins,
      displayWord: String(source.display_word ?? ""), linkedToFamily: families.has(wordId) });
    const family = families.get(wordId);
    const familyMeaningConflict = Boolean(family?.baseLemma && family.baseMeaning && Array.isArray(parts)
      && parts.some((raw) => raw && typeof raw === "object" && !Array.isArray(raw)
        && ["base", "root"].includes(partRole(raw as Record<string, unknown>))
        && candidates(raw as Record<string, unknown>, ["sourceText", "text"]).toLowerCase()
          === family.baseLemma!.toLowerCase()
        && candidates(raw as Record<string, unknown>, ["gloss", "meaning"])
          && candidates(raw as Record<string, unknown>, ["gloss", "meaning"]) !== family.baseMeaning));
    const canonical = audit.status === "canonical" && source.analysis_status === "approved"
      && !familyMeaningConflict && Array.isArray(parts) && parts.length <= FLAT_IMPORT_PART_LIMIT;
    const derivedWithoutFamily = !family && Array.isArray(parts) && parts.length > 1
      && parts.some((part) => part && typeof part === "object" && !Array.isArray(part)
        && ["base", "root"].includes(partRole(part as Record<string, unknown>)));
    const row: Record<string, unknown> = {
      ...Object.fromEntries(OVERVIEW_CSV_COLUMNS.map((key) => [key, source[key] ?? ""])),
      tdm_export_version: "2", tdm_source_overview_hash: overviewSourceHash(source),
      tdm_source_family_key: family?.familyKey ?? "",
      tdm_source_family_revision: family?.revision ?? "",
      analysis_status: canonical ? "approved" : "in_review",
      ...partColumns(parts, joins, source.__morphology_transformations, family),
      base_family_key: family?.kind === "free_base" ? family.familyKey : "",
      base_part_of_speech: family?.kind === "free_base" ? family.basePartOfSpeech : "",
      root_family_key: family?.kind === "bound_root" ? family.familyKey : "",
      root_definition: family?.kind === "bound_root" ? family.rootDefinition ?? "" : "",
      root_origin_language: family?.kind === "bound_root" ? family.rootOriginLanguage ?? "" : "",
      root_pronunciation_applicability: family?.kind === "bound_root"
        ? family.rootPronunciationApplicability ?? "" : "",
      root_pronunciation_ipa: family?.kind === "bound_root" ? family.rootPronunciationIpa ?? "" : "",
      missing_facts: [String(source.missing_facts ?? ""),
        family?.reviewIssue ?? "",
        ...(familyMeaningConflict ? ["Family meaning differs from the word part: review in Overview"] : []),
        ...(derivedWithoutFamily ? ["Select or create a base or root family in Overview"] : []),
        ...(!canonical ? [`Review word parts: ${parts instanceof Array && parts.length > FLAT_IMPORT_PART_LIMIT
          ? `more than ${FLAT_IMPORT_PART_LIMIT} parts` : familyMeaningConflict
            ? "family meaning conflict" : audit.status === "canonical"
            ? "analysis is not approved" : audit.reason}`] : []),
      ].filter(Boolean).join("; "),
    };
    result.push(row);
  }
  return result;
}

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+@\-\t\r]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderOverviewCsv(rows: Record<string, unknown>[]): string {
  const lines = rows.map((row) => {
    const cells: Record<string, unknown> = { ...row, tdm_edit_hash: roundTripEditHash(row, OVERVIEW_CSV_COLUMNS) };
    return OVERVIEW_CSV_COLUMNS.map((key) => csvCell(cells[key])).join(",");
  });
  return `\uFEFF${OVERVIEW_CSV_COLUMNS.map(csvCell).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}
