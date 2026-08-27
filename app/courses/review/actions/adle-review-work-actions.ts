"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { intakeApprovedAdleReviewCorrection } from "@/lib/adle/loaders/canonical-intake-live";
import {
  buildAdleParentIssueSourceEntityId,
  classifyAdditionalSpellingOccurrence,
  normalizeObservedSpelling,
  readAttributedOccurrence,
} from "@/lib/adle/review-work/additional-spelling";
import {
  loadAdleReviewWorkDetail,
  type AdleReviewWorkDetail,
} from "@/lib/adle/review-work/read-model";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { findResolverVisibleExactPairMapping } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";
import { ensureCanonicalRecommendationForCandidateMapping } from "@/lib/writing-engine/persistence/spelling-canonical-recommendation-service";
import { normaliseSpellingCandidateMappingRecord } from "@/lib/writing-engine/persistence/spelling-candidate-mapping-repository";
import { getReviewWorkCandidateCaptureMicroSkillCatalogEntry } from "@/lib/writing-engine/persistence/learning-items";
import {
  buildStage7dSourceNeutralVerificationTarget,
  recordStage7dParentVerificationWithoutPromotion,
} from "@/lib/writing-engine/review/stage7d-parent-verification";
import { analyseParentAddedMisspellingPair } from "@/lib/writing-engine/spelling/parent-added-misspelling-analysis";

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/courses/review/") ? path : "/courses/review";
}

function redirectWithMessage(
  path: string,
  key: "saved" | "error",
  message: string,
): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

async function authorizeCompletedReview(formData: FormData): Promise<{
  detail: AdleReviewWorkDetail;
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  redirectPath: string;
}> {
  const redirectPath = safeRedirectPath(formData.get("redirect_path"));
  const sourceId = String(formData.get("source_id") ?? "");
  const childId = String(formData.get("child_id") ?? "");
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect("/login");
  const serviceClient = createServiceRoleClient();
  const detail = await loadAdleReviewWorkDetail({
    userClient,
    serviceClient,
    parentUserId: user.id,
    childId,
    sourceId,
  });
  if (!detail) {
    redirectWithMessage(
      redirectPath,
      "error",
      "That completed ADLE Review is not available for this child.",
    );
  }
  return { detail, serviceClient, redirectPath };
}

export async function submitAdleReviewWorkInspection(formData: FormData) {
  const context = await authorizeCompletedReview(formData);
  const unresolvedResult = await context.serviceClient
    .from("adle_review_parent_issue_links")
    .select("id")
    .eq("review_session_id", context.detail.reviewSessionId)
    .eq("parent_user_id", context.detail.parentUserId)
    .eq("child_id", context.detail.childId)
    .eq("resolution_status", "needs_route")
    .limit(1);
  if (unresolvedResult.error) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "The spelling review could not be checked before submitting.",
    );
  }
  if ((unresolvedResult.data ?? []).length > 0) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "Finish or dismiss every added misspelling before submitting this inspection.",
    );
  }
  const { error } = await context.serviceClient
    .from("adle_review_parent_reviews")
    .upsert(
      {
        review_session_id: context.detail.reviewSessionId,
        parent_user_id: context.detail.parentUserId,
        child_id: context.detail.childId,
        reviewed_by_user_id: context.detail.parentUserId,
      },
      { onConflict: "review_session_id", ignoreDuplicates: true },
    );
  if (error) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "The parent review receipt could not be saved.",
    );
  }
  revalidatePath("/courses/review");
  revalidatePath(context.redirectPath.split("?")[0]);
  redirectWithMessage(
    context.redirectPath,
    "saved",
    "Submitted. Learner completion, schedules and rewards were not changed.",
  );
}

function parseOccurrence(formData: FormData) {
  const observedSpelling = normalizeObservedSpelling(
    String(formData.get("observed_spelling") ?? ""),
  );
  const correctSpelling = normalizeObservedSpelling(
    String(formData.get("correct_spelling") ?? ""),
  );
  const positionStart = Number(formData.get("position_start"));
  const positionEnd = Number(formData.get("position_end"));
  if (
    !observedSpelling ||
    !correctSpelling ||
    observedSpelling === correctSpelling ||
    !Number.isInteger(positionStart) ||
    !Number.isInteger(positionEnd) ||
    positionStart < 0 ||
    positionEnd <= positionStart
  ) {
    return null;
  }
  return { observedSpelling, correctSpelling, positionStart, positionEnd };
}

