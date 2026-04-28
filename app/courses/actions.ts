"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildScopedPath } from "@/lib/children";
import { createClient } from "@/lib/supabase/server";

import { COURSE_TASK_TYPES } from "@/lib/courses/types";
import { TASK_GOLD_BAR_RULES } from "@/lib/courses/types";
import { COURSE_STRUCTURE_TYPES } from "@/lib/courses/types";

function getFriendlyCourseDatabaseError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't save that course change just yet.";
  }

  if (
    message.includes('relation "courses" does not exist') ||
    message.includes('relation "course_modules" does not exist') ||
    message.includes('relation "course_tasks" does not exist') ||
    message.includes('relation "course_phases" does not exist') ||
    message.includes('relation "focus_blocks" does not exist') ||
    message.includes('relation "course_goals" does not exist') ||
    message.includes('relation "course_checkpoints" does not exist') ||
    message.includes('relation "task_submissions" does not exist') ||
    message.includes('relation "task_completions" does not exist')
  ) {
    return "The new course tables are not in Supabase yet. Run the Phase 5 course-task migrations first.";
  }

  if (
    message.includes("permission denied") ||
    message.includes("row-level security") ||
    message.includes("policy")
  ) {
    return "The course tables are missing the latest access policies. Run the latest Phase 5 course-task access migration in Supabase.";
  }

  if (message.includes("task_type")) {
    return "The course_tasks table schema does not match the app yet. Run the latest Phase 5 migrations in Supabase.";
  }

  if (message.includes("structure_type") || message.includes("phase_id")) {
    return "The course schema is missing the latest phased/timed fields. Run the latest course migration in Supabase.";
  }

  if (message.includes("focus_block_id")) {
    return "The course task schema is missing the latest focus block link field. Run the latest course migration in Supabase.";
  }

  if (message.includes("gold_bar_rule")) {
    return "The course task schema is missing the latest gold bar rule field. Run the latest course migration in Supabase.";
  }

  if (message.includes("gold_coin_reward_amount")) {
    return "The course task schema is missing the latest Gold Coin reward field. Run the latest course migration in Supabase.";
  }

  if (
    message.includes("content_html") ||
    message.includes("choice_options") ||
    message.includes("allow_multiple_choices")
  ) {
    return "The course task schema is missing the latest lesson/test authoring fields. Run the latest course migration in Supabase.";
  }

  return `We couldn't save that course change just yet. ${message}`;
}

function getRedirectPath(formData: FormData, fallbackPath: string) {
  const redirectPath = formData.get("redirect_path");
  return typeof redirectPath === "string" && redirectPath ? redirectPath : fallbackPath;
}

function buildRedirectWithMessage(
  path: string,
  key: "error" | "saved",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function normaliseWeekdays(rawWeekdays: FormDataEntryValue[]) {
  const allowed = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

  return Array.from(
    new Set(
      rawWeekdays
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => allowed.has(value)),
    ),
  );
}

function normaliseChoiceOptions(rawOptions: FormDataEntryValue | null) {
  if (typeof rawOptions !== "string" || !rawOptions.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      rawOptions
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function parseOptionalPositiveInteger(
  value: FormDataEntryValue | null,
  {
    min,
    max,
    message,
    redirectPath,
  }: {
    min: number;
    max: number;
    message: string;
    redirectPath: string;
  },
) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    redirect(buildRedirectWithMessage(redirectPath, "error", message));
  }

  return parsed;
}

function revalidateCoursePages() {
  revalidatePath("/courses");
  revalidatePath("/learn");
}

async function getAuthenticatedParent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function createCourse(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/courses");
  const childId = formData.get("child_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const structureType = formData.get("structure_type");
  const startDate = formData.get("start_date");
  const durationWeeks = parseOptionalPositiveInteger(formData.get("duration_weeks"), {
    min: 1,
    max: 104,
    message: "Course length should be between 1 and 104 weeks.",
    redirectPath,
  });
  const cycleLengthWeeks = parseOptionalPositiveInteger(formData.get("cycle_length_weeks"), {
    min: 1,
    max: 12,
    message: "Cycle length should be between 1 and 12 weeks.",
    redirectPath,
  });

  if (typeof childId !== "string" || !childId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a child before creating a course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course title."));
  }

  if (
    typeof structureType !== "string" ||
    !COURSE_STRUCTURE_TYPES.includes(structureType as (typeof COURSE_STRUCTURE_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a course structure first."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      parent_user_id: user.id,
      child_id: childId,
      structure_type: structureType,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      start_date: typeof startDate === "string" && startDate ? startDate : null,
      duration_weeks: durationWeeks,
      cycle_length_weeks: cycleLengthWeeks ?? 4,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error || !course) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error?.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildScopedPath(`/courses/${course.id}`, childId, "parent"));
}

export async function deleteCourse(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "deleted course"));
}

