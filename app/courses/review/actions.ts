"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  categoriseError,
  getSecondaryCategory,
} from "@/lib/spelling/categoriseError";
import { extractReviewableLessonFields } from "@/lib/lessons/review";
import type { ReturnedWritingIssueDraftPayload } from "@/lib/lessons/responses";
import {
  detectErrorPattern,
  selectTeachingFamilyForError,
} from "@/lib/spelling/errorPatterns";
import { findWordFamilyForWord } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";
import { maybeAwardTaskSubmissionApprovalCoins } from "@/lib/rewards/course-coins";
import {
  buildStage7dReviewWorkVerificationTarget,
  recordStage7dParentVerification,
} from "@/lib/writing-engine/review/stage7d-parent-verification";
import { stringifyAnalysisExtraMetadata } from "@/lib/writing-engine/spelling/legacy-analysis";
import { confirmPositiveEvidenceSuggestions } from "@/lib/writing-practice/positive-evidence";
import {
  doesFinalClassificationCreateLearningItem,
  isWritingIssueFinalClassification,
  type WritingIssueFinalClassification,
} from "@/lib/writing-practice/types";

import {
  buildFalsePositiveSuppressionSet,
  getUnresolvedMisspellingCount,
  hasActionableReturnedIssues,
  isSuppressedFalsePositivePair,
  normaliseWordForLookup,
} from "./review-utils";

function buildRedirectWithMessage(
  path: string,
  key: "saved" | "error",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function getPathnameOnly(path: string) {
  return path.split("?")[0] ?? path;
}

function revalidateReviewQueueAndDetail(redirectPath: string) {
  revalidatePath("/courses/review");
  revalidatePath(getPathnameOnly(redirectPath));
}

function revalidateReviewQueueAndDetailBestEffort(redirectPath: string) {
  try {
    revalidateReviewQueueAndDetail(redirectPath);
  } catch (error) {
    console.error("Review Work revalidation failed after parent verification.", error);
  }
}

function revalidateReviewDetailAndInsights(redirectPath: string) {
  revalidatePath(getPathnameOnly(redirectPath));
  revalidatePath("/insights");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWordRange(text: string, word: string) {
  const exactPattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
  const exactMatch = exactPattern.exec(text);

  if (exactMatch?.index !== undefined) {
    return {
      start: exactMatch.index,
      end: exactMatch.index + exactMatch[0].length,
      raw: exactMatch[0],
    };
  }

  const looseIndex = text.toLowerCase().indexOf(word.toLowerCase());
  if (looseIndex >= 0) {
    return {
      start: looseIndex,
      end: looseIndex + word.length,
      raw: text.slice(looseIndex, looseIndex + word.length),
    };
  }

  return null;
}

async function getOwnedSubmission(
  submissionId: string,
  userId: string,
  suppliedSupabase?: Awaited<ReturnType<typeof createClient>>,
) {
  const supabase = suppliedSupabase ?? await createClient();
  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, task_id, course_id, child_id, submission_text, submitted_at")
    .eq("id", submissionId)
    .eq("parent_user_id", userId)
    .maybeSingle();

  return { supabase, submission };
}

async function getLinkedWritingSample(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  userId: string,
) {
  const { data: sample } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("task_submission_id", submissionId)
    .eq("parent_user_id", userId)
    .maybeSingle();

  return sample;
}

async function getOwnedManualWritingSample(
  supabase: Awaited<ReturnType<typeof createClient>>,
  writingSampleId: string,
  userId: string,
) {
  const { data: sample } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text, task_submission_id, review_completed_at")
    .eq("id", writingSampleId)
    .eq("parent_user_id", userId)
    .maybeSingle();

  return sample;
}

function normaliseIssueText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function normaliseOptionalIssueText(value: FormDataEntryValue | null) {
  const normalised = normaliseIssueText(value);
  return normalised.length > 0 ? normalised : null;
}

function normaliseMicroSkillKey(value: FormDataEntryValue | null) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  return rawValue.length > 0 ? rawValue.slice(0, 120) : "unknown";
}

function normaliseStage7dDecision(
  value: FormDataEntryValue | null,
): "accepted" | "overridden" | "false_positive" | "not_a_learning_issue" | null {
  if (
    value === "accepted" ||
    value === "overridden" ||
    value === "false_positive" ||
    value === "not_a_learning_issue"
  ) {
    return value;
  }

  return null;
}

function normaliseStage7dOverrideField(
  value: FormDataEntryValue | null,
  maxLength = 120,
) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  return rawValue.length > 0 ? rawValue.slice(0, maxLength) : null;
}

