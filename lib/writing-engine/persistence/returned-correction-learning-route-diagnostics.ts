import {
  loadUnifiedSpellingReviewItemsForSubmission,
  type UnifiedSpellingReviewItem,
} from "./unified-spelling-review-items";
import type {
  WritingIssueFinalClassification,
  WritingIssueStatus,
} from "../../writing-practice/types";

type SupabaseQueryBuilder = PromiseLike<{ data: unknown }> & {
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
};

type SupabaseServerClient = {
  from(table: string): {
    select(columns: string): SupabaseQueryBuilder;
  };
};

export type ReturnedCorrectionDiagnosticWritingIssueRow = {
  id: string;
  issue_status: WritingIssueStatus;
  final_classification: WritingIssueFinalClassification | null;
  micro_skill_key: string | null;
  source_misspelling_instance_id: string | null;
  source_suggestion_id: string | null;
};

export type ReturnedCorrectionDiagnosticCandidateMappingRow = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status:
    | "pending_parent_promotion"
    | "parent_local_promoted"
    | "admin_review_requested"
    | "global_canonical_promoted"
    | "rejected"
    | "superseded";
  promotion_scope: "child_local" | "parent_local" | "global";
};

export type ReturnedCorrectionDiagnosticCatalogReviewCaseRow = {
  id: string;
  source_misspelling_instance_id: string;
  case_status: string;
};

export type ReturnedCorrectionDiagnosticCatalogRow = {
  micro_skill_key: string;
  display_name: string;
  practice_route: string | null;
  is_active: boolean;
  is_assignable: boolean;
};

export type ReturnedCorrectionDiagnosticLearningItemLinkRow = {
  id: string;
  learning_item_id: string;
  writing_issue_id: string;
  link_role: string;
};

export type ReturnedCorrectionDiagnosticLearningItemEvidenceRow = {
  id: string;
  learning_item_id: string;
  writing_issue_id: string | null;
  evidence_type: string;
  source_context: string | null;
};

export type ReturnedCorrectionRouteSource =
  | "durable_issue"
  | "parent_local_promoted"
  | "admin_deferred"
  | "none";

export type ReturnedCorrectionDiagnosticDisposition =
  | "retry_ready"
  | "needs_child_retry"
  | "needs_parent_decision"
  | "needs_final_classification"
  | "non_learning_finalised"
  | "learning_queue_ready"
  | "parent_local_route_ready"
  | "admin_deferred"
  | "blocked";

export type ReturnedCorrectionLearningRouteDiagnosticRow = {
  id: string;
  source: UnifiedSpellingReviewItem["source"];
  observedText: string;
  expectedCorrection: string | null;
  latestChildAttempt: string | null;
  childReflection: string | null;
  finalClassification: WritingIssueFinalClassification | null;
  sourceRowIds: UnifiedSpellingReviewItem["sourceIds"];
  issue: {
    id: string | null;
    status: WritingIssueStatus | null;
    durableMicroSkillKey: string | null;
    sourceMisspellingInstanceId: string | null;
    sourceSuggestionId: string | null;
  };
  route: {
    source: ReturnedCorrectionRouteSource;
    microSkillKey: string | null;
    catalogDisplayName: string | null;
    catalogPracticeRoute: string | null;
    catalogExists: boolean;
    catalogActive: boolean;
    catalogAssignable: boolean;
    candidateMappingId: string | null;
    candidateMappingStatus: string | null;
    catalogReviewCaseId: string | null;
    canonicalRecommendationId: string | null;
  };
  learningItem: {
    exists: boolean;
    learningItemIds: string[];
    issueLinkExists: boolean;
    evidenceCount: number;
  };
  retryReady: boolean;
  learningQueueReady: boolean;
  disposition: ReturnedCorrectionDiagnosticDisposition;
  whyNot: string[];
};

