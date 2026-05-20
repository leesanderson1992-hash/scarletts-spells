import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SpellingCandidateMappingStatus =
  | "pending_parent_promotion"
  | "parent_local_promoted"
  | "admin_review_requested"
  | "global_canonical_promoted"
  | "rejected"
  | "superseded";

export type SpellingCandidatePromotionScope =
  | "child_local"
  | "parent_local"
  | "global";

export type PendingSpellingCandidateMappingInsert = {
  parentUserId: string;
  childId: string;
  parentVerificationId: string;
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  sourceSuggestionId: string | null;
  sourceMisspellingInstanceId: string | null;
  sourceProvenance:
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";
  reviewedEventSourceEntityId: string;
  originalChildSpelling: string | null;
  originalCorrectSpelling: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  metadata?: Record<string, unknown>;
};

export type SpellingCandidateMappingRecord = {
  id: string;
  parent_user_id: string;
  child_id: string;
  parent_verification_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  source_provenance: string;
  reviewed_event_source_entity_id: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: SpellingCandidateMappingStatus;
  promotion_scope: SpellingCandidatePromotionScope;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ParentLocalSpellingCandidateMappingRecord =
  SpellingCandidateMappingRecord & {
    promotion_scope: "parent_local";
  };

export type ParentLocalPendingSpellingCandidateMappingRecord =
  ParentLocalSpellingCandidateMappingRecord & {
    candidate_status: "pending_parent_promotion";
  };

export type ParentLocalPromotedSpellingCandidateMappingRecord =
  ParentLocalSpellingCandidateMappingRecord & {
    candidate_status: "parent_local_promoted";
  };

function isSpellingCandidateMappingStatus(
  value: unknown,
): value is SpellingCandidateMappingStatus {
  return (
    value === "pending_parent_promotion" ||
    value === "parent_local_promoted" ||
    value === "admin_review_requested" ||
    value === "global_canonical_promoted" ||
    value === "rejected" ||
    value === "superseded"
  );
}

function isSpellingCandidatePromotionScope(
  value: unknown,
): value is SpellingCandidatePromotionScope {
  return value === "child_local" || value === "parent_local" || value === "global";
}

export function normaliseSpellingCandidateMappingRecord(
  value: unknown,
): SpellingCandidateMappingRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SpellingCandidateMappingRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.parent_user_id !== "string" ||
    typeof candidate.child_id !== "string" ||
    typeof candidate.parent_verification_id !== "string" ||
    typeof candidate.source_provenance !== "string" ||
    typeof candidate.reviewed_event_source_entity_id !== "string" ||
    typeof candidate.misspelling_normalized !== "string" ||
    typeof candidate.correct_spelling_normalized !== "string" ||
    typeof candidate.micro_skill_key !== "string" ||
    !isSpellingCandidateMappingStatus(candidate.candidate_status) ||
    !isSpellingCandidatePromotionScope(candidate.promotion_scope) ||
    typeof candidate.created_at !== "string" ||
    typeof candidate.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    parent_user_id: candidate.parent_user_id,
    child_id: candidate.child_id,
    parent_verification_id: candidate.parent_verification_id,
    task_submission_id:
      typeof candidate.task_submission_id === "string"
        ? candidate.task_submission_id
        : null,
    writing_sample_id:
      typeof candidate.writing_sample_id === "string"
        ? candidate.writing_sample_id
        : null,
    source_suggestion_id:
      typeof candidate.source_suggestion_id === "string"
        ? candidate.source_suggestion_id
        : null,
    source_misspelling_instance_id:
      typeof candidate.source_misspelling_instance_id === "string"
        ? candidate.source_misspelling_instance_id
        : null,
    source_provenance: candidate.source_provenance,
    reviewed_event_source_entity_id: candidate.reviewed_event_source_entity_id,
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
    candidate_status: candidate.candidate_status,
    promotion_scope: candidate.promotion_scope,
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {},
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}

export function toParentLocalPendingRecord(
  record: SpellingCandidateMappingRecord | null,
): ParentLocalPendingSpellingCandidateMappingRecord | null {
  if (
    !record ||
    record.promotion_scope !== "parent_local" ||
    record.candidate_status !== "pending_parent_promotion"
  ) {
    return null;
  }

  return record as ParentLocalPendingSpellingCandidateMappingRecord;
}

export function toParentLocalPromotedRecord(
  record: SpellingCandidateMappingRecord | null,
): ParentLocalPromotedSpellingCandidateMappingRecord | null {
  if (
    !record ||
    record.promotion_scope !== "parent_local" ||
    record.candidate_status !== "parent_local_promoted"
  ) {
    return null;
  }

  return record as ParentLocalPromotedSpellingCandidateMappingRecord;
}

