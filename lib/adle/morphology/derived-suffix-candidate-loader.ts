import type { SupabaseClient } from "@supabase/supabase-js";
import type { DynamicAffixProfile, DynamicAffixWord } from "./affix-word-lab";
import { deriveReviewedSuffixCandidate, type ReviewedSuffixCandidateFacts } from "./derived-suffix-candidate";
import { isDynamicAffixWordLessonReady } from "./dynamic-affix-transfer-selection";

type Row = Record<string, unknown>;
type AuditItem = { canonicalWordId: string; displayWord: string; blockers: readonly string[]; existingMember: boolean };

export type DerivedSuffixCandidateAudit = {
  profileKey: string;
  scanned: number;
  newlyEligible: readonly DynamicAffixWord[];
  alreadyReleased: readonly AuditItem[];
  excluded: readonly AuditItem[];
};

async function approvedWordPages(client: SupabaseClient): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await client.from("canonical_teaching_dictionary_words")
      .select("id,display_word,source_row_hash,age_band,frequency_band,complexity_band,row_status,review_status")
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .ilike("display_word", "%ity").order("id").range(offset, offset + 499);
    if (page.error) throw new Error("DERIVED_SUFFIX_DICTIONARY_READ_FAILED");
    const rows = (page.data ?? []) as Row[];
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

async function rowsForIds(
  client: SupabaseClient,
  table: string,
  columns: string,
  ids: readonly string[],
): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const page = await client.from(table).select(columns).in("canonical_word_id", ids.slice(offset, offset + 100));
    if (page.error) throw new Error("DERIVED_SUFFIX_FACT_READ_FAILED");
    result.push(...((page.data ?? []) as unknown as Row[]));
  }
  return result;
}

function latestByWord(rows: readonly Row[], dateField: string): Map<string, Row> {
  const ordered = [...rows].sort((left, right) =>
    String(right[dateField] ?? "").localeCompare(String(left[dateField] ?? "")));
  const byWord = new Map<string, Row>();
  for (const row of ordered) {
    const id = row.canonical_word_id;
    if (typeof id === "string" && !byWord.has(id)) byWord.set(id, row);
  }
  return byWord;
}

/** Read-only shadow scan. This does not add candidates to a Production pool. */
export async function auditDerivedItyCandidates(
  client: SupabaseClient,
  profile: DynamicAffixProfile,
): Promise<DerivedSuffixCandidateAudit> {
  if (profile.microSkillKey !== "D4_MOR_SUFFIXES_ITY") throw new Error("DERIVED_SUFFIX_PILOT_PROFILE_REQUIRED");
  const words = await approvedWordPages(client);
  const ids = words.map((word) => word.id).filter((id): id is string => typeof id === "string");
  const [morphology, metadata, dictation, definitions] = await Promise.all([
    rowsForIds(client, "canonical_teaching_dictionary_word_morphology",
      "id,canonical_word_id,morphology_parts,morphology_joins,word_sum,analysis_status,review_status,source_row_hash,source_name,row_status,created_at", ids),
    rowsForIds(client, "canonical_teaching_dictionary_word_metadata",
      "canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,row_status,review_status,created_at", ids),
    rowsForIds(client, "canonical_teaching_dictionary_dictation_sentences",
      "id,canonical_word_id,source_row_hash,dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status,created_at", ids),
    rowsForIds(client, "teaching_dictionary_definition_versions",
      "canonical_word_id,route_id,definition,published_at", ids),
  ]);
  const morphById = latestByWord(morphology.filter((row) => row.row_status === "active"), "created_at");
  const metadataById = latestByWord(metadata.filter((row) => row.row_status === "active"), "created_at");
  const dictationById = latestByWord(dictation.filter((row) => row.row_status === "active"), "created_at");
  const definitionsById = latestByWord(definitions.filter((row) => row.route_id == null), "published_at");
  const newlyEligible: DynamicAffixWord[] = [];
  const alreadyReleased: AuditItem[] = [];
  const excluded: AuditItem[] = [];
  for (const raw of words) {
    if (typeof raw.id !== "string" || typeof raw.display_word !== "string") continue;
    const id = raw.id;
    const member = profile.wordsByCanonicalId.has(id);
    const morph = morphById.get(id);
    const meta = metadataById.get(id);
    const sentence = dictationById.get(id);
    const facts: ReviewedSuffixCandidateFacts = {
      word: {
        id, displayWord: raw.display_word, sourceRowHash: String(raw.source_row_hash ?? ""),
        ageBand: raw.age_band as string | null, frequencyBand: raw.frequency_band as string | null,
        complexityBand: raw.complexity_band as string | null,
        rowStatus: String(raw.row_status ?? ""), reviewStatus: String(raw.review_status ?? ""),
      },
      morphology: morph ? {
        id: String(morph.id ?? ""), parts: morph.morphology_parts, joins: morph.morphology_joins,
        wordSum: morph.word_sum as string | null,
        analysisStatus: String(morph.analysis_status ?? ""), reviewStatus: String(morph.review_status ?? ""),
        sourceRowHash: String(morph.source_row_hash ?? ""), sourceName: morph.source_name as string | null,
      } : null,
      metadata: meta ? {
        syllables: meta.syllables as string | null, phonemeHint: meta.phoneme_hint as string | null,
        stressPattern: meta.stress_pattern as string | null, hasSchwa: meta.has_schwa as boolean | null,
        rowStatus: String(meta.row_status ?? ""), reviewStatus: String(meta.review_status ?? ""),
      } : null,
      dictation: sentence ? {
        id: String(sentence.id ?? ""), sourceRowHash: String(sentence.source_row_hash ?? ""),
        sentence: String(sentence.dictation_sentence ?? ""),
        targetTokenIndex: Number(sentence.dictation_target_token_index),
        audioText: String(sentence.audio_text ?? ""),
        rowStatus: String(sentence.row_status ?? ""), reviewStatus: String(sentence.review_status ?? ""),
      } : null,
      definition: definitionsById.get(id)?.definition as string | null ?? null,
    };
    const result = deriveReviewedSuffixCandidate(profile, facts);
    const ready = result.word && isDynamicAffixWordLessonReady(profile, result.word);
    const item: AuditItem = { canonicalWordId: id, displayWord: raw.display_word,
      blockers: ready ? [] : result.blockers.length ? result.blockers : ["route_compiler_rejected"],
      existingMember: member };
    if (member) alreadyReleased.push(item);
    else if (ready && result.word) newlyEligible.push(result.word);
    else excluded.push(item);
  }
  return { profileKey: profile.microSkillKey, scanned: words.length, newlyEligible, alreadyReleased, excluded };
}
