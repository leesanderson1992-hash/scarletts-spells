import { extractReviewableLessonFields } from "@/lib/lessons/review";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ReviewSupabase = Awaited<ReturnType<typeof createClient>>;

export function buildRedirectWithMessage(
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

export function getPathnameOnly(path: string) {
  return path.split("?")[0] ?? path;
}

export function revalidateReviewQueueAndDetail(redirectPath: string) {
  revalidatePath("/courses/review");
  revalidatePath(getPathnameOnly(redirectPath));
}

export function revalidateReviewQueueAndDetailBestEffort(redirectPath: string) {
  try {
    revalidateReviewQueueAndDetail(redirectPath);
  } catch (error) {
    console.error("Review Work revalidation failed after parent verification.", error);
  }
}

export function revalidateReviewDetailAndInsights(redirectPath: string) {
  revalidatePath(getPathnameOnly(redirectPath));
  revalidatePath("/insights");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findWordRange(text: string, word: string) {
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

export async function getOwnedSubmission(
  submissionId: string,
  userId: string,
  suppliedSupabase?: ReviewSupabase,
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

export async function getLinkedWritingSample(
  supabase: ReviewSupabase,
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

export async function getOwnedManualWritingSample(
  supabase: ReviewSupabase,
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

export function normaliseIssueText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export function normaliseOptionalIssueText(value: FormDataEntryValue | null) {
  const normalised = normaliseIssueText(value);
  return normalised.length > 0 ? normalised : null;
}

export function normaliseMicroSkillKey(value: FormDataEntryValue | null) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  return rawValue.length > 0 ? rawValue.slice(0, 120) : "unknown";
}

export function normaliseStage7dDecision(
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

export function normaliseStage7dOverrideField(
  value: FormDataEntryValue | null,
  maxLength = 120,
) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  return rawValue.length > 0 ? rawValue.slice(0, maxLength) : null;
}

export function parseSuggestionIdsFromFormData(formData: FormData) {
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

export function looksLikeWordIssue(
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

export type StructuredLessonReviewContext = {
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
};

export type StructuredLessonFieldMatch =
  StructuredLessonReviewContext["reviewableFields"][number];

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

export async function getStructuredLessonReviewContext({
  supabase,
  taskId,
  childId,
  parentUserId,
}: {
  supabase: ReviewSupabase;
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
    task?.lesson_schema &&
    typeof task.lesson_schema === "object" &&
    !Array.isArray(task.lesson_schema)
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

export function inferStructuredLessonFieldMatch({
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
