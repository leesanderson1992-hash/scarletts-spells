import { createClient } from "@supabase/supabase-js";

import {
  buildReturnedCorrectionRepairPlan,
  getReturnedCorrectionRepairAttemptEvidenceType,
  getReturnedCorrectionRepairInitialCompetencyLevel,
  summarizeReturnedCorrectionRepairPlans,
  type ReturnedCorrectionRepairCandidateMapping,
  type ReturnedCorrectionRepairCatalogEntry,
  type ReturnedCorrectionRepairCatalogReviewCase,
  type ReturnedCorrectionRepairCanonicalRecommendation,
  type ReturnedCorrectionRepairEvidence,
  type ReturnedCorrectionRepairIssue,
  type ReturnedCorrectionRepairLearningLink,
  type ReturnedCorrectionRepairPlan,
} from "../lib/writing-engine/persistence/returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "../lib/writing-engine/persistence/returned-correction-route-bridge";

type SupabaseClientLike = ReturnType<typeof createClient<any, "public">>;

type Args = {
  childId?: string;
  submissionId?: string;
  writingIssueId?: string;
  limit?: number;
  apply: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
  help: boolean;
};

type CorrectionAttemptRow = ReturnedCorrectionRouteBridgeAttempt & {
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

const HELP = [
  "Returned-correction Stage D repair",
  "",
  "Dry-run by default:",
  "  npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id>",
  "  npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id> --submission-id <submission-id>",
  "",
  "Apply requires --apply plus --child-id and either --submission-id or --writing-issue-id:",
  "  npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id> --submission-id <submission-id> --apply",
  "",
  "Environment:",
  "  RETURNED_CORRECTION_REPAIR_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  "  RETURNED_CORRECTION_REPAIR_SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY",
].join("\n");

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--child-id":
        args.childId = next();
        break;
      case "--submission-id":
        args.submissionId = next();
        break;
      case "--writing-issue-id":
        args.writingIssueId = next();
        break;
      case "--limit": {
        const limit = Number.parseInt(next(), 10);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit must be a positive integer.");
        }
        args.limit = limit;
        break;
      }
      case "--apply":
        args.apply = true;
        break;
      case "--supabase-url":
        args.supabaseUrl = next();
        break;
      case "--supabase-key":
        args.supabaseKey = next();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.supabaseUrl =
    args.supabaseUrl ??
    process.env.RETURNED_CORRECTION_REPAIR_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  args.supabaseKey =
    args.supabaseKey ??
    process.env.RETURNED_CORRECTION_REPAIR_SUPABASE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return args;
}

