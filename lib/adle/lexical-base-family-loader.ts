import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovedLexicalFamily } from "./lexical-base-family-release";

/** Scoped to the route's reviewed words. No dictionary-wide family scan. */
export async function loadReviewedLexicalFamilies(input: {
  db: SupabaseClient;
  candidateWordIds: readonly string[];
  microSkillKey: string;
  environment: "local" | "staging" | "production";
}): Promise<ApprovedLexicalFamily[]> {
  if (!input.candidateWordIds.length) return [];
  const read = async <T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const result = await query;
    if (result.error) throw new Error(`BASE_FAMILY_LEXICAL_READ_FAILED: ${result.error.message}`);
    return result.data ?? [];
  };
  const touching = await read(input.db.from("canonical_teaching_dictionary_lexical_base_family_members")
    .select("family_key,revision,canonical_word_id").in("canonical_word_id", [...input.candidateWordIds]));
  const keys = [...new Set(touching.map((row) => row.family_key))];
  if (!keys.length) return [];
  const families = await read(input.db.from("canonical_teaching_dictionary_lexical_base_families")
    .select("family_key,revision,base_lemma,base_kind,canonical_base_word_id,base_meaning,semantic_fingerprint")
    .in("family_key", keys).eq("review_status", "approved").order("revision", { ascending: false }));
  const latest = new Map<string, (typeof families)[number]>();
  for (const family of families) if (!latest.has(family.family_key)) latest.set(family.family_key, family);
  if (!latest.size) return [];
  const authorizations = await read(input.db.from("adle_base_word_lexical_family_authorizations")
    .select("family_key,revision,semantic_fingerprint,withdrawn_at")
    .in("family_key", [...latest.keys()]).is("withdrawn_at", null));
  const authorized = new Set(authorizations.filter((approval) => {
    const family = latest.get(approval.family_key);
    return family && family.revision === approval.revision &&
      family.semantic_fingerprint === approval.semantic_fingerprint;
  }).map((approval) => approval.family_key));
  if (!authorized.size) return [];
  const allMembers = (await read(input.db.from("canonical_teaching_dictionary_lexical_base_family_members")
    .select("family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning")
    .in("family_key", [...latest.keys()])))
    .filter((member) => authorized.has(member.family_key) && latest.get(member.family_key)?.revision === member.revision);
  const memberIds = [...new Set(allMembers.map((member) => member.canonical_word_id))];
  const candidateIds = [...new Set(input.candidateWordIds)];
  const [pairs, bands, morphology] = await Promise.all([
    read(input.db.from("adle_reviewed_word_skill_pairs")
      .select("release_id,canonical_word_id,adle_reviewed_word_skill_releases!inner(environment_key)")
      .in("canonical_word_id", candidateIds).eq("micro_skill_key", input.microSkillKey)
      .eq("relationship_role", "demonstrates")
      .eq("adle_reviewed_word_skill_releases.environment_key", input.environment)),
    read(input.db.from("canonical_teaching_dictionary_word_banding")
      .select("canonical_word_id,complexity_level,canonical_teaching_dictionary_banding_versions!inner(is_active)")
      .in("canonical_word_id", memberIds).eq("row_status", "active")
      .eq("canonical_teaching_dictionary_banding_versions.is_active", true)),
    read(input.db.from("canonical_teaching_dictionary_word_morphology")
      .select("id,canonical_word_id,row_status,review_status,analysis_status,word_sum,morphology_parts,morphology_joins,morphology_transformations")
      .in("canonical_word_id", memberIds)),
  ]);
  const releaseIds = [...new Set(pairs.map((pair) => pair.release_id))];
  const withdrawals = releaseIds.length ? await read(input.db.from("adle_reviewed_word_skill_withdrawals")
    .select("release_id").in("release_id", releaseIds)) : [];
  const withdrawn = new Set(withdrawals.map((row) => row.release_id));
  const approvedTargets = new Set(pairs.filter((pair) => !withdrawn.has(pair.release_id))
    .map((pair) => pair.canonical_word_id));
  const bandByWord = new Map(bands.map((row) => [row.canonical_word_id, row.complexity_level]));
  const morphologyById = new Map(morphology.map((row) => [row.id, row]));
  const activeMorphologyByWord = new Map(morphology.filter((row) => row.row_status === "active")
    .map((row) => [row.canonical_word_id, row]));
  return [...latest.values()].filter((family) => authorized.has(family.family_key) &&
    family.base_kind === "free_base" && family.canonical_base_word_id &&
    touching.some((row) => row.family_key === family.family_key && row.revision === family.revision))
    .map((family) => ({
      familyKey: family.family_key, revision: family.revision, baseLemma: family.base_lemma,
      baseKind: family.base_kind as "free_base", baseWordId: family.canonical_base_word_id,
      baseMeaning: family.base_meaning, semanticFingerprint: family.semantic_fingerprint ?? "",
      members: allMembers.filter((member) => member.family_key === family.family_key).map((member) => {
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
          routeContentReviewed: candidateIds.includes(member.canonical_word_id),
        };
      }),
    }));
}
