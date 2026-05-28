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
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  maybeSingle(): PromiseLike<{ data: unknown }>;
};

type SupabaseServerClient = {
  from(table: string): {
    select(columns: string): SupabaseQueryBuilder;
  };
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

export type BuildUnifiedSpellingReviewItemsInput = {
  submissionId: string;
  writingSampleId: string | null;
  misspellings: UnifiedSpellingReviewMisspellingRow[];
  writingIssueSuggestions: UnifiedSpellingReviewSuggestionRow[];
  parentVerifications: UnifiedSpellingReviewParentVerificationRow[];
  writingIssues: UnifiedSpellingReviewWritingIssueRow[];
  correctionAttempts: UnifiedSpellingReviewCorrectionAttemptRow[];
  returnedWritingIssues: UnifiedSpellingReviewWritingIssueRow[];
  candidateMappings: UnifiedSpellingReviewCandidateMappingRow[];
  catalogReviewCases: UnifiedSpellingReviewCatalogReviewCaseRow[];
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

  if (hasMeaningfulMicroSkillKey(issue.micro_skill_key)) {
    return "categorised";
  }

  if (
    returnedFinalClassificationNeedsRoute(issue.final_classification) &&
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

    if (!attempt) {
      return [];
    }

    const issueMetadata = parseMetadata(issue.metadata);
    const sourceKind = getMetadataString(issueMetadata, "source_kind");
    const parentAuthored =
      sourceKind === "parent_authored_missed_word" ||
      issueMetadata.parent_authored_missed_word === true;
    const childAttemptDisplay = getRetryDisplayText(attempt.attempted_correction);
    const historicalFullAnswerAttempt = childAttemptDisplay
      ? null
      : isLikelyFullAnswerText(attempt.attempted_correction)
        ? attempt.attempted_correction
        : null;

    return [
      {
        id: `returned:${issue.id}:${attempt.id}`,
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
        childReflection: attempt.reflection,
        correctionOutcome: issue.final_classification,
        suggestedMicroSkillKey: null,
        verifiedMicroSkillKey: null,
        microSkillKey: candidateMapping?.micro_skill_key ?? issue.micro_skill_key,
        parentNote: issue.parent_review_note ?? issue.notes ?? attempt.attempt_notes,
        sourceIds: {
          currentTaskSubmissionId: input.submissionId,
          writingSampleId: input.writingSampleId,
          misspellingInstanceId: issue.source_misspelling_instance_id,
          writingIssueSuggestionId: issue.source_suggestion_id,
          parentVerificationId: null,
          writingIssueId: null,
          originalWritingIssueId: issue.id,
          correctionAttemptId: attempt.id,
          catalogReviewCaseId: catalogReviewCase?.id ?? null,
          candidateMappingId: candidateMapping?.id ?? null,
        },
        provenance: {
          parentAuthored,
          sourceKind,
          previousTaskSubmissionId: issue.task_submission_id,
          metadata: {
            issue_metadata: issueMetadata,
            attempt_metadata: parseMetadata(attempt.metadata),
            source_misspelling_instance_id: issue.source_misspelling_instance_id,
            source_suggestion_id: issue.source_suggestion_id,
            original_writing_issue_id: issue.id,
            correction_attempt_id: attempt.id,
            historical_full_answer_attempt: historicalFullAnswerAttempt,
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
    { data: misspellingRows },
    { data: suggestionRows },
    { data: verificationRows },
    { data: writingIssueRows },
    { data: candidateMappingRows },
    { data: catalogReviewCaseRows },
    { data: attemptRows },
  ] = await Promise.all([
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
  const returnedWritingIssues =
    (returnedWritingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[];
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

  return buildUnifiedSpellingReviewItems({
    submissionId: input.submissionId,
    writingSampleId,
    misspellings: (misspellingRows ?? []) as UnifiedSpellingReviewMisspellingRow[],
    writingIssueSuggestions:
      (suggestionRows ?? []) as unknown as UnifiedSpellingReviewSuggestionRow[],
    parentVerifications:
      (verificationRows ?? []) as UnifiedSpellingReviewParentVerificationRow[],
    writingIssues:
      (writingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[],
    correctionAttempts,
    returnedWritingIssues,
    candidateMappings,
    catalogReviewCases,
  });
}
