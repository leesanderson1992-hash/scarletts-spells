import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_AUDIT_REPORT_PATH =
  "tmp/writing-engine-structured-payload-integrity-audit-2026-06-12T19-30-25-337Z.json";
const CUTOFF_ISO = "2026-06-01T00:00:00.000Z";
const CONFIRMATION_TOKEN = "delete-pre-june-warning-submissions";
const QUERY_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 100;

type Mode = "dry-run" | "apply";

type Finding = {
  severity: string;
  category: string;
  ids?: {
    submissionId?: string;
    taskId?: string;
    courseId?: string;
    childId?: string;
    parentUserId?: string;
    writingIssueIds?: string[];
    writingSampleIds?: string[];
  };
  recoveryCategory?: string;
};

type SubmissionRow = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  parent_user_id: string;
  submitted_at: string;
  created_at?: string | null;
  updated_at?: string | null;
  parent_review_status?: string | null;
};

type CleanupPlan = {
  selectedSubmissionIds: string[];
  excludedSubmissionIds: string[];
  excludedOnOrAfterCutoffSubmissionIds: string[];
  canonicalLineageExcludedSubmissions: CanonicalLineageSubmissionExclusion[];
  excludedWarnings: Array<{
    submissionId: string | null;
    category: string;
    reason: string;
  }>;
  warningFindingsIncluded: number;
  warningFindingsTotal: number;
  warningFindingCountBySubmissionId: Record<string, number>;
  reasonBySubmissionId: Record<
    string,
    {
      categories: string[];
      recoveryCategories: string[];
      submittedAt: string;
      parentReviewStatus: string | null;
    }
  >;
};

type RelatedRows = Record<string, any[]>;

type CanonicalLineageSubmissionExclusion = {
  submissionId: string;
  reasons: string[];
  protectedCaseIds: string[];
  protectedDecisionIds: string[];
  upstreamIds: {
    taskSubmissionIds: string[];
    writingSampleIds: string[];
    sourceMisspellingInstanceIds: string[];
    sourceSuggestionIds: string[];
  };
};

type CascadeRisk = {
  protectedCaseUpstreamIds: {
    taskSubmissionIds: string[];
    sourceMisspellingInstanceIds: string[];
    writingSampleIds: string[];
    sourceSuggestionIds: string[];
  };
  plannedCascadeDeleteIds: {
    task_submissions: string[];
    misspelling_instances: string[];
  };
  plannedForeignKeyMutationIds: {
    writing_samples: string[];
    writing_issue_suggestions: string[];
  };
  protectedCaseIdsAtRisk: string[];
  protectedDecisionIdsAtRisk: string[];
};

type DeletePlan = {
  deleteOrder: Array<{
    table: string;
    ids: string[];
    note?: string;
  }>;
  manualReview: Record<string, any[]>;
  relatedRows: RelatedRows;
  protectedWritingIssueIds: string[];
  protectedCatalogReviewCaseIds: string[];
  protectedCatalogReviewCaseDecisionIds: string[];
  cascadeRisk: CascadeRisk;
  skippedDraftIds: string[];
};

type SupabaseLike = {
  from(table: string): any;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunk<T>(values: T[]) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    chunks.push(values.slice(index, index + BATCH_SIZE));
  }
  return chunks;
}

function isLocalSupabaseUrl(url: string) {
  const parsed = new URL(url);
  return (
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    parsed.port === "54321"
  );
}

function getSupabaseProjectRef(url: string) {
  const parsed = new URL(url);
  const [ref] = parsed.hostname.split(".");
  return ref || null;
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ref?: string;
      role?: string;
      iss?: string;
    };
  } catch {
    return null;
  }
}

function getConfig() {
  const mode: Mode = process.argv.includes("--apply") ? "apply" : "dry-run";
  const explicitDryRun = process.argv.includes("--dry-run");
  const reportPath =
    readEnv("STRUCTURED_WARNING_CLEANUP_AUDIT_REPORT_PATH") ??
    DEFAULT_AUDIT_REPORT_PATH;
  const url = readEnv("STRUCTURED_WARNING_CLEANUP_SUPABASE_URL");
  const key = readEnv("STRUCTURED_WARNING_CLEANUP_SUPABASE_KEY");

  if (!url) {
    throw new Error("Missing STRUCTURED_WARNING_CLEANUP_SUPABASE_URL.");
  }

  if (!key) {
    throw new Error("Missing STRUCTURED_WARNING_CLEANUP_SUPABASE_KEY.");
  }

  if (mode === "apply" && explicitDryRun) {
    throw new Error("Refusing ambiguous mode: pass either --dry-run or --apply, not both.");
  }

  const local = isLocalSupabaseUrl(url);
  const hosted = !local;
  const hostedReadAllowed =
    readEnv("STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_READ_ONLY") === "true";
  const hostedDeleteAllowed =
    readEnv("STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_DELETE") === "true";
  const confirmation =
    readEnv("CONFIRM_PRE_JUNE_STRUCTURED_WARNING_DELETE");

  if (hosted && mode === "dry-run" && !hostedReadAllowed) {
    throw new Error(
      "Refusing hosted dry-run without STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_READ_ONLY=true.",
    );
  }

  if (mode === "apply") {
    if (confirmation !== CONFIRMATION_TOKEN) {
      throw new Error(
        `Refusing apply without CONFIRM_PRE_JUNE_STRUCTURED_WARNING_DELETE=${CONFIRMATION_TOKEN}.`,
      );
    }

    if (hosted && !hostedDeleteAllowed) {
      throw new Error(
        "Refusing hosted apply without STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_DELETE=true.",
      );
    }
  }

  const jwtPayload = decodeJwtPayload(key);
  const projectRef = getSupabaseProjectRef(url);
  if (projectRef && jwtPayload?.ref && jwtPayload.ref !== projectRef) {
    throw new Error(
      `Refusing key/project mismatch: key ref ${jwtPayload.ref} does not match URL ref ${projectRef}.`,
    );
  }

  return {
    mode,
    reportPath,
    url,
    key,
    local,
    hosted,
    keyRole: jwtPayload?.role ?? "unknown",
    projectRef,
  };
}

function createSupabase(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseLike;
}