function parseSuggestionIdsFromFormData(formData: FormData) {
  return Array.from(
    new Set(
      formData
        .getAll("suggestion_ids")
        .flatMap((value) =>
          typeof value === "string"
            ? value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : [],
        ),
    ),
  );
}

function looksLikeWordIssue(
  observedText: string | null | undefined,
  approvedReplacement: string | null | undefined,
) {
  const safeObserved = typeof observedText === "string" ? observedText.trim() : "";
  const safeReplacement =
    typeof approvedReplacement === "string" ? approvedReplacement.trim() : "";

  const singleWordPattern = /^[a-zA-Z'-]+$/;

  return (
    (safeObserved.length > 0 && singleWordPattern.test(safeObserved)) ||
    (safeReplacement.length > 0 && singleWordPattern.test(safeReplacement))
  );
}

type StructuredLessonReviewContext = {
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
};

type StructuredLessonFieldMatch = StructuredLessonReviewContext["reviewableFields"][number];

function normaliseComparableText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsWholeWord(text: string, word: string) {
  const safeWord = word.trim();

  if (!safeWord) {
    return false;
  }

  const pattern = new RegExp(`\\b${escapeRegExp(safeWord)}\\b`, "i");
  return pattern.test(text);
}

async function getStructuredLessonReviewContext({
  supabase,
  taskId,
  childId,
  parentUserId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  taskId: string;
  childId: string;
  parentUserId: string;
}): Promise<StructuredLessonReviewContext | null> {
  const [{ data: task }, { data: draftRow }] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("lesson_schema")
      .eq("id", taskId)
      .eq("parent_user_id", parentUserId)
      .maybeSingle(),
    supabase
      .from("task_submission_drafts")
      .select("draft_payload")
      .eq("task_id", taskId)
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId)
      .maybeSingle(),
  ]);

  const lessonSchema =
    task?.lesson_schema && typeof task.lesson_schema === "object" && !Array.isArray(task.lesson_schema)
      ? task.lesson_schema
      : null;

  const reviewableFields = extractReviewableLessonFields(
    draftRow?.draft_payload ?? null,
    lessonSchema,
  );

  if (reviewableFields.length === 0) {
    return null;
  }

  return { reviewableFields };
}

function inferStructuredLessonFieldMatch({
  reviewContext,
  observedText,
  approvedReplacement,
  contextText,
  parentReviewNote,
}: {
  reviewContext: StructuredLessonReviewContext | null;
  observedText: string | null | undefined;
  approvedReplacement?: string | null | undefined;
  contextText?: string | null | undefined;
  parentReviewNote?: string | null | undefined;
}): StructuredLessonFieldMatch | null {
  if (!reviewContext) {
    return null;
  }

  const safeObservedText = normaliseComparableText(observedText);
  const safeApprovedReplacement = normaliseComparableText(approvedReplacement);
  const safeContextText = normaliseComparableText(contextText);
  const safeParentReviewNote = normaliseComparableText(parentReviewNote);

  const scoredMatches = reviewContext.reviewableFields
    .map((field) => {
      const safeFieldValue = normaliseComparableText(field.value);
      const safeFieldFeedback = normaliseComparableText(field.feedback);
      let score = 0;

      if (safeContextText && safeFieldValue.includes(safeContextText)) {
        score += 8;
      }

      if (safeObservedText && containsWholeWord(field.value, safeObservedText)) {
        score += 6;
      } else if (safeObservedText && safeFieldValue.includes(safeObservedText)) {
        score += 4;
      }

      if (
        safeApprovedReplacement &&
        safeApprovedReplacement !== safeObservedText &&
        safeFieldValue.includes(safeApprovedReplacement)
      ) {
        score += 2;
      }

      if (safeParentReviewNote && safeFieldFeedback === safeParentReviewNote) {
        score += 3;
      } else if (safeParentReviewNote && safeFieldFeedback.includes(safeParentReviewNote)) {
        score += 1;
      }

      if (safeFieldFeedback) {
        score += 0.25;
      }

      return { field, score, fieldLength: safeFieldValue.length };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.fieldLength - right.fieldLength;
    });

  if (scoredMatches.length === 0) {
    return null;
  }

  if (
    scoredMatches.length > 1 &&
    scoredMatches[0].score === scoredMatches[1].score &&
    scoredMatches[0].fieldLength === scoredMatches[1].fieldLength
  ) {
    return null;
  }

  return scoredMatches[0].field;
}

