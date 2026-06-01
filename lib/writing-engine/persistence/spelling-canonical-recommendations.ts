import "server-only";

import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SpellingCanonicalRecommendationStatus =
  | "recommended"
  | "pending_admin_review"
  | "accepted"
  | "rejected"
  | "merged"
  | "duplicate"
  | "superseded";

export type SpellingCanonicalRecommendationSourceRowType =
  | "engine_suggested"
  | "parent_added_missed_word"
  | "returned_correction";

export type SpellingCanonicalRecommendationSourceProvenance =
  | "lesson_submission_existing_output"
  | "lesson_submission_parent_added_missed_word";

export type SpellingCanonicalRecommendationRecord = {
  id: string;
  parent_user_id: string;
  child_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_misspelling_instance_id: string | null;
  source_writing_issue_id: string | null;
  source_correction_attempt_id: string | null;
  parent_verification_id: string | null;
  source_suggestion_id: string | null;
  candidate_mapping_id: string | null;
  source_row_type: SpellingCanonicalRecommendationSourceRowType;
  source_provenance: SpellingCanonicalRecommendationSourceProvenance;
  reviewed_event_source_entity_id: string | null;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  recommendation_status: SpellingCanonicalRecommendationStatus;
  recommendation_note: string | null;
  duplicate_of_recommendation_id: string | null;
  merge_target_recommendation_id: string | null;
  superseded_by_recommendation_id: string | null;
  canonical_mapping_id: string | null;
  reviewed_by_admin_user_id: string | null;
  reviewed_by_admin_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  metadata: Record<string, unknown>;
  recommended_at: string;
  created_at: string;
  updated_at: string;
};

export type CreateSpellingCanonicalRecommendationInput = {
  parentUserId: string;
  childId: string;
  taskSubmissionId?: string | null;
  writingSampleId?: string | null;
  sourceMisspellingInstanceId?: string | null;
  sourceWritingIssueId?: string | null;
  sourceCorrectionAttemptId?: string | null;
  parentVerificationId?: string | null;
  sourceSuggestionId?: string | null;
  candidateMappingId?: string | null;
  sourceRowType: SpellingCanonicalRecommendationSourceRowType;
  sourceProvenance: SpellingCanonicalRecommendationSourceProvenance;
  reviewedEventSourceEntityId?: string | null;
  originalChildSpelling?: string | null;
  originalCorrectSpelling?: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  recommendationNote?: string | null;
  metadata?: Record<string, unknown>;
};

function isRecommendationStatus(
  value: unknown,
): value is SpellingCanonicalRecommendationStatus {
  return (
    value === "recommended" ||
    value === "pending_admin_review" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "merged" ||
    value === "duplicate" ||
    value === "superseded"
  );
}

function isSourceRowType(
  value: unknown,
): value is SpellingCanonicalRecommendationSourceRowType {
  return (
    value === "engine_suggested" ||
    value === "parent_added_missed_word" ||
    value === "returned_correction"
  );
}

function isSourceProvenance(
  value: unknown,
): value is SpellingCanonicalRecommendationSourceProvenance {
  return (
    value === "lesson_submission_existing_output" ||
    value === "lesson_submission_parent_added_missed_word"
  );
}

export function normaliseSpellingCanonicalRecommendationRecord(
  value: unknown,
): SpellingCanonicalRecommendationRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SpellingCanonicalRecommendationRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.parent_user_id !== "string" ||
    typeof candidate.child_id !== "string" ||
    !isSourceRowType(candidate.source_row_type) ||
    !isSourceProvenance(candidate.source_provenance) ||
    typeof candidate.misspelling_normalized !== "string" ||
    typeof candidate.correct_spelling_normalized !== "string" ||
    typeof candidate.micro_skill_key !== "string" ||
    !isRecommendationStatus(candidate.recommendation_status) ||
    typeof candidate.recommended_at !== "string" ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    parent_user_id: candidate.parent_user_id,
    child_id: candidate.child_id,
    task_submission_id:
      typeof candidate.task_submission_id === "string"
        ? candidate.task_submission_id
        : null,
    writing_sample_id:
      typeof candidate.writing_sample_id === "string"
        ? candidate.writing_sample_id
        : null,
    source_misspelling_instance_id:
      typeof candidate.source_misspelling_instance_id === "string"
        ? candidate.source_misspelling_instance_id
        : null,
    source_writing_issue_id:
      typeof candidate.source_writing_issue_id === "string"
        ? candidate.source_writing_issue_id
        : null,
    source_correction_attempt_id:
      typeof candidate.source_correction_attempt_id === "string"
        ? candidate.source_correction_attempt_id
        : null,
    parent_verification_id:
      typeof candidate.parent_verification_id === "string"
        ? candidate.parent_verification_id
        : null,
    source_suggestion_id:
      typeof candidate.source_suggestion_id === "string"
        ? candidate.source_suggestion_id
        : null,
    candidate_mapping_id:
      typeof candidate.candidate_mapping_id === "string"
        ? candidate.candidate_mapping_id
        : null,
    source_row_type: candidate.source_row_type,
    source_provenance: candidate.source_provenance,
    reviewed_event_source_entity_id:
      typeof candidate.reviewed_event_source_entity_id === "string"
        ? candidate.reviewed_event_source_entity_id
        : null,
    original_child_spelling:
      typeof candidate.original_child_spelling === "string"
        ? candidate.original_child_spelling
        : null,
    original_correct_spelling:
      typeof candidate.original_correct_spelling === "string"
        ? candidate.original_correct_spelling
        : null,
    misspelling_normalized: candidate.misspelling_normalized,
    correct_spelling_normalized: candidate.correct_spelling_normalized,
    micro_skill_key: candidate.micro_skill_key,
    recommendation_status: candidate.recommendation_status,
    recommendation_note:
      typeof candidate.recommendation_note === "string"
        ? candidate.recommendation_note
        : null,
    duplicate_of_recommendation_id:
      typeof candidate.duplicate_of_recommendation_id === "string"
        ? candidate.duplicate_of_recommendation_id
        : null,
    merge_target_recommendation_id:
      typeof candidate.merge_target_recommendation_id === "string"
        ? candidate.merge_target_recommendation_id
        : null,
    superseded_by_recommendation_id:
      typeof candidate.superseded_by_recommendation_id === "string"
        ? candidate.superseded_by_recommendation_id
        : null,
    canonical_mapping_id:
      typeof candidate.canonical_mapping_id === "string"
        ? candidate.canonical_mapping_id
        : null,
    reviewed_by_admin_user_id:
      typeof candidate.reviewed_by_admin_user_id === "string"
        ? candidate.reviewed_by_admin_user_id
        : null,
    reviewed_by_admin_email:
      typeof candidate.reviewed_by_admin_email === "string"
        ? candidate.reviewed_by_admin_email
        : null,
    reviewed_at:
      typeof candidate.reviewed_at === "string" ? candidate.reviewed_at : null,
    review_note:
      typeof candidate.review_note === "string" ? candidate.review_note : null,
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {},
    recommended_at: candidate.recommended_at,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}

