"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadLessonReadiness } from "./read-model";

const BASE = "/admin/adle-lesson-readiness";

export async function launchReviewedAdleLesson(form: FormData) {
  const actor = await requireAdminUser();
  const routeId = String(form.get("route_id") ?? "");
  const microSkillKey = String(form.get("micro_skill_key") ?? "");
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((entry) => entry.routeId === routeId
    && entry.supportedMicroSkillKeys.includes(microSkillKey));
  const path = `${BASE}?route=${encodeURIComponent(routeId)}&skill=${encodeURIComponent(microSkillKey)}`;
  let errorCode: string | null = null;
  let released = false;
  try {
    if (!route || !["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(routeId))
      throw new Error("ADLE_LESSON_RELEASE_UNSUPPORTED");
    const current = (await loadLessonReadiness(null)).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
    if (!current || current.status !== "ready_to_launch" || !current.compilerReady
      || current.reviewedCandidateIds.length === 0) throw new Error("ADLE_LESSON_RELEASE_NOT_READY");
    const db = createServiceRoleClient();
    const versions = current.reviewedCandidateIds;
    const published = await db.rpc("publish_teaching_dictionary_lesson", {
      p_route_id: routeId, p_micro_skill_key: microSkillKey, p_versions: versions, p_actor: actor.id,
    });
    if (published.error || !published.data) throw new Error(published.error?.message.match(/TEACHING_[A-Z_]+/)?.[0] ?? "ADLE_LESSON_PUBLICATION_FAILED");
    let verified = false;
    try {
      const after = (await loadLessonReadiness(null)).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
      verified = Boolean(after?.released && after?.compilerReady && after?.reviewedCandidateIds.length === 0);
    } catch { verified = false; }
    if (!verified) {
      for (const contentId of [...versions].reverse()) {
        const rollback = await db.rpc(routeId === "dynamic_prefix_word_lab"
          ? "rollback_teaching_dictionary_prefix_content" : "rollback_teaching_dictionary_suffix_content", {
          p_content_version: contentId, p_actor: actor.id,
          p_reason: "Whole lesson failed runtime compiler verification after publication",
        });
        if (rollback.error) throw new Error("ADLE_LESSON_ROLLBACK_FAILED");
      }
      throw new Error("ADLE_LESSON_COMPILER_VERIFY_FAILED");
    }
    released = true;
    revalidatePath(BASE);
    revalidatePath("/admin/teaching-dictionary");
  } catch (error) {
    errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "ADLE_LESSON_RELEASE_FAILED";
  }
  redirect(`${path}&${released ? "saved=1" : `error=${encodeURIComponent(errorCode ?? "ADLE_LESSON_RELEASE_FAILED")}`}`);
}

export async function rollbackReviewedAdleLessonVersion(form: FormData) {
  const actor = await requireAdminUser();
  const routeId = String(form.get("route_id") ?? "");
  const microSkillKey = String(form.get("micro_skill_key") ?? "");
  const contentId = String(form.get("content_version_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const path = `${BASE}?route=${encodeURIComponent(routeId)}&skill=${encodeURIComponent(microSkillKey)}`;
  let errorCode: string | null = null;
  try {
    if (!isUuid(contentId) || reason.length < 8) throw new Error("ADLE_LESSON_ROLLBACK_REASON_REQUIRED");
    const current = (await loadLessonReadiness(null)).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
    if (!current || current.rollbackContentId !== contentId || !current.releaseId)
      throw new Error("ADLE_LESSON_ROLLBACK_NOT_CURRENT");
    const db = createServiceRoleClient();
    const result = await db.rpc(routeId === "dynamic_prefix_word_lab"
      ? "rollback_teaching_dictionary_prefix_content" : "rollback_teaching_dictionary_suffix_content", {
      p_content_version: contentId, p_actor: actor.id, p_reason: reason,
    });
    if (result.error) throw new Error(result.error.message.match(/TEACHING_[A-Z_]+/)?.[0] ?? "ADLE_LESSON_ROLLBACK_FAILED");
    revalidatePath(BASE);
    revalidatePath("/admin/teaching-dictionary");
  } catch (error) {
    errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "ADLE_LESSON_ROLLBACK_FAILED";
  }
  redirect(`${path}&${errorCode ? `error=${encodeURIComponent(errorCode)}` : "rolled_back=1"}`);
}
