"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Human approval of one lexical membership creates a new immutable revision.
 * It does not approve an ADLE word–skill relationship or activate a route. */
export async function reviewLexicalFamilyMember(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = field(form, "word_id");
  let failure: string | null = null;
  try {
    const familyKey = field(form, "family_key");
    const morphologyId = field(form, "morphology_id");
    const revision = Number(field(form, "expected_revision"));
    const partOfSpeech = field(form, "word_part_of_speech");
    const relationshipKind = field(form, "relationship_kind");
    const intendedMeaning = field(form, "intended_meaning");
    if (!isUuid(wordId) || !isUuid(morphologyId) ||
      !/^[a-z0-9_]+_base_family$/.test(familyKey) ||
      !Number.isInteger(revision) || revision < 1 ||
      !["regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"].includes(relationshipKind) ||
      !partOfSpeech || !intendedMeaning ||
      [partOfSpeech, intendedMeaning].some((value) => value.length > 1000))
      throw new Error("LEXICAL_FAMILY_REVIEW_INCOMPLETE");
    const requestId = randomUUID();
    const result = await createServiceRoleClient().rpc("review_lexical_base_family_member_revision", {
      p_family_key: familyKey,
      p_expected_revision: revision,
      p_word_id: wordId,
      p_morphology_id: morphologyId,
      p_word_part_of_speech: partOfSpeech,
      p_relationship_kind: relationshipKind,
      p_intended_meaning: intendedMeaning,
      p_source_reference: `Teaching Dictionary lexical family review ${requestId}`,
      p_reviewer: actor.id,
      p_approval_reference: `Teaching Dictionary family approval ${requestId}`,
    });
    if (result.error) throw new Error(result.error.message.match(/LEXICAL_FAMILY_[A-Z_]+/)?.[0] ?? "LEXICAL_FAMILY_REVIEW_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^LEXICAL_FAMILY_[A-Z_]+$/.test(error.message)
      ? error.message : "LEXICAL_FAMILY_REVIEW_FAILED";
  }
  redirect(`/admin/teaching-dictionary/${wordId}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}

/** Approve a new free-base dictionary family from reviewed canonical facts. */
export async function createLexicalFreeBaseFamily(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = field(form, "word_id");
  let failure: string | null = null;
  try {
    const baseWordId = field(form, "base_word_id");
    const baseMorphologyId = field(form, "base_morphology_id");
    const wordMorphologyId = field(form, "word_morphology_id");
    const basePos = field(form, "base_part_of_speech");
    const wordPos = field(form, "word_part_of_speech");
    const relationship = field(form, "relationship_kind");
    const baseMeaning = field(form, "base_meaning");
    const wordMeaning = field(form, "word_meaning");
    if (![wordId, baseWordId, baseMorphologyId, wordMorphologyId].every(isUuid) ||
      !basePos || !wordPos || !baseMeaning || !wordMeaning ||
      !["free_base", "regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"].includes(relationship) ||
      [basePos, wordPos, baseMeaning, wordMeaning].some((value) => value.length > 1000))
      throw new Error("LEXICAL_FAMILY_CREATE_INCOMPLETE");
    const requestId = randomUUID();
    const result = await createServiceRoleClient().rpc("create_reviewed_lexical_free_base_family", {
      p_base_word_id: baseWordId, p_word_id: wordId,
      p_base_morphology_id: baseMorphologyId, p_word_morphology_id: wordMorphologyId,
      p_base_part_of_speech: basePos, p_word_part_of_speech: wordPos,
      p_relationship_kind: relationship, p_base_meaning: baseMeaning,
      p_word_meaning: wordMeaning,
      p_source_reference: `Teaching Dictionary family creation ${requestId}`,
      p_reviewer: actor.id,
      p_approval_reference: `Teaching Dictionary family approval ${requestId}`,
    });
    if (result.error) throw new Error(result.error.message.match(/LEXICAL_FAMILY_[A-Z_]+/)?.[0] ?? "LEXICAL_FAMILY_CREATE_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^LEXICAL_FAMILY_[A-Z_]+$/.test(error.message)
      ? error.message : "LEXICAL_FAMILY_CREATE_FAILED";
  }
  redirect(`/admin/teaching-dictionary/${wordId}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}
