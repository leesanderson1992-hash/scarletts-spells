import type { createClient } from "../supabase/server";

import type {
  LearningItemEvidenceRow,
  LearningItemIssueLinkRow,
  LearningItemRow,
  MicroSkillClusterRow,
  MicroSkillCatalogRow,
  MicroSkillFamilyRow,
  ParentProgressWritingIssueSummaryRow,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getActiveLearningItemsForChild(
  supabase: SupabaseServerClient,
  parentUserId: string,
  childId: string,
) {
  const { data } = await supabase
    .from("learning_items")
    .select(
      [
        "id",
        "child_id",
        "parent_user_id",
        "source_writing_issue_id",
        "micro_skill_key",
        "mastery_domain_key",
        "skill_family_key",
        "skill_cluster_key",
        "practice_route",
        "current_competency_level",
        "target_competency_level",
        "theme_key",
        "progress_state",
        "is_active",
        "review_due_at",
        "last_meaningful_success_at",
        "last_meaningful_failure_at",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  return (data ?? []) as unknown as LearningItemRow[];
}

export async function getAssignableLearningItemsForChild(
  supabase: SupabaseServerClient,
  parentUserId: string,
  childId: string,
) {
  const items = await getActiveLearningItemsForChild(supabase, parentUserId, childId);

  return items.filter(
    (item) =>
      item.practice_route !== null &&
      item.micro_skill_key !== "unknown" &&
      item.mastery_domain_key !== null &&
      item.skill_family_key !== null,
  );
}

export async function getLearningItemIssueLinks(
  supabase: SupabaseServerClient,
  parentUserId: string,
  learningItemIds: string[],
) {
  if (learningItemIds.length === 0) {
    return [] as LearningItemIssueLinkRow[];
  }

  const { data } = await supabase
    .from("learning_item_issue_links")
    .select(
      "id, learning_item_id, writing_issue_id, child_id, parent_user_id, link_role, metadata, created_at, updated_at",
    )
    .eq("parent_user_id", parentUserId)
    .in("learning_item_id", learningItemIds)
    .order("created_at", { ascending: true });

  return (data ?? []) as unknown as LearningItemIssueLinkRow[];
}

export async function getLearningItemIssueLinksByWritingIssueIds(
  supabase: SupabaseServerClient,
  parentUserId: string,
  writingIssueIds: string[],
) {
  if (writingIssueIds.length === 0) {
    return [] as LearningItemIssueLinkRow[];
  }

  const { data } = await supabase
    .from("learning_item_issue_links")
    .select(
      "id, learning_item_id, writing_issue_id, child_id, parent_user_id, link_role, metadata, created_at, updated_at",
    )
    .eq("parent_user_id", parentUserId)
    .in("writing_issue_id", writingIssueIds)
    .order("created_at", { ascending: true });

  return (data ?? []) as unknown as LearningItemIssueLinkRow[];
}

export async function getLearningItemEvidenceRows(
  supabase: SupabaseServerClient,
  parentUserId: string,
  learningItemIds: string[],
) {
  if (learningItemIds.length === 0) {
    return [] as LearningItemEvidenceRow[];
  }

  const { data } = await supabase
    .from("learning_item_evidence")
    .select(
      "id, learning_item_id, child_id, parent_user_id, writing_issue_id, task_submission_id, evidence_type, competency_signal, source_context, metadata, created_at, updated_at",
    )
    .eq("parent_user_id", parentUserId)
    .in("learning_item_id", learningItemIds)
    .order("created_at", { ascending: true });

  return (data ?? []) as unknown as LearningItemEvidenceRow[];
}

export async function getParentProgressWritingIssueSummaries(
  supabase: SupabaseServerClient,
  parentUserId: string,
  writingIssueIds: string[],
) {
  if (writingIssueIds.length === 0) {
    return [] as ParentProgressWritingIssueSummaryRow[];
  }

  const { data } = await supabase
    .from("writing_issues")
    .select(
      "id, observed_text, approved_replacement, final_classification, final_classified_at, created_at",
    )
    .eq("parent_user_id", parentUserId)
    .in("id", writingIssueIds)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as ParentProgressWritingIssueSummaryRow[];
}

export async function getMicroSkillCatalogRows(
  supabase: SupabaseServerClient,
  microSkillKeys: string[],
) {
  if (microSkillKeys.length === 0) {
    return [] as MicroSkillCatalogRow[];
  }

  const { data } = await supabase
    .from("micro_skill_catalog")
    .select(
      "id, mastery_domain_key, skill_family_key, skill_cluster_key, micro_skill_key, display_name, practice_route, is_assignable, is_active, allowed_template_keys, metadata, created_at, updated_at",
    )
    .in("micro_skill_key", microSkillKeys)
    .order("display_name", { ascending: true });

  return (data ?? []) as unknown as MicroSkillCatalogRow[];
}

export async function getMicroSkillFamilyRows(
  supabase: SupabaseServerClient,
  skillFamilyKeys: string[],
) {
  if (skillFamilyKeys.length === 0) {
    return [] as MicroSkillFamilyRow[];
  }

  const { data } = await supabase
    .from("micro_skill_families")
    .select(
      "id, mastery_domain_key, skill_family_key, display_name, is_assignable, is_active, metadata, created_at, updated_at",
    )
    .in("skill_family_key", skillFamilyKeys)
    .order("display_name", { ascending: true });

  return (data ?? []) as unknown as MicroSkillFamilyRow[];
}

export async function getMicroSkillClusterRows(
  supabase: SupabaseServerClient,
  skillClusterKeys: string[],
) {
  if (skillClusterKeys.length === 0) {
    return [] as MicroSkillClusterRow[];
  }

  const { data } = await supabase
    .from("micro_skill_clusters")
    .select(
      "id, mastery_domain_key, skill_family_key, skill_cluster_key, display_name, is_assignable, is_active, metadata, created_at, updated_at",
    )
    .in("skill_cluster_key", skillClusterKeys)
    .order("display_name", { ascending: true });

  return (data ?? []) as unknown as MicroSkillClusterRow[];
}
