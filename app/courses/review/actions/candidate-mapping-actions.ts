import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getReviewWorkCandidateCaptureMicroSkillCatalogEntry } from "@/lib/writing-engine/persistence/learning-items";
import { createSupabaseSpellingCanonicalRecommendationRepository } from "@/lib/writing-engine/persistence/spelling-canonical-recommendations";
import {
  createSupabaseSpellingCandidateMappingRepository,
  type SpellingCandidateMappingRecord,
} from "@/lib/writing-engine/persistence/spelling-candidate-mappings";
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
import { loadReturnedCorrectionRouteContext } from "./returned-correction-route-helpers";
import {
  isWritingIssueFinalClassification,
  doesFinalClassificationCreateLearningItem,
} from "@/lib/writing-practice/types";

type OwnedSubmissionForCandidateCapture = NonNullable<
  Awaited<ReturnType<typeof getOwnedSubmission>>["submission"]
>;

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getRecommendationSourceRowType(input: {
  sourceProvenance: string;
  metadata: Record<string, unknown>;
}) {
  if (readMetadataString(input.metadata, "source_route") === "returned_correction") {
    return "returned_correction" as const;
  }

  if (input.sourceProvenance === "lesson_submission_parent_added_missed_word") {
    return "parent_added_missed_word" as const;
  }

  return "engine_suggested" as const;
}

function isOpenRecommendationDuplicateError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  return (
    message.includes("duplicate key") ||
    message.includes("spelling_canonical_mapping_recommendations_open_candidate_idx") ||
    message.includes("spelling_canonical_mapping_recommendations_open_source_idx") ||
    message.includes("spelling_canonical_mapping_recommendations_open_event_idx")
  );
}

type AutoRecommendationResult =
  | { status: "sent" }
  | { status: "already_sent" }
  | { status: "failed" };

async function createAdminRecommendationForPromotedCandidateMapping(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  candidateMapping: SpellingCandidateMappingRecord;
  actionSource: string;
}): Promise<AutoRecommendationResult> {
  const recommendationRepository =
    createSupabaseSpellingCanonicalRecommendationRepository(input.supabase);
  const existingRecommendation =
    await recommendationRepository.findOpenForCandidateMapping({
      parentUserId: input.parentUserId,
      childId: input.childId,
      candidateMappingId: input.candidateMapping.id,
    });

  if (existingRecommendation) {
    return { status: "already_sent" };
  }

  const sourceProvenance = input.candidateMapping.source_provenance as
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";
  const sourceRowType = getRecommendationSourceRowType({
    sourceProvenance,
    metadata: input.candidateMapping.metadata,
  });

  try {
    await recommendationRepository.insertPendingAdminReview({
      parentUserId: input.parentUserId,
      childId: input.childId,
      taskSubmissionId: input.candidateMapping.task_submission_id,
      writingSampleId: input.candidateMapping.writing_sample_id,
      sourceMisspellingInstanceId:
        input.candidateMapping.source_misspelling_instance_id,
      sourceWritingIssueId:
        sourceRowType === "returned_correction"
          ? readMetadataString(
              input.candidateMapping.metadata,
              "original_writing_issue_id",
            )
          : null,
      sourceCorrectionAttemptId:
        sourceRowType === "returned_correction"
          ? readMetadataString(input.candidateMapping.metadata, "correction_attempt_id")
          : null,
      parentVerificationId: input.candidateMapping.parent_verification_id,
      sourceSuggestionId: input.candidateMapping.source_suggestion_id,
      candidateMappingId: input.candidateMapping.id,
      sourceRowType,
      sourceProvenance,
      reviewedEventSourceEntityId:
        input.candidateMapping.reviewed_event_source_entity_id,
      originalChildSpelling: input.candidateMapping.original_child_spelling,
      originalCorrectSpelling: input.candidateMapping.original_correct_spelling,
      misspellingNormalized: input.candidateMapping.misspelling_normalized,
      correctSpellingNormalized: input.candidateMapping.correct_spelling_normalized,
      microSkillKey: input.candidateMapping.micro_skill_key,
      metadata: {
        source_candidate_mapping_status: input.candidateMapping.candidate_status,
        source_candidate_mapping_scope: input.candidateMapping.promotion_scope,
        source_candidate_mapping_metadata: input.candidateMapping.metadata,
        action_source: input.actionSource,
        parent_ui_source: "unified_spelling_review_table",
        resolver_visible: false,
      },
    });
  } catch (error) {
    if (isOpenRecommendationDuplicateError(error)) {
      return { status: "already_sent" };
    }

    console.error("Parent canonical recommendation capture failed.", error);
    return { status: "failed" };
  }

  return { status: "sent" };
}

