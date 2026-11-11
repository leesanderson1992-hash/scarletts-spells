"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { persistSpecialistSnapshotV3, supabaseSpecialistSnapshotV3PersistencePort } from "@/lib/adle/composable-lesson/specialist-snapshot-v3-persistence";
import { prepareIngAssignment } from "@/lib/adle/ing/readiness-loader";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import { buildScopedPath } from "@/lib/children-shared";
import { getLondonPracticeDate } from "@/lib/practice-date";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isStagingIngSkill, loadStagingIngUpdate, publishStagingIngUpdate } from "@/lib/teaching-dictionary-manager/ing-staging-release";

const path = "/admin/teaching-dictionary/lesson-updates";

export async function publishIngLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!isStagingIngSkill(skill)) redirect(path);
  const lessonPath = `${path}?skill=${skill}`;
  try {
    const db = createServiceRoleClient();
    const update = await loadStagingIngUpdate(db, skill);
    if (form.get("fingerprint") !== update.fingerprint)
      throw new Error("The lesson preview changed. Review the latest list before publishing.");
    if (!update.changes.length && !update.retired.length) throw new Error("The lesson pool is already current.");
    await publishStagingIngUpdate(db, actor.id, update);
  } catch (error) {
    redirect(`${lessonPath}&error=${encodeURIComponent(error instanceof Error ? error.message : "The lesson update failed.")}`);
  }
  revalidatePath(path);
  revalidatePath("/admin/adle-lesson-readiness");
  redirect(`${lessonPath}&published=1`);
}

export async function generateIngLesson(form: FormData) {
  const actor = await requireAdminUser();
  const skill = form.get("skill");
  if (!isStagingIngSkill(skill)) redirect(path);
  const lessonPath = `${path}?skill=${skill}`;
  let childId = "";
  try {
    const db = createServiceRoleClient();
    const update = await loadStagingIngUpdate(db, skill);
    childId = String(form.get("child_id") ?? "");
    if (!update.childIds.includes(childId)) throw new Error("Choose an enabled staging test learner.");
    const child = await db.from("children").select("id").eq("id", childId)
      .eq("parent_user_id", actor.id).eq("is_archived", false).maybeSingle();
    if (child.error || !child.data) throw new Error("Choose a staging test learner on your account.");
    const date = getLondonPracticeDate();
    const ids = [...new Set(form.getAll("word_id").map(String))];
    if (!ids.length || ids.length > 2 || ids.some(id => !update.current.some(word => word.canonicalWordId === id)))
      throw new Error("Choose one or two words with current approvals in the active lesson pool.");
    const existing = await db.from("daily_assignments").select("id").eq("child_id", childId)
      .eq("assignment_date", date).eq("title", "ADLE Daily Plan").limit(1);
    if (existing.error || existing.data.length)
      throw new Error("This learner already has an ADLE lesson today. Open it or choose another enabled test learner.");
    const items = await db.from("adle_learning_items").select("id,canonical_word_id,item_status,intake_on")
      .eq("child_id", childId).eq("micro_skill_key", skill).eq("row_status", "active")
      .in("canonical_word_id", ids);
    if (items.error || items.data.some(item => !["pending", "pending_reteach"].includes(item.item_status)))
      throw new Error("A selected word already has learning progress. Choose another test word or learner.");
    const queue: LearningItemFact[] = ids.map(id => {
      const prior = items.data.find(item => item.canonical_word_id === id);
      return { learningItemId: prior?.id ?? randomUUID(), canonicalWordId: id, childId,
        microSkillKey: skill, itemStatus: prior?.item_status === "pending_reteach" ? "pending_reteach" : "pending",
        sourceKind: "verified_misspelling", sourceRef: `staging-ing-test:${skill}:${childId}:${id}`,
        sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: prior?.intake_on ?? date, rowStatus: "active" };
    });
    const prepared = await prepareIngAssignment({ client: db, childId, parentUserId: actor.id,
      date, microSkillKey: skill, learningItems: queue, environmentKey: "staging" });
    if (prepared.status !== "ready") throw new Error(`Lesson generation is blocked (${prepared.reason.replaceAll("_", " ")}).`);
    if (ids.some(id => !prepared.snapshot.payload.resolvedLesson.queuedTargets.some(word => word.canonicalWordId === id)))
      throw new Error("The lesson could not include all selected target words.");
    const newItems = queue.filter(item => !items.data.some(row => row.id === item.learningItemId));
    if (newItems.length) {
      const saved = await db.from("adle_learning_items").insert(newItems.map(item => ({
        id: item.learningItemId, child_id: childId, canonical_word_id: item.canonicalWordId,
        micro_skill_key: skill, source_kind: item.sourceKind, source_ref: item.sourceRef,
        intake_on: date, item_status: "pending", row_status: "active",
      })));
      if (saved.error) throw new Error("Could not save the staging targets. Refresh and retry.");
    }
    await persistSpecialistSnapshotV3(supabaseSpecialistSnapshotV3PersistencePort(db), {
      parentUserId: actor.id, childId, planDate: date, header: prepared.header,
      items: prepared.items, intakes: [], snapshot: prepared.snapshot,
    });
  } catch (error) {
    redirect(`${lessonPath}&error=${encodeURIComponent(error instanceof Error && !error.message.startsWith("persistSpecialist")
      ? error.message : "The lesson could not be saved. Refresh and retry.")}`);
  }
  revalidatePath("/dashboard");
  redirect(buildScopedPath("/learn/week/adle", childId, "child"));
}
