import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import type { DictionarySenseSet } from "./senses";

export async function loadReviewedMeaningBundles(db: ReturnType<typeof createServiceRoleClient>, ids: string[]) {
  if (!ids.length) return [];
  const [word, reviewed, analyses, links] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word")
      .in("id", ids).eq("row_status", "active"),
    db.from("teaching_dictionary_reviewed_sense_sets")
      .select("canonical_word_id,sense_set,reviewed_at").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_morphology")
      .select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum")
      .in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_family_memberships")
      .select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind")
      .in("canonical_word_id", ids),
  ]);
  if (word.error || reviewed.error || analyses.error || links.error)
    throw new Error("MULTI_SENSE_CSV_EXPORT_READ_FAILED");
  const bundles: MultiSenseCsvBundle[] = word.data.flatMap(item => {
    const source = reviewed.data.find(row => row.canonical_word_id === item.id);
    if (!source) return [];
    const senseSet = source.sense_set as DictionarySenseSet;
    return [{ wordId: item.id, displayWord: item.display_word,
    sourceSenseReviewedAt: source.reviewed_at, senseSet,
    analyses: senseSet.senses.flatMap(sense => {
      const analysis = (analyses.data ?? []).find(row => row.canonical_word_id === item.id
        && row.sense_id === sense.id);
      if (!analysis) return [];
      const matching = (links.data ?? []).filter(row => row.canonical_word_id === item.id
        && row.sense_id === sense.id
        && row.sense_morphology_id === analysis.id);
      const family = matching.length === 1 ? matching[0] : null;
      return [{ senseId: sense.id,
        parts: analysis.morphology_parts as MultiSenseCsvBundle["analyses"][number]["parts"],
        joins: analysis.morphology_joins as MultiSenseCsvBundle["analyses"][number]["joins"],
        transformations: analysis.morphology_transformations as MultiSenseCsvBundle["analyses"][number]["transformations"],
        wordSum: analysis.word_sum, familyKey: family?.family_key ?? "",
        componentPartId: family?.component_part_id ?? "",
        relationshipKind: family?.relationship_kind ?? "", requestedSkillKeys: [] }];
    }) }];
  });
  return bundles;
}