async function promoteAndRecommendParentLocalCandidateMapping(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  candidateMapping: SpellingCandidateMappingRecord;
  promotionActionSource: string;
  recommendationActionSource: string;
}) {
  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(input.supabase);

  const conflictingMappings =
    await candidateMappingRepository.findConflictingScopedPromotedMappings({
      parentUserId: input.parentUserId,
      childId: input.childId,
      misspellingNormalized: input.candidateMapping.misspelling_normalized,
      correctSpellingNormalized: input.candidateMapping.correct_spelling_normalized,
      microSkillKey: input.candidateMapping.micro_skill_key,
      excludeId: input.candidateMapping.id,
    });

  if (conflictingMappings.length > 0) {
    throw new Error(
      "A different promoted mapping already exists for this misspelling in this child scope.",
    );
  }

  const promotionResult = await candidateMappingRepository.promoteParentLocalPending({
    id: input.candidateMapping.id,
    parentUserId: input.parentUserId,
    childId: input.childId,
    actionSource: input.promotionActionSource,
    nowIso: new Date().toISOString(),
  });
  const recommendationResult =
    await createAdminRecommendationForPromotedCandidateMapping({
      supabase: input.supabase,
      parentUserId: input.parentUserId,
      childId: input.childId,
      candidateMapping: promotionResult.record,
      actionSource: input.recommendationActionSource,
    });

  return {
    promotionResult,
    recommendationResult,
  };
}

function oneStepPromotionMessage(input: {
  recommendationResult: AutoRecommendationResult;
}) {
  if (input.recommendationResult.status === "already_sent") {
    return "Saved locally. Already sent for admin review.";
  }

  if (input.recommendationResult.status === "failed") {
    return "Saved locally. Admin review could not be sent yet.";
  }

  return "Saved for Scarlett and sent for admin review.";
}

