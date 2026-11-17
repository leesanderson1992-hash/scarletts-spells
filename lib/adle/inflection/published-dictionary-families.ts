import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCurrentLessonSenses } from "@/lib/teaching-dictionary-manager/lesson-sense-projection";
import { loadCurrentPairDeassignments } from "../word-skill-relationships/pair-decision-veto";
import { canonicalPairKey } from "../word-skill-relationships/pair-key";
import type { AdjectiveFamilyV1, ComparativeMicroSkill } from "./contracts";

export async function publishedDictionaryDegreeFamilies(input: {
  client: SupabaseClient;
  skill: ComparativeMicroSkill;
  families: AdjectiveFamilyV1[];
  environmentKey?: "local" | "staging" | "production";
}) {
  const { client, skill, families, environmentKey = "staging" } = input;
  const ids = [...new Set(families.flatMap(family => family.words.map(word => word.canonicalWordId)))];
  const [senses, analyses, links, vetoes, associations] = await Promise.all([
    loadCurrentLessonSenses(client, ids, [skill]),
    client.from("teaching_dictionary_current_sense_morphology").select("id,canonical_word_id,sense_id,morphology_parts")
      .in("canonical_word_id", ids),
    client.from("teaching_dictionary_current_sense_family_memberships").select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind")
      .in("canonical_word_id", ids),
    loadCurrentPairDeassignments({ client, environmentKey,
      pairs: ids.map(canonicalWordId => ({ canonicalWordId, microSkillKey: skill })) }),
    loadPublishedWritingAssociations(client, environmentKey, ids),
  ]);
  if (analyses.error || links.error) throw new Error("Could not load the published comparative dictionary families.");
  const published = new Set(associations.filter(row => row.microSkillKey === skill &&
    row.relationshipRole === "demonstrates" && row.rowStatus === "active").map(row => row.canonicalWordId));
  return families.flatMap(family => {
    const [base] = family.words;
    let baseMeaning = "";
    let familyKey: string | null = null;
    for (const word of family.words) {
      if (!published.has(word.canonicalWordId) || vetoes.has(canonicalPairKey(word.canonicalWordId, skill))) return [];
      const sense = senses.get(`${word.canonicalWordId}:${skill}`);
      if (sense?.status !== "current" || !sense.pronunciation || !sense.dictationAuthorityId) return [];
      const analysis = analyses.data.find(row => row.canonical_word_id === word.canonicalWordId && row.sense_id === sense.senseId);
      if (!analysis || !Array.isArray(analysis.morphology_parts)) return [];
      const [basePart, suffix] = analysis.morphology_parts;
      const expected = family.transformations.find(change => change.result === word.word);
      if (basePart?.kind !== "base" || basePart.sourceText !== base.word ||
        (word.degree === "base" ? analysis.morphology_parts.length !== 1 || basePart.surfaceText !== base.word
          : !expected || analysis.morphology_parts.length !== 2 || basePart.surfaceText !== expected.stem ||
            suffix?.kind !== "suffix" || suffix.sourceText !== expected.ending || suffix.surfaceText !== expected.ending)) return [];
      const matches = links.data.filter(link => link.canonical_word_id === word.canonicalWordId && link.sense_id === sense.senseId &&
        link.sense_morphology_id === analysis.id && link.component_part_id === basePart.id &&
        link.relationship_kind === (word.degree === "base" ? "free_base" : "regular_inflection"));
      if (matches.length !== 1 || (familyKey && matches[0].family_key !== familyKey)) return [];
      familyKey = matches[0].family_key;
      if (word.degree === "base") baseMeaning = sense.meaning;
    }
    return [{ ...family, meaning: baseMeaning }];
  });
}
