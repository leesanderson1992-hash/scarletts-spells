"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getDateOnly,
  getEndOfWeekDateOnly,
  getRecurringTaskProgressSummary,
  getRecurringTaskCompletionForDate,
  getStartOfWeekDateOnly,
  isTaskCompleteForProgress,
} from "@/lib/courses/progress";
import { buildSpellcheckSourceText } from "@/lib/courses/spelling-analysis-text";
import {
  buildStructuredLessonResponse,
  buildStructuredLessonResponseFromFlatSubmission,
  getReturnedWritingIssueFeedback,
  getStructuredLessonResponseFromPayload,
  hasMeaningfulStructuredLessonResponse,
  normaliseLessonDraftPayload,
  type ReturnedWritingIssueDraftPayload,
  withStructuredLessonResponse,
} from "@/lib/lessons/responses";
import { persistStructuredSubmissionPayload } from "@/lib/lessons/persistence/submission-payloads";
import {
  maybeAwardDailyCheckInCoins,
  maybeAwardMilestoneCoins,
  maybeAwardTaskCompletionCoins,
  maybeAwardTaskTargetCoins,
} from "@/lib/rewards/course-coins";
import { replaceAnalysisForSample } from "@/lib/writing-engine/spelling/legacy-analysis";
import { createClient } from "@/lib/supabase/server";
function getRedirectPath(formData: FormData, fallbackPath: string) {
  const redirectPath = formData.get("redirect_path");
  return typeof redirectPath === "string" && redirectPath ? redirectPath : fallbackPath;
}

function getPathnameOnly(path: string) {
  return path.split("?")[0] || path;
}

function revalidateLearnSurfacePaths(redirectPath: string) {
  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath(getPathnameOnly(redirectPath));
}

