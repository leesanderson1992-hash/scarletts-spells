import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovedLexicalFamily } from "./lexical-base-family-release";

type LexicalMorphology = {
  word_sum: string;
  morphology_parts: unknown[];
  morphology_joins: unknown[];
  morphology_transformations: unknown[];
};
type LexicalRead = {
  families: Array<{
    family_key: string;
    revision: number;
    base_lemma: string;
    canonical_base_word_id: string;
    base_meaning: string;
    semantic_fingerprint: string;
  }>;
  members: Array<LexicalMorphology & {
    family_key: string;
    canonical_word_id: string;
    word_part_of_speech: string;
    relationship_kind: string;
    canonical_morphology_id: string;
    intended_meaning: string;
  }>;
  bands: Array<{ canonical_word_id: string; complexity_level: number }>;
  morphology: Array<LexicalMorphology & {
    id: string;
    canonical_word_id: string;
    row_status: string;
    review_status: string;
    analysis_status: string;
  }>;
  approved_targets: string[];
};

/** Scoped to the route's reviewed words. No dictionary-wide family scan. */
export async function loadReviewedLexicalFamilies(input: {
  db: SupabaseClient;
  candidateWordIds: readonly string[];
  microSkillKey: string;
  environment: "local" | "staging" | "production";
}): Promise<ApprovedLexicalFamily[]> {
  if (!input.candidateWordIds.length) return [];
  const candidateIds = new Set(input.candidateWordIds);
  const { data, error } = await input.db.rpc("teaching_dictionary_lexical_preflight_read", {
    p_candidate_words: [...candidateIds],
    p_micro_skill_key: input.microSkillKey,
    p_environment: input.environment,
  });
  if (error || !data) throw new Error(`BASE_FAMILY_LEXICAL_READ_FAILED: ${error?.message ?? "No read snapshot"}`);
  const { families, members, bands, morphology, approved_targets } = data as LexicalRead;
  const approvedTargets = new Set(approved_targets);
  const bandByWord = new Map(bands.map(row => [row.canonical_word_id, row.complexity_level]));
  const morphologyById = new Map(morphology.map(row => [row.id, row]));
  const activeMorphologyByWord = new Map(morphology.filter(row => row.row_status === "active")
    .map(row => [row.canonical_word_id, row]));
  const membersByFamily = Map.groupBy(members, row => row.family_key);
  return families.map(family => ({
    familyKey: family.family_key, revision: family.revision, baseLemma: family.base_lemma,
    baseKind: "free_base", baseWordId: family.canonical_base_word_id,
    baseMeaning: family.base_meaning, semanticFingerprint: family.semantic_fingerprint,
    members: (membersByFamily.get(family.family_key) ?? []).map(member => {
      const source = morphologyById.get(member.canonical_morphology_id);
      const current = activeMorphologyByWord.get(member.canonical_word_id);
      if (!source || !current || source.canonical_word_id !== member.canonical_word_id ||
        source.review_status !== "approved_for_first_exposure" || source.analysis_status !== "approved" ||
        source.word_sum !== member.word_sum ||
        JSON.stringify(source.morphology_parts) !== JSON.stringify(member.morphology_parts) ||
        JSON.stringify(source.morphology_joins) !== JSON.stringify(member.morphology_joins) ||
        JSON.stringify(source.morphology_transformations) !== JSON.stringify(member.morphology_transformations) ||
        current.review_status !== "approved_for_first_exposure" || current.analysis_status !== "approved" ||
        current.word_sum !== member.word_sum ||
        JSON.stringify(current.morphology_parts) !== JSON.stringify(member.morphology_parts) ||
        JSON.stringify(current.morphology_joins) !== JSON.stringify(member.morphology_joins) ||
        JSON.stringify(current.morphology_transformations) !== JSON.stringify(member.morphology_transformations))
        throw new Error(`Approved lexical morphology changed: ${family.family_key}`);
      return {
        canonicalWordId: member.canonical_word_id, wordPartOfSpeech: member.word_part_of_speech,
        relationshipKind: member.relationship_kind, canonicalMorphologyId: member.canonical_morphology_id,
        wordSum: member.word_sum, morphologyParts: member.morphology_parts,
        morphologyJoins: member.morphology_joins, morphologyTransformations: member.morphology_transformations,
        intendedMeaning: member.intended_meaning, complexityLevel: bandByWord.get(member.canonical_word_id) ?? null,
        demonstratesSkill: approvedTargets.has(member.canonical_word_id),
        routeContentReviewed: candidateIds.has(member.canonical_word_id),
      };
    }),
  }));
}