const selectedColumns = [
  "id",
  "parent_user_id",
  "child_id",
  "parent_verification_id",
  "task_submission_id",
  "writing_sample_id",
  "source_suggestion_id",
  "source_misspelling_instance_id",
  "source_provenance",
  "reviewed_event_source_entity_id",
  "original_child_spelling",
  "original_correct_spelling",
  "misspelling_normalized",
  "correct_spelling_normalized",
  "micro_skill_key",
  "candidate_status",
  "promotion_scope",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

export type SupabaseSpellingCandidateMappingRepositoryBase = {
  findByParentVerificationId: (
    parentVerificationId: string,
  ) => Promise<SpellingCandidateMappingRecord | null>;
  findByIdForParentChild: (input: {
    id: string;
    parentUserId: string;
    childId: string;
  }) => Promise<SpellingCandidateMappingRecord | null>;
  findScopedPromotedByMisspelling: (input: {
    parentUserId: string;
    childId: string;
    misspellingNormalized: string;
  }) => Promise<ParentLocalPromotedSpellingCandidateMappingRecord[]>;
  findConflictingScopedPromotedMappings: (input: {
    parentUserId: string;
    childId: string;
    misspellingNormalized: string;
    correctSpellingNormalized: string;
    microSkillKey: string;
    excludeId?: string | null;
  }) => Promise<ParentLocalPromotedSpellingCandidateMappingRecord[]>;
  findEquivalentScopedPromotedMappings: (input: {
    parentUserId: string;
    childId: string;
    misspellingNormalized: string;
    correctSpellingNormalized: string;
    microSkillKey: string;
  }) => Promise<ParentLocalPromotedSpellingCandidateMappingRecord[]>;
  insertPending: (
    input: PendingSpellingCandidateMappingInsert,
  ) => Promise<ParentLocalPendingSpellingCandidateMappingRecord>;
};

export function createSupabaseSpellingCandidateMappingRepositoryBase(
  supabase: SupabaseServerClient,
): SupabaseSpellingCandidateMappingRepositoryBase {
  return {
    async findByParentVerificationId(parentVerificationId: string) {
      const { data } = await supabase
        .from("parent_verified_spelling_candidate_mappings")
        .select(selectedColumns)
        .eq("parent_verification_id", parentVerificationId)
        .maybeSingle();

      return normaliseSpellingCandidateMappingRecord(data);
    },
    async findByIdForParentChild(input: {
      id: string;
      parentUserId: string;
      childId: string;
    }) {
      const { data } = await supabase
        .from("parent_verified_spelling_candidate_mappings")
        .select(selectedColumns)
        .eq("id", input.id)
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .maybeSingle();

      return normaliseSpellingCandidateMappingRecord(data);
    },
    async findScopedPromotedByMisspelling(input: {
      parentUserId: string;
      childId: string;
      misspellingNormalized: string;
    }) {
      const { data } = await supabase
        .from("parent_verified_spelling_candidate_mappings")
        .select(selectedColumns)
        .eq("parent_user_id", input.parentUserId)
        .eq("child_id", input.childId)
        .eq("promotion_scope", "parent_local")
        .eq("candidate_status", "parent_local_promoted")
        .eq("misspelling_normalized", input.misspellingNormalized)
        .order("updated_at", { ascending: false });

      return (((data ?? []) as unknown[]) ?? [])
        .map((row) => toParentLocalPromotedRecord(normaliseSpellingCandidateMappingRecord(row)))
        .filter(Boolean) as ParentLocalPromotedSpellingCandidateMappingRecord[];
    },
    async findConflictingScopedPromotedMappings(input: {
      parentUserId: string;
      childId: string;
      misspellingNormalized: string;
      correctSpellingNormalized: string;
      microSkillKey: string;
      excludeId?: string | null;
    }) {
      const promotedMappings = await this.findScopedPromotedByMisspelling({
        parentUserId: input.parentUserId,
        childId: input.childId,
        misspellingNormalized: input.misspellingNormalized,
      });

      return promotedMappings.filter((mapping) => {
        if (input.excludeId && mapping.id === input.excludeId) {
          return false;
        }

        return (
          mapping.correct_spelling_normalized !== input.correctSpellingNormalized ||
          mapping.micro_skill_key !== input.microSkillKey
        );
      });
    },
    async findEquivalentScopedPromotedMappings(input: {
      parentUserId: string;
      childId: string;
      misspellingNormalized: string;
      correctSpellingNormalized: string;
      microSkillKey: string;
    }) {
      const promotedMappings = await this.findScopedPromotedByMisspelling({
        parentUserId: input.parentUserId,
        childId: input.childId,
        misspellingNormalized: input.misspellingNormalized,
      });

      return promotedMappings.filter(
        (mapping) =>
          mapping.correct_spelling_normalized === input.correctSpellingNormalized &&
          mapping.micro_skill_key === input.microSkillKey,
      );
    },
    async insertPending(input: PendingSpellingCandidateMappingInsert) {
      const { data, error } = await supabase
        .from("parent_verified_spelling_candidate_mappings")
        .insert({
          parent_user_id: input.parentUserId,
          child_id: input.childId,
          parent_verification_id: input.parentVerificationId,
          task_submission_id: input.taskSubmissionId,
          writing_sample_id: input.writingSampleId,
          source_suggestion_id: input.sourceSuggestionId,
          source_misspelling_instance_id: input.sourceMisspellingInstanceId,
          source_provenance: input.sourceProvenance,
          reviewed_event_source_entity_id: input.reviewedEventSourceEntityId,
          original_child_spelling: input.originalChildSpelling,
          original_correct_spelling: input.originalCorrectSpelling,
          misspelling_normalized: input.misspellingNormalized,
          correct_spelling_normalized: input.correctSpellingNormalized,
          micro_skill_key: input.microSkillKey,
          candidate_status: "pending_parent_promotion",
          promotion_scope: "parent_local",
          metadata: input.metadata ?? {},
        })
        .select(selectedColumns)
        .single();

      if (error || !data) {
        throw new Error("Failed to create pending spelling candidate mapping.");
      }

      const record = toParentLocalPendingRecord(
        normaliseSpellingCandidateMappingRecord(data),
      );

      if (!record) {
        throw new Error("Failed to read pending spelling candidate mapping.");
      }

      return record;
    },
  };
}
