import { buildStage7dReviewWorkVerificationTarget } from "@/lib/writing-engine/review/stage7d-parent-verification";

import type { ReviewSupabase } from "./_shared";
import { normaliseWordForLookup, isParentAuthoredMisspellingRow } from "../review-utils";

const ROUTABLE_RETURNED_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
]);

type ReturnedWritingIssueRouteRow = {
  id: string;
  task_submission_id: string;
  child_id: string;
  source_misspelling_instance_id: string | null;
  source_suggestion_id: string | null;
  final_classification: string | null;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  micro_skill_key: string | null;
  parent_review_note: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

type ReturnedMisspellingRouteRow = {
  id: string;
  writing_sample_id: string | null;
  misspelled_word: string | null;
  corrected_word: string | null;
  suggested_word: string | null;
  error_type: string | null;
  notes: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
};

type ReturnedCorrectionAttemptRouteRow = {
  id: string;
  task_submission_id: string;
  writing_issue_id: string;
  attempted_correction: string | null;
  attempt_notes: string | null;
  reflection: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ReturnedCorrectionRouteContext = {
  issue: ReturnedWritingIssueRouteRow;
  misspelling: ReturnedMisspellingRouteRow;
  attempt: ReturnedCorrectionAttemptRouteRow;
  sourceProvenance:
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";
  originalChildSpelling: string;
  originalCorrectSpelling: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  verificationTarget: NonNullable<
    ReturnType<typeof buildStage7dReviewWorkVerificationTarget>
  >;
  routeMetadata: Record<string, unknown>;
};

function parseMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isParentAuthoredReturnedIssue(input: {
  issue: ReturnedWritingIssueRouteRow;
  misspelling: ReturnedMisspellingRouteRow;
}) {
  const metadata = parseMetadata(input.issue.metadata);

  return (
    metadata.source_kind === "parent_authored_missed_word" ||
    metadata.parent_authored_missed_word === true ||
    isParentAuthoredMisspellingRow({ notes: input.misspelling.notes })
  );
}

export async function loadReturnedCorrectionRouteContext(input: {
  supabase: ReviewSupabase;
  parentUserId: string;
  childId: string;
  currentTaskSubmissionId: string;
  originalWritingIssueId: string;
  correctionAttemptId: string | null;
  finalClassificationOverride?: string | null;
}): Promise<ReturnedCorrectionRouteContext | null> {
  const { data: issueData } = await input.supabase
    .from("writing_issues")
    .select(
      [
        "id",
        "task_submission_id",
        "child_id",
        "source_misspelling_instance_id",
        "source_suggestion_id",
        "final_classification",
        "observed_text",
        "suggested_replacement",
        "approved_replacement",
        "micro_skill_key",
        "parent_review_note",
        "notes",
        "metadata",
      ].join(", "),
    )
    .eq("id", input.originalWritingIssueId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();

  const issue = issueData as ReturnedWritingIssueRouteRow | null;

  if (!issue?.source_misspelling_instance_id) {
    return null;
  }

  const routeFinalClassification =
    issue.final_classification ?? input.finalClassificationOverride ?? null;

  if (
    !routeFinalClassification ||
    !ROUTABLE_RETURNED_CLASSIFICATIONS.has(routeFinalClassification)
  ) {
    return null;
  }

  const { data: misspellingData } = await input.supabase
    .from("misspelling_instances")
    .select(
      [
        "id",
        "writing_sample_id",
        "misspelled_word",
        "corrected_word",
        "suggested_word",
        "error_type",
        "notes",
        "context_text",
        "position_start",
        "position_end",
      ].join(", "),
    )
    .eq("id", issue.source_misspelling_instance_id)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .maybeSingle();

  const misspelling = misspellingData as ReturnedMisspellingRouteRow | null;

  if (!misspelling) {
    return null;
  }

  let attemptQuery = input.supabase
    .from("writing_issue_correction_attempts")
    .select(
      [
        "id",
        "task_submission_id",
        "writing_issue_id",
        "attempted_correction",
        "attempt_notes",
        "reflection",
        "metadata",
        "created_at",
      ].join(", "),
    )
    .eq("writing_issue_id", issue.id)
    .eq("task_submission_id", input.currentTaskSubmissionId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId);

  if (input.correctionAttemptId) {
    attemptQuery = attemptQuery.eq("id", input.correctionAttemptId);
  }

  const { data: attemptData } = await attemptQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attempt = attemptData as ReturnedCorrectionAttemptRouteRow | null;

  if (!attempt) {
    return null;
  }

  const originalChildSpelling =
    readString(issue.observed_text) ?? readString(misspelling.misspelled_word);
  const originalCorrectSpelling =
    readString(issue.approved_replacement) ??
    readString(issue.suggested_replacement) ??
    readString(misspelling.suggested_word) ??
    readString(misspelling.corrected_word);

  if (!originalChildSpelling || !originalCorrectSpelling) {
    return null;
  }

  const misspellingNormalized = normaliseWordForLookup(originalChildSpelling);
  const correctSpellingNormalized = normaliseWordForLookup(originalCorrectSpelling);

  if (!misspellingNormalized || !correctSpellingNormalized) {
    return null;
  }

  const isParentAuthored = isParentAuthoredReturnedIssue({ issue, misspelling });
  const sourceProvenance = isParentAuthored
    ? "lesson_submission_parent_added_missed_word"
    : "lesson_submission_existing_output";

  const verificationTarget = buildStage7dReviewWorkVerificationTarget({
    taskSubmissionId: issue.task_submission_id,
    writingSampleId: misspelling.writing_sample_id,
    observedText: originalChildSpelling,
    suggestedReplacement: originalCorrectSpelling,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedCategoryCode: misspelling.error_type,
    suggestedMicroSkillKey: readString(issue.micro_skill_key),
    notes: issue.parent_review_note ?? issue.notes ?? misspelling.notes,
  });

  if (!verificationTarget) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    issue,
    misspelling,
    attempt,
    sourceProvenance,
    originalChildSpelling,
    originalCorrectSpelling,
    misspellingNormalized,
    correctSpellingNormalized,
    verificationTarget,
    routeMetadata: {
      source_provenance: sourceProvenance,
      source_route: "returned_correction",
      source_misspelling_instance_id: misspelling.id,
      source_suggestion_id: issue.source_suggestion_id,
      original_writing_issue_id: issue.id,
      original_task_submission_id: issue.task_submission_id,
      returned_task_submission_id: input.currentTaskSubmissionId,
      correction_attempt_id: attempt.id,
      child_attempted_correction: attempt.attempted_correction,
      final_classification: routeFinalClassification,
      final_classification_source: issue.final_classification
        ? "durable_issue"
        : "pending_parent_route_intent",
      context_text: misspelling.context_text,
      position_start: misspelling.position_start,
      position_end: misspelling.position_end,
      suggested_category_code: misspelling.error_type,
      parent_authored_missed_word: isParentAuthored,
      updated_from_returned_correction_route_at: nowIso,
    },
  };
}
