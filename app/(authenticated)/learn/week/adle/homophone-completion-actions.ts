"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isHomophoneSnapshotV3, validateHomophoneSnapshotV3 } from "@/lib/adle/homophone/snapshot";
import { homophoneProgressComplete, homophoneProgressValid } from "@/lib/adle/homophone/progress";
import { homophoneAttemptEvents, homophoneCompletionFacts } from "@/lib/adle/homophone/completion";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { getAdleDailyPlanReadModel } from "@/lib/adle/loaders/daily-plan-surface";
import { databaseActivatedAssignmentRuntimeAllowed } from "@/lib/adle/loaders/curriculum-release-authority";
import { loadActiveReviewPolicy } from "@/lib/adle/loaders/composer-facts-loader";
import { learningItemFromRow, type LearningItemRow } from "@/lib/adle/loaders/rows";
import { onLessonCompleted } from "@/lib/adle/composer-completions";
import { loadPinnedTargetScheduleWordIds, integrateTargetControlledGraduationForCompletedLesson } from "@/lib/adle/review-policy/controlled-graduation-integration";
import { advanceForgeForAdleTaughtWords } from "@/lib/rewards/adle-reward-bridge";
import type { IsoDate } from "@/lib/adle/review-scheduler";

export async function completeHomophoneLessonAction(request: { assignmentId: string; snapshotFingerprint: string; progress: unknown }): Promise<{ status: "completed" | "already_completed" }> {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("homophone_finish_not_authenticated");
  const header = await userClient.from("daily_assignments").select("child_id,assignment_date,compiled_lesson_snapshot,status,lesson_route_metadata")
    .eq("id", request.assignmentId).eq("parent_user_id", user.id).maybeSingle();
  if (header.error || !header.data) throw new Error("homophone_finish_assignment_not_owned");
  const serviceClient = createServiceRoleClient();
  const readModel = await getAdleDailyPlanReadModel({ userClient, parentUserId: user.id, childId: header.data.child_id,
    planDate: header.data.assignment_date, assignmentId: request.assignmentId });
  const items = readModel.partTwo.items;
  const validated = validateHomophoneSnapshotV3(header.data.compiled_lesson_snapshot, { lessonRouteMetadata: header.data.lesson_route_metadata,
    assignmentGenerationSource: "adle_composer_v1", items: items.map(item => ({ ...item, metadata: item.itemMetadata })) });
  if (!validated.ok || !isHomophoneSnapshotV3(validated.snapshot)
    || validated.snapshot.provenance.sourceFingerprint !== request.snapshotFingerprint) throw new Error("homophone_finish_snapshot_invalid");
  const snapshot = validated.snapshot;
  const lesson = snapshot.payload.resolvedLesson.lesson;
  if (!homophoneProgressValid(request.progress, lesson) || !request.progress.completed || !homophoneProgressComplete(request.progress, lesson)) {
    throw new Error("homophone_finish_tasks_incomplete");
  }
  const saved = await serviceClient.from("adle_specialist_stage_checkpoints").select("checkpoint_payload,lesson_snapshot_fingerprint")
    .eq("daily_assignment_id", request.assignmentId).maybeSingle();
  if (saved.error || !saved.data || saved.data.lesson_snapshot_fingerprint !== request.snapshotFingerprint
    || semanticJson({ ...saved.data.checkpoint_payload.state, completed: true }) !== semanticJson(request.progress)) {
    throw new Error("homophone_finish_requires_frozen_checkpoint");
  }
  const authenticIds = snapshot.words.filter(word => word.learningItemId).map(word => word.canonicalWordId);
  const pinned = await loadPinnedTargetScheduleWordIds({ client: serviceClient, childId: header.data.child_id, canonicalWordIds: authenticIds });
  const sourceRef = `lesson:${header.data.child_id}:${header.data.assignment_date}:${lesson.microSkillKey}`;
  const finishFollowups = async () => {
    if (pinned.size) await integrateTargetControlledGraduationForCompletedLesson({ client: serviceClient, parentUserId: user.id,
      childId: header.data!.child_id, assignmentId: request.assignmentId, completedOn: header.data!.assignment_date as IsoDate,
      sourceRef, assignmentItemIds: items.map(item => item.id), canonicalWordIds: [...pinned.keys()] });
    await advanceForgeForAdleTaughtWords({ supabase: serviceClient, parentUserId: user.id, childId: header.data!.child_id,
      dailyAssignmentId: request.assignmentId, taughtWords: items.filter(item => item.sectionKey === "lesson_production"
        && authenticIds.includes(item.canonicalWordId ?? "")).map(item => ({ assignmentItemId: item.id, targetWord: item.targetWord! })) });
    revalidatePath("/learn/week/adle");
  };
  if (header.data.status === "completed") { await finishFollowups(); return { status: "already_completed" }; }
  if ((readModel.partOne.present && !readModel.partOne.complete)
    || !(await databaseActivatedAssignmentRuntimeAllowed({ client: serviceClient,
      lessonRouteMetadata: header.data.lesson_route_metadata, assignmentCompleted: false }))) {
    throw new Error("homophone_finish_runtime_not_allowed");
  }
  const facts = homophoneCompletionFacts(snapshot, request.progress);
  const rows = await serviceClient.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status")
    .eq("child_id", header.data.child_id).eq("row_status", "active");
  if (rows.error) throw new Error("homophone_finish_learning_items_unavailable");
  const learningItems = (rows.data as LearningItemRow[]).map(learningItemFromRow);
  if (snapshot.words.some(word => word.learningItemId && !learningItems.some(item => item.learningItemId === word.learningItemId
    && item.canonicalWordId === word.canonicalWordId && item.microSkillKey === lesson.microSkillKey))) throw new Error("homophone_finish_lineage_changed");
  const completion = onLessonCompleted(await loadActiveReviewPolicy(serviceClient), { childId: header.data.child_id,
    microSkillKey: lesson.microSkillKey, completedOn: header.data.assignment_date as IsoDate, sourceRef, bundleId: randomUUID(),
    producedWords: facts.producedWords, wordPolicies: facts.wordPolicies.map(policy => ({ ...policy,
      scheduleEligible: policy.scheduleEligible && !pinned.has(policy.canonicalWordId) })), learningItems });
  const attempts = homophoneAttemptEvents({ snapshot, progress: request.progress, items, childId: header.data.child_id,
    parentUserId: user.id, assignmentId: request.assignmentId, planDate: header.data.assignment_date });
  const result = await serviceClient.rpc("complete_adle_homophone_lesson_v2", { p_parent_user_id: user.id,
    p_child_id: header.data.child_id, p_assignment_id: request.assignmentId, p_plan_date: header.data.assignment_date,
    p_micro_skill_key: lesson.microSkillKey, p_source_ref: sourceRef, p_assignment_item_ids: items.map(item => item.id),
    p_attempts: attempts, p_lesson: completion,
    p_reflection: { childId: header.data.child_id, parentUserId: user.id, assignmentId: request.assignmentId,
      microSkillKey: lesson.microSkillKey, contentVersion: "homophone_word_lab:v2", promptKey: `homophone:${lesson.microSkillKey}:reflection:v2`,
      promptText: "Which clue will help you choose these words next time?", reflectionText: request.progress.reflectionResponse } });
  if (result.error) throw new Error(`homophone_finish:${result.error.message}`);
  await finishFollowups();
  return { status: "completed" };
}