async function findOrCreateSuggestionForMisspelling({
  supabase,
  parentUserId,
  childId,
  taskSubmissionId,
  writingSampleId,
  misspellingInstanceId,
  observedText,
  suggestedReplacement,
  contextText,
  positionStart,
  positionEnd,
  suggestedMicroSkillKey,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
  writingSampleId: string | null;
  misspellingInstanceId: string;
  observedText: string | null;
  suggestedReplacement: string | null;
  contextText: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  suggestedMicroSkillKey: string;
}) {
  const { data: existingSuggestion } = await supabase
    .from("writing_issue_suggestions")
    .select("id, suggestion_status")
    .eq("parent_user_id", parentUserId)
    .eq("task_submission_id", taskSubmissionId)
    .eq("misspelling_instance_id", misspellingInstanceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSuggestion) {
    return existingSuggestion;
  }

  const { data: createdSuggestion, error } = await supabase
    .from("writing_issue_suggestions")
    .insert({
      child_id: childId,
      parent_user_id: parentUserId,
      task_submission_id: taskSubmissionId,
      writing_sample_id: writingSampleId,
      misspelling_instance_id: misspellingInstanceId,
      source_type: "misspelling_instance",
      suggestion_status: "pending",
      observed_text: observedText,
      suggested_replacement: suggestedReplacement,
      context_text: contextText,
      position_start: positionStart,
      position_end: positionEnd,
      suggested_micro_skill_key: suggestedMicroSkillKey,
    })
    .select("id, suggestion_status")
    .single();

  if (error || !createdSuggestion) {
    return null;
  }

  return createdSuggestion;
}

export async function addMissedWordToSubmissionReview(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspelledWord = formData.get("misspelled_word");
  const correctedWord = formData.get("corrected_word");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspelledWord !== "string" ||
    !misspelledWord.trim() ||
    typeof correctedWord !== "string" ||
    !correctedWord.trim()
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Add both the word the child wrote and the correct spelling.",
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const safeMisspelledWord = normaliseWordForLookup(misspelledWord);
  const safeCorrectedWord = normaliseWordForLookup(correctedWord);

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, child_id")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that submission anymore.",
      ),
    );
  }

  const { data: sample } = await supabase
    .from("writing_samples")
    .select("id, child_id, sample_text")
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!sample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That submission does not have a writing sample to review.",
      ),
    );
  }

  const { data: existing } = await supabase
    .from("misspelling_instances")
    .select("id")
    .eq("writing_sample_id", sample.id)
    .eq("parent_user_id", user.id)
    .eq("misspelled_word", safeMisspelledWord)
    .eq("corrected_word", safeCorrectedWord)
    .maybeSingle();

  if (existing) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That missed word is already on the review list.",
      ),
    );
  }

  const range = findWordRange(sample.sample_text, safeMisspelledWord);
  const detectedErrorPattern =
    detectErrorPattern(safeMisspelledWord, safeCorrectedWord) ??
    "tricky_whole_word_error";
  const category = categoriseError(
    safeMisspelledWord,
    safeCorrectedWord,
    detectedErrorPattern,
  );
  const secondaryCategory = getSecondaryCategory(
    safeMisspelledWord,
    safeCorrectedWord,
    category,
    detectedErrorPattern,
  );
  const selectedWordFamilyId =
    selectTeachingFamilyForError(
      safeMisspelledWord,
      safeCorrectedWord,
      detectedErrorPattern,
    ) ??
    findWordFamilyForWord(safeCorrectedWord)?.id ??
    null;

  const { error } = await supabase.from("misspelling_instances").insert({
    writing_sample_id: sample.id,
    child_id: sample.child_id,
    parent_user_id: user.id,
    misspelled_word: safeMisspelledWord,
    corrected_word: safeCorrectedWord,
    suggested_word: safeCorrectedWord,
    error_type: category,
    secondary_error_type: secondaryCategory,
    confidence_score: 1,
    is_false_positive: false,
    is_parent_overridden: false,
    word_family_id: null,
    context_text: range?.raw ?? safeMisspelledWord,
    position_start: range?.start ?? null,
    position_end: range?.end ?? null,
    notes: stringifyAnalysisExtraMetadata({
      detectedPrimaryCategory: category,
      parentOverrideCategory: null,
      parentOverrideFamilyId: null,
      parentOverrideDiagnosis: null,
      parentReviewedAt: null,
      markedCareless: false,
      detectedErrorPattern,
      selectedWordFamilyId,
    }),
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't add that missed word just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Missed word added to the review list.",
    ),
  );
}