export async function createModule(formData: FormData) {
  const courseId = formData.get("course_id");
  const phaseId = formData.get("phase_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a module title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: course }, { count }, { data: phase }] = await Promise.all([
    supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id),
    typeof phaseId === "string" && phaseId.trim()
      ? supabase
          .from("course_phases")
          .select("id")
          .eq("id", phaseId)
          .eq("course_id", courseId)
          .eq("parent_user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof phaseId === "string" && phaseId.trim() && !phase) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid phase for that module."));
  }

  const { error } = await supabase.from("course_modules").insert({
    course_id: courseId,
    parent_user_id: user.id,
    phase_id: typeof phaseId === "string" && phaseId.trim() ? phaseId : null,
    title: title.trim(),
    description: typeof description === "string" ? description.trim() || null : null,
    position: count ?? 0,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module"));
}

export async function createCoursePhase(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a phase title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: course }, { count }] = await Promise.all([
    supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_phases")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id),
  ]);

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const { error } = await supabase.from("course_phases").insert({
    course_id: courseId,
    parent_user_id: user.id,
    title: title.trim(),
    description: typeof description === "string" ? description.trim() || null : null,
    position: count ?? 0,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "phase"));
}

export async function createTask(formData: FormData) {
  const courseId = formData.get("course_id");
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" && typeof moduleId === "string"
      ? `/courses/${courseId}/modules/${moduleId}`
      : "/courses",
  );
  const title = formData.get("title");
  const taskType = formData.get("task_type");
  const instructions = formData.get("instructions");
  const contentHtml = formData.get("content_html");
  const writingPrompt = formData.get("writing_prompt");
  const choiceOptions = normaliseChoiceOptions(formData.get("choice_options_text"));
  const allowMultipleChoices = formData.get("allow_multiple_choices") === "true";
  const estimatedMinutes = formData.get("estimated_minutes");
  const monthlyGoalTotal = formData.get("monthly_goal_total");
  const focusBlockId = formData.get("focus_block_id");
  const goldBarRule = formData.get("gold_bar_rule");
  const goldCoinRewardAmount = formData.get("gold_coin_reward_amount");
  const weeklyDays = normaliseWeekdays(formData.getAll("weekly_days"));

  if (typeof courseId !== "string" || !courseId || typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a task title."));
  }

  if (
    typeof taskType !== "string" ||
    !COURSE_TASK_TYPES.includes(taskType as (typeof COURSE_TASK_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid task type."));
  }

  if (taskType === "recurring_weekly" && weeklyDays.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose at least one weekday for a weekly task."));
  }

  const safeGoldBarRule =
    typeof goldBarRule === "string" &&
    TASK_GOLD_BAR_RULES.includes(goldBarRule as (typeof TASK_GOLD_BAR_RULES)[number])
      ? goldBarRule
      : "auto";

  const safeEstimatedMinutes =
    typeof estimatedMinutes === "string" && estimatedMinutes.trim()
      ? Number(estimatedMinutes)
      : null;
  const safeMonthlyGoalTotal =
    typeof monthlyGoalTotal === "string" && monthlyGoalTotal.trim()
      ? Number(monthlyGoalTotal)
      : null;
  const safeGoldCoinRewardAmount =
    typeof goldCoinRewardAmount === "string" && goldCoinRewardAmount.trim()
      ? Number(goldCoinRewardAmount)
      : 0;

  if (
    safeEstimatedMinutes !== null &&
    (!Number.isInteger(safeEstimatedMinutes) || safeEstimatedMinutes < 1 || safeEstimatedMinutes > 240)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Estimated minutes should be between 1 and 240."));
  }

  if (
    safeMonthlyGoalTotal !== null &&
    (!Number.isInteger(safeMonthlyGoalTotal) || safeMonthlyGoalTotal < 1 || safeMonthlyGoalTotal > 500)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Monthly goal total should be between 1 and 500."));
  }

  if (
    !Number.isInteger(safeGoldCoinRewardAmount) ||
    safeGoldCoinRewardAmount < 0 ||
    safeGoldCoinRewardAmount > 500
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Gold Coin reward should be between 0 and 500."));
  }

  if (safeGoldBarRule !== "none" && safeGoldCoinRewardAmount < 1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Set a Gold Coin reward amount or choose Progress only."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: module }, { count }, { data: focusBlock }] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, course_id")
      .eq("id", moduleId)
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("parent_user_id", user.id),
    typeof focusBlockId === "string" && focusBlockId.trim()
      ? supabase
          .from("focus_blocks")
          .select("id")
          .eq("id", focusBlockId)
          .eq("course_id", courseId)
          .eq("parent_user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (typeof focusBlockId === "string" && focusBlockId.trim() && !focusBlock) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid focus block for that task."));
  }

  const { error } = await supabase.from("course_tasks").insert({
    course_id: courseId,
    module_id: moduleId,
    parent_user_id: user.id,
    focus_block_id: typeof focusBlockId === "string" && focusBlockId.trim() ? focusBlockId : null,
    title: title.trim(),
    task_type: taskType,
    instructions: typeof instructions === "string" ? instructions.trim() || null : null,
    content_html:
      taskType === "lesson" || taskType === "test"
        ? typeof contentHtml === "string"
          ? contentHtml.trim() || null
          : null
        : null,
    writing_prompt: typeof writingPrompt === "string" ? writingPrompt.trim() || null : null,
    choice_options: taskType === "test" ? choiceOptions : [],
    allow_multiple_choices: taskType === "test" ? allowMultipleChoices && choiceOptions.length > 0 : false,
    estimated_minutes: safeEstimatedMinutes,
    monthly_goal_total:
      taskType === "recurring_daily" || taskType === "recurring_weekly"
        ? safeMonthlyGoalTotal
        : null,
    gold_bar_rule: safeGoldBarRule,
    gold_coin_reward_amount: safeGoldBarRule === "none" ? 0 : safeGoldCoinRewardAmount,
    weekly_days: taskType === "recurring_weekly" ? weeklyDays : [],
    position: count ?? 0,
    is_active: true,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "task"));
}