export async function addAdleReviewParentSpellingCandidate(formData: FormData) {
  const context = await authorizeCompletedReview(formData);
  const occurrence = parseOccurrence(formData);
  if (!occurrence) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "Choose an exact misspelling occurrence and enter a different correct spelling.",
    );
  }
  if (context.detail.observationalStatus === "reviewed") {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "This parent inspection has already been submitted and is now read-only.",
    );
  }
  const exactText = context.detail.submittedWritingText.slice(
    occurrence.positionStart,
    occurrence.positionEnd,
  );
  if (normalizeObservedSpelling(exactText) !== occurrence.observedSpelling) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "That occurrence no longer matches the immutable submitted writing.",
    );
  }

  const dedupe = classifyAdditionalSpellingOccurrence({
    ...occurrence,
    targets: context.detail.targets.map((target) =>
      readAttributedOccurrence({
        attributionProvenance: target.attributionProvenance,
        canonicalSpelling: target.canonicalSpelling,
        encounterId: target.encounterId,
        originalOutcomeSource: target.originalOutcomeSource,
      }),
    ),
  });
  if (dedupe.status === "already_captured") {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "Already captured by this ADLE Review. No additional learning or schedule event was created.",
    );
  }

  const analysis = analyseParentAddedMisspellingPair({
    observedSpelling: occurrence.observedSpelling,
    correctSpelling: occurrence.correctSpelling,
  });
  if (!analysis) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "Add two different spellings before saving this misspelling.",
    );
  }

  const existingResult = await context.serviceClient
    .from("adle_review_parent_issue_links")
    .select("id")
    .eq("review_session_id", context.detail.reviewSessionId)
    .eq("position_start", occurrence.positionStart)
    .eq("position_end", occurrence.positionEnd)
    .eq("observed_spelling_normalized", occurrence.observedSpelling)
    .eq("correct_spelling_normalized", occurrence.correctSpelling)
    .maybeSingle();
  if (existingResult.error) {
    redirectWithMessage(context.redirectPath, "error", "The spelling candidate could not be checked.");
  }
  if (existingResult.data) {
    redirectWithMessage(context.redirectPath, "saved", "That exact spelling occurrence is already in review.");
  }

  const suggestionId = randomUUID();
  const contextStart = Math.max(0, occurrence.positionStart - 35);
  const contextEnd = Math.min(
    context.detail.submittedWritingText.length,
    occurrence.positionEnd + 35,
  );
  const { error: suggestionError } = await context.serviceClient
    .from("writing_issue_suggestions")
    .insert({
      id: suggestionId,
      child_id: context.detail.childId,
      parent_user_id: context.detail.parentUserId,
      task_submission_id: null,
      writing_sample_id: null,
      misspelling_instance_id: null,
      source_type: "parent_manual",
      suggestion_status: "pending",
      observed_text: exactText,
      suggested_replacement: occurrence.correctSpelling,
      context_text: context.detail.submittedWritingText.slice(
        contextStart,
        contextEnd,
      ),
      source_field_key: "adle_review_submitted_writing",
      position_start: occurrence.positionStart,
      position_end: occurrence.positionEnd,
      suggested_micro_skill_key: "unknown",
      notes: "Parent identified this additional occurrence in completed ADLE Review writing.",
      metadata: {
        sourceType: "adle_review_v3",
        reviewSessionId: context.detail.reviewSessionId,
        dailyAssignmentId: context.detail.dailyAssignmentId,
        observationalOnly: true,
        parentAddedAnalysis: analysis,
      },
    });
  if (suggestionError) {
    redirectWithMessage(context.redirectPath, "error", "The spelling candidate could not be saved.");
  }
  const { error: linkError } = await context.serviceClient
    .from("adle_review_parent_issue_links")
    .insert({
      review_session_id: context.detail.reviewSessionId,
      parent_user_id: context.detail.parentUserId,
      child_id: context.detail.childId,
      position_start: occurrence.positionStart,
      position_end: occurrence.positionEnd,
      observed_spelling_normalized: occurrence.observedSpelling,
      correct_spelling_normalized: occurrence.correctSpelling,
      source_suggestion_id: suggestionId,
      analysis_payload: {
        detectedErrorPattern: analysis.detectedErrorPattern,
        primaryCategory: analysis.primaryCategory,
        secondaryCategory: analysis.secondaryCategory,
        selectedWordFamilyId: analysis.selectedWordFamilyId,
      },
      resolution_status: "needs_route",
    });
  if (linkError) {
    await context.serviceClient
      .from("writing_issue_suggestions")
      .delete()
      .eq("id", suggestionId)
      .eq("parent_user_id", context.detail.parentUserId);
    redirectWithMessage(context.redirectPath, "error", "The spelling occurrence could not be linked.");
  }
  revalidatePath(context.redirectPath.split("?")[0]);
  redirectWithMessage(
    context.redirectPath,
    "saved",
    "Misspelling added to the spelling review table below.",
  );
}

