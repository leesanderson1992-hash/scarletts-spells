import type {
  WritingIssueCorrectionAttemptRow,
  WritingIssueFinalClassification,
  WritingIssueReflection,
  WritingIssueStatus,
  WritingIssueSuggestionSource,
  WritingIssueSuggestionStatus,
} from "../../writing-practice/types";

type SupabaseQueryBuilder = PromiseLike<{ data: unknown }> & {
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  maybeSingle(): PromiseLike<{ data: unknown }>;
};

type SupabaseServerClient = {
  from(table: string): {
    select(columns: string): SupabaseQueryBuilder;
  };
};

type TaskSubmissionThreadRow = {
  id: string;
  task_id: string | null;
};

export type UnifiedSpellingReviewSource =
  | "engine_suggested"
  | "parent_added_missed_word"
  | "returned_correction";

export type UnifiedSpellingReviewState =
  | "pending_parent_review"
  | "child_responded"
  | "resolved"
  | "not_an_issue"
  | "sent_to_admin"
  | "locally_promoted"
  | "categorisation_needed";

export type UnifiedSpellingReviewCategorisationStatus =
  | "categorised"
  | "categorisation_needed"
  | "sent_to_admin"
  | "parent_local_pending"
  | "parent_local_promoted"
  | "unsupported_returned_correction_route"
  | "not_applicable";

export type UnifiedSpellingReviewItem = {
  id: string;
  source: UnifiedSpellingReviewSource;
  state: UnifiedSpellingReviewState;
  categorisationStatus: UnifiedSpellingReviewCategorisationStatus;
  observedText: string;
  expectedCorrection: string | null;
  latestChildAttempt: string | null;
  childReflection: WritingIssueReflection | null;
  correctionOutcome: WritingIssueFinalClassification | null;
  suggestedMicroSkillKey: string | null;
  verifiedMicroSkillKey: string | null;
  microSkillKey: string | null;
  parentNote: string | null;
  sourceIds: {
    currentTaskSubmissionId: string;
    writingSampleId: string | null;
    misspellingInstanceId: string | null;
    writingIssueSuggestionId: string | null;
    parentVerificationId: string | null;
    writingIssueId: string | null;
    originalWritingIssueId: string | null;
    correctionAttemptId: string | null;
    catalogReviewCaseId: string | null;
    candidateMappingId: string | null;
    canonicalRecommendationId: string | null;
    canonicalRecommendationStatus: "recommended" | "pending_admin_review" | null;
  };
  provenance: {
    parentAuthored: boolean;
    sourceKind: string | null;
    previousTaskSubmissionId: string | null;
    metadata: Record<string, unknown>;
  };
};

export type UnifiedSpellingReviewCompletionSummary = {
  totalItemCount: number;
  unresolvedItemCount: number;
  unresolvedReturnedCorrectionCount: number;
  unresolvedCategorisationCount: number;
  deferredUnsupportedRouteCount: number;
  blockingReasons: string[];
  canComplete: boolean;
};

export type UnifiedSpellingReviewMisspellingRow = {
  id: string;
  writing_sample_id?: string | null;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  is_false_positive?: boolean | null;
  notes: string | null;
  position_start?: number | null;
  position_end?: number | null;
  context_text?: string | null;
};

export type UnifiedSpellingReviewSuggestionRow = {
  id: string;
  task_submission_id: string | null;
  writing_sample_id?: string | null;
  misspelling_instance_id: string | null;
  suggestion_status: WritingIssueSuggestionStatus;
  source_type: WritingIssueSuggestionSource;
  observed_text: string | null;
  suggested_replacement: string | null;
  suggested_micro_skill_key: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

export type UnifiedSpellingReviewParentVerificationRow = {
  id: string;
  source_entity_id: string;
  decision:
    | "accepted"
    | "overridden"
    | "false_positive"
    | "not_a_learning_issue";
  suggested_micro_skill_key: string | null;
  verified_micro_skill_key: string | null;
  verification_notes: string | null;
  metadata: Record<string, unknown> | null;
};

export type UnifiedSpellingReviewWritingIssueRow = {
  id: string;
  task_submission_id: string | null;
  source_misspelling_instance_id: string | null;
  source_suggestion_id: string | null;
  issue_status: WritingIssueStatus;
  final_classification: WritingIssueFinalClassification | null;
  observed_text: string | null;
  suggested_replacement?: string | null;
  approved_replacement: string | null;
  micro_skill_key: string;
  parent_review_note: string | null;
  notes?: string | null;
  metadata: Record<string, unknown> | null;
  child_responded_at?: string | null;
  final_classified_at?: string | null;
};

export type UnifiedSpellingReviewCorrectionAttemptRow = Pick<
  WritingIssueCorrectionAttemptRow,
  | "id"
  | "writing_issue_id"
  | "task_submission_id"
  | "attempted_correction"
  | "attempt_notes"
  | "reflection"
  | "metadata"
  | "created_at"
>;

export type UnifiedSpellingReviewCandidateMappingRow = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status: "pending_parent_promotion" | "parent_local_promoted";
  promotion_scope: "parent_local";
};

