import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getReturnedCorrectionRepairAttemptEvidenceType,
  getReturnedCorrectionRepairInitialCompetencyLevel,
  type ReturnedCorrectionRepairCatalogEntry,
  type ReturnedCorrectionRepairEvidence,
  type ReturnedCorrectionRepairIssue,
  type ReturnedCorrectionRepairPlan,
} from "./returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "./returned-correction-route-bridge";

export type ReturnedCorrectionRepairAttempt =
  ReturnedCorrectionRouteBridgeAttempt & {
    writing_issue_id: string;
    child_id: string;
    parent_user_id: string;
    attempted_correction: string | null;
    attempt_notes: string | null;
    corrected_independently: boolean;
    reflection: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };

type LearningItemRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function updateIssueRoute(input: {
  supabase: SupabaseClient;
  issue: ReturnedCorrectionRepairIssue;
  plan: ReturnedCorrectionRepairPlan;
  nowIso: string;
}) {
  if (!input.plan.bridgeMetadata) {
    return 0;
  }

  const routeMutation = input.plan.proposedMutations.find(
    (mutation) => mutation.type === "attach_parent_local_route",
  );

  if (
    !routeMutation ||
    input.issue.micro_skill_key === routeMutation.microSkillKey
  ) {
    return 0;
  }

  const { error } = await input.supabase
    .from("writing_issues")
    .update({
      micro_skill_key: routeMutation.microSkillKey,
      metadata: {
        ...parseMetadata(input.issue.metadata),
        returned_correction_route_bridge: input.plan.bridgeMetadata,
        returned_correction_stage_d_repair: {
          repaired_at: input.nowIso,
          action: "attached_parent_local_route",
          action_source: "parent_review_route_capture",
        },
      },
      updated_at: input.nowIso,
    })
    .eq("id", input.issue.id)
    .eq("parent_user_id", input.issue.parent_user_id)
    .eq("child_id", input.issue.child_id)
    .eq("issue_status", "finalised")
    .not("final_classification", "is", null);

  if (error) {
    throw new Error(
      `Failed to attach bridged route for ${input.issue.id}: ${error.message}`,
    );
  }

  return 1;
}