export async function acceptSubmissionReviewIssue(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const observedText = normaliseOptionalIssueText(formData.get("observed_text"));
  const approvedReplacement = normaliseOptionalIssueText(formData.get("approved_replacement"));
  const parentReviewNote = normaliseOptionalIssueText(formData.get("issue_note"));
  const microSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that issue suggestion.",
      ),
    );
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

  const linkedSample = await getLinkedWritingSample(supabase, submission.id, user.id);
  const structuredLessonReviewContext = await getStructuredLessonReviewContext({
    supabase,
    taskId: submission.task_id,
    childId: submission.child_id,
    parentUserId: user.id,
  });

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling suggestion is no longer available.",
      ),
    );
  }

  const { data: existingIssue } = await supabase
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .eq("source_misspelling_instance_id", misspelling.id)
    .maybeSingle();

  if (existingIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That writing issue has already been saved.",
      ),
    );
  }

  const matchedLessonField = inferStructuredLessonFieldMatch({
    reviewContext: structuredLessonReviewContext,
    observedText: observedText ?? misspelling.misspelled_word,
    approvedReplacement:
      approvedReplacement ?? misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    parentReviewNote,
  });
  const issueLevelParentNote =
    parentReviewNote ?? matchedLessonField?.feedback?.trim() ?? null;

  const suggestion = await findOrCreateSuggestionForMisspelling({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    misspellingInstanceId: misspelling.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedMicroSkillKey: "unknown",
  });

  if (!suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that issue suggestion just yet.",
      ),
    );
  }

  const { error: suggestionUpdateError } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "accepted",
      observed_text: observedText ?? misspelling.misspelled_word,
      suggested_replacement:
        approvedReplacement ?? misspelling.suggested_word ?? misspelling.corrected_word,
      suggested_micro_skill_key: microSkillKey,
      source_field_key: matchedLessonField?.key ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("parent_user_id", user.id);

  if (suggestionUpdateError) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't update that suggestion just yet.",
      ),
    );
  }

  const { error } = await supabase.from("writing_issues").insert({
    child_id: submission.child_id,
    parent_user_id: user.id,
    task_submission_id: submission.id,
    writing_sample_id: linkedSample?.id ?? null,
    source_suggestion_id: suggestion.id,
    source_misspelling_instance_id: misspelling.id,
    issue_status: "pending_parent_review",
    final_classification: null,
    observed_text: observedText ?? misspelling.misspelled_word,
    suggested_replacement: misspelling.suggested_word ?? misspelling.corrected_word,
    approved_replacement:
      approvedReplacement ?? misspelling.suggested_word ?? misspelling.corrected_word,
    context_text: misspelling.context_text,
    source_field_key: matchedLessonField?.key ?? null,
    position_start: misspelling.position_start,
    position_end: misspelling.position_end,
    micro_skill_key: microSkillKey,
    parent_review_note: issueLevelParentNote,
    parent_marked_at: new Date().toISOString(),
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't save that writing issue just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Writing issue saved for targeted writing practice.",
    ),
  );
}