export async function updateCourse(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");
  const structureType = formData.get("structure_type");
  const startDate = formData.get("start_date");
  const durationWeeks = parseOptionalPositiveInteger(formData.get("duration_weeks"), {
    min: 1,
    max: 104,
    message: "Course length should be between 1 and 104 weeks.",
    redirectPath,
  });
  const cycleLengthWeeks = parseOptionalPositiveInteger(formData.get("cycle_length_weeks"), {
    min: 1,
    max: 12,
    message: "Cycle length should be between 1 and 12 weeks.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course title."));
  }

  if (
    typeof structureType !== "string" ||
    !COURSE_STRUCTURE_TYPES.includes(structureType as (typeof COURSE_STRUCTURE_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid course structure."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("courses")
    .update({
      structure_type: structureType,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      start_date: typeof startDate === "string" && startDate ? startDate : null,
      duration_weeks: durationWeeks,
      cycle_length_weeks: cycleLengthWeeks ?? 4,
    })
    .eq("id", courseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "course"));
}

export async function updateModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a module title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("course_modules")
    .update({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
    })
    .eq("id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module"));
}

export async function moveModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const direction = formData.get("direction");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (direction !== "up" && direction !== "down") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid module move."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: module } = await supabase
    .from("course_modules")
    .select("id, course_id, phase_id, position")
    .eq("id", moduleId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  let siblingsQuery = supabase
    .from("course_modules")
    .select("id, position")
    .eq("course_id", module.course_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  siblingsQuery =
    module.phase_id === null
      ? siblingsQuery.is("phase_id", null)
      : siblingsQuery.eq("phase_id", module.phase_id);

  const { data: siblings } = await siblingsQuery;
  const orderedSiblings = siblings ?? [];
  const currentIndex = orderedSiblings.findIndex((item) => item.id === module.id);

  if (currentIndex === -1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't place that module."));
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= orderedSiblings.length) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "module order"));
  }

  const targetModule = orderedSiblings[targetIndex];

  const [{ error: currentError }, { error: targetError }] = await Promise.all([
    supabase
      .from("course_modules")
      .update({ position: targetModule.position })
      .eq("id", module.id)
      .eq("parent_user_id", user.id),
    supabase
      .from("course_modules")
      .update({ position: module.position })
      .eq("id", targetModule.id)
      .eq("parent_user_id", user.id),
  ]);

  const error = currentError ?? targetError;

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module order"));
}

