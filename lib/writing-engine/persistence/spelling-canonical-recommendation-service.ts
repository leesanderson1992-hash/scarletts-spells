import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  createSupabaseSpellingCanonicalRecommendationRepository,
  type SpellingCanonicalRecommendationRecord,
  type SpellingCanonicalRecommendationSourceProvenance,
  type SpellingCanonicalRecommendationSourceRowType,
} from "./spelling-canonical-recommendations";
import type { SpellingCandidateMappingRecord } from "./spelling-candidate-mapping-repository";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getCanonicalRecommendationSource(input: {
  candidateMapping: SpellingCandidateMappingRecord;
}): {
  sourceRowType: SpellingCanonicalRecommendationSourceRowType;
  sourceProvenance: SpellingCanonicalRecommendationSourceProvenance;
} {
  const sourceProvenance = input.candidateMapping.source_provenance;
  if (sourceProvenance === "adle_review_submitted_writing_parent_identified") {
    return {
      sourceRowType: "adle_parent_added_missed_word",
      sourceProvenance,
    };
  }
  if (readMetadataString(input.candidateMapping.metadata, "source_route") === "returned_correction") {
    return {
      sourceRowType: "returned_correction",
      sourceProvenance: "lesson_submission_existing_output",
    };
  }
  if (sourceProvenance === "lesson_submission_parent_added_missed_word") {
    return { sourceRowType: "parent_added_missed_word", sourceProvenance };
  }
  return {
    sourceRowType: "engine_suggested",
    sourceProvenance: "lesson_submission_existing_output",
  };
}

function isOpenRecommendationDuplicateError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("duplicate key") ||
    message.includes("spelling_canonical_mapping_recommendations_open_candidate_idx") ||
    message.includes("spelling_canonical_mapping_recommendations_open_source_idx") ||
    message.includes("spelling_canonical_mapping_recommendations_open_event_idx") ||
    message.includes("spelling_canonical_mapping_recommendations_open_adle_occurrence_idx")
  );
}

export type CanonicalRecommendationEnsureResult =
  | { status: "created"; recommendation: SpellingCanonicalRecommendationRecord }
  | { status: "existing"; recommendation: SpellingCanonicalRecommendationRecord }
  | { status: "failed"; error: unknown };

export async function ensureCanonicalRecommendationForCandidateMapping(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  candidateMapping: SpellingCandidateMappingRecord;
  actionSource: string;
  sourceAdleReviewParentIssueLinkId?: string | null;
}): Promise<CanonicalRecommendationEnsureResult> {
  const repository = createSupabaseSpellingCanonicalRecommendationRepository(input.supabase);
  const existing = await repository.findOpenForCandidateMapping({
    parentUserId: input.parentUserId,
    childId: input.childId,
    candidateMappingId: input.candidateMapping.id,
  });
  if (existing) return { status: "existing", recommendation: existing };

  const { sourceRowType, sourceProvenance } = getCanonicalRecommendationSource(input);
  try {
    const recommendation = await repository.insertPendingAdminReview({
      parentUserId: input.parentUserId,
      childId: input.childId,
      taskSubmissionId: input.candidateMapping.task_submission_id,
      writingSampleId: input.candidateMapping.writing_sample_id,
      sourceMisspellingInstanceId: input.candidateMapping.source_misspelling_instance_id,
      sourceWritingIssueId:
        sourceRowType === "returned_correction"
          ? readMetadataString(input.candidateMapping.metadata, "original_writing_issue_id")
          : null,
      sourceCorrectionAttemptId:
        sourceRowType === "returned_correction"
          ? readMetadataString(input.candidateMapping.metadata, "correction_attempt_id")
          : null,
      parentVerificationId: input.candidateMapping.parent_verification_id,
      sourceSuggestionId: input.candidateMapping.source_suggestion_id,
      candidateMappingId: input.candidateMapping.id,
      sourceAdleReviewSessionId: input.candidateMapping.source_adle_review_session_id,
      sourceAdleReviewParentIssueLinkId:
        input.sourceAdleReviewParentIssueLinkId ?? null,
      sourceRowType,
      sourceProvenance,
      reviewedEventSourceEntityId: input.candidateMapping.reviewed_event_source_entity_id,
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
    return { status: "created", recommendation };
  } catch (error) {
    if (isOpenRecommendationDuplicateError(error)) {
      const duplicate = await repository.findOpenForCandidateMapping({
        parentUserId: input.parentUserId,
        childId: input.childId,
        candidateMappingId: input.candidateMapping.id,
      });
      if (duplicate) return { status: "existing", recommendation: duplicate };
    }
    return { status: "failed", error };
  }
}
