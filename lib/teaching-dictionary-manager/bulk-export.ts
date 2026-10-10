import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadTeachingDictionaryEvidenceAuthority } from "./evidence-authority";
import { emptyMetadata, emptyMorphology, publicationBlockers, routeBlockers, routeContentFromStoredRow,
  routeForSkill, WORD_METADATA_FIELDS, type WordDraftPayload } from "./contracts";
import { ROUTE_JSON_FIELDS, ROUTE_TEXT_FIELDS, roundTripEditHash } from "./csv";

const COLUMNS = ["tdm_export_version", "tdm_edit_hash", "canonical_word_id", "source_row_hash", "normalised_word", "display_word",
  "affected_micro_skills", "definition", "dictation_sentence", "dictation_target_token_index", "age_band", "frequency_band",
  "complexity_band", ...WORD_METADATA_FIELDS, "has_schwa", "raw_morpholex_segmentation", "raw_morpholex_pos",
  "morphology_parts", "feature_keys", "morphology_joins", "transformation_notes", "word_sum", "analysis_status",
  "morphology_review_notes", "source_category", "source_name", "source_url", "source_licence", "source_use_note",
  "confidence", "routeId", "routeVersion", "microSkillKey", "wordMeaning", "wordSum", ...ROUTE_TEXT_FIELDS,
  ...ROUTE_JSON_FIELDS, "sourceRefs", "route_content_json", "missing_facts"] as const;

type Word = { id: string; normalised_word: string; display_word: string; source_row_hash: string; age_band: string | null;
  frequency_band: string | null; complexity_band: string | null; source_category: WordDraftPayload["provenance"]["sourceCategory"];
  source_name: string | null; source_url: string | null; source_licence: string | null; source_use_note: string | null;
  confidence: WordDraftPayload["provenance"]["confidence"] };
type Fact = Record<string, unknown> & { canonical_word_id: string; created_at: string };
type RouteRow = { canonical_word_id: string; route_id: string; route_version: string; micro_skill_key: string; content: unknown;
  published_at: string };

function cell(value: unknown): string {
  const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderTeachingDictionaryCsv(rows: Record<string, unknown>[]): string {
  return `\uFEFF${COLUMNS.map(cell).join(",")}\r\n${rows.map((row) => {
    const exportRow: Record<string, unknown> = { ...row, tdm_edit_hash: roundTripEditHash(row, COLUMNS) };
    return COLUMNS.map((key) => cell(exportRow[key])).join(",");
  }).join("\r\n")}\r\n`;
}

function latest<T extends Fact>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!result.has(row.canonical_word_id)) result.set(row.canonical_word_id, row);
  }
  return result;
}

