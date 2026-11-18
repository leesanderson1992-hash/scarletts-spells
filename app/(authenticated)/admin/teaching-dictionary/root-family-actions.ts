"use server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { updateTag, revalidatePath } from "next/cache";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { scheduleFamilyDependencyRecheck } from "@/lib/teaching-dictionary-manager/family-dependency-scheduling";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { redirect } from "next/navigation";
export async function approveRootFamily(input: { wordId: string; senseId: string; origin: string;
  pronunciationApplicability: string; ipa: string }): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminUser();
  if (!isUuid(input.wordId) || !input.senseId || !input.origin.trim() || input.origin.length > 120
    || !["reviewed", "not_applicable"].includes(input.pronunciationApplicability) || input.ipa.length > 200)
    return { ok: false, error: "Choose the reviewed root entry, origin and pronunciation applicability." };
  const result = await createServiceRoleClient().rpc("create_reviewed_root_family_from_entry", {
    p_word: input.wordId, p_sense: input.senseId, p_origin: input.origin.trim(),
    p_pronunciation_applicability: input.pronunciationApplicability,
    p_ipa: input.pronunciationApplicability === "not_applicable" ? null : input.ipa.trim(), p_actor: actor.id,
  });
  if (result.error) return { ok: false, error: "Approve this bound-root meaning and its single root part first. Supply reviewed origin and pronunciation details." };
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath(`/admin/teaching-dictionary/${input.wordId}`);
  revalidatePath("/admin/recommend-dictionary-entries");
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  scheduleFamilyDependencyRecheck(input.wordId);
  return { ok: true };
}

export async function createRecommendedRootEntry(form: FormData) {
  const actor = await requireAdminUser();
  const root = String(form.get("root") ?? "").trim().toLocaleLowerCase("en-GB");
  const definition = String(form.get("definition") ?? "").trim(), origin = String(form.get("origin") ?? "").trim();
  if (!/^[\p{L}]{1,100}$/u.test(root) || !definition || definition.length > 2000 || !["Latin", "Greek"].includes(origin))
    throw new Error("Choose the reviewed root meaning and origin.");
  const created = await createServiceRoleClient().rpc("create_recommended_root_support_entry", {
    p_form: root, p_definition: definition, p_origin: origin, p_actor: actor.id,
  });
  if (created.error || typeof created.data !== "string")
    redirect(`/admin/recommend-dictionary-entries?q=${encodeURIComponent(root)}&family_error=Root_entry_needs_review_or_already_exists`);
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath("/admin/recommend-dictionary-entries");
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  scheduleFamilyDependencyRecheck(created.data);
  redirect(`/admin/teaching-dictionary/${created.data}`);
}
