"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";
import { isKnownWordLike } from "@/lib/spelling/lexicon";
import { isKnownWord } from "@/lib/spelling/suggestCorrection";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveCanonicalIntakeRoute } from "@/lib/adle/canonical-intake/route-readiness";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";

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
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
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
    const { data: approvedWord, error: wordError } = await createServiceRoleClient()
      .from("canonical_teaching_dictionary_words").select("id")
      .eq("normalised_word", observed).eq("row_status", "active").limit(1);
    if (wordError) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(wordError.message)}`);
    if (isKnownWordLike(observed) || isKnownWord(observed) || Boolean(approvedWord?.length)) {
      redirect("/admin/no-matching-skill?error=Valid%20words%20must%20use%20the%20context%20route");
    }
  }
  const members = String(formData.get("members") ?? "").split(/[,\n]/).map((word) => word.trim()).filter(Boolean);
  const skillKey = String(formData.get("micro_skill_key") ?? "");
  if (classification === "context" && mode === "existing" && /^D4_HOM_[A-Z0-9_]+$/.test(skillKey)) {
    const db = createServiceRoleClient();
    const skillRead = await db.from("micro_skill_catalog")
      .select("skill_cluster_key").eq("micro_skill_key", skillKey).maybeSingle();
    if (skillRead.error || !skillRead.data)
      redirect("/admin/no-matching-skill?error=Homophone%20skill%20is%20unavailable");
    const route = resolveCanonicalIntakeRoute(skillKey, skillRead.data.skill_cluster_key);
    if (["homophone_contextual_choice", "homophone_word_lab"].includes(route.routeId)) {
      const caseRead = await db.from("spelling_no_matching_skill_queue")
        .select("misspelling,correction").eq("queue_id", id).maybeSingle();
      if (caseRead.error || !caseRead.data)
        redirect("/admin/no-matching-skill?error=Case%20is%20no%20longer%20open");
      const setsRead = await db.from("homophone_contrast_sets")
        .select("set_key,revision").eq("micro_skill_key", skillKey).eq("review_status", "approved");
      if (setsRead.error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(setsRead.error.message)}`);
      const latest = new Map<string, number>();
      for (const set of setsRead.data ?? [])
        latest.set(set.set_key, Math.max(latest.get(set.set_key) ?? 0, set.revision));
      const setKeys = [...latest.keys()];
      const memberRead = setKeys.length ? await db.from("homophone_contrast_set_members")
        .select("set_key,revision,canonical_word_id").in("set_key", setKeys)
        : { data: [], error: null };
      if (memberRead.error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(memberRead.error.message)}`);
      const reviewedMembers = (memberRead.data ?? []).filter((member) =>
        latest.get(member.set_key) === member.revision);
      const wordIds = [...new Set(reviewedMembers.map((member) => member.canonical_word_id))];
      const wordsRead = wordIds.length ? await db.from("canonical_teaching_dictionary_words")
        .select("id,normalised_word").in("id", wordIds) : { data: [], error: null };
      if (wordsRead.error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(wordsRead.error.message)}`);
      const byId = new Map((wordsRead.data ?? []).map((word) => [word.id, word.normalised_word]));
      const normalize = (word: string) => word.trim().toLowerCase().replace(/[’ʼ]/g, "'");
      const selected = new Set(members.map(normalize));
      const observed = normalize(caseRead.data.misspelling);
      const intended = normalize(caseRead.data.correction);
      const completeSet = setKeys.some((setKey) => {
        const group = reviewedMembers.filter((member) => member.set_key === setKey)
          .map((member) => byId.get(member.canonical_word_id)).filter((word): word is string => Boolean(word));
        const expected = new Set(group.map(normalize));
        return group.length >= 2 && expected.size === group.length &&
          expected.has(observed) && expected.has(intended) &&
          selected.size === expected.size && [...selected].every((word) => expected.has(word));
      });
      if (!completeSet)
        redirect("/admin/no-matching-skill?error=Choose%20the%20complete%20approved%20contrast%20set");
    }
  }
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
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
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
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/admin/canonical-mappings");
  redirect("/admin/no-matching-skill?saved=Admin%20case%20deleted");
}

export async function linkAdleContextCatalogCase(formData: FormData) {
  const admin = await requireAdminUser();
  const caseId = formData.get("case_id");
  const skillKey = formData.get("micro_skill_key");
  if (typeof caseId !== "string" || !/^[0-9a-f-]{36}$/i.test(caseId) ||
    typeof skillKey !== "string" || !/^D4_[A-Z0-9_]+$/.test(skillKey)) {
    redirect("/admin/no-matching-skill?error=Invalid%20ADLE%20context%20selection");
  }
  const { error } = await createServiceRoleClient().rpc("link_adle_review_context_catalog_case", {
    p_case_id: caseId, p_micro_skill_key: skillKey, p_admin_user_id: admin.id,
  });
  if (error) redirect(`/admin/no-matching-skill?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/no-matching-skill");
  revalidatePath("/courses/review");
  redirect("/admin/no-matching-skill?saved=ADLE%20context%20pair%20linked");
}
