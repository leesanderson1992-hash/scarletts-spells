import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  buildStructuredLessonResponseFromSubmissionSummary,
  getStructuredLessonResponseFromPayload,
  hasMeaningfulStructuredLessonResponse,
  type ReturnedWritingIssueDraftPayload,
} from "@/lib/lessons/responses";
import { maybeAwardTaskSubmissionApprovalCoins } from "@/lib/rewards/course-coins";
import { createClient } from "@/lib/supabase/server";
import {
  doesFinalClassificationCreateLearningItem,
  isWritingIssueFinalClassification,
  type WritingIssueFinalClassification,
} from "@/lib/writing-practice/types";
import {
  loadUnifiedSpellingReviewItemsForSubmission,
  summarizeUnifiedSpellingReviewCompletion,
} from "@/lib/writing-engine/persistence/unified-spelling-review-items";

import {
  buildRedirectWithMessage,
  getOwnedSubmission,
  getStructuredLessonReviewContext,
  inferStructuredLessonFieldMatch,
  looksLikeWordIssue,
  revalidateReviewQueueAndDetail,
  type ReviewSupabase,
} from "./_shared";
import {
  buildFalsePositiveSuppressionSet,
  buildVerifiedMisspellingIdSet,
  getUnresolvedMisspellingCount,
  hasActionableReturnedIssues,
  isParentAuthoredMisspellingRow,
  isSuppressedFalsePositivePair,
} from "../review-utils";

function getStructuredSubmissionPayloadTypeForReview(task: {
  task_type: string;
  lesson_schema?: unknown;
}) {
  const hasStructuredLessonSchema =
    task.lesson_schema &&
    typeof task.lesson_schema === "object" &&
    !Array.isArray(task.lesson_schema);

  if (!hasStructuredLessonSchema) {
    return null;
  }

  if (task.task_type === "lesson") {
    return "structured_lesson_response";
  }

  if (task.task_type === "test") {
    return "structured_test_response";
  }

  return null;
}

function getStructuredDraftPayloadSeed({
  existingDraftPayload,
  durablePayloadJson,
  summaryResponse,
}: {
  existingDraftPayload: unknown;
  durablePayloadJson?: unknown;
  summaryResponse?: unknown;
}) {
  if (
    hasMeaningfulStructuredLessonResponse(
      getStructuredLessonResponseFromPayload(existingDraftPayload),
    )
  ) {
    return existingDraftPayload;
  }

  if (durablePayloadJson && typeof durablePayloadJson === "object") {
    return {
      __structured_lesson_response: durablePayloadJson,
    };
  }

  if (summaryResponse && typeof summaryResponse === "object") {
    return {
      __structured_lesson_response: summaryResponse,
    };
  }

  return existingDraftPayload;
}

type ReturnFlowSubmission = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  submission_text: string | null;
  submitted_at: string;
};

type ReturnFlowWritingIssueRow = {
  id: string;
  issue_status: string;
  observed_text: string | null;
  approved_replacement: string | null;
  parent_review_note: string | null;
  source_field_key: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
  source_suggestion_id?: string | null;
  source_misspelling_instance_id: string | null;
  final_classification: string | null;
};

type ReturnFlowMisspellingRow = {
  id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  error_type: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
  is_false_positive: boolean | null;
  notes: string | null;
};

type ReturnFlowSuggestionRow = {
  id: string;
  misspelling_instance_id: string | null;
  suggestion_status: string;
  observed_text: string | null;
  suggested_replacement: string | null;
  suggested_micro_skill_key: string | null;
  notes: string | null;
};

type ReturnFlowParentVerificationRow = {
  source_entity_id: string;
};

function getValidPositionRange(row: {
  position_start?: number | null;
  position_end?: number | null;
}) {
  return typeof row.position_start === "number" &&
    typeof row.position_end === "number" &&
    row.position_start >= 0 &&
    row.position_end > row.position_start
    ? {
        position_start: row.position_start,
        position_end: row.position_end,
      }
    : {
        position_start: null,
        position_end: null,
      };
}

function getTrimmedOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function materializeReturnedSpellingIssuesFromCandidates(input: {
  supabase: ReviewSupabase;
  submission: ReturnFlowSubmission;
  parentUserId: string;
  structuredPayloadType: string | null;
  linkedWritingIssues: ReturnFlowWritingIssueRow[];
  safeParentNote: string | null;
  safeFieldFeedback: Record<string, string>;
  structuredLessonReviewContext: Awaited<
    ReturnType<typeof getStructuredLessonReviewContext>
  >;
  safeRedirectPath: string;
}) {
  if (!input.structuredPayloadType) {
    return false;
  }

  const { data: linkedSample } = await input.supabase
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", input.submission.id)
    .eq("parent_user_id", input.parentUserId)
    .maybeSingle();

  if (!linkedSample) {
    return false;
  }

  const [
    { data: misspellingRows },
    { data: suggestionRows },
    { data: falsePositiveSuppressions },
    { data: parentVerificationRows },
    { data: allLinkedWritingIssueRows },
  ] = await Promise.all([
    input.supabase
      .from("misspelling_instances")
      .select(
        "id, misspelled_word, corrected_word, suggested_word, error_type, context_text, position_start, position_end, is_false_positive, notes",
      )
      .eq("writing_sample_id", linkedSample.id)
      .eq("parent_user_id", input.parentUserId)
      .order("position_start", { ascending: true }),
    input.supabase
      .from("writing_issue_suggestions")
      .select(
        "id, misspelling_instance_id, suggestion_status, observed_text, suggested_replacement, suggested_micro_skill_key, notes",
      )
      .eq("task_submission_id", input.submission.id)
      .eq("parent_user_id", input.parentUserId)
      .order("created_at", { ascending: false }),
    input.supabase
      .from("writing_false_positive_suppressions")
      .select("misspelled_word, corrected_word")
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.submission.child_id),
    input.supabase
      .from("parent_verifications")
      .select("source_entity_id")
      .eq("task_submission_id", input.submission.id)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("writing_issues")
      .select("source_misspelling_instance_id")
      .eq("task_submission_id", input.submission.id)
      .eq("parent_user_id", input.parentUserId),
  ]);

  const misspellings = (misspellingRows ?? []) as ReturnFlowMisspellingRow[];
  const suggestions = (suggestionRows ?? []) as ReturnFlowSuggestionRow[];
  const parentVerifications = (parentVerificationRows ??
    []) as ReturnFlowParentVerificationRow[];

  const durableMisspellingIds = new Set([
    ...input.linkedWritingIssues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
    ...(allLinkedWritingIssueRows ?? [])
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  ]);
  const suggestionByMisspellingId = new Map<string, ReturnFlowSuggestionRow>();

  suggestions.forEach((suggestion) => {
    if (
      suggestion.misspelling_instance_id &&
      !suggestionByMisspellingId.has(suggestion.misspelling_instance_id)
    ) {
      suggestionByMisspellingId.set(suggestion.misspelling_instance_id, suggestion);
    }
  });

  const suppressedPairs = buildFalsePositiveSuppressionSet(
    falsePositiveSuppressions ?? [],
  );
  const verifiedMisspellingIds = buildVerifiedMisspellingIdSet({
    misspellings,
    writingIssueSuggestions: suggestions,
    parentVerifications,
    taskSubmissionId: input.submission.id,
    writingSampleId: linkedSample.id,
  });

  const eligibleMisspellings = misspellings.filter((misspelling) => {
    const suggestion = suggestionByMisspellingId.get(misspelling.id) ?? null;

    return (
      !(misspelling.is_false_positive ?? false) &&
      !isSuppressedFalsePositivePair(
        suppressedPairs,
        misspelling.misspelled_word,
        misspelling.suggested_word ?? misspelling.corrected_word,
      ) &&
      !durableMisspellingIds.has(misspelling.id) &&
      !verifiedMisspellingIds.has(misspelling.id) &&
      (!suggestion || suggestion.suggestion_status === "pending")
    );
  });

  if (eligibleMisspellings.length === 0) {
    return false;
  }

  const now = new Date().toISOString();
  const rowsToInsert = eligibleMisspellings.map((misspelling) => {
    const suggestion = suggestionByMisspellingId.get(misspelling.id) ?? null;
    const isParentAddedMissedWord = isParentAuthoredMisspellingRow(misspelling);
    const observedText =
      getTrimmedOrNull(suggestion?.observed_text) ?? misspelling.misspelled_word;
    const approvedReplacement =
      getTrimmedOrNull(suggestion?.suggested_replacement) ??
      getTrimmedOrNull(misspelling.suggested_word) ??
      misspelling.corrected_word;
    const childNote =
      getTrimmedOrNull(suggestion?.notes) ??
      input.safeParentNote ??
      getTrimmedOrNull(misspelling.notes);
    const matchedLessonField = inferStructuredLessonFieldMatch({
      reviewContext: input.structuredLessonReviewContext,
      observedText,
      approvedReplacement,
      contextText: misspelling.context_text,
      parentReviewNote: childNote,
    });
    const sourceFieldKey = matchedLessonField?.key ?? null;
    const positionRange = getValidPositionRange(misspelling);

    return {
      child_id: input.submission.child_id,
      parent_user_id: input.parentUserId,
      task_submission_id: input.submission.id,
      writing_sample_id: linkedSample.id,
      source_suggestion_id: suggestion?.id ?? null,
      source_misspelling_instance_id: misspelling.id,
      issue_status: "pending_parent_review",
      observed_text: observedText,
      suggested_replacement: approvedReplacement,
      approved_replacement: approvedReplacement,
      context_text: misspelling.context_text,
      source_field_key: sourceFieldKey,
      position_start: positionRange.position_start,
      position_end: positionRange.position_end,
      micro_skill_key:
        getTrimmedOrNull(suggestion?.suggested_micro_skill_key) ?? "unknown",
      parent_review_note:
        childNote ??
        (sourceFieldKey ? input.safeFieldFeedback[sourceFieldKey] ?? null : null),
      notes: "Materialized during structured returned-work send-back.",
      metadata: {
        source: "structured_returned_work_send_back",
        source_kind: isParentAddedMissedWord
          ? "parent_authored_missed_word"
          : suggestion
            ? "writing_issue_suggestion"
            : "misspelling_instance",
        parent_authored_missed_word: isParentAddedMissedWord,
      },
      parent_marked_at: now,
      created_at: now,
      updated_at: now,
    };
  });

  const { error } = await input.supabase.from("writing_issues").insert(rowsToInsert);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        input.safeRedirectPath,
        "error",
        "We couldn't prepare the spelling corrections for returned work just yet.",
      ),
    );
  }

  return true;
}

export async function deleteSubmissionFromReviewImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(submissionId, user.id);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const { data: linkedSamples } = await supabase
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id);

  const sampleIds = (linkedSamples ?? []).map((sample) => sample.id);

  if (sampleIds.length > 0) {
    await supabase
      .from("misspelling_instances")
      .delete()
      .eq("parent_user_id", user.id)
      .in("writing_sample_id", sampleIds);

    await supabase
      .from("writing_samples")
      .delete()
      .eq("parent_user_id", user.id)
      .in("id", sampleIds);
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, title, task_type, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount")
    .eq("id", submission.task_id)
    .eq("course_id", submission.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find the task for that submission.",
      ),
    );
  }

  const { error } = await supabase
    .from("task_submissions")
    .delete()
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't delete that submission just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);
  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/learn/week");

  redirect(buildRedirectWithMessage("/courses/review", "saved", "Submission deleted."));
}

export async function finaliseWritingIssueClassificationImpl(formData: FormData) {
  const writingIssueId = formData.get("writing_issue_id");
  const redirectPath = formData.get("redirect_path");
  const finalClassification = formData.get("final_classification");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (
    typeof writingIssueId !== "string" ||
    !writingIssueId ||
    typeof finalClassification !== "string" ||
    !finalClassification
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that writing issue classification.",
      ),
    );
  }

  if (!isWritingIssueFinalClassification(finalClassification)) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Choose a valid final classification before saving.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: issue } = await supabase
    .from("writing_issues")
    .select("id, child_id, issue_status, final_classification")
    .eq("id", writingIssueId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!issue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That writing issue no longer exists.",
      ),
    );
  }

  if (issue.issue_status === "finalised" || issue.final_classification !== null) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That writing issue has already been finalised.",
      ),
    );
  }

  if (issue.issue_status !== "child_responded") {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Only child responses can be final-classified in this slice.",
      ),
    );
  }

  const { data: finalisationResult, error } = await supabase.rpc(
    "finalise_writing_issue_classification_and_learning_item",
    {
      p_writing_issue_id: writingIssueId,
      p_parent_user_id: user.id,
      p_child_id: issue.child_id,
      p_final_classification:
        finalClassification satisfies WritingIssueFinalClassification,
    },
  );

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't save that final classification just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);

  const createdLearningItem = Boolean(
    finalisationResult &&
      typeof finalisationResult === "object" &&
      "created_learning_item" in finalisationResult &&
      finalisationResult.created_learning_item,
  );
  const reusedLearningItem = Boolean(
    finalisationResult &&
      typeof finalisationResult === "object" &&
      "reused_learning_item" in finalisationResult &&
      finalisationResult.reused_learning_item,
  );
  const linkedLearningItemExists = Boolean(
    finalisationResult &&
      typeof finalisationResult === "object" &&
      "learning_item_id" in finalisationResult &&
      finalisationResult.learning_item_id,
  );
  const learningItemBlockedReason =
    finalisationResult &&
    typeof finalisationResult === "object" &&
    "learning_item_blocked_reason" in finalisationResult &&
    typeof finalisationResult.learning_item_blocked_reason === "string"
      ? finalisationResult.learning_item_blocked_reason
      : null;
  const createsLearningItem = doesFinalClassificationCreateLearningItem(
    finalClassification,
  );

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      createdLearningItem
        ? `Final classification saved: ${finalClassification}. Golden Nugget created.`
        : reusedLearningItem && linkedLearningItemExists
          ? `Final classification saved: ${finalClassification}. Existing learning item strengthened.`
          : createsLearningItem &&
              learningItemBlockedReason ===
                "uncatalogued_or_non_assignable_micro_skill"
            ? `Final classification saved: ${finalClassification}. Durable issue preserved, but no assignable learning item was created yet.`
            : createsLearningItem && linkedLearningItemExists
              ? `Final classification saved: ${finalClassification}. Linked learning item confirmed.`
              : `Final classification saved: ${finalClassification}.`,
    ),
  );
}

