import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngDictionaryWordV1, IngMicroSkill } from "./contracts";
import { ingReleasedWordMatchesCurrentOverview } from "./current-overview";
import { candidateFactsForSense } from "@/lib/teaching-dictionary-manager/candidate-sense-facts";
import { canonicalPairKey } from "../word-skill-relationships/pair-key";
import { loadCurrentPairDeassignments } from "../word-skill-relationships/pair-decision-veto";

/** Recheck the selected sense of every released word before admitting or selecting it. */
export async function currentReleasedIngWordIds(input: {
  client: SupabaseClient; microSkillKey: IngMicroSkill; words: IngDictionaryWordV1[];
  environmentKey: "local" | "staging" | "production";
}) {
  const words = input.words;
  if (!words.length) return new Set<string>();
  const read = async <T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const result = await query;
    if (result.error) throw new Error(`ing_dictionary_pool:${result.error.message}`);
    return result.data ?? [];
  };
  const rows: any[] = await read(input.client.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code,source_name,source_url").in("id", words.map(word => word.canonicalWordId)));
  const overviewWords = words.filter(word => word.senseId !== undefined || word.pronunciationId !== undefined);
  const currentOverviewIds = new Set<string>();
  if (overviewWords.length) {
    const ids = overviewWords.map(word => word.canonicalWordId);
    const vetoes = input.environmentKey === "staging" ? await loadCurrentPairDeassignments({ client: input.client,
      environmentKey: input.environmentKey,
      pairs: ids.map(canonicalWordId => ({ canonicalWordId, microSkillKey: input.microSkillKey })) }) : new Set<string>();
    const [sets, morphologies, links, senseAnalyses, senseLinks, decisions, senseBindings]: any[][] = await Promise.all([
      read(input.client.from("teaching_dictionary_reviewed_sense_sets")
        .select("canonical_word_id,sense_set").in("canonical_word_id", ids)),
      read(input.client.from("canonical_teaching_dictionary_word_morphology")
        .select("id,canonical_word_id,created_at,morphology_parts,morphology_joins,analysis_status,review_status,word_sum")
        .in("canonical_word_id", ids).eq("row_status", "active").order("created_at", { ascending: false })),
      read(input.client.from("teaching_dictionary_current_sense_family_links")
        .select("id,canonical_word_id,sense_id,family_key,component_part_id,relationship_kind")
        .in("canonical_word_id", ids)),
      read(input.client.from("teaching_dictionary_current_sense_morphology")
        .select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,word_sum")
        .in("canonical_word_id", ids)),
      read(input.client.from("teaching_dictionary_current_sense_family_memberships")
        .select("id,canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind")
        .in("canonical_word_id", ids)),
      read(input.client.from("teaching_dictionary_current_candidate_decisions")
        .select("canonical_word_id,sense_id,action,pronunciation_id,rule_revision,fact_snapshot")
        .eq("environment_key", input.environmentKey).eq("micro_skill_key", input.microSkillKey)
        .in("canonical_word_id", ids)),
      read(input.client.from("teaching_dictionary_effective_lesson_sense_bindings")
        .select("canonical_word_id,sense_id").eq("environment_key", input.environmentKey)
        .eq("micro_skill_key", input.microSkillKey).in("canonical_word_id", ids)),
    ]);
    for (const word of overviewWords) {
      const morphology = morphologies.find(row => row.canonical_word_id === word.canonicalWordId);
      const source = rows.find(row => row.id === word.canonicalWordId);
      const senseSet = sets.find(row => row.canonical_word_id === word.canonicalWordId)?.sense_set ?? null;
      const facts = candidateFactsForSense({ wordId: word.canonicalWordId,
        senseId: word.senseId, senseSet,
        legacyMorphology: morphology ? { id: morphology.id, parts: morphology.morphology_parts,
          joins: morphology.morphology_joins, analysisStatus: morphology.analysis_status,
          reviewStatus: morphology.review_status, wordSum: morphology.word_sum } : null,
        legacyLinks: links, senseAnalyses, senseLinks });
      const matches = ingReleasedWordMatchesCurrentOverview({ released: word,
        senseSet,
        morphology: facts.morphology && facts.morphologyId
          ? { ...facts.morphology, id: facts.morphologyId } : null,
        familyLinks: (facts.source === "sense" ? senseLinks : links)
          .filter(row => row.canonical_word_id === word.canonicalWordId
            && row.sense_id === word.senseId),
        decision: decisions.find(row => row.canonical_word_id === word.canonicalWordId
          && row.sense_id === word.senseId) ?? null,
        boundSenseIds: senseBindings.filter(row => row.canonical_word_id === word.canonicalWordId)
          .map(row => row.sense_id),
        sourceName: source?.source_name ?? null, sourceUrl: source?.source_url ?? null });
      if (matches && !vetoes.has(canonicalPairKey(word.canonicalWordId,input.microSkillKey)))
        currentOverviewIds.add(word.canonicalWordId);

    }
  }
  return currentOverviewIds;
}
