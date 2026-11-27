import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalLatinRootFamily, CanonicalLatinRootWord } from "../morphology/latin-root-canonical";

import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
type RootRow = { family_key: string; revision: number; root_word_id: string; root_sense_id: string; root_text: string; origin_language: string; micro_skill_key: string };
type LinkRow = { canonical_word_id: string; sense_id: string; sense_morphology_id: string; family_key: string; current_family_revision: number; component_part_id: string };
type MeaningRow = { family_key: string; revision: number; base_meaning: string; review_status: string };
type WordRow = { id: string; display_word: string; review_status: string };
type SenseRow = { canonical_word_id: string; sense_set: DictionarySenseSet; reviewed_at: string };
type AnalysisRow = { id: string; sense_id: string; word_sum: string; morphology_parts: CanonicalLatinRootWord["parts"]; morphology_joins: unknown[]; morphology_transformations: unknown[] };
async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error(`latin_root_dictionary_read:${result.error.message}`);
  return (result.data ?? []) as T[];
}

/** Bulk read the same reviewed, sense-specific facts exposed by the Teaching Dictionary. */
export async function loadCanonicalLatinRootFacts(client: SupabaseClient, familyKeys: readonly string[]): Promise<{
  families: CanonicalLatinRootFamily[]; words: CanonicalLatinRootWord[];
}> {
  if (!familyKeys.length) return { families: [], words: [] };
  const [familyRows, links] = await Promise.all([
    rows<RootRow>(client.from("teaching_dictionary_root_skill_families").select("family_key,revision,root_word_id,root_sense_id,root_text,origin_language,micro_skill_key").in("family_key", [...familyKeys])),
    rows<LinkRow>(client.from("teaching_dictionary_current_sense_family_memberships").select("canonical_word_id,sense_id,sense_morphology_id,family_key,current_family_revision,component_part_id").in("family_key", [...familyKeys])),
  ]);
  const latest = new Map<string, RootRow>();
  for (const family of familyRows) if (!latest.has(family.family_key) || latest.get(family.family_key)!.revision < family.revision) latest.set(family.family_key, family);
  const meanings = await rows<MeaningRow>(client.from("teaching_dictionary_families_with_current_meaning").select("family_key,revision,base_meaning,review_status,is_current_family").in("family_key", [...latest.keys()]).eq("is_current_family", true));
  const families: CanonicalLatinRootFamily[] = [...latest.values()].flatMap(family => {
    const meaning = meanings.find(row => row.family_key === family.family_key && row.revision === family.revision);
    return meaning && family.micro_skill_key === "D4_MOR_ROOTS_COMMON_LATIN_ROOTS" ? [{ familyKey: family.family_key,
      revision: family.revision, rootWordId: family.root_word_id, rootSenseId: family.root_sense_id,
      root: family.root_text, meaning: meaning.base_meaning, origin: family.origin_language, reviewStatus: meaning.review_status }] : [];
  });
  const current = links.filter(link => families.some(family => family.familyKey === link.family_key && family.revision === link.current_family_revision));
  const ids = [...new Set(current.map(link => link.canonical_word_id))];
  if (!ids.length) return { families, words: [] };
  const [words, senses, analyses] = await Promise.all([
    rows<WordRow>(client.from("canonical_teaching_dictionary_words").select("id,display_word,review_status,row_status,dialect_code").in("id", ids).eq("row_status", "active").eq("dialect_code", "en-GB")),
    rows<SenseRow>(client.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id,sense_set,reviewed_at").in("canonical_word_id", ids)),
    rows<AnalysisRow>(client.from("teaching_dictionary_current_sense_morphology").select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum").in("canonical_word_id", ids)),
  ]);
  const result: CanonicalLatinRootWord[] = current.flatMap(link => {
    const word = words.find(row => row.id === link.canonical_word_id);
    const set = senses.find(row => row.canonical_word_id === link.canonical_word_id);
    const sense = set?.sense_set?.senses?.find(row => row.id === link.sense_id);
    const pronunciation = set?.sense_set?.pronunciations?.find(row => row.id === sense?.pronunciationId);
    const analysis = analyses.find(row => row.id === link.sense_morphology_id && row.sense_id === link.sense_id);
    if (!word || !sense || !analysis) return [];
    return [{ canonicalWordId: word.id, spelling: word.display_word, familyKey: link.family_key,
      senseId: link.sense_id, definition: sense.definition ?? "", partOfSpeech: sense.partOfSpeech ?? "",
      ipa: pronunciation?.ipa ?? "", sentence: sense.dictationSentence ?? "", targetTokenIndex: sense.dictationTargetTokenIndex ?? -1,
      reviewStatus: word.review_status, reviewedAt: new Date(set!.reviewed_at).toISOString(), morphologyId: analysis.id,
      componentPartId: link.component_part_id, wordSum: analysis.word_sum ?? "", parts: analysis.morphology_parts ?? [],
      joins: analysis.morphology_joins ?? [], transformations: analysis.morphology_transformations ?? [] }];
  });
  return { families, words: result };
}
