import type {
  WritingIssueCorrectionAttemptRow,
  WritingIssueFinalClassification,
  WritingIssueReflection,
  WritingIssueStatus,
  WritingIssueSuggestionSource,
  WritingIssueSuggestionStatus,
} from "../../writing-practice/types";

type SupabaseQueryBuilder = PromiseLike<{ data: unknown }> & {
  select(columns: string): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  maybeSingle(): Promise<{ data: unknown }>;
};

type SupabaseServerClient = {
  from(table: string): SupabaseQueryBuilder;
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

function getCategorisationStatusForReturnedIssue(
  issue: UnifiedSpellingReviewWritingIssueRow,
): UnifiedSpellingReviewCategorisationStatus {
  if (issue.final_classification === "not_an_issue") {
    return "not_applicable";
  }

  if (hasMeaningfulMicroSkillKey(issue.micro_skill_key)) {
    return "categorised";
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

  const currentReviewItems = input.misspellings.map((misspelling) => {
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

    return {
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
          misspelling_notes: misspelling.notes,
          suggestion_metadata: parseMetadata(suggestion?.metadata),
        },
      },
    } satisfies UnifiedSpellingReviewItem;
  });

  const returnedCorrectionItems = input.returnedWritingIssues.flatMap((issue) => {
    const attempt = latestAttemptByWritingIssueId.get(issue.id) ?? null;

    if (!attempt) {
      return [];
    }

    const issueMetadata = parseMetadata(issue.metadata);
    const sourceKind = getMetadataString(issueMetadata, "source_kind");
    const parentAuthored =
      sourceKind === "parent_authored_missed_word" ||
      issueMetadata.parent_authored_missed_word === true;

    return [
      {
        id: `returned:${issue.id}:${attempt.id}`,
        source: "returned_correction",
        state: getStateForReturnedIssue(issue),
        categorisationStatus: getCategorisationStatusForReturnedIssue(issue),
        observedText: issue.observed_text ?? "Returned spelling issue",
        expectedCorrection:
          issue.approved_replacement ?? issue.suggested_replacement ?? null,
        latestChildAttempt: attempt.attempted_correction,
        childReflection: attempt.reflection,
        correctionOutcome: issue.final_classification,
        suggestedMicroSkillKey: null,
        verifiedMicroSkillKey: null,
        microSkillKey: issue.micro_skill_key,
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
          catalogReviewCaseId: null,
          candidateMappingId: null,
        },
        provenance: {
          parentAuthored,
          sourceKind,
          previousTaskSubmissionId: issue.task_submission_id,
          metadata: {
            issue_metadata: issueMetadata,
            attempt_metadata: parseMetadata(attempt.metadata),
          },
        },
      } satisfies UnifiedSpellingReviewItem,
    ];
  });

  return [...currentReviewItems, ...returnedCorrectionItems];
}

export async function loadUnifiedSpellingReviewItemsForSubmission(input: {
  supabase: SupabaseServerClient;
  submissionId: string;
  parentUserId: string;
  childId: string;
}): Promise<UnifiedSpellingReviewItem[]> {
  const { data: linkedSample } = await input.supabase
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
      ? input.supabase
          .from("misspelling_instances")
          .select(
            "id, writing_sample_id, misspelled_word, corrected_word, suggested_word, is_false_positive, notes, position_start, position_end, context_text",
          )
          .eq("writing_sample_id", writingSampleId)
          .eq("parent_user_id", input.parentUserId)
          .order("position_start", { ascending: true })
      : Promise.resolve({ data: [] }),
    input.supabase
      .from("writing_issue_suggestions")
      .select(
        "id, task_submission_id, writing_sample_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: false }),
    input.supabase
      .from("parent_verifications")
      .select(
        "id, source_entity_id, decision, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("verified_at", { ascending: false }),
    input.supabase
      .from("writing_issues")
      .select(
        "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, parent_review_note, notes, metadata, child_responded_at, final_classified_at",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: false }),
    input.supabase
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
      )
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .in("candidate_status", ["pending_parent_promotion", "parent_local_promoted"])
      .order("created_at", { ascending: false }),
    input.supabase
      .from("spelling_catalog_review_cases")
      .select("id, source_misspelling_instance_id, case_status")
      .eq("task_submission_id", input.submissionId)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .eq("case_status", "open")
      .order("created_at", { ascending: false }),
    input.supabase
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
      ? await input.supabase
          .from("writing_issues")
          .select(
            "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, suggested_replacement, approved_replacement, micro_skill_key, parent_review_note, notes, metadata, child_responded_at, final_classified_at",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .in("id", returnedWritingIssueIds)
      : { data: [] };

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
    returnedWritingIssues:
      (returnedWritingIssueRows ?? []) as unknown as UnifiedSpellingReviewWritingIssueRow[],
    candidateMappings:
      (candidateMappingRows ?? []) as UnifiedSpellingReviewCandidateMappingRow[],
    catalogReviewCases:
      (catalogReviewCaseRows ?? []) as UnifiedSpellingReviewCatalogReviewCaseRow[],
  });
}