export async function returnSubmissionToChildImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const parentNote = formData.get("parent_review_note");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
  }

  const safeParentNote =
    typeof parentNote === "string" && parentNote.trim().length > 0
      ? parentNote.trim().slice(0, 500)
      : null;

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(submissionId, user.id);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const safeFieldFeedback = Object.fromEntries(
    Array.from(formData.entries())
      .filter(
        ([key, value]) =>
          key.startsWith("field_feedback__") &&
          typeof value === "string" &&
          value.trim().length > 0,
      )
      .map(([key, value]) => [
        key.replace("field_feedback__", ""),
        (value as string).trim().slice(0, 500),
      ]),
  );
  const structuredLessonReviewContext = await getStructuredLessonReviewContext({
    supabase,
    taskId: submission.task_id,
    childId: submission.child_id,
    parentUserId: user.id,
  });

  const { data: existingDraft } = await supabase
    .from("task_submission_drafts")
    .select("draft_text, draft_review_summary, draft_payload")
    .eq("task_id", submission.task_id)
    .eq("child_id", submission.child_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const { data: task } = await supabase
    .from("course_tasks")
    .select("task_type, lesson_schema")
    .eq("id", submission.task_id)
    .eq("course_id", submission.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  const structuredPayloadType = task
    ? getStructuredSubmissionPayloadTypeForReview(task)
    : null;
  let durableReturnedPayload: { payload_json: unknown } | null = null;

  if (
    structuredPayloadType &&
    !hasMeaningfulStructuredLessonResponse(
      getStructuredLessonResponseFromPayload(existingDraft?.draft_payload),
    )
  ) {
    const { data } = await supabase
      .from("task_submission_payloads")
      .select("payload_json")
      .eq("submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .eq("course_id", submission.course_id)
      .eq("task_id", submission.task_id)
      .eq("child_id", submission.child_id)
      .eq("payload_type", structuredPayloadType)
      .maybeSingle();

    durableReturnedPayload = data as { payload_json: unknown } | null;
  }
  const summaryReturnedResponse =
    task && structuredPayloadType
      ? buildStructuredLessonResponseFromSubmissionSummary({
          taskId: submission.task_id,
          childId: submission.child_id,
          lessonValue: task.lesson_schema,
          submissionText: submission.submission_text ?? "",
          submittedAt: submission.submitted_at,
        })
      : null;

  const linkedWritingIssuesSelect =
    "id, issue_status, observed_text, approved_replacement, parent_review_note, source_field_key, context_text, position_start, position_end, source_suggestion_id, source_misspelling_instance_id, final_classification";

  const { data: initialLinkedWritingIssues } = await supabase
    .from("writing_issues")
    .select(linkedWritingIssuesSelect)
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .is("final_classification", null)
    .neq("issue_status", "finalised")
    .order("created_at", { ascending: true });

  let linkedWritingIssues = (initialLinkedWritingIssues ??
    []) as ReturnFlowWritingIssueRow[];

  const materializedCandidateIssues =
    await materializeReturnedSpellingIssuesFromCandidates({
      supabase,
      submission,
      parentUserId: user.id,
      structuredPayloadType,
      linkedWritingIssues,
      safeParentNote,
      safeFieldFeedback,
      structuredLessonReviewContext,
      safeRedirectPath,
    });

  if (materializedCandidateIssues) {
    const { data: refreshedLinkedWritingIssues } = await supabase
      .from("writing_issues")
      .select(linkedWritingIssuesSelect)
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .is("final_classification", null)
      .neq("issue_status", "finalised")
      .order("created_at", { ascending: true });

    linkedWritingIssues = (refreshedLinkedWritingIssues ??
      []) as ReturnFlowWritingIssueRow[];
  }

  const issuesToSendBack = linkedWritingIssues.filter(
    (issue) =>
      issue.issue_status === "pending_parent_review" ||
      issue.issue_status === "child_responded" ||
      issue.issue_status === "sent_back_to_child",
  );

  const hydratedIssuesToSendBack = issuesToSendBack.map((issue) => {
    const matchedLessonField = issue.source_field_key
      ? structuredLessonReviewContext?.reviewableFields.find(
          (field) => field.key === issue.source_field_key,
        ) ?? null
      : inferStructuredLessonFieldMatch({
          reviewContext: structuredLessonReviewContext,
          observedText: issue.observed_text,
          approvedReplacement: issue.approved_replacement,
          contextText: issue.context_text,
          parentReviewNote: issue.parent_review_note,
        });

    const resolvedSourceFieldKey = issue.source_field_key ?? matchedLessonField?.key ?? null;
    const resolvedChildNote =
      issue.parent_review_note ??
      (resolvedSourceFieldKey ? safeFieldFeedback[resolvedSourceFieldKey] ?? null : null) ??
      matchedLessonField?.feedback?.trim() ??
      safeParentNote;

    return {
      ...issue,
      resolvedSourceFieldKey,
      resolvedChildNote,
    };
  });

  const returnedIssuePayload: ReturnedWritingIssueDraftPayload[] = hydratedIssuesToSendBack.map(
    (issue) => ({
      issue_id: issue.id,
      observed_text: issue.observed_text ?? null,
      approved_replacement: issue.approved_replacement ?? null,
      child_note: issue.resolvedChildNote,
      source_field_key: issue.resolvedSourceFieldKey,
      context_text: issue.context_text ?? null,
      position_start:
        typeof issue.position_start === "number" ? issue.position_start : null,
      position_end: typeof issue.position_end === "number" ? issue.position_end : null,
      allow_confidence:
        Boolean(issue.source_misspelling_instance_id) ||
        looksLikeWordIssue(issue.observed_text, issue.approved_replacement),
      issue_status: "sent_back_to_child",
    }),
  );

  const draftPayloadSeed = getStructuredDraftPayloadSeed({
    existingDraftPayload: existingDraft?.draft_payload,
    durablePayloadJson: durableReturnedPayload?.payload_json,
    summaryResponse: summaryReturnedResponse,
  });
  const mergedDraftPayload =
    draftPayloadSeed &&
    typeof draftPayloadSeed === "object" &&
    !Array.isArray(draftPayloadSeed)
      ? {
          ...(draftPayloadSeed as Record<string, unknown>),
          __field_feedback: safeFieldFeedback,
          __writing_issue_feedback: returnedIssuePayload,
        }
      : {
          __field_feedback: safeFieldFeedback,
          __writing_issue_feedback: returnedIssuePayload,
        };

  const { error: returnedDraftUpsertError } = await supabase
    .from("task_submission_drafts")
    .upsert(
      {
        task_id: submission.task_id,
        course_id: submission.course_id,
        child_id: submission.child_id,
        parent_user_id: user.id,
        draft_text: existingDraft?.draft_text ?? submission.submission_text ?? "",
        draft_review_summary: existingDraft?.draft_review_summary ?? null,
        draft_payload: mergedDraftPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "task_id,child_id" },
    );

  if (returnedDraftUpsertError) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare the returned draft for the child just yet.",
      ),
    );
  }

  const { error } = await supabase
    .from("task_submissions")
    .update({
      parent_review_status: "returned",
      parent_review_note: safeParentNote,
      parent_reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't send that submission back just yet.",
      ),
    );
  }

  if (hydratedIssuesToSendBack.length > 0) {
    const issueIds = hydratedIssuesToSendBack.map((issue) => issue.id);
    const sentBackAt = new Date().toISOString();

    const { error: writingIssueStatusUpdateError } = await supabase
      .from("writing_issues")
      .update({
        issue_status: "sent_back_to_child",
        sent_back_at: sentBackAt,
      })
      .in("id", issueIds)
      .eq("parent_user_id", user.id);

    if (writingIssueStatusUpdateError) {
      redirect(
        buildRedirectWithMessage(
          safeRedirectPath,
          "error",
          "We couldn't attach the writing issues to returned work just yet.",
        ),
      );
    }

    const metadataBackfillTargets = hydratedIssuesToSendBack.filter(
      (issue) =>
        (issue.resolvedSourceFieldKey && issue.resolvedSourceFieldKey !== issue.source_field_key) ||
        (issue.resolvedChildNote && issue.resolvedChildNote !== issue.parent_review_note),
    );

    for (const issue of metadataBackfillTargets) {
      const { error: writingIssueMetadataUpdateError } = await supabase
        .from("writing_issues")
        .update({
          source_field_key: issue.resolvedSourceFieldKey,
          parent_review_note: issue.resolvedChildNote,
        })
        .eq("id", issue.id)
        .eq("parent_user_id", user.id);

      if (writingIssueMetadataUpdateError) {
        redirect(
          buildRedirectWithMessage(
            safeRedirectPath,
            "error",
            "We couldn't preserve the structured lesson issue link just yet.",
          ),
        );
      }
    }
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);
  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/learn/week");

  redirect(buildRedirectWithMessage(safeRedirectPath, "saved", "Sent back to child."));
}

