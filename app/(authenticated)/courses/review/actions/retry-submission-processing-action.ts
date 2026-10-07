import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildScopedPath } from "@/lib/children";
import { processTaskSubmission } from "@/lib/courses/submission-processing";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function retrySubmissionProcessingImpl(formData: FormData) {
  const submissionId = String(formData.get("submission_id") ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: submission } = await supabase.from("task_submissions")
    .select("id,child_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  if (!submission) redirect("/courses/review?error=Submission%20not%20found");

  const reviewPath = buildScopedPath("/courses/review", submission.child_id, "parent");
  const service = createServiceRoleClient();
  const { data: job, error } = await service.from("task_submission_processing_jobs")
    .update({ next_retry_at: new Date().toISOString(), attempt_count: 0 })
    .eq("submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (error || !job) {
    redirect(`${reviewPath}&error=${encodeURIComponent("Preparation is already running or cannot be retried.")}`);
  }

  const result = await processTaskSubmission(submission.id);
  revalidatePath("/courses/review");
  const message = result.status === "completed"
    ? "Spelling review is ready."
    : "Preparation still failed. Please check the local processing setup.";
  redirect(`${reviewPath}&${result.status === "completed" ? "saved" : "error"}=${encodeURIComponent(message)}`);
}
