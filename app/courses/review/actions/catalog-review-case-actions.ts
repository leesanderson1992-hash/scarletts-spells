import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { buildStage7dReviewWorkVerificationTarget } from "@/lib/writing-engine/review/stage7d-parent-verification";

import {
  buildRedirectWithMessage,
  getLinkedWritingSample,
  getOwnedSubmission,
  normaliseOptionalIssueText,
  revalidateReviewQueueAndDetailBestEffort,
} from "./_shared";
import {
  isParentAuthoredMisspellingRow,
  normaliseWordForLookup,
} from "../review-utils";

type ExistingOpenCatalogReviewCase = {
  id: string;
  metadata: Record<string, unknown> | null;
};

function normaliseRedirectPath(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/courses/review/")
    ? value
    : "/courses/review";
}

function hasSubmittedMicroSkillKey(formData: FormData) {
  const submittedMicroSkillKey = formData.get("micro_skill_key");

  return (
    typeof submittedMicroSkillKey === "string" &&
    submittedMicroSkillKey.trim().length > 0
  );
}

export async function captureSpellingCatalogReviewCaseImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const parentNote = normaliseOptionalIssueText(formData.get("parent_note"));
  const safeRedirectPath = normaliseRedirectPath(formData.get("redirect_path"));

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that catalog-review case.",
      ),
    );
  }

  if (hasSubmittedMicroSkillKey(formData)) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Catalog review does not accept a micro-skill key from parent review.",
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { submission } = await getOwnedSubmission(submissionId, user.id, supabase);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That lesson submission is no longer available for review.",
      ),
    );
  }

  const linkedSample = await getLinkedWritingSample(supabase, submission.id, user.id);

  if (!linkedSample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Catalog review is only available for lesson submissions with reviewable writing.",
      ),
    );
  }

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, error_type, notes, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .eq("child_id", submission.child_id)
    .eq("writing_sample_id", linkedSample.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row is no longer available for catalog review.",
      ),
    );
  }

  const correctSpelling = misspelling.suggested_word ?? misspelling.corrected_word;
  const misspellingNormalized = normaliseWordForLookup(misspelling.misspelled_word ?? "");
  const correctSpellingNormalized = normaliseWordForLookup(correctSpelling ?? "");

  if (!misspellingNormalized || !correctSpellingNormalized) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Catalog review requires both the child spelling and the correct spelling.",
      ),
    );
  }

  const { data: existingSuggestion } = await supabase
    .from("writing_issue_suggestions")
    .select("id, suggested_micro_skill_key, notes")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .eq("misspelling_instance_id", misspelling.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const verificationTarget = buildStage7dReviewWorkVerificationTarget({
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement: correctSpelling,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedCategoryCode: misspelling.error_type,
    suggestedMicroSkillKey: existingSuggestion?.suggested_micro_skill_key ?? null,
    notes: existingSuggestion?.notes ?? misspelling.notes,
  });

  if (!verificationTarget) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row does not yet have enough source detail for catalog review.",
      ),
    );
  }

  const [{ data: existingVerification }, { data: existingCandidateMapping }, { data: existingIssue }] =
    await Promise.all([
      supabase
        .from("parent_verifications")
        .select("id")
        .eq("parent_user_id", user.id)
        .eq("source_entity_id", verificationTarget.sourceRef.sourceEntityId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("parent_verified_spelling_candidate_mappings")
        .select("id")
        .eq("parent_user_id", user.id)
        .eq("child_id", submission.child_id)
        .eq("task_submission_id", submission.id)
        .eq("source_misspelling_instance_id", misspelling.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("writing_issues")
        .select("id")
        .eq("parent_user_id", user.id)
        .eq("task_submission_id", submission.id)
        .eq("source_misspelling_instance_id", misspelling.id)
        .limit(1)
        .maybeSingle(),
    ]);

  if (existingVerification || existingCandidateMapping || existingIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row already has parent review truth saved.",
      ),
    );
  }

  const { data: existingOpenCaseData } = await supabase
    .from("spelling_catalog_review_cases")
    .select("id, metadata")
    .eq("parent_user_id", user.id)
    .eq("child_id", submission.child_id)
    .eq("source_misspelling_instance_id", misspelling.id)
    .eq("case_status", "open")
    .limit(1)
    .maybeSingle();
  const existingOpenCase = existingOpenCaseData as ExistingOpenCatalogReviewCase | null;
  const nowIso = new Date().toISOString();
  const isParentAddedMissedWord = isParentAuthoredMisspellingRow({
    notes: misspelling.notes,
  });
  const sourceProvenance = isParentAddedMissedWord
    ? "lesson_submission_parent_added_missed_word"
    : "lesson_submission_existing_output";
  const metadata = {
    ...(existingOpenCase?.metadata ?? {}),
    action_source: "review_work_no_matching_skill",
    source_misspelling_instance_id: misspelling.id,
    source_suggestion_id: existingSuggestion?.id ?? null,
    context_text: misspelling.context_text,
    position_start: misspelling.position_start,
    position_end: misspelling.position_end,
    suggested_category_code: misspelling.error_type,
    source_provenance: sourceProvenance,
    updated_from_parent_action_at: nowIso,
  };

  if (existingOpenCase) {
    const { error: updateError } = await supabase
      .from("spelling_catalog_review_cases")
      .update({
        source_suggestion_id: existingSuggestion?.id ?? null,
        reviewed_event_source_entity_id: verificationTarget.sourceRef.sourceEntityId,
        original_child_spelling: misspelling.misspelled_word,
        original_correct_spelling: correctSpelling,
        misspelling_normalized: misspellingNormalized,
        correct_spelling_normalized: correctSpellingNormalized,
        parent_note: parentNote,
        metadata,
        updated_at: nowIso,
      })
      .eq("id", existingOpenCase.id)
      .eq("parent_user_id", user.id)
      .eq("case_status", "open");

    if (updateError) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "We couldn't update that catalog-review case just yet.",
        ),
      );
    }
  } else {
    const { error: insertError } = await supabase
      .from("spelling_catalog_review_cases")
      .insert({
        parent_user_id: user.id,
        child_id: submission.child_id,
        task_submission_id: submission.id,
        writing_sample_id: linkedSample.id,
        source_suggestion_id: existingSuggestion?.id ?? null,
        source_misspelling_instance_id: misspelling.id,
        source_provenance: sourceProvenance,
        reviewed_event_source_entity_id: verificationTarget.sourceRef.sourceEntityId,
        original_child_spelling: misspelling.misspelled_word,
        original_correct_spelling: correctSpelling,
        misspelling_normalized: misspellingNormalized,
        correct_spelling_normalized: correctSpellingNormalized,
        case_status: "open",
        parent_note: parentNote,
        metadata,
      });

    if (insertError) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "We couldn't send that spelling case to catalog review just yet.",
        ),
      );
    }
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Sent to catalog review.",
    ),
  );
}