export async function archiveModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: module } = await supabase
    .from("course_modules")
    .select("id")
    .eq("id", moduleId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { error } = await supabase
    .from("course_tasks")
    .update({ is_active: false })
    .eq("module_id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      "archived module",
    ),
  );
}

export async function deleteModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: module }, { count }] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id")
      .eq("id", moduleId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("parent_user_id", user.id),
  ]);

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if ((count ?? 0) > 0) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Clear or archive the tasks in this module before deleting it.",
      ),
    );
  }

  const { error } = await supabase
    .from("course_modules")
    .delete()
    .eq("id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "deleted module"));
}

export async function updateTask(formData: FormData) {
  const taskId = formData.get("task_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const title = formData.get("title");
  const taskType = formData.get("task_type");
  const instructions = formData.get("instructions");
  const contentHtml = formData.get("content_html");
  const writingPrompt = formData.get("writing_prompt");
  const choiceOptions = normaliseChoiceOptions(formData.get("choice_options_text"));
  const allowMultipleChoices = formData.get("allow_multiple_choices") === "true";
  const estimatedMinutes = formData.get("estimated_minutes");
  const monthlyGoalTotal = formData.get("monthly_goal_total");
  const focusBlockId = formData.get("focus_block_id");
  const goldBarRule = formData.get("gold_bar_rule");
  const goldCoinRewardAmount = formData.get("gold_coin_reward_amount");
  const weeklyDays = normaliseWeekdays(formData.getAll("weekly_days"));
  const isActive = formData.get("is_active") === "true";

  if (typeof taskId !== "string" || !taskId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a task title."));
  }

  if (
    typeof taskType !== "string" ||
    !COURSE_TASK_TYPES.includes(taskType as (typeof COURSE_TASK_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid task type."));
  }

  if (taskType === "recurring_weekly" && weeklyDays.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose at least one weekday for a weekly task."));
  }

  const safeGoldBarRule =
    typeof goldBarRule === "string" &&
    TASK_GOLD_BAR_RULES.includes(goldBarRule as (typeof TASK_GOLD_BAR_RULES)[number])
      ? goldBarRule
      : "auto";

  const safeEstimatedMinutes =
    typeof estimatedMinutes === "string" && estimatedMinutes.trim()
      ? Number(estimatedMinutes)
      : null;
  const safeMonthlyGoalTotal =
    typeof monthlyGoalTotal === "string" && monthlyGoalTotal.trim()
      ? Number(monthlyGoalTotal)
      : null;
  const safeGoldCoinRewardAmount =
    typeof goldCoinRewardAmount === "string" && goldCoinRewardAmount.trim()
      ? Number(goldCoinRewardAmount)
      : 0;

  if (
    safeEstimatedMinutes !== null &&
    (!Number.isInteger(safeEstimatedMinutes) || safeEstimatedMinutes < 1 || safeEstimatedMinutes > 240)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Estimated minutes should be between 1 and 240."));
  }

  if (
    safeMonthlyGoalTotal !== null &&
    (!Number.isInteger(safeMonthlyGoalTotal) || safeMonthlyGoalTotal < 1 || safeMonthlyGoalTotal > 500)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Monthly goal total should be between 1 and 500."));
  }

  if (
    !Number.isInteger(safeGoldCoinRewardAmount) ||
    safeGoldCoinRewardAmount < 0 ||
    safeGoldCoinRewardAmount > 500
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Gold Coin reward should be between 0 and 500."));
  }

  if (safeGoldBarRule !== "none" && safeGoldCoinRewardAmount < 1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Set a Gold Coin reward amount or choose Progress only."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: existingTask } = await supabase
    .from("course_tasks")
    .select("id, course_id")
    .eq("id", taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!existingTask) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  if (typeof focusBlockId === "string" && focusBlockId.trim()) {
    const { data: focusBlock } = await supabase
      .from("focus_blocks")
      .select("id")
      .eq("id", focusBlockId)
      .eq("course_id", existingTask.course_id)
      .eq("parent_user_id", user.id)
      .maybeSingle();

    if (!focusBlock) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid focus block for that task."));
    }
  }

  const { error } = await supabase
    .from("course_tasks")
    .update({
      focus_block_id: typeof focusBlockId === "string" && focusBlockId.trim() ? focusBlockId : null,
      title: title.trim(),
      task_type: taskType,
      instructions: typeof instructions === "string" ? instructions.trim() || null : null,
      content_html:
        taskType === "lesson" || taskType === "test"
          ? typeof contentHtml === "string"
            ? contentHtml.trim() || null
            : null
          : null,
      writing_prompt: typeof writingPrompt === "string" ? writingPrompt.trim() || null : null,
      choice_options: taskType === "test" ? choiceOptions : [],
      allow_multiple_choices: taskType === "test" ? allowMultipleChoices && choiceOptions.length > 0 : false,
      estimated_minutes: safeEstimatedMinutes,
      monthly_goal_total:
        taskType === "recurring_daily" || taskType === "recurring_weekly"
          ? safeMonthlyGoalTotal
          : null,
      gold_bar_rule: safeGoldBarRule,
      gold_coin_reward_amount: safeGoldBarRule === "none" ? 0 : safeGoldCoinRewardAmount,
      weekly_days: taskType === "recurring_weekly" ? weeklyDays : [],
      is_active: isActive,
    })
    .eq("id", taskId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "task"));
}

export async function moveTask(formData: FormData) {
  const taskId = formData.get("task_id");
  const direction = formData.get("direction");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof taskId !== "string" || !taskId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  if (direction !== "up" && direction !== "down") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid task move."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select("id, module_id, position")
    .eq("id", taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  const { data: siblings } = await supabase
    .from("course_tasks")
    .select("id, position")
    .eq("module_id", task.module_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  const orderedSiblings = siblings ?? [];
  const currentIndex = orderedSiblings.findIndex((item) => item.id === task.id);

  if (currentIndex === -1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't place that task."));
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= orderedSiblings.length) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "task order"));
  }

  const targetTask = orderedSiblings[targetIndex];

  const [{ error: currentError }, { error: targetError }] = await Promise.all([
    supabase
      .from("course_tasks")
      .update({ position: targetTask.position })
      .eq("id", task.id)
      .eq("parent_user_id", user.id),
    supabase
      .from("course_tasks")
      .update({ position: task.position })
      .eq("id", targetTask.id)
      .eq("parent_user_id", user.id),
  ]);

  const error = currentError ?? targetError;

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "task order"));
}