async function captureReturnedCorrectionCandidateMapping(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  submission: OwnedSubmissionForCandidateCapture;
  originalWritingIssueId: string;
  correctionAttemptId: string | null;
  finalClassification: string | null;
  selectedMicroSkillKey: string;
  safeRedirectPath: string;
}) {
  const routeContext = await loadReturnedCorrectionRouteContext({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.submission.child_id,
    currentTaskSubmissionId: input.submission.id,
    originalWritingIssueId: input.originalWritingIssueId,
    correctionAttemptId: input.correctionAttemptId,
    finalClassificationOverride: input.finalClassification,
  });

  if (!routeContext) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "That returned correction cannot be routed until it has an issue outcome and source spelling lineage.",
      ),
    );
  }

  const catalogEntry = await getReviewWorkCandidateCaptureMicroSkillCatalogEntry({
    supabase: input.supabase,
    microSkillKey: input.selectedMicroSkillKey,
  });

  if (!catalogEntry) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Only catalog-backed micro-skills can be used for candidate capture.",
      ),
    );
  }

  if (catalogEntry.masteryDomainKey !== "D4") {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "That micro-skill is outside the bounded spelling scope for candidate capture.",
      ),
    );
  }

  if (!catalogEntry.isActive) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Inactive micro-skills cannot be used for candidate capture.",
      ),
    );
  }

  if (!catalogEntry.isAssignable) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Non-assignable micro-skills cannot be used for candidate capture.",
      ),
    );
  }

  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(input.supabase);

  const { data: existingCandidateMapping } = await input.supabase
    .from("parent_verified_spelling_candidate_mappings")
    .select("id")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.submission.child_id)
    .eq("source_misspelling_instance_id", routeContext.misspelling.id)
    .in("candidate_status", ["pending_parent_promotion", "parent_local_promoted"])
    .limit(1)
    .maybeSingle();

  if (existingCandidateMapping) {
    const candidateMapping = await candidateMappingRepository.findByIdForParentChild({
      id: existingCandidateMapping.id,
      parentUserId: input.parentUserId,
      childId: input.submission.child_id,
    });

    if (!candidateMapping) {
      redirect(
        buildRedirectWithMessage(
          input.safeRedirectPath,
          "error",
          "We couldn't find that returned correction skill route for this child.",
        ),
      );
    }

    let combinedResult:
      | Awaited<ReturnType<typeof promoteAndRecommendParentLocalCandidateMapping>>
      | null = null;

    try {
      combinedResult = await promoteAndRecommendParentLocalCandidateMapping({
        supabase: input.supabase,
        parentUserId: input.parentUserId,
        childId: input.submission.child_id,
        candidateMapping,
        promotionActionSource:
          "review_work_returned_correction_parent_local_promotion",
        recommendationActionSource:
          "review_work_parent_local_promotion_auto_recommendation",
      });
    } catch (error) {
      console.error(
        "Returned correction candidate mapping promotion failed before redirect.",
        error,
      );
      redirect(
        buildRedirectWithMessage(
          input.safeRedirectPath,
          "error",
          error instanceof Error && error.message
            ? error.message
            : "We couldn't save that returned correction skill route right now.",
        ),
      );
    }

    if (!combinedResult) {
      redirect(
        buildRedirectWithMessage(
          input.safeRedirectPath,
          "error",
          "We couldn't save that returned correction skill route right now.",
        ),
      );
    }

    revalidateReviewQueueAndDetailBestEffort(input.safeRedirectPath);

    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "saved",
        oneStepPromotionMessage({
          recommendationResult: combinedResult.recommendationResult,
        }),
      ),
    );
  }

  let parentVerificationId: string | null = null;

  try {
    const verificationResult = await recordStage7dParentVerificationWithoutPromotion({
      supabase: input.supabase,
      childId: input.submission.child_id,
      parentUserId: input.parentUserId,
      decision: "overridden",
      verifiedMicroSkillKey: input.selectedMicroSkillKey,
      note: "Returned correction classified for parent-local candidate capture.",
      target: routeContext.verificationTarget,
    });
    parentVerificationId = verificationResult.verificationRecord.id;
  } catch (error) {
    console.error("Returned correction candidate verification failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "We couldn't save that returned correction skill route right now.",
      ),
    );
  }

  let candidateMapping: SpellingCandidateMappingRecord | null = null;

  try {
    candidateMapping = await candidateMappingRepository.insertPending({
      parentUserId: input.parentUserId,
      childId: input.submission.child_id,
      parentVerificationId,
      taskSubmissionId: input.submission.id,
      writingSampleId: routeContext.misspelling.writing_sample_id,
      sourceSuggestionId: routeContext.issue.source_suggestion_id,
      sourceMisspellingInstanceId: routeContext.misspelling.id,
      sourceProvenance: routeContext.sourceProvenance,
      reviewedEventSourceEntityId: routeContext.verificationTarget.sourceRef.sourceEntityId,
      originalChildSpelling: routeContext.originalChildSpelling,
      originalCorrectSpelling: routeContext.originalCorrectSpelling,
      misspellingNormalized: routeContext.misspellingNormalized,
      correctSpellingNormalized: routeContext.correctSpellingNormalized,
      microSkillKey: input.selectedMicroSkillKey,
      metadata: {
        ...routeContext.routeMetadata,
        candidate_status: "pending_parent_promotion",
        promotion_scope: "parent_local",
        action_source: "review_work_returned_correction_candidate_capture",
      },
    });
  } catch (error) {
    console.error("Returned correction candidate mapping creation failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Returned correction evidence was prepared, but the skill route could not be captured yet.",
      ),
    );
  }

  if (!candidateMapping) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Returned correction evidence was captured, but the skill route could not be found yet.",
      ),
    );
  }

  let combinedResult:
    | Awaited<ReturnType<typeof promoteAndRecommendParentLocalCandidateMapping>>
    | null = null;

  try {
    combinedResult = await promoteAndRecommendParentLocalCandidateMapping({
      supabase: input.supabase,
      parentUserId: input.parentUserId,
      childId: input.submission.child_id,
      candidateMapping,
      promotionActionSource:
        "review_work_returned_correction_parent_local_promotion",
      recommendationActionSource:
        "review_work_parent_local_promotion_auto_recommendation",
    });
  } catch (error) {
    console.error(
      "Returned correction candidate mapping promotion failed before redirect.",
      error,
    );
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Returned correction evidence was captured, but the skill route could not be promoted yet.",
      ),
    );
  }

  if (!combinedResult) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "Returned correction evidence was captured, but the skill route could not be saved yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(input.safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      input.safeRedirectPath,
      "saved",
      oneStepPromotionMessage({
        recommendationResult: combinedResult.recommendationResult,
      }),
    ),
  );
}

export async function captureSubmissionSpellingCandidateMappingImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const originalWritingIssueId = formData.get("original_writing_issue_id");
  const correctionAttemptId = formData.get("correction_attempt_id");
  const finalClassification = formData.get("final_classification");
  const selectedMicroSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    !(
      (typeof misspellingInstanceId === "string" && misspellingInstanceId) ||
      (typeof originalWritingIssueId === "string" && originalWritingIssueId)
    )
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

  const safeFinalClassification =
    typeof finalClassification === "string" &&
    isWritingIssueFinalClassification(finalClassification) &&
    doesFinalClassificationCreateLearningItem(finalClassification)
      ? finalClassification
      : null;

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

  if (typeof originalWritingIssueId === "string" && originalWritingIssueId) {
    await captureReturnedCorrectionCandidateMapping({
      supabase,
      parentUserId: user.id,
      submission,
      originalWritingIssueId,
      correctionAttemptId:
        typeof correctionAttemptId === "string" && correctionAttemptId
          ? correctionAttemptId
          : null,
      finalClassification: safeFinalClassification,
      selectedMicroSkillKey,
      safeRedirectPath,
    });
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

  let candidateMapping =
    parentVerificationId
      ? await candidateMappingRepository.findByParentVerificationId(parentVerificationId)
      : null;

  if (!candidateMapping && parentVerificationId) {
    try {
      candidateMapping = await candidateMappingRepository.insertPending({
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

  if (!candidateMapping) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Verified evidence was prepared, but the candidate mapping could not be found yet.",
      ),
    );
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

  let combinedResult:
    | Awaited<ReturnType<typeof promoteAndRecommendParentLocalCandidateMapping>>
    | null = null;

  try {
    combinedResult = await promoteAndRecommendParentLocalCandidateMapping({
      supabase,
      parentUserId: user.id,
      childId: submission.child_id,
      candidateMapping,
      promotionActionSource: "review_work_parent_local_promotion",
      recommendationActionSource:
        "review_work_parent_local_promotion_auto_recommendation",
    });
  } catch (error) {
    console.error("Candidate mapping promotion failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Candidate mapping was captured, but the skill route could not be promoted yet.",
      ),
    );
  }

  if (!combinedResult) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Candidate mapping was captured, but the skill route could not be saved yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      oneStepPromotionMessage({
        recommendationResult: combinedResult.recommendationResult,
      }),
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
    (candidateMapping.candidate_status !== "pending_parent_promotion" &&
      candidateMapping.candidate_status !== "parent_local_promoted") ||
    candidateMapping.promotion_scope !== "parent_local"
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only pending or promoted parent-local candidate mappings can be saved here.",
      ),
    );
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

  let combinedResult:
    | Awaited<ReturnType<typeof promoteAndRecommendParentLocalCandidateMapping>>
    | null = null;

  try {
    combinedResult = await promoteAndRecommendParentLocalCandidateMapping({
      supabase,
      parentUserId: user.id,
      childId: submission.child_id,
      candidateMapping,
      promotionActionSource: "review_work_parent_local_promotion",
      recommendationActionSource:
        "review_work_parent_local_promotion_auto_recommendation",
    });
  } catch (error) {
    console.error("Parent-local candidate promotion failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        error instanceof Error && error.message
          ? error.message
          : "We couldn't promote that candidate mapping just yet.",
      ),
    );
  }

  if (!combinedResult) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't save that candidate mapping just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      oneStepPromotionMessage({
        recommendationResult: combinedResult.recommendationResult,
      }),
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