async function countRows(supabase: SupabaseLike, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function fetchByIds(
  supabase: SupabaseLike,
  table: string,
  ids: string[],
  select = "*",
  column = "id",
) {
  if (ids.length === 0) {
    return [];
  }

  const rows: any[] = [];
  for (const idsChunk of chunk(ids)) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, idsChunk)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Unable to read ${table}.${column}: ${error.message}`);
    }

    rows.push(...(data ?? []));
  }

  return rows;
}

async function fetchOrByColumns(
  supabase: SupabaseLike,
  table: string,
  clauses: Array<{ column: string; ids: string[] }>,
  select = "*",
) {
  const byId = new Map<string, any>();

  for (const clause of clauses) {
    const rows = await fetchByIds(supabase, table, clause.ids, select, clause.column);
    rows.forEach((row) => {
      if (typeof row.id === "string") {
        byId.set(row.id, row);
      }
    });
  }

  return Array.from(byId.values());
}

function loadWarningFindings(reportPath: string) {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    findings?: Finding[];
  };

  if (!Array.isArray(report.findings)) {
    throw new Error(`Audit report does not contain findings: ${reportPath}`);
  }

  return report.findings.filter((finding) => finding.severity === "warning");
}

async function deriveCleanupPlan(input: {
  supabase: SupabaseLike;
  reportPath: string;
}) {
  const warnings = loadWarningFindings(input.reportPath);
  const warningSubmissionIds = uniq(
    warnings.map((finding) => finding.ids?.submissionId),
  );
  const submissions = (await fetchByIds(
    input.supabase,
    "task_submissions",
    warningSubmissionIds,
    "id, task_id, course_id, child_id, parent_user_id, submitted_at, created_at, updated_at, parent_review_status",
  )) as SubmissionRow[];
  const submissionsById = new Map(submissions.map((submission) => [submission.id, submission]));
  const selectedSubmissionIds = new Set<string>();
  const excludedSubmissionIds = new Set<string>();
  const excludedOnOrAfterCutoffSubmissionIds = new Set<string>();
  const excludedWarnings: CleanupPlan["excludedWarnings"] = [];
  const includedWarningKeys = new Set<string>();
  const warningFindingCountBySubmissionId: Record<string, number> = {};
  const reasonBySubmissionId: CleanupPlan["reasonBySubmissionId"] = {};

  warnings.forEach((finding, index) => {
    const submissionId = finding.ids?.submissionId ?? null;
    if (!submissionId) {
      excludedWarnings.push({
        submissionId,
        category: finding.category,
        reason: "warning finding has no task_submission_id",
      });
      return;
    }

    const submission = submissionsById.get(submissionId);
    if (!submission) {
      excludedSubmissionIds.add(submissionId);
      excludedWarnings.push({
        submissionId,
        category: finding.category,
        reason: "task submission no longer exists",
      });
      return;
    }

    if (submission.submitted_at >= CUTOFF_ISO) {
      excludedSubmissionIds.add(submissionId);
      excludedOnOrAfterCutoffSubmissionIds.add(submissionId);
      excludedWarnings.push({
        submissionId,
        category: finding.category,
        reason: `submitted_at is on or after cutoff: ${submission.submitted_at}`,
      });
      return;
    }

    selectedSubmissionIds.add(submissionId);
    includedWarningKeys.add(`${index}:${finding.category}:${submissionId}`);
    warningFindingCountBySubmissionId[submissionId] =
      (warningFindingCountBySubmissionId[submissionId] ?? 0) + 1;
    const reason = reasonBySubmissionId[submissionId] ?? {
      categories: [],
      recoveryCategories: [],
      submittedAt: submission.submitted_at,
      parentReviewStatus: submission.parent_review_status ?? null,
    };
    reason.categories = uniq([...reason.categories, finding.category]);
    reason.recoveryCategories = uniq([
      ...reason.recoveryCategories,
      finding.recoveryCategory,
    ]);
    reasonBySubmissionId[submissionId] = reason;
  });

  return {
    selectedSubmissionIds: Array.from(selectedSubmissionIds).sort(),
    excludedSubmissionIds: Array.from(excludedSubmissionIds).sort(),
    excludedOnOrAfterCutoffSubmissionIds: Array.from(
      excludedOnOrAfterCutoffSubmissionIds,
    ).sort(),
    canonicalLineageExcludedSubmissions: [] as CanonicalLineageSubmissionExclusion[],
    excludedWarnings,
    warningFindingsIncluded: includedWarningKeys.size,
    warningFindingsTotal: warnings.length,
    warningFindingCountBySubmissionId,
    reasonBySubmissionId,
  } satisfies CleanupPlan;
}

function keyForSubmission(row: {
  parent_user_id: string;
  child_id: string;
  task_id: string;
}) {
  return `${row.parent_user_id}:${row.child_id}:${row.task_id}`;
}

function ids(rows: any[]) {
  return uniq(rows.map((row) => row.id));
}

function rowsById(rows: any[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function intersect(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

async function collectRelatedRows(input: {
  supabase: SupabaseLike;
  selectedSubmissionIds: string[];
}) {
  const selectedSubmissions = (await fetchByIds(
    input.supabase,
    "task_submissions",
    input.selectedSubmissionIds,
  )) as SubmissionRow[];
  const taskIds = uniq(selectedSubmissions.map((submission) => submission.task_id));
  const selectedKeys = new Set(selectedSubmissions.map(keyForSubmission));
  const allTaskSubmissions = (await fetchByIds(
    input.supabase,
    "task_submissions",
    taskIds,
    "id, task_id, course_id, child_id, parent_user_id, submitted_at, created_at, updated_at, parent_review_status",
    "task_id",
  )) as SubmissionRow[];
  const latestSubmissionIdByKey = new Map<string, string>();
  allTaskSubmissions.forEach((submission) => {
    const key = keyForSubmission(submission);
    const existingId = latestSubmissionIdByKey.get(key);
    const existing = existingId
      ? allTaskSubmissions.find((candidate) => candidate.id === existingId)
      : null;
    if (!existing || submission.submitted_at > existing.submitted_at) {
      latestSubmissionIdByKey.set(key, submission.id);
    }
  });

  const payloads = await fetchByIds(
    input.supabase,
    "task_submission_payloads",
    input.selectedSubmissionIds,
    "*",
    "submission_id",
  );
  const allDraftsForTasks = await fetchByIds(
    input.supabase,
    "task_submission_drafts",
    taskIds,
    "*",
    "task_id",
  );
  const safeDrafts = allDraftsForTasks.filter((draft) => {
    const draftKey = keyForSubmission(draft);
    const latestSubmissionId = latestSubmissionIdByKey.get(draftKey);
    return (
      selectedKeys.has(draftKey) &&
      latestSubmissionId &&
      input.selectedSubmissionIds.includes(latestSubmissionId)
    );
  });
  const skippedDrafts = allDraftsForTasks.filter((draft) => {
    const draftKey = keyForSubmission(draft);
    return selectedKeys.has(draftKey) && !safeDrafts.some((safe) => safe.id === draft.id);
  });
  const writingSamples = await fetchByIds(
    input.supabase,
    "writing_samples",
    input.selectedSubmissionIds,
    "*",
    "task_submission_id",
  );
  const writingSampleIds = ids(writingSamples);
  const misspellings = await fetchByIds(
    input.supabase,
    "misspelling_instances",
    writingSampleIds,
    "*",
    "writing_sample_id",
  );
  const misspellingIds = ids(misspellings);
  const suggestions = await fetchOrByColumns(input.supabase, "writing_issue_suggestions", [
    { column: "task_submission_id", ids: input.selectedSubmissionIds },
    { column: "writing_sample_id", ids: writingSampleIds },
    { column: "misspelling_instance_id", ids: misspellingIds },
  ]);
  const suggestionIds = ids(suggestions);
  const writingIssues = await fetchOrByColumns(input.supabase, "writing_issues", [
    { column: "task_submission_id", ids: input.selectedSubmissionIds },
    { column: "writing_sample_id", ids: writingSampleIds },
    { column: "source_misspelling_instance_id", ids: misspellingIds },
    { column: "source_suggestion_id", ids: suggestionIds },
  ]);
  const writingIssueIds = ids(writingIssues);
  const correctionAttempts = await fetchOrByColumns(
    input.supabase,
    "writing_issue_correction_attempts",
    [
      { column: "task_submission_id", ids: input.selectedSubmissionIds },
      { column: "writing_issue_id", ids: writingIssueIds },
    ],
  );
  const correctionAttemptIds = ids(correctionAttempts);
  const parentVerifications = await fetchOrByColumns(input.supabase, "parent_verifications", [
    { column: "task_submission_id", ids: input.selectedSubmissionIds },
    { column: "writing_sample_id", ids: writingSampleIds },
  ]);
  const parentVerificationIds = ids(parentVerifications);
  const candidateMappings = await fetchOrByColumns(
    input.supabase,
    "parent_verified_spelling_candidate_mappings",
    [
      { column: "task_submission_id", ids: input.selectedSubmissionIds },
      { column: "writing_sample_id", ids: writingSampleIds },
      { column: "source_suggestion_id", ids: suggestionIds },
      { column: "source_misspelling_instance_id", ids: misspellingIds },
      { column: "parent_verification_id", ids: parentVerificationIds },
    ],
  );
  const candidateMappingIds = ids(candidateMappings);
  const catalogCases = await fetchOrByColumns(input.supabase, "spelling_catalog_review_cases", [
    { column: "task_submission_id", ids: input.selectedSubmissionIds },
    { column: "writing_sample_id", ids: writingSampleIds },
    { column: "source_suggestion_id", ids: suggestionIds },
    { column: "source_misspelling_instance_id", ids: misspellingIds },
  ]);
  const catalogCaseIds = ids(catalogCases);
  const catalogCaseDecisions = await fetchOrByColumns(
    input.supabase,
    "spelling_catalog_review_case_decisions",
    [
      { column: "case_id", ids: catalogCaseIds },
      { column: "merge_target_case_id", ids: catalogCaseIds },
      { column: "superseded_by_case_id", ids: catalogCaseIds },
    ],
  );
  const catalogCaseDecisionIds = ids(catalogCaseDecisions);
  const canonicalMappingSourceCaseReferences = await fetchByIds(
    input.supabase,
    "spelling_canonical_mappings",
    catalogCaseIds,
    "*",
    "source_case_id",
  );
  const canonicalMappingSourceDecisionReferences = await fetchByIds(
    input.supabase,
    "spelling_canonical_mappings",
    catalogCaseDecisionIds,
    "*",
    "source_decision_id",
  );
  const canonicalMappingEventSourceCaseReferences = await fetchByIds(
    input.supabase,
    "spelling_canonical_mapping_events",
    catalogCaseIds,
    "*",
    "source_case_id",
  );
  const canonicalMappingEventSourceDecisionReferences = await fetchByIds(
    input.supabase,
    "spelling_canonical_mapping_events",
    catalogCaseDecisionIds,
    "*",
    "source_decision_id",
  );
  const canonicalRecommendations = await fetchOrByColumns(
    input.supabase,
    "spelling_canonical_mapping_recommendations",
    [
      { column: "task_submission_id", ids: input.selectedSubmissionIds },
      { column: "writing_sample_id", ids: writingSampleIds },
      { column: "source_misspelling_instance_id", ids: misspellingIds },
      { column: "source_writing_issue_id", ids: writingIssueIds },
      { column: "source_correction_attempt_id", ids: correctionAttemptIds },
      { column: "parent_verification_id", ids: parentVerificationIds },
      { column: "source_suggestion_id", ids: suggestionIds },
      { column: "candidate_mapping_id", ids: candidateMappingIds },
    ],
  );
  const learningItemIssueLinks = await fetchByIds(
    input.supabase,
    "learning_item_issue_links",
    writingIssueIds,
    "*",
    "writing_issue_id",
  );
  const learningItemEvidence = await fetchOrByColumns(
    input.supabase,
    "learning_item_evidence",
    [
      { column: "task_submission_id", ids: input.selectedSubmissionIds },
      { column: "writing_issue_id", ids: writingIssueIds },
    ],
  );
  const learningItems = await fetchOrByColumns(input.supabase, "learning_items", [
    { column: "source_writing_issue_id", ids: writingIssueIds },
  ]);
  const assignmentItems = await fetchByIds(
    input.supabase,
    "assignment_items",
    ids(learningItems),
    "*",
    "learning_item_id",
  );
  const taskCompletions = await fetchOrByColumns(input.supabase, "task_completions", [
    { column: "task_id", ids: taskIds },
  ]);

  return {
    selectedSubmissions,
    task_submission_payloads: payloads,
    task_submission_drafts: safeDrafts,
    skipped_task_submission_drafts: skippedDrafts,
    writing_samples: writingSamples,
    misspelling_instances: misspellings,
    writing_issue_suggestions: suggestions,
    writing_issues: writingIssues,
    writing_issue_correction_attempts: correctionAttempts,
    parent_verifications: parentVerifications,
    parent_verified_spelling_candidate_mappings: candidateMappings,
    spelling_catalog_review_cases: catalogCases,
    spelling_catalog_review_case_decisions: catalogCaseDecisions,
    canonical_mapping_source_case_references: canonicalMappingSourceCaseReferences,
    canonical_mapping_source_decision_references:
      canonicalMappingSourceDecisionReferences,
    canonical_mapping_event_source_case_references:
      canonicalMappingEventSourceCaseReferences,
    canonical_mapping_event_source_decision_references:
      canonicalMappingEventSourceDecisionReferences,
    spelling_canonical_mapping_recommendations: canonicalRecommendations,
    learning_item_issue_links: learningItemIssueLinks,
    learning_item_evidence: learningItemEvidence,
    learning_items: learningItems,
    assignment_items: assignmentItems,
    task_completions: taskCompletions,
  } satisfies RelatedRows;
}

function deriveCanonicalLineageExclusions(input: {
  relatedRows: RelatedRows;
  selectedSubmissionIds: string[];
}) {
  const selectedSubmissionIdSet = new Set(input.selectedSubmissionIds);
  const writingSamplesById = rowsById(input.relatedRows.writing_samples);
  const misspellingsById = rowsById(input.relatedRows.misspelling_instances);
  const suggestionsById = rowsById(input.relatedRows.writing_issue_suggestions);
  const protectedCaseIds = uniq([
    ...input.relatedRows.canonical_mapping_source_case_references.map(
      (row) => row.source_case_id,
    ),
    ...input.relatedRows.canonical_mapping_event_source_case_references.map(
      (row) => row.source_case_id,
    ),
  ]);
  const protectedCaseIdSet = new Set(protectedCaseIds);
  const protectedDecisionIds = uniq([
    ...input.relatedRows.canonical_mapping_source_decision_references.map(
      (row) => row.source_decision_id,
    ),
    ...input.relatedRows.canonical_mapping_event_source_decision_references.map(
      (row) => row.source_decision_id,
    ),
  ]);
  const protectedDecisionIdSet = new Set(protectedDecisionIds);
  const protectedCases = input.relatedRows.spelling_catalog_review_cases.filter(
    (catalogCase) => protectedCaseIdSet.has(catalogCase.id),
  );
  const protectedDecisions = input.relatedRows.spelling_catalog_review_case_decisions.filter(
    (decision) =>
      protectedDecisionIdSet.has(decision.id) || protectedCaseIdSet.has(decision.case_id),
  );
  const protectedDecisionsByCaseId = new Map<string, any[]>();
  protectedDecisions.forEach((decision) => {
    const rows = protectedDecisionsByCaseId.get(decision.case_id) ?? [];
    rows.push(decision);
    protectedDecisionsByCaseId.set(decision.case_id, rows);
  });

  const exclusionsBySubmissionId = new Map<
    string,
    CanonicalLineageSubmissionExclusion
  >();
  const ensureExclusion = (submissionId: string) => {
    const existing = exclusionsBySubmissionId.get(submissionId);
    if (existing) {
      return existing;
    }
    const exclusion: CanonicalLineageSubmissionExclusion = {
      submissionId,
      reasons: [],
      protectedCaseIds: [],
      protectedDecisionIds: [],
      upstreamIds: {
        taskSubmissionIds: [],
        writingSampleIds: [],
        sourceMisspellingInstanceIds: [],
        sourceSuggestionIds: [],
      },
    };
    exclusionsBySubmissionId.set(submissionId, exclusion);
    return exclusion;
  };
  const addExclusion = (
    submissionId: string | null | undefined,
    reason: string,
    catalogCase: any,
  ) => {
    if (!submissionId || !selectedSubmissionIdSet.has(submissionId)) {
      return;
    }
    const exclusion = ensureExclusion(submissionId);
    exclusion.reasons = uniq([...exclusion.reasons, reason]);
    exclusion.protectedCaseIds = uniq([...exclusion.protectedCaseIds, catalogCase.id]);
    exclusion.protectedDecisionIds = uniq([
      ...exclusion.protectedDecisionIds,
      ...ids(protectedDecisionsByCaseId.get(catalogCase.id) ?? []),
    ]);
    exclusion.upstreamIds.taskSubmissionIds = uniq([
      ...exclusion.upstreamIds.taskSubmissionIds,
      catalogCase.task_submission_id,
    ]);
    exclusion.upstreamIds.writingSampleIds = uniq([
      ...exclusion.upstreamIds.writingSampleIds,
      catalogCase.writing_sample_id,
    ]);
    exclusion.upstreamIds.sourceMisspellingInstanceIds = uniq([
      ...exclusion.upstreamIds.sourceMisspellingInstanceIds,
      catalogCase.source_misspelling_instance_id,
    ]);
    exclusion.upstreamIds.sourceSuggestionIds = uniq([
      ...exclusion.upstreamIds.sourceSuggestionIds,
      catalogCase.source_suggestion_id,
    ]);
  };
  const submissionIdForWritingSample = (writingSampleId: string | null | undefined) => {
    if (!writingSampleId) {
      return null;
    }
    return writingSamplesById.get(writingSampleId)?.task_submission_id ?? null;
  };
  const submissionIdForMisspelling = (misspellingId: string | null | undefined) => {
    if (!misspellingId) {
      return null;
    }
    const misspelling = misspellingsById.get(misspellingId);
    return submissionIdForWritingSample(misspelling?.writing_sample_id);
  };
  const submissionIdForSuggestion = (suggestionId: string | null | undefined) => {
    if (!suggestionId) {
      return null;
    }
    const suggestion = suggestionsById.get(suggestionId);
    return (
      suggestion?.task_submission_id ??
      submissionIdForWritingSample(suggestion?.writing_sample_id) ??
      submissionIdForMisspelling(suggestion?.misspelling_instance_id) ??
      null
    );
  };

  protectedCases.forEach((catalogCase) => {
    addExclusion(
      catalogCase.task_submission_id,
      "protected catalog case directly references this task_submission_id",
      catalogCase,
    );
    addExclusion(
      submissionIdForWritingSample(catalogCase.writing_sample_id),
      "protected catalog case references this submission through writing_sample_id",
      catalogCase,
    );
    addExclusion(
      submissionIdForMisspelling(catalogCase.source_misspelling_instance_id),
      "protected catalog case references this submission through source_misspelling_instance_id",
      catalogCase,
    );
    addExclusion(
      submissionIdForSuggestion(catalogCase.source_suggestion_id),
      "protected catalog case references this submission through source_suggestion_id",
      catalogCase,
    );
  });

  return Array.from(exclusionsBySubmissionId.values()).sort((left, right) =>
    left.submissionId.localeCompare(right.submissionId),
  );
}

function applyCanonicalLineageExclusions(
  cleanupPlan: CleanupPlan,
  exclusions: CanonicalLineageSubmissionExclusion[],
) {
  if (exclusions.length === 0) {
    return cleanupPlan;
  }

  const excludedIdSet = new Set(exclusions.map((exclusion) => exclusion.submissionId));
  const reasonBySubmissionId = { ...cleanupPlan.reasonBySubmissionId };
  exclusions.forEach((exclusion) => {
    delete reasonBySubmissionId[exclusion.submissionId];
  });
  const excludedWarningCount = exclusions.reduce(
    (total, exclusion) =>
      total + (cleanupPlan.warningFindingCountBySubmissionId[exclusion.submissionId] ?? 0),
    0,
  );

  return {
    ...cleanupPlan,
    selectedSubmissionIds: cleanupPlan.selectedSubmissionIds.filter(
      (submissionId) => !excludedIdSet.has(submissionId),
    ),
    excludedSubmissionIds: uniq([
      ...cleanupPlan.excludedSubmissionIds,
      ...exclusions.map((exclusion) => exclusion.submissionId),
    ]).sort(),
    canonicalLineageExcludedSubmissions: exclusions,
    excludedWarnings: [
      ...cleanupPlan.excludedWarnings,
      ...exclusions.map((exclusion) => ({
        submissionId: exclusion.submissionId,
        category: "canonical_lineage_protected_submission",
        reason: `excluded from safe subset because ${exclusion.reasons.join("; ")}`,
      })),
    ],
    warningFindingsIncluded: cleanupPlan.warningFindingsIncluded - excludedWarningCount,
    reasonBySubmissionId,
  } satisfies CleanupPlan;
}

function buildDeletePlan(relatedRows: RelatedRows): DeletePlan {
  const linkedLearningIssueIds = new Set([
    ...relatedRows.learning_item_issue_links.map((row) => row.writing_issue_id),
    ...relatedRows.learning_item_evidence.map((row) => row.writing_issue_id),
    ...relatedRows.learning_items.map((row) => row.source_writing_issue_id),
  ].filter(Boolean));
  const protectedWritingIssueIds = relatedRows.writing_issues
    .filter((issue) => linkedLearningIssueIds.has(issue.id))
    .map((issue) => issue.id);
  const protectedWritingIssueIdSet = new Set(protectedWritingIssueIds);
  const deletableWritingIssues = relatedRows.writing_issues.filter(
    (issue) => !protectedWritingIssueIdSet.has(issue.id),
  );
  const deletableCorrectionAttempts = relatedRows.writing_issue_correction_attempts.filter(
    (attempt) => !protectedWritingIssueIdSet.has(attempt.writing_issue_id),
  );
  const protectedCatalogReviewCaseIds = uniq([
    ...relatedRows.canonical_mapping_source_case_references.map(
      (row) => row.source_case_id,
    ),
    ...relatedRows.canonical_mapping_event_source_case_references.map(
      (row) => row.source_case_id,
    ),
  ]);
  const protectedCatalogReviewCaseIdSet = new Set(protectedCatalogReviewCaseIds);
  const protectedCatalogReviewCaseDecisionIds = uniq([
    ...relatedRows.canonical_mapping_source_decision_references.map(
      (row) => row.source_decision_id,
    ),
    ...relatedRows.canonical_mapping_event_source_decision_references.map(
      (row) => row.source_decision_id,
    ),
    ...relatedRows.spelling_catalog_review_case_decisions
      .filter((decision) => protectedCatalogReviewCaseIdSet.has(decision.case_id))
      .map((decision) => decision.id),
  ]);
  const protectedCatalogReviewCaseDecisionIdSet = new Set(
    protectedCatalogReviewCaseDecisionIds,
  );
  const deletableCatalogCases = relatedRows.spelling_catalog_review_cases.filter(
    (catalogCase) => !protectedCatalogReviewCaseIdSet.has(catalogCase.id),
  );
  const deletableCatalogCaseDecisions =
    relatedRows.spelling_catalog_review_case_decisions.filter(
      (decision) => !protectedCatalogReviewCaseDecisionIdSet.has(decision.id),
    );
  const protectedCatalogReviewCases = relatedRows.spelling_catalog_review_cases.filter(
    (catalogCase) => protectedCatalogReviewCaseIdSet.has(catalogCase.id),
  );
  const protectedCatalogReviewCaseDecisions =
    relatedRows.spelling_catalog_review_case_decisions.filter((decision) =>
      protectedCatalogReviewCaseDecisionIdSet.has(decision.id),
    );
  const manualReview: RelatedRows = {
    learning_item_issue_links: relatedRows.learning_item_issue_links,
    learning_item_evidence: relatedRows.learning_item_evidence,
    learning_items: relatedRows.learning_items,
    assignment_items: relatedRows.assignment_items,
    spelling_canonical_mapping_recommendations:
      relatedRows.spelling_canonical_mapping_recommendations,
    task_completions: relatedRows.task_completions,
    protected_writing_issues: relatedRows.writing_issues.filter((issue) =>
      protectedWritingIssueIdSet.has(issue.id),
    ),
    cascade_risk_protected_catalog_review_cases: [],
    cascade_risk_protected_catalog_review_case_decisions: [],
    canonical_mapping_source_case_references:
      relatedRows.canonical_mapping_source_case_references,
    canonical_mapping_source_decision_references:
      relatedRows.canonical_mapping_source_decision_references,
    canonical_mapping_event_source_case_references:
      relatedRows.canonical_mapping_event_source_case_references,
    canonical_mapping_event_source_decision_references:
      relatedRows.canonical_mapping_event_source_decision_references,
    protected_spelling_catalog_review_cases: protectedCatalogReviewCases,
    protected_spelling_catalog_review_case_decisions:
      protectedCatalogReviewCaseDecisions,
    skipped_task_submission_drafts: relatedRows.skipped_task_submission_drafts,
  };

  const deleteOrder = [
      {
        table: "spelling_catalog_review_case_decisions",
        ids: ids(deletableCatalogCaseDecisions),
        note: "Decisions referenced by canonical mapping lineage, or attached to protected cases, are skipped.",
      },
      {
        table: "spelling_catalog_review_cases",
        ids: ids(deletableCatalogCases),
        note: "Cases referenced by canonical mapping lineage are skipped.",
      },
      {
        table: "parent_verified_spelling_candidate_mappings",
        ids: ids(relatedRows.parent_verified_spelling_candidate_mappings),
      },
      {
        table: "parent_verifications",
        ids: ids(relatedRows.parent_verifications),
      },
      {
        table: "writing_issue_correction_attempts",
        ids: ids(deletableCorrectionAttempts),
        note: "Attempts linked to protected learning-item issues are skipped.",
      },
      {
        table: "writing_issues",
        ids: ids(deletableWritingIssues),
        note: "Issues linked to learning items/evidence are skipped.",
      },
      {
        table: "writing_issue_suggestions",
        ids: ids(relatedRows.writing_issue_suggestions),
      },
      {
        table: "misspelling_instances",
        ids: ids(relatedRows.misspelling_instances),
      },
      {
        table: "writing_samples",
        ids: ids(relatedRows.writing_samples),
      },
      {
        table: "task_submission_payloads",
        ids: ids(relatedRows.task_submission_payloads),
      },
      {
        table: "task_submission_drafts",
        ids: ids(relatedRows.task_submission_drafts),
        note: "Only drafts whose latest submission for parent/child/task is selected are deleted.",
      },
      {
        table: "task_submissions",
        ids: ids(relatedRows.selectedSubmissions),
      },
    ];
  const plannedIdsByTable = new Map(
    deleteOrder.map((entry) => [entry.table, new Set(entry.ids)]),
  );
  const plannedIds = (table: string) =>
    Array.from(plannedIdsByTable.get(table) ?? new Set<string>());
  const protectedCaseUpstreamIds = {
    taskSubmissionIds: uniq(
      protectedCatalogReviewCases.map((catalogCase) => catalogCase.task_submission_id),
    ),
    sourceMisspellingInstanceIds: uniq(
      protectedCatalogReviewCases.map(
        (catalogCase) => catalogCase.source_misspelling_instance_id,
      ),
    ),
    writingSampleIds: uniq(
      protectedCatalogReviewCases.map((catalogCase) => catalogCase.writing_sample_id),
    ),
    sourceSuggestionIds: uniq(
      protectedCatalogReviewCases.map((catalogCase) => catalogCase.source_suggestion_id),
    ),
  };
  const plannedCascadeDeleteIds = {
    task_submissions: intersect(
      protectedCaseUpstreamIds.taskSubmissionIds,
      plannedIds("task_submissions"),
    ),
    misspelling_instances: intersect(
      protectedCaseUpstreamIds.sourceMisspellingInstanceIds,
      plannedIds("misspelling_instances"),
    ),
  };
  const plannedForeignKeyMutationIds = {
    writing_samples: intersect(
      protectedCaseUpstreamIds.writingSampleIds,
      plannedIds("writing_samples"),
    ),
    writing_issue_suggestions: intersect(
      protectedCaseUpstreamIds.sourceSuggestionIds,
      plannedIds("writing_issue_suggestions"),
    ),
  };
  const protectedCaseIdsAtRisk = protectedCatalogReviewCases
    .filter(
      (catalogCase) =>
        plannedCascadeDeleteIds.task_submissions.includes(catalogCase.task_submission_id) ||
        plannedCascadeDeleteIds.misspelling_instances.includes(
          catalogCase.source_misspelling_instance_id,
        ) ||
        plannedForeignKeyMutationIds.writing_samples.includes(
          catalogCase.writing_sample_id,
        ) ||
        plannedForeignKeyMutationIds.writing_issue_suggestions.includes(
          catalogCase.source_suggestion_id,
        ),
    )
    .map((catalogCase) => catalogCase.id);
  const protectedCaseIdsAtRiskSet = new Set(protectedCaseIdsAtRisk);
  const protectedDecisionIdsAtRisk = protectedCatalogReviewCaseDecisions
    .filter((decision) => protectedCaseIdsAtRiskSet.has(decision.case_id))
    .map((decision) => decision.id);
  const cascadeRisk = {
    protectedCaseUpstreamIds,
    plannedCascadeDeleteIds,
    plannedForeignKeyMutationIds,
    protectedCaseIdsAtRisk,
    protectedDecisionIdsAtRisk,
  };
  manualReview.cascade_risk_protected_catalog_review_cases =
    protectedCatalogReviewCases.filter((catalogCase) =>
      protectedCaseIdsAtRiskSet.has(catalogCase.id),
    );
  manualReview.cascade_risk_protected_catalog_review_case_decisions =
    protectedCatalogReviewCaseDecisions.filter((decision) =>
      protectedDecisionIdsAtRisk.includes(decision.id),
    );

  return {
    deleteOrder,
    manualReview,
    relatedRows,
    protectedWritingIssueIds,
    protectedCatalogReviewCaseIds,
    protectedCatalogReviewCaseDecisionIds,
    cascadeRisk,
    skippedDraftIds: ids(relatedRows.skipped_task_submission_drafts),
  };
}

function tableCounts(rowsByTable: RelatedRows) {
  return Object.fromEntries(
    Object.entries(rowsByTable).map(([table, rows]) => [table, rows.length]),
  );
}

function deleteCounts(deletePlan: DeletePlan) {
  return Object.fromEntries(
    deletePlan.deleteOrder.map((entry) => [entry.table, entry.ids.length]),
  );
}

function hasBlockingManualReview(deletePlan: DeletePlan) {
  const plannedIdsByTable = new Map(
    deletePlan.deleteOrder.map((entry) => [entry.table, new Set(entry.ids)]),
  );
  const plannedCatalogCaseIds =
    plannedIdsByTable.get("spelling_catalog_review_cases") ?? new Set<string>();
  const plannedCatalogDecisionIds =
    plannedIdsByTable.get("spelling_catalog_review_case_decisions") ??
    new Set<string>();
  const canonicalReferencedCaseStillPlanned =
    deletePlan.protectedCatalogReviewCaseIds.some((id) => plannedCatalogCaseIds.has(id));
  const canonicalReferencedDecisionStillPlanned =
    deletePlan.protectedCatalogReviewCaseDecisionIds.some((id) =>
      plannedCatalogDecisionIds.has(id),
    );

  return (
    canonicalReferencedCaseStillPlanned ||
    canonicalReferencedDecisionStillPlanned ||
    deletePlan.cascadeRisk.protectedCaseIdsAtRisk.length > 0 ||
    deletePlan.cascadeRisk.protectedDecisionIdsAtRisk.length > 0 ||
    deletePlan.manualReview.learning_item_issue_links.length > 0 ||
    deletePlan.manualReview.learning_item_evidence.length > 0 ||
    deletePlan.manualReview.learning_items.length > 0 ||
    deletePlan.manualReview.assignment_items.length > 0 ||
    deletePlan.manualReview.spelling_canonical_mapping_recommendations.length > 0
  );
}

function writeManifest(input: {
  mode: Mode;
  targetUrl: string;
  reportPath: string;
  cleanupPlan: CleanupPlan;
  deletePlan: DeletePlan;
  beforeCounts: Record<string, number>;
}) {
  mkdirSync("tmp", { recursive: true });
  const manifestPath = join(
    "tmp",
    `pre-june-structured-warning-cleanup-manifest-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  );
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    targetUrl: input.targetUrl,
    sourceReportPath: input.reportPath,
    deletionCutoff: CUTOFF_ISO,
    warningFindingsIncluded: input.cleanupPlan.warningFindingsIncluded,
    warningFindingsTotal: input.cleanupPlan.warningFindingsTotal,
    excludedWarnings: input.cleanupPlan.excludedWarnings,
    excludedSubmissionIds: input.cleanupPlan.excludedSubmissionIds,
    excludedOnOrAfterCutoffSubmissionIds:
      input.cleanupPlan.excludedOnOrAfterCutoffSubmissionIds,
    canonicalLineageExcludedSubmissions:
      input.cleanupPlan.canonicalLineageExcludedSubmissions,
    submissionIds: input.cleanupPlan.selectedSubmissionIds,
    reasonBySubmissionId: input.cleanupPlan.reasonBySubmissionId,
    relatedRowCountsByTable: tableCounts(input.deletePlan.relatedRows),
    plannedDeleteCountsByTable: deleteCounts(input.deletePlan),
    deletionOrder: input.deletePlan.deleteOrder,
    manualReviewCountsByTable: tableCounts(input.deletePlan.manualReview),
    protectedWritingIssueIds: input.deletePlan.protectedWritingIssueIds,
    protectedCatalogReviewCaseIds: input.deletePlan.protectedCatalogReviewCaseIds,
    protectedCatalogReviewCaseDecisionIds:
      input.deletePlan.protectedCatalogReviewCaseDecisionIds,
    cascadeRisk: input.deletePlan.cascadeRisk,
    canonicalLineageReferences: {
      mappingSourceCaseReferences:
        input.deletePlan.relatedRows.canonical_mapping_source_case_references,
      mappingSourceDecisionReferences:
        input.deletePlan.relatedRows.canonical_mapping_source_decision_references,
      eventSourceCaseReferences:
        input.deletePlan.relatedRows.canonical_mapping_event_source_case_references,
      eventSourceDecisionReferences:
        input.deletePlan.relatedRows.canonical_mapping_event_source_decision_references,
    },
    skippedDraftIds: input.deletePlan.skippedDraftIds,
    beforeCounts: input.beforeCounts,
    rowSnapshots: input.deletePlan.relatedRows,
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function deleteIds(input: {
  supabase: SupabaseLike;
  table: string;
  ids: string[];
}) {
  for (const idsChunk of chunk(input.ids)) {
    const { error } = await input.supabase
      .from(input.table)
      .delete()
      .in("id", idsChunk)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

    if (error) {
      throw new Error(`Unable to delete from ${input.table}: ${error.message}`);
    }
  }
}