export type UnifiedSpellingReviewCatalogReviewCaseRow = {
  id: string;
  source_misspelling_instance_id: string;
  case_status: "open";
};

export type UnifiedSpellingReviewCanonicalRecommendationRow = {
  id: string;
  candidate_mapping_id: string | null;
  recommendation_status: "recommended" | "pending_admin_review";
};

export type BuildUnifiedSpellingReviewItemsInput = {
  submissionId: string;
  writingSampleId: string | null;
  misspellings: UnifiedSpellingReviewMisspellingRow[];
  writingIssueSuggestions: UnifiedSpellingReviewSuggestionRow[];
  parentVerifications: UnifiedSpellingReviewParentVerificationRow[];
  historicalParentVerifications?: UnifiedSpellingReviewParentVerificationRow[];
  writingIssues: UnifiedSpellingReviewWritingIssueRow[];
  correctionAttempts: UnifiedSpellingReviewCorrectionAttemptRow[];
  returnedWritingIssues: UnifiedSpellingReviewWritingIssueRow[];
  candidateMappings: UnifiedSpellingReviewCandidateMappingRow[];
  catalogReviewCases: UnifiedSpellingReviewCatalogReviewCaseRow[];
  canonicalRecommendations?: UnifiedSpellingReviewCanonicalRecommendationRow[];
};

