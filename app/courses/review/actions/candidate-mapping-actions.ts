import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getReviewWorkCandidateCaptureMicroSkillCatalogEntry } from "@/lib/writing-engine/persistence/learning-items";
import { createSupabaseSpellingCandidateMappingRepository } from "@/lib/writing-engine/persistence/spelling-candidate-mappings";
import {
  buildStage7dReviewWorkVerificationTarget,
  recordStage7dParentVerificationWithoutPromotion,
} from "@/lib/writing-engine/review/stage7d-parent-verification";

import { normaliseExistingParentVerificationLookupRow } from "./canonical-spelling-backfill-actions";
import {
  buildRedirectWithMessage,
  getLinkedWritingSample,
  getOwnedSubmission,
  normaliseMicroSkillKey,
  revalidateReviewQueueAndDetailBestEffort,
} from "./_shared";
import {
  findOrCreateSuggestionForMisspelling,
  markSuggestionReviewedAsAccepted,
} from "./lesson-submission-review-actions";
import {
  isParentAuthoredMisspellingRow,
  normaliseWordForLookup,
} from "../review-utils";

export async function captureSubmissionSpellingCandidateMappingImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const selectedMicroSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

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
        "We couldn't prepare that spelling classification.",
      ),
    );
  }

  if (selectedMicroSkillKey === "unknown") {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Choose an existing canonical micro-skill before saving this classification.",
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
        "That lesson submission does not currently have reviewable writing.",
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
    .eq("writing_sample_id", linkedSample.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row is no longer available for classification.",
      ),
    );
  }

  const isParentAddedMissedWord = isParentAuthoredMisspellingRow({
    notes: misspelling.notes,
  });

  const suggestion =
    isParentAddedMissedWord
      ? null
      : await findOrCreateSuggestionForMisspelling({
          supabase,
          parentUserId: user.id,
          childId: submission.child_id,
          taskSubmissionId: submission.id,
          writingSampleId: linkedSample.id,
          misspellingInstanceId: misspelling.id,
          observedText: misspelling.misspelled_word,
          suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
          contextText: misspelling.context_text,
          positionStart: misspelling.position_start,
          positionEnd: misspelling.position_end,
          suggestedMicroSkillKey: "unknown",
        });

  if (!isParentAddedMissedWord && !suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that shared spelling suggestion just yet.",
      ),
    );
  }

  const existingSuggestedMicroSkillKey = suggestion?.suggested_micro_skill_key ?? null;
  const hasExistingCanonicalSuggestedMicroSkillKey =
    typeof existingSuggestedMicroSkillKey === "string" &&
    existingSuggestedMicroSkillKey.trim().length > 0 &&
    existingSuggestedMicroSkillKey.trim().toLowerCase() !== "unknown";

  if (!isParentAddedMissedWord && hasExistingCanonicalSuggestedMicroSkillKey) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That row already carries canonical suggestion truth. Use the existing Review Work actions instead.",
      ),
    );
  }

  const catalogEntry = await getReviewWorkCandidateCaptureMicroSkillCatalogEntry({
    supabase,
    microSkillKey: selectedMicroSkillKey,
  });

  if (!catalogEntry) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only catalog-backed micro-skills can be used for candidate capture.",
      ),
    );
  }

  if (catalogEntry.masteryDomainKey !== "D4") {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That micro-skill is outside the bounded spelling scope for candidate capture.",
      ),
    );
  }

  if (!catalogEntry.isActive) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Inactive micro-skills cannot be used for candidate capture.",
      ),
    );
  }

  if (!catalogEntry.isAssignable) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Non-assignable micro-skills cannot be used for candidate capture.",
      ),
    );
  }

  const misspellingNormalized = normaliseWordForLookup(misspelling.misspelled_word ?? "");
  const correctSpellingNormalized = normaliseWordForLookup(
    (misspelling.suggested_word ?? misspelling.corrected_word) ?? "",
  );

  if (!misspellingNormalized || !correctSpellingNormalized) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Candidate capture requires both the child spelling and the correct spelling.",
      ),
    );
  }

  const verificationTarget = buildStage7dReviewWorkVerificationTarget({
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedCategoryCode: misspelling.error_type,
    suggestedMicroSkillKey:
      typeof existingSuggestedMicroSkillKey === "string" &&
      existingSuggestedMicroSkillKey.trim().toLowerCase() !== "unknown"
        ? existingSuggestedMicroSkillKey
        : null,
    notes: suggestion?.notes ?? misspelling.notes,
  });

  if (!verificationTarget) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row does not yet have enough source detail for candidate capture.",
      ),
    );
  }

  const { data: existingVerificationData } = await supabase
    .from("parent_verifications")
    .select("id, decision, suggested_micro_skill_key, verified_micro_skill_key")
    .eq("parent_user_id", user.id)
    .eq("source_entity_id", verificationTarget.sourceRef.sourceEntityId)
    .limit(1)
    .maybeSingle();

  const existingVerification = normaliseExistingParentVerificationLookupRow(
    existingVerificationData,
  );

  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(supabase);

  let parentVerificationId = existingVerification?.id ?? null;

  if (
    existingVerification &&
    existingVerification.decision !== "accepted" &&
    existingVerification.decision !== "overridden"
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling row already has a non-promotable parent review decision saved.",
      ),
    );
  }

  if (existingVerification) {
    const existingVerificationMicroSkillKey =
      existingVerification.verified_micro_skill_key ??
      existingVerification.suggested_micro_skill_key ??
      null;

    if (existingVerificationMicroSkillKey !== selectedMicroSkillKey) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "That spelling row already has a different verified micro-skill saved.",
        ),
      );
    }
  }

  if (!parentVerificationId) {
    try {
      const verificationResult = await recordStage7dParentVerificationWithoutPromotion({
        supabase,
        childId: submission.child_id,
        parentUserId: user.id,
        decision: "overridden",
        verifiedMicroSkillKey: selectedMicroSkillKey,
        note: isParentAddedMissedWord
          ? "Parent-added missed word classified for candidate capture."
          : "Lesson spelling row classified for candidate capture.",
        target: verificationTarget,
      });
      parentVerificationId = verificationResult.verificationRecord.id;
    } catch (error) {
      console.error("Candidate capture verification failed before redirect.", error);
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "We couldn't save that verified spelling evidence right now.",
        ),
      );
    }
  }

  const existingCandidateMapping =
    parentVerificationId
      ? await candidateMappingRepository.findByParentVerificationId(parentVerificationId)
      : null;

  if (!existingCandidateMapping && parentVerificationId) {
    try {
      await candidateMappingRepository.insertPending({
        parentUserId: user.id,
        childId: submission.child_id,
        parentVerificationId,
        taskSubmissionId: submission.id,
        writingSampleId: linkedSample.id,
        sourceSuggestionId: suggestion?.id ?? null,
        sourceMisspellingInstanceId: misspelling.id,
        sourceProvenance: isParentAddedMissedWord
          ? "lesson_submission_parent_added_missed_word"
          : "lesson_submission_existing_output",
        reviewedEventSourceEntityId: verificationTarget.sourceRef.sourceEntityId,
        originalChildSpelling: misspelling.misspelled_word ?? null,
        originalCorrectSpelling:
          (misspelling.suggested_word ?? misspelling.corrected_word) ?? null,
        misspellingNormalized,
        correctSpellingNormalized,
        microSkillKey: selectedMicroSkillKey,
        metadata: {
          source_misspelling_instance_id: misspelling.id,
          source_suggestion_id: suggestion?.id ?? null,
          candidate_status: "pending_parent_promotion",
          promotion_scope: "parent_local",
        },
      });
    } catch (error) {
      console.error("Candidate mapping creation failed before redirect.", error);
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "Verified evidence was prepared, but the candidate mapping could not be captured yet.",
        ),
      );
    }
  }

  if (suggestion?.id) {
    try {
      await markSuggestionReviewedAsAccepted({
        supabase,
        suggestionId: suggestion.id,
        parentUserId: user.id,
      });
    } catch (error) {
      console.error("Candidate capture could not mark the suggestion reviewed.", error);
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "Candidate mapping was captured, but the reviewed suggestion could not be marked complete yet.",
        ),
      );
    }
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Saved as verified evidence. Candidate mapping captured. Not used for future suggestions until promoted.",
    ),
  );
}