async function applyDeletes(input: {
  supabase: SupabaseLike;
  deletePlan: DeletePlan;
}) {
  if (hasBlockingManualReview(input.deletePlan)) {
    throw new Error(
      "Refusing apply because learning/canonical dependencies require manual review or remain in the delete plan.",
    );
  }

  for (const entry of input.deletePlan.deleteOrder) {
    if (entry.ids.length === 0) {
      continue;
    }
    await deleteIds({
      supabase: input.supabase,
      table: entry.table,
      ids: entry.ids,
    });
  }
}

async function verifyApply(input: {
  supabase: SupabaseLike;
  cleanupPlan: CleanupPlan;
  deletePlan: DeletePlan;
  beforeCounts: Record<string, number>;
}) {
  const protectedCaseSnapshots =
    input.deletePlan.manualReview.protected_spelling_catalog_review_cases;
  const protectedDecisionSnapshots =
    input.deletePlan.manualReview.protected_spelling_catalog_review_case_decisions;

  const remainingSubmissions = await fetchByIds(
    input.supabase,
    "task_submissions",
    input.cleanupPlan.selectedSubmissionIds,
    "id",
  );
  if (remainingSubmissions.length > 0) {
    throw new Error(
      `Apply verification failed: ${remainingSubmissions.length} selected submissions still exist.`,
    );
  }

  if (protectedCaseSnapshots.length > 0) {
    const protectedCases = await fetchByIds(
      input.supabase,
      "spelling_catalog_review_cases",
      ids(protectedCaseSnapshots),
      "id, task_submission_id, source_misspelling_instance_id, writing_sample_id, source_suggestion_id",
    );
    const protectedCasesById = rowsById(protectedCases);
    const missingProtectedCaseIds = ids(protectedCaseSnapshots).filter(
      (id) => !protectedCasesById.has(id),
    );
    if (missingProtectedCaseIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${missingProtectedCaseIds.length} protected catalog review cases no longer exist.`,
      );
    }
    const changedProtectedCaseIds = protectedCaseSnapshots
      .filter((snapshot) => {
        const current = protectedCasesById.get(snapshot.id);
        return (
          current.task_submission_id !== snapshot.task_submission_id ||
          current.source_misspelling_instance_id !==
            snapshot.source_misspelling_instance_id ||
          current.writing_sample_id !== snapshot.writing_sample_id ||
          current.source_suggestion_id !== snapshot.source_suggestion_id
        );
      })
      .map((snapshot) => snapshot.id);
    if (changedProtectedCaseIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${changedProtectedCaseIds.length} protected catalog review cases lost source linkage.`,
      );
    }
  }

  if (protectedDecisionSnapshots.length > 0) {
    const protectedDecisions = await fetchByIds(
      input.supabase,
      "spelling_catalog_review_case_decisions",
      ids(protectedDecisionSnapshots),
      "id, case_id, canonical_mapping_id, merge_target_case_id, superseded_by_case_id",
    );
    const protectedDecisionsById = rowsById(protectedDecisions);
    const missingProtectedDecisionIds = ids(protectedDecisionSnapshots).filter(
      (id) => !protectedDecisionsById.has(id),
    );
    if (missingProtectedDecisionIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${missingProtectedDecisionIds.length} protected catalog review decisions no longer exist.`,
      );
    }
    const changedProtectedDecisionIds = protectedDecisionSnapshots
      .filter((snapshot) => {
        const current = protectedDecisionsById.get(snapshot.id);
        return (
          current.case_id !== snapshot.case_id ||
          current.canonical_mapping_id !== snapshot.canonical_mapping_id ||
          current.merge_target_case_id !== snapshot.merge_target_case_id ||
          current.superseded_by_case_id !== snapshot.superseded_by_case_id
        );
      })
      .map((snapshot) => snapshot.id);
    if (changedProtectedDecisionIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${changedProtectedDecisionIds.length} protected catalog review decisions lost source linkage.`,
      );
    }
  }

  const canonicalLineageChecks = [
    {
      table: "spelling_canonical_mappings",
      snapshots: input.deletePlan.relatedRows.canonical_mapping_source_case_references,
      select: "id, source_case_id",
      field: "source_case_id",
    },
    {
      table: "spelling_canonical_mappings",
      snapshots:
        input.deletePlan.relatedRows.canonical_mapping_source_decision_references,
      select: "id, source_decision_id",
      field: "source_decision_id",
    },
    {
      table: "spelling_canonical_mapping_events",
      snapshots:
        input.deletePlan.relatedRows.canonical_mapping_event_source_case_references,
      select: "id, source_case_id",
      field: "source_case_id",
    },
    {
      table: "spelling_canonical_mapping_events",
      snapshots:
        input.deletePlan.relatedRows.canonical_mapping_event_source_decision_references,
      select: "id, source_decision_id",
      field: "source_decision_id",
    },
  ];
  for (const check of canonicalLineageChecks) {
    if (check.snapshots.length === 0) {
      continue;
    }
    const currentRows = await fetchByIds(
      input.supabase,
      check.table,
      ids(check.snapshots),
      check.select,
    );
    const currentRowsById = rowsById(currentRows);
    const changedLineageIds = check.snapshots
      .filter((snapshot) => currentRowsById.get(snapshot.id)?.[check.field] !== snapshot[check.field])
      .map((snapshot) => snapshot.id);
    if (changedLineageIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${changedLineageIds.length} ${check.table}.${check.field} lineage references changed.`,
      );
    }
  }

  const excludedCurrentSubmissionIds =
    input.cleanupPlan.excludedOnOrAfterCutoffSubmissionIds;
  if (excludedCurrentSubmissionIds.length > 0) {
    const excludedCurrentSubmissions = (await fetchByIds(
      input.supabase,
      "task_submissions",
      excludedCurrentSubmissionIds,
      "id, submitted_at",
    )) as Array<{ id: string; submitted_at: string }>;
    const remainingExcludedIds = new Set(
      excludedCurrentSubmissions.map((submission) => submission.id),
    );
    const missingExcludedIds = excludedCurrentSubmissionIds.filter(
      (id) => !remainingExcludedIds.has(id),
    );
    if (missingExcludedIds.length > 0) {
      throw new Error(
        `Apply verification failed: ${missingExcludedIds.length} excluded on/after-cutoff warning submissions no longer exist.`,
      );
    }
    const cutoffViolations = excludedCurrentSubmissions.filter(
      (submission) => submission.submitted_at < CUTOFF_ISO,
    );
    if (cutoffViolations.length > 0) {
      throw new Error(
        `Apply verification failed: ${cutoffViolations.length} excluded warning submissions are before cutoff.`,
      );
    }
  }

  for (const entry of input.deletePlan.deleteOrder) {
    if (entry.table === "task_submissions" || entry.ids.length === 0) {
      continue;
    }
    const remaining = await fetchByIds(input.supabase, entry.table, entry.ids, "id");
    if (remaining.length > 0) {
      throw new Error(
        `Apply verification failed: ${remaining.length} ${entry.table} rows still exist.`,
      );
    }
  }

  const afterCounts = await guardedCounts(input.supabase);
  const unchangedGlobalTables = [
    "micro_skill_catalog",
    "spelling_canonical_mappings",
    "spelling_canonical_mapping_events",
  ];
  const changedGlobalTables = unchangedGlobalTables.filter(
    (table) => input.beforeCounts[table] !== afterCounts[table],
  );
  if (changedGlobalTables.length > 0) {
    throw new Error(
      `Apply verification failed: global/canonical table counts changed: ${changedGlobalTables.join(", ")}`,
    );
  }

  return afterCounts;
}

async function guardedCounts(supabase: SupabaseLike) {
  const tables = [
    "task_submissions",
    "task_submission_payloads",
    "task_submission_drafts",
    "writing_samples",
    "misspelling_instances",
    "writing_issue_suggestions",
    "writing_issues",
    "writing_issue_correction_attempts",
    "parent_verifications",
    "parent_verified_spelling_candidate_mappings",
    "spelling_catalog_review_cases",
    "spelling_catalog_review_case_decisions",
    "spelling_canonical_mapping_recommendations",
    "learning_item_issue_links",
    "learning_item_evidence",
    "learning_items",
    "assignment_items",
    "task_completions",
    "micro_skill_catalog",
    "spelling_canonical_mappings",
    "spelling_canonical_mapping_events",
  ];

  const entries = await Promise.all(
    tables.map(async (table) => [table, await countRows(supabase, table)] as const),
  );

  return Object.fromEntries(entries) as Record<string, number>;
}

function printSummary(input: {
  mode: Mode;
  config: ReturnType<typeof getConfig>;
  cleanupPlan: CleanupPlan;
  deletePlan: DeletePlan;
  manifestPath: string;
}) {
  console.log("Writing Engine pre-June structured warning cleanup");
  console.log(`Target URL: ${input.config.url}`);
  console.log(`Target kind: ${input.config.local ? "local" : "hosted"}`);
  console.log(`Key role: ${input.config.keyRole}`);
  console.log(`Mode: ${input.mode}`);
  console.log(`Source report: ${input.config.reportPath}`);
  console.log(`Cutoff: ${CUTOFF_ISO}`);
  console.log(
    `Warning findings included: ${input.cleanupPlan.warningFindingsIncluded}/${input.cleanupPlan.warningFindingsTotal}`,
  );
  console.log(`Unique submissions targeted: ${input.cleanupPlan.selectedSubmissionIds.length}`);
  console.log(`Excluded warnings: ${input.cleanupPlan.excludedWarnings.length}`);
  console.log("\nPlanned delete counts by table:");
  Object.entries(deleteCounts(input.deletePlan)).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
  console.log("\nManual review/protected counts by table:");
  Object.entries(tableCounts(input.deletePlan.manualReview)).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
  console.log("\nDeletion order:");
  input.deletePlan.deleteOrder.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.table} (${entry.ids.length})`);
  });
  console.log(`\nManifest path: ${input.manifestPath}`);
  if (input.mode === "dry-run") {
    console.log("Dry-run only: no deletes performed.");
  }
}

