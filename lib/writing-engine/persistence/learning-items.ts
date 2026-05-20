import { createClient } from "@/lib/supabase/server";
import type { WritingEngineLearningItemRepository } from "@/lib/writing-engine/mastery/service";
import {
  buildStage1d1SourceRefFromEvidenceRow,
  selectStage1d1RelevantEvidenceRows,
} from "@/lib/writing-engine/assignments/stage1d1-evidence";
import type {
  WritingEngineMicroSkillCatalogEntry,
  WritingEngineStage1d1Evidence,
  WritingEngineStage1d1LearningItem,
} from "@/lib/writing-engine/types";

export { getStage1d1CatalogEntries } from "./stage1d1-catalog-entries";
export {
  getReviewWorkOverrideMicroSkillProvider,
  type ReviewWorkOverrideMicroSkillOption,
  type ReviewWorkOverrideMicroSkillProviderResult,
} from "./review-work-override-provider";
export {
  getReviewWorkCandidateCaptureMicroSkillCatalogEntry,
  getReviewWorkCandidateCaptureMicroSkillProvider,
  type ReviewWorkCandidateCaptureMicroSkillOption,
  type ReviewWorkCandidateCaptureMicroSkillProviderResult,
} from "./review-work-candidate-capture-provider";
export {
  getReviewWorkDerivedTemplateMetadataByMicroSkillKeys,
  type ReviewWorkDerivedTemplateMetadata,
} from "./review-work-derived-template-metadata";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type MicroSkillCatalogLookupRow = {
  micro_skill_key: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  practice_route: WritingEngineMicroSkillCatalogEntry["practiceRoute"];
  is_assignable: boolean;
  is_active: boolean;
};

type Stage1d1LearningItemRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  micro_skill_key: string;
  practice_route: WritingEngineMicroSkillCatalogEntry["practiceRoute"] | null;
  metadata: Record<string, unknown>;
};

type Stage1d1EvidenceRow = {
  id: string;
  learning_item_id: string;
  task_submission_id: string | null;
  evidence_type: string;
  source_context: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function readStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function getStage1d1ActiveLearningItems(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
}) {
  const { data } = await input.supabase
    .from("learning_items")
    .select("id, child_id, parent_user_id, micro_skill_key, practice_route, metadata")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as Stage1d1LearningItemRow[]).map((row) => ({
    learningItemId: row.id,
    childId: row.child_id,
    parentUserId: row.parent_user_id,
    microSkillKey: row.micro_skill_key,
    practiceRoute: row.practice_route,
    domainModule: null,
    metadata: row.metadata ?? {},
  })) satisfies WritingEngineStage1d1LearningItem[];
}

export async function getStage1d1LatestEvidenceForLearningItems(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  learningItemIds: string[];
}) {
  if (input.learningItemIds.length === 0) {
    return [] as WritingEngineStage1d1Evidence[];
  }

  const { data } = await input.supabase
    .from("learning_item_evidence")
    .select(
      [
        "id",
        "learning_item_id",
        "task_submission_id",
        "evidence_type",
        "source_context",
        "metadata",
        "created_at",
      ].join(", "),
    )
    .eq("parent_user_id", input.parentUserId)
    .in("learning_item_id", input.learningItemIds)
    .order("created_at", { ascending: false });

  return selectStage1d1RelevantEvidenceRows(
    ((data ?? []) as unknown) as Stage1d1EvidenceRow[],
  ).map((row) => ({
    evidenceId: row.id,
    learningItemId: row.learning_item_id,
    sourceRef: buildStage1d1SourceRefFromEvidenceRow(row),
    targetWord: readStringMetadata(row.metadata ?? {}, "target_word"),
    verifiedTemplateKey: readStringMetadata(row.metadata ?? {}, "verified_template_key"),
    originalSuggestedTemplateKey: readStringMetadata(
      row.metadata ?? {},
      "original_suggested_template_key",
    ),
    parentVerificationId: readStringMetadata(
      row.metadata ?? {},
      "parent_verification_id",
    ),
    verificationDecision: readStringMetadata(
      row.metadata ?? {},
      "verification_decision",
    ),
    sourceContext: row.source_context,
    evidenceType: row.evidence_type,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  })) satisfies WritingEngineStage1d1Evidence[];
}

export function createSupabaseLearningItemRepository(
  supabase: SupabaseServerClient,
): WritingEngineLearningItemRepository {
  return {
    async getMicroSkillCatalogEntry(input) {
      const { data, error } = await supabase
        .from("micro_skill_catalog")
        .select(
          [
            "micro_skill_key",
            "mastery_domain_key",
            "skill_family_key",
            "skill_cluster_key",
            "practice_route",
            "is_assignable",
            "is_active",
          ].join(", "),
        )
        .eq("micro_skill_key", input.microSkillKey)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const row = data as unknown as MicroSkillCatalogLookupRow;

      return {
        microSkillKey: row.micro_skill_key,
        masteryDomainKey: row.mastery_domain_key,
        skillFamilyKey: row.skill_family_key,
        skillClusterKey: row.skill_cluster_key,
        practiceRoute: row.practice_route,
        isAssignable: row.is_assignable,
        isActive: row.is_active,
      } satisfies WritingEngineMicroSkillCatalogEntry;
    },
    async findActiveLearningItemByMicroSkill(input) {
      const { data } = await supabase
        .from("learning_items")
        .select("id, metadata")
        .eq("child_id", input.childId)
        .eq("parent_user_id", input.parentUserId)
        .eq("micro_skill_key", input.microSkillKey)
        .eq("practice_route", input.practiceRoute)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data ?? null;
    },
    async createLearningItem(input) {
      const { data, error } = await supabase
        .from("learning_items")
        .insert({
          child_id: input.childId,
          parent_user_id: input.parentUserId,
          source_writing_issue_id: null,
          micro_skill_key: input.microSkillKey,
          mastery_domain_key: input.masteryDomainKey,
          skill_family_key: input.skillFamilyKey,
          skill_cluster_key: input.skillClusterKey,
          practice_route: input.practiceRoute,
          progress_state: "golden_nugget",
          is_active: true,
          metadata: {
            ...input.metadata,
          },
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error("Failed to create learning item.");
      }

      return data;
    },
    async touchLearningItem(input) {
      const { error } = await supabase
        .from("learning_items")
        .update({
          metadata: input.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.learningItemId);

      if (error) {
        throw new Error("Failed to strengthen learning item.");
      }
    },
    async appendEvidence(input) {
      const { error } = await supabase
        .from("learning_item_evidence")
        .insert({
          learning_item_id: input.learningItemId,
          child_id: input.command.childId,
          parent_user_id: input.command.parentUserId,
          writing_issue_id: null,
          task_submission_id: input.command.sourceRef.taskSubmissionId ?? null,
          evidence_type: "incorrect_use",
          competency_signal: input.command.competencySignal,
          source_context: input.command.sourceContext,
          metadata: {
            writing_engine_evidence_type: input.command.evidenceType,
            source_type: input.command.sourceRef.sourceType,
            source_entity_id: input.command.sourceRef.sourceEntityId,
            verification_decision: input.command.verificationDecision,
            was_parent_verified: input.command.wasParentVerified,
            ...input.command.metadata,
          },
        });

      if (error) {
        throw new Error("Failed to append learning evidence.");
      }
    },
  };
}
