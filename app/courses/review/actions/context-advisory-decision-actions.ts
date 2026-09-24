import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadContextAdvisoryReview } from "@/lib/writing-engine/whole-writing/context-advisory-review";
import { normaliseContextMember } from "@/lib/writing-engine/whole-writing/context";

export async function recordContextAdvisoryParentDecisionImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const occurrenceId = formData.get("occurrence_id");
  const observationId = formData.get("observation_id");
  const classification = formData.get("classification");
  const alternative = formData.get("intended_member");
  const reason = formData.get("reason_code");
  if (typeof submissionId !== "string" || typeof occurrenceId !== "string" ||
      !["VALID", "INVALID", "UNCERTAIN", "EXCLUDED"].includes(String(classification))) {
    throw new Error("Invalid contextual parent decision request.");
  }
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const owned = await service.from("task_submissions")
    .select("id,child_id,parent_user_id,parent_review_status")
    .eq("id", submissionId).eq("parent_user_id", user.id).maybeSingle();
  if (owned.error || !owned.data || owned.data.parent_review_status === "approved") {
    throw new Error("This writing review is not editable.");
  }
  const review = await loadContextAdvisoryReview({
    client: service, submissionId, parentUserId: user.id, childId: owned.data.child_id,
  });
  if (!review.enabled) throw new Error("Contextual review is disabled.");
  const row = review.rows.find((item) => item.occurrenceId === occurrenceId);
  if (!row || row.sourceStatus !== "ready") throw new Error("The exact writing occurrence is unavailable.");
  const intended = typeof alternative === "string" && alternative.trim()
    ? normaliseContextMember(alternative.trim()) : null;
  if (classification === "INVALID") {
    if (!intended || !row.members.includes(intended) || intended === normaliseContextMember(row.observed)) {
      throw new Error("Choose a different member of the same family.");
    }
  } else if (intended) {
    throw new Error("Only an incorrect occurrence can have a replacement.");
  }
  const result = await service.rpc("record_writing_context_parent_decision", {
    p_occurrence_id: occurrenceId,
    p_observation_id: typeof observationId === "string" && observationId === row.observationId
      ? observationId : null,
    p_parent_user_id: user.id,
    p_classification: classification,
    p_intended_member: intended,
    p_reason_code: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null,
    p_context_excerpt: row.excerpt,
  });
  if (result.error) throw new Error(`Could not save contextual decision: ${result.error.message}`);
  revalidatePath(`/courses/review/${submissionId}`);
  revalidatePath("/courses/review");
}

export async function promoteContextDiagnosticExampleImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const decisionId = formData.get("decision_id");
  const category = formData.get("category");
  if (typeof submissionId !== "string" || typeof decisionId !== "string" ||
      !["FALSE_VALID", "WRONG_ALTERNATIVE", "AVOIDABLE_UNCERTAIN",
        "MISSED_CONSTRUCTION", "PROTECTED_OR_AMBIGUOUS", "OTHER"].includes(String(category))) {
    throw new Error("Choose a diagnostic category.");
  }
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceRoleClient();
  const owned = await service.from("task_submissions")
    .select("id,child_id,parent_user_id").eq("id", submissionId)
    .eq("parent_user_id", user.id).maybeSingle();
  if (owned.error || !owned.data) throw new Error("Submission not owned.");
  const review = await loadContextAdvisoryReview({
    client: service, submissionId, parentUserId: user.id, childId: owned.data.child_id,
  });
  const row = review.rows.find((item) => item.parentDecisionId === decisionId);
  if (!row || row.sourceStatus !== "ready") throw new Error("Parent decision not found for this occurrence.");
  const note = formData.get("parent_note");
  const saved = await service.from("writing_context_diagnostic_promotions").upsert({
    decision_id: decisionId,
    occurrence_id: row.occurrenceId,
    parent_user_id: user.id,
    child_id: owned.data.child_id,
    category,
    parent_note: typeof note === "string" && note.trim() ? note.trim().slice(0, 600) : null,
  }, { onConflict: "decision_id", ignoreDuplicates: true });
  if (saved.error) throw new Error("Could not send this example for diagnostic review.");
  revalidatePath(`/courses/review/${submissionId}`);
}
