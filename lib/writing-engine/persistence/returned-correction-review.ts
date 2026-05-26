import { createClient } from "../../supabase/server";
import type {
  WritingIssueCorrectionAttemptRow,
  WritingIssueFinalClassification,
  WritingIssueReflection,
  WritingIssueStatus,
} from "../../writing-practice/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ReturnedCorrectionAttemptQueryRow = Pick<
  WritingIssueCorrectionAttemptRow,
  | "id"
  | "writing_issue_id"
  | "task_submission_id"
  | "attempted_correction"
  | "attempt_notes"
  | "corrected_independently"
  | "reflection"
  | "metadata"
  | "created_at"
>;

type ReturnedCorrectionIssueQueryRow = {
  id: string;
  task_submission_id: string | null;
  source_misspelling_instance_id: string | null;
  source_suggestion_id: string | null;
  issue_status: WritingIssueStatus;
  final_classification: WritingIssueFinalClassification | null;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  context_text: string | null;
  source_field_key: string | null;
  position_start: number | null;
  position_end: number | null;
  micro_skill_key: string;
  theme_key: string | null;
  parent_review_note: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  parent_marked_at: string | null;
  sent_back_at: string | null;
  child_responded_at: string | null;
  final_classified_at: string | null;
  created_at: string;
};

export type ReturnedCorrectionReviewItem = {
  attemptId: string;
  currentSubmissionId: string;
  originalWritingIssueId: string;
  previousSubmissionId: string | null;
  sourceMisspellingInstanceId: string | null;
  sourceSuggestionId: string | null;
  issueStatus: WritingIssueStatus;
  finalClassification: WritingIssueFinalClassification | null;
  observedText: string | null;
  suggestedReplacement: string | null;
  approvedReplacement: string | null;
  contextText: string | null;
  sourceFieldKey: string | null;
  microSkillKey: string;
  themeKey: string | null;
  parentReviewNote: string | null;
  childAttemptedCorrection: string | null;
  childAttemptNotes: string | null;
  childCorrectedIndependently: boolean;
  childReflection: WritingIssueReflection;
  sourceKind: string | null;
  sourceLabel: string;
  parentAuthoredMissedWord: boolean;
  issueMetadata: Record<string, unknown>;
  attemptMetadata: Record<string, unknown>;
  attemptCreatedAt: string;
  childRespondedAt: string | null;
  finalClassifiedAt: string | null;
};

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSourceLabel(sourceKind: string | null, parentAuthoredMissedWord: boolean) {
  if (sourceKind === "parent_authored_missed_word" || parentAuthoredMissedWord) {
    return "Parent-added missed word";
  }

  if (sourceKind === "writing_issue_suggestion") {
    return "Suggested spelling issue";
  }

  if (sourceKind === "misspelling_instance") {
    return "Engine-found spelling issue";
  }

  return "Returned correction";
}

export async function loadReturnedCorrectionReviewItemsForSubmission(input: {
  supabase: SupabaseServerClient;
  submissionId: string;
  parentUserId: string;
  childId: string;
}): Promise<ReturnedCorrectionReviewItem[]> {
  const { data: attemptRows } = await input.supabase
    .from("writing_issue_correction_attempts")
    .select(
      [
        "id",
        "writing_issue_id",
        "task_submission_id",
        "attempted_correction",
        "attempt_notes",
        "corrected_independently",
        "reflection",
        "metadata",
        "created_at",
      ].join(", "),
    )
    .eq("task_submission_id", input.submissionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .order("created_at", { ascending: false });

  const attempts = (attemptRows ?? []) as unknown as ReturnedCorrectionAttemptQueryRow[];
  const latestAttemptByIssueId = new Map<string, ReturnedCorrectionAttemptQueryRow>();

  attempts.forEach((attempt) => {
    if (!latestAttemptByIssueId.has(attempt.writing_issue_id)) {
      latestAttemptByIssueId.set(attempt.writing_issue_id, attempt);
    }
  });

  const writingIssueIds = [...latestAttemptByIssueId.keys()];

  if (writingIssueIds.length === 0) {
    return [];
  }

  const { data: issueRows } = await input.supabase
    .from("writing_issues")
    .select(
      [
        "id",
        "task_submission_id",
        "source_misspelling_instance_id",
        "source_suggestion_id",
        "issue_status",
        "final_classification",
        "observed_text",
        "suggested_replacement",
        "approved_replacement",
        "context_text",
        "source_field_key",
        "position_start",
        "position_end",
        "micro_skill_key",
        "theme_key",
        "parent_review_note",
        "notes",
        "metadata",
        "parent_marked_at",
        "sent_back_at",
        "child_responded_at",
        "final_classified_at",
        "created_at",
      ].join(", "),
    )
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .in("id", writingIssueIds);

  const issueById = new Map(
    ((issueRows ?? []) as unknown as ReturnedCorrectionIssueQueryRow[]).map((issue) => [
      issue.id,
      issue,
    ]),
  );

  return writingIssueIds.flatMap((writingIssueId) => {
    const attempt = latestAttemptByIssueId.get(writingIssueId);
    const issue = issueById.get(writingIssueId);

    if (!attempt || !issue) {
      return [];
    }

    const issueMetadata = issue.metadata ?? {};
    const attemptMetadata = attempt.metadata ?? {};
    const sourceKind = getMetadataString(issueMetadata, "source_kind");
    const parentAuthoredMissedWord =
      sourceKind === "parent_authored_missed_word" ||
      issueMetadata.parent_authored_missed_word === true;

    return [
      {
        attemptId: attempt.id,
        currentSubmissionId: input.submissionId,
        originalWritingIssueId: issue.id,
        previousSubmissionId: issue.task_submission_id,
        sourceMisspellingInstanceId: issue.source_misspelling_instance_id,
        sourceSuggestionId: issue.source_suggestion_id,
        issueStatus: issue.issue_status,
        finalClassification: issue.final_classification,
        observedText: issue.observed_text,
        suggestedReplacement: issue.suggested_replacement,
        approvedReplacement: issue.approved_replacement,
        contextText: issue.context_text,
        sourceFieldKey: issue.source_field_key,
        microSkillKey: issue.micro_skill_key,
        themeKey: issue.theme_key,
        parentReviewNote: issue.parent_review_note ?? issue.notes,
        childAttemptedCorrection: attempt.attempted_correction,
        childAttemptNotes: attempt.attempt_notes,
        childCorrectedIndependently: attempt.corrected_independently,
        childReflection: attempt.reflection,
        sourceKind,
        sourceLabel: getSourceLabel(sourceKind, parentAuthoredMissedWord),
        parentAuthoredMissedWord,
        issueMetadata,
        attemptMetadata,
        attemptCreatedAt: attempt.created_at,
        childRespondedAt: issue.child_responded_at,
        finalClassifiedAt: issue.final_classified_at,
      },
    ];
  });
}
