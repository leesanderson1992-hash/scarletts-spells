import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createOrUpdateGoldenNuggetFromParentApproval } from "@/lib/rewards/word-treasures";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

const LEARNING_OUTCOMES = new Set(["concept_gap", "fragile_knowledge", "transfer_failure"]);
const NON_LEARNING_OUTCOMES = new Set(["checking_only", "not_an_issue"]);

/** Only an authenticated parent can convert the original contextual choice
 * into a governed learning need. The child's prompted retry stays REPAIR. */
export async function finaliseContextualLearningOutcomeImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const issueId = formData.get("writing_issue_id");
  const outcome = formData.get("final_classification");
  const skillKey = formData.get("micro_skill_key");
  if (typeof submissionId !== "string" || typeof issueId !== "string" ||
      typeof outcome !== "string" ||
      (!LEARNING_OUTCOMES.has(outcome) && !NON_LEARNING_OUTCOMES.has(outcome))) {
    throw new Error("Invalid contextual learning outcome.");
  }
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const { data: submission, error: submissionError } = await service.from("task_submissions")
    .select("id,child_id,parent_user_id,task_id,parent_review_status")
    .eq("id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (submissionError || !submission) {
    throw new Error("This submission is no longer open for parent review.");
  }
  const { data: issue, error: issueError } = await service.from("writing_issues")
    .select("id,child_id,parent_user_id,task_submission_id,observed_text,approved_replacement,issue_status,final_classification,micro_skill_key,metadata,source_writing_occurrence_id")
    .eq("id", issueId).eq("parent_user_id", user.id).eq("child_id", submission.child_id).maybeSingle();
  const alreadyFinalised = issue?.issue_status === "finalised" && issue.final_classification === outcome;
  if (submission.parent_review_status === "approved" && !alreadyFinalised) {
    throw new Error("This submission is no longer open for parent review.");
  }
  if (issueError || !issue || issue.metadata?.source_kind !== "contextual_advisory_v4" ||
      (!alreadyFinalised && (issue.issue_status !== "child_responded" || issue.final_classification !== null)) ||
      !issue.source_writing_occurrence_id) {
    throw new Error("This contextual retry is not ready for parent classification.");
  }
  const { data: attempts, error: attemptsError } = await service.from("writing_issue_correction_attempts")
    .select("id,task_submission_id")
    .eq("writing_issue_id", issueId).eq("parent_user_id", user.id).eq("child_id", submission.child_id);
  if (attemptsError || !attempts?.length) throw new Error("No child retry is linked to this contextual issue.");
  const { data: sourceSubmission } = await service.from("task_submissions")
    .select("id,task_id").eq("id", issue.task_submission_id).eq("parent_user_id", user.id).maybeSingle();
  if (!sourceSubmission || sourceSubmission.task_id !== submission.task_id ||
      !attempts.some((attempt) => attempt.task_submission_id === submissionId)) {
    throw new Error("The retry is not in this writing thread.");
  }

  if (LEARNING_OUTCOMES.has(outcome)) {
    if (typeof skillKey !== "string" || !skillKey) throw new Error("Choose the governed microskill.");
    if (!issue.approved_replacement) throw new Error("A parent-confirmed replacement is required for a contextual learning need.");
    let learningItemId: string | null = null;
    if (alreadyFinalised) {
      if (issue.metadata?.contextual_learning_source !== "PARENT_CONFIRMED_ORIGINAL_WRITING" || issue.micro_skill_key !== skillKey) {
        throw new Error("The finalised contextual issue does not match this learning route.");
      }
      const { data: link, error: linkError } = await service.from("learning_item_issue_links")
        .select("learning_item_id").eq("writing_issue_id", issueId).eq("parent_user_id", user.id)
        .eq("child_id", submission.child_id).limit(1).maybeSingle();
      if (linkError || !link) throw new Error("The contextual learning item could not be reconciled.");
      learningItemId = link.learning_item_id;
    } else {
      const finalised = await service.rpc("finalise_parent_confirmed_contextual_learning_need", {
        p_writing_issue_id: issueId,p_parent_user_id: user.id,p_child_id: submission.child_id,
        p_final_classification: outcome,p_micro_skill_key: skillKey,
      });
      if (finalised.error || !finalised.data?.learning_item_id) {
        throw new Error(`Contextual learning need was not finalised: ${finalised.error?.message ?? "missing learning item"}`);
      }
      learningItemId = finalised.data.learning_item_id;
    }
    // This is discovery of a need, not a reward for the prompted retry.
    await createOrUpdateGoldenNuggetFromParentApproval({
      supabase: service, childId: submission.child_id,parentUserId: user.id,
      correctedWord: issue.approved_replacement,originalMisspelling: null,
      sourceIssueId: issueId,sourceLearningItemId: learningItemId,
      sourceSubmissionId: issue.task_submission_id,microSkillKey: skillKey,
      metadata: { source_kind: "parent_confirmed_contextual_choice",
        source_occurrence_id: issue.source_writing_occurrence_id,
        observed_member: issue.observed_text,final_classification: outcome,
        retry_evidence_kind: "REPAIR_ONLY" },
    });
  } else {
    if (skillKey) throw new Error("A non-learning outcome cannot assign a microskill.");
    if (!alreadyFinalised) {
      const closed = await service.rpc("finalise_contextual_repair_only", {
        p_writing_issue_id: issueId,p_parent_user_id: user.id,
        p_child_id: submission.child_id,p_outcome: outcome,
      });
      if (closed.error) throw new Error(`Contextual outcome was not saved: ${closed.error.message}`);
    }
  }
  revalidatePath(`/courses/review/${submissionId}`);
  revalidatePath("/courses/review");
}
