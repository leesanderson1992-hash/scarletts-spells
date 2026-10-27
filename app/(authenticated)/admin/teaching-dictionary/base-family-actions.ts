"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { BASE_WORD_SKILLS } from "@/lib/teaching-dictionary-manager/base-family-candidates";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { exactSkillRelease } from "@/lib/teaching-dictionary-manager/exact-base-skill-review";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const pathFor = (wordId: string) => `/admin/teaching-dictionary/${wordId}#base-family-review`;

function parseArray(raw: string, label: string): unknown[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return value;
  } catch { /* Converted to a stable form error below. */ }
  throw new Error(`BASE_FAMILY_${label}_INVALID`);
}

/** One review submission approves exact route applicability and, when needed,
 * its separate word/skill evidence release. It does not activate ADLE. */
export async function reviewBaseFamilyMember(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = field(form, "word_id");
  let failure: string | null = null;
  try {
    const requestId = field(form, "request_id");
    const legacyFamilyId = field(form, "legacy_family_id");
    const requestedBaseId = field(form, "base_word_id");
    const skillKey = field(form, "skill_key");
    if (![wordId, requestId].every(isUuid) || (legacyFamilyId && !isUuid(legacyFamilyId)) ||
        (requestedBaseId && !isUuid(requestedBaseId)) ||
        !BASE_WORD_SKILLS.some((skill) => skill === skillKey)) throw new Error("BASE_FAMILY_REVIEW_IDENTITY_INVALID");
    const db = createServiceRoleClient();
    let baseWordId = requestedBaseId;
    let baseMeaning = field(form, "base_meaning");
    if (legacyFamilyId) {
      const family = await db.from("canonical_teaching_dictionary_base_word_families")
        .select("base_word_id,base_meaning").eq("id", legacyFamilyId).single();
      if (family.error) throw new Error("BASE_FAMILY_REVIEW_FAMILY_MISSING");
      baseWordId = family.data.base_word_id;
      baseMeaning = family.data.base_meaning;
    }
    if (!isUuid(baseWordId)) throw new Error("BASE_FAMILY_REVIEW_BASE_MISSING");
    const environment = resolveAdleRouteActivationEnvironment();
    if (!environment) throw new Error("BASE_FAMILY_ENVIRONMENT_UNSET");
    const parts = parseArray(field(form, "parts_json"), "PARTS");
    const joins = parseArray(field(form, "joins_json"), "JOINS");
    const transformations = parseArray(field(form, "transformations_json") || "[]", "TRANSFORMATIONS");
    const morphologyId = field(form, "morphology_id");
    if (morphologyId && !isUuid(morphologyId)) throw new Error("BASE_FAMILY_MORPHOLOGY_SOURCE_INVALID");
    const words = await db.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word,display_word,dialect_code,row_status,review_status")
      .in("id", [baseWordId, wordId]);
    if (words.error || words.data?.length !== new Set([baseWordId, wordId]).size)
      throw new Error("BASE_FAMILY_WORD_INVALID");
    const base = words.data.find((item) => item.id === baseWordId);
    const member = words.data.find((item) => item.id === wordId);
    if (!base || !member || base.dialect_code !== member.dialect_code ||
      [base, member].some((item) => item.row_status !== "active" || item.review_status !== "approved_for_first_exposure"))
      throw new Error("BASE_FAMILY_WORD_INVALID");
    if (!legacyFamilyId) {
      const existingFamily = await db.from("canonical_teaching_dictionary_base_word_families")
        .select("id").eq("base_word_id", baseWordId).eq("base_meaning", baseMeaning)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").limit(1);
      if (existingFamily.error) throw new Error("BASE_FAMILY_REVIEW_FAMILY_READ_FAILED");
      if (existingFamily.data?.length) throw new Error("BASE_FAMILY_EXISTING_FAMILY_USE_REQUIRED");
    }
    const records = parts.filter((part): part is Record<string, unknown> =>
      Boolean(part) && typeof part === "object" && !Array.isArray(part));
    if (records.length !== parts.length || records.map((part) => String(part.surfaceText ?? "")).join("") !== member.display_word ||
      !records.some((part) => part.kind === "base" && String(part.sourceText ?? "").toLowerCase() === base.normalised_word) ||
      !field(form, "word_sum") || !field(form, "child_meaning") || !baseMeaning || !field(form, "review_note"))
      throw new Error("BASE_FAMILY_MORPHOLOGY_INVALID");
    if (morphologyId) {
      const source = await db.from("canonical_teaching_dictionary_word_morphology")
        .select("canonical_word_id,morphology_parts,morphology_joins,word_sum,analysis_status,review_status,row_status")
        .eq("id", morphologyId).single();
      if (source.error || source.data.canonical_word_id !== wordId || source.data.analysis_status !== "approved" ||
        source.data.review_status !== "approved_for_first_exposure" || source.data.row_status !== "active" ||
        JSON.stringify(source.data.morphology_parts) !== JSON.stringify(parts) ||
        JSON.stringify(source.data.morphology_joins) !== JSON.stringify(joins) ||
        source.data.word_sum !== field(form, "word_sum"))
        throw new Error("BASE_FAMILY_MORPHOLOGY_SOURCE_INVALID");
    }
    const releaseId = await exactSkillRelease(db, environment, wordId, skillKey, actor.id, requestId);
    const reviewed = await db.rpc("review_teaching_dictionary_base_family_member", {
      p_request_id: requestId, p_base_word_id: baseWordId, p_word_id: wordId,
      p_legacy_family_id: legacyFamilyId || null, p_base_meaning: baseMeaning,
      p_environment: environment, p_skill_key: skillKey, p_word_sum: field(form, "word_sum"),
      p_parts: parts, p_joins: joins, p_transformations: transformations,
      p_child_meaning: field(form, "child_meaning"),
      p_morphology_id: morphologyId || null,
      p_word_skill_release_id: releaseId, p_review_note: field(form, "review_note"), p_actor: actor.id,
    });
    if (reviewed.error) throw new Error(reviewed.error.message.includes("BASE_FAMILY_")
      ? reviewed.error.message.match(/BASE_FAMILY_[A-Z_]+/)?.[0] ?? "BASE_FAMILY_REVIEW_FAILED" : "BASE_FAMILY_REVIEW_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^BASE_FAMILY_[A-Z_]+$/.test(error.message)
      ? error.message : "BASE_FAMILY_REVIEW_FAILED";
  }
  redirect(`${pathFor(wordId).replace("#base-family-review", "")}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}

export async function withdrawBaseFamilyMember(form: FormData) {
  const actor = await requireAdminUser();
  const wordId = field(form, "word_id");
  const reviewId = field(form, "review_id");
  let failure: string | null = null;
  try {
    if (!isUuid(wordId) || !isUuid(reviewId)) throw new Error("BASE_FAMILY_WITHDRAWAL_INVALID");
    const db = createServiceRoleClient();
    const review = await db.from("teaching_dictionary_base_family_member_reviews")
      .select("canonical_word_id").eq("id", reviewId).single();
    if (review.error || review.data.canonical_word_id !== wordId) throw new Error("BASE_FAMILY_WITHDRAWAL_INVALID");
    const result = await db.rpc("withdraw_teaching_dictionary_base_family_member", {
      p_review_id: reviewId, p_reason: field(form, "reason"), p_actor: actor.id,
    });
    if (result.error) throw new Error("BASE_FAMILY_WITHDRAWAL_FAILED");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    revalidatePath(`/admin/teaching-dictionary/${wordId}`);
  } catch (error) {
    failure = error instanceof Error && /^BASE_FAMILY_[A-Z_]+$/.test(error.message)
      ? error.message : "BASE_FAMILY_WITHDRAWAL_FAILED";
  }
  redirect(`/admin/teaching-dictionary/${wordId}${failure ? `?family_error=${failure}` : ""}#base-family-review`);
}
