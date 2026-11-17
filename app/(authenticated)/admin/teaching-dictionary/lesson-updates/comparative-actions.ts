"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isComparativeReviewSkill } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { loadComparativeReview, verifyComparativePublication } from "@/lib/teaching-dictionary-manager/comparative-review";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { saveBulkSkillApprovals } from "../bulk-assign/actions";

export async function publishComparativeSets(form: FormData) {
  await requireAdminUser();
  const skill = form.get("skill");
  if (!isComparativeReviewSkill(skill)) redirect("/admin/teaching-dictionary/lesson-updates");
  const path = `/admin/teaching-dictionary/lesson-updates?skill=${skill}&view=preview`;
  let count = 0;
  try {
    const db = createServiceRoleClient();
    const preview = await loadComparativeReview(db, skill);
    const selected = [...new Set(form.getAll("family_key").map(String))];
    if (!selected.length || preview.fingerprint !== form.get("fingerprint"))
      throw new Error("The preview changed. Review the refreshed adjective sets before publishing.");
    for (const key of selected) {
      const row = preview.families.find(item => item.family.familyKey === key);
      if (!row || row.blockers.length) throw new Error(row?.blockers[0] ?? "Choose a complete reviewed adjective set.");
    }
    // Each three-form set is one governed atomic approval. A retry can
    // complete any remaining sets after an interrupted batch.
    for (const key of selected) {
      const row = preview.families.find(item => item.family.familyKey === key)!;
      const result = await saveBulkSkillApprovals({
        microSkillKey: skill, applyWordIds: row.family.words.map(word => word.canonicalWordId),
        senseIds: row.senses, excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
        requestId: randomUUID(), sourceKind: "teaching_dictionary_import", workbookReadback: true,
      });
      if (!result.ok) throw new Error(result.blocked[0]?.reason ?? result.error ?? "The adjective set could not publish.");
      count++;
    }
    await verifyComparativePublication(db, skill, selected);
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
  } catch (error) {
    revalidatePath("/admin/teaching-dictionary/lesson-updates");
    redirect(`${path}&error=${encodeURIComponent(error instanceof Error ? error.message : "Could not publish the adjective sets.")}`);
  }
  revalidatePath("/admin/teaching-dictionary");
  revalidatePath("/admin/teaching-dictionary/lesson-updates");
  redirect(`${path}&published=${count}`);
}