export async function approveSubmissionReviewImpl(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error", "We couldn't find that submission."));
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { supabase, submission } = await getOwnedSubmission(submissionId, user.id);

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, title, task_type, lesson_schema, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount")
    .eq("id", submission.task_id)
    .eq("course_id", submission.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find the task for that submission.",
      ),
    );
  }

  const unifiedSpellingReviewItems = await loadUnifiedSpellingReviewItemsForSubmission({
    supabase,
    submissionId: submission.id,
    parentUserId: user.id,
    childId: submission.child_id,
  });
  const unifiedCompletionSummary = summarizeUnifiedSpellingReviewCompletion(
    unifiedSpellingReviewItems,
  );

  if (!unifiedCompletionSummary.canComplete) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        unifiedCompletionSummary.blockingReasons[0] ??
          "All spelling review items must be resolved before this submission can be approved.",
      ),
    );
  }
  const { data: linkedWritingIssues } = await supabase
    .from("writing_issues")
    .select("source_misspelling_instance_id, issue_status, final_classification")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id);

  if (hasActionableReturnedIssues(linkedWritingIssues ?? [])) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Final classification is still needed for returned writing issues before this submission can be approved.",
      ),
    );
  }

  const { data: linkedSample } = await supabase
    .from("writing_samples")
    .select("id")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const [{ data: writingIssueSuggestionRows }, { data: falsePositiveSuppressions }, { data: misspellingRows }] =
    linkedSample
      ? await Promise.all([
          supabase
            .from("writing_issue_suggestions")
            .select("misspelling_instance_id, suggestion_status")
            .eq("task_submission_id", submission.id)
            .eq("parent_user_id", user.id),
          supabase
            .from("writing_false_positive_suppressions")
            .select("misspelled_word, corrected_word")
            .eq("parent_user_id", user.id)
            .eq("child_id", submission.child_id),
          supabase
            .from("misspelling_instances")
            .select("id, misspelled_word, corrected_word, suggested_word, is_false_positive, notes")
            .eq("writing_sample_id", linkedSample.id)
            .eq("parent_user_id", user.id),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const suppressedWordPairs = buildFalsePositiveSuppressionSet(falsePositiveSuppressions ?? []);
  const visibleMisspellings = (misspellingRows ?? []).filter(
    (row) =>
      !(row.is_false_positive ?? false) &&
      !isSuppressedFalsePositivePair(
        suppressedWordPairs,
        row.misspelled_word,
        row.suggested_word ?? row.corrected_word,
      ),
  );
  const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
    visibleMisspellings,
    linkedWritingIssues ?? [],
    writingIssueSuggestionRows ?? [],
  );

  if (unresolvedMisspellingCount > 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "All captured suggestions must be reviewed before this submission can be approved.",
      ),
    );
  }

  const { error } = await supabase
    .from("task_submissions")
    .update({
      parent_review_status: "approved",
      parent_reviewed_at: new Date().toISOString(),
    })
    .eq("id", submission.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't approve that submission just yet.",
      ),
    );
  }

  const structuredPayloadType = getStructuredSubmissionPayloadTypeForReview(task);
  let shouldDeleteDraft = true;

  if (structuredPayloadType) {
    const { data: durablePayload } = await supabase
      .from("task_submission_payloads")
      .select("id")
      .eq("submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .eq("course_id", submission.course_id)
      .eq("task_id", submission.task_id)
      .eq("child_id", submission.child_id)
      .eq("payload_type", structuredPayloadType)
      .maybeSingle();

    shouldDeleteDraft = Boolean(durablePayload);
  }

  if (shouldDeleteDraft) {
    await supabase
      .from("task_submission_drafts")
      .delete()
      .eq("task_id", submission.task_id)
      .eq("child_id", submission.child_id)
      .eq("parent_user_id", user.id);
  }

  await maybeAwardTaskSubmissionApprovalCoins({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    task,
    submissionId: submission.id,
  });

  revalidateReviewQueueAndDetail(safeRedirectPath);
  revalidatePath("/dashboard");
  revalidatePath("/courses");
  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/insights");

  redirect(buildRedirectWithMessage(safeRedirectPath, "saved", "Submission approved."));
}