export async function duplicateTask(formData: FormData) {
  const taskId = formData.get("task_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof taskId !== "string" || !taskId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that lesson."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: task } = await supabase
    .from("course_tasks")
    .select(
      "id, course_id, module_id, focus_block_id, title, task_type, instructions, content_html, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, gold_bar_rule, gold_coin_reward_amount, weekly_days, position, is_active",
    )
    .eq("id", taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that lesson."));
  }

  const { count } = await supabase
    .from("course_tasks")
    .select("*", { count: "exact", head: true })
    .eq("module_id", task.module_id)
    .eq("parent_user_id", user.id);

  const duplicateTitle = /\bcopy\b/i.test(task.title)
    ? task.title
    : `${task.title} copy`;

  const { error } = await supabase.from("course_tasks").insert({
    course_id: task.course_id,
    module_id: task.module_id,
    parent_user_id: user.id,
    focus_block_id: task.focus_block_id,
    title: duplicateTitle,
    task_type: task.task_type,
    instructions: task.instructions,
    content_html: task.content_html,
    writing_prompt: task.writing_prompt,
    choice_options: task.choice_options ?? [],
    allow_multiple_choices: task.allow_multiple_choices,
    estimated_minutes: task.estimated_minutes,
    monthly_goal_total: task.monthly_goal_total,
    gold_bar_rule: task.gold_bar_rule,
    gold_coin_reward_amount: task.gold_coin_reward_amount,
    weekly_days: task.weekly_days ?? [],
    position: count ?? task.position + 1,
    is_active: task.is_active,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "duplicated lesson"));
}

export async function bulkUpdateTasks(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/courses");
  const taskIds = Array.from(
    new Set(
      formData
        .getAll("task_ids")
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const bulkAction = formData.get("bulk_action");

  if (taskIds.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose at least one task first."));
  }

  if (bulkAction !== "activate" && bulkAction !== "pause" && bulkAction !== "delete") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid bulk action."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const result =
    bulkAction === "delete"
      ? await supabase
          .from("course_tasks")
          .delete()
          .in("id", taskIds)
          .eq("parent_user_id", user.id)
      : await supabase
          .from("course_tasks")
          .update({
            is_active: bulkAction === "activate",
          })
          .in("id", taskIds)
          .eq("parent_user_id", user.id);

  const { error } = result;

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      bulkAction === "activate"
        ? "tasks"
        : bulkAction === "pause"
          ? "paused tasks"
          : "deleted tasks",
    ),
  );
}

