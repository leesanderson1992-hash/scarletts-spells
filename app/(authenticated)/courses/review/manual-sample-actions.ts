"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { extractReviewableLessonFields } from "@/lib/lessons/review";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { intakeApprovedManualSampleCorrection } from "@/lib/adle/loaders/canonical-intake-live";

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

export async function captureManualSampleSpellingCandidate(formData: FormData) {
  const writingSampleId = formData.get("writing_sample_id");
  const redirectPath = formData.get("redirect_path");
  const observedText = normaliseOptionalIssueText(formData.get("observed_text"));
  const correctText = normaliseOptionalIssueText(formData.get("correct_text"));
  const microSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));
  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof writingSampleId !== "string" || !writingSampleId ||
    !observedText || !correctText || microSkillKey === "unknown") {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error",
      "Enter the child's spelling, its correction, and a spelling micro-skill."));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sample = await getOwnedManualWritingSample(supabase, writingSampleId, user.id);
  if (!sample || sample.task_submission_id || sample.review_completed_at) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error",
      "This manual writing sample is no longer open for spelling review."));
  }

  const { data: candidateMappingId, error } = await supabase.rpc(
    "capture_parent_manual_sample_spelling_candidate",
    {
      p_writing_sample_id: sample.id,
      p_observed_text: observedText,
      p_correct_text: correctText,
      p_micro_skill_key: microSkillKey,
    },
  );
  if (error || typeof candidateMappingId !== "string") {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error",
      error?.message ?? "The reviewed spelling could not be saved."));
  }

  try {
    await intakeApprovedManualSampleCorrection({
      serviceClient: createServiceRoleClient(),
      parentUserId: user.id,
      childId: sample.child_id,
      writingSampleId: sample.id,
      candidateMappingIds: [candidateMappingId],
    });
  } catch (intakeError) {
    console.error("Manual writing sample canonical intake failed", intakeError);
    redirect(buildRedirectWithMessage(safeRedirectPath, "error",
      "The correction was saved. Its lesson eligibility could not be checked yet; retry this same correction."));
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);
  redirect(buildRedirectWithMessage(safeRedirectPath, "saved",
    "Parent-verified spelling saved. Its lesson route is being checked against the approved teaching content."));
}

type StructuredLessonReviewContext = {
  reviewableFields: ReturnType<typeof extractReviewableLessonFields>;
};

type StructuredLessonFieldMatch = StructuredLessonReviewContext["reviewableFields"][number];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

export async function addManualWritingIssue(formData: FormData) {
  const submissionId = formData.get("submission_id");
  const writingSampleId = formData.get("writing_sample_id");
  const redirectPath = formData.get("redirect_path");
  const observedText = normaliseOptionalIssueText(formData.get("observed_text"));
  const approvedReplacement = normaliseOptionalIssueText(formData.get("approved_replacement"));
  const parentReviewNote = normaliseOptionalIssueText(formData.get("issue_note"));
  const microSkillKey = normaliseMicroSkillKey(formData.get("micro_skill_key"));

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (
    (typeof submissionId !== "string" || !submissionId) &&
    (typeof writingSampleId !== "string" || !writingSampleId)
  ) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that review item.",
      ),
    );
  }

  if (!observedText) {
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

  const supabase = await createClient();
  const ownedSubmission =
    typeof submissionId === "string" && submissionId
      ? await getOwnedSubmission(submissionId, user.id, supabase)
      : { supabase, submission: null };
  const submission = ownedSubmission.submission;
  const manualSample =
    !submission && typeof writingSampleId === "string" && writingSampleId
      ? await getOwnedManualWritingSample(supabase, writingSampleId, user.id)
      : null;

  if (!submission && !manualSample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That review item no longer exists.",
      ),
    );
  }

  const linkedSample = submission
    ? await getLinkedWritingSample(supabase, submission.id, user.id)
    : manualSample;
  const structuredLessonReviewContext = submission
    ? await getStructuredLessonReviewContext({
        supabase,
        taskId: submission.task_id,
        childId: submission.child_id,
        parentUserId: user.id,
      })
    : null;
  const childId = submission?.child_id ?? manualSample?.child_id ?? null;

  if (!childId) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't determine which child this review item belongs to.",
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

  if (!linkedSample) {
    redirect(buildRedirectWithMessage(safeRedirectPath, "error",
      "The writing sample for this issue is unavailable."));
  }
  const { error } = await supabase.rpc("save_parent_manual_writing_issue_v1", {
    p_writing_sample_id: linkedSample.id,
    p_task_submission_id: submission?.id ?? null,
    p_observed_text: observedText,
    p_approved_replacement: approvedReplacement,
    p_micro_skill_key: microSkillKey,
    p_note: issueLevelParentNote,
    p_source_field_key: matchedLessonField?.key ?? null,
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

export async function completeManualWritingSampleReview(formData: FormData) {
  const writingSampleId = formData.get("writing_sample_id");
  const redirectPath = formData.get("redirect_path");

  const safeRedirectPath =
    typeof redirectPath === "string" && redirectPath.startsWith("/courses/review/")
      ? redirectPath
      : "/courses/review";

  if (typeof writingSampleId !== "string" || !writingSampleId) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't find that manual writing sample.",
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
  const manualSample = await getOwnedManualWritingSample(
    supabase,
    writingSampleId,
    user.id,
  );

  if (!manualSample) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "That manual writing sample no longer exists.",
      ),
    );
  }

  if (manualSample.task_submission_id) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "This completion action is only available for manual writing samples.",
      ),
    );
  }

  if (manualSample.review_completed_at) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "saved",
        "Manual writing sample already marked complete.",
      ),
    );
  }

  const { error } = await supabase
    .from("writing_samples")
    .update({
      review_completed_at: new Date().toISOString(),
      review_completed_by: user.id,
    })
    .eq("id", manualSample.id)
    .eq("parent_user_id", user.id)
    .is("task_submission_id", null);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        safeRedirectPath,
        "error",
        "We couldn't mark that manual writing sample complete just yet.",
      ),
    );
  }

  revalidateReviewQueueAndDetail(safeRedirectPath);

  redirect(
    buildRedirectWithMessage(
      safeRedirectPath,
      "saved",
      "Manual writing sample marked complete.",
    ),
  );
}
