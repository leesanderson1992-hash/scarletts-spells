"use server";
import { generateSchwaTestLesson } from "@/lib/teaching-dictionary-manager/schwa-test-lesson";
import { buildScopedPath } from "@/lib/children-shared";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isSchwaWorkbookSkill, SCHWA_WORKBOOK_FIELDS, SCHWA_SYLLABLE_FIELDS, type SchwaWorkbookFacts } from "@/lib/teaching-dictionary-manager/weak-vowel-workbook";
import { loadSchwaWorkbookQueue, stageSchwaWorkbookDraft, publishSchwaWorkbookWord } from "@/lib/teaching-dictionary-manager/schwa-bulk-review";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
const base = "/admin/teaching-dictionary/lesson-updates";
export async function saveSchwaWorkbookDetails(form: FormData) {
  const actor = await requireAdminUser(); const skill = String(form.get("skill") ?? "");
  if (!isSchwaWorkbookSkill(skill)) redirect(base);
  const href = `${base}?skill=${skill}&view=preview`; let error = "";
  try {
    const db = createServiceRoleClient(); const wordId = String(form.get("word_id"));
    const row = (await loadSchwaWorkbookQueue(db, skill, [wordId], false)).find(row => row.wordId === wordId && row.id === form.get("draft_id"));
    if (!row) throw new Error("Open the latest saved Schwa review.");
    const [bundle] = await loadReviewedMeaningBundles(db, [wordId]);
    if (!bundle) throw new Error("Approve the Dictionary facts first.");
    const fields = Object.fromEntries([...SCHWA_WORKBOOK_FIELDS, ...SCHWA_SYLLABLE_FIELDS].map(key => [key, String(form.get(key) ?? "").trim()])) as SchwaWorkbookFacts;
    fields.lesson_family_key = String(form.get("lesson_family_key") ?? "").trim() || undefined;
    await stageSchwaWorkbookDraft(db, actor.id, bundle, skill, row.payload.skillSenseIds![skill], fields, { reviewWrittenDivisions: true });
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not save the activity facts."; }
  revalidatePath(base); redirect(error ? `${href}&error=${encodeURIComponent(error)}` : href);
}
export async function publishSchwaWorkbookWords(form: FormData) {
  const actor = await requireAdminUser(); const skill = String(form.get("skill") ?? "");
  if (!isSchwaWorkbookSkill(skill)) redirect(base);
  const href = `${base}?skill=${skill}&view=preview`; let error = ""; let count = 0;
  try {
    const db = createServiceRoleClient(); const ids = [...new Set(form.getAll("draft_id").map(String))];
    if (!ids.length || ids.length > 20) throw new Error("Publish up to 20 ready words at a time.");
    for (const id of ids) { await publishSchwaWorkbookWord(db, actor.id, skill, id); count++; }
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not publish the Schwa words."; }
  updateTag(TEACHING_DICTIONARY_EVIDENCE_TAG); revalidatePath(base); revalidatePath("/admin/teaching-dictionary");
  redirect(error ? `${href}&error=${encodeURIComponent(`${count ? `${count} words published. ` : ""}${error}`)}` : `${href}&published=${count}`);
}

export async function generateSchwaWorkbookLesson(form: FormData) {
  const actor = await requireAdminUser(); const skill = String(form.get("skill") ?? "");
  if (!isSchwaWorkbookSkill(skill)) redirect(base);
  const childId = String(form.get("child_id") ?? ""); let error = "";
  try { await generateSchwaTestLesson(createServiceRoleClient(), actor.id, childId, skill, String(form.get("word_id") ?? "")); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Could not generate the lesson."; }
  if (error) redirect(`${base}?skill=${skill}&view=preview&error=${encodeURIComponent(error)}`);
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