export async function rejectSubmissionReviewIssue(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const rejectionNote = normaliseOptionalIssueText(formData.get("rejection_note"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that issue suggestion.",
      ),
    );
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

  const linkedSample = await getLinkedWritingSample(supabase, submission.id, user.id);

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That spelling suggestion is no longer available.",
      ),
    );
  }

  const { data: existingIssue } = await supabase
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .eq("source_misspelling_instance_id", misspelling.id)
    .maybeSingle();

  if (existingIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That suggestion already has a saved writing issue.",
      ),
    );
  }

  const suggestion = await findOrCreateSuggestionForMisspelling({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    misspellingInstanceId: misspelling.id,
    observedText: misspelling.misspelled_word,
    suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedMicroSkillKey: "unknown",
  });

  if (!suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that suggestion just yet.",
      ),
    );
  }

  const { error } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "rejected",
      notes: rejectionNote,
      rejected_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't reject that suggestion just yet.",
      ),
    );
  }

  const { error: suppressionError } = await supabase
    .from("writing_false_positive_suppressions")
    .upsert(
      {
        child_id: submission.child_id,
        parent_user_id: user.id,
        misspelled_word: normaliseWordForLookup(misspelling.misspelled_word),
        corrected_word: normaliseWordForLookup(
          misspelling.suggested_word ?? misspelling.corrected_word,
        ),
        source_writing_issue_suggestion_id: suggestion.id,
        source_misspelling_instance_id: misspelling.id,
        notes: rejectionNote,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "child_id,parent_user_id,misspelled_word,corrected_word",
      },
    );

  if (suppressionError) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "The suggestion was rejected, but the exact false-positive suppression could not be saved yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Suggestion rejected for targeted writing practice.",
    ),
  );
}

