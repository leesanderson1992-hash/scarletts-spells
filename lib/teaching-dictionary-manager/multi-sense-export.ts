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


/** Older Overview definitions are useful to editors but do not confer sense approval. */
export async function prefillReviewWorkbookMeanings(
  db: ReturnType<typeof createServiceRoleClient>, bundles: MultiSenseCsvBundle[], notes: Map<string, string>,
) {
  const legacy = bundles.filter(bundle => !bundle.sourceSenseReviewedAt && bundle.senseSet.senses.length === 1);
  if (!legacy.length) return bundles;
  const ids = legacy.map(bundle => bundle.wordId);
  const definitions = new Map<string, string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("teaching_dictionary_definition_versions")
      .select("canonical_word_id,definition").in("canonical_word_id", ids).is("route_id", null)
      .order("published_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error("Could not load existing Teaching Dictionary meanings for this workbook.");
    for (const row of data ?? []) {
      if (!definitions.has(row.canonical_word_id)) definitions.set(row.canonical_word_id, row.definition);
    }
    if ((data?.length ?? 0) < 500 || definitions.size === ids.length) break;
  }
  const legacyIds = new Set(ids);
  return bundles.map(bundle => {
    if (!legacyIds.has(bundle.wordId)) return bundle;
    const [sense] = bundle.senseSet.senses;
    const definition = definitions.get(bundle.wordId)?.trim();
    if (!definition) {
      if (!sense.definition.trim()) notes.set(bundle.wordId,
        [notes.get(bundle.wordId), "Enter a meaning for this word."].filter(Boolean).join(" "));
      return bundle;
    }
    notes.set(bundle.wordId, [notes.get(bundle.wordId), "Confirm the meaning copied from the word page."]
      .filter(Boolean).join(" "));
    return { ...bundle, senseSet: { ...bundle.senseSet, senses: [{ ...sense, definition }] } };
  });
}
