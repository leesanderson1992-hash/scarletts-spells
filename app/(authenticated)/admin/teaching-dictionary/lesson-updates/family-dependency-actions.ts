"use server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { recheckWaitingFamilyWords, familyMeaningKey } from "@/lib/teaching-dictionary-manager/family-dependencies";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

export async function resolveSavedFamilyReview(form: FormData) {
  await requireAdminUser();
  const id = String(form.get("dependency_id") ?? ""), environment = resolveAdleRouteActivationEnvironment();
  if (!isUuid(id) || (environment !== "staging" && environment !== "production")) throw new Error("Choose a saved family review.");
  const db = createServiceRoleClient();
  const row = await db.from("teaching_dictionary_family_dependencies").select("*").eq("id", id).eq("environment_key", environment).single();
  if (row.error) throw new Error("The saved family review could not be found.");
  const familyKey = String(form.get("family_key") ?? "");
  if (familyKey) {
    const family = await db.from("teaching_dictionary_families_with_current_meaning").select("base_lemma,base_kind,review_status")
      .eq("family_key", familyKey).order("revision", { ascending: false }).limit(1).single();
    if (family.error || family.data.review_status !== "approved" || family.data.base_lemma !== row.data.base_form || family.data.base_kind !== row.data.base_kind)
      throw new Error("Choose an approved family matching this base/root.");
    const matching = await db.from("teaching_dictionary_family_dependencies").select("id,expected_meaning")
      .eq("environment_key", environment).eq("base_form", row.data.base_form).eq("base_kind", row.data.base_kind).neq("status", "ready");
    if (matching.error) throw new Error("Could not load matching saved reviews.");
    const ids = matching.data.filter(item => familyMeaningKey(item.expected_meaning) === familyMeaningKey(row.data.expected_meaning)).map(item => item.id);
    const update = await db.from("teaching_dictionary_family_dependencies").update({ confirmed_family_key: familyKey,
      status: "waiting", lease_until: null, updated_at: new Date().toISOString() }).in("id", ids);
    if (update.error) throw new Error("Could not save this family choice.");
  }
  await recheckWaitingFamilyWords(db, environment, row.data.base_form, 20);
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  revalidatePath("/admin/recommend-dictionary-entries");
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  redirect(`/admin/teaching-dictionary/lesson-updates?skill=${encodeURIComponent(row.data.micro_skill_key)}&view=workbook`);
}