function buildRedirectWithMessage(
  path: string,
  key: "error" | "saved",
  value: string,
  rewardCoins?: number,
  focusNearRewardCoins?: number,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  if (rewardCoins && rewardCoins > 0) {
    searchParams.set("reward_coins", String(rewardCoins));
  } else {
    searchParams.delete("reward_coins");
  }
  if (focusNearRewardCoins && focusNearRewardCoins > 0) {
    searchParams.set("focus_near_reward_coins", String(focusNearRewardCoins));
  } else {
    searchParams.delete("focus_near_reward_coins");
  }
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

function getStartOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getCurrentWeekStartDate() {
  return getDateOnly(getStartOfWeek(new Date()));
}

function parseDraftPayloadValue(draftPayload: FormDataEntryValue | null) {
  return typeof draftPayload === "string" && draftPayload.trim()
    ? (() => {
        try {
          return normaliseLessonDraftPayload(JSON.parse(draftPayload));
        } catch {
          return undefined;
        }
      })()
    : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applyReturnedIssueInputsFromFormData(
  formData: FormData,
  issues: ReturnedWritingIssueDraftPayload[],
) {
  return issues.map((issue) => {
    const markedFixed = formData.get(`returned_issue_fixed:${issue.issue_id}`) === "true";
    const reflectionValue = formData.get(`returned_issue_reflection:${issue.issue_id}`);
    const attemptedCorrectionValue = formData.get(`returned_issue_attempt:${issue.issue_id}`);
    const attemptedCorrection =
      typeof attemptedCorrectionValue === "string" &&
      attemptedCorrectionValue.trim().length > 0
        ? attemptedCorrectionValue.trim().slice(0, 500)
        : issue.attempted_correction ?? null;
    const reflection =
      issue.allow_confidence &&
      (reflectionValue === "easy" ||
        reflectionValue === "medium" ||
        reflectionValue === "hard")
        ? reflectionValue
        : issue.reflection;

    return {
      ...issue,
      marked_fixed: markedFixed,
      reflection,
      attempted_correction: attemptedCorrection,
    };
  });
}

function mergePreservedDraftMetadata(
  nextPayloadValue: unknown,
  existingPayloadValue: unknown,
) {
  const nextPayload = normaliseLessonDraftPayload(nextPayloadValue);
  const existingPayload = normaliseLessonDraftPayload(existingPayloadValue);

  const mergedPayload: Record<string, unknown> = {
    ...existingPayload,
    ...nextPayload,
  };

  if (!Object.prototype.hasOwnProperty.call(nextPayload, "__field_feedback")) {
    if (Object.prototype.hasOwnProperty.call(existingPayload, "__field_feedback")) {
      mergedPayload.__field_feedback = existingPayload.__field_feedback;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(nextPayload, "__writing_issue_feedback")) {
    if (Object.prototype.hasOwnProperty.call(existingPayload, "__writing_issue_feedback")) {
      mergedPayload.__writing_issue_feedback =
        existingPayload.__writing_issue_feedback;
    }
  }

  return mergedPayload;
}

function stringifyAttemptedCorrectionValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    return JSON.stringify(value);
  }

  if (isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return null;
}

function buildAttemptedCorrectionForIssue({
  issue,
  draftPayload,
  safeSubmissionText,
}: {
  issue: ReturnedWritingIssueDraftPayload;
  draftPayload: Record<string, unknown> | undefined;
  safeSubmissionText: string;
}) {
  if (issue.attempted_correction?.trim()) {
    return issue.attempted_correction.trim();
  }

  if (
    issue.source_field_key &&
    draftPayload &&
    Object.prototype.hasOwnProperty.call(draftPayload, issue.source_field_key)
  ) {
    return stringifyAttemptedCorrectionValue(draftPayload[issue.source_field_key]);
  }

  if (safeSubmissionText.trim().length > 0) {
    return safeSubmissionText.trim();
  }

  const structuredResponse = getStructuredLessonResponseFromPayload(draftPayload);
  if (!structuredResponse) {
    return issue.marked_fixed ? "Child marked this returned issue as fixed." : null;
  }

  const matchingAnswer = structuredResponse.answers.find(
    (answer) => answer.block_id === issue.source_field_key,
  );

  if (matchingAnswer) {
    return stringifyAttemptedCorrectionValue(matchingAnswer.value);
  }

  return issue.marked_fixed ? "Child marked this returned issue as fixed." : null;
}

export async function completeCourseTask(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const quantityCompleted = formData.get("quantity_completed");
  const completionDate = formData.get("completion_date");

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that task completion."));
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, course_id, focus_block_id, title, task_type, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  const safeQuantityCompleted =
    typeof quantityCompleted === "string" && quantityCompleted.trim()
      ? Number(quantityCompleted)
      : 1;

  if (
    !Number.isInteger(safeQuantityCompleted) ||
    safeQuantityCompleted < 1 ||
    safeQuantityCompleted > 10000
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Enter a number between 1 and 10000."));
  }

  const today = getDateOnly();
  const targetCompletionDate =
    typeof completionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(completionDate)
      ? completionDate
      : today;
  const [{ count: completionCount }, { count: submissionCount }] = await Promise.all([
    supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .eq("completion_date", today),
    supabase
      .from("task_submissions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .gte("submitted_at", `${today}T00:00:00`)
      .lt("submitted_at", `${today}T23:59:59.999`),
  ]);
  const hadCourseLogTodayBeforeSave = (completionCount ?? 0) > 0 || (submissionCount ?? 0) > 0;

  const isRecurringTask =
    task.task_type === "recurring_daily" || task.task_type === "recurring_weekly";
  const recurringWindowQuery =
    task.task_type === "recurring_daily"
      ? supabase
          .from("task_completions")
          .select("id, task_id, completion_date, quantity_completed")
          .eq("task_id", taskId)
          .eq("child_id", childId)
          .eq("parent_user_id", user.id)
          .eq("completion_date", targetCompletionDate)
      : task.task_type === "recurring_weekly"
        ? supabase
            .from("task_completions")
            .select("id, task_id, completion_date, quantity_completed")
            .eq("task_id", taskId)
            .eq("child_id", childId)
            .eq("parent_user_id", user.id)
            .gte("completion_date", getStartOfWeekDateOnly(targetCompletionDate))
            .lte("completion_date", getEndOfWeekDateOnly(targetCompletionDate))
        : null;
  const recurringRows =
    recurringWindowQuery ? ((await recurringWindowQuery).data ?? []) : [];
  const existingRecurringCompletion = isRecurringTask
    ? getRecurringTaskCompletionForDate(task, recurringRows, targetCompletionDate)
    : null;
  const recurringQuantity =
    existingRecurringCompletion && isRecurringTask
      ? (existingRecurringCompletion.quantity_completed ?? 0) + safeQuantityCompleted
      : safeQuantityCompleted;
  const completionRecordDate =
    task.task_type === "recurring_weekly"
      ? targetCompletionDate
      : existingRecurringCompletion?.completion_date ?? targetCompletionDate;

  const completionPayload = {
    task_id: taskId,
    course_id: courseId,
    child_id: childId,
    parent_user_id: user.id,
    completion_date: completionRecordDate,
    quantity_completed: isRecurringTask ? recurringQuantity : 1,
    completed_at: new Date().toISOString(),
  };

  const completionWrite = existingRecurringCompletion
    ? supabase
        .from("task_completions")
        .update(completionPayload)
        .eq("id", existingRecurringCompletion.id)
    : supabase.from("task_completions").insert(completionPayload);

  const { data: savedCompletion, error } = await completionWrite
    .select("id, task_id, completion_date, quantity_completed")
    .single();

  if (error || !savedCompletion) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that task completion."));
  }

  const awardedCompletionCoins = await maybeAwardTaskCompletionCoins({
    supabase,
    parentUserId: user.id,
    childId,
    task,
    completionId: savedCompletion.id,
  });

  let awardedTargetCoins = false;
  if (task.monthly_goal_total) {
    const { data: monthlyRows } = await supabase
      .from("task_completions")
      .select("task_id, completion_date, quantity_completed")
      .eq("task_id", taskId)
      .eq("child_id", childId)
      .eq("parent_user_id", user.id);
    const monthlySummary = getRecurringTaskProgressSummary(task, monthlyRows ?? [], {
      windowType: "month",
      referenceDate: targetCompletionDate,
    });

    awardedTargetCoins = await maybeAwardTaskTargetCoins({
      supabase,
      parentUserId: user.id,
      childId,
      task,
      monthKey: targetCompletionDate.slice(0, 7),
      monthlyCompletedTotal: monthlySummary?.windowTotal ?? 0,
    });
  }

  let awardedFocusBlockCoins = false;
  let focusBlockRewardAmount = 0;
  let focusBlockNearRewardAmount = 0;
  if (task.focus_block_id) {
    const [{ data: focusBlock }, { data: linkedTasks }, { data: linkedCompletions }, { data: linkedSubmissions }] =
      await Promise.all([
        supabase
          .from("focus_blocks")
          .select("id, title, gold_coin_reward_amount, coin_reward_trigger, is_active")
          .eq("id", task.focus_block_id)
          .eq("course_id", courseId)
          .eq("parent_user_id", user.id)
          .maybeSingle(),
        supabase
          .from("course_tasks")
          .select("id, title, task_type, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount, is_active")
          .eq("focus_block_id", task.focus_block_id)
          .eq("course_id", courseId)
          .eq("parent_user_id", user.id)
          .order("position", { ascending: true }),
        supabase
          .from("task_completions")
          .select("task_id, completion_date, quantity_completed")
          .eq("course_id", courseId)
          .eq("child_id", childId)
          .eq("parent_user_id", user.id),
        supabase
          .from("task_submissions")
          .select("task_id, parent_review_status")
          .eq("course_id", courseId)
          .eq("child_id", childId)
          .order("submitted_at", { ascending: false }),
      ]);

    const allMiniTasksComplete =
      (linkedTasks ?? []).length > 0 &&
      (linkedTasks ?? []).every((linkedTask) =>
        isTaskCompleteForProgress(linkedTask, linkedCompletions ?? [], linkedSubmissions ?? []),
      );
    const incompleteMiniTaskCount = (linkedTasks ?? []).filter(
      (linkedTask) =>
        !isTaskCompleteForProgress(linkedTask, linkedCompletions ?? [], linkedSubmissions ?? []),
    ).length;

    if (focusBlock?.is_active && allMiniTasksComplete) {
      awardedFocusBlockCoins = await maybeAwardMilestoneCoins({
        supabase,
        parentUserId: user.id,
        childId,
        item: focusBlock,
        eventType: "earned_focus_block",
        source: "focus_block_completion",
        relatedEntityType: "focus_block",
      });
      focusBlockRewardAmount = focusBlock.gold_coin_reward_amount ?? 0;
    } else if (
      focusBlock?.is_active &&
      !awardedFocusBlockCoins &&
      (focusBlock.gold_coin_reward_amount ?? 0) > 0 &&
      focusBlock.coin_reward_trigger === "on_completion" &&
      incompleteMiniTaskCount >= 1
    ) {
      focusBlockNearRewardAmount = focusBlock.gold_coin_reward_amount ?? 0;
    }
  }

  if (targetCompletionDate === today) {
    await maybeAwardDailyCheckInCoins({
      supabase,
      parentUserId: user.id,
      childId,
      hadCourseLogTodayBeforeSave,
      assignmentDate: today,
    });
  }

  revalidateLearnSurfacePaths(redirectPath);
  const rewardCoins = awardedFocusBlockCoins
    ? focusBlockRewardAmount
    : awardedCompletionCoins || awardedTargetCoins
      ? task.gold_coin_reward_amount ?? 0
      : 0;

  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      "completion",
      rewardCoins,
      rewardCoins > 0 ? undefined : focusBlockNearRewardAmount,
    ),
  );
}

