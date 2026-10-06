"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { isUuid, parsePairDecisions, parsePairRejectionReasons, parseWordSkillCandidates } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadWordSkillPackage, publishWordSkillPackage } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";

const PATH = "/admin/word-skill-review";
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
async function context() {
  const actor = await requireAdminUser();
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) throw new Error("WORD_SKILL_ENVIRONMENT_UNSET");
  return { actor, environment, client: createServiceRoleClient() };
}
function finish(id: string, error?: unknown): never {
  const params = new URLSearchParams();
  if (isUuid(id)) params.set("package", id);
  if (error) {
    const code = error instanceof Error && /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : "WORD_SKILL_ACTION_FAILED";
    console.warn("[word-skill-review]", { code });
    params.set("error", code);
  } else {
    revalidatePath(PATH);
    params.set("saved", "1");
  }
  redirect(`${PATH}?${params}`);
}

export async function importWordSkillPackage(form: FormData) {
  const { actor, environment, client } = await context();
  let id = "";
  try {
    const key = text(form, "package_key");
    if (!key || key.length > 120) throw new Error("WORD_SKILL_PACKAGE_KEY_INVALID");
    const candidates = parseWordSkillCandidates(text(form, "candidates"));
    const result = await client.rpc("create_word_skill_candidate_package", { p_key: key, p_environment: environment, p_candidates: candidates, p_actor: actor.id });
    if (result.error) throw new Error("WORD_SKILL_IMPORT_FAILED");
    id = result.data;
  } catch (error) { finish(id, error); }
  finish(id);
}
export async function recordWordSkillReview(form: FormData) {
  const { actor, environment, client } = await context();
  const id = text(form, "package_id");
  try {
    if (!isUuid(id)) throw new Error("WORD_SKILL_PACKAGE_NOT_FOUND");
    const loaded = await loadWordSkillPackage(client, environment, id);
    const decisions = parsePairDecisions(form, loaded.package.candidates.length);
    const rejectionReasons = parsePairRejectionReasons(form, decisions);
    const note = text(form, "review_note");
    if (!note || note.length > 2000) throw new Error("WORD_SKILL_REVIEW_NOTE_REQUIRED");
    const activeSecondsText = text(form, "curator_active_seconds");
    const activeSeconds = activeSecondsText ? Number(activeSecondsText) : null;
    if (activeSeconds !== null && (!Number.isInteger(activeSeconds) || activeSeconds < 0)) throw new Error("WORD_SKILL_REVIEW_TIME_INVALID");
    const result = await client.rpc("review_word_skill_candidate_package_with_metrics", { p_package: id, p_environment: environment,
      p_decisions: decisions, p_rejection_reasons: rejectionReasons, p_actor: actor.id, p_note: note, p_active_seconds: activeSeconds });
    if (result.error) throw new Error("WORD_SKILL_REVIEW_FAILED");
  } catch (error) { finish(id, error); }
  finish(id);
}
export async function publishWordSkillReview(form: FormData) {
  const { actor, environment, client } = await context();
  const id = text(form, "package_id");
  try {
    if (!isUuid(id)) throw new Error("WORD_SKILL_PACKAGE_NOT_FOUND");
    if (form.get("confirm_publication") !== "yes") throw new Error("WORD_SKILL_PUBLICATION_CONFIRMATION_REQUIRED");
    await publishWordSkillPackage(client, environment, id, actor.id, text(form, "authority_fingerprint"));
  } catch (error) { finish(id, error); }
  finish(id);
}
export async function withdrawWordSkillReview(form: FormData) {
  const { actor, environment, client } = await context();
  const id = text(form, "package_id");
  try {
    if (!isUuid(id)) throw new Error("WORD_SKILL_PACKAGE_NOT_FOUND");
    const loaded = await loadWordSkillPackage(client, environment, id);
    if (!loaded.publication) throw new Error("WORD_SKILL_RELEASE_NOT_FOUND");
    const reason = text(form, "reason");
    if (!reason || reason.length > 2000) throw new Error("WORD_SKILL_WITHDRAWAL_REASON_REQUIRED");
    const result = await client.rpc("withdraw_word_skill_reviewed_release", { p_release: loaded.publication.release_id, p_environment: environment, p_actor: actor.id, p_reason: reason });
    if (result.error) throw new Error("WORD_SKILL_WITHDRAWAL_FAILED");
  } catch (error) { finish(id, error); }
  finish(id);
}