const selectedColumns = [
  "id",
  "parent_user_id",
  "child_id",
  "task_submission_id",
  "writing_sample_id",
  "source_misspelling_instance_id",
  "source_writing_issue_id",
  "source_correction_attempt_id",
  "parent_verification_id",
  "source_suggestion_id",
  "candidate_mapping_id",
  "source_row_type",
  "source_provenance",
  "reviewed_event_source_entity_id",
  "original_child_spelling",
  "original_correct_spelling",
  "misspelling_normalized",
  "correct_spelling_normalized",
  "micro_skill_key",
  "recommendation_status",
  "recommendation_note",
  "duplicate_of_recommendation_id",
  "merge_target_recommendation_id",
  "superseded_by_recommendation_id",
  "canonical_mapping_id",
  "reviewed_by_admin_user_id",
  "reviewed_by_admin_email",
  "reviewed_at",
  "review_note",
  "metadata",
  "recommended_at",
  "created_at",
  "updated_at",
].join(", ");

export function createSupabaseSpellingCanonicalRecommendationRepository(
  supabase: SupabaseServerClient,
) {
  return {
    async findByIdForParentChild(input: {
      id: string;
      parentUserId: string;
      childId: string;
    }) {
      const { data } = await supabase
        .from("spelling_canonical_mapping_recommendations")
        .select(selectedColumns)
        .eq("id", input.id)
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .maybeSingle();

      return normaliseSpellingCanonicalRecommendationRecord(data);
    },

    async findOpenForCandidateMapping(input: {
      parentUserId: string;
      childId: string;
      candidateMappingId: string;
    }) {
      const { data } = await supabase
        .from("spelling_canonical_mapping_recommendations")
        .select(selectedColumns)
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .eq("candidate_mapping_id", input.candidateMappingId)
        .in("recommendation_status", ["recommended", "pending_admin_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return normaliseSpellingCanonicalRecommendationRecord(data);
    },

    async listForParentChild(input: { parentUserId: string; childId: string }) {
      const { data } = await supabase
        .from("spelling_canonical_mapping_recommendations")
        .select(selectedColumns)
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .order("created_at", { ascending: false });

      return ((data ?? []) as unknown[])
        .map((row) => normaliseSpellingCanonicalRecommendationRecord(row))
        .filter(Boolean) as SpellingCanonicalRecommendationRecord[];
    },

    async insertPendingAdminReview(input: CreateSpellingCanonicalRecommendationInput) {
      const { data, error } = await supabase
        .from("spelling_canonical_mapping_recommendations")
        .insert({
          parent_user_id: input.parentUserId,
          child_id: input.childId,
          task_submission_id: input.taskSubmissionId ?? null,
          writing_sample_id: input.writingSampleId ?? null,
          source_misspelling_instance_id: input.sourceMisspellingInstanceId ?? null,
          source_writing_issue_id: input.sourceWritingIssueId ?? null,
          source_correction_attempt_id: input.sourceCorrectionAttemptId ?? null,
          parent_verification_id: input.parentVerificationId ?? null,
          source_suggestion_id: input.sourceSuggestionId ?? null,
          candidate_mapping_id: input.candidateMappingId ?? null,
          source_row_type: input.sourceRowType,
          source_provenance: input.sourceProvenance,
          reviewed_event_source_entity_id:
            input.reviewedEventSourceEntityId ?? null,
          original_child_spelling: input.originalChildSpelling ?? null,
          original_correct_spelling: input.originalCorrectSpelling ?? null,
          misspelling_normalized: input.misspellingNormalized,
          correct_spelling_normalized: input.correctSpellingNormalized,
          micro_skill_key: input.microSkillKey,
          recommendation_status: "pending_admin_review",
          recommendation_note: input.recommendationNote ?? null,
          metadata: {
            ...(input.metadata ?? {}),
            resolver_visible: false,
            action_source: "pcrm_b_recommendation_evidence",
          },
        })
        .select(selectedColumns)
        .single();

      if (error || !data) {
        throw new Error(
          error?.message || "Failed to create canonical mapping recommendation.",
        );
      }

      const record = normaliseSpellingCanonicalRecommendationRecord(data);

      if (!record) {
        throw new Error("Failed to read canonical mapping recommendation.");
      }

      return record;
    },
  };
}