export type ReturnedCorrectionLearningRouteDiagnosticSummary = {
  totalRowCount: number;
  retryReadyCount: number;
  learningQueueReadyCount: number;
  adminDeferredCount: number;
  blockedCount: number;
  needsFinalClassificationCount: number;
  nonLearningFinalisedCount: number;
};

export type ReturnedCorrectionLearningRouteDiagnostics = {
  submissionId: string;
  parentUserId: string;
  childId: string;
  rows: ReturnedCorrectionLearningRouteDiagnosticRow[];
  summary: ReturnedCorrectionLearningRouteDiagnosticSummary;
};

export type BuildReturnedCorrectionLearningRouteDiagnosticsInput = {
  submissionId: string;
  parentUserId: string;
  childId: string;
  unifiedRows: UnifiedSpellingReviewItem[];
  writingIssues: ReturnedCorrectionDiagnosticWritingIssueRow[];
  candidateMappings: ReturnedCorrectionDiagnosticCandidateMappingRow[];
  catalogReviewCases: ReturnedCorrectionDiagnosticCatalogReviewCaseRow[];
  catalogRows: ReturnedCorrectionDiagnosticCatalogRow[];
  learningItemIssueLinks: ReturnedCorrectionDiagnosticLearningItemLinkRow[];
  learningItemEvidence: ReturnedCorrectionDiagnosticLearningItemEvidenceRow[];
};

const LEARNING_RELEVANT_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);

