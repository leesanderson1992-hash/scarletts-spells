"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildScopedPath } from "@/lib/children-shared";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { validateFrozenConvergenceAssignment } from "@/lib/adle/homophone/convergence-assignment";
import { prepareContextualHomophoneAssignment, persistContextualHomophoneAssignment } from "@/lib/adle/homophone/convergence-readiness-loader";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import { homophoneCanonicalPublishingEnabled, loadCanonicalHomophonePreview, loadActiveCanonicalHomophoneContent } from "@/lib/teaching-dictionary-manager/homophone-canonical-release";

const base = "/admin/teaching-dictionary/lesson-updates";
export async function publishHomophoneDictionaryLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = String(form.get("skill") ?? "");
  if (!homophoneCanonicalPublishingEnabled(skill)) redirect(base);
  const path = `${base}?skill=${skill}&view=preview`;
  let error = "";
  let publishedWords = 0;
  try {
    const db = createServiceRoleClient();
    const preview = await loadCanonicalHomophonePreview(db, skill);
    if (!preview.content || preview.fingerprint !== form.get("fingerprint"))
      throw new Error(preview.blockers.join(" ") || "The Dictionary facts changed. Refresh the preview.");
    const published = await db.rpc("publish_homophone_dictionary_staging_v2", {
      p_content: preview.content, p_expected_head: preview.currentRevisionId, p_actor: actor.id,
    });
    if (published.error || !published.data) throw new Error(published.error?.message ?? "Could not publish the Dictionary lesson.");
    publishedWords = preview.content.dictionaryFacts!.length;
    const active = await loadActiveCanonicalHomophoneContent(db, skill);
    if (!active) throw new Error("Could not verify the published Dictionary facts. Refresh and retry.");
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not publish the lesson."; }
  revalidatePath(base);
  revalidatePath("/admin/adle-lesson-readiness");
  redirect(error ? `${path}&error=${encodeURIComponent(error)}` : `${path}&published=${publishedWords}`);
}

async function ensureStagingSession(db: ReturnType<typeof createServiceRoleClient>, assignmentId: string, childId: string, actor: string, date: string) {
  const result = await db.from("adle_today_session_orchestrations").upsert({
    daily_assignment_id: assignmentId, child_id: childId, parent_user_id: actor, assignment_date: date,
    major_stage: "specialist_lesson", review_generation_status: "not_required", specialist_generation_status: "ready",
    specialist_started_at: new Date().toISOString(),
  }, {onConflict: "daily_assignment_id", ignoreDuplicates: true});
  if (result.error) throw new Error("Could not prepare lesson progress saving. Retry Generate to resume.");
}

export async function generateHomophoneDictionaryLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = String(form.get("skill") ?? "");
  if (!homophoneCanonicalPublishingEnabled(skill)) redirect(base);
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
    const unfinished = await db.from("adle_today_session_orchestrations").select("daily_assignment_id")
      .eq("child_id", childId).eq("parent_user_id", actor.id).neq("major_stage", "session_complete")
      .neq("assignment_date", date).limit(1);
    if (unfinished.error) throw new Error("Could not check the learner’s unfinished lessons.");
    if (unfinished.data.length) throw new Error("This learner has an unfinished earlier lesson. Finish it or choose a fresh staging test learner.");
    const existing = await db.from("daily_assignments").select("id,compiled_lesson_snapshot").eq("child_id", childId)
      .eq("assignment_date", date).eq("title", "ADLE Daily Plan").limit(1);
    if (existing.error) throw new Error("Could not check the learner’s current lesson.");
    if (existing.data.length) {
      const snapshot = existing.data[0].compiled_lesson_snapshot;
      if (!validateFrozenConvergenceAssignment(snapshot) || snapshot.microSkillKey !== skill
        || snapshot.contextCheck.selectedSets.flatMap(set => set.members).some(member => !preview.content!.sets
          .flatMap(set => set.members).some(current => current.canonicalWordId === member.canonicalWordId
            && current.intendedSense === member.intendedSense && current.teachingSentence === member.teachingSentence)))
        throw new Error("This learner already has another lesson today. Choose a fresh staging test learner.");
      await ensureStagingSession(db, existing.data[0].id, childId, actor.id, date);
    } else {
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
    const assignmentId = await persistContextualHomophoneAssignment({client: db, parentUserId: actor.id, childId, date, prepared});
    await ensureStagingSession(db, assignmentId, childId, actor.id, date);
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : "Could not generate the lesson."; }
  if (error) redirect(`${path}&error=${encodeURIComponent(error)}`);
  revalidatePath("/dashboard");
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