export async function recordReviewWorkVerificationAction(formData: FormData) {
  const decision = normaliseStage7dDecision(formData.get("decision"));
  const redirectPath = formData.get("redirect_path");
  const misspellingInstanceId = formData.get("misspelling_instance_id");
  const taskSubmissionId = formData.get("task_submission_id");
  const writingSampleId = formData.get("writing_sample_id");
  const verifiedCategoryCode = normaliseStage7dOverrideField(
    formData.get("verified_category_code"),
  );
  const verifiedMicroSkillKey = normaliseStage7dOverrideField(
    formData.get("verified_micro_skill_key"),
  );
  const verifiedTemplateKey = normaliseStage7dOverrideField(
    formData.get("verified_template_key"),
  );
  const verificationNote = normaliseOptionalIssueText(formData.get("verification_note"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    !decision ||
    typeof misspellingInstanceId !== "string" ||
    !misspellingInstanceId ||
    (typeof taskSubmissionId !== "string" || !taskSubmissionId) &&
      (typeof writingSampleId !== "string" || !writingSampleId)
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that parent verification action.",
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const ownedSubmission =
    typeof taskSubmissionId === "string" && taskSubmissionId
      ? await getOwnedSubmission(taskSubmissionId, user.id, supabase)
      : null;

  if (ownedSubmission && !ownedSubmission.submission) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That lesson submission is no longer available for review.",
      ),
    );
  }

  const manualSample =
    typeof writingSampleId === "string" && writingSampleId
      ? await getOwnedManualWritingSample(supabase, writingSampleId, user.id)
      : null;
  const linkedSample =
    ownedSubmission?.submission
      ? await getLinkedWritingSample(supabase, ownedSubmission.submission.id, user.id)
      : null;

  if (!ownedSubmission?.submission && !manualSample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That review source is no longer available.",
      ),
    );
  }

  const childId = ownedSubmission?.submission?.child_id ?? manualSample?.child_id;
  const canonicalWritingSampleId = linkedSample?.id ?? manualSample?.id ?? null;

  const { data: misspelling } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, error_type, notes, context_text, position_start, position_end",
    )
    .eq("id", misspellingInstanceId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!misspelling || !childId || !canonicalWritingSampleId) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That shared output is no longer available for verification.",
      ),
    );
  }

  const pendingSuggestionQuery = supabase
    .from("writing_issue_suggestions")
    .select(
      "id, suggested_replacement, suggested_micro_skill_key, notes, suggestion_status",
    )
    .eq("parent_user_id", user.id)
    .eq("misspelling_instance_id", misspelling.id)
    .eq("suggestion_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (ownedSubmission?.submission) {
    pendingSuggestionQuery.eq("task_submission_id", ownedSubmission.submission.id);
  } else {
    pendingSuggestionQuery.eq("writing_sample_id", canonicalWritingSampleId);
  }

  const { data: pendingSuggestion } = await pendingSuggestionQuery.maybeSingle();
  const suggestedMicroSkillKey = pendingSuggestion?.suggested_micro_skill_key ?? null;
  const verificationTarget = buildStage7dReviewWorkVerificationTarget({
    taskSubmissionId: ownedSubmission?.submission?.id ?? null,
    writingSampleId: canonicalWritingSampleId,
    observedText: misspelling.misspelled_word,
    suggestedReplacement:
      pendingSuggestion?.suggested_replacement ??
      misspelling.suggested_word ??
      misspelling.corrected_word,
    contextText: misspelling.context_text,
    positionStart: misspelling.position_start,
    positionEnd: misspelling.position_end,
    suggestedCategoryCode: misspelling.error_type,
    suggestedMicroSkillKey,
    notes: pendingSuggestion?.notes ?? misspelling.notes,
  });

  if (!verificationTarget) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That shared output does not yet have enough canonical source detail for parent verification.",
      ),
    );
  }

  const hasAnyOverrideField =
    verifiedCategoryCode !== null ||
    verifiedMicroSkillKey !== null ||
    verifiedTemplateKey !== null;
  const hasMeaningfulOverrideField =
    (verifiedCategoryCode !== null &&
      verifiedCategoryCode !== verificationTarget.suggestedCategoryCode) ||
    (verifiedMicroSkillKey !== null &&
      verifiedMicroSkillKey !== verificationTarget.suggestedMicroSkillKey) ||
    verifiedTemplateKey !== null;

  if (decision !== "overridden" && hasAnyOverrideField) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Verified override fields are only available through the override flow.",
      ),
    );
  }

  if (decision === "overridden" && !hasMeaningfulOverrideField) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Override requires at least one changed canonical verification field.",
      ),
    );
  }

  const { data: existingVerification } = await supabase
    .from("parent_verifications")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("source_entity_id", verificationTarget.sourceRef.sourceEntityId)
    .limit(1)
    .maybeSingle();

  if (existingVerification) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "A parent verification was already recorded for that shared output.",
      ),
    );
  }

  if (
    decision === "accepted" &&
    (ownedSubmission?.submission
      ? !suggestedMicroSkillKey || suggestedMicroSkillKey.trim().toLowerCase() === "unknown"
      : false)
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Accepted verification is only available when existing shared suggestion truth already carries a canonical micro-skill.",
      ),
    );
  }

  try {
    await recordStage7dParentVerification({
      supabase,
      childId,
      parentUserId: user.id,
      decision,
      verifiedCategoryCode,
      verifiedMicroSkillKey,
      verifiedTemplateKey,
      note: verificationNote,
      target: verificationTarget,
    });
  } catch (error) {
    console.error("Review Work verification action failed before redirect.", error);
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Could not record that parent verification right now.",
      ),
    );
  }

  revalidateReviewQueueAndDetailBestEffort(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      decision === "accepted"
        ? "Parent verification recorded as accepted."
        : decision === "overridden"
          ? "Parent verification recorded as overridden."
        : decision === "false_positive"
          ? "Parent verification recorded as false positive."
          : "Parent verification recorded as not a learning issue.",
    ),
  );
}