export async function submitTaskResponse(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const submissionText = formData.get("submission_text");
  const lessonReviewSummary = formData.get("lesson_review_summary");
  const draftPayload = formData.get("draft_payload");
  const selectedOptions = formData
    .getAll("selected_options")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const safeSubmissionText =
    typeof submissionText === "string" ? submissionText.trim() : "";
  const safeLessonReviewSummary =
    typeof lessonReviewSummary === "string" ? lessonReviewSummary.trim() : "";
  const safeDraftPayload = parseDraftPayloadValue(draftPayload);
  const submittedAt = new Date().toISOString();
  const submittedStructuredResponse = buildStructuredLessonResponse({
    taskId: typeof taskId === "string" ? taskId : "",
    childId: typeof childId === "string" ? childId : "",
    status: "submitted",
    payloadValue: safeDraftPayload,
    submittedAt,
  });

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId ||
    (!safeSubmissionText &&
      selectedOptions.length === 0 &&
      !hasMeaningfulStructuredLessonResponse(submittedStructuredResponse))
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please write something before submitting."));
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type, lesson_schema")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  if (task.task_type !== "lesson" && task.task_type !== "test") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "That task does not accept writing submissions."));
  }

  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!child) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that learner."));
  }

  const structuredResponse = buildStructuredLessonResponse({
    taskId: task.id,
    childId: child.id,
    status: "submitted",
    payloadValue: safeDraftPayload,
    submittedAt,
  });
  const fallbackStructuredResponse =
    hasMeaningfulStructuredLessonResponse(structuredResponse)
      ? null
      : buildStructuredLessonResponseFromFlatSubmission({
          taskId: task.id,
          childId: child.id,
          lessonValue: task.lesson_schema,
          submissionText: safeSubmissionText,
          submittedAt,
        });
  const durableStructuredResponse =
    fallbackStructuredResponse ?? structuredResponse;
  const hasEmbeddedStructuredResponse = Boolean(
    getStructuredLessonResponseFromPayload(safeDraftPayload),
  );
  const shouldPersistStructuredPayload =
    (hasEmbeddedStructuredResponse || Boolean(fallbackStructuredResponse)) &&
    hasMeaningfulStructuredLessonResponse(durableStructuredResponse);

  const [{ data: latestSubmission }, { data: existingDraftRow }] = await Promise.all([
    supabase
      .from("task_submissions")
      .select("id, parent_review_status")
      .eq("task_id", taskId)
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("task_submission_drafts")
      .select("draft_payload")
      .eq("task_id", taskId)
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
  ]);

  const latestDraftPayload = mergePreservedDraftMetadata(
    safeDraftPayload ?? {},
    existingDraftRow?.draft_payload,
  );
  const returnedWritingIssues =
    latestSubmission?.parent_review_status === "returned"
      ? applyReturnedIssueInputsFromFormData(
          formData,
          getReturnedWritingIssueFeedback(latestDraftPayload),
        )
      : [];

  const today = getDateOnly();
  const [{ count: completionCount }, { count: submissionCount }] = await Promise.all([
    supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .eq("completion_date", today),
    supabase
      .from("task_submissions")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId)
      .eq("parent_user_id", user.id)
      .gte("submitted_at", `${today}T00:00:00`)
      .lt("submitted_at", `${today}T23:59:59.999`),
  ]);
  const hadCourseLogTodayBeforeSave = (completionCount ?? 0) > 0 || (submissionCount ?? 0) > 0;

  const combinedSubmissionText =
    safeLessonReviewSummary
      ? [
          "Lesson review summary:",
          safeLessonReviewSummary,
          safeSubmissionText ? "" : null,
          safeSubmissionText ? "Written response:" : null,
          safeSubmissionText || null,
        ]
          .filter((value): value is string => Boolean(value))
          .join("\n")
      : selectedOptions.length > 0
      ? [
          "Selected options:",
          ...selectedOptions.map((option) => `- ${option}`),
          safeSubmissionText ? "" : null,
          safeSubmissionText ? "Written response:" : null,
          safeSubmissionText || null,
        ]
          .filter((value): value is string => Boolean(value))
          .join("\n")
      : safeSubmissionText;
  const persistedDraftPayload = mergePreservedDraftMetadata(
    withStructuredLessonResponse(latestDraftPayload, structuredResponse),
    existingDraftRow?.draft_payload,
  );

  const { data: insertedSubmission, error } = await supabase.from("task_submissions").insert({
    task_id: task.id,
    course_id: task.course_id,
    child_id: child.id,
    parent_user_id: user.id,
    submission_text: combinedSubmissionText,
    submitted_at: submittedAt,
    parent_review_status: "pending",
    parent_review_note: null,
    parent_reviewed_at: null,
  }).select("id, child_id, submission_text, submitted_at").single();

  if (error || !insertedSubmission) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that writing just yet."));
  }

  if (shouldPersistStructuredPayload) {
    const payloadResult = await persistStructuredSubmissionPayload({
      submissionId: insertedSubmission.id,
      parentUserId: user.id,
      courseId: task.course_id,
      taskId: task.id,
      childId: child.id,
      taskType: task.task_type,
      structuredResponse: durableStructuredResponse,
    });

    if (!payloadResult.ok) {
      await supabase
        .from("task_submissions")
        .delete()
        .eq("id", insertedSubmission.id)
        .eq("parent_user_id", user.id);

      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          "We couldn't safely save your structured answers just yet. Please try again.",
        ),
      );
    }
  }

  const { error: completionError } = await supabase.from("task_completions").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      completion_date: today,
      quantity_completed: 1,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id,completion_date" },
  );

  if (completionError) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Your writing was saved, but the lesson could not be marked as done."));
  }

  const spellcheckSourceText = buildSpellcheckSourceText({
    draftPayload: persistedDraftPayload,
    submissionText: safeSubmissionText,
  });

  if (spellcheckSourceText) {
    const writtenAt = insertedSubmission.submitted_at.slice(0, 10);
    const { data: insertedSample, error: sampleError } = await supabase
      .from("writing_samples")
      .insert({
        child_id: childId,
        parent_user_id: user.id,
        title: task.task_type === "test" ? "Test submission" : "Lesson submission",
        sample_text: spellcheckSourceText,
        source: "Course task submission",
        written_at: writtenAt,
        task_submission_id: insertedSubmission.id,
      })
      .select("id, child_id, sample_text")
      .single();

    if (insertedSample && !sampleError) {
      await replaceAnalysisForSample(supabase, insertedSample, user.id);
    }
  }

  if (returnedWritingIssues.length > 0) {
    const returnedIssueIds = returnedWritingIssues.map((issue) => issue.issue_id);
    const { data: sentBackIssues } = await supabase
      .from("writing_issues")
      .select("id")
      .eq("parent_user_id", user.id)
      .eq("child_id", childId)
      .in("id", returnedIssueIds)
      .eq("issue_status", "sent_back_to_child");

    const sentBackIssueIds = new Set((sentBackIssues ?? []).map((issue) => issue.id));
    const issuesToRecord = returnedWritingIssues.filter((issue) =>
      sentBackIssueIds.has(issue.issue_id),
    );

    if (issuesToRecord.length > 0) {
      const attemptRows = issuesToRecord.map((issue) => ({
        writing_issue_id: issue.issue_id,
        child_id: childId,
        parent_user_id: user.id,
        task_submission_id: insertedSubmission.id,
        attempted_correction: buildAttemptedCorrectionForIssue({
          issue,
          draftPayload: latestDraftPayload,
          safeSubmissionText,
        }),
        attempt_notes: null,
        corrected_independently: true,
        reflection: issue.reflection ?? "medium",
        metadata: {
          source_field_key: issue.source_field_key,
          allow_confidence: issue.allow_confidence,
          marked_fixed: issue.marked_fixed ?? false,
          reflection_source: issue.reflection ? "child_input" : "slice4a_default",
        },
      }));

      const { error: attemptInsertError } = await supabase
        .from("writing_issue_correction_attempts")
        .insert(attemptRows);

      if (attemptInsertError) {
        redirect(
          buildRedirectWithMessage(
            redirectPath,
            "error",
            "Your work was saved, but the correction attempt history could not be linked yet.",
          ),
        );
      }

      const { error: issueUpdateError } = await supabase
        .from("writing_issues")
        .update({
          issue_status: "child_responded",
          child_responded_at: new Date().toISOString(),
        })
        .in(
          "id",
          issuesToRecord.map((issue) => issue.issue_id),
        )
        .eq("parent_user_id", user.id);

      if (issueUpdateError) {
        redirect(
          buildRedirectWithMessage(
            redirectPath,
            "error",
            "Your work was saved, but the returned writing issues could not be updated yet.",
          ),
        );
      }
    }
  }

  await supabase.from("task_submission_drafts").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      draft_text: safeSubmissionText,
      draft_review_summary: safeLessonReviewSummary,
      draft_payload: mergePreservedDraftMetadata(
        {
          ...persistedDraftPayload,
          __writing_issue_feedback: returnedWritingIssues,
        },
        existingDraftRow?.draft_payload,
      ),
    },
    { onConflict: "task_id,child_id" },
  );

  await maybeAwardDailyCheckInCoins({
    supabase,
    parentUserId: user.id,
    childId,
    hadCourseLogTodayBeforeSave,
  });

  revalidateLearnSurfacePaths(redirectPath);
  revalidatePath("/courses/review");
  redirect(buildRedirectWithMessage(redirectPath, "saved", "submission"));
}

