import { emptyMetadata, normaliseWord, publicationBlockers, type WordDraftPayload } from "./contracts";
import { createHash } from "node:crypto";
import { canonicalWordSum, type CanonicalPart, type CanonicalJoin } from "./canonical-morphology";
import type { ReviewedTransformation } from "./authoring";
import { normaliseWrittenSyllableBreakdown } from "./authoring";

export const FLAT_IMPORT_PART_LIMIT = 6;
export const MAX_DICTIONARY_CSV_BYTES = 4_000_000;

/** Human-editable CSV columns used by the Google Sheet template. */
function flatMorphology(raw: Record<string, string>, headers: readonly string[], displayWord: string) {
  if (!headers.includes("part_1_kind")) return null;
  if (raw.morphology_parts || raw.morphology_joins)
    throw new Error("Use either the word-part columns or morphology JSON, not both.");
  const parts: CanonicalPart[] = [];
  const joins: CanonicalJoin[] = [];
  const transformations: ReviewedTransformation[] = [];
  let surface = "";
  for (let number = 1; number <= FLAT_IMPORT_PART_LIMIT; number += 1) {
    const prefix = `part_${number}_`;
    const kind = raw[`${prefix}kind`] ?? "";
    const sourceText = raw[`${prefix}underlying_form`] ?? "";
    const surfaceText = raw[`${prefix}visible_letters`] ?? "";
    const gloss = raw[`${prefix}meaning`] ?? "";
    const explanation = raw[`${prefix}spelling_change_explanation`] ?? "";
    const join = number > 1 ? raw[`${prefix}join_before`] ?? "" : "";
    if (![kind, sourceText, surfaceText, gloss, explanation, join].some(Boolean)) continue;
    if (parts.length !== number - 1) throw new Error(`Part ${number} follows an empty part.`);
    if (!kind || !sourceText || !surfaceText || !gloss)
      throw new Error(`Part ${number} needs its role, underlying form, visible letters and meaning.`);
    if (!["prefix", "base", "root", "suffix", "connector"].includes(kind))
      throw new Error(`Part ${number} has an invalid role.`);
    if (number > 1) {
      if (!["none", "space", "hyphen"].includes(join)) throw new Error(`Part ${number} needs a valid join before it.`);
      joins.push({ afterPartId: parts[number - 2].id, beforePartId: `part_${number}`, joinType: join as CanonicalJoin["joinType"] });
      surface += join === "space" ? " " : join === "hyphen" ? "-" : "";
    }
    const start = surface.length;
    surface += surfaceText;
    parts.push({ id: `part_${number}`, kind: kind as CanonicalPart["kind"], sourceText, surfaceText, gloss,
      displayRange: { start, end: surface.length } });
    if (sourceText !== surfaceText) {
      if (!explanation) throw new Error(`Part ${number} needs a spelling-change explanation.`);
      transformations.push({ type: ["base", "root"].includes(kind) ? "base_spelling_change" : "affix_spelling_change",
        sourcePartId: `part_${number}`, sourceText, surfaceText, explanation });
    } else if (explanation) throw new Error(`Part ${number} has a spelling-change explanation but its forms match.`);
  }
  if (!parts.length) throw new Error("Add at least one word part.");
  if (surface !== displayWord) throw new Error(`Visible parts and joins spell “${surface}”, not “${displayWord}”.`);
  return { parts, joins, transformations, wordSum: canonicalWordSum(parts, displayWord) };
}

function jsonArray(value: string): unknown[] {
  if (!value) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error("Invalid morphology JSON array."); }
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("Invalid morphology JSON array.");
  return parsed;
}

