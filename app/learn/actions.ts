"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { replaceAnalysisForSample } from "@/app/analyse/analysis";
import { getMonthlyCompletedTotal } from "@/lib/courses/progress";
import {
  maybeAwardTaskCompletionCoins,
  maybeAwardTaskTargetCoins,
} from "@/lib/rewards/task-coins";
import { createClient } from "@/lib/supabase/server";

function getRedirectPath(formData: FormData, fallbackPath: string) {
  const redirectPath = formData.get("redirect_path");
  return typeof redirectPath === "string" && redirectPath ? redirectPath : fallbackPath;
}

function buildRedirectWithMessage(
  path: string,
  key: "error" | "saved",
  value: string,
  rewardCoins?: number,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  if (rewardCoins && rewardCoins > 0) {
    searchParams.set("reward_coins", String(rewardCoins));
  } else {
    searchParams.delete("reward_coins");
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
  return getStartOfWeek(new Date()).toISOString().slice(0, 10);
}

async function awardCourseCheckInIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentUserId: string,
  childId: string,
  hadCourseLogTodayBeforeSave: boolean,
) {
  if (hadCourseLogTodayBeforeSave) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: child }, { data: practiceRewardToday }] = await Promise.all([
    supabase
      .from("children")
      .select("id, gold_coin_balance")
      .eq("id", childId)
      .eq("parent_user_id", parentUserId)
      .maybeSingle(),
    supabase
      .from("daily_assignments")
      .select("id")
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId)
      .eq("assignment_date", today)
      .eq("gold_coin_awarded", true)
      .maybeSingle(),
  ]);

  if (!child || practiceRewardToday) {
    return;
  }

  const nextGoldCoinCount = (child.gold_coin_balance ?? 0) + 1;

  await supabase
    .from("children")
    .update({
      gold_coin_balance: nextGoldCoinCount,
    })
    .eq("id", childId)
    .eq("parent_user_id", parentUserId);

  await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: parentUserId,
    event_type: "earned_daily",
    amount: 1,
    source: "course_check_in",
    related_entity_type: "daily_check_in",
    notes: "Daily Gold Coin earned from meaningful course logging.",
  });
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
    .select("id, course_id, title, task_type, monthly_goal_total, gold_bar_rule, gold_coin_reward_amount")
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
    safeQuantityCompleted > 500
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Enter a number between 1 and 500."));
  }

  const today = new Date().toISOString().slice(0, 10);
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

  const { data: savedCompletion, error } = await supabase.from("task_completions").upsert(
    {
      task_id: taskId,
      course_id: courseId,
      child_id: childId,
      parent_user_id: user.id,
      completion_date: targetCompletionDate,
      quantity_completed:
        task.task_type === "recurring_daily" || task.task_type === "recurring_weekly"
          ? safeQuantityCompleted
          : 1,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "task_id,child_id,completion_date" },
  ).select("id, task_id, completion_date, quantity_completed").single();

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
    const monthKey = targetCompletionDate.slice(0, 7);
    const { data: monthlyRows } = await supabase
      .from("task_completions")
      .select("task_id, completion_date, quantity_completed")
      .eq("task_id", taskId)
      .eq("child_id", childId)
      .eq("parent_user_id", user.id);

    awardedTargetCoins = await maybeAwardTaskTargetCoins({
      supabase,
      parentUserId: user.id,
      childId,
      task,
      monthKey,
      monthlyCompletedTotal: getMonthlyCompletedTotal(taskId, monthlyRows ?? [], monthKey),
    });
  }

  if (targetCompletionDate === today) {
    await awardCourseCheckInIfNeeded(supabase, user.id, childId, hadCourseLogTodayBeforeSave);
  }

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  const rewardCoins = awardedCompletionCoins || awardedTargetCoins
    ? task.gold_coin_reward_amount ?? 0
    : 0;

  redirect(buildRedirectWithMessage(redirectPath, "saved", "completion", rewardCoins));
}

export async function submitTaskResponse(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/learn");
  const taskId = formData.get("task_id");
  const courseId = formData.get("course_id");
  const childId = formData.get("child_id");
  const submissionText = formData.get("submission_text");
  const lessonReviewSummary = formData.get("lesson_review_summary");
  const selectedOptions = formData
    .getAll("selected_options")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const safeSubmissionText =
    typeof submissionText === "string" ? submissionText.trim() : "";
  const safeLessonReviewSummary =
    typeof lessonReviewSummary === "string" ? lessonReviewSummary.trim() : "";

  if (
    typeof taskId !== "string" ||
    !taskId ||
    typeof courseId !== "string" ||
    !courseId ||
    typeof childId !== "string" ||
    !childId ||
    (!safeSubmissionText && selectedOptions.length === 0)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please write something before submitting."));
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

  if (task.task_type !== "lesson" && task.task_type !== "test") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "That task does not accept writing submissions."));
  }

  const today = new Date().toISOString().slice(0, 10);
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

  const { data: insertedSubmission, error } = await supabase.from("task_submissions").insert({
    task_id: taskId,
    course_id: courseId,
    child_id: childId,
    parent_user_id: user.id,
    submission_text: combinedSubmissionText,
    submitted_at: new Date().toISOString(),
    parent_review_status: "pending",
    parent_review_note: null,
    parent_reviewed_at: null,
  }).select("id, child_id, submission_text, submitted_at").single();

  if (error || !insertedSubmission) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't save that writing just yet."));
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

  if (safeSubmissionText) {
    const writtenAt = insertedSubmission.submitted_at.slice(0, 10);
    const { data: insertedSample, error: sampleError } = await supabase
      .from("writing_samples")
      .insert({
        child_id: childId,
        parent_user_id: user.id,
        title: task.task_type === "test" ? "Test submission" : "Lesson submission",
        sample_text: safeSubmissionText,
        source: "Course task submission",
        written_at: writtenAt,
        task_submission_id: insertedSubmission.id,
      })
      .select("id, child_id, sample_text")
      .single();

    if (insertedSample && !sampleError) {
      await replaceAnalysisForSample(supabase, insertedSample, user.id);
      revalidatePath("/analyse");
    }
  }

  await awardCourseCheckInIfNeeded(supabase, user.id, childId, hadCourseLogTodayBeforeSave);

  revalidatePath("/learn");
  revalidatePath("/learn/week");
  revalidatePath("/dashboard");
  revalidatePath("/insights");
  revalidatePath("/courses/review");
  redirect(buildRedirectWithMessage(redirectPath, "saved", "submission"));
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
