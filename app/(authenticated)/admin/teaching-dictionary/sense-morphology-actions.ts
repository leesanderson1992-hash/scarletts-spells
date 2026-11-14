"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

export async function findSenseFamilies(forms: string[]) {
  await requireAdminUser();
  const bases = [...new Set(forms.map(form => form.trim().toLocaleLowerCase("en-GB")).filter(Boolean))];
  if (!bases.length || bases.length > 12 || bases.some(base => base.length > 120)) return [];
  const result = await createServiceRoleClient().from("canonical_teaching_dictionary_lexical_base_families")
    .select("family_key,revision,base_lemma,base_kind,base_meaning,canonical_base_word_id,review_status")
    .in("base_lemma", bases).order("revision", { ascending: false });
  if (result.error) throw new Error("Could not load matching families.");
  const seen = new Set<string>();
  return result.data.filter(family => {
    if (seen.has(family.family_key)) return false;
    seen.add(family.family_key);
    return family.review_status === "approved";
  });
}

export async function reviewSenseMorphology(input: { wordId: string; senseId: string;
  action: "approve" | "withdraw"; parts: unknown[]; joins: unknown[];
  transformations: unknown[]; wordSum: string }): Promise<{ ok: boolean; error?: string; morphologyId?: string }> {
  const actor = await requireAdminUser();
  if (!isUuid(input.wordId) || !input.senseId || input.senseId.length > 200
    || !["approve", "withdraw"].includes(input.action)
    || !Array.isArray(input.parts) || !Array.isArray(input.joins)
    || !Array.isArray(input.transformations) || typeof input.wordSum !== "string")
    return { ok: false, error: "Choose a reviewed meaning and complete its word parts." };
  const db = createServiceRoleClient();
  const facts = {
    p_request_id: randomUUID(), p_word_id: input.wordId, p_sense_id: input.senseId,
    p_parts: input.parts, p_joins: input.joins, p_transformations: input.transformations,
    p_word_sum: input.wordSum, p_actor: actor.id,
  };
  const result = input.action === "approve"
    ? await db.rpc("approve_teaching_dictionary_word_parts", facts)
    : await db.rpc("review_teaching_dictionary_sense_morphology", {
      ...facts, p_action: input.action, p_source_reference: "Teaching Dictionary Word parts withdrawal",
    });
  if (result.error) return { ok: false, error: result.error.message.match(/SENSE_MORPHOLOGY_[A-Z_]+/)?.[0]
    ?.replaceAll("_", " ").toLowerCase() ?? "The word parts could not be approved." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${input.wordId}`);
  return { ok: true, morphologyId: result.data ?? undefined };
}

export async function reviewSenseFamilyMembership(input: { wordId: string; senseId: string;
  morphologyId: string; familyKey: string; componentPartId: string;
  relationshipKind: string; action: "approve" | "withdraw" }): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminUser();
  if (!isUuid(input.wordId) || !isUuid(input.morphologyId) || !input.senseId
    || !/^[a-z0-9_]+_base_family$/.test(input.familyKey)
    || !input.componentPartId || !["approve", "withdraw"].includes(input.action)
    || !["free_base", "regular_inflection", "irregular_inflection", "derived",
      "contraction", "historical_relative"].includes(input.relationshipKind))
    return { ok: false, error: "Choose the matching family, part and relationship." };
  const result = await createServiceRoleClient().rpc("review_teaching_dictionary_sense_family_membership", {
    p_request_id: randomUUID(), p_word_id: input.wordId, p_sense_id: input.senseId,
    p_sense_morphology_id: input.morphologyId, p_family_key: input.familyKey,
    p_component_part_id: input.componentPartId, p_relationship_kind: input.relationshipKind,
    p_action: input.action, p_actor: actor.id,
    p_source_reference: `Teaching Dictionary meaning family ${input.action}`,
  });
  if (result.error) return { ok: false, error: result.error.message.match(/SENSE_FAMILY_[A-Z_]+/)?.[0]
    ?.replaceAll("_", " ").toLowerCase() ?? "The family link could not be approved." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${input.wordId}`);
  return { ok: true };
}