export async function teachingDictionaryExportRows(): Promise<Record<string, unknown>[]> {
  const db = createServiceRoleClient();
  const words: Word[] = [];
  for (let start = 0; ; start += 500) {
    const result = await db.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word,display_word,source_row_hash,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence")
      .eq("dialect_code", "en-GB").eq("row_status", "active").order("id").range(start, start + 499);
    if (result.error) throw new Error("TEACHING_EXPORT_WORD_READ_FAILED");
    words.push(...result.data as Word[]);
    if ((result.data?.length ?? 0) < 500) break;
  }
  const environment = resolveAdleRouteActivationEnvironment();
  const authority = environment ? await loadTeachingDictionaryEvidenceAuthority(db, environment) : null;
  const skills = new Map<string, Set<string>>();
  for (const row of authority?.relationships ?? []) {
    if (!skills.has(row.canonicalWordId)) skills.set(row.canonicalWordId, new Set());
    skills.get(row.canonicalWordId)!.add(row.microSkillKey);
  }
  const output: Record<string, unknown>[] = [];
  for (let start = 0; start < words.length; start += 100) {
    const batch = words.slice(start, start + 100);
    const ids = batch.map((word) => word.id);
    const [metaResult, dictationResult, morphologyResult, definitionsResult, routesResult] = await Promise.all([
      db.from("canonical_teaching_dictionary_word_metadata").select("*").in("canonical_word_id", ids).eq("row_status", "active"),
      db.from("canonical_teaching_dictionary_dictation_sentences").select("*").in("canonical_word_id", ids).eq("row_status", "active"),
      db.from("canonical_teaching_dictionary_word_morphology").select("*").in("canonical_word_id", ids).eq("row_status", "active"),
      db.from("teaching_dictionary_definition_versions").select("canonical_word_id,definition,published_at").in("canonical_word_id", ids).is("route_id", null),
      db.from("teaching_dictionary_route_content_versions").select("canonical_word_id,route_id,route_version,micro_skill_key,content,published_at")
        .in("canonical_word_id", ids),
    ]);
    if (metaResult.error || dictationResult.error || morphologyResult.error || definitionsResult.error || routesResult.error)
      throw new Error("TEACHING_EXPORT_FACT_READ_FAILED");
    if ([metaResult, dictationResult, morphologyResult, definitionsResult, routesResult]
      .some((result) => (result.data?.length ?? 0) >= 1000)) throw new Error("TEACHING_EXPORT_FACT_PAGE_OVERFLOW");
    const meta = latest(metaResult.data as Fact[]);
    const dictation = latest(dictationResult.data as Fact[]);
    const morphology = latest(morphologyResult.data as Fact[]);
    const definitions = new Map<string, string>();
    for (const row of [...(definitionsResult.data ?? [])].sort((a, b) => b.published_at.localeCompare(a.published_at)))
      if (!definitions.has(row.canonical_word_id)) definitions.set(row.canonical_word_id, row.definition);
    const routes = new Map<string, RouteRow[]>();
    for (const row of [...(routesResult.data as RouteRow[])].sort((a, b) => b.published_at.localeCompare(a.published_at))) {
      if (!routes.has(row.canonical_word_id)) routes.set(row.canonical_word_id, []);
      if (!routes.get(row.canonical_word_id)!.some((known) => known.micro_skill_key === row.micro_skill_key))
        routes.get(row.canonical_word_id)!.push(row);
    }
    for (const word of batch) {
      const metadata: Record<string, unknown> = meta.get(word.id) ?? {};
      const sentence: Record<string, unknown> = dictation.get(word.id) ?? {};
      const morph: Record<string, unknown> = morphology.get(word.id) ?? {};
      const selected = new Set(skills.get(word.id) ?? []);
      for (const route of routes.get(word.id) ?? []) selected.add(route.micro_skill_key);
      const common: Record<string, unknown> = {
        tdm_export_version: "1", canonical_word_id: word.id, source_row_hash: word.source_row_hash,
        normalised_word: word.normalised_word, display_word: word.display_word,
        affected_micro_skills: [...selected].sort().join("; "), definition: definitions.get(word.id) ?? "",
        dictation_sentence: sentence.dictation_sentence ?? "", dictation_target_token_index: sentence.dictation_target_token_index ?? 0,
        age_band: word.age_band ?? "", frequency_band: word.frequency_band ?? "", complexity_band: word.complexity_band ?? "",
        ...Object.fromEntries(WORD_METADATA_FIELDS.map((key) => [key, metadata[key] ?? ""])),
        has_schwa: metadata.has_schwa == null ? "" : String(metadata.has_schwa),
        raw_morpholex_segmentation: morph.raw_morpholex_segmentation ?? "", raw_morpholex_pos: morph.raw_morpholex_pos ?? "",
        morphology_parts: morph.morphology_parts ?? [], feature_keys: morph.feature_keys ?? [], morphology_joins: morph.morphology_joins ?? [],
        transformation_notes: morph.transformation_notes ?? "", word_sum: morph.word_sum ?? "",
        analysis_status: morph.analysis_status ?? "in_review", morphology_review_notes: morph.review_notes ?? "",
        source_category: word.source_category, source_name: word.source_name ?? "", source_url: word.source_url ?? "",
        source_licence: word.source_licence ?? "", source_use_note: word.source_use_note ?? "", confidence: word.confidence,
      };
      const payload: WordDraftPayload = {
        displayWord: word.display_word, definition: String(common.definition), dictationSentence: String(common.dictation_sentence),
        dictationTargetTokenIndex: Number(common.dictation_target_token_index), ageBand: String(common.age_band),
        frequencyBand: String(common.frequency_band), complexityBand: String(common.complexity_band),
        metadata: { ...emptyMetadata(), ...Object.fromEntries(WORD_METADATA_FIELDS.map((key) => [key, String(common[key])])),
          has_schwa: metadata.has_schwa === true ? true : metadata.has_schwa === false ? false : null },
        canonicalMorphology: { ...emptyMorphology(), rawSegmentation: String(common.raw_morpholex_segmentation),
          rawPartOfSpeech: String(common.raw_morpholex_pos), parts: morph.morphology_parts as unknown[] ?? [],
          featureKeys: morph.feature_keys as unknown[] ?? [], joins: morph.morphology_joins as unknown[] ?? [],
          transformationNotes: String(common.transformation_notes), wordSum: String(common.word_sum),
          analysisStatus: common.analysis_status as WordDraftPayload["canonicalMorphology"]["analysisStatus"],
          reviewNotes: String(common.morphology_review_notes) },
        provenance: { sourceCategory: word.source_category, sourceName: word.source_name ?? "", sourceUrl: word.source_url ?? "",
          sourceLicence: word.source_licence ?? "", sourceUseNote: word.source_use_note ?? "", confidence: word.confidence },
        skillKeys: [...selected], routeContents: [],
      };
      const routeRows = [...selected].flatMap((key) => {
        const definition = routeForSkill(key);
        if (!definition) return [];
        const stored = (routes.get(word.id) ?? []).find((item) => item.micro_skill_key === key);
        return [stored ? routeContentFromStoredRow(stored) : {
          routeId: definition.routeId, routeVersion: definition.routeVersion, microSkillKey: key,
          wordMeaning: "", wordSum: "", content: {} as Record<string, unknown>,
        }];
      });
      if (!routeRows.length) {
        output.push({ ...common, missing_facts: publicationBlockers(payload, word.normalised_word).join("; ") });
        continue;
      }
      for (const route of routeRows) {
        const content = route.content;
        output.push({ ...common, routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: route.microSkillKey,
          wordMeaning: route.wordMeaning, wordSum: route.wordSum,
          ...Object.fromEntries(ROUTE_TEXT_FIELDS.map((field) => [field, content[field] ?? ""])),
          ...Object.fromEntries(ROUTE_JSON_FIELDS.map((field) => [field, content[field] ?? ""])),
          sourceRefs: Array.isArray(content.sourceRefs) ? content.sourceRefs.join("\n") : "",
          route_content_json: content,
          missing_facts: [...publicationBlockers(payload, word.normalised_word), ...routeBlockers(route, payload)].join("; "),
        });
      }
    }
  }
  return output;
}