export async function saveTaskDraft(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const submissionText = formData.get("submission_text");
  const lessonReviewSummary = formData.get("lesson_review_summary");
  const draftPayload = formData.get("draft_payload");

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that draft."));
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task || (task.task_type !== "lesson" && task.task_type !== "test")) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "That task does not accept drafts."));
  }

  const { data: existingDraftRow } = await supabase
    .from("task_submission_drafts")
    .select("draft_payload")
    .eq("task_id", taskId)
    .eq("child_id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const safeSubmissionText =
    typeof submissionText === "string" ? submissionText.trim() : "";
  const safeLessonReviewSummary =
    typeof lessonReviewSummary === "string" ? lessonReviewSummary.trim() : "";
  const safeDraftPayload = parseDraftPayloadValue(draftPayload) ?? {};
  const persistedDraftPayload = mergePreservedDraftMetadata(
    withStructuredLessonResponse(
      safeDraftPayload,
      buildStructuredLessonResponse({
        taskId,
        childId,
        status: "draft",
        payloadValue: safeDraftPayload,
      }),
    ),
    existingDraftRow?.draft_payload,
  );
  const returnedWritingIssues = applyReturnedIssueInputsFromFormData(
    formData,
    getReturnedWritingIssueFeedback(persistedDraftPayload),
  );
  const draftPayloadWithReturnedIssueInputs =
    returnedWritingIssues.length > 0
      ? mergePreservedDraftMetadata(
          {
            ...persistedDraftPayload,
            __writing_issue_feedback: returnedWritingIssues,
          },
          existingDraftRow?.draft_payload,
        )
      : persistedDraftPayload;

  const { error } = await supabase.from("task_submission_drafts").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      draft_text: safeSubmissionText,
      draft_review_summary: safeLessonReviewSummary || null,
      draft_payload: draftPayloadWithReturnedIssueInputs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id" },
  );

  if (error) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that draft."));
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/dashboard");
  redirect(buildRedirectWithMessage(redirectPath, "saved", "draft"));
}

