"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Bind an approved family component to one reviewed meaning of this word. */
export async function reviewSenseFamilyLink(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = field(form, "word_id");
  let failure: string | null = null;
  try {
    const familyKey = field(form, "family_key");
    const senseId = field(form, "sense_id");
    const componentPartId = field(form, "component_part_id");
    const action = field(form, "link_action");
    if (!isUuid(wordId) || !/^[a-z0-9_]+_base_family$/.test(familyKey)
      || !senseId || senseId.length > 200 || !componentPartId || componentPartId.length > 200
      || !["approve", "withdraw"].includes(action))
      throw new Error("SENSE_FAMILY_REVIEW_INCOMPLETE");
    const result = await createServiceRoleClient().rpc("review_teaching_dictionary_sense_family_link", {
      p_request_id: randomUUID(), p_word_id: wordId, p_sense_id: senseId,
      p_family_key: familyKey, p_component_part_id: componentPartId,
      p_action: action, p_actor: actor.id,
      p_source_reference: `Teaching Dictionary sense family ${action}`,
    });
    if (result.error) throw new Error(result.error.message.match(/SENSE_FAMILY_[A-Z_]+/)?.[0]
      ?? "SENSE_FAMILY_REVIEW_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^SENSE_FAMILY_[A-Z_]+$/.test(error.message)
      ? error.message : "SENSE_FAMILY_REVIEW_FAILED";
  }
  redirect(`/admin/teaching-dictionary/${wordId}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}

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
    const senseId = field(form, "sense_id");
    const componentPartId = field(form, "component_part_id");
    if (!isUuid(wordId) || !isUuid(morphologyId) ||
      !/^[a-z0-9_]+_base_family$/.test(familyKey) ||
      !Number.isInteger(revision) || revision < 1 ||
      !["regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"].includes(relationshipKind) ||
      !partOfSpeech || !senseId || !componentPartId ||
      [partOfSpeech, senseId, componentPartId].some((value) => value.length > 1000))
      throw new Error("LEXICAL_FAMILY_REVIEW_INCOMPLETE");
    const requestId = randomUUID();
    const result = await createServiceRoleClient().rpc("review_lexical_base_family_member_for_sense", {
      p_request_id: requestId,
      p_family_key: familyKey,
      p_expected_revision: revision,
      p_word_id: wordId,
      p_morphology_id: morphologyId,
      p_word_part_of_speech: partOfSpeech,
      p_relationship_kind: relationshipKind,
      p_sense_id: senseId,
      p_component_part_id: componentPartId,
      p_source_reference: `Teaching Dictionary lexical family review ${requestId}`,
      p_reviewer: actor.id,
      p_approval_reference: `Teaching Dictionary family approval ${requestId}`,
    });
    if (result.error) throw new Error(result.error.message.match(/(?:LEXICAL_FAMILY|SENSE_FAMILY)_[A-Z_]+/)?.[0]
      ?? "LEXICAL_FAMILY_REVIEW_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^(?:LEXICAL_FAMILY|SENSE_FAMILY)_[A-Z_]+$/.test(error.message)
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
    const baseSenseId = field(form, "base_sense_id");
    const wordSenseId = field(form, "word_sense_id");
    const componentPartId = field(form, "component_part_id");
    const relationship = field(form, "relationship_kind");
    if (![wordId, baseWordId, baseMorphologyId, wordMorphologyId].every(isUuid) ||
      !baseSenseId || !wordSenseId || !componentPartId ||
      !["free_base", "regular_inflection", "irregular_inflection", "derived", "contraction", "historical_relative"].includes(relationship) ||
      [baseSenseId, wordSenseId, componentPartId].some((value) => value.length > 200))
      throw new Error("LEXICAL_FAMILY_CREATE_INCOMPLETE");
    const requestId = randomUUID();
    const result = await createServiceRoleClient().rpc("create_reviewed_lexical_free_base_family_for_sense", {
      p_request_id: requestId,
      p_base_word_id: baseWordId, p_word_id: wordId,
      p_base_morphology_id: baseMorphologyId, p_word_morphology_id: wordMorphologyId,
      p_base_sense_id: baseSenseId, p_word_sense_id: wordSenseId,
      p_component_part_id: componentPartId,
      p_relationship_kind: relationship,
      p_source_reference: `Teaching Dictionary family creation ${requestId}`,
      p_reviewer: actor.id,
      p_approval_reference: `Teaching Dictionary family approval ${requestId}`,
    });
    if (result.error) throw new Error(result.error.message.match(/(?:LEXICAL_FAMILY|SENSE_FAMILY)_[A-Z_]+/)?.[0] ?? "LEXICAL_FAMILY_CREATE_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^(?:LEXICAL_FAMILY|SENSE_FAMILY)_[A-Z_]+$/.test(error.message)
      ? error.message : "LEXICAL_FAMILY_CREATE_FAILED";
  }
  redirect(`/admin/teaching-dictionary/${wordId}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}
