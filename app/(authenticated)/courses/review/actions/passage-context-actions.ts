import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadPassageContextReview } from "@/lib/writing-engine/whole-writing/context-passage-review";
import { recoverContextShadowJobs } from "@/lib/writing-engine/whole-writing/context-advisory-worker";

const correctionPattern = /^[\p{L}][\p{L}'’ʼ-]*$/u;

export async function recordPassageReviewEventImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const findingId = formData.get("finding_id");
  const action = formData.get("review_action");
  const correction = formData.get("correction");
  if (typeof submissionId !== "string" || typeof findingId !== "string" ||
    !["DISMISS", "RESTORE", "EDIT"].includes(String(action))) throw new Error("Invalid context review action.");
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const owned = await service.from("task_submissions").select("id,child_id,parent_review_status")
    .eq("id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (owned.error || !owned.data || owned.data.parent_review_status !== "pending")
    throw new Error("This writing review is not editable.");
  const review = await loadPassageContextReview({ client: service, submissionId,
    parentUserId: user.id, childId: owned.data.child_id });
  const row = review.rows.find((item) => item.findingId === findingId);
  if (!row || row.sourceStatus !== "ready" || row.issueStatus !== null)
    throw new Error("The exact context suggestion is unavailable.");
  const edited = typeof correction === "string" ? correction.trim() : "";
  if (action === "EDIT" && (!correctionPattern.test(edited) || edited.length > 60 ||
    edited.toLocaleLowerCase("en-GB") === row.observed.toLocaleLowerCase("en-GB")))
    throw new Error("Enter one different correction word.");
  const saved = await service.from("writing_context_passage_review_events").insert({
    finding_id: row.findingId, parent_user_id: user.id, action,
    correction: action === "EDIT" ? edited : null,
  });
  if (saved.error) throw new Error("Could not save the context review action.");
  revalidatePath(`/courses/review/${submissionId}`);
}

export async function retryPassageContextScanImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  if (typeof submissionId !== "string") throw new Error("Invalid context retry request.");
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const owned = await service.from("task_submissions").select("child_id,parent_review_status")
    .eq("id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (owned.error || !owned.data || owned.data.parent_review_status !== "pending")
    throw new Error("This writing is not available for another context scan.");
  const review = await loadPassageContextReview({ client: service, submissionId,
    parentUserId: user.id, childId: owned.data.child_id });
  if (review.readError || review.status !== "failed") throw new Error("A context retry is not available.");
  const retry = await service.rpc("retry_writing_context_passage", {
    p_submission_id: submissionId, p_parent_user_id: user.id });
  if (retry.error || !retry.data) throw new Error("This scan cannot be retried safely. You can add context manually.");
  await recoverContextShadowJobs(submissionId, service);
  revalidatePath(`/courses/review/${submissionId}`);
}

/** Idempotent preparation before the existing return flow reads writing_issues.
 * An issue is never created for a dismissed finding. A failed prepare leaves
 * the submission pending so the owner can reload and retry safely. */
export async function preparePassageContextReturn(input: { submissionId: string;
  parentUserId: string; childId: string }): Promise<"ready" | "pending" | "blocked"> {
  const service = createServiceRoleClient();
  const review = await loadPassageContextReview({ client: service, submissionId: input.submissionId,
    parentUserId: input.parentUserId, childId: input.childId });
  if (review.readError) return "blocked";
  if (review.status === "unavailable") return "ready";
  if (review.status === "pending") return "pending";
  for (const row of review.rows) {
    if (row.dismissed) continue;
    if (row.sourceStatus !== "ready") return "blocked";
    if (row.issueStatus === "pending_parent_review" || row.issueStatus === "sent_back_to_child") {
      if (row.issueSourceKind !== "contextual_advisory_v4" ||
        row.issueCorrection?.toLocaleLowerCase("en-GB") !== row.correction.toLocaleLowerCase("en-GB")) return "blocked";
      continue;
    }
    if (row.issueStatus !== null) return "blocked";
    const saved = await service.rpc("commit_reviewed_context_passage_finding", {
      p_finding_id: row.findingId, p_parent_user_id: input.parentUserId,
      p_expected_correction: row.correction,
    });
    if (saved.error || !saved.data) return "blocked";
  }
  return "ready";
}