export async function promoteParentLocalCandidateMappingImpl(formData: FormData) {
  const candidateMappingId = formData.get("candidate_mapping_id");
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof candidateMappingId !== "string" ||
    !candidateMappingId ||
    typeof submissionId !== "string" ||
    !submissionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't identify that candidate mapping.",
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

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, child_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that lesson submission anymore.",
      ),
    );
  }

  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(supabase);
  const candidateMapping = await candidateMappingRepository.findByIdForParentChild({
    id: candidateMappingId,
    parentUserId: user.id,
    childId: submission.child_id,
  });

  if (!candidateMapping) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that candidate mapping for this child.",
      ),
    );
  }

  if (
    candidateMapping.task_submission_id !== submission.id ||
    candidateMapping.promotion_scope !== "parent_local" ||
    (candidateMapping.source_provenance !== "lesson_submission_existing_output" &&
      candidateMapping.source_provenance !== "lesson_submission_parent_added_missed_word")
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only lesson-submission parent-local candidate mappings can be promoted here.",
      ),
    );
  }

  const catalogEntry = await getReviewWorkCandidateCaptureMicroSkillCatalogEntry({
    supabase,
    microSkillKey: candidateMapping.micro_skill_key,
  });

  if (!catalogEntry) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That candidate mapping no longer points at a valid canonical micro-skill.",
      ),
    );
  }

  if (!catalogEntry.isActive) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Inactive micro-skills cannot be used for parent-local promotion.",
      ),
    );
  }

  if (!catalogEntry.isAssignable) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Non-assignable micro-skills cannot be used for parent-local promotion.",
      ),
    );
  }

  if (catalogEntry.masteryDomainKey !== "D4") {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That candidate mapping is outside the bounded spelling scope for parent-local promotion.",
      ),
    );
  }

  if (
    candidateMapping.candidate_status !== "pending_parent_promotion" ||
    candidateMapping.promotion_scope !== "parent_local"
  ) {
    const errorMessage =
      candidateMapping.candidate_status === "parent_local_promoted"
        ? "That candidate mapping is already promoted for this child."
        : "Only pending parent-local candidate mappings can be promoted here.";
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", errorMessage));
  }

  const conflictingMappings =
    await candidateMappingRepository.findConflictingScopedPromotedMappings({
      parentUserId: user.id,
      childId: submission.child_id,
      misspellingNormalized: candidateMapping.misspelling_normalized,
      correctSpellingNormalized: candidateMapping.correct_spelling_normalized,
      microSkillKey: candidateMapping.micro_skill_key,
      excludeId: candidateMapping.id,
    });

  if (conflictingMappings.length > 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "A different promoted mapping already exists for this misspelling in this child scope.",
      ),
    );
  }

  let promotionResult:
    | Awaited<ReturnType<typeof candidateMappingRepository.promoteParentLocalPending>>
    | null = null;

  try {
    promotionResult = await candidateMappingRepository.promoteParentLocalPending({
      id: candidateMapping.id,
      parentUserId: user.id,
      childId: submission.child_id,
      actionSource: "review_work_parent_local_promotion",
      nowIso: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Parent-local candidate promotion failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't promote that candidate mapping just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      promotionResult?.status === "already_promoted"
        ? "Candidate mapping was already promoted for this child."
        : "Candidate mapping promoted for this child. Future matching suggestions can now reuse it in this parent/child scope.",
    ),
  );
}