export type CsvDraft = { rowNumber: number; normalisedWord: string; payload: WordDraftPayload; providedColumns: string[]; error?: string;
  canonicalWordId?: string; sourceRowHash?: string; sourceOverviewHash?: string;
  sourceFamilyKey?: string; sourceFamilyRevision?: number;
  sourceFamilyLinks?: string;
  writtenSyllableBreakdown?: string; exportVersion?: string; unchanged?: boolean };

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
  const singleRows = new Map<string, CsvDraft>();
  const duplicateWords = new Set<string>();
  const errors: string[] = [];
  for (const row of rows) {
    if (!row.providedColumns.includes("tdm_export_version")) {
      const previous = singleRows.get(row.normalisedWord);
      if (previous) {
        duplicateWords.add(row.normalisedWord);
        errors.push(`Row ${row.rowNumber}: Duplicate word also appears on row ${previous.rowNumber}. Keep one Overview row per word.`);
      }
      else singleRows.set(row.normalisedWord, row);
      continue;
    }
    groups.set(row.normalisedWord, [...(groups.get(row.normalisedWord) ?? []), row]);
  }
  for (const word of singleRows.keys()) if (groups.has(word)) {
    duplicateWords.add(word);
    errors.push(`Word ${word}: The CSV mixes a single Overview row with route export rows.`);
  }
  const combined = [...singleRows.values()].filter((row) => !duplicateWords.has(row.normalisedWord));
  for (const group of groups.values()) {
    if (duplicateWords.has(group[0]!.normalisedWord)) continue;
    if (group.every((row) => row.unchanged)) continue;
    const first = group[0];
    const shared = JSON.stringify({ ...first.payload, routeContents: [] });
    const inconsistent = group.find((row) => row.canonicalWordId !== first.canonicalWordId
      || row.sourceRowHash !== first.sourceRowHash || row.sourceOverviewHash !== first.sourceOverviewHash
      || row.sourceFamilyKey !== first.sourceFamilyKey || row.sourceFamilyRevision !== first.sourceFamilyRevision
      || row.sourceFamilyLinks !== first.sourceFamilyLinks
      || JSON.stringify({ ...row.payload, routeContents: [] }) !== shared);
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
  if (Buffer.byteLength(text, "utf8") > MAX_DICTIONARY_CSV_BYTES) throw new Error("CSV_TOO_LARGE");
  const [headers, ...values] = records(text);
  if (!headers || values.length > 10000) throw new Error("CSV_ROW_LIMIT");
  const names = headers.map((header) => header.trim());
  if (!names.includes("normalised_word") && !names.includes("targetWord") && !names.includes("display_word")) throw new Error("CSV_WORD_COLUMN_MISSING");
  if (names.includes("tdm_export_version") && !names.includes("canonical_word_id")) throw new Error("CSV_ID_COLUMN_MISSING");
  return values.map((cells, index) => {
    const raw = Object.fromEntries(names.map((name, column) => [name, cells[column]?.trim() ?? ""]));
    if (names.includes("written_syllable_breakdown"))
      raw.written_syllable_breakdown = normaliseWrittenSyllableBreakdown(raw.written_syllable_breakdown);
    if (raw.tdm_export_version) for (const name of names) {
      if (/^'[=+@\-\t\r]/.test(raw[name])) raw[name] = raw[name].slice(1);
    }
    const normalisedWord = normaliseWord(raw.normalised_word || raw.targetWord || raw.display_word);
    const target = raw.dictation_sentence || raw.dictation1_sentence || "";
    const tokens = target.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? [];
    const targetLength = normalisedWord.split(/\s+/u).length;
    const tokenIndex = tokens.findIndex((_, position) => normaliseWord(tokens.slice(position,
      position + targetLength).join(" ")) === normalisedWord);
    const metadata = emptyMetadata();
    const schwa = (raw.has_schwa ?? "").toLowerCase();
    for (const key of Object.keys(metadata) as (keyof typeof metadata)[]) {
      if (key === "has_schwa") metadata.has_schwa = schwa === "true" ? true : schwa === "false" ? false : null;
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
    let flat: ReturnType<typeof flatMorphology> = null;
    let morphologyError: string | undefined;
    try {
      morphologyParts = jsonArray(raw.morphology_parts);
      featureKeys = jsonArray(raw.feature_keys);
      morphologyJoins = jsonArray(raw.morphology_joins);
      flat = flatMorphology(raw, names, raw.display_word || raw.targetWord || normalisedWord);
      if (flat) { morphologyParts = flat.parts; morphologyJoins = flat.joins; }
    } catch (error) { morphologyError = error instanceof Error ? error.message : "Invalid morphology format."; }
    const payload: WordDraftPayload = {
      displayWord: raw.display_word || raw.targetWord || normalisedWord,
      definition: raw.definition || raw.wordMeaning || "",
      dictationSentence: target, dictationTargetTokenIndex: raw.tdm_export_version && /^\d+$/.test(raw.dictation_target_token_index)
        ? Number(raw.dictation_target_token_index) : Math.max(0, tokenIndex),
      ...(raw.written_syllable_breakdown && (!raw.tdm_export_version || raw.tdm_export_version === "2")
        ? { writtenSyllableBreakdown: raw.written_syllable_breakdown } : {}),
      ageBand: raw.age_band || "", frequencyBand: raw.frequency_band || "", complexityBand: raw.complexity_band || "",
      metadata, skillKeys: raw.tdm_export_version ? (raw.affected_micro_skills || "").split(/[;,]/).map((key) => key.trim()).filter(Boolean)
        : raw.microSkillKey ? [raw.microSkillKey] : (raw.affected_micro_skills || "").split(/[;,]/).map((key) => key.trim()).filter(Boolean),
      canonicalMorphology: {
        rawSegmentation: raw.raw_morpholex_segmentation || "", rawPartOfSpeech: raw.raw_morpholex_pos || "",
        parts: morphologyParts, featureKeys, joins: morphologyJoins, transformationNotes: raw.transformation_notes || "",
        ...(flat ? { transformations: flat.transformations } : {}),
        wordSum: flat?.wordSum || raw.word_sum || "", analysisStatus: (raw.analysis_status || (flat ? "approved" : "in_review")) as WordDraftPayload["canonicalMorphology"]["analysisStatus"], reviewNotes: raw.morphology_review_notes || raw.review_notes || "",
      },
      provenance: {
        sourceCategory: (raw.source_category || (raw.lineageJSON ? "ai_assisted_draft" : "internal_authored")) as WordDraftPayload["provenance"]["sourceCategory"],
        sourceName: raw.source_name || raw.sourceFile || "", sourceUrl: raw.source_url || "",
        sourceLicence: raw.source_licence || "", sourceUseNote: raw.source_use_note || raw.teacherEditorialNotes || "",
        confidence: (raw.confidence || "medium") as WordDraftPayload["provenance"]["confidence"],
      },
      ...(["root_family_key", "root_definition", "root_origin_language",
        "root_pronunciation_applicability", "root_pronunciation_ipa"].some((key) => raw[key])
        ? { rootFamilyReview: {
          familyKey: raw.root_family_key || "",
          rootDefinition: raw.root_definition || "",
          originLanguage: raw.root_origin_language || "",
          pronunciationApplicability: raw.root_pronunciation_applicability as "reviewed" | "not_applicable",
          pronunciationIpa: raw.root_pronunciation_ipa || "",
        } } : {}),
      ...(["base_family_key", "base_part_of_speech"].some((key) => raw[key])
        ? { freeBaseFamilyReview: {
          familyKey: raw.base_family_key || "",
          basePartOfSpeech: raw.base_part_of_speech || "",
        } } : {}),
      routeContents,
    };
    const rootReview = payload.rootFamilyReview;
    const rootReviewError = rootReview && (
      !rootReview.familyKey || !rootReview.rootDefinition || !rootReview.originLanguage
      || !["reviewed", "not_applicable"].includes(rootReview.pronunciationApplicability)
      || (rootReview.pronunciationApplicability === "reviewed" && !rootReview.pronunciationIpa)
      || (rootReview.pronunciationApplicability === "not_applicable" && Boolean(rootReview.pronunciationIpa))
      || morphologyParts.filter((part) => part && typeof part === "object"
        && (part as Record<string, unknown>).kind === "root").length !== 1
    ) ? "Bound-root review needs a family key, definition, origin, one root part and a valid pronunciation choice." : undefined;
    const flatRequired = flat ? [
      ...(!payload.definition.trim() ? ["Definition is required."] : []),
      ...(!/^[1-9][0-9]*$/u.test(payload.metadata.syllables) ? ["Spoken syllable count must be a positive number."] : []),
      ...(!payload.metadata.phoneme_hint.trim() ? ["Pronunciation hint is required."] : []),
      ...(!payload.writtenSyllableBreakdown?.trim() ? ["Written syllable breakdown is required."] : []),
      ...(!/^(?:primary|secondary|unstressed)(?:-(?:primary|secondary|unstressed))*$/u.test(payload.metadata.stress_pattern)
        || payload.metadata.stress_pattern.split("-").length !== Number(payload.metadata.syllables)
        ? ["Stress pattern needs one position for each spoken syllable."] : []),
      ...(!payload.canonicalMorphology.rawPartOfSpeech.trim() ? ["Part of speech is required."] : []),
      ...(!raw.source_category?.trim() ? ["Source category is required."] : []),
      ...(!payload.provenance.sourceName.trim() ? ["Source name is required."] : []),
      ...(!payload.provenance.sourceUseNote.trim() ? ["Source use note is required."] : []),
      ...(!raw.confidence?.trim() ? ["Confidence is required."] : []),
      ...publicationBlockers(payload, normalisedWord, { requireCanonicalParts: true }),
    ] : [];
    return { rowNumber: index + 2, normalisedWord, payload, providedColumns: names,
      canonicalWordId: raw.canonical_word_id || undefined,
      sourceRowHash: raw.source_row_hash || undefined,
      sourceOverviewHash: raw.tdm_source_overview_hash || undefined,
      sourceFamilyKey: raw.tdm_source_family_key || undefined,
      sourceFamilyRevision: /^[1-9][0-9]*$/u.test(raw.tdm_source_family_revision)
        ? Number(raw.tdm_source_family_revision) : undefined,
      sourceFamilyLinks: names.includes("current_approved_family_links")
        ? raw.current_approved_family_links : undefined,
      writtenSyllableBreakdown: names.includes("written_syllable_breakdown") ? raw.written_syllable_breakdown : undefined,
      exportVersion: raw.tdm_export_version || undefined,
      unchanged: Boolean(raw.tdm_edit_hash && raw.tdm_edit_hash === roundTripEditHash(raw, names)),
      error: !normalisedWord ? "Missing word." : cells.length !== names.length ? "Column count does not match header."
        : schwa && schwa !== "true" && schwa !== "false" ? "has_schwa must be TRUE, FALSE, or blank." : morphologyError || routeError || rootReviewError
        || flatRequired[0]
        || (raw.tdm_export_version && !["1", "2"].includes(raw.tdm_export_version) ? "Unsupported export version." : undefined)
        || (raw.tdm_export_version === "2" && raw.tdm_source_family_key
          && !/^[1-9][0-9]*$/u.test(raw.tdm_source_family_revision)
          ? "Source family revision is missing or invalid." : undefined)
        || (raw.tdm_export_version === "2" && !raw.tdm_source_family_key && raw.tdm_source_family_revision
          ? "Source family key is missing." : undefined) };
  });
}
