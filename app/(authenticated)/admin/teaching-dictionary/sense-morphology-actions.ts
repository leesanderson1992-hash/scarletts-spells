"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

export async function reviewSenseMorphology(input: { wordId: string; senseId: string;
  action: "approve" | "withdraw"; parts: unknown[]; joins: unknown[];
  transformations: unknown[]; wordSum: string }): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminUser();
  if (!isUuid(input.wordId) || !input.senseId || input.senseId.length > 200
    || !["approve", "withdraw"].includes(input.action)
    || !Array.isArray(input.parts) || !Array.isArray(input.joins)
    || !Array.isArray(input.transformations) || typeof input.wordSum !== "string")
    return { ok: false, error: "Choose a reviewed meaning and complete its word parts." };
  const result = await createServiceRoleClient().rpc("review_teaching_dictionary_sense_morphology", {
    p_request_id: randomUUID(), p_word_id: input.wordId, p_sense_id: input.senseId,
    p_action: input.action, p_parts: input.parts, p_joins: input.joins,
    p_transformations: input.transformations, p_word_sum: input.wordSum,
    p_actor: actor.id, p_source_reference: `Teaching Dictionary meaning morphology ${input.action}`,
  });
  if (result.error) return { ok: false, error: result.error.message.match(/SENSE_MORPHOLOGY_[A-Z_]+/)?.[0]
    ?.replaceAll("_", " ").toLowerCase() ?? "The word parts could not be approved." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${input.wordId}`);
  return { ok: true };
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