export async function revertParentLocalCandidateMappingImpl(formData: FormData) {
  const candidateMappingId = formData.get("candidate_mapping_id");
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof candidateMappingId !== "string" ||
    !candidateMappingId ||
    typeof submissionId !== "string" ||
    !submissionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't identify that promoted mapping.",
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

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, child_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that lesson submission anymore.",
      ),
    );
  }

  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(supabase);
  const candidateMapping = await candidateMappingRepository.findByIdForParentChild({
    id: candidateMappingId,
    parentUserId: user.id,
    childId: submission.child_id,
  });

  if (!candidateMapping) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that promoted mapping for this child.",
      ),
    );
  }

  if (
    candidateMapping.task_submission_id !== submission.id ||
    candidateMapping.promotion_scope !== "parent_local"
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only lesson-submission parent-local promoted mappings can be reverted here.",
      ),
    );
  }

  if (candidateMapping.candidate_status !== "parent_local_promoted") {
    const errorMessage =
      candidateMapping.candidate_status === "pending_parent_promotion"
        ? "That candidate mapping is already pending."
        : "Only promoted parent-local candidate mappings can be reverted here.";
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", errorMessage));
  }

  let reversionResult:
    | Awaited<ReturnType<typeof candidateMappingRepository.revertParentLocalPromoted>>
    | null = null;

  try {
    reversionResult = await candidateMappingRepository.revertParentLocalPromoted({
      id: candidateMapping.id,
      parentUserId: user.id,
      childId: submission.child_id,
      actionSource: "review_work_parent_local_reversal",
      nowIso: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Parent-local candidate reversion failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't revert that promoted mapping just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      reversionResult?.status === "already_pending"
        ? "Candidate mapping was already pending for this child."
        : "Candidate mapping returned to pending. It will no longer be reused by future suggestions until promoted again.",
    ),
  );
}
