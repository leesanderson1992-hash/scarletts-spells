"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { IDENTIFY_BASE_SKILL, isIdentifyBaseReview } from "@/lib/teaching-dictionary-manager/bulk-review-scope";
import { loadIdentifyBaseReview } from "@/lib/teaching-dictionary-manager/base-word-review";
import { saveBulkSkillApprovals } from "../bulk-assign/actions";

export async function publishIdentifyBaseWord(form: FormData) {
  await requireAdminUser();
  const skill = IDENTIFY_BASE_SKILL;
  const path = `/admin/teaching-dictionary/lesson-updates?skill=${skill}&view=preview`;
  if (!isIdentifyBaseReview(skill)) redirect(path);
  const db = createServiceRoleClient();
  const wordId = form.get("word_id");
  const senseId = form.get("sense_id");
  const before = await loadIdentifyBaseReview(db);
  if (before.current.some(word => word.canonicalWordId === wordId)) redirect(`${path}&published=1`);
  const candidate = before.rows.find(row => row.id === wordId);
  if (typeof wordId !== "string" || typeof senseId !== "string" || !candidate?.choices.some(choice => choice.id === senseId))
    redirect(`${path}&error=${encodeURIComponent("Recheck this word’s current facts and teaching family.")}`);
  const result = await saveBulkSkillApprovals({ microSkillKey: skill, applyWordIds: [wordId],
    excludeWordIds: [], clearWordIds: [], deassignWordIds: [], senseIds: { [wordId]: senseId },
    requestId: randomUUID(), sourceKind: "teaching_dictionary_word" });
  const after = result.ok ? await loadIdentifyBaseReview(db) : null;
  if (!after?.current.some(word => word.canonicalWordId === wordId))
    redirect(`${path}&error=${encodeURIComponent(result.blocked[0]?.reason ?? result.error ?? "The word is still waiting for the lesson checks.")}`);
  redirect(`${path}&published=1`);
}