export async function addManualWritingIssue(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const observedText = normaliseOptionalIssueText(formData.get("observed_text"));
  const approvedReplacement = normaliseOptionalIssueText(formData.get("approved_replacement"));
  const parentReviewNote = normaliseOptionalIssueText(formData.get("issue_note"));
  const microSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId || !observedText) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Add the issue you spotted before saving it.",
      ),
    );
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

  const linkedSample = await getLinkedWritingSample(supabase, submission.id, user.id);
  const structuredLessonReviewContext = await getStructuredLessonReviewContext({
    supabase,
    taskId: submission.task_id,
    childId: submission.child_id,
    parentUserId: user.id,
  });

  const existingManualIssueQuery = supabase
    .from("writing_issues")
    .select("id")
    .eq("parent_user_id", user.id)
    .eq("task_submission_id", submission.id)
    .is("source_misspelling_instance_id", null)
    .eq("observed_text", observedText);

  if (approvedReplacement) {
    existingManualIssueQuery.eq("approved_replacement", approvedReplacement);
  } else {
    existingManualIssueQuery.is("approved_replacement", null);
  }

  const { data: existingManualIssue } = await existingManualIssueQuery.maybeSingle();

  if (existingManualIssue) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "That manual writing issue has already been saved.",
      ),
    );
  }

  const matchedLessonField = inferStructuredLessonFieldMatch({
    reviewContext: structuredLessonReviewContext,
    observedText,
    approvedReplacement,
    parentReviewNote,
  });
  const issueLevelParentNote =
    parentReviewNote ?? matchedLessonField?.feedback?.trim() ?? null;

  const { data: suggestion, error: suggestionError } = await supabase
    .from("writing_issue_suggestions")
    .insert({
      child_id: submission.child_id,
      parent_user_id: user.id,
      task_submission_id: submission.id,
      writing_sample_id: linkedSample?.id ?? null,
      source_type: "parent_manual",
      suggestion_status: "accepted",
      observed_text: observedText,
      suggested_replacement: approvedReplacement,
      source_field_key: matchedLessonField?.key ?? null,
      suggested_micro_skill_key: microSkillKey,
      notes: issueLevelParentNote,
      resolved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (suggestionError || !suggestion) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't prepare that manual issue just yet.",
      ),
    );
  }

  const { error } = await supabase.from("writing_issues").insert({
    child_id: submission.child_id,
    parent_user_id: user.id,
    task_submission_id: submission.id,
    writing_sample_id: linkedSample?.id ?? null,
    source_suggestion_id: suggestion.id,
    issue_status: "pending_parent_review",
    final_classification: null,
    observed_text: observedText,
    suggested_replacement: approvedReplacement,
    approved_replacement: approvedReplacement,
    source_field_key: matchedLessonField?.key ?? null,
    micro_skill_key: microSkillKey,
    parent_review_note: issueLevelParentNote,
    parent_marked_at: new Date().toISOString(),
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't save that manual writing issue just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Manual writing issue saved for targeted writing practice.",
    ),
  );
}

export async function deleteSubmissionFromReview(formData: FormData) {
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

  redirect(
    buildRedirectWithMessage(
      "/courses/review",
      "saved",
      "Submission deleted.",
    ),
  );
}

export async function confirmSubmissionPositiveEvidence(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionId = formData.get("suggestion_id");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof suggestionId !== "string" ||
    !suggestionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that transfer evidence to confirm.",
      ),
    );
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

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    suggestionIds: [suggestionId],
    surface: "review_detail",
    maxConfirmCount: 1,
  });

  revalidateReviewDetailAndInsights(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? summary.promotedLevel5Count > 0 || summary.promotedLevel4Count > 0
          ? "Transfer evidence confirmed. This strengthens the mini-skill record with real-writing evidence."
          : "Transfer evidence confirmed."
        : "That transfer evidence could not be confirmed from this review signal.",
    ),
  );
}

export async function bulkConfirmSubmissionPositiveEvidence(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionIds = parseSuggestionIdsFromFormData(formData);

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId || suggestionIds.length === 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Select at least one watchout before confirming.",
      ),
    );
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

  const summary = await confirmPositiveEvidenceSuggestions({
    supabase,
    parentUserId: user.id,
    childId: submission.child_id,
    suggestionIds,
    surface: "review_detail",
    maxConfirmCount: 5,
  });

  revalidateReviewDetailAndInsights(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      summary.confirmedCount > 0 ? "saved" : "error",
      summary.confirmedCount > 0
        ? `Confirmed ${summary.confirmedCount} transfer match${
            summary.confirmedCount === 1 ? "" : "es"
          }.`
        : "No eligible transfer matches were ready to confirm.",
    ),
  );
}

