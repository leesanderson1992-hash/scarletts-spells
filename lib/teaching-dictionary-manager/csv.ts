import { emptyMetadata, normaliseWord, type WordDraftPayload } from "./contracts";
import { createHash } from "node:crypto";

function jsonArray(value: string): unknown[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("Invalid morphology JSON array.");
  return parsed;
}

export type CsvDraft = { rowNumber: number; normalisedWord: string; payload: WordDraftPayload; providedColumns: string[]; error?: string;
  canonicalWordId?: string; sourceRowHash?: string; unchanged?: boolean };

export function roundTripEditHash(row: Record<string, unknown>, columns: readonly string[]): string {
  const editable = columns.filter((name) => name !== "missing_facts" && name !== "tdm_edit_hash");
  const values = editable.map((name) => {
    const value = row[name];
    return value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  });
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function combineRoundTripRows(rows: CsvDraft[]): { rows: CsvDraft[]; errors: string[] } {
  const groups = new Map<string, CsvDraft[]>();
  const legacy: CsvDraft[] = [];
  for (const row of rows) {
    if (!row.providedColumns.includes("tdm_export_version")) { legacy.push(row); continue; }
    groups.set(row.normalisedWord, [...(groups.get(row.normalisedWord) ?? []), row]);
  }
  const errors: string[] = [];
  const combined = [...legacy];
  for (const group of groups.values()) {
    if (group.every((row) => row.unchanged)) continue;
    const first = group[0];
    const shared = JSON.stringify({ ...first.payload, routeContents: [] });
    const inconsistent = group.find((row) => row.canonicalWordId !== first.canonicalWordId
      || row.sourceRowHash !== first.sourceRowHash || JSON.stringify({ ...row.payload, routeContents: [] }) !== shared);
    const invalid = group.find((row) => row.error);
    if (invalid || inconsistent) {
      errors.push(`Row ${invalid?.rowNumber ?? inconsistent?.rowNumber}: ${invalid?.error ?? "Shared word facts differ between route rows."}`);
      continue;
    }
    const routes = group.flatMap((row) => row.payload.routeContents);
    if (new Set(routes.map((route) => `${route.routeId}:${route.microSkillKey}`)).size !== routes.length) {
      errors.push(`Row ${first.rowNumber}: Duplicate route for this word.`);
      continue;
    }
    combined.push({ ...first, payload: { ...first.payload, routeContents: routes } });
  }
  return { rows: combined, errors };
}

export const ROUTE_TEXT_FIELDS = ["baseWord", "baseMeaning", "prefixVariant", "suffixVariant", "semanticBaseText",
  "semanticBaseKind", "meaningBinKey", "familyKey", "componentToWholeRelationship", "base", "doublingPattern"] as const;
export const ROUTE_JSON_FIELDS = ["teachingSplitParts", "teachingSplitJoins", "trueMorphologyParts", "trueMorphologyJoins",
  "trueMorphologyProvenance", "morphologyParts", "components", "joins", "morphologyProvenance",
  "degreeWords", "transformations", "lexicalVerification", "pairedSentence", "choiceAudit"] as const;

function routeFacts(raw: Record<string, string>): Record<string, unknown> {
  const facts = raw.route_content_json ? JSON.parse(raw.route_content_json) as unknown : {};
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) throw new Error("Invalid route facts JSON object.");
  const result = { ...facts as Record<string, unknown> };
  for (const field of ROUTE_TEXT_FIELDS) if (field in raw) result[field] = raw[field];
  for (const field of ROUTE_JSON_FIELDS) if (field in raw) {
    if (raw[field]) result[field] = JSON.parse(raw[field]) as unknown;
    else delete result[field];
  }
  if ("sourceRefs" in raw) result.sourceRefs = raw.sourceRefs.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
  return result;
}

function records(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("CSV_QUOTE_UNCLOSED");
  if (field || row.length) { row.push(field); if (row.some((value) => value.trim())) rows.push(row); }
  return rows;
}

