"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildScopedPath } from "@/lib/children-shared";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { prepareContextualHomophoneAssignment, persistContextualHomophoneAssignment } from "@/lib/adle/homophone/convergence-readiness-loader";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import { homophoneCanonicalPilotEnabled, loadCanonicalHomophonePreview, loadActiveCanonicalHomophoneContent } from "@/lib/teaching-dictionary-manager/homophone-canonical-release";

const base = "/admin/teaching-dictionary/lesson-updates";
export async function publishHomophoneDictionaryLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = String(form.get("skill") ?? "");
  if (!homophoneCanonicalPilotEnabled(skill)) redirect(base);
  const path = `${base}?skill=${skill}&view=preview`;
  let error = "";
  try {
    const db = createServiceRoleClient();
    const preview = await loadCanonicalHomophonePreview(db, skill);
    if (!preview.content || preview.fingerprint !== form.get("fingerprint"))
      throw new Error(preview.blockers.join(" ") || "The Dictionary facts changed. Refresh the preview.");
    const published = await db.rpc("publish_homophone_dictionary_staging_v1", {
      p_content: preview.content, p_expected_head: preview.currentRevisionId, p_actor: actor.id,
    });
    if (published.error || !published.data) throw new Error(published.error?.message ?? "Could not publish the Dictionary lesson.");
    const active = await loadActiveCanonicalHomophoneContent(db, skill);
    if (!active) throw new Error("Could not verify the published Dictionary facts. Refresh and retry.");
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not publish the lesson."; }
  revalidatePath(base);
  revalidatePath("/admin/adle-lesson-readiness");
  redirect(error ? `${path}&error=${encodeURIComponent(error)}` : `${path}&published=2`);
}

export async function generateHomophoneDictionaryLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = String(form.get("skill") ?? "");
  if (!homophoneCanonicalPilotEnabled(skill)) redirect(base);
  const path = `${base}?skill=${skill}&view=preview`;
  let childId = "";
  let error = "";
  try {
    const db = createServiceRoleClient();
    childId = String(form.get("child_id") ?? "");
    const child = await db.from("children").select("id").eq("id", childId)
      .eq("parent_user_id", actor.id).eq("is_archived", false).maybeSingle();
    if (child.error || !child.data) throw new Error("Choose a staging test learner on your account.");
    const preview = await loadCanonicalHomophonePreview(db, skill);
    if (!preview.content) throw new Error(preview.blockers.join(" "));
    const date = getLondonPracticeDate();
    const existing = await db.from("daily_assignments").select("id").eq("child_id", childId)
      .eq("assignment_date", date).eq("title", "ADLE Daily Plan").limit(1);
    if (existing.error || existing.data.length) throw new Error("This learner already has a lesson today. Choose another staging test learner.");
    const members = preview.content.sets.flatMap(set => set.members);
    const prior = await db.from("adle_learning_items").select("id,canonical_word_id,item_status,intake_on")
      .eq("child_id", childId).eq("micro_skill_key", skill).eq("row_status", "active")
      .in("canonical_word_id", members.map(member => member.canonicalWordId));
    if (prior.error || prior.data.some(row => !["pending", "pending_reteach"].includes(row.item_status)))
      throw new Error("A selected word already has progress. Choose another staging test learner.");
    const queue: LearningItemFact[] = members.map(member => ({
      learningItemId: prior.data.find(row => row.canonical_word_id === member.canonicalWordId)?.id ?? randomUUID(), canonicalWordId: member.canonicalWordId, childId, microSkillKey: skill,
      itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: `staging-homophone-pilot:${childId}:${member.word}`,
      sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active",
    }));
    const prepared = await prepareContextualHomophoneAssignment({client: db, childId, parentUserId: actor.id,
      date, microSkillKey: skill, learningItems: queue, wordStates: [], environmentKey: "staging"});
    if (prepared.status !== "ready") throw new Error(`Lesson generation is blocked (${prepared.reason}).`);
    const newItems = queue.filter(item => !prior.data.some(row => row.id === item.learningItemId));
    const saved = newItems.length ? await db.from("adle_learning_items").insert(newItems.map(item => ({id: item.learningItemId,
      child_id: childId, canonical_word_id: item.canonicalWordId, micro_skill_key: skill,
      source_kind: item.sourceKind, source_ref: item.sourceRef, intake_on: date, item_status: "pending", row_status: "active",
    }))) : {error: null};
    if (saved.error) throw new Error("Could not save the staging lesson targets.");
    await persistContextualHomophoneAssignment({client: db, parentUserId: actor.id, childId, date, prepared});
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not generate the lesson."; }
  if (error) redirect(`${path}&error=${encodeURIComponent(error)}`);
  revalidatePath("/dashboard");
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