export async function deleteTask(formData: FormData) {
  const taskId = formData.get("task_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof taskId !== "string" || !taskId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("course_tasks")
    .delete()
    .eq("id", taskId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "deleted task"));
}

export async function createFocusBlock(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const moduleId = formData.get("module_id");
  const title = formData.get("title");
  const goal = formData.get("goal");
  const description = formData.get("description");
  const startDate = formData.get("start_date");
  const endDate = formData.get("end_date");
  const cycleNumber = parseOptionalPositiveInteger(formData.get("cycle_number"), {
    min: 1,
    max: 52,
    message: "Cycle number should be between 1 and 52.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a focus block title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("focus_blocks").insert({
    course_id: courseId,
    module_id: typeof moduleId === "string" && moduleId.trim() ? moduleId : null,
    parent_user_id: user.id,
    title: title.trim(),
    goal: typeof goal === "string" ? goal.trim() || null : null,
    description: typeof description === "string" ? description.trim() || null : null,
    cycle_number: cycleNumber,
    start_date: typeof startDate === "string" && startDate ? startDate : null,
    end_date: typeof endDate === "string" && endDate ? endDate : null,
    is_active: true,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block"));
}

export async function createCourseGoal(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const goalType = formData.get("goal_type");
  const unit = formData.get("unit");
  const progressSource = formData.get("progress_source");
  const timeSpan = formData.get("time_span");
  const successDescription = formData.get("success_description");
  const status = formData.get("status");
  const targetQuantity = parseOptionalPositiveInteger(formData.get("target_quantity"), {
    min: 1,
    max: 10000,
    message: "Target quantity should be between 1 and 10000.",
    redirectPath,
  });
  const stretchTarget = parseOptionalPositiveInteger(formData.get("stretch_target"), {
    min: 1,
    max: 10000,
    message: "Stretch target should be between 1 and 10000.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course goal title."));
  }

  if (typeof unit !== "string" || !unit.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter the goal unit."));
  }

  if (
    goalType !== "count_goal" &&
    goalType !== "completion_goal" &&
    goalType !== "skill_goal" &&
    goalType !== "submission_goal"
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid goal type."));
  }

  if (
    progressSource !== "task_completion" &&
    progressSource !== "task_submission" &&
    progressSource !== "focus_block_completion" &&
    progressSource !== "manual_review" &&
    progressSource !== "spelling_progress"
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid progress source."));
  }

  if (timeSpan !== "monthly" && timeSpan !== "cycle" && timeSpan !== "course_duration") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid time span."));
  }

  if (status !== "planned" && status !== "active" && status !== "secure" && status !== "paused") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid goal status."));
  }

  if (!targetQuantity) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a target quantity."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("course_goals").insert({
    course_id: courseId,
    parent_user_id: user.id,
    title: title.trim(),
    goal_type: goalType,
    unit: unit.trim(),
    target_quantity: targetQuantity,
    progress_source: progressSource,
    time_span: timeSpan,
    success_description:
      typeof successDescription === "string" ? successDescription.trim() || null : null,
    stretch_target: stretchTarget,
    status,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "course goal"));
}

export async function createCourseCheckpoint(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const moduleId = formData.get("module_id");
  const title = formData.get("title");
  const target = formData.get("target");
  const scheduledDate = formData.get("scheduled_date");
  const notes = formData.get("notes");
  const cycleNumber = parseOptionalPositiveInteger(formData.get("cycle_number"), {
    min: 1,
    max: 52,
    message: "Cycle number should be between 1 and 52.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a checkpoint title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("course_checkpoints").insert({
    course_id: courseId,
    module_id: typeof moduleId === "string" && moduleId.trim() ? moduleId : null,
    parent_user_id: user.id,
    title: title.trim(),
    cycle_number: cycleNumber,
    target: typeof target === "string" ? target.trim() || null : null,
    scheduled_date: typeof scheduledDate === "string" && scheduledDate ? scheduledDate : null,
    notes: typeof notes === "string" ? notes.trim() || null : null,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint"));
}