async function dismissSubmissionHelperSuggestions(input: {
  parentUserId: string;
  redirectPath: string;
  submissionId: string;
  suggestionIds: string[];
}) {
  const { supabase, submission } = await getOwnedSubmission(
    input.submissionId,
    input.parentUserId,
  );

  if (!submission) {
    redirect(
      buildRedirectWithMessage(
        input.redirectPath,
        "error",
        "That submission no longer exists.",
      ),
    );
  }

  const nowIso = new Date().toISOString();
  const { data: dismissedRows, error } = await supabase
    .from("writing_issue_suggestions")
    .update({
      suggestion_status: "rejected",
      rejected_at: nowIso,
      resolved_at: nowIso,
    })
    .eq("parent_user_id", input.parentUserId)
    .eq("task_submission_id", input.submissionId)
    .in("id", input.suggestionIds)
    .in("source_type", ["historic_mistake", "micro_skill_watchlist", "transfer_failure_watchlist"])
    .eq("suggestion_status", "pending")
    .select("id");

  if (error) {
    redirect(
      buildRedirectWithMessage(
        input.redirectPath,
        "error",
        "We couldn't dismiss those watchouts just yet.",
      ),
    );
  }

  revalidateReviewDetailAndInsights(input.redirectPath);
  const dismissedCount = dismissedRows?.length ?? 0;

  redirect(
    buildRedirectWithMessage(
      input.redirectPath,
      dismissedCount > 0 ? "saved" : "error",
      dismissedCount > 0
        ? `Dismissed ${dismissedCount} watchout${dismissedCount === 1 ? "" : "s"}.`
        : "No pending watchouts were ready to dismiss.",
    ),
  );
}

export async function dismissSubmissionPositiveEvidence(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionId = formData.get("suggestion_id");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof suggestionId !== "string" ||
    !suggestionId
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that watchout to dismiss.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await dismissSubmissionHelperSuggestions({
    parentUserId: user.id,
    redirectPath: safeRedirectPath,
    submissionId,
    suggestionIds: [suggestionId],
  });
}

export async function bulkDismissSubmissionPositiveEvidence(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const redirectPath = formData.get("redirect_path");
  const suggestionIds = parseSuggestionIdsFromFormData(formData);

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof submissionId !== "string" || !submissionId || suggestionIds.length === 0) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "Select at least one watchout before dismissing.",
      ),
    );
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await dismissSubmissionHelperSuggestions({
    parentUserId: user.id,
    redirectPath: safeRedirectPath,
    submissionId,
    suggestionIds,
  });
}

export async function finaliseWritingIssueClassification(formData: FormData) {
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

  // Slice 7C guard: canonical finalisation stays inside the
  // writing_issues -> learning_items boundary and does not write queue/runtime
  // tables such as older assignment/runtime compatibility surfaces.
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

export async function returnSubmissionToChild(formData: FormData) {
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

  const { data: linkedWritingIssues } = await supabase
    .from("writing_issues")
    .select(
      "id, issue_status, observed_text, approved_replacement, parent_review_note, source_field_key, context_text, position_start, position_end, source_misspelling_instance_id, final_classification",
    )
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .is("final_classification", null)
    .neq("issue_status", "finalised")
    .order("created_at", { ascending: true });

  const issuesToSendBack = (linkedWritingIssues ?? []).filter(
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

  const mergedDraftPayload =
    existingDraft?.draft_payload &&
    typeof existingDraft.draft_payload === "object" &&
    !Array.isArray(existingDraft.draft_payload)
      ? {
          ...(existingDraft.draft_payload as Record<string, unknown>),
          __field_feedback: safeFieldFeedback,
          __writing_issue_feedback: returnedIssuePayload,
        }
      : {
          __field_feedback: safeFieldFeedback,
          __writing_issue_feedback: returnedIssuePayload,
        };

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

  await supabase
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

  revalidateReviewQueueAndDetail(safeRedirectPath);
  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/learn/week");

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Sent back to child.",
    ),
  );
}

export async function approveSubmissionReview(formData: FormData) {
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
            .select("id, misspelled_word, corrected_word, suggested_word, is_false_positive")
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

  await supabase
    .from("task_submission_drafts")
    .delete()
    .eq("task_id", submission.task_id)
    .eq("child_id", submission.child_id)
    .eq("parent_user_id", user.id);

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

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Submission approved.",
    ),
  );
}
