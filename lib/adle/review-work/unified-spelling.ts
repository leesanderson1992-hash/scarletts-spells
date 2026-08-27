import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatErrorPatternLabel, normaliseErrorPattern } from "@/lib/spelling/errorPatterns";
import { asWordFamilyId, getWordFamilyById } from "@/lib/spelling/wordFamilies";
import {
  attachStage2aMicroSkillRecommendationsToUnifiedRows,
  type UnifiedSpellingReviewItem,
} from "@/lib/writing-engine/persistence/unified-spelling-review-items";

import type { AdleReviewWorkDetail } from "./read-model";

type SuggestionRow = {
  id: string;
  suggested_micro_skill_key: string | null;
  notes: string | null;
};

type VerificationRow = {
  id: string;
  suggested_micro_skill_key: string | null;
  verified_micro_skill_key: string | null;
  verification_notes: string | null;
};

type CandidateRow = {
  id: string;
  micro_skill_key: string;
  candidate_status: string;
};

type IntakeRow = {
  source_candidate_mapping_id: string;
  candidate_state:
    | "queued"
    | "pending_mapping"
    | "pending_content"
    | "error_retryable"
    | "activated"
    | "rejected"
    | "superseded";
  learning_item_id: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function summarizeAdleSpellingInspection(rows: UnifiedSpellingReviewItem[]) {
  const unresolvedRows = rows.filter((row) => !row.terminalStatus);
  return {
    canSubmit: unresolvedRows.length === 0,
    unresolvedCount: unresolvedRows.length,
    blockingReasons: unresolvedRows.map(
      (row) => `${row.observedText} still needs a learning route or dismissal.`,
    ),
  };
}

export async function loadAdleUnifiedSpellingReviewItems(input: {
  serviceClient: SupabaseClient;
  detail: AdleReviewWorkDetail;
}): Promise<UnifiedSpellingReviewItem[]> {
  const suggestionIds = input.detail.parentIssues.map((issue) => issue.sourceSuggestionId);
  const verificationIds = input.detail.parentIssues
    .map((issue) => issue.parentVerificationId)
    .filter((value): value is string => Boolean(value));
  const mappingIds = input.detail.parentIssues
    .map((issue) => issue.candidateMappingId)
    .filter((value): value is string => Boolean(value));

  const [suggestionsResult, verificationsResult, mappingsResult, intakeResult] = await Promise.all([
    suggestionIds.length
      ? input.serviceClient
          .from("writing_issue_suggestions")
          .select("id,suggested_micro_skill_key,notes")
          .in("id", suggestionIds)
      : Promise.resolve({ data: [], error: null }),
    verificationIds.length
      ? input.serviceClient
          .from("parent_verifications")
          .select("id,suggested_micro_skill_key,verified_micro_skill_key,verification_notes")
          .in("id", verificationIds)
      : Promise.resolve({ data: [], error: null }),
    mappingIds.length
      ? input.serviceClient
          .from("parent_verified_spelling_candidate_mappings")
          .select("id,micro_skill_key,candidate_status")
          .in("id", mappingIds)
      : Promise.resolve({ data: [], error: null }),
    mappingIds.length
      ? input.serviceClient
          .from("adle_canonical_intake_candidates")
          .select("source_candidate_mapping_id,candidate_state,learning_item_id")
          .in("source_candidate_mapping_id", mappingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    suggestionsResult.error ||
    verificationsResult.error ||
    mappingsResult.error ||
    intakeResult.error
  ) {
    throw new Error("ADLE Review spelling rows could not be loaded.");
  }

  const suggestionById = new Map(
    ((suggestionsResult.data ?? []) as SuggestionRow[]).map((row) => [row.id, row]),
  );
  const verificationById = new Map(
    ((verificationsResult.data ?? []) as VerificationRow[]).map((row) => [row.id, row]),
  );
  const mappingById = new Map(
    ((mappingsResult.data ?? []) as CandidateRow[]).map((row) => [row.id, row]),
  );
  const intakeByMappingId = new Map(
    ((intakeResult.data ?? []) as IntakeRow[]).map((row) => [
      row.source_candidate_mapping_id,
      row,
    ]),
  );

  const rows = input.detail.parentIssues.map((issue): UnifiedSpellingReviewItem => {
    const suggestion = suggestionById.get(issue.sourceSuggestionId) ?? null;
    const verification = issue.parentVerificationId
      ? verificationById.get(issue.parentVerificationId) ?? null
      : null;
    const mapping = issue.candidateMappingId
      ? mappingById.get(issue.candidateMappingId) ?? null
      : null;
    const intake = issue.candidateMappingId
      ? intakeByMappingId.get(issue.candidateMappingId) ?? null
      : null;
    const pattern = normaliseErrorPattern(
      textValue(issue.analysisPayload.detectedErrorPattern),
    );
    const wordFamilyId = asWordFamilyId(
      textValue(issue.analysisPayload.selectedWordFamilyId),
    );
    const terminalStatus =
      issue.resolutionStatus === "confirmed"
        ? ("resolved_known_match" as const)
        : issue.resolutionStatus === "sent_to_admin"
          ? ("sent_to_admin" as const)
          : issue.resolutionStatus === "not_a_learning_issue"
            ? ("not_an_issue" as const)
            : null;

    return {
      id: `adle-parent:${issue.id}`,
      source: "adle_parent_added_missed_word",
      state: terminalStatus
        ? terminalStatus === "not_an_issue"
          ? "not_an_issue"
          : terminalStatus === "sent_to_admin"
            ? "sent_to_admin"
            : "resolved"
        : "categorisation_needed",
      categorisationStatus: terminalStatus
        ? terminalStatus === "not_an_issue"
          ? "not_applicable"
          : terminalStatus === "sent_to_admin"
            ? "sent_to_admin"
            : "categorised"
        : "categorisation_needed",
      observedText: issue.observedSpelling,
      expectedCorrection: issue.correctSpelling,
      latestChildAttempt: null,
      childReflection: null,
      correctionOutcome: null,
      draftFinalClassification: null,
      draftFinalClassificationUpdatedAt: null,
      suggestedMicroSkillKey: suggestion?.suggested_micro_skill_key ?? null,
      verifiedMicroSkillKey: verification?.verified_micro_skill_key ?? null,
      microSkillKey:
        mapping?.micro_skill_key ??
        verification?.verified_micro_skill_key ??
        verification?.suggested_micro_skill_key ??
        null,
      microSkillRecommendation: null,
      knownMatchAutoResolution: null,
      terminalStatus,
      readyForApproval: Boolean(terminalStatus),
      parentNote: verification?.verification_notes ?? suggestion?.notes ?? null,
      analysis: {
        primaryCategory: textValue(issue.analysisPayload.primaryCategory),
        secondaryCategory: textValue(issue.analysisPayload.secondaryCategory),
        detectedErrorPattern: pattern,
        detectedErrorPatternLabel: pattern ? formatErrorPatternLabel(pattern) : null,
        selectedWordFamilyId: wordFamilyId,
        selectedWordFamilyLabel: wordFamilyId
          ? getWordFamilyById(wordFamilyId)?.label ?? wordFamilyId
          : null,
      },
      sourceIds: {
        currentTaskSubmissionId: null,
        writingSampleId: null,
        misspellingInstanceId: null,
        writingIssueSuggestionId: issue.sourceSuggestionId,
        parentVerificationId: issue.parentVerificationId,
        writingIssueId: null,
        originalWritingIssueId: null,
        correctionAttemptId: null,
        catalogReviewCaseId: issue.catalogReviewCaseId,
        candidateMappingId: issue.candidateMappingId,
        canonicalRecommendationId: issue.canonicalRecommendationId,
        canonicalRecommendationStatus: issue.canonicalRecommendationId
          ? "pending_admin_review"
          : null,
        adleReviewSessionId: input.detail.reviewSessionId,
        adleParentIssueLinkId: issue.id,
        adleCanonicalIntakeState: intake?.candidate_state ?? null,
        adleLearningItemId: intake?.learning_item_id ?? null,
      },
      provenance: {
        parentAuthored: true,
        sourceKind: "adle_review_submitted_writing_parent_identified",
        previousTaskSubmissionId: null,
        metadata: {
          context_text: input.detail.submittedWritingText.slice(
            Math.max(0, issue.positionStart - 35),
            Math.min(input.detail.submittedWritingText.length, issue.positionEnd + 35),
          ),
          position_start: issue.positionStart,
          position_end: issue.positionEnd,
          analysis_payload: issue.analysisPayload,
        },
      },
    };
  });

  return attachStage2aMicroSkillRecommendationsToUnifiedRows({
    supabase: input.serviceClient as never,
    rows,
    parentUserId: input.detail.parentUserId,
    childId: input.detail.childId,
    submissionId: null,
  });
}