async function loadOwnedIssue(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  detail: AdleReviewWorkDetail,
  issueId: string,
) {
  const result = await serviceClient
    .from("adle_review_parent_issue_links")
    .select("*")
    .eq("id", issueId)
    .eq("review_session_id", detail.reviewSessionId)
    .eq("parent_user_id", detail.parentUserId)
    .eq("child_id", detail.childId)
    .maybeSingle();
  return result.error ? null : result.data;
}

export async function confirmAdleReviewParentSpellingCandidate(formData: FormData) {
  const context = await authorizeCompletedReview(formData);
  const issueId = String(formData.get("issue_id") ?? "");
  const selectedMicroSkillKey = String(formData.get("micro_skill_key") ?? "").trim();
  const issue = await loadOwnedIssue(
    context.serviceClient,
    context.detail,
    issueId,
  );
  if (!issue) {
    redirectWithMessage(context.redirectPath, "error", "That spelling candidate is not available.");
  }
  if (context.detail.observationalStatus === "reviewed") {
    redirectWithMessage(context.redirectPath, "error", "This submitted inspection is read-only.");
  }
  if (issue.resolution_status === "confirmed") {
    redirectWithMessage(context.redirectPath, "saved", "That spelling observation is already confirmed.");
  }
  if (issue.resolution_status !== "needs_route") {
    redirectWithMessage(context.redirectPath, "error", "That spelling candidate has already been resolved.");
  }
  if (!selectedMicroSkillKey || selectedMicroSkillKey.toLowerCase() === "unknown") {
    redirectWithMessage(context.redirectPath, "error", "Choose a learning route before confirming this spelling.");
  }

  const catalogEntry = await getReviewWorkCandidateCaptureMicroSkillCatalogEntry({
    supabase: context.serviceClient as never,
    microSkillKey: selectedMicroSkillKey,
  });
  if (
    !catalogEntry ||
    catalogEntry.masteryDomainKey !== "D4" ||
    !catalogEntry.isActive ||
    !catalogEntry.isAssignable
  ) {
    redirectWithMessage(context.redirectPath, "error", "That spelling route is not an active assignable D4 micro-skill.");
  }

  const exactText = context.detail.submittedWritingText.slice(
    issue.position_start,
    issue.position_end,
  );
  if (normalizeObservedSpelling(exactText) !== issue.observed_spelling_normalized) {
    redirectWithMessage(context.redirectPath, "error", "The saved occurrence no longer matches the immutable response.");
  }
  const canonicalMatch = await findResolverVisibleExactPairMapping({
    supabase: context.serviceClient,
    misspellingNormalized: issue.observed_spelling_normalized,
    correctSpellingNormalized: issue.correct_spelling_normalized,
  });
  const acceptingKnownMatch =
    canonicalMatch.status === "resolved" &&
    canonicalMatch.microSkillKey === selectedMicroSkillKey;

  const sourceEntityId = buildAdleParentIssueSourceEntityId({
    reviewSessionId: context.detail.reviewSessionId,
    positionStart: issue.position_start,
    positionEnd: issue.position_end,
    observedSpelling: issue.observed_spelling_normalized,
    correctSpelling: issue.correct_spelling_normalized,
  });
  const existingVerification = await context.serviceClient
    .from("parent_verifications")
    .select("id")
    .eq("parent_user_id", context.detail.parentUserId)
    .eq("child_id", context.detail.childId)
    .eq("source_type", "adle_review_submitted_writing_parent_identified")
    .eq("source_entity_id", sourceEntityId)
    .maybeSingle();
  if (existingVerification.error) {
    redirectWithMessage(context.redirectPath, "error", "The spelling verification could not be checked.");
  }

  let verificationId = existingVerification.data?.id as string | undefined;
  if (!verificationId) {
    const verificationTarget = buildStage7dSourceNeutralVerificationTarget({
      sourceRef: {
        sourceType: "adle_review_submitted_writing_parent_identified",
        sourceEntityId,
        taskSubmissionId: null,
        writingSampleId: null,
        metadata: {
          sourceType: "adle_review_v3",
          reviewSessionId: context.detail.reviewSessionId,
          dailyAssignmentId: context.detail.dailyAssignmentId,
          positionStart: issue.position_start,
          positionEnd: issue.position_end,
          observationalStatusIndependent: true,
        },
      },
      observedText: issue.observed_spelling_normalized,
      suggestedReplacement: issue.correct_spelling_normalized,
      contextText: context.detail.submittedWritingText.slice(
        Math.max(0, issue.position_start - 35),
        Math.min(context.detail.submittedWritingText.length, issue.position_end + 35),
      ),
      positionStart: issue.position_start,
      positionEnd: issue.position_end,
      suggestedCategoryCode: null,
      suggestedMicroSkillKey:
        canonicalMatch.status === "resolved" ? canonicalMatch.microSkillKey : null,
      notes: "Parent-confirmed additional spelling issue from completed ADLE Review writing.",
    });
    if (!verificationTarget) {
      redirectWithMessage(context.redirectPath, "error", "The spelling verification could not be saved.");
    }
    const verificationResult = await recordStage7dParentVerificationWithoutPromotion({
      supabase: context.serviceClient,
      childId: context.detail.childId,
      parentUserId: context.detail.parentUserId,
      decision: acceptingKnownMatch ? "accepted" : "overridden",
      verifiedMicroSkillKey: acceptingKnownMatch ? null : selectedMicroSkillKey,
      target: verificationTarget,
    });
    verificationId = verificationResult.verificationRecord.id;
  }

  const existingMapping = await context.serviceClient
    .from("parent_verified_spelling_candidate_mappings")
    .select("*")
    .eq("parent_verification_id", verificationId)
    .maybeSingle();
  if (existingMapping.error) {
    redirectWithMessage(context.redirectPath, "error", "The canonical candidate could not be checked.");
  }
  let candidateMappingId = existingMapping.data?.id as string | undefined;
  let candidateMapping = normaliseSpellingCandidateMappingRecord(existingMapping.data);
  if (!candidateMappingId) {
    const mappingResult = await context.serviceClient
      .from("parent_verified_spelling_candidate_mappings")
      .insert({
        parent_user_id: context.detail.parentUserId,
        child_id: context.detail.childId,
        parent_verification_id: verificationId,
        task_submission_id: null,
        writing_sample_id: null,
        source_suggestion_id: issue.source_suggestion_id,
        source_misspelling_instance_id: null,
        source_adle_review_session_id: context.detail.reviewSessionId,
        source_provenance: "adle_review_submitted_writing_parent_identified",
        reviewed_event_source_entity_id: sourceEntityId,
        original_child_spelling: exactText,
        original_correct_spelling: issue.correct_spelling_normalized,
        misspelling_normalized: issue.observed_spelling_normalized,
        correct_spelling_normalized: issue.correct_spelling_normalized,
        micro_skill_key: selectedMicroSkillKey,
        candidate_status: "parent_local_promoted",
        promotion_scope: "parent_local",
        metadata: {
          canonicalMappingId:
            canonicalMatch.status === "resolved" ? canonicalMatch.mappingId : null,
          sourceOccurrence: {
            positionStart: issue.position_start,
            positionEnd: issue.position_end,
          },
        },
      })
      .select("*")
      .single();
    if (mappingResult.error || !mappingResult.data) {
      redirectWithMessage(context.redirectPath, "error", "The canonical learning candidate could not be saved.");
    }
    candidateMappingId = mappingResult.data.id;
    candidateMapping = normaliseSpellingCandidateMappingRecord(mappingResult.data);
  }

  if (!candidateMapping || candidateMapping.micro_skill_key !== selectedMicroSkillKey) {
    redirectWithMessage(
      context.redirectPath,
      "error",
      "The canonical candidate route did not match this parent confirmation.",
    );
  }

  let canonicalRecommendationId: string | null = null;
  if (!acceptingKnownMatch) {
    const recommendationResult = await ensureCanonicalRecommendationForCandidateMapping({
      supabase: context.serviceClient as never,
      parentUserId: context.detail.parentUserId,
      childId: context.detail.childId,
      candidateMapping,
      actionSource: "adle_review_parent_observation_confirmation",
      sourceAdleReviewParentIssueLinkId: issue.id,
    });
    if (recommendationResult.status === "failed") {
      console.error("ADLE canonical recommendation capture failed.", recommendationResult.error);
      redirectWithMessage(
        context.redirectPath,
        "error",
        "The learning signal was saved locally, but canonical admin review could not be queued yet. Please retry.",
      );
    }
    canonicalRecommendationId = recommendationResult.recommendation.id;
  }

  const { error: suggestionError } = await context.serviceClient
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "accepted",
      suggested_micro_skill_key: selectedMicroSkillKey,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", issue.source_suggestion_id)
    .eq("parent_user_id", context.detail.parentUserId);
  const { error: linkError } = await context.serviceClient
    .from("adle_review_parent_issue_links")
    .update({
      parent_verification_id: verificationId,
      candidate_mapping_id: candidateMappingId,
      canonical_recommendation_id: canonicalRecommendationId,
      resolution_status: "confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", issue.id)
    .eq("resolution_status", "needs_route");
  if (suggestionError || linkError) {
    redirectWithMessage(context.redirectPath, "error", "The confirmed observation could not be finalized.");
  }

  if (!candidateMappingId) {
    redirectWithMessage(context.redirectPath, "error", "The canonical learning candidate was not available after confirmation.");
  }

  await intakeApprovedAdleReviewCorrection({
    serviceClient: context.serviceClient,
    parentUserId: context.detail.parentUserId,
    childId: context.detail.childId,
    adleReviewSessionId: context.detail.reviewSessionId,
    candidateMappingIds: [candidateMappingId],
  });
  revalidatePath(context.redirectPath.split("?")[0]);
  redirectWithMessage(
    context.redirectPath,
    "saved",
    "Confirmed as a separate parent-verified spelling signal. The completed Review result was not changed.",
  );
}

export async function sendAdleReviewParentSpellingCandidateToCatalog(
  formData: FormData,
) {
  const context = await authorizeCompletedReview(formData);
  const issueId = String(formData.get("issue_id") ?? "");
  const issue = await loadOwnedIssue(
    context.serviceClient,
    context.detail,
    issueId,
  );
  if (!issue) {
    redirectWithMessage(context.redirectPath, "error", "That spelling candidate is not available.");
  }
  if (context.detail.observationalStatus === "reviewed") {
    redirectWithMessage(context.redirectPath, "error", "This submitted inspection is read-only.");
  }
  if (issue.resolution_status === "sent_to_admin") {
    redirectWithMessage(context.redirectPath, "saved", "That spelling route is already with catalog review.");
  }
  if (issue.resolution_status !== "needs_route") {
    redirectWithMessage(context.redirectPath, "error", "That spelling candidate has already been resolved.");
  }

  const sourceEntityId = buildAdleParentIssueSourceEntityId({
    reviewSessionId: context.detail.reviewSessionId,
    positionStart: issue.position_start,
    positionEnd: issue.position_end,
    observedSpelling: issue.observed_spelling_normalized,
    correctSpelling: issue.correct_spelling_normalized,
  });
  const existingVerification = await context.serviceClient
    .from("parent_verifications")
    .select("id")
    .eq("parent_user_id", context.detail.parentUserId)
    .eq("child_id", context.detail.childId)
    .eq("source_type", "adle_review_submitted_writing_parent_identified")
    .eq("source_entity_id", sourceEntityId)
    .maybeSingle();
  if (existingVerification.error) {
    redirectWithMessage(context.redirectPath, "error", "The parent confirmation could not be checked.");
  }
  let parentVerificationId = existingVerification.data?.id as string | undefined;
  if (!parentVerificationId) {
    const verificationTarget = buildStage7dSourceNeutralVerificationTarget({
      sourceRef: {
        sourceType: "adle_review_submitted_writing_parent_identified",
        sourceEntityId,
        taskSubmissionId: null,
        writingSampleId: null,
        metadata: {
          sourceType: "adle_review_v3",
          reviewSessionId: context.detail.reviewSessionId,
          dailyAssignmentId: context.detail.dailyAssignmentId,
          positionStart: issue.position_start,
          positionEnd: issue.position_end,
          awaitingAdminRoute: true,
        },
      },
      observedText: issue.observed_spelling_normalized,
      suggestedReplacement: issue.correct_spelling_normalized,
      contextText: context.detail.submittedWritingText.slice(
        Math.max(0, issue.position_start - 35),
        Math.min(context.detail.submittedWritingText.length, issue.position_end + 35),
      ),
      positionStart: issue.position_start,
      positionEnd: issue.position_end,
      suggestedCategoryCode: null,
      suggestedMicroSkillKey: null,
      notes: "Parent confirmed the spelling pair; an admin learning route is required.",
    });
    if (!verificationTarget) {
      redirectWithMessage(context.redirectPath, "error", "The parent confirmation could not be prepared.");
    }
    const verificationResult = await recordStage7dParentVerificationWithoutPromotion({
      supabase: context.serviceClient,
      childId: context.detail.childId,
      parentUserId: context.detail.parentUserId,
      decision: "accepted",
      verifiedMicroSkillKey: null,
      target: verificationTarget,
    });
    parentVerificationId = verificationResult.verificationRecord.id;
  }
  const existingResult = await context.serviceClient
    .from("spelling_catalog_review_cases")
    .select("id")
    .eq("parent_user_id", context.detail.parentUserId)
    .eq("child_id", context.detail.childId)
    .eq("source_adle_review_parent_issue_link_id", issue.id)
    .eq("case_status", "open")
    .maybeSingle();
  if (existingResult.error) {
    redirectWithMessage(context.redirectPath, "error", "The catalog route could not be checked.");
  }

  let catalogReviewCaseId = existingResult.data?.id as string | undefined;
  if (!catalogReviewCaseId) {
    const insertResult = await context.serviceClient
      .from("spelling_catalog_review_cases")
      .insert({
        parent_user_id: context.detail.parentUserId,
        child_id: context.detail.childId,
        task_submission_id: null,
        writing_sample_id: null,
        source_suggestion_id: issue.source_suggestion_id,
        source_misspelling_instance_id: null,
        source_adle_review_session_id: context.detail.reviewSessionId,
        source_adle_review_parent_issue_link_id: issue.id,
        source_provenance: "adle_review_submitted_writing_parent_identified",
        reviewed_event_source_entity_id: sourceEntityId,
        original_child_spelling: issue.observed_spelling_normalized,
        original_correct_spelling: issue.correct_spelling_normalized,
        misspelling_normalized: issue.observed_spelling_normalized,
        correct_spelling_normalized: issue.correct_spelling_normalized,
        case_status: "open",
        parent_note: "Parent found this occurrence in completed ADLE Review writing; no safe route was selected.",
        metadata: {
          sourceType: "adle_review_v3",
          reviewSessionId: context.detail.reviewSessionId,
          issueLinkId: issue.id,
          observationalOnly: true,
        },
      })
      .select("id")
      .single();
    if (insertResult.error || !insertResult.data) {
      redirectWithMessage(context.redirectPath, "error", "The spelling route could not be sent to catalog review.");
    }
    catalogReviewCaseId = insertResult.data.id;
  }

  const now = new Date().toISOString();
  const [linkResult, suggestionResult] = await Promise.all([
    context.serviceClient
      .from("adle_review_parent_issue_links")
      .update({
        catalog_review_case_id: catalogReviewCaseId,
        parent_verification_id: parentVerificationId,
        resolution_status: "sent_to_admin",
        updated_at: now,
      })
      .eq("id", issue.id)
      .eq("resolution_status", "needs_route"),
    context.serviceClient
      .from("writing_issue_suggestions")
      .update({ suggestion_status: "accepted", resolved_at: now })
      .eq("id", issue.source_suggestion_id)
      .eq("parent_user_id", context.detail.parentUserId),
  ]);
  if (linkResult.error || suggestionResult.error) {
    redirectWithMessage(context.redirectPath, "error", "The catalog handoff could not be finalized.");
  }
  revalidatePath(context.redirectPath.split("?")[0]);
  redirectWithMessage(
    context.redirectPath,
    "saved",
    "Sent to catalog review. The completed learner Review was not changed.",
  );
}

export async function rejectAdleReviewParentSpellingCandidate(formData: FormData) {
  const context = await authorizeCompletedReview(formData);
  const issueId = String(formData.get("issue_id") ?? "");
  const issue = await loadOwnedIssue(context.serviceClient, context.detail, issueId);
  if (!issue) redirectWithMessage(context.redirectPath, "error", "That spelling candidate is not available.");
  if (context.detail.observationalStatus === "reviewed") {
    redirectWithMessage(context.redirectPath, "error", "This submitted inspection is read-only.");
  }
  if (issue.resolution_status === "not_a_learning_issue") {
    redirectWithMessage(context.redirectPath, "saved", "That spelling candidate is already marked as not a learning issue.");
  }
  if (issue.resolution_status !== "needs_route") {
    redirectWithMessage(context.redirectPath, "error", "That spelling candidate has already been resolved.");
  }
  const sourceEntityId = buildAdleParentIssueSourceEntityId({
    reviewSessionId: context.detail.reviewSessionId,
    positionStart: issue.position_start,
    positionEnd: issue.position_end,
    observedSpelling: issue.observed_spelling_normalized,
    correctSpelling: issue.correct_spelling_normalized,
  });
  const verificationId = randomUUID();
  const now = new Date().toISOString();
  const verificationResult = await context.serviceClient.from("parent_verifications").insert({
      id: verificationId,
      child_id: context.detail.childId,
      parent_user_id: context.detail.parentUserId,
      domain_module: "spelling",
      source_type: "adle_review_submitted_writing_parent_identified",
      source_entity_id: sourceEntityId,
      decision: "false_positive",
      suggestion_payload: {
        observedText: issue.observed_spelling_normalized,
        suggestedReplacement: issue.correct_spelling_normalized,
      },
      metadata: { sourceType: "adle_review_v3", reviewSessionId: context.detail.reviewSessionId },
    });
  if (verificationResult.error) {
    redirectWithMessage(context.redirectPath, "error", "The rejection verification could not be saved.");
  }
  const [suppressionResult, suggestionResult] = await Promise.all([
    context.serviceClient.from("writing_false_positive_suppressions").insert({
      child_id: context.detail.childId,
      parent_user_id: context.detail.parentUserId,
      misspelled_word: issue.observed_spelling_normalized,
      corrected_word: issue.correct_spelling_normalized,
      source_writing_issue_suggestion_id: issue.source_suggestion_id,
      notes: "Rejected parent observation from completed ADLE Review writing.",
      metadata: { reviewSessionId: context.detail.reviewSessionId },
    }),
    context.serviceClient.from("writing_issue_suggestions").update({
      suggestion_status: "rejected",
      rejected_at: now,
      resolved_at: now,
    }).eq("id", issue.source_suggestion_id),
  ]);
  if (suppressionResult.error || suggestionResult.error) {
    redirectWithMessage(context.redirectPath, "error", "The rejection could not be saved.");
  }
  const linkResult = await context.serviceClient.from("adle_review_parent_issue_links").update({
    parent_verification_id: verificationId,
    resolution_status: "not_a_learning_issue",
    updated_at: now,
  }).eq("id", issue.id).eq("resolution_status", "needs_route");
  if (linkResult.error) redirectWithMessage(context.redirectPath, "error", "The rejection could not be finalized.");
  revalidatePath(context.redirectPath.split("?")[0]);
  redirectWithMessage(context.redirectPath, "saved", "Marked as not a learning issue, with no intake or Review change.");
}