function hasMeaningfulMicroSkillKey(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function getIssueId(row: UnifiedSpellingReviewItem) {
  return row.sourceIds.originalWritingIssueId ?? row.sourceIds.writingIssueId;
}

function getRouteSource(input: {
  durableRouteReady: boolean;
  promotedCandidateMapping: ReturnedCorrectionDiagnosticCandidateMappingRow | null;
  catalogReviewCase: ReturnedCorrectionDiagnosticCatalogReviewCaseRow | null;
}): ReturnedCorrectionRouteSource {
  if (input.durableRouteReady) {
    return "durable_issue";
  }

  if (input.promotedCandidateMapping) {
    return "parent_local_promoted";
  }

  if (input.catalogReviewCase) {
    return "admin_deferred";
  }

  return "none";
}

function getDisposition(input: {
  row: UnifiedSpellingReviewItem;
  issueStatus: WritingIssueStatus | null;
  finalClassification: WritingIssueFinalClassification | null;
  learningRelevant: boolean;
  routeSource: ReturnedCorrectionRouteSource;
  routeAssignable: boolean;
  learningQueueReady: boolean;
  learningItemExists: boolean;
  retryReady: boolean;
}) {
  if (input.learningQueueReady) {
    return "learning_queue_ready" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (
    input.finalClassification === "checking_only" ||
    input.finalClassification === "not_an_issue"
  ) {
    return "non_learning_finalised" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (input.routeSource === "admin_deferred") {
    return "admin_deferred" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (
    input.learningRelevant &&
    input.routeSource === "parent_local_promoted" &&
    input.routeAssignable &&
    !input.learningItemExists
  ) {
    return "parent_local_route_ready" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (input.row.state === "child_responded" && !input.finalClassification) {
    return "needs_final_classification" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (input.issueStatus === "sent_back_to_child") {
    return "needs_child_retry" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (input.row.state === "pending_parent_review") {
    return "needs_parent_decision" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  if (input.retryReady && !input.finalClassification) {
    return "retry_ready" satisfies ReturnedCorrectionDiagnosticDisposition;
  }

  return "blocked" satisfies ReturnedCorrectionDiagnosticDisposition;
}

export function buildReturnedCorrectionLearningRouteDiagnostics(
  input: BuildReturnedCorrectionLearningRouteDiagnosticsInput,
): ReturnedCorrectionLearningRouteDiagnostics {
  const issuesById = new Map(input.writingIssues.map((issue) => [issue.id, issue]));
  const catalogByMicroSkill = new Map(
    input.catalogRows.map((catalog) => [catalog.micro_skill_key, catalog]),
  );
  const candidateMappingsByMisspellingId = new Map<
    string,
    ReturnedCorrectionDiagnosticCandidateMappingRow[]
  >();
  const catalogCaseByMisspellingId = new Map(
    input.catalogReviewCases.map((reviewCase) => [
      reviewCase.source_misspelling_instance_id,
      reviewCase,
    ]),
  );
  const linksByIssueId = new Map<string, ReturnedCorrectionDiagnosticLearningItemLinkRow[]>();
  const evidenceByIssueId = new Map<
    string,
    ReturnedCorrectionDiagnosticLearningItemEvidenceRow[]
  >();

  input.candidateMappings.forEach((mapping) => {
    if (!mapping.source_misspelling_instance_id) {
      return;
    }

    candidateMappingsByMisspellingId.set(mapping.source_misspelling_instance_id, [
      ...(candidateMappingsByMisspellingId.get(mapping.source_misspelling_instance_id) ??
        []),
      mapping,
    ]);
  });
  input.learningItemIssueLinks.forEach((link) => {
    linksByIssueId.set(link.writing_issue_id, [
      ...(linksByIssueId.get(link.writing_issue_id) ?? []),
      link,
    ]);
  });
  input.learningItemEvidence.forEach((evidence) => {
    if (!evidence.writing_issue_id) {
      return;
    }

    evidenceByIssueId.set(evidence.writing_issue_id, [
      ...(evidenceByIssueId.get(evidence.writing_issue_id) ?? []),
      evidence,
    ]);
  });

  const rows = input.unifiedRows.map((row) => {
    const issueId = getIssueId(row);
    const issue = issueId ? issuesById.get(issueId) ?? null : null;
    const sourceMisspellingId =
      issue?.source_misspelling_instance_id ?? row.sourceIds.misspellingInstanceId;
    const candidateMappings =
      sourceMisspellingId === null
        ? []
        : candidateMappingsByMisspellingId.get(sourceMisspellingId) ?? [];
    const promotedCandidateMapping =
      candidateMappings.find(
        (mapping) =>
          mapping.promotion_scope === "parent_local" &&
          mapping.candidate_status === "parent_local_promoted",
      ) ?? null;
    const catalogReviewCase =
      sourceMisspellingId === null
        ? null
        : catalogCaseByMisspellingId.get(sourceMisspellingId) ?? null;
    const durableMicroSkillKey = issue?.micro_skill_key ?? row.microSkillKey;
    const durableCatalog = hasMeaningfulMicroSkillKey(durableMicroSkillKey)
      ? catalogByMicroSkill.get(durableMicroSkillKey as string) ?? null
      : null;
    const candidateCatalog = promotedCandidateMapping
      ? catalogByMicroSkill.get(promotedCandidateMapping.micro_skill_key) ?? null
      : null;
    const durableRouteReady =
      Boolean(durableCatalog?.is_active) && Boolean(durableCatalog?.is_assignable);
    const routeSource = getRouteSource({
      durableRouteReady,
      promotedCandidateMapping,
      catalogReviewCase,
    });
    const routeMicroSkillKey =
      routeSource === "durable_issue"
        ? durableMicroSkillKey
        : routeSource === "parent_local_promoted"
          ? promotedCandidateMapping?.micro_skill_key ?? null
          : null;
    const routeCatalog =
      routeSource === "durable_issue"
        ? durableCatalog
        : routeSource === "parent_local_promoted"
          ? candidateCatalog
          : null;
    const issueLinks = issueId ? linksByIssueId.get(issueId) ?? [] : [];
    const issueEvidence = issueId ? evidenceByIssueId.get(issueId) ?? [] : [];
    const linkedLearningItemIds = uniqueValues(
      issueLinks.map((link) => link.learning_item_id),
    );
    const finalClassification =
      issue?.final_classification ?? row.correctionOutcome ?? null;
    const learningRelevant = LEARNING_RELEVANT_CLASSIFICATIONS.has(
      finalClassification ?? "",
    );
    const routeAssignable =
      Boolean(routeCatalog?.is_active) && Boolean(routeCatalog?.is_assignable);
    const learningItemExists = linkedLearningItemIds.length > 0;
    const retryReady =
      row.source === "returned_correction"
        ? row.state === "child_responded" || Boolean(row.latestChildAttempt)
        : row.state !== "categorisation_needed" && row.state !== "pending_parent_review";
    const learningQueueReady =
      learningRelevant && routeAssignable && learningItemExists;
    const whyNot: string[] = [];

    if (!retryReady) {
      whyNot.push("No child retry or retry-equivalent response is present yet.");
    }

    if (!finalClassification) {
      whyNot.push("Final educational outcome has not been chosen yet.");
    } else if (!learningRelevant) {
      whyNot.push("Final outcome is non-learning and should not create a learning item.");
    } else if (!routeAssignable) {
      if (routeSource === "admin_deferred") {
        whyNot.push("Route is deferred to admin/catalog review.");
      } else {
        whyNot.push("No active assignable micro-skill route is attached or bridged.");
      }
    } else if (!learningItemExists) {
      whyNot.push("Assignable route exists, but no learning item link exists yet.");
    }

    const disposition = getDisposition({
      row,
      issueStatus: issue?.issue_status ?? null,
      finalClassification,
      learningRelevant,
      routeSource,
      routeAssignable,
      learningQueueReady,
      learningItemExists,
      retryReady,
    });

    return {
      id: row.id,
      source: row.source,
      observedText: row.observedText,
      expectedCorrection: row.expectedCorrection,
      latestChildAttempt: row.latestChildAttempt,
      childReflection: row.childReflection,
      finalClassification,
      sourceRowIds: row.sourceIds,
      issue: {
        id: issue?.id ?? issueId ?? null,
        status: issue?.issue_status ?? null,
        durableMicroSkillKey: durableMicroSkillKey ?? null,
        sourceMisspellingInstanceId: sourceMisspellingId,
        sourceSuggestionId:
          issue?.source_suggestion_id ?? row.sourceIds.writingIssueSuggestionId,
      },
      route: {
        source: routeSource,
        microSkillKey: routeMicroSkillKey ?? null,
        catalogDisplayName: routeCatalog?.display_name ?? null,
        catalogPracticeRoute: routeCatalog?.practice_route ?? null,
        catalogExists: Boolean(routeCatalog),
        catalogActive: Boolean(routeCatalog?.is_active),
        catalogAssignable: Boolean(routeCatalog?.is_assignable),
        candidateMappingId: promotedCandidateMapping?.id ?? null,
        candidateMappingStatus: promotedCandidateMapping?.candidate_status ?? null,
        catalogReviewCaseId: catalogReviewCase?.id ?? null,
        canonicalRecommendationId: row.sourceIds.canonicalRecommendationId,
      },
      learningItem: {
        exists: learningItemExists,
        learningItemIds: linkedLearningItemIds,
        issueLinkExists: issueLinks.length > 0,
        evidenceCount: issueEvidence.length,
      },
      retryReady,
      learningQueueReady,
      disposition,
      whyNot,
    } satisfies ReturnedCorrectionLearningRouteDiagnosticRow;
  });

  return {
    submissionId: input.submissionId,
    parentUserId: input.parentUserId,
    childId: input.childId,
    rows,
    summary: {
      totalRowCount: rows.length,
      retryReadyCount: rows.filter((row) => row.retryReady).length,
      learningQueueReadyCount: rows.filter((row) => row.learningQueueReady).length,
      adminDeferredCount: rows.filter((row) => row.disposition === "admin_deferred")
        .length,
      blockedCount: rows.filter((row) => row.disposition === "blocked").length,
      needsFinalClassificationCount: rows.filter(
        (row) => row.disposition === "needs_final_classification",
      ).length,
      nonLearningFinalisedCount: rows.filter(
        (row) => row.disposition === "non_learning_finalised",
      ).length,
    },
  };
}

export async function loadReturnedCorrectionLearningRouteDiagnostics(input: {
  supabase: unknown;
  submissionId: string;
  parentUserId: string;
  childId: string;
}) {
  const supabase = input.supabase as SupabaseServerClient;
  const unifiedRows = await loadUnifiedSpellingReviewItemsForSubmission(input);
  const issueIds = uniqueValues(
    unifiedRows
      .map(getIssueId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const sourceMisspellingIds = uniqueValues(
    unifiedRows
      .map((row) => row.sourceIds.misspellingInstanceId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const { data: writingIssueRows } =
    issueIds.length > 0
      ? await supabase
          .from("writing_issues")
          .select(
            "id, issue_status, final_classification, micro_skill_key, source_misspelling_instance_id, source_suggestion_id",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("id", issueIds)
      : { data: [] };
  const issues = (writingIssueRows ??
    []) as ReturnedCorrectionDiagnosticWritingIssueRow[];
  const allMisspellingIds = uniqueValues([
    ...sourceMisspellingIds,
    ...issues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ]);
  const [
    { data: candidateMappingRows },
    { data: catalogReviewCaseRows },
    { data: learningItemIssueLinkRows },
    { data: learningItemEvidenceRows },
  ] = await Promise.all([
    allMisspellingIds.length > 0
      ? supabase
          .from("parent_verified_spelling_candidate_mappings")
          .select(
            "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("source_misspelling_instance_id", allMisspellingIds)
          .in("candidate_status", [
            "pending_parent_promotion",
            "parent_local_promoted",
            "admin_review_requested",
          ])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    allMisspellingIds.length > 0
      ? supabase
          .from("spelling_catalog_review_cases")
          .select("id, source_misspelling_instance_id, case_status")
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .eq("case_status", "open")
          .in("source_misspelling_instance_id", allMisspellingIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    issueIds.length > 0
      ? supabase
          .from("learning_item_issue_links")
          .select("id, learning_item_id, writing_issue_id, link_role")
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("writing_issue_id", issueIds)
      : Promise.resolve({ data: [] }),
    issueIds.length > 0
      ? supabase
          .from("learning_item_evidence")
          .select("id, learning_item_id, writing_issue_id, evidence_type, source_context")
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("writing_issue_id", issueIds)
      : Promise.resolve({ data: [] }),
  ]);
  const candidateMappings = (candidateMappingRows ??
    []) as ReturnedCorrectionDiagnosticCandidateMappingRow[];
  const microSkillKeys = uniqueValues(
    [
      ...issues.map((issue) => issue.micro_skill_key),
      ...candidateMappings.map((mapping) => mapping.micro_skill_key),
      ...unifiedRows.map((row) => row.microSkillKey),
    ].filter(hasMeaningfulMicroSkillKey) as string[],
  );
  const { data: catalogRows } =
    microSkillKeys.length > 0
      ? await supabase
          .from("micro_skill_catalog")
          .select(
            "micro_skill_key, display_name, practice_route, is_active, is_assignable",
          )
          .in("micro_skill_key", microSkillKeys)
      : { data: [] };

  return buildReturnedCorrectionLearningRouteDiagnostics({
    submissionId: input.submissionId,
    parentUserId: input.parentUserId,
    childId: input.childId,
    unifiedRows,
    writingIssues: issues,
    candidateMappings,
    catalogReviewCases: (catalogReviewCaseRows ??
      []) as ReturnedCorrectionDiagnosticCatalogReviewCaseRow[],
    catalogRows: (catalogRows ?? []) as ReturnedCorrectionDiagnosticCatalogRow[],
    learningItemIssueLinks: (learningItemIssueLinkRows ??
      []) as ReturnedCorrectionDiagnosticLearningItemLinkRow[],
    learningItemEvidence: (learningItemEvidenceRows ??
      []) as ReturnedCorrectionDiagnosticLearningItemEvidenceRow[],
  });
}