async function main() {
  const config = getConfig();
  console.log("Preparing cleanup target...");
  console.log(`Target URL: ${config.url}`);
  console.log(`Mode: ${config.mode}`);
  console.log("Supabase key: [redacted]");

  const supabase = createSupabase(config.url, config.key);
  const beforeCounts = await guardedCounts(supabase);
  let cleanupPlan = await deriveCleanupPlan({
    supabase,
    reportPath: config.reportPath,
  });
  if (cleanupPlan.selectedSubmissionIds.length === 0) {
    throw new Error("No exact pre-June warning submissions were derived from the audit report.");
  }

  const lineageScanRows = await collectRelatedRows({
    supabase,
    selectedSubmissionIds: cleanupPlan.selectedSubmissionIds,
  });
  cleanupPlan = applyCanonicalLineageExclusions(
    cleanupPlan,
    deriveCanonicalLineageExclusions({
      relatedRows: lineageScanRows,
      selectedSubmissionIds: cleanupPlan.selectedSubmissionIds,
    }),
  );
  if (cleanupPlan.selectedSubmissionIds.length === 0) {
    throw new Error(
      "No safe pre-June warning submissions remain after canonical-lineage exclusions.",
    );
  }

  const relatedRows = await collectRelatedRows({
    supabase,
    selectedSubmissionIds: cleanupPlan.selectedSubmissionIds,
  });
  const deletePlan = buildDeletePlan(relatedRows);
  const manifestPath = writeManifest({
    mode: config.mode,
    targetUrl: config.url,
    reportPath: config.reportPath,
    cleanupPlan,
    deletePlan,
    beforeCounts,
  });

  printSummary({
    mode: config.mode,
    config,
    cleanupPlan,
    deletePlan,
    manifestPath,
  });

  if (config.mode === "apply") {
    await applyDeletes({
      supabase,
      deletePlan,
    });
    const afterCounts = await verifyApply({
      supabase,
      cleanupPlan,
      deletePlan,
      beforeCounts,
    });
    console.log("\nApply completed and verified.");
    console.log(
      JSON.stringify(
        {
          beforeCounts,
          afterCounts,
        },
        null,
        2,
      ),
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