async function findOrCreateLearningItem(input: {
  supabase: SupabaseClient;
  issue: ReturnedCorrectionRepairIssue;
  catalog: ReturnedCorrectionRepairCatalogEntry;
  preferredLearningItemId: string | null;
  nowIso: string;
}) {
  let existingQuery = input.supabase
    .from("learning_items")
    .select("id, metadata")
    .eq("child_id", input.issue.child_id)
    .eq("parent_user_id", input.issue.parent_user_id)
    .eq("micro_skill_key", input.catalog.micro_skill_key)
    .eq("practice_route", input.catalog.practice_route)
    .eq("is_active", true);

  if (input.preferredLearningItemId) {
    existingQuery = existingQuery.eq("id", input.preferredLearningItemId);
  } else {
    existingQuery = existingQuery.order("updated_at", { ascending: false });
  }

  const { data: existingRows, error: existingError } = await existingQuery.limit(1);

  if (existingError) {
    throw new Error(
      `Failed to find existing learning item: ${existingError.message}`,
    );
  }

  const existing = ((existingRows ?? []) as LearningItemRow[])[0];
  if (existing) {
    const { error } = await input.supabase
      .from("learning_items")
      .update({
        metadata: {
          ...parseMetadata(existing.metadata),
          returned_correction_stage_d_repair: {
            repaired_at: input.nowIso,
            action: "strengthened",
            action_source: "parent_review_route_capture",
            writing_issue_id: input.issue.id,
          },
        },
        updated_at: input.nowIso,
      })
      .eq("id", existing.id)
      .eq("parent_user_id", input.issue.parent_user_id)
      .eq("child_id", input.issue.child_id);

    if (error) {
      throw new Error(
        `Failed to strengthen learning item ${existing.id}: ${error.message}`,
      );
    }

    return { learningItemId: existing.id, created: false, mutationCount: 1 };
  }

  const initialCompetency = getReturnedCorrectionRepairInitialCompetencyLevel(
    input.issue.final_classification,
  );
  const { data: inserted, error: insertError } = await input.supabase
    .from("learning_items")
    .insert({
      child_id: input.issue.child_id,
      parent_user_id: input.issue.parent_user_id,
      source_writing_issue_id: input.issue.id,
      micro_skill_key: input.catalog.micro_skill_key,
      mastery_domain_key: input.catalog.mastery_domain_key,
      skill_family_key: input.catalog.skill_family_key,
      skill_cluster_key: input.catalog.skill_cluster_key,
      practice_route: input.catalog.practice_route,
      current_competency_level: initialCompetency,
      theme_key: input.issue.theme_key,
      progress_state: "golden_nugget",
      is_active: true,
      metadata: {
        created_from_final_classification: input.issue.final_classification,
        source_issue_status_at_creation: "finalised",
        returned_correction_stage_d_repair: {
          repaired_at: input.nowIso,
          action: "created",
          action_source: "parent_review_route_capture",
          writing_issue_id: input.issue.id,
        },
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
    .select("id")
    .single();

  if (!insertError && inserted) {
    return {
      learningItemId: inserted.id as string,
      created: true,
      mutationCount: 1,
    };
  }

  const { data: sourceIssueItem, error: sourceIssueError } =
    await input.supabase
      .from("learning_items")
      .select("id")
      .eq("source_writing_issue_id", input.issue.id)
      .eq("parent_user_id", input.issue.parent_user_id)
      .eq("child_id", input.issue.child_id)
      .limit(1)
      .maybeSingle();

  if (sourceIssueError || !sourceIssueItem) {
    throw new Error(
      `Failed to create learning item for ${input.issue.id}: ${
        insertError?.message ?? sourceIssueError?.message ?? "unknown error"
      }`,
    );
  }

  return {
    learningItemId: sourceIssueItem.id as string,
    created: false,
    mutationCount: 0,
  };
}

async function ensureIssueLink(input: {
  supabase: SupabaseClient;
  issue: ReturnedCorrectionRepairIssue;
  learningItemId: string;
  linkRole: "origin" | "supporting";
  nowIso: string;
}) {
  const { data: existingRows, error: existingError } = await input.supabase
    .from("learning_item_issue_links")
    .select("id")
    .eq("learning_item_id", input.learningItemId)
    .eq("writing_issue_id", input.issue.id)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to check issue link: ${existingError.message}`);
  }

  if ((existingRows ?? []).length > 0) {
    return 0;
  }

  const { error } = await input.supabase
    .from("learning_item_issue_links")
    .insert({
      learning_item_id: input.learningItemId,
      writing_issue_id: input.issue.id,
      child_id: input.issue.child_id,
      parent_user_id: input.issue.parent_user_id,
      link_role: input.linkRole,
      metadata: {
        created_from_final_classification: input.issue.final_classification,
        returned_correction_stage_d_repair: true,
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    });

  if (error) {
    throw new Error(
      `Failed to insert issue link for ${input.issue.id}: ${error.message}`,
    );
  }

  return 1;
}

async function ensureEvidence(input: {
  supabase: SupabaseClient;
  issue: ReturnedCorrectionRepairIssue;
  attempts: ReturnedCorrectionRepairAttempt[];
  learningItemId: string;
  nowIso: string;
}) {
  const { data: existingRows, error: existingError } = await input.supabase
    .from("learning_item_evidence")
    .select("id, source_context, metadata")
    .eq("learning_item_id", input.learningItemId)
    .eq("writing_issue_id", input.issue.id);

  if (existingError) {
    throw new Error(`Failed to check evidence rows: ${existingError.message}`);
  }

  const existingEvidence = (
    (existingRows ?? []) as ReturnedCorrectionRepairEvidence[]
  ).map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }));
  const initialCompetency = getReturnedCorrectionRepairInitialCompetencyLevel(
    input.issue.final_classification,
  );
  let mutationCount = 0;

  if (
    !existingEvidence.some(
      (row) => row.source_context === "finalised_issue_outcome",
    )
  ) {
    const { error } = await input.supabase
      .from("learning_item_evidence")
      .insert({
        learning_item_id: input.learningItemId,
        child_id: input.issue.child_id,
        parent_user_id: input.issue.parent_user_id,
        writing_issue_id: input.issue.id,
        task_submission_id: input.issue.task_submission_id,
        evidence_type: "incorrect_use",
        competency_signal: initialCompetency,
        source_context: "finalised_issue_outcome",
        metadata: {
          final_classification: input.issue.final_classification,
          micro_skill_key: input.issue.micro_skill_key,
          linked_learning_item_id: input.learningItemId,
          returned_correction_stage_d_repair: true,
        },
        created_at: input.nowIso,
        updated_at: input.nowIso,
      });

    if (error) {
      throw new Error(
        `Failed to insert final outcome evidence: ${error.message}`,
      );
    }

    mutationCount += 1;
    const { error: reviewStateError } = await input.supabase.rpc(
      "apply_learning_item_review_state_from_evidence",
      {
        p_learning_item_id: input.learningItemId,
        p_evidence_type: "incorrect_use",
        p_competency_signal: initialCompetency,
        p_occurred_at: input.nowIso,
        p_source_context: "finalised_issue_outcome",
      },
    );

    if (reviewStateError) {
      throw new Error(
        `Failed to update learning item review state: ${reviewStateError.message}`,
      );
    }
  }

  const existingAttemptEvidenceIds = new Set(
    existingEvidence
      .filter((row) => row.source_context === "child_correction_attempt")
      .map((row) => {
        const metadata = parseMetadata(row.metadata);
        return typeof metadata.correction_attempt_id === "string"
          ? metadata.correction_attempt_id
          : null;
      })
      .filter((value): value is string => typeof value === "string"),
  );

  for (const attempt of input.attempts) {
    if (existingAttemptEvidenceIds.has(attempt.id)) {
      continue;
    }

    const metadata = parseMetadata(attempt.metadata);
    const markedFixed = metadata.marked_fixed === true;
    const { error } = await input.supabase
      .from("learning_item_evidence")
      .insert({
        learning_item_id: input.learningItemId,
        child_id: input.issue.child_id,
        parent_user_id: input.issue.parent_user_id,
        writing_issue_id: input.issue.id,
        task_submission_id: attempt.task_submission_id,
        evidence_type: getReturnedCorrectionRepairAttemptEvidenceType({
          markedFixed,
          reflection: attempt.reflection,
          correctedIndependently: attempt.corrected_independently,
        }),
        competency_signal: null,
        source_context: "child_correction_attempt",
        metadata: {
          ...metadata,
          correction_attempt_id: attempt.id,
          corrected_independently: attempt.corrected_independently,
          reflection: attempt.reflection,
          marked_fixed: markedFixed,
          reflection_source:
            typeof metadata.reflection_source === "string"
              ? metadata.reflection_source
              : null,
          returned_correction_stage_d_repair: true,
        },
        created_at: attempt.created_at,
        updated_at: input.nowIso,
      });

    if (error) {
      throw new Error(
        `Failed to insert attempt evidence ${attempt.id}: ${error.message}`,
      );
    }

    mutationCount += 1;
  }

  return mutationCount;
}

export async function applyReturnedCorrectionRepairPlan(input: {
  supabase: SupabaseClient;
  issue: ReturnedCorrectionRepairIssue;
  attempts: ReturnedCorrectionRepairAttempt[];
  plan: ReturnedCorrectionRepairPlan;
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  nowIso: string;
}) {
  if (!input.plan.safeToApply) {
    return {
      mutationCount: 0,
      repaired: false,
      reason: "Plan is not safe to apply.",
      learningItemId: null,
      createdLearningItem: false,
    };
  }

  let mutationCount = await updateIssueRoute(input);
  const learningMutation = input.plan.proposedMutations.find(
    (mutation) => mutation.type === "create_or_strengthen_learning_item",
  );

  if (!learningMutation) {
    return {
      mutationCount,
      repaired: mutationCount > 0,
      reason: null,
      learningItemId: null,
      createdLearningItem: false,
    };
  }

  const catalog = input.catalogEntries.find(
    (entry) =>
      entry.micro_skill_key === learningMutation.microSkillKey &&
      entry.is_active &&
      entry.is_assignable,
  );

  if (!catalog) {
    return {
      mutationCount,
      repaired: false,
      reason: "Active assignable catalog route disappeared before apply.",
      learningItemId: null,
      createdLearningItem: false,
    };
  }

  const nextIssue = {
    ...input.issue,
    micro_skill_key: learningMutation.microSkillKey,
  };
  const learningItem = await findOrCreateLearningItem({
    supabase: input.supabase,
    issue: nextIssue,
    catalog,
    preferredLearningItemId:
      input.plan.existingLearningItemIds.length === 1
        ? input.plan.existingLearningItemIds[0]
        : null,
    nowIso: input.nowIso,
  });
  mutationCount += learningItem.mutationCount;
  mutationCount += await ensureIssueLink({
    supabase: input.supabase,
    issue: nextIssue,
    learningItemId: learningItem.learningItemId,
    linkRole: learningItem.created ? "origin" : "supporting",
    nowIso: input.nowIso,
  });
  mutationCount += await ensureEvidence({
    supabase: input.supabase,
    issue: nextIssue,
    attempts: input.attempts,
    learningItemId: learningItem.learningItemId,
    nowIso: input.nowIso,
  });

  return {
    mutationCount,
    repaired: true,
    reason: null,
    learningItemId: learningItem.learningItemId,
    createdLearningItem: learningItem.created,
  };
}
