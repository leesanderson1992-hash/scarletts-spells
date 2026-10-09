import { emptyMetadata, normaliseWord, type WordDraftPayload } from "./contracts";

function jsonArray(value: string): unknown[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("Invalid morphology JSON array.");
  return parsed;
}

export type CsvDraft = { rowNumber: number; normalisedWord: string; payload: WordDraftPayload; providedColumns: string[]; error?: string };

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
  if (text.length > 2_000_000) throw new Error("CSV_TOO_LARGE");
  const [headers, ...values] = records(text);
  if (!headers || values.length > 1000) throw new Error("CSV_ROW_LIMIT");
  const names = headers.map((header) => header.trim());
  if (!names.includes("normalised_word") && !names.includes("targetWord")) throw new Error("CSV_WORD_COLUMN_MISSING");
  return values.map((cells, index) => {
    const raw = Object.fromEntries(names.map((name, column) => [name, cells[column]?.trim() ?? ""]));
    const normalisedWord = normaliseWord(raw.normalised_word || raw.targetWord);
    const target = raw.dictation_sentence || raw.dictation1_sentence || "";
    const tokens = target.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
    const tokenIndex = tokens.findIndex((token) => normaliseWord(token) === normalisedWord);
    const metadata = emptyMetadata();
    for (const key of Object.keys(metadata) as (keyof typeof metadata)[]) {
      if (key === "has_schwa") metadata.has_schwa = raw.has_schwa === "true" ? true : raw.has_schwa === "false" ? false : null;
      else metadata[key] = raw[key] ?? "";
    }
    const routeContents = raw.routeId && raw.microSkillKey ? [{
      routeId: raw.routeId, routeVersion: raw.routeVersion || "v1", microSkillKey: raw.microSkillKey,
      wordMeaning: raw.wordMeaning || raw.definition || "", wordSum: raw.wordSum || "", content: { ...raw },
    }] : [];
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
      dictationSentence: target, dictationTargetTokenIndex: Math.max(0, tokenIndex),
      ageBand: raw.age_band || "", frequencyBand: raw.frequency_band || "", complexityBand: raw.complexity_band || "",
      metadata, skillKeys: raw.microSkillKey ? [raw.microSkillKey] : (raw.affected_micro_skills || "").split(/[;,]/).map((key) => key.trim()).filter(Boolean),
      canonicalMorphology: {
        rawSegmentation: raw.raw_morpholex_segmentation || "", rawPartOfSpeech: raw.raw_morpholex_pos || "",
        parts: morphologyParts, featureKeys, joins: morphologyJoins, transformationNotes: raw.transformation_notes || "",
        wordSum: raw.word_sum || "", analysisStatus: (raw.analysis_status || "in_review") as WordDraftPayload["canonicalMorphology"]["analysisStatus"], reviewNotes: raw.morphology_review_notes || "",
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
      error: !normalisedWord ? "Missing word." : cells.length !== names.length ? "Column count does not match header." : morphologyError };
  });
}
