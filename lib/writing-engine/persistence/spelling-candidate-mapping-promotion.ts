import { createClient } from "@/lib/supabase/server";

import {
  type ParentLocalPendingSpellingCandidateMappingRecord,
  type ParentLocalPromotedSpellingCandidateMappingRecord,
  type ParentLocalSpellingCandidateMappingRecord,
  type SpellingCandidateMappingRecord,
  createSupabaseSpellingCandidateMappingRepositoryBase,
  normaliseSpellingCandidateMappingRecord,
  toParentLocalPendingRecord,
  toParentLocalPromotedRecord,
  type SupabaseSpellingCandidateMappingRepositoryBase,
} from "./spelling-candidate-mapping-repository";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ParentLocalSpellingCandidateMappingUpdateResult =
  | {
      status: "updated";
      record:
        | ParentLocalPendingSpellingCandidateMappingRecord
        | ParentLocalPromotedSpellingCandidateMappingRecord;
    }
  | {
      status: "already_pending" | "already_promoted";
      record:
        | ParentLocalPendingSpellingCandidateMappingRecord
        | ParentLocalPromotedSpellingCandidateMappingRecord;
    };

function mergeActionAuditMetadata(input: {
  metadata: Record<string, unknown>;
  nextStatus: "pending_parent_promotion" | "parent_local_promoted";
  actionSource: string;
  parentUserId: string;
  nowIso: string;
}) {
  const nextMetadata = { ...input.metadata };

  if (input.nextStatus === "parent_local_promoted") {
    nextMetadata.latest_parent_local_promotion = {
      promotedAt: input.nowIso,
      promotedByParentUserId: input.parentUserId,
      actionSource: input.actionSource,
    };
  } else {
    nextMetadata.latest_parent_local_reversal = {
      revertedAt: input.nowIso,
      revertedByParentUserId: input.parentUserId,
      actionSource: input.actionSource,
    };
  }

  return nextMetadata;
}

type PromotionRepositoryDependencies = Pick<
  SupabaseSpellingCandidateMappingRepositoryBase,
  "findByIdForParentChild"
>;

export function createSpellingCandidateMappingPromotionHelpers(input: {
  supabase: SupabaseServerClient;
  repository: PromotionRepositoryDependencies;
}) {
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

  return {
    async promoteParentLocalPending(inputArgs: {
      id: string;
      parentUserId: string;
      childId: string;
      actionSource: string;
      nowIso: string;
    }): Promise<ParentLocalSpellingCandidateMappingUpdateResult> {
      const existingRecord = await input.repository.findByIdForParentChild({
        id: inputArgs.id,
        parentUserId: inputArgs.parentUserId,
        childId: inputArgs.childId,
      });

      const promotedRecord = toParentLocalPromotedRecord(existingRecord);

      if (promotedRecord) {
        return {
          status: "already_promoted",
          record: promotedRecord,
        };
      }

      const pendingRecord = toParentLocalPendingRecord(existingRecord);

      if (!pendingRecord) {
        throw new Error("Only pending parent-local candidate mappings can be promoted.");
      }

      const metadata = mergeActionAuditMetadata({
        metadata: pendingRecord.metadata,
        nextStatus: "parent_local_promoted",
        actionSource: inputArgs.actionSource,
        parentUserId: inputArgs.parentUserId,
        nowIso: inputArgs.nowIso,
      });
      const { data, error } = await input.supabase
        .from("parent_verified_spelling_candidate_mappings")
        .update({
          candidate_status: "parent_local_promoted",
          metadata,
        })
        .eq("id", inputArgs.id)
        .eq("parent_user_id", inputArgs.parentUserId)
        .eq("child_id", inputArgs.childId)
        .eq("promotion_scope", "parent_local")
        .eq("candidate_status", "pending_parent_promotion")
        .select(selectedColumns)
        .maybeSingle();

      if (error) {
        throw new Error("Failed to promote the parent-local candidate mapping.");
      }

      const record = toParentLocalPromotedRecord(
        normaliseSpellingCandidateMappingRecord(data),
      );

      if (!record) {
        throw new Error("Failed to read the promoted parent-local candidate mapping.");
      }

      return {
        status: "updated",
        record,
      };
    },
    async revertParentLocalPromoted(inputArgs: {
      id: string;
      parentUserId: string;
      childId: string;
      actionSource: string;
      nowIso: string;
    }): Promise<ParentLocalSpellingCandidateMappingUpdateResult> {
      const existingRecord = await input.repository.findByIdForParentChild({
        id: inputArgs.id,
        parentUserId: inputArgs.parentUserId,
        childId: inputArgs.childId,
      });

      const pendingRecord = toParentLocalPendingRecord(existingRecord);

      if (pendingRecord) {
        return {
          status: "already_pending",
          record: pendingRecord,
        };
      }

      const promotedRecord = toParentLocalPromotedRecord(existingRecord);

      if (!promotedRecord) {
        throw new Error("Only promoted parent-local candidate mappings can be reverted.");
      }

      const metadata = mergeActionAuditMetadata({
        metadata: promotedRecord.metadata,
        nextStatus: "pending_parent_promotion",
        actionSource: inputArgs.actionSource,
        parentUserId: inputArgs.parentUserId,
        nowIso: inputArgs.nowIso,
      });
      const { data, error } = await input.supabase
        .from("parent_verified_spelling_candidate_mappings")
        .update({
          candidate_status: "pending_parent_promotion",
          metadata,
        })
        .eq("id", inputArgs.id)
        .eq("parent_user_id", inputArgs.parentUserId)
        .eq("child_id", inputArgs.childId)
        .eq("promotion_scope", "parent_local")
        .eq("candidate_status", "parent_local_promoted")
        .select(selectedColumns)
        .maybeSingle();

      if (error) {
        throw new Error("Failed to revert the parent-local candidate mapping.");
      }

      const record = toParentLocalPendingRecord(
        normaliseSpellingCandidateMappingRecord(data),
      );

      if (!record) {
        throw new Error("Failed to read the reverted parent-local candidate mapping.");
      }

      return {
        status: "updated",
        record,
      };
    },
  };
}

export type SupabaseSpellingCandidateMappingPromotionHelpers = ReturnType<
  typeof createSpellingCandidateMappingPromotionHelpers
>;