export async function saveTaskDraftSilently(formData: FormData) {
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const submissionText = formData.get("submission_text");
  const lessonReviewSummary = formData.get("lesson_review_summary");
  const draftPayload = formData.get("draft_payload");

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId
  ) {
    return { ok: false, error: "missing-identifiers" };
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return { ok: false, error: "not-authenticated" };
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task || (task.task_type !== "lesson" && task.task_type !== "test")) {
    return { ok: false, error: "invalid-task" };
  }

  const { data: existingDraftRow } = await supabase
    .from("task_submission_drafts")
    .select("draft_payload")
    .eq("task_id", taskId)
    .eq("child_id", childId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const safeSubmissionText =
    typeof submissionText === "string" ? submissionText.trim() : "";
  const safeLessonReviewSummary =
    typeof lessonReviewSummary === "string" ? lessonReviewSummary.trim() : "";
  const safeDraftPayload = parseDraftPayloadValue(draftPayload) ?? {};
  const persistedDraftPayload = mergePreservedDraftMetadata(
    withStructuredLessonResponse(
      safeDraftPayload,
      buildStructuredLessonResponse({
        taskId,
        childId,
        status: "draft",
        payloadValue: safeDraftPayload,
      }),
    ),
    existingDraftRow?.draft_payload,
  );

  const { error } = await supabase.from("task_submission_drafts").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      draft_text: safeSubmissionText,
      draft_review_summary: safeLessonReviewSummary || null,
      draft_payload: persistedDraftPayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id" },
  );

  if (error) {
    return { ok: false, error: "save-failed" };
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function moveTaskToDayPlan(input: {
  taskId: string;
  courseId: string;
  childId: string;
  weekStartDate: string;
  plannedDate: string;
}) {
  const { taskId, courseId, childId, weekStartDate, plannedDate } = input;
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return { ok: false, error: "Please log in again." };
  }

  if (
    !taskId ||
    !courseId ||
    !childId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)
  ) {
    return { ok: false, error: "We couldn't place that task on the week." };
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, task_type, course_id")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    return { ok: false, error: "We couldn't find that task." };
  }

  if (task.task_type === "recurring_daily") {
    return { ok: false, error: "Daily tasks already appear each day automatically." };
  }

  const { error } = await supabase.from("task_day_plans").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      week_start_date: weekStartDate,
      planned_date: plannedDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id,week_start_date" },
  );

  if (error) {
    return { ok: false, error: "We couldn't save that task into the week just yet." };
  }

  await supabase.from("task_week_selections").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      week_start_date: weekStartDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id,week_start_date" },
  );

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  return { ok: true };
}

