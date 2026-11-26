import type { SupabaseClient } from "@supabase/supabase-js";
import type { DictionarySenseSet } from "@/lib/teaching-dictionary-manager/senses";
import { senseSetErrors } from "@/lib/teaching-dictionary-manager/senses";
import type { CanonicalPart } from "@/lib/teaching-dictionary-manager/canonical-morphology";
import type { LessonSenseProjection } from "@/lib/teaching-dictionary-manager/lesson-sense-projection";

type CurrentSense = Extract<LessonSenseProjection, { status: "current" }>;
export type BaseWordFamilyAnchor = {
  familyKey: string; wordId: string; sense: CurrentSense;
  parts: CanonicalPart[]; joins: unknown[]; wordSum: string;
};

/** A family base is reviewed dictionary support. It does not need a separate
 * demonstrates assignment or a lesson-specific meaning approval. */
export async function loadBaseWordFamilyAnchors(db: SupabaseClient, wordIds: readonly string[]) {
  const result: BaseWordFamilyAnchor[] = [];
  const ids = [...new Set(wordIds)];
  for (let offset = 0; offset < ids.length; offset += 75) {
    const batch = ids.slice(offset, offset + 75);
    const [words, sets, analyses, families, links, sentences] = await Promise.all([
      db.from("canonical_teaching_dictionary_words").select("id,display_word")
        .in("id", batch).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
      db.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id,sense_set").in("canonical_word_id", batch),
      db.from("teaching_dictionary_current_sense_morphology").select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,word_sum").in("canonical_word_id", batch),
      db.from("teaching_dictionary_families_with_current_meaning").select("family_key,revision,review_status,base_kind,canonical_base_word_id,canonical_base_sense_id")
        .in("canonical_base_word_id", batch).order("revision", { ascending: false }),
      db.from("teaching_dictionary_current_sense_family_memberships")
        .select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind").in("canonical_word_id", batch),
      db.from("teaching_dictionary_reviewed_sense_sentences").select("id,canonical_word_id,sense_id,sentence,target_token_index,source_row_hash").in("canonical_word_id", batch),
    ]);
    if ([words, sets, analyses, families, links, sentences].some(query => query.error))
      throw new Error("Could not load reviewed Base Word family anchors.");
    const latest = new Set<string>();
    for (const family of families.data ?? []) {
      if (latest.has(family.family_key)) continue;
      latest.add(family.family_key);
      if (family.review_status !== "approved" || family.base_kind !== "free_base") continue;
      const word = words.data?.find(row => row.id === family.canonical_base_word_id);
      const set = sets.data?.find(row => row.canonical_word_id === word?.id)?.sense_set as DictionarySenseSet | undefined;
      // Historical family keys have no sense column. An explicit, current
      // whole-base approval can supply that identity without renaming the
      // family or guessing between meanings from its display wording.
      const linkedSenseIds = [...new Set((links.data ?? []).filter(link =>
        link.canonical_word_id === family.canonical_base_word_id && link.family_key === family.family_key &&
        link.relationship_kind === "free_base").map(link => link.sense_id))];
      const senseId = family.canonical_base_sense_id ?? (linkedSenseIds.length === 1 ? linkedSenseIds[0] : null);
      const sense = set?.senses.find(row => row.id === senseId);
      if (!word || !set || !sense || sense.partOfSpeech === "root") continue;
      const pronunciation = set.pronunciations.find(row => row.id === sense.pronunciationId);
      if (!pronunciation || senseSetErrors({ senses: [sense], pronunciations: [pronunciation] }).length) continue;
      const analysis = analyses.data?.find(row => row.canonical_word_id === word.id && row.sense_id === sense.id);
      const parts = analysis?.morphology_parts as CanonicalPart[] | undefined;
      if (!analysis || !parts || parts.length !== 1 || parts[0].kind !== "base" ||
          parts[0].sourceText.toLowerCase() !== word.display_word.toLowerCase() || parts[0].surfaceText !== word.display_word) continue;
      if (!links.data?.some(row => row.canonical_word_id === word.id && row.sense_id === sense.id &&
          row.sense_morphology_id === analysis.id && row.family_key === family.family_key &&
          row.component_part_id === parts[0].id && row.relationship_kind === "free_base")) continue;
      const sentence = sentences.data?.find(row => row.canonical_word_id === word.id && row.sense_id === sense.id &&
        row.sentence === sense.dictationSentence && row.target_token_index === sense.dictationTargetTokenIndex);
      if (!sentence) continue;
      result.push({ familyKey: family.family_key, wordId: word.id,
        parts: parts.map(part => ({ ...part, gloss: sense.definition })), joins: analysis.morphology_joins as unknown[], wordSum: analysis.word_sum,
        sense: { status: "current", senseId: sense.id, meaning: sense.definition, pronunciation,
          dictationSentence: sentence.sentence, dictationTargetTokenIndex: sentence.target_token_index,
          dictationAuthorityId: sentence.id, dictationSourceHash: sentence.source_row_hash } });
    }
  }
  return result;
}

const normaliseMeaning = (value: string) => value.toLowerCase().replace(/[\s.!]+/g, " ").trim();

/** Prefer an exact family identity; never silently choose one of two senses. */
export function chooseBaseWordFamilyAnchor(anchors: readonly BaseWordFamilyAnchor[], family: {
  baseWordId: string; baseFamilyKey: string; baseMeaning: string;
}, memberFamilyKeys: readonly string[]) {
  const choices = anchors.filter(anchor => anchor.wordId === family.baseWordId);
  const linked = choices.filter(anchor => memberFamilyKeys.includes(anchor.familyKey));
  if (linked.length) return linked.length === 1 ? linked[0] : null;
  const exact = choices.filter(anchor => anchor.familyKey === family.baseFamilyKey ||
    normaliseMeaning(anchor.sense.meaning) === normaliseMeaning(family.baseMeaning));
  return exact.length === 1 ? exact[0] : null;
}
