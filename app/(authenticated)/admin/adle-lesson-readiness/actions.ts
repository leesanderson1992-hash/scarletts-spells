"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadLessonReadiness } from "./read-model";

const BASE = "/admin/adle-lesson-readiness";

export async function launchReviewedAdleLesson(form: FormData) {
  const actor = await requireAdminUser();
  const routeId = String(form.get("route_id") ?? "");
  const microSkillKey = String(form.get("micro_skill_key") ?? "");
  const route = ADLE_CURRICULUM_ROUTE_REGISTRY.find((entry) => entry.routeId === routeId
    && entry.supportedMicroSkillKeys.includes(microSkillKey));
  const wordId = String(form.get("word_id") ?? "");
  const path = isUuid(wordId) ? `/admin/teaching-dictionary/${wordId}` : `${BASE}?route=${encodeURIComponent(routeId)}&skill=${encodeURIComponent(microSkillKey)}`;
  let errorCode: string | null = null;
  let released = false;
  try {
    if (!route || !route.newAssignmentCapable || routeId === "generic_composer")
      throw new Error("ADLE_LESSON_RELEASE_UNSUPPORTED");
    const current = (await loadLessonReadiness()).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
    if (!current || current.status !== "ready_to_launch" || !current.compilerReady
      || !current.activationEnabled || current.reviewedCandidateIds.length === 0) throw new Error("ADLE_LESSON_RELEASE_NOT_READY");
    if (String(form.get("preflight_fingerprint") ?? "") !== current.preflightFingerprint) throw new Error("ADLE_LESSON_PREFLIGHT_STALE");
    const db = createServiceRoleClient();
    const versions = current.reviewedCandidateIds;
    const affix = ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(routeId);
    if (!affix && !current.releasePackage) throw new Error("ADLE_LESSON_NATIVE_PACKAGE_REQUIRED");
    const published = affix ? await db.rpc("launch_teaching_dictionary_lesson_v2", {
      p_route_id: routeId, p_micro_skill_key: microSkillKey, p_versions: versions, p_actor: actor.id,
      p_expected_profile: current.releaseId, p_expected_profile_hash: current.profileSourceHash,
      p_preflight_fingerprint: current.preflightFingerprint, p_compiler_witnesses: current.compilerWitnesses,
    }) : await db.rpc("launch_teaching_dictionary_governed_package_v1", {
      p_route_id: routeId, p_micro_skill_key: microSkillKey, p_versions: versions, p_actor: actor.id,
      p_package: current.releasePackage, p_package_sha256: current.releasePackage!.packageSha256,
      p_expected_revision: current.activationRevisionId, p_environment: resolveAdleRouteActivationEnvironment(),
      p_preflight_fingerprint: current.preflightFingerprint, p_compiler_witnesses: current.compilerWitnesses,
    });
    if (published.error || !published.data) throw new Error(published.error?.message.match(/TEACHING_[A-Z_]+/)?.[0] ?? "ADLE_LESSON_PUBLICATION_FAILED");
    let verified = false;
    try {
      const after = (await loadLessonReadiness()).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
      verified = Boolean(after?.released && after?.compilerReady && after?.reviewedCandidateIds.length === 0);
    } catch { verified = false; }
    if (!verified) {
      const rollback = await db.rpc("rollback_teaching_dictionary_launch_v2", {
        p_launch: published.data, p_actor: actor.id,
        p_reason: "Whole lesson failed runtime compiler verification after publication",
      });
      if (rollback.error) throw new Error("ADLE_LESSON_ROLLBACK_FAILED");
      throw new Error("ADLE_LESSON_COMPILER_VERIFY_FAILED");
    }
    released = true;
    revalidatePath(BASE);
    revalidatePath("/admin/teaching-dictionary");
  } catch (error) {
    errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "ADLE_LESSON_RELEASE_FAILED";
  }
  redirect(`${path}${path.includes("?") ? "&" : "?"}${released ? "saved=1" : `error=${encodeURIComponent(errorCode ?? "ADLE_LESSON_RELEASE_FAILED")}`}`);
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
    const current = (await loadLessonReadiness()).find((row) => row.routeId === routeId && row.microSkillKey === microSkillKey);
    if (!current || current.rollbackContentId !== contentId || !current.releaseId)
      throw new Error("ADLE_LESSON_ROLLBACK_NOT_CURRENT");
    const db = createServiceRoleClient();
    const launches = await db.from("teaching_dictionary_lesson_launches").select("id").eq("published_profile_id", current.releaseId).contains("content_version_ids", [contentId]).order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (launches.error) throw new Error("ADLE_LESSON_ROLLBACK_READ_FAILED");
    const result = launches.data ? await db.rpc("rollback_teaching_dictionary_launch_v2", {p_launch:launches.data.id,p_actor:actor.id,p_reason:reason})
      : await db.rpc(routeId === "dynamic_prefix_word_lab" ? "rollback_teaching_dictionary_prefix_content" : "rollback_teaching_dictionary_suffix_content", {p_content_version:contentId,p_actor:actor.id,p_reason:reason});
    if (result.error) throw new Error(result.error.message.match(/TEACHING_[A-Z_]+/)?.[0] ?? "ADLE_LESSON_ROLLBACK_FAILED");
    revalidatePath(BASE);
    revalidatePath("/admin/teaching-dictionary");
  } catch (error) {
    errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : "ADLE_LESSON_ROLLBACK_FAILED";
  }
  redirect(`${path}&${errorCode ? `error=${encodeURIComponent(errorCode)}` : "rolled_back=1"}`);
}