export function parseDictionaryCsv(text: string): CsvDraft[] {
  if (text.length > 4_000_000) throw new Error("CSV_TOO_LARGE");
  const [headers, ...values] = records(text);
  if (!headers || values.length > 10000) throw new Error("CSV_ROW_LIMIT");
  const names = headers.map((header) => header.trim());
  if (!names.includes("normalised_word") && !names.includes("targetWord")) throw new Error("CSV_WORD_COLUMN_MISSING");
  if (names.includes("tdm_export_version") && !names.includes("canonical_word_id")) throw new Error("CSV_ID_COLUMN_MISSING");
  return values.map((cells, index) => {
    const raw = Object.fromEntries(names.map((name, column) => [name, cells[column]?.trim() ?? ""]));
    if (raw.tdm_export_version) for (const name of names) {
      if (/^'[=+@\-\t\r]/.test(raw[name])) raw[name] = raw[name].slice(1);
    }
    const normalisedWord = normaliseWord(raw.normalised_word || raw.targetWord);
    const target = raw.dictation_sentence || raw.dictation1_sentence || "";
    const tokens = target.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
    const tokenIndex = tokens.findIndex((token) => normaliseWord(token) === normalisedWord);
    const metadata = emptyMetadata();
    for (const key of Object.keys(metadata) as (keyof typeof metadata)[]) {
      if (key === "has_schwa") metadata.has_schwa = raw.has_schwa === "true" ? true : raw.has_schwa === "false" ? false : null;
      else metadata[key] = raw[key] ?? "";
    }
    let routeError: string | undefined;
    let routeContents: WordDraftPayload["routeContents"] = [];
    try {
      routeContents = raw.routeId && raw.microSkillKey ? [{
        routeId: raw.routeId, routeVersion: raw.routeVersion || "v1", microSkillKey: raw.microSkillKey,
        wordMeaning: raw.wordMeaning || raw.definition || "", wordSum: raw.wordSum || "",
        content: raw.tdm_export_version ? routeFacts(raw) : { ...raw },
      }] : [];
    } catch { routeError = "Invalid route facts JSON."; }
    let morphologyParts: unknown[] = [];
    let featureKeys: unknown[] = [];
    let morphologyJoins: unknown[] = [];
    let morphologyError: string | undefined;
    try {
      morphologyParts = jsonArray(raw.morphology_parts);
      featureKeys = jsonArray(raw.feature_keys);
      morphologyJoins = jsonArray(raw.morphology_joins);
    } catch { morphologyError = "Invalid morphology JSON array."; }
    const payload: WordDraftPayload = {
      displayWord: raw.display_word || raw.targetWord || normalisedWord,
      definition: raw.definition || raw.wordMeaning || "",
      dictationSentence: target, dictationTargetTokenIndex: raw.tdm_export_version && /^\d+$/.test(raw.dictation_target_token_index)
        ? Number(raw.dictation_target_token_index) : Math.max(0, tokenIndex),
      ageBand: raw.age_band || "", frequencyBand: raw.frequency_band || "", complexityBand: raw.complexity_band || "",
      metadata, skillKeys: raw.tdm_export_version ? (raw.affected_micro_skills || "").split(/[;,]/).map((key) => key.trim()).filter(Boolean)
        : raw.microSkillKey ? [raw.microSkillKey] : (raw.affected_micro_skills || "").split(/[;,]/).map((key) => key.trim()).filter(Boolean),
      canonicalMorphology: {
        rawSegmentation: raw.raw_morpholex_segmentation || "", rawPartOfSpeech: raw.raw_morpholex_pos || "",
        parts: morphologyParts, featureKeys, joins: morphologyJoins, transformationNotes: raw.transformation_notes || "",
        wordSum: raw.word_sum || "", analysisStatus: (raw.analysis_status || "in_review") as WordDraftPayload["canonicalMorphology"]["analysisStatus"], reviewNotes: raw.morphology_review_notes || raw.review_notes || "",
      },
      provenance: {
        sourceCategory: (raw.source_category || (raw.lineageJSON ? "ai_assisted_draft" : "internal_authored")) as WordDraftPayload["provenance"]["sourceCategory"],
        sourceName: raw.source_name || raw.sourceFile || "", sourceUrl: raw.source_url || "",
        sourceLicence: raw.source_licence || "", sourceUseNote: raw.source_use_note || raw.teacherEditorialNotes || "",
        confidence: (raw.confidence || "medium") as WordDraftPayload["provenance"]["confidence"],
      },
      routeContents,
    };
    return { rowNumber: index + 2, normalisedWord, payload, providedColumns: names,
      canonicalWordId: raw.tdm_export_version ? raw.canonical_word_id : undefined,
      sourceRowHash: raw.tdm_export_version ? raw.source_row_hash : undefined,
      unchanged: Boolean(raw.tdm_edit_hash && raw.tdm_edit_hash === roundTripEditHash(raw, names)),
      error: !normalisedWord ? "Missing word." : cells.length !== names.length ? "Column count does not match header." : morphologyError || routeError
        || (raw.tdm_export_version && raw.tdm_export_version !== "1" ? "Unsupported export version." : undefined) };
  });
}