function assertRequired(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function validateScope(args: Args) {
  assertRequired(args.childId, "--child-id");

  if (args.apply && !args.submissionId && !args.writingIssueId) {
    throw new Error(
      "Apply mode requires --child-id plus either --submission-id or --writing-issue-id.",
    );
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

async function loadCandidateIssues(input: {
  supabase: SupabaseClientLike;
  childId: string;
  submissionId?: string;
  writingIssueId?: string;
  limit?: number;
}) {
  let query = input.supabase
    .from("writing_issues")
    .select(
      [
        "id",
        "child_id",
        "parent_user_id",
        "task_submission_id",
        "issue_status",
        "final_classification",
        "observed_text",
        "approved_replacement",
        "suggested_replacement",
        "micro_skill_key",
        "theme_key",
        "source_misspelling_instance_id",
        "metadata",
      ].join(", "),
    )
    .eq("child_id", input.childId)
    .not("final_classification", "is", null)
    .order("updated_at", { ascending: false });

  if (input.submissionId) {
    query = query.eq("task_submission_id", input.submissionId);
  }

  if (input.writingIssueId) {
    query = query.eq("id", input.writingIssueId);
  }

  if (input.limit) {
    query = query.limit(input.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load writing issues: ${error.message}`);
  }

  return ((data ?? []) as unknown as ReturnedCorrectionRepairIssue[]).map((issue) => ({
    ...issue,
    metadata: parseMetadata(issue.metadata),
  }));
}

async function loadRowsForIssues(input: {
  supabase: SupabaseClientLike;
  issues: ReturnedCorrectionRepairIssue[];
}) {
  const issueIds = input.issues.map((issue) => issue.id);
  const childIds = uniqueValues(input.issues.map((issue) => issue.child_id));
  const parentUserIds = uniqueValues(input.issues.map((issue) => issue.parent_user_id));
  const sourceMisspellingIds = uniqueValues(
    input.issues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const durableMicroSkillKeys = input.issues
    .map((issue) => issue.micro_skill_key)
    .filter((value): value is string => typeof value === "string" && value !== "unknown");

  if (issueIds.length === 0) {
    return {
      attempts: [] as CorrectionAttemptRow[],
      candidateMappings: [] as ReturnedCorrectionRepairCandidateMapping[],
      catalogEntries: [] as ReturnedCorrectionRepairCatalogEntry[],
      catalogReviewCases: [] as ReturnedCorrectionRepairCatalogReviewCase[],
      canonicalRecommendations: [] as ReturnedCorrectionRepairCanonicalRecommendation[],
      learningItemLinks: [] as ReturnedCorrectionRepairLearningLink[],
      learningItemEvidence: [] as ReturnedCorrectionRepairEvidence[],
    };
  }

  const [
    attemptsResult,
    candidateMappingsResult,
    catalogReviewCasesResult,
    canonicalRecommendationsResult,
    learningItemLinksResult,
    learningItemEvidenceResult,
  ] = await Promise.all([
    input.supabase
      .from("writing_issue_correction_attempts")
      .select(
        [
          "id",
          "writing_issue_id",
          "child_id",
          "parent_user_id",
          "task_submission_id",
          "attempted_correction",
          "attempt_notes",
          "corrected_independently",
          "reflection",
          "metadata",
          "created_at",
        ].join(", "),
      )
      .in("writing_issue_id", issueIds)
      .order("created_at", { ascending: false }),
    sourceMisspellingIds.length > 0
      ? input.supabase
          .from("parent_verified_spelling_candidate_mappings")
          .select(
            [
              "id",
              "parent_user_id",
              "child_id",
              "task_submission_id",
              "source_misspelling_instance_id",
              "micro_skill_key",
              "candidate_status",
              "promotion_scope",
              "metadata",
              "updated_at",
              "original_child_spelling",
              "original_correct_spelling",
            ].join(", "),
          )
          .in("parent_user_id", parentUserIds)
          .in("child_id", childIds)
          .in("source_misspelling_instance_id", sourceMisspellingIds)
          .in("candidate_status", [
            "pending_parent_promotion",
            "parent_local_promoted",
            "admin_review_requested",
          ])
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    sourceMisspellingIds.length > 0
      ? input.supabase
          .from("spelling_catalog_review_cases")
          .select("id, source_misspelling_instance_id, case_status")
          .in("child_id", childIds)
          .in("parent_user_id", parentUserIds)
          .in("source_misspelling_instance_id", sourceMisspellingIds)
      : Promise.resolve({ data: [], error: null }),
    sourceMisspellingIds.length > 0
      ? input.supabase
          .from("spelling_canonical_mapping_recommendations")
          .select(
            "id, source_misspelling_instance_id, micro_skill_key, recommendation_status",
          )
          .in("child_id", childIds)
          .in("parent_user_id", parentUserIds)
          .in("source_misspelling_instance_id", sourceMisspellingIds)
      : Promise.resolve({ data: [], error: null }),
    input.supabase
      .from("learning_item_issue_links")
      .select("id, learning_item_id, writing_issue_id, link_role")
      .in("writing_issue_id", issueIds),
    input.supabase
      .from("learning_item_evidence")
      .select("id, learning_item_id, writing_issue_id, evidence_type, source_context, metadata")
      .in("writing_issue_id", issueIds),
  ]);

  const results = [
    attemptsResult,
    candidateMappingsResult,
    catalogReviewCasesResult,
    canonicalRecommendationsResult,
    learningItemLinksResult,
    learningItemEvidenceResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Failed to load repair context: ${failed.error.message}`);
  }

  const attempts = ((attemptsResult.data ?? []) as unknown as CorrectionAttemptRow[]).map(
    (attempt) => ({
      ...attempt,
      metadata: parseMetadata(attempt.metadata),
    }),
  );
  const candidateMappings = (
    (candidateMappingsResult.data ?? []) as unknown as ReturnedCorrectionRepairCandidateMapping[]
  ).map((mapping) => ({
    ...mapping,
    metadata: parseMetadata(mapping.metadata),
  }));
  const candidateMicroSkillKeys = candidateMappings.map(
    (mapping) => mapping.micro_skill_key,
  );
  const microSkillKeys = uniqueValues([
    ...durableMicroSkillKeys,
    ...candidateMicroSkillKeys,
  ]).filter((value) => value && value !== "unknown");
  const { data: catalogRows, error: catalogError } =
    microSkillKeys.length > 0
      ? await input.supabase
          .from("micro_skill_catalog")
          .select(
            [
              "micro_skill_key",
              "mastery_domain_key",
              "skill_family_key",
              "skill_cluster_key",
              "practice_route",
              "display_name",
              "is_active",
              "is_assignable",
            ].join(", "),
          )
          .in("micro_skill_key", microSkillKeys)
      : { data: [], error: null };

  if (catalogError) {
    throw new Error(`Failed to load catalog rows: ${catalogError.message}`);
  }

  return {
    attempts,
    candidateMappings,
    catalogEntries: (catalogRows ?? []) as ReturnedCorrectionRepairCatalogEntry[],
    catalogReviewCases: (catalogReviewCasesResult.data ??
      []) as ReturnedCorrectionRepairCatalogReviewCase[],
    canonicalRecommendations: (canonicalRecommendationsResult.data ??
      []) as ReturnedCorrectionRepairCanonicalRecommendation[],
    learningItemLinks: (learningItemLinksResult.data ??
      []) as ReturnedCorrectionRepairLearningLink[],
    learningItemEvidence: ((learningItemEvidenceResult.data ??
      []) as ReturnedCorrectionRepairEvidence[]).map((evidence) => ({
      ...evidence,
      metadata: parseMetadata(evidence.metadata),
    })),
  };
}

function buildPlans(input: {
  issues: ReturnedCorrectionRepairIssue[];
  attempts: CorrectionAttemptRow[];
  candidateMappings: ReturnedCorrectionRepairCandidateMapping[];
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases: ReturnedCorrectionRepairCatalogReviewCase[];
  canonicalRecommendations: ReturnedCorrectionRepairCanonicalRecommendation[];
  learningItemLinks: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence: ReturnedCorrectionRepairEvidence[];
  nowIso: string;
}) {
  return input.issues.map((issue) =>
    buildReturnedCorrectionRepairPlan({
      parentUserId: issue.parent_user_id,
      issue,
      attempts: input.attempts.filter((attempt) => attempt.writing_issue_id === issue.id),
      candidateMappings: input.candidateMappings,
      catalogEntries: input.catalogEntries,
      catalogReviewCases: input.catalogReviewCases,
      canonicalRecommendations: input.canonicalRecommendations,
      learningItemLinks: input.learningItemLinks,
      learningItemEvidence: input.learningItemEvidence,
      nowIso: input.nowIso,
    }),
  );
}

async function updateIssueRoute(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  plan: ReturnedCorrectionRepairPlan;
  nowIso: string;
}) {
  if (!input.plan.bridgeMetadata) {
    return 0;
  }

  const nextMetadata = {
    ...parseMetadata(input.issue.metadata),
    returned_correction_route_bridge: input.plan.bridgeMetadata,
    returned_correction_stage_d_repair: {
      repaired_at: input.nowIso,
      action: "attached_parent_local_route",
      dry_run_first: true,
    },
  };
  const routeMutation = input.plan.proposedMutations.find(
    (mutation) => mutation.type === "attach_parent_local_route",
  );

  if (!routeMutation || input.issue.micro_skill_key === routeMutation.microSkillKey) {
    return 0;
  }

  const { error } = await input.supabase
    .from("writing_issues")
    .update({
      micro_skill_key: routeMutation.microSkillKey,
      metadata: nextMetadata,
      updated_at: input.nowIso,
    })
    .eq("id", input.issue.id)
    .eq("parent_user_id", input.issue.parent_user_id)
    .eq("child_id", input.issue.child_id)
    .eq("issue_status", "finalised")
    .not("final_classification", "is", null);

  if (error) {
    throw new Error(`Failed to attach bridged route for ${input.issue.id}: ${error.message}`);
  }

  return 1;
}

async function findOrCreateLearningItem(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  catalog: ReturnedCorrectionRepairCatalogEntry;
  nowIso: string;
}) {
  const { data: existingRows, error: existingError } = await input.supabase
    .from("learning_items")
    .select("id, metadata")
    .eq("child_id", input.issue.child_id)
    .eq("parent_user_id", input.issue.parent_user_id)
    .eq("micro_skill_key", input.catalog.micro_skill_key)
    .eq("practice_route", input.catalog.practice_route)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to find existing learning item: ${existingError.message}`);
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
            writing_issue_id: input.issue.id,
          },
        },
        updated_at: input.nowIso,
      })
      .eq("id", existing.id)
      .eq("parent_user_id", input.issue.parent_user_id)
      .eq("child_id", input.issue.child_id);

    if (error) {
      throw new Error(`Failed to strengthen learning item ${existing.id}: ${error.message}`);
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
          writing_issue_id: input.issue.id,
        },
      },
      created_at: input.nowIso,
      updated_at: input.nowIso,
    })
    .select("id")
    .single();

  if (!insertError && inserted) {
    return { learningItemId: inserted.id as string, created: true, mutationCount: 1 };
  }

  const { data: sourceIssueItem, error: sourceIssueError } = await input.supabase
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

  return { learningItemId: sourceIssueItem.id as string, created: false, mutationCount: 0 };
}

async function ensureIssueLink(input: {
  supabase: SupabaseClientLike;
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

  const { error } = await input.supabase.from("learning_item_issue_links").insert({
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
    throw new Error(`Failed to insert issue link for ${input.issue.id}: ${error.message}`);
  }

  return 1;
}

async function ensureEvidence(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  attempts: CorrectionAttemptRow[];
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

  const existingEvidence = ((existingRows ?? []) as ReturnedCorrectionRepairEvidence[]).map(
    (row) => ({
      ...row,
      metadata: parseMetadata(row.metadata),
    }),
  );
  const initialCompetency = getReturnedCorrectionRepairInitialCompetencyLevel(
    input.issue.final_classification,
  );
  let mutationCount = 0;

  const hasFinalisedOutcomeEvidence = existingEvidence.some(
    (row) => row.source_context === "finalised_issue_outcome",
  );

  if (!hasFinalisedOutcomeEvidence) {
    const { error } = await input.supabase.from("learning_item_evidence").insert({
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
      throw new Error(`Failed to insert final outcome evidence: ${error.message}`);
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
    const { error } = await input.supabase.from("learning_item_evidence").insert({
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
      throw new Error(`Failed to insert attempt evidence ${attempt.id}: ${error.message}`);
    }

    mutationCount += 1;
  }

  return mutationCount;
}

async function applyPlan(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  attempts: CorrectionAttemptRow[];
  plan: ReturnedCorrectionRepairPlan;
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  nowIso: string;
}) {
  if (!input.plan.safeToApply) {
    return { mutationCount: 0, repaired: false, reason: "Plan is not safe to apply." };
  }

  let mutationCount = await updateIssueRoute({
    supabase: input.supabase,
    issue: input.issue,
    plan: input.plan,
    nowIso: input.nowIso,
  });
  const learningMutation = input.plan.proposedMutations.find(
    (mutation) => mutation.type === "create_or_strengthen_learning_item",
  );

  if (!learningMutation) {
    return { mutationCount, repaired: mutationCount > 0, reason: null };
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

  return { mutationCount, repaired: true, reason: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  validateScope(args);

  const supabaseUrl = assertRequired(args.supabaseUrl, "Supabase URL");
  const supabaseKey = assertRequired(args.supabaseKey, "Supabase key");
  const childId = assertRequired(args.childId, "--child-id");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowIso = new Date().toISOString();
  const issues = await loadCandidateIssues({
    supabase,
    childId,
    submissionId: args.submissionId,
    writingIssueId: args.writingIssueId,
    limit: args.limit,
  });
  const rows = await loadRowsForIssues({ supabase, issues });
  const plans = buildPlans({ ...rows, issues, nowIso });
  const summary = summarizeReturnedCorrectionRepairPlans(plans);
  let mutationsApplied = 0;
  const repairedIssueIds: string[] = [];
  const skipped = plans.map((plan) => ({
    issueId: plan.issueId,
    bucket: plan.bucket,
    reason: plan.reasons.join(" "),
  }));

  if (args.apply) {
    for (const plan of plans) {
      const issue = issues.find((candidate) => candidate.id === plan.issueId);
      if (!issue || !plan.safeToApply) {
        continue;
      }

      const result = await applyPlan({
        supabase,
        issue,
        attempts: rows.attempts.filter(
          (attempt) => attempt.writing_issue_id === issue.id,
        ),
        plan,
        catalogEntries: rows.catalogEntries,
        nowIso,
      });
      mutationsApplied += result.mutationCount;
      if (result.repaired) {
        repairedIssueIds.push(plan.issueId);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !args.apply,
        mutationsApplied,
        summary,
        repairedIssueIds,
        skippedIssueIds: skipped.filter((row) => !repairedIssueIds.includes(row.issueId)),
        proposedMutations: plans.flatMap((plan) => plan.proposedMutations),
        rows: plans,
        idempotencyNotes: args.apply
          ? [
              "Issue links are checked before insert and protected by the learning_item_issue_links unique index.",
              "Stage D evidence rows include correction_attempt_id metadata and are checked before insert.",
              "Running apply again should report zero new repair mutations for rows already linked.",
            ]
          : [
              "Dry-run mode does not write data.",
              "Use --apply with --child-id and --submission-id or --writing-issue-id to mutate safe rows.",
            ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
