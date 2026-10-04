"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { isKnownWordLike } from "@/lib/spelling/lexicon";
import { isKnownWord } from "@/lib/spelling/suggestCorrection";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function returnToCanonicalResolver(formData: FormData) {
  const admin = await requireAdminUser();
  const itemId = formData.get("item_id");
  if (typeof itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    redirect("/admin/no-matching-skill?error=Invalid%20spelling%20pair");
  }
  const { error } = await createServiceRoleClient().rpc("return_no_matching_skill_to_resolution_admin", {
    p_item_id: itemId,
    p_admin_user_id: admin.id,
  });
  if (error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/admin/canonical-mappings");
  redirect("/admin/no-matching-skill?saved=Returned%20to%20Canonical%20Misspelling%20Resolver");
}

function queueId(formData: FormData) {
  const value = formData.get("queue_id");
  if (typeof value !== "string" || !/^(resolution|catalog|context):[0-9a-f-]{36}$/i.test(value)) {
    redirect("/admin/no-matching-skill?error=Invalid%20admin%20case");
  }
  return value;
}

export async function createOrLinkMicroSkill(formData: FormData) {
  const admin = await requireAdminUser();
  const id = queueId(formData);
  const mode = formData.get("mode");
  const classification = formData.get("classification");
  if (classification === "spelling") {
    const { data: queued, error: queueError } = await createServiceRoleClient()
      .from("spelling_no_matching_skill_queue").select("misspelling")
      .eq("queue_id", id).maybeSingle();
    if (queueError || !queued) redirect("/admin/no-matching-skill?error=Case%20is%20no%20longer%20open");
    const observed = queued.misspelling.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'");
    if (isKnownWordLike(observed) || isKnownWord(observed)) {
      redirect("/admin/no-matching-skill?error=Valid%20words%20must%20use%20the%20context%20route");
    }
  }
  const members = String(formData.get("members") ?? "").split(/[,\n]/).map((word) => word.trim()).filter(Boolean);
  const payload = {
    mode, classification,
    micro_skill_key: formData.get("micro_skill_key"),
    family_key: formData.get("family_key"),
    cluster_key: formData.get("cluster_key"),
    new_family_name: formData.get("new_family_name") || undefined,
    new_cluster_name: formData.get("new_cluster_name") || undefined,
    display_name: formData.get("display_name"),
    practice_route: formData.get("practice_route"),
    members,
  };
  const { data, error } = await createServiceRoleClient().rpc("resolve_no_matching_skill_admin", {
    p_queue_id: id, p_admin_user_id: admin.id, p_admin_email: admin.email ?? null, p_payload: payload,
  });
  if (error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/admin/canonical-mappings");
  revalidatePath("/courses/review");
  redirect(`/admin/no-matching-skill?saved=Micro%20skill%20linked&skill=${encodeURIComponent(String(data))}`);
}

export async function deleteNoMatchingSkillCase(formData: FormData) {
  const admin = await requireAdminUser();
  const id = queueId(formData);
  if (formData.get("confirm_delete") !== "DELETE") {
    redirect("/admin/no-matching-skill?error=Confirm%20deletion%20first");
  }
  const { error } = await createServiceRoleClient().rpc("delete_no_matching_skill_admin", {
    p_queue_id: id, p_admin_user_id: admin.id,
  });
  if (error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/admin/canonical-mappings");
  redirect("/admin/no-matching-skill?saved=Admin%20case%20deleted");
}
