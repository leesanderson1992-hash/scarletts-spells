"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateIngSnapshotV3, isIngSnapshotV3 } from "@/lib/adle/ing/snapshot";
import { ingCompletionFacts } from "@/lib/adle/ing/completion";
import { ingProgressValid } from "@/lib/adle/ing/progress";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { getAdleDailyPlanReadModel } from "@/lib/adle/loaders/daily-plan-surface";
import { databaseActivatedAssignmentRuntimeAllowed } from "@/lib/adle/loaders/curriculum-release-authority";
import { loadActiveReviewPolicy } from "@/lib/adle/loaders/composer-facts-loader";
import { learningItemFromRow, type LearningItemRow } from "@/lib/adle/loaders/rows";
import { onLessonCompleted } from "@/lib/adle/composer-completions";
import { buildLessonAttemptEvents } from "@/lib/adle/assignment-attempt-events";
import { loadPinnedTargetScheduleWordIds, integrateTargetControlledGraduationForCompletedLesson } from "@/lib/adle/review-policy/controlled-graduation-integration";
import { advanceForgeForAdleTaughtWords } from "@/lib/rewards/adle-reward-bridge";
import type { IsoDate } from "@/lib/adle/review-scheduler";

export async function completeIngLessonAction(request: { assignmentId: string; snapshotFingerprint: string; progress: unknown }): Promise<{ status: "completed" | "already_completed" }> {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("ing_finish_not_authenticated");
  const header = await userClient.from("daily_assignments").select("child_id,assignment_date,compiled_lesson_snapshot,status,lesson_route_metadata").eq("id", request.assignmentId).eq("parent_user_id", user.id).maybeSingle();
  if (header.error || !header.data) throw new Error("ing_finish_assignment_not_owned");
  const serviceClient = createServiceRoleClient();
  const readModel = await getAdleDailyPlanReadModel({ userClient, parentUserId: user.id, childId: header.data.child_id, planDate: header.data.assignment_date, assignmentId: request.assignmentId });
  const items = readModel.partTwo.items;
  const validated = validateIngSnapshotV3(header.data.compiled_lesson_snapshot, { lessonRouteMetadata: header.data.lesson_route_metadata, assignmentGenerationSource: "adle_composer_v1", items: items.map(i => ({ ...i, metadata: i.itemMetadata })) });
  if (!validated.ok || !isIngSnapshotV3(validated.snapshot) || validated.snapshot.provenance.sourceFingerprint !== request.snapshotFingerprint) throw new Error("ing_finish_snapshot_invalid");
  const lesson = validated.snapshot.payload.resolvedLesson;
  if (!ingProgressValid(request.progress, lesson) || !request.progress.finished) throw new Error("ing_finish_tasks_incomplete");
  const saved = await serviceClient.from("adle_specialist_stage_checkpoints").select("checkpoint_payload,lesson_snapshot_fingerprint").eq("daily_assignment_id", request.assignmentId).maybeSingle();
  if (saved.error || !saved.data || saved.data.lesson_snapshot_fingerprint !== request.snapshotFingerprint || semanticJson({ ...saved.data.checkpoint_payload.state, finished: true }) !== semanticJson(request.progress)) throw new Error("ing_finish_requires_frozen_checkpoint");
  const pinned = await loadPinnedTargetScheduleWordIds({ client: serviceClient, childId: header.data.child_id, canonicalWordIds: lesson.queuedTargets.map(t => t.canonicalWordId) });
  const sourceRef = `lesson:${header.data.child_id}:${header.data.assignment_date}:${lesson.microSkillKey}`;
  // These existing integrations are idempotent. A lost response or a failed
  // post-commit integration must retry them, not skip them on a completed header.
  const finishFollowups = async () => {
    if (pinned.size) await integrateTargetControlledGraduationForCompletedLesson({ client: serviceClient, parentUserId: user.id, childId: header.data!.child_id, assignmentId: request.assignmentId, completedOn: header.data!.assignment_date as IsoDate, sourceRef, assignmentItemIds: items.map(i => i.id), canonicalWordIds: [...pinned.keys()] });
    await advanceForgeForAdleTaughtWords({ supabase: serviceClient, parentUserId: user.id, childId: header.data!.child_id, dailyAssignmentId: request.assignmentId, taughtWords: items.filter(i => i.sectionKey === "lesson_production" && lesson.queuedTargets.some(t => t.canonicalWordId === i.canonicalWordId)).map(i => ({ assignmentItemId: i.id, targetWord: i.targetWord! })) });
    revalidatePath("/learn/week/adle");
  };
  if (header.data.status === "completed") {
    await finishFollowups();
    return { status: "already_completed" };
  }
  if ((readModel.partOne.present && !readModel.partOne.complete) || !(await databaseActivatedAssignmentRuntimeAllowed({ client: serviceClient, lessonRouteMetadata: header.data.lesson_route_metadata, assignmentCompleted: false }))) throw new Error("ing_finish_runtime_not_allowed");
  const facts = ingCompletionFacts(lesson, request.progress);
  const rows = await serviceClient.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", header.data.child_id).eq("row_status", "active");
  if (rows.error) throw new Error("ing_finish_learning_items_unavailable");
  const learningItems = (rows.data as LearningItemRow[]).map(learningItemFromRow);
  if (lesson.queuedTargets.some(t => !learningItems.some(i => i.learningItemId === t.learningItemId && i.canonicalWordId === t.canonicalWordId && i.microSkillKey === lesson.microSkillKey))) throw new Error("ing_finish_lineage_changed");
  const completion = onLessonCompleted(await loadActiveReviewPolicy(serviceClient), { childId: header.data.child_id, microSkillKey: lesson.microSkillKey, completedOn: header.data.assignment_date as IsoDate,
    sourceRef, bundleId: randomUUID(), producedWords: facts.producedWords, wordPolicies: facts.wordPolicies.map(p => ({ ...p, scheduleEligible: p.scheduleEligible && !pinned.has(p.canonicalWordId) })), learningItems });
  const attempts = buildLessonAttemptEvents({ context: { childId: header.data.child_id, parentUserId: user.id, assignmentId: request.assignmentId, planDate: header.data.assignment_date }, sourceRef, items,
    controlledAttempts: facts.controlledAttempts, dictationAttempts: facts.dictationAttempts, guidedAttempts: new Map(items.filter(i => i.sectionKey === "lesson_intro" || i.sectionKey === "guided_practice").map(i => [i.id, "completed"])), probeAttempts: new Map() });
  const result = await serviceClient.rpc("complete_adle_ing_lesson_v1", { p_parent_user_id: user.id, p_child_id: header.data.child_id, p_assignment_id: request.assignmentId,
    p_plan_date: header.data.assignment_date, p_micro_skill_key: lesson.microSkillKey, p_source_ref: sourceRef, p_assignment_item_ids: items.map(i => i.id), p_attempts: attempts, p_lesson: completion,
    p_reflection: { childId: header.data.child_id, parentUserId: user.id, assignmentId: request.assignmentId, microSkillKey: lesson.microSkillKey, contentVersion: "ing_endings_word_lab:v1", promptKey: `ing:${lesson.microSkillKey}:reflection:v1`, promptText: lesson.reflectionPrompt, reflectionText: request.progress.reflection } });
  if (result.error) throw new Error(`ing_finish:${result.error.message}`);
  await finishFollowups();
  return { status: "completed" };
}