export async function recommendParentLocalCanonicalMappingImpl(formData: FormData) {
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
        "We couldn't identify that parent-local mapping.",
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
        "We couldn't find that parent-local mapping for this child.",
      ),
    );
  }

  if (
    candidateMapping.task_submission_id !== submission.id ||
    candidateMapping.promotion_scope !== "parent_local" ||
    candidateMapping.candidate_status !== "parent_local_promoted" ||
    (candidateMapping.source_provenance !== "lesson_submission_existing_output" &&
      candidateMapping.source_provenance !== "lesson_submission_parent_added_missed_word")
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only promoted lesson-submission parent-local mappings can be recommended here.",
      ),
    );
  }
  const sourceProvenance = candidateMapping.source_provenance as
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";

  const catalogEntry = await getReviewWorkCandidateCaptureMicroSkillCatalogEntry({
    supabase,
    microSkillKey: candidateMapping.micro_skill_key,
  });

  if (!catalogEntry) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That parent-local mapping no longer points at a valid canonical micro-skill.",
      ),
    );
  }

  if (
    catalogEntry.masteryDomainKey !== "D4" ||
    !catalogEntry.isActive ||
    !catalogEntry.isAssignable
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only active assignable spelling micro-skills can be recommended for canonical review.",
      ),
    );
  }

  if (
    !candidateMapping.misspelling_normalized ||
    !candidateMapping.correct_spelling_normalized ||
    candidateMapping.misspelling_normalized ===
      candidateMapping.correct_spelling_normalized
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That parent-local mapping does not have a safe spelling pair to recommend.",
      ),
    );
  }

  const recommendationRepository =
    createSupabaseSpellingCanonicalRecommendationRepository(supabase);
  const existingRecommendation =
    await recommendationRepository.findOpenForCandidateMapping({
      parentUserId: user.id,
      childId: submission.child_id,
      candidateMappingId: candidateMapping.id,
    });

  if (existingRecommendation) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "This pairing is already recommended for admin review.",
      ),
    );
  }

  const sourceRowType = getRecommendationSourceRowType({
    sourceProvenance,
    metadata: candidateMapping.metadata,
  });

  try {
    await recommendationRepository.insertPendingAdminReview({
      parentUserId: user.id,
      childId: submission.child_id,
      taskSubmissionId: candidateMapping.task_submission_id,
      writingSampleId: candidateMapping.writing_sample_id,
      sourceMisspellingInstanceId: candidateMapping.source_misspelling_instance_id,
      sourceWritingIssueId:
        sourceRowType === "returned_correction"
          ? readMetadataString(candidateMapping.metadata, "original_writing_issue_id")
          : null,
      sourceCorrectionAttemptId:
        sourceRowType === "returned_correction"
          ? readMetadataString(candidateMapping.metadata, "correction_attempt_id")
          : null,
      parentVerificationId: candidateMapping.parent_verification_id,
      sourceSuggestionId: candidateMapping.source_suggestion_id,
      candidateMappingId: candidateMapping.id,
      sourceRowType,
      sourceProvenance,
      reviewedEventSourceEntityId: candidateMapping.reviewed_event_source_entity_id,
      originalChildSpelling: candidateMapping.original_child_spelling,
      originalCorrectSpelling: candidateMapping.original_correct_spelling,
      misspellingNormalized: candidateMapping.misspelling_normalized,
      correctSpellingNormalized: candidateMapping.correct_spelling_normalized,
      microSkillKey: candidateMapping.micro_skill_key,
      metadata: {
        source_candidate_mapping_status: candidateMapping.candidate_status,
        source_candidate_mapping_scope: candidateMapping.promotion_scope,
        source_candidate_mapping_metadata: candidateMapping.metadata,
        action_source: "review_work_parent_recommended_canonical_mapping",
        parent_ui_source: "unified_spelling_review_table",
        resolver_visible: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("duplicate key") ||
      message.includes("spelling_canonical_mapping_recommendations_open_candidate_idx")
    ) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "saved",
          "This pairing is already recommended for admin review.",
        ),
      );
    }

    console.error("Parent canonical recommendation capture failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't recommend that pairing for admin review just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Pairing recommended for admin review. It will not change global suggestions unless approved later.",
    ),
  );
}
