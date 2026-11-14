"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { ABLE_IBLE_ROUTE } from "@/lib/teaching-dictionary-manager/able-ible-workbook";
import { isSuffixWorkbookPilot } from "@/lib/teaching-dictionary-manager/bulk-review-scope";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";

export async function publishAbleIbleLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!isSuffixWorkbookPilot(skill)) redirect("/admin/teaching-dictionary/lesson-updates");
  const path = `/admin/teaching-dictionary/lesson-updates?skill=${skill}&view=preview`;
  const scope = { routeId: ABLE_IBLE_ROUTE, microSkillKey: skill };
  const db = createServiceRoleClient();
  try {
    const [lesson] = await loadLessonReadiness(scope);
    if (lesson.status !== "ready_to_launch" || !lesson.compilerReady ||
      lesson.preflightFingerprint !== form.get("fingerprint"))
      throw new Error("The lesson preview changed. Recheck the latest word list before publishing.");
    const published = await db.rpc("launch_teaching_dictionary_lesson_v2", {
      p_route_id: ABLE_IBLE_ROUTE, p_micro_skill_key: skill,
      p_versions: lesson.reviewedCandidateIds, p_actor: actor.id,
      p_expected_profile: lesson.releaseId, p_expected_profile_hash: lesson.profileSourceHash,
      p_preflight_fingerprint: lesson.preflightFingerprint, p_compiler_witnesses: lesson.compilerWitnesses,
    });
    if (published.error || !published.data)
      throw new Error(published.error?.message ?? "Could not publish the lesson profile.");
    updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
    let verified = false;
    try {
      const [after] = await loadLessonReadiness(scope);
      verified = after.released && after.compilerReady && after.reviewedCandidateIds.length === 0 && after.releaseId !== lesson.releaseId;
    } catch { verified = false; }
    if (!verified) {
      const rolledBack = await db.rpc("rollback_teaching_dictionary_launch_v2", {
        p_launch: published.data, p_actor: actor.id, p_reason: "Staging suffix workbook release failed compiler readback",
      });
      updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG);
      throw new Error(rolledBack.error ? "The release failed verification and rollback requires attention."
        : "The new profile failed verification. The previous profile was restored.");
    }
  } catch (error) {
    redirect(`${path}&error=${encodeURIComponent(error instanceof Error ? error.message : "The lesson update failed.")}`);
  }
  revalidatePath("/admin/teaching-dictionary");
  revalidatePath("/admin/adle-lesson-readiness");
  redirect(`${path}&published=1`);
}
