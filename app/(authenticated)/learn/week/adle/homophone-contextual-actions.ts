"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { databaseActivatedAssignmentRuntimeAllowed } from "@/lib/adle/loaders/curriculum-release-authority";
import { validateFrozenConvergenceAssignment } from "@/lib/adle/homophone/convergence-assignment";
import { contextualProgressReadyToFinish } from "@/lib/adle/homophone/contextual-progress";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { getAdleDailyPlanReadModel } from "@/lib/adle/loaders/daily-plan-surface";

/** Finish consumes the saved, frozen independent sentence choices only. */
export async function completeContextualHomophoneLessonAction(request: {
  assignmentId: string; snapshotFingerprint: string; progress: unknown;
}): Promise<{ status: "completed" | "already_completed" }> {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("contextual_homophone_finish_not_authenticated");
  const header = await userClient.from("daily_assignments")
    .select("child_id,parent_user_id,assignment_date,compiled_lesson_snapshot,lesson_route_metadata,status")
    .eq("id", request.assignmentId).eq("parent_user_id", user.id).maybeSingle();
  if (header.error || !header.data || !validateFrozenConvergenceAssignment(header.data.compiled_lesson_snapshot))
    throw new Error("contextual_homophone_finish_assignment_invalid");
  const snapshot = header.data.compiled_lesson_snapshot;
  if (snapshot.sourceFingerprint !== request.snapshotFingerprint
    || !contextualProgressReadyToFinish(request.progress, snapshot))
    throw new Error("contextual_homophone_finish_progress_invalid");
  const serviceClient = createServiceRoleClient();
  const saved = await serviceClient.from("adle_specialist_stage_checkpoints")
    .select("adapter_key,checkpoint_schema_version,lesson_snapshot_fingerprint,checkpoint_payload")
    .eq("daily_assignment_id", request.assignmentId).maybeSingle();
  if (saved.error || !saved.data || saved.data.adapter_key !== "homophone_contextual_v1"
    || saved.data.checkpoint_schema_version !== "homophone_contextual_progress_v1"
    || saved.data.lesson_snapshot_fingerprint !== request.snapshotFingerprint
    || semanticJson(saved.data.checkpoint_payload.state) !== semanticJson(request.progress))
    throw new Error("contextual_homophone_finish_requires_frozen_checkpoint");
  if (!(await databaseActivatedAssignmentRuntimeAllowed({ client: serviceClient,
    lessonRouteMetadata: header.data.lesson_route_metadata,
    assignmentCompleted: header.data.status === "completed" })))
    throw new Error("contextual_homophone_finish_activation_changed");
  const readModel = await getAdleDailyPlanReadModel({ userClient, parentUserId: user.id,
    childId: header.data.child_id, planDate: header.data.assignment_date,
    assignmentId: request.assignmentId });
  if (readModel.partOne.present && !readModel.partOne.complete)
    throw new Error("contextual_homophone_finish_review_incomplete");
  const result = await serviceClient.rpc("complete_adle_homophone_contextual_v1", {
    p_parent_user_id: user.id, p_child_id: header.data.child_id,
    p_assignment_id: request.assignmentId, p_plan_date: header.data.assignment_date,
    p_snapshot_fingerprint: request.snapshotFingerprint,
    p_responses: request.progress.responses,
  });
  if (result.error) throw new Error(`contextual_homophone_finish:${result.error.message}`);
  revalidatePath("/learn/week/adle");
  return { status: result.data?.status === "already_completed" ? "already_completed" : "completed" };
}
