import { createClient } from "@supabase/supabase-js";

import {
  buildReturnedCorrectionDeferredRouteReplayPlan,
  summarizeReturnedCorrectionDeferredRouteReplayPlans,
  type ReturnedCorrectionDeferredRouteReplayAdminDecision,
  type ReturnedCorrectionDeferredRouteReplayCanonicalMapping,
  type ReturnedCorrectionDeferredRouteReplayCatalogReviewCase,
  type ReturnedCorrectionDeferredRouteReplayPlan,
} from "../lib/writing-engine/persistence/returned-correction-deferred-route-replay";
import {
  getReturnedCorrectionRepairAttemptEvidenceType,
  getReturnedCorrectionRepairInitialCompetencyLevel,
  type ReturnedCorrectionRepairCatalogEntry,
  type ReturnedCorrectionRepairEvidence,
  type ReturnedCorrectionRepairIssue,
  type ReturnedCorrectionRepairLearningLink,
} from "../lib/writing-engine/persistence/returned-correction-repair";
import type { ReturnedCorrectionRouteBridgeAttempt } from "../lib/writing-engine/persistence/returned-correction-route-bridge";

type SupabaseClientLike = ReturnType<typeof createClient>;

type Args = {
  childId?: string;
  submissionId?: string;
  writingIssueId?: string;
  adminCaseId?: string;
  canonicalMappingId?: string;
  microSkillKey?: string;
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
  "Returned-correction Stage F deferred route replay",
  "",
  "Dry-run by default:",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --child-id <child-id>",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --admin-case-id <case-id>",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --canonical-mapping-id <mapping-id>",
  "",
  "Apply requires --apply plus one focused scope:",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --admin-case-id <case-id> --apply",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --writing-issue-id <issue-id> --apply",
  "  npx tsx scripts/returned-correction-stage-f-deferred-route-replay.ts --child-id <child-id> --limit <n> --apply",
  "",
  "Environment:",
  "  RETURNED_CORRECTION_REPLAY_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  "  RETURNED_CORRECTION_REPLAY_SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY",
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
      case "--admin-case-id":
        args.adminCaseId = next();
        break;
      case "--canonical-mapping-id":
        args.canonicalMappingId = next();
        break;
      case "--micro-skill-key":
        args.microSkillKey = next();
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
    process.env.RETURNED_CORRECTION_REPLAY_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  args.supabaseKey =
    args.supabaseKey ??
    process.env.RETURNED_CORRECTION_REPLAY_SUPABASE_KEY ??
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
  const hasAnyScope = Boolean(
    args.childId ||
      args.submissionId ||
      args.writingIssueId ||
      args.adminCaseId ||
      args.canonicalMappingId ||
      args.microSkillKey,
  );

  if (!hasAnyScope) {
    throw new Error(
      "Stage F requires targeted scope: --child-id, --submission-id, --writing-issue-id, --admin-case-id, --canonical-mapping-id, or --micro-skill-key.",
    );
  }

  if (
    args.apply &&
    !args.writingIssueId &&
    !args.adminCaseId &&
    !args.canonicalMappingId &&
    !args.submissionId &&
    !(args.childId && args.limit)
  ) {
    throw new Error(
      "Apply mode requires --writing-issue-id, --admin-case-id, --canonical-mapping-id, --submission-id, or --child-id plus --limit.",
    );
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSpelling(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

async function loadScopeCases(input: { supabase: SupabaseClientLike; args: Args }) {
  if (!input.args.adminCaseId && !input.args.canonicalMappingId) {
    return {
      scopedCases: [] as ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[],
      scopedCanonicalMappings: [] as ReturnedCorrectionDeferredRouteReplayCanonicalMapping[],
    };
  }

  const scopedCanonicalMappings: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[] =
    [];
  if (input.args.canonicalMappingId) {
    const { data, error } = await input.supabase
      .from("spelling_canonical_mappings")
      .select(
        [
          "id",
          "misspelling_normalized",
          "correct_spelling_normalized",
          "micro_skill_key",
          "mapping_status",
          "source_case_id",
        ].join(", "),
      )
      .eq("id", input.args.canonicalMappingId)
      .limit(1);

    if (error) {
      throw new Error(`Failed to load scoped canonical mapping: ${error.message}`);
    }

    scopedCanonicalMappings.push(
      ...((data ?? []) as ReturnedCorrectionDeferredRouteReplayCanonicalMapping[]),
    );
  }

  let scopedCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[] = [];
  if (input.args.adminCaseId) {
    const { data, error } = await input.supabase
      .from("spelling_catalog_review_cases")
      .select(
        [
          "id",
          "source_misspelling_instance_id",
          "case_status",
          "misspelling_normalized",
          "correct_spelling_normalized",
        ].join(", "),
      )
      .eq("id", input.args.adminCaseId)
      .limit(1);

    if (error) {
      throw new Error(`Failed to load scoped admin case: ${error.message}`);
    }

    scopedCases = (data ?? []) as ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  } else if (scopedCanonicalMappings.length > 0) {
    const mapping = scopedCanonicalMappings[0];
    const { data, error } = await input.supabase
      .from("spelling_catalog_review_cases")
      .select(
        [
          "id",
          "source_misspelling_instance_id",
          "case_status",
          "misspelling_normalized",
          "correct_spelling_normalized",
        ].join(", "),
      )
      .eq("misspelling_normalized", mapping.misspelling_normalized)
      .eq("correct_spelling_normalized", mapping.correct_spelling_normalized);

    if (error) {
      throw new Error(`Failed to load canonical mapping review cases: ${error.message}`);
    }

    scopedCases = (data ?? []) as ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  }

  return { scopedCases, scopedCanonicalMappings };
}

async function loadCandidateIssues(input: {
  supabase: SupabaseClientLike;
  args: Args;
  scopedCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
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
    .not("final_classification", "is", null)
    .order("updated_at", { ascending: false });

  if (input.args.childId) {
    query = query.eq("child_id", input.args.childId);
  }

  if (input.args.submissionId) {
    query = query.eq("task_submission_id", input.args.submissionId);
  }

  if (input.args.writingIssueId) {
    query = query.eq("id", input.args.writingIssueId);
  }

  if (input.scopedCases.length > 0) {
    query = query.in(
      "source_misspelling_instance_id",
      input.scopedCases.map((reviewCase) => reviewCase.source_misspelling_instance_id),
    );
  }

  if (input.args.microSkillKey) {
    query = query.eq("micro_skill_key", input.args.microSkillKey);
  }

  if (input.args.limit) {
    query = query.limit(input.args.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load writing issues: ${error.message}`);
  }

  return ((data ?? []) as ReturnedCorrectionRepairIssue[]).map((issue) => ({
    ...issue,
    metadata: parseMetadata(issue.metadata),
  }));
}

async function loadRowsForIssues(input: {
  supabase: SupabaseClientLike;
  issues: ReturnedCorrectionRepairIssue[];
  scopedCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  scopedCanonicalMappings: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[];
}) {
  const issueIds = input.issues.map((issue) => issue.id);
  const sourceMisspellingIds = uniqueValues(
    input.issues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const durableMicroSkillKeys = input.issues
    .map((issue) => issue.micro_skill_key)
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().toLowerCase() !== "unknown",
    );

  if (issueIds.length === 0) {
    return {
      attempts: [] as CorrectionAttemptRow[],
      catalogEntries: [] as ReturnedCorrectionRepairCatalogEntry[],
      catalogReviewCases: [] as ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[],
      canonicalMappings: input.scopedCanonicalMappings,
      adminDecisions: [] as ReturnedCorrectionDeferredRouteReplayAdminDecision[],
      learningItemLinks: [] as ReturnedCorrectionRepairLearningLink[],
      learningItemEvidence: [] as ReturnedCorrectionRepairEvidence[],
    };
  }

  const [
    attemptsResult,
    casesResult,
    linksResult,
    evidenceResult,
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
          .from("spelling_catalog_review_cases")
          .select(
            [
              "id",
              "source_misspelling_instance_id",
              "case_status",
              "misspelling_normalized",
              "correct_spelling_normalized",
            ].join(", "),
          )
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

  const results = [attemptsResult, casesResult, linksResult, evidenceResult];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Failed to load Stage F context: ${failed.error.message}`);
  }

  const loadedCases = (casesResult.data ??
    []) as ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  const catalogReviewCases = [
    ...loadedCases,
    ...input.scopedCases.filter(
      (scopedCase) => !loadedCases.some((candidate) => candidate.id === scopedCase.id),
    ),
  ];
  const normalizedPairs = uniqueValues(
    [
      ...input.issues.map((issue) => {
        const misspelling = normalizeSpelling(issue.observed_text);
        const correction = normalizeSpelling(
          issue.approved_replacement ?? issue.suggested_replacement,
        );
        return misspelling && correction ? `${misspelling}\u0000${correction}` : null;
      }),
      ...catalogReviewCases.map(
        (reviewCase) =>
          `${reviewCase.misspelling_normalized}\u0000${reviewCase.correct_spelling_normalized}`,
      ),
      ...input.scopedCanonicalMappings.map(
        (mapping) =>
          `${mapping.misspelling_normalized}\u0000${mapping.correct_spelling_normalized}`,
      ),
    ].filter((value): value is string => typeof value === "string"),
  );
  const misspellings = uniqueValues(
    normalizedPairs.map((pair) => pair.split("\u0000")[0]).filter(Boolean),
  );
  const corrections = uniqueValues(
    normalizedPairs.map((pair) => pair.split("\u0000")[1]).filter(Boolean),
  );
  const canonicalMappingsResult =
    misspellings.length > 0 && corrections.length > 0
      ? await input.supabase
          .from("spelling_canonical_mappings")
          .select(
            [
              "id",
              "misspelling_normalized",
              "correct_spelling_normalized",
              "micro_skill_key",
              "mapping_status",
              "source_case_id",
            ].join(", "),
          )
          .eq("mapping_status", "active")
          .in("misspelling_normalized", misspellings)
          .in("correct_spelling_normalized", corrections)
      : { data: [], error: null };

  if (canonicalMappingsResult.error) {
    throw new Error(
      `Failed to load canonical mappings: ${canonicalMappingsResult.error.message}`,
    );
  }

  const canonicalMappings = [
    ...((canonicalMappingsResult.data ??
      []) as ReturnedCorrectionDeferredRouteReplayCanonicalMapping[]),
    ...input.scopedCanonicalMappings,
  ].filter(
    (mapping, index, rows) => rows.findIndex((row) => row.id === mapping.id) === index,
  );
  const caseIds = uniqueValues([
    ...catalogReviewCases.map((reviewCase) => reviewCase.id),
    ...canonicalMappings
      .map((mapping) => mapping.source_case_id)
      .filter((value): value is string => typeof value === "string"),
  ]);
  const decisionsResult =
    caseIds.length > 0
      ? await input.supabase
          .from("spelling_catalog_review_case_decisions")
          .select(
            [
              "id",
              "case_id",
              "decision_type",
              "new_status",
              "linked_micro_skill_key",
              "canonical_mapping_id",
            ].join(", "),
          )
          .in("case_id", caseIds)
      : { data: [], error: null };

  if (decisionsResult.error) {
    throw new Error(
      `Failed to load admin route decisions: ${decisionsResult.error.message}`,
    );
  }

  const canonicalMicroSkillKeys = canonicalMappings.map(
    (mapping) => mapping.micro_skill_key,
  );
  const decisionMicroSkillKeys = ((decisionsResult.data ??
    []) as ReturnedCorrectionDeferredRouteReplayAdminDecision[])
    .map((decision) => decision.linked_micro_skill_key)
    .filter((value): value is string => typeof value === "string");
  const microSkillKeys = uniqueValues([
    ...durableMicroSkillKeys,
    ...canonicalMicroSkillKeys,
    ...decisionMicroSkillKeys,
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
    attempts: ((attemptsResult.data ?? []) as CorrectionAttemptRow[]).map(
      (attempt) => ({
        ...attempt,
        metadata: parseMetadata(attempt.metadata),
      }),
    ),
    catalogEntries: (catalogRows ?? []) as ReturnedCorrectionRepairCatalogEntry[],
    catalogReviewCases,
    canonicalMappings,
    adminDecisions: (decisionsResult.data ??
      []) as ReturnedCorrectionDeferredRouteReplayAdminDecision[],
    learningItemLinks: (linksResult.data ?? []) as ReturnedCorrectionRepairLearningLink[],
    learningItemEvidence: ((evidenceResult.data ??
      []) as ReturnedCorrectionRepairEvidence[]).map((evidence) => ({
      ...evidence,
      metadata: parseMetadata(evidence.metadata),
    })),
  };
}

function buildPlans(input: {
  issues: ReturnedCorrectionRepairIssue[];
  attempts: CorrectionAttemptRow[];
  catalogEntries: ReturnedCorrectionRepairCatalogEntry[];
  catalogReviewCases: ReturnedCorrectionDeferredRouteReplayCatalogReviewCase[];
  canonicalMappings: ReturnedCorrectionDeferredRouteReplayCanonicalMapping[];
  adminDecisions: ReturnedCorrectionDeferredRouteReplayAdminDecision[];
  learningItemLinks: ReturnedCorrectionRepairLearningLink[];
  learningItemEvidence: ReturnedCorrectionRepairEvidence[];
}) {
  return input.issues.map((issue) =>
    buildReturnedCorrectionDeferredRouteReplayPlan({
      issue,
      attempts: input.attempts.filter((attempt) => attempt.writing_issue_id === issue.id),
      catalogEntries: input.catalogEntries,
      catalogReviewCases: input.catalogReviewCases,
      canonicalMappings: input.canonicalMappings,
      adminDecisions: input.adminDecisions,
      learningItemLinks: input.learningItemLinks,
      learningItemEvidence: input.learningItemEvidence,
    }),
  );
}

async function updateIssueRoute(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  plan: ReturnedCorrectionDeferredRouteReplayPlan;
  nowIso: string;
}) {
  const routeMutation = input.plan.proposedMutations.find(
    (mutation) => mutation.type === "attach_verified_route",
  );

  if (!routeMutation || input.issue.micro_skill_key === routeMutation.microSkillKey) {
    return 0;
  }

  const { error } = await input.supabase
    .from("writing_issues")
    .update({
      micro_skill_key: routeMutation.microSkillKey,
      metadata: {
        ...parseMetadata(input.issue.metadata),
        returned_correction_stage_f_replay: {
          replayed_at: input.nowIso,
          action: "attached_verified_route",
          route_source: routeMutation.routeSource,
          canonical_mapping_id: routeMutation.canonicalMappingId ?? null,
          admin_decision_id: routeMutation.adminDecisionId ?? null,
          admin_case_id: routeMutation.adminCaseId ?? null,
          dry_run_first: true,
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
    throw new Error(`Failed to attach Stage F route for ${input.issue.id}: ${error.message}`);
  }

  return 1;
}

async function findOrCreateLearningItem(input: {
  supabase: SupabaseClientLike;
  issue: ReturnedCorrectionRepairIssue;
  catalog: ReturnedCorrectionRepairCatalogEntry;
  plan: ReturnedCorrectionDeferredRouteReplayPlan;
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

  const replayMetadata = {
    replayed_at: input.nowIso,
    action: "strengthened",
    writing_issue_id: input.issue.id,
    route_source: input.plan.routeSupport.source,
    canonical_mapping_id: input.plan.routeSupport.canonicalMappingId,
    admin_decision_id: input.plan.routeSupport.adminDecisionId,
    admin_case_id: input.plan.routeSupport.adminCaseId,
  };
  const existing = ((existingRows ?? []) as LearningItemRow[])[0];
  if (existing) {
    const { error } = await input.supabase
      .from("learning_items")
      .update({
        metadata: {
          ...parseMetadata(existing.metadata),
          returned_correction_stage_f_replay: replayMetadata,
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
        returned_correction_stage_f_replay: {
          ...replayMetadata,
          action: "created",
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
      returned_correction_stage_f_replay: true,
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
  plan: ReturnedCorrectionDeferredRouteReplayPlan;
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

  if (
    !existingEvidence.some((row) => row.source_context === "finalised_issue_outcome")
  ) {
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
        returned_correction_stage_f_replay: {
          route_source: input.plan.routeSupport.source,
          canonical_mapping_id: input.plan.routeSupport.canonicalMappingId,
          admin_decision_id: input.plan.routeSupport.adminDecisionId,
          admin_case_id: input.plan.routeSupport.adminCaseId,
        },
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
        returned_correction_stage_f_replay: true,
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
  plan: ReturnedCorrectionDeferredRouteReplayPlan;
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
    plan: input.plan,
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
    plan: input.plan,
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
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowIso = new Date().toISOString();
  const scopeRows = await loadScopeCases({ supabase, args });
  const issues = await loadCandidateIssues({
    supabase,
    args,
    scopedCases: scopeRows.scopedCases,
  });
  const rows = await loadRowsForIssues({
    supabase,
    issues,
    scopedCases: scopeRows.scopedCases,
    scopedCanonicalMappings: scopeRows.scopedCanonicalMappings,
  });
  const plans = buildPlans({ ...rows, issues });
  const summary = summarizeReturnedCorrectionDeferredRouteReplayPlans(plans);
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
              "Stage F evidence rows include correction_attempt_id metadata and are checked before insert.",
              "Running apply again should report zero new replay mutations for rows already linked.",
            ]
          : [
              "Dry-run mode does not write data.",
              "Use --apply with a focused scope to mutate safe rows.",
              "Canonical/admin route support alone is insufficient without preserved learning-relevant final classification.",
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