function hasMeaningfulMicroSkillKey(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

function returnedFinalClassificationNeedsRoute(value: string | null | undefined) {
  return (
    value === "fragile_knowledge" ||
    value === "concept_gap" ||
    value === "transfer_failure"
  );
}

function pluralise(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function verbForCount(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function summarizeUnifiedSpellingReviewCompletion(
  rows: UnifiedSpellingReviewItem[],
): UnifiedSpellingReviewCompletionSummary {
  let parentDecisionCount = 0;
  let returnedFinalClassificationCount = 0;
  let unresolvedCategorisationCount = 0;
  let deferredUnsupportedRouteCount = 0;
  const unresolvedItemIds = new Set<string>();
  const unresolvedReturnedCorrectionIds = new Set<string>();

  rows.forEach((row) => {
    const categorisationBlocks =
      row.categorisationStatus === "categorisation_needed" ||
      row.categorisationStatus === "parent_local_pending";
    const deferredRouteBlocks =
      row.categorisationStatus === "unsupported_returned_correction_route";

    if (row.state === "pending_parent_review") {
      parentDecisionCount += 1;
      unresolvedItemIds.add(row.id);
    }

    if (row.source === "returned_correction" && row.state === "child_responded") {
      returnedFinalClassificationCount += 1;
      unresolvedItemIds.add(row.id);
      unresolvedReturnedCorrectionIds.add(row.id);
    }

    if (categorisationBlocks) {
      unresolvedCategorisationCount += 1;
      unresolvedItemIds.add(row.id);
    }

    if (deferredRouteBlocks) {
      deferredUnsupportedRouteCount += 1;
      unresolvedItemIds.add(row.id);

      if (row.source === "returned_correction") {
        unresolvedReturnedCorrectionIds.add(row.id);
      }
    }
  });

  const unresolvedReturnedCorrectionCount = unresolvedReturnedCorrectionIds.size;
  const unresolvedItemCount = unresolvedItemIds.size;
  const blockingReasons: string[] = [];

  if (parentDecisionCount > 0) {
    blockingReasons.push(
      `${pluralise(parentDecisionCount, "spelling item")} still ${verbForCount(
        parentDecisionCount,
        "needs",
        "need",
      )} a parent decision.`,
    );
  }

  if (returnedFinalClassificationCount > 0) {
    blockingReasons.push(
      `${pluralise(
        returnedFinalClassificationCount,
        "returned correction",
      )} still ${verbForCount(
        returnedFinalClassificationCount,
        "needs",
        "need",
      )} final classification.`,
    );
  }

  if (unresolvedCategorisationCount > 0) {
    blockingReasons.push(
      `${pluralise(unresolvedCategorisationCount, "item")} still ${verbForCount(
        unresolvedCategorisationCount,
        "needs",
        "need",
      )} categorisation or admin handoff.`,
    );
  }

  if (deferredUnsupportedRouteCount > 0) {
    blockingReasons.push(
      `${pluralise(
        deferredUnsupportedRouteCount,
        "returned correction route",
      )} ${verbForCount(
        deferredUnsupportedRouteCount,
        "is",
        "are",
      )} blocked because no safe categorisation route is available.`,
    );
  }

  return {
    totalItemCount: rows.length,
    unresolvedItemCount,
    unresolvedReturnedCorrectionCount,
    unresolvedCategorisationCount,
    deferredUnsupportedRouteCount,
    blockingReasons,
    canComplete: unresolvedItemCount === 0,
  };
}

function parseMetadata(value: Record<string, unknown> | null | undefined) {
  return value ?? {};
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isLikelyFullAnswerText(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return false;
  }

  return (
    trimmed.length > 80 ||
    trimmed.includes("\n") ||
    trimmed.split(/\s+/).filter(Boolean).length > 6
  );
}

function getRetryDisplayText(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || isLikelyFullAnswerText(trimmed)) {
    return null;
  }

  return trimmed;
}

function normaliseReviewText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function buildReviewPairKey(input: {
  observedText: string | null | undefined;
  expectedCorrection: string | null | undefined;
}) {
  const observedText = normaliseReviewText(input.observedText);
  const expectedCorrection = normaliseReviewText(input.expectedCorrection);

  if (!observedText || !expectedCorrection) {
    return null;
  }

  return `${observedText}::${expectedCorrection}`;
}

function hasReturnedOwnershipSource(issue: UnifiedSpellingReviewWritingIssueRow) {
  return (
    (typeof issue.source_misspelling_instance_id === "string" &&
      issue.source_misspelling_instance_id.length > 0) ||
    (typeof issue.source_suggestion_id === "string" &&
      issue.source_suggestion_id.length > 0)
  );
}

function isTerminalReturnedOwnershipIssue(issue: UnifiedSpellingReviewWritingIssueRow) {
  return (
    hasReturnedOwnershipSource(issue) &&
    (issue.final_classification !== null || issue.issue_status === "finalised")
  );
}

function isTerminalParentVerification(
  verification: UnifiedSpellingReviewParentVerificationRow,
) {
  return (
    verification.decision === "accepted" ||
    verification.decision === "overridden" ||
    verification.decision === "false_positive" ||
    verification.decision === "not_a_learning_issue"
  );
}

function parseVerificationSourceEntityId(sourceEntityId: string) {
  const [sourceType, taskSubmissionId, writingSampleId, span, observedText, expectedCorrection] =
    sourceEntityId.split("::");

  if (
    sourceType !== "authentic_writing" ||
    !taskSubmissionId ||
    !writingSampleId ||
    !span ||
    !observedText ||
    !expectedCorrection ||
    expectedCorrection === "no_target"
  ) {
    return null;
  }

  const spanMatch = /^(\d+)-(\d+)$/.exec(span);
  const positionStart = spanMatch ? Number(spanMatch[1]) : null;
  const positionEnd = spanMatch ? Number(spanMatch[2]) : null;

  return {
    taskSubmissionId,
    writingSampleId: writingSampleId === "no_sample" ? null : writingSampleId,
    positionStart,
    positionEnd,
    observedText,
    expectedCorrection,
  };
}

function isParentAuthoredMisspellingRow(input: { notes?: string | null }) {
  if (!input.notes) {
    return false;
  }

  try {
    const parsed = JSON.parse(input.notes) as {
      parentAuthoredMissedWord?: boolean;
    };

    return parsed.parentAuthoredMissedWord === true;
  } catch {
    return false;
  }
}

function buildVerificationSourceEntityIds(input: {
  taskSubmissionId: string;
  writingSampleId: string | null;
  misspelling: UnifiedSpellingReviewMisspellingRow;
  expectedCorrection: string | null;
}) {
  const positionStart = input.misspelling.position_start;
  const positionEnd = input.misspelling.position_end;

  if (
    typeof positionStart !== "number" ||
    typeof positionEnd !== "number" ||
    positionEnd <= positionStart
  ) {
    return [];
  }

  return [
    [
      "authentic_writing",
      input.taskSubmissionId,
      input.writingSampleId ?? "no_sample",
      `${positionStart}-${positionEnd}`,
      input.misspelling.misspelled_word.toLowerCase(),
      (input.expectedCorrection ?? "no_target").toLowerCase(),
    ].join("::"),
  ];
}

function getLatestAttemptByWritingIssueId(
  attempts: UnifiedSpellingReviewCorrectionAttemptRow[],
) {
  const sortedAttempts = [...attempts].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  const latestByIssueId = new Map<string, UnifiedSpellingReviewCorrectionAttemptRow>();

  sortedAttempts.forEach((attempt) => {
    if (!latestByIssueId.has(attempt.writing_issue_id)) {
      latestByIssueId.set(attempt.writing_issue_id, attempt);
    }
  });

  return latestByIssueId;
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const merged = new Map<string, T>();

  [...primary, ...secondary].forEach((row) => {
    merged.set(row.id, row);
  });

  return [...merged.values()];
}

function getStateForCurrentReview(input: {
  verification: UnifiedSpellingReviewParentVerificationRow | null;
  catalogReviewCase: UnifiedSpellingReviewCatalogReviewCaseRow | null;
  candidateMapping: UnifiedSpellingReviewCandidateMappingRow | null;
  suggestedMicroSkillKey: string | null;
}) {
  if (
    input.verification?.decision === "false_positive" ||
    input.verification?.decision === "not_a_learning_issue"
  ) {
    return "not_an_issue" satisfies UnifiedSpellingReviewState;
  }

  if (input.catalogReviewCase) {
    return "sent_to_admin" satisfies UnifiedSpellingReviewState;
  }

  if (input.candidateMapping?.candidate_status === "parent_local_promoted") {
    return "locally_promoted" satisfies UnifiedSpellingReviewState;
  }

  if (input.verification) {
    return "resolved" satisfies UnifiedSpellingReviewState;
  }

  if (!hasMeaningfulMicroSkillKey(input.suggestedMicroSkillKey)) {
    return "categorisation_needed" satisfies UnifiedSpellingReviewState;
  }

  return "pending_parent_review" satisfies UnifiedSpellingReviewState;
}

function getCategorisationStatusForCurrentReview(input: {
  verification: UnifiedSpellingReviewParentVerificationRow | null;
  catalogReviewCase: UnifiedSpellingReviewCatalogReviewCaseRow | null;
  candidateMapping: UnifiedSpellingReviewCandidateMappingRow | null;
  suggestedMicroSkillKey: string | null;
}) {
  if (
    input.verification?.decision === "false_positive" ||
    input.verification?.decision === "not_a_learning_issue"
  ) {
    return "not_applicable" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  if (input.catalogReviewCase) {
    return "sent_to_admin" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  if (input.candidateMapping?.candidate_status === "parent_local_promoted") {
    return "parent_local_promoted" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  if (input.candidateMapping?.candidate_status === "pending_parent_promotion") {
    return "parent_local_pending" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  if (
    input.verification?.decision === "accepted" ||
    input.verification?.decision === "overridden"
  ) {
    return "categorised" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  if (hasMeaningfulMicroSkillKey(input.suggestedMicroSkillKey)) {
    return "categorised" satisfies UnifiedSpellingReviewCategorisationStatus;
  }

  return "categorisation_needed" satisfies UnifiedSpellingReviewCategorisationStatus;
}

function getStateForReturnedIssue(
  issue: UnifiedSpellingReviewWritingIssueRow,
): UnifiedSpellingReviewState {
  if (issue.final_classification === "not_an_issue") {
    return "not_an_issue";
  }

  if (issue.final_classification || issue.issue_status === "finalised") {
    return "resolved";
  }

  return "child_responded";
}

function getCategorisationStatusForReturnedIssue(input: {
  issue: UnifiedSpellingReviewWritingIssueRow;
  catalogReviewCase: UnifiedSpellingReviewCatalogReviewCaseRow | null;
  candidateMapping: UnifiedSpellingReviewCandidateMappingRow | null;
}): UnifiedSpellingReviewCategorisationStatus {
  const { issue } = input;

  if (issue.final_classification === "not_an_issue") {
    return "not_applicable";
  }

  if (input.catalogReviewCase) {
    return "sent_to_admin";
  }

  if (input.candidateMapping?.candidate_status === "parent_local_promoted") {
    return "parent_local_promoted";
  }

  if (input.candidateMapping?.candidate_status === "pending_parent_promotion") {
    return "parent_local_pending";
  }

  if (!issue.final_classification) {
    return "not_applicable";
  }

  if (!returnedFinalClassificationNeedsRoute(issue.final_classification)) {
    return "not_applicable";
  }

  if (hasMeaningfulMicroSkillKey(issue.micro_skill_key)) {
    return "categorised";
  }

  if (
    typeof issue.source_misspelling_instance_id === "string" &&
    issue.source_misspelling_instance_id.length > 0
  ) {
    return "categorisation_needed";
  }

  return "unsupported_returned_correction_route";
}

export function buildUnifiedSpellingReviewItems(
  input: BuildUnifiedSpellingReviewItemsInput,
): UnifiedSpellingReviewItem[] {
  const returnedOwnedSourceMisspellingIds = new Set(
    input.returnedWritingIssues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const returnedOwnedSourceSuggestionIds = new Set(
    input.returnedWritingIssues
      .map((issue) => issue.source_suggestion_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const returnedWritingIssueIds = new Set(input.returnedWritingIssues.map((issue) => issue.id));
  const suppressedRegeneratedCandidateIdsByReturnedIssueId = new Map<string, string[]>();
  const consumedReturnedOwnershipIssueIds = new Set<string>();
  const returnedOwnershipIssuesByPairKey = new Map<
    string,
    UnifiedSpellingReviewWritingIssueRow[]
  >();
  const consumedHistoricalVerificationIds = new Set<string>();
  const historicalTerminalVerificationsByPairKey = new Map<
    string,
    UnifiedSpellingReviewParentVerificationRow[]
  >();

  input.returnedWritingIssues.forEach((issue) => {
    const pairKey = buildReviewPairKey({
      observedText: issue.observed_text,
      expectedCorrection: issue.approved_replacement ?? issue.suggested_replacement ?? null,
    });

    if (!pairKey) {
      return;
    }

    returnedOwnershipIssuesByPairKey.set(pairKey, [
      ...(returnedOwnershipIssuesByPairKey.get(pairKey) ?? []),
      issue,
    ]);
  });
  (input.historicalParentVerifications ?? [])
    .filter(isTerminalParentVerification)
    .forEach((verification) => {
      const sourceEntity = parseVerificationSourceEntityId(verification.source_entity_id);

      if (!sourceEntity) {
        return;
      }

      const pairKey = buildReviewPairKey({
        observedText: sourceEntity.observedText,
        expectedCorrection: sourceEntity.expectedCorrection,
      });

      if (!pairKey) {
        return;
      }

      historicalTerminalVerificationsByPairKey.set(pairKey, [
        ...(historicalTerminalVerificationsByPairKey.get(pairKey) ?? []),
        verification,
      ]);
    });
  const suggestionsByMisspellingId = new Map(
    input.writingIssueSuggestions
      .filter((suggestion) => typeof suggestion.misspelling_instance_id === "string")
      .map((suggestion) => [suggestion.misspelling_instance_id as string, suggestion]),
  );
  const writingIssueByMisspellingId = new Map(
    input.writingIssues
      .filter((issue) => typeof issue.source_misspelling_instance_id === "string")
      .map((issue) => [issue.source_misspelling_instance_id as string, issue]),
  );
  const candidateMappingByMisspellingId = new Map(
    input.candidateMappings
      .filter((mapping) => typeof mapping.source_misspelling_instance_id === "string")
      .map((mapping) => [mapping.source_misspelling_instance_id as string, mapping]),
  );
  const catalogReviewCaseByMisspellingId = new Map(
    input.catalogReviewCases.map((reviewCase) => [
      reviewCase.source_misspelling_instance_id,
      reviewCase,
    ]),
  );
  const canonicalRecommendationByCandidateMappingId = new Map(
    (input.canonicalRecommendations ?? [])
      .filter(
        (recommendation) =>
          typeof recommendation.candidate_mapping_id === "string" &&
          recommendation.candidate_mapping_id.length > 0,
      )
      .map((recommendation) => [
        recommendation.candidate_mapping_id as string,
        recommendation,
      ]),
  );
  const latestAttemptByWritingIssueId = getLatestAttemptByWritingIssueId(
    input.correctionAttempts,
  );
  const verificationBySourceEntityId = new Map(
    input.parentVerifications.map((verification) => [
      verification.source_entity_id,
      verification,
    ]),
  );

  const currentReviewItems = input.misspellings.flatMap((misspelling) => {
    const suggestion = suggestionsByMisspellingId.get(misspelling.id) ?? null;
    const writingIssue = writingIssueByMisspellingId.get(misspelling.id) ?? null;
    const candidateMapping = candidateMappingByMisspellingId.get(misspelling.id) ?? null;
    const catalogReviewCase = catalogReviewCaseByMisspellingId.get(misspelling.id) ?? null;
    const canonicalRecommendation =
      candidateMapping?.id
        ? canonicalRecommendationByCandidateMappingId.get(candidateMapping.id) ?? null
        : null;
    const expectedCorrection =
      suggestion?.suggested_replacement ??
      misspelling.suggested_word ??
      misspelling.corrected_word;
    const verification =
      buildVerificationSourceEntityIds({
        taskSubmissionId: input.submissionId,
        writingSampleId: input.writingSampleId,
        misspelling,
        expectedCorrection,
      })
        .map((sourceEntityId) => verificationBySourceEntityId.get(sourceEntityId))
        .find((row): row is UnifiedSpellingReviewParentVerificationRow => Boolean(row)) ??
      null;
    const parentAuthored = isParentAuthoredMisspellingRow(misspelling);

    const directlyReturnedOwnedWritingIssue =
      returnedWritingIssueIds.has(writingIssue?.id ?? "")
        ? writingIssue
        : input.returnedWritingIssues.find(
            (issue) =>
              (typeof issue.source_misspelling_instance_id === "string" &&
                issue.source_misspelling_instance_id === misspelling.id) ||
              (typeof issue.source_suggestion_id === "string" &&
                issue.source_suggestion_id === suggestion?.id),
          ) ?? null;
    const pairKey = buildReviewPairKey({
      observedText: misspelling.misspelled_word,
      expectedCorrection,
    });
    const sameThreadReturnedOwnedWritingIssue =
      pairKey === null
        ? null
        : (returnedOwnershipIssuesByPairKey.get(pairKey) ?? []).find(
            (issue) => !consumedReturnedOwnershipIssueIds.has(issue.id),
          ) ?? null;
    const historicalTerminalVerification =
      pairKey === null || verification !== null
        ? null
        : (historicalTerminalVerificationsByPairKey.get(pairKey) ?? []).find(
            (historicalVerification) =>
              !consumedHistoricalVerificationIds.has(historicalVerification.id),
          ) ?? null;
    const returnedOwnedWritingIssue =
      directlyReturnedOwnedWritingIssue ?? sameThreadReturnedOwnedWritingIssue;
    const returnedOwnedByDirectLineage =
      !parentAuthored &&
      directlyReturnedOwnedWritingIssue !== null &&
      (returnedOwnedSourceMisspellingIds.has(misspelling.id) ||
        (typeof suggestion?.id === "string" &&
          returnedOwnedSourceSuggestionIds.has(suggestion.id)) ||
        returnedWritingIssueIds.has(writingIssue?.id ?? ""));
    const returnedOwnedBySameThreadPair =
      !parentAuthored &&
      directlyReturnedOwnedWritingIssue === null &&
      sameThreadReturnedOwnedWritingIssue !== null;
    const ownedByHistoricalTerminalVerification =
      !parentAuthored &&
      verification === null &&
      returnedOwnedWritingIssue === null &&
      historicalTerminalVerification !== null;

    if (
      (returnedOwnedByDirectLineage || returnedOwnedBySameThreadPair) &&
      returnedOwnedWritingIssue
    ) {
      const existing =
        suppressedRegeneratedCandidateIdsByReturnedIssueId.get(returnedOwnedWritingIssue.id) ??
        [];

      consumedReturnedOwnershipIssueIds.add(returnedOwnedWritingIssue.id);
      suppressedRegeneratedCandidateIdsByReturnedIssueId.set(returnedOwnedWritingIssue.id, [
        ...existing,
        misspelling.id,
      ]);

      return [];
    }

    if (ownedByHistoricalTerminalVerification && historicalTerminalVerification) {
      consumedHistoricalVerificationIds.add(historicalTerminalVerification.id);

      return [];
    }

    const suggestedMicroSkillKey =
      suggestion?.suggested_micro_skill_key ?? verification?.suggested_micro_skill_key ?? null;
    const categorisationStatus = getCategorisationStatusForCurrentReview({
      verification,
      catalogReviewCase,
      candidateMapping,
      suggestedMicroSkillKey,
    });

    const item = {
      id: `misspelling:${misspelling.id}`,
      source: parentAuthored ? "parent_added_missed_word" : "engine_suggested",
      state: getStateForCurrentReview({
        verification,
        catalogReviewCase,
        candidateMapping,
        suggestedMicroSkillKey,
      }),
      categorisationStatus,
      observedText: misspelling.misspelled_word,
      expectedCorrection,
      latestChildAttempt: null,
      childReflection: null,
      correctionOutcome: writingIssue?.final_classification ?? null,
      suggestedMicroSkillKey,
      verifiedMicroSkillKey: verification?.verified_micro_skill_key ?? null,
      microSkillKey:
        writingIssue?.micro_skill_key ??
        verification?.verified_micro_skill_key ??
        verification?.suggested_micro_skill_key ??
        suggestedMicroSkillKey,
      parentNote:
        verification?.verification_notes ??
        writingIssue?.parent_review_note ??
        suggestion?.notes ??
        misspelling.notes,
      sourceIds: {
        currentTaskSubmissionId: input.submissionId,
        writingSampleId: input.writingSampleId,
        misspellingInstanceId: misspelling.id,
        writingIssueSuggestionId: suggestion?.id ?? null,
        parentVerificationId: verification?.id ?? null,
        writingIssueId: writingIssue?.id ?? null,
        originalWritingIssueId: null,
        correctionAttemptId: null,
        catalogReviewCaseId: catalogReviewCase?.id ?? null,
        candidateMappingId: candidateMapping?.id ?? null,
        canonicalRecommendationId: canonicalRecommendation?.id ?? null,
        canonicalRecommendationStatus:
          canonicalRecommendation?.recommendation_status ?? null,
      },
      provenance: {
        parentAuthored,
        sourceKind: parentAuthored ? "parent_authored_missed_word" : "misspelling_instance",
        previousTaskSubmissionId: null,
        metadata: {
          source_misspelling_instance_id: misspelling.id,
          writing_sample_id: misspelling.writing_sample_id ?? input.writingSampleId,
          context_text: misspelling.context_text ?? null,
          position_start: misspelling.position_start ?? null,
          position_end: misspelling.position_end ?? null,
          misspelling_notes: misspelling.notes,
          suggestion_metadata: parseMetadata(suggestion?.metadata),
        },
      },
    } satisfies UnifiedSpellingReviewItem;

    return [item];
  });

  const returnedCorrectionItems = input.returnedWritingIssues.flatMap((issue) => {
    const attempt = latestAttemptByWritingIssueId.get(issue.id) ?? null;
    const candidateMapping =
      typeof issue.source_misspelling_instance_id === "string"
        ? candidateMappingByMisspellingId.get(issue.source_misspelling_instance_id) ?? null
        : null;
    const catalogReviewCase =
      typeof issue.source_misspelling_instance_id === "string"
        ? catalogReviewCaseByMisspellingId.get(issue.source_misspelling_instance_id) ?? null
        : null;
    const canonicalRecommendation =
      candidateMapping?.id
        ? canonicalRecommendationByCandidateMappingId.get(candidateMapping.id) ?? null
        : null;

    if (!attempt && !isTerminalReturnedOwnershipIssue(issue)) {
      return [];
    }

    const issueMetadata = parseMetadata(issue.metadata);
    const sourceKind = getMetadataString(issueMetadata, "source_kind");
    const parentAuthored =
      sourceKind === "parent_authored_missed_word" ||
      issueMetadata.parent_authored_missed_word === true;
    const childAttemptDisplay = getRetryDisplayText(attempt?.attempted_correction);
    const historicalFullAnswerAttempt = childAttemptDisplay
      ? null
      : isLikelyFullAnswerText(attempt?.attempted_correction)
        ? attempt?.attempted_correction
        : null;

    return [
      {
        id: `returned:${issue.id}:${attempt?.id ?? "no-current-attempt"}`,
        source: "returned_correction",
        state: getStateForReturnedIssue(issue),
        categorisationStatus: getCategorisationStatusForReturnedIssue({
          issue,
          catalogReviewCase,
          candidateMapping,
        }),
        observedText: issue.observed_text ?? "Returned spelling issue",
        expectedCorrection:
          issue.approved_replacement ?? issue.suggested_replacement ?? null,
        latestChildAttempt: childAttemptDisplay,
        childReflection: attempt?.reflection ?? null,
        correctionOutcome: issue.final_classification,
        suggestedMicroSkillKey: null,
        verifiedMicroSkillKey: null,
        microSkillKey: candidateMapping?.micro_skill_key ?? issue.micro_skill_key,
        parentNote: issue.parent_review_note ?? issue.notes ?? attempt?.attempt_notes ?? null,
        sourceIds: {
          currentTaskSubmissionId: input.submissionId,
          writingSampleId: input.writingSampleId,
          misspellingInstanceId: issue.source_misspelling_instance_id,
          writingIssueSuggestionId: issue.source_suggestion_id,
          parentVerificationId: null,
          writingIssueId: null,
          originalWritingIssueId: issue.id,
          correctionAttemptId: attempt?.id ?? null,
          catalogReviewCaseId: catalogReviewCase?.id ?? null,
          candidateMappingId: candidateMapping?.id ?? null,
          canonicalRecommendationId: canonicalRecommendation?.id ?? null,
          canonicalRecommendationStatus:
            canonicalRecommendation?.recommendation_status ?? null,
        },
        provenance: {
          parentAuthored,
          sourceKind,
          previousTaskSubmissionId: issue.task_submission_id,
          metadata: {
            issue_metadata: issueMetadata,
            attempt_metadata: parseMetadata(attempt?.metadata),
            has_current_correction_attempt: Boolean(attempt),
            source_misspelling_instance_id: issue.source_misspelling_instance_id,
            source_suggestion_id: issue.source_suggestion_id,
            original_writing_issue_id: issue.id,
            correction_attempt_id: attempt?.id ?? null,
            historical_full_answer_attempt: historicalFullAnswerAttempt,
            suppressed_regenerated_candidate_ids:
              suppressedRegeneratedCandidateIdsByReturnedIssueId.get(issue.id) ?? [],
          },
        },
      } satisfies UnifiedSpellingReviewItem,
    ];
  });

  return [...currentReviewItems, ...returnedCorrectionItems];
}

export async function loadUnifiedSpellingReviewItemsForSubmission(input: {
  supabase: unknown;
  submissionId: string;
  parentUserId: string;
  childId: string;
}): Promise<UnifiedSpellingReviewItem[]> {
  const supabase = input.supabase as SupabaseServerClient;
  const { data: linkedSample } = await supabase
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", input.submissionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();
  const linkedSampleRow = linkedSample as { id?: unknown } | null;
  const writingSampleId =
    typeof linkedSampleRow?.id === "string" ? linkedSampleRow.id : null;

  const [
    { data: currentSubmission },
    { data: misspellingRows },
    { data: suggestionRows },
    { data: verificationRows },
    { data: writingIssueRows },
    { data: candidateMappingRows },
    { data: catalogReviewCaseRows },
    { data: attemptRows },
  ] = await Promise.all([
    supabase
      .from("task_submissions")
      .select("id, task_id")
      .eq("id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .maybeSingle(),
    writingSampleId
      ? supabase
          .from("misspelling_instances")
          .select(
            "id, writing_sample_id, misspelled_word, corrected_word, suggested_word, is_false_positive, notes, position_start, position_end, context_text",
          )
          .eq("writing_sample_id", writingSampleId)
          .eq("parent_user_id", input.parentUserId)
          .order("position_start", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("writing_issue_suggestions")
      .select(
        "id, task_submission_id, writing_sample_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("parent_verifications")
      .select(
        "id, source_entity_id, decision, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("verified_at", { ascending: false }),
    supabase
      .from("writing_issues")
      .select(
        "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, parent_review_note, notes, metadata, child_responded_at, final_classified_at",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .in("candidate_status", ["pending_parent_promotion", "parent_local_promoted"])
      .order("created_at", { ascending: false }),
    supabase
      .from("spelling_catalog_review_cases")
      .select("id, source_misspelling_instance_id, case_status")
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .eq("case_status", "open")
      .order("created_at", { ascending: false }),
    supabase
      .from("writing_issue_correction_attempts")
      .select(
        "id, writing_issue_id, task_submission_id, attempted_correction, attempt_notes, reflection, metadata, created_at",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .order("created_at", { ascending: false }),
  ]);

  const correctionAttempts =
    (attemptRows ?? []) as unknown as UnifiedSpellingReviewCorrectionAttemptRow[];
  const returnedWritingIssueIds = [
    ...new Set(correctionAttempts.map((attempt) => attempt.writing_issue_id)),
  ];
  const currentSubmissionRow = currentSubmission as TaskSubmissionThreadRow | null;
  const { data: threadSubmissionRows } =
    typeof currentSubmissionRow?.task_id === "string" &&
    currentSubmissionRow.task_id.length > 0
      ? await supabase
          .from("task_submissions")
          .select("id, task_id")
          .eq("task_id", currentSubmissionRow.task_id)
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
      : { data: [] };
  const threadSubmissionIds = [
    ...new Set(
      ((threadSubmissionRows ?? []) as TaskSubmissionThreadRow[])
        .map((row) => row.id)
        .filter((id) => typeof id === "string" && id.length > 0),
    ),
  ];
  const { data: returnedWritingIssueRows } =
    returnedWritingIssueIds.length > 0
      ? await supabase
          .from("writing_issues")
          .select(
            "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, parent_review_note, notes, metadata, child_responded_at, final_classified_at",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("id", returnedWritingIssueIds)
      : { data: [] };
  const { data: threadWritingIssueRows } =
    threadSubmissionIds.length > 0
      ? await supabase
          .from("writing_issues")
          .select(
            "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, parent_review_note, notes, metadata, child_responded_at, final_classified_at",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("task_submission_id", threadSubmissionIds)
      : { data: [] };
  const attemptLinkedReturnedWritingIssues =
    (returnedWritingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[];
  const historicalReturnedWritingIssues = (
    (threadWritingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[]
  ).filter(
    (issue) =>
      issue.task_submission_id !== input.submissionId &&
      isTerminalReturnedOwnershipIssue(issue),
  );
  const { data: threadVerificationRows } =
    threadSubmissionIds.length > 0
      ? await supabase
          .from("parent_verifications")
          .select(
            "id, source_entity_id, decision, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata",
          )
          .eq("parent_user_id", input.parentUserId)
          .in("task_submission_id", threadSubmissionIds)
          .order("verified_at", { ascending: false })
      : { data: [] };
  const historicalParentVerifications = (
    (threadVerificationRows ?? []) as UnifiedSpellingReviewParentVerificationRow[]
  ).filter((verification) => {
    const sourceEntity = parseVerificationSourceEntityId(verification.source_entity_id);

    return (
      isTerminalParentVerification(verification) &&
      sourceEntity !== null &&
      sourceEntity.taskSubmissionId !== input.submissionId
    );
  });
  const returnedWritingIssues = mergeById(
    attemptLinkedReturnedWritingIssues,
    historicalReturnedWritingIssues,
  );
  const returnedSourceMisspellingIds = [
    ...new Set(
      returnedWritingIssues
        .map((issue) => issue.source_misspelling_instance_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const [
    { data: returnedCandidateMappingRows },
    { data: returnedCatalogReviewCaseRows },
  ] =
    returnedSourceMisspellingIds.length > 0
      ? await Promise.all([
          supabase
            .from("parent_verified_spelling_candidate_mappings")
            .select(
              "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
            )
            .eq("parent_user_id", input.parentUserId)
            .eq("child_id", input.childId)
            .in("source_misspelling_instance_id", returnedSourceMisspellingIds)
            .in("candidate_status", [
              "pending_parent_promotion",
              "parent_local_promoted",
            ])
            .order("created_at", { ascending: false }),
          supabase
            .from("spelling_catalog_review_cases")
            .select("id, source_misspelling_instance_id, case_status")
            .eq("parent_user_id", input.parentUserId)
            .eq("child_id", input.childId)
            .eq("case_status", "open")
            .in("source_misspelling_instance_id", returnedSourceMisspellingIds)
            .order("created_at", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];
  const candidateMappings = mergeById(
    (candidateMappingRows ?? []) as UnifiedSpellingReviewCandidateMappingRow[],
    (returnedCandidateMappingRows ?? []) as UnifiedSpellingReviewCandidateMappingRow[],
  );
  const catalogReviewCases = mergeById(
    (catalogReviewCaseRows ?? []) as UnifiedSpellingReviewCatalogReviewCaseRow[],
    (returnedCatalogReviewCaseRows ?? []) as UnifiedSpellingReviewCatalogReviewCaseRow[],
  );
  const candidateMappingIds = [
    ...new Set(
      candidateMappings
        .map((mapping) => mapping.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const { data: canonicalRecommendationRows } =
    candidateMappingIds.length > 0
      ? await supabase
          .from("spelling_canonical_mapping_recommendations")
          .select("id, candidate_mapping_id, recommendation_status")
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("candidate_mapping_id", candidateMappingIds)
          .in("recommendation_status", ["recommended", "pending_admin_review"])
          .order("created_at", { ascending: false })
      : { data: [] };

  return buildUnifiedSpellingReviewItems({
    submissionId: input.submissionId,
    writingSampleId,
    misspellings: (misspellingRows ?? []) as UnifiedSpellingReviewMisspellingRow[],
    writingIssueSuggestions:
      (suggestionRows ?? []) as unknown as UnifiedSpellingReviewSuggestionRow[],
    parentVerifications:
      (verificationRows ?? []) as UnifiedSpellingReviewParentVerificationRow[],
    historicalParentVerifications,
    writingIssues:
      (writingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[],
    correctionAttempts,
    returnedWritingIssues,
    candidateMappings,
    catalogReviewCases,
    canonicalRecommendations:
      (canonicalRecommendationRows ??
        []) as UnifiedSpellingReviewCanonicalRecommendationRow[],
  });
}