export async function addTaskToWeekSelection(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't add that to your week."));
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type")
    .eq("id", taskId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  if (task.task_type === "recurring_daily") {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "already in your week"));
  }

  const weekStartDate = getCurrentWeekStartDate();
  const { error } = await supabase.from("task_week_selections").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      week_start_date: weekStartDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id,week_start_date" },
  );

  if (error) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't add that to your week."));
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  redirect(buildRedirectWithMessage(redirectPath, "saved", "added to your week"));
}

export async function addTasksToWeekSelection(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const taskIds = Array.from(
    new Set(
      formData
        .getAll("task_ids")
        .map((value) => (typeof value === "string" ? value : ""))
        .filter(Boolean),
    ),
  );

  if (
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId ||
    taskIds.length === 0
  ) {
    redirect(
      buildRedirectWithMessage(redirectPath, "error", "Choose at least one task to add to your week."),
    );
  }

  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const { data: tasks } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type")
    .in("id", taskIds)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id);

  if (!tasks || tasks.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find those tasks."));
  }

  const selectableTasks = tasks.filter((task) => task.task_type !== "recurring_daily");

  if (selectableTasks.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "already in your week"));
  }

  const weekStartDate = getCurrentWeekStartDate();
  const timestamp = new Date().toISOString();
  const { error } = await supabase.from("task_week_selections").upsert(
    selectableTasks.map((task) => ({
      task_id: task.id,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      week_start_date: weekStartDate,
      updated_at: timestamp,
    })),
    { onConflict: "task_id,child_id,week_start_date" },
  );

  if (error) {
    redirect(
      buildRedirectWithMessage(redirectPath, "error", "We couldn't add those tasks to your week."),
    );
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      selectableTasks.length === 1 ? "added to your week" : `${selectableTasks.length} tasks added to your week`,
    ),
  );
}

export async function clearTaskDayPlan(input: {
  taskId: string;
  childId: string;
  weekStartDate: string;
}) {
  const { taskId, childId, weekStartDate } = input;
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return { ok: false, error: "Please log in again." };
  }

  if (!taskId || !childId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return { ok: false, error: "We couldn't move that task back into the week bank." };
  }

  const { error } = await supabase
    .from("task_day_plans")
    .delete()
    .eq("task_id", taskId)
    .eq("child_id", childId)
    .eq("week_start_date", weekStartDate)
    .eq("parent_user_id", user.id);

  if (error) {
    return { ok: false, error: "We couldn't move that task back into the week bank." };
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  return { ok: true };
}