export async function findReviewedFamilyBase(form: string) {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const word = await db.from("canonical_teaching_dictionary_words").select("id,display_word")
    .eq("normalised_word", form.trim().toLocaleLowerCase("en-GB")).eq("dialect_code", "en-GB")
    .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").maybeSingle();
  if (word.error || !word.data) return null;
  const reviewed = await db.from("teaching_dictionary_reviewed_sense_sets").select("sense_set")
    .eq("canonical_word_id", word.data.id).maybeSingle();
  if (reviewed.error) throw new Error("Could not load the base word’s meanings.");
  const set = reviewed.data?.sense_set as import("@/lib/teaching-dictionary-manager/senses").DictionarySenseSet | undefined;
  return { id: word.data.id, word: word.data.display_word, senses: (set?.senses ?? [])
    .filter(sense => sense.definition.trim() && sense.partOfSpeech && sense.partOfSpeech !== "root")
    .map(({ id, definition, partOfSpeech }) => ({ id, definition, partOfSpeech })) };
}

/** A reviewed whole-word free base can anchor a family for this exact meaning. */
export async function createSenseFreeBaseFamily(input: { wordId: string; senseId: string;
  componentPartId: string; baseWordId?: string; baseSenseId?: string; relationshipKind?: string }): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminUser();
  if (!isUuid(input.wordId) || !input.senseId || input.senseId.length > 200
    || !input.componentPartId || input.componentPartId.length > 200)
    return { ok: false, error: "Choose a reviewed whole-word base and meaning." };
  const db = createServiceRoleClient();
  const baseWordId = input.baseWordId ?? input.wordId;
  const baseSenseId = input.baseSenseId ?? input.senseId;
  if (!isUuid(baseWordId) || !baseSenseId || baseSenseId.length > 200)
    return { ok: false, error: "Choose a reviewed base meaning." };
  if (baseWordId !== input.wordId) {
    const current = await db.from("teaching_dictionary_current_sense_morphology").select("id")
      .eq("canonical_word_id", baseWordId).eq("sense_id", baseSenseId).maybeSingle();
    if (current.error || !current.data)
      return { ok: false, error: "Open the base entry and approve its whole-word parts before creating the family." };
  }
  const result = await db.rpc("create_reviewed_free_base_family_from_sense", {
    p_request_id: randomUUID(), p_base_word_id: baseWordId, p_base_sense_id: baseSenseId,
    p_word_id: input.wordId, p_word_sense_id: input.senseId,
    p_component_part_id: input.componentPartId, p_relationship_kind: baseWordId === input.wordId ? "free_base" : input.relationshipKind ?? "derived",
    p_reviewer: actor.id,
    p_source_reference: "Teaching Dictionary reviewed meaning free-base family",
  });
  if (result.error) return { ok: false, error: result.error.message.match(/SENSE_FREE_BASE_[A-Z_]+/)?.[0]
    ?.replaceAll("_", " ").toLowerCase() ?? "The family could not be created." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${input.wordId}`);
  return { ok: true };
}

export async function registerReviewedAffixMeaning(kind: "prefix" | "suffix", input: string, gloss: string):
  Promise<{ ok: true; form: string; meaning: string } | { ok: false; error: string }> {
  const actor = await requireAdminUser();
  const form = input.trim().toLocaleLowerCase("en-GB").replace(/^-+|-+$/g, "");
  const meaning = gloss.trim().replace(/\s+/g, " ");
  if (!["prefix", "suffix"].includes(kind) || !/^[\p{L}]{1,30}$/u.test(form) || !meaning || meaning.length > 300)
    return { ok: false, error: "Enter the affix spelling and a short meaning." };
  const db = createServiceRoleClient();
  const result = await db.rpc("register_teaching_dictionary_affix_meaning", {
    p_kind: kind, p_form: form, p_gloss: meaning, p_actor: actor.id,
  });
  if (result.error || !result.data)
    return { ok: false, error: "The affix meaning could not be saved. Try again." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  return { ok: true, form, meaning: result.data };
}
