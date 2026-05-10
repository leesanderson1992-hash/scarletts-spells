"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getTimedPhaseBackingModuleOptionPhaseId,
  isTimedPhaseBackingModuleOptionValue,
} from "@/lib/courses/timed-phase-modules";
import {
  COURSE_COIN_REWARD_TRIGGERS,
  COURSE_TASK_TYPES,
  normaliseCourseStructureType,
  normaliseRewardTriggerForTaskType,
  type DeleteActionResult,
  type SharedCreatorMode,
} from "@/lib/courses/types";
import {
  assertFocusBlockAllowedForCourse,
  assertModuleBelongsToCourse,
  assertPhaseBelongsToCourse,
  assertTaskCreatorModeAllowedForCourse,
  assertTaskTypeMutationAllowed,
  resolveSharedCreatorMode,
} from "@/lib/courses/validation";
import {
  buildRedirectWithMessage,
  getAuthenticatedParent,
  getFriendlyCourseDatabaseError,
  getRedirectPath,
  normaliseChoiceOptions,
  normaliseWeekdays,
  parseFocusBlockTaskDrafts,
  parseOptionalPositiveInteger,
  parseStructuredLessonSchema,
  redirectForCourseActionError,
  resolveOrCreateTimedPhaseBackingModule,
  revalidateCourseMutationPaths,
  revalidateCoursePages,
  updateTaskPositions,
} from "@/app/courses/action-support";

function invalidDelete(message: string): DeleteActionResult {
  return {
    ok: false,
    error: message,
  };
}

export async function createTask(formData: FormData) {
  const courseId = formData.get("course_id");
  const rawModuleId = formData.get("module_id");
  const rawPhaseId = formData.get("phase_id");
  const timedPhaseBackingPhaseId =
    typeof rawModuleId === "string" ? getTimedPhaseBackingModuleOptionPhaseId(rawModuleId) : null;
  const moduleId =
    typeof rawModuleId === "string" && isTimedPhaseBackingModuleOptionValue(rawModuleId)
      ? null
      : rawModuleId;
  const phaseId = timedPhaseBackingPhaseId ?? rawPhaseId;
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" && typeof moduleId === "string"
      ? `/courses/${courseId}/modules/${moduleId}`
      : typeof courseId === "string"
        ? `/courses/${courseId}`
      : "/courses",
  );
  const title = formData.get("title");
  const creatorMode = formData.get("creator_mode");
  const taskType = formData.get("task_type");
  const instructions = formData.get("instructions");
  const goal = formData.get("goal");
  const description = formData.get("description");
  const cycleNumber = parseOptionalPositiveInteger(formData.get("cycle_number"), {
    min: 1,
    max: 52,
    message: "Cycle number should be between 1 and 52.",
    redirectPath,
  });
  const lessonAuthoringMode = formData.get("lesson_authoring_mode");
  const lessonSchemaJson = formData.get("lesson_schema_json");
  const focusBlockTasksJson = formData.get("focus_block_tasks_json");
  const writingPrompt = formData.get("writing_prompt");
  const choiceOptions = normaliseChoiceOptions(formData.get("choice_options_text"));
  const allowMultipleChoices = formData.get("allow_multiple_choices") === "true";
  const estimatedMinutes = formData.get("estimated_minutes");
  const monthlyGoalTotal = formData.get("monthly_goal_total");
  const focusBlockId = formData.get("focus_block_id");
  const creatorScope = formData.get("creator_scope");
  const coinRewardTrigger = formData.get("coin_reward_trigger");
  const goldCoinRewardAmount = formData.get("gold_coin_reward_amount");
  const weeklyDays = normaliseWeekdays(formData.getAll("weekly_days"));
  const structuredLessonSchema = parseStructuredLessonSchema(lessonSchemaJson, redirectPath);

  if (
    typeof courseId !== "string" ||
    !courseId ||
    ((typeof moduleId !== "string" || !moduleId) && (typeof phaseId !== "string" || !phaseId))
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that phase or module."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a task title."));
  }

  let safeCreatorMode: SharedCreatorMode;
  try {
    safeCreatorMode = resolveSharedCreatorMode({
      creatorScope,
      creatorMode,
      taskType,
    });
  } catch (error) {
    redirectForCourseActionError(error, redirectPath, "Choose a valid creator type.");
  }

  if (
    safeCreatorMode !== "focus_block" &&
    (typeof taskType !== "string" ||
      !COURSE_TASK_TYPES.includes(taskType as (typeof COURSE_TASK_TYPES)[number]))
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid task type."));
  }

  const safeTaskType =
    typeof taskType === "string" &&
    COURSE_TASK_TYPES.includes(taskType as (typeof COURSE_TASK_TYPES)[number])
      ? (taskType as (typeof COURSE_TASK_TYPES)[number])
      : null;

  if (safeTaskType === "recurring_weekly" && weeklyDays.length === 0) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose at least one weekday for a weekly task."));
  }

  const safeCoinRewardTrigger =
    typeof coinRewardTrigger === "string" &&
    COURSE_COIN_REWARD_TRIGGERS.includes(
      coinRewardTrigger as (typeof COURSE_COIN_REWARD_TRIGGERS)[number],
    )
      ? normaliseRewardTriggerForTaskType(
          safeCreatorMode === "focus_block"
            ? "checklist"
            : (safeTaskType as (typeof COURSE_TASK_TYPES)[number]),
          coinRewardTrigger as (typeof COURSE_COIN_REWARD_TRIGGERS)[number],
        )
      : "none";

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
  const isRecurringTask =
    safeTaskType === "recurring_daily" || safeTaskType === "recurring_weekly";
  const effectiveCoinRewardTrigger =
    safeCreatorMode === "focus_block"
      ? safeCoinRewardTrigger === "on_completion" && safeGoldCoinRewardAmount < 1
        ? "none"
        : safeCoinRewardTrigger
      : isRecurringTask && safeCoinRewardTrigger === "on_completion" && safeGoldCoinRewardAmount < 1
      ? "none"
      : safeCoinRewardTrigger;

  if (
    safeEstimatedMinutes !== null &&
    (!Number.isInteger(safeEstimatedMinutes) || safeEstimatedMinutes < 1 || safeEstimatedMinutes > 240)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Estimated minutes should be between 1 and 240."));
  }

  if (
    safeMonthlyGoalTotal !== null &&
    (!Number.isInteger(safeMonthlyGoalTotal) || safeMonthlyGoalTotal < 1 || safeMonthlyGoalTotal > 10000)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Monthly goal total should be between 1 and 10000."));
  }

  if (
    !Number.isInteger(safeGoldCoinRewardAmount) ||
    safeGoldCoinRewardAmount < 0 ||
    safeGoldCoinRewardAmount > 500
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Gold Coin reward should be between 0 and 500."));
  }

  if (effectiveCoinRewardTrigger !== "none" && safeGoldCoinRewardAmount < 1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Set a Gold Coin reward amount or choose Progress only."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const safeStructureType = normaliseCourseStructureType(course.structure_type);

  try {
    assertTaskCreatorModeAllowedForCourse({
      structureType: safeStructureType,
      creatorMode: safeCreatorMode,
    });

    if (safeCreatorMode === "focus_block") {
      assertFocusBlockAllowedForCourse(safeStructureType);
    } else if (safeTaskType) {
      assertTaskTypeMutationAllowed({
        structureType: safeStructureType,
        taskType: safeTaskType,
      });
    }

    if (typeof focusBlockId === "string" && focusBlockId.trim()) {
      assertFocusBlockAllowedForCourse(safeStructureType);
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

  let resolvedModule = null;

  if (typeof moduleId === "string" && moduleId.trim()) {
    const { data: module } = await supabase
      .from("course_modules")
      .select("id, course_id, phase_id, title, description, position, created_at")
      .eq("id", moduleId)
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle();

    resolvedModule = module ?? null;
  } else if (
    normaliseCourseStructureType(course.structure_type) === "timed" &&
    typeof phaseId === "string" &&
    phaseId.trim()
  ) {
    const result = await resolveOrCreateTimedPhaseBackingModule({
      supabase,
      parentUserId: user.id,
      courseId,
      phaseId,
    });

    if ("error" in result) {
      redirect(buildRedirectWithMessage(redirectPath, "error", result.error));
    }

    resolvedModule = result.module;
  }

  if (!resolvedModule) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that phase or module."));
  }

  if (typeof phaseId === "string" && phaseId.trim() && resolvedModule.phase_id !== phaseId) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        safeStructureType === "timed"
          ? "Choose a module that belongs to that cycle."
          : "Choose a module that belongs to that phase.",
      ),
    );
  }

  const [{ count }, { data: focusBlock }] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("module_id", resolvedModule.id)
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

  if (safeCreatorMode === "focus_block") {
    const miniTasks = parseFocusBlockTaskDrafts(focusBlockTasksJson, redirectPath);

    let derivedCycleNumber = cycleNumber;
    if (typeof phaseId === "string" && phaseId.trim()) {
      try {
        const phase = await assertPhaseBelongsToCourse({
          supabase,
          parentUserId: user.id,
          courseId,
          phaseId,
          invalidMessage: "Choose a valid cycle for that focus block.",
        });
        derivedCycleNumber = phase.position + 1;
      } catch (error) {
        redirectForCourseActionError(error, redirectPath);
      }
    }

    const { data: insertedFocusBlock, error: focusBlockError } = await supabase
      .from("focus_blocks")
      .insert({
        course_id: courseId,
        module_id: resolvedModule.id,
        parent_user_id: user.id,
        title: title.trim(),
        goal: typeof goal === "string" ? goal.trim() || null : null,
        description: typeof description === "string" ? description.trim() || null : null,
        cycle_number: derivedCycleNumber,
        gold_coin_reward_amount:
          effectiveCoinRewardTrigger === "none" ? 0 : safeGoldCoinRewardAmount,
        coin_reward_trigger:
          effectiveCoinRewardTrigger === "none" ? "none" : "on_completion",
        is_active: true,
      })
      .select("id")
      .single();

    if (focusBlockError || !insertedFocusBlock) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(focusBlockError?.message),
        ),
      );
    }

    const taskRows = miniTasks.map((draft, index) => ({
      course_id: courseId,
      module_id: resolvedModule.id,
      parent_user_id: user.id,
      focus_block_id: insertedFocusBlock.id,
      title: draft.title,
      task_type: "checklist" as const,
      instructions: draft.instructions,
      lesson_schema: null,
      writing_prompt: null,
      choice_options: [],
      allow_multiple_choices: false,
      estimated_minutes: draft.estimated_minutes,
      monthly_goal_total: null,
      coin_reward_trigger: "none" as const,
      gold_coin_reward_amount: 0,
      weekly_days: [],
      position: (count ?? 0) + index,
      is_active: true,
    }));

    const { error: taskInsertError } = await supabase.from("course_tasks").insert(taskRows);

    if (taskInsertError) {
      await supabase.from("focus_blocks").delete().eq("id", insertedFocusBlock.id).eq("parent_user_id", user.id);
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(taskInsertError.message),
        ),
      );
    }

    revalidateCoursePages();
    redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block"));
  }

  if (typeof focusBlockId === "string" && focusBlockId.trim() && !focusBlock) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid focus block for that task."));
  }

  const concreteTaskType = safeTaskType ?? "checklist";

  const { error } = await supabase.from("course_tasks").insert({
    course_id: courseId,
    module_id: resolvedModule.id,
    parent_user_id: user.id,
    focus_block_id: typeof focusBlockId === "string" && focusBlockId.trim() ? focusBlockId : null,
    title: title.trim(),
    task_type: concreteTaskType,
    instructions: typeof instructions === "string" ? instructions.trim() || null : null,
    lesson_schema:
      concreteTaskType === "lesson" || concreteTaskType === "test"
        ? lessonAuthoringMode === "structured"
          ? structuredLessonSchema
          : null
        : null,
    writing_prompt: typeof writingPrompt === "string" ? writingPrompt.trim() || null : null,
    choice_options: concreteTaskType === "test" ? choiceOptions : [],
    allow_multiple_choices: concreteTaskType === "test" ? allowMultipleChoices && choiceOptions.length > 0 : false,
    estimated_minutes: safeEstimatedMinutes,
    monthly_goal_total:
      concreteTaskType === "recurring_daily" || concreteTaskType === "recurring_weekly"
        ? safeMonthlyGoalTotal
        : null,
    coin_reward_trigger: effectiveCoinRewardTrigger,
    gold_coin_reward_amount:
      effectiveCoinRewardTrigger === "none" ? 0 : safeGoldCoinRewardAmount,
    weekly_days: concreteTaskType === "recurring_weekly" ? weeklyDays : [],
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

export async function updateTask(formData: FormData) {
  const taskId = formData.get("task_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const title = formData.get("title");
  const taskType = formData.get("task_type");
  const instructions = formData.get("instructions");
  const lessonAuthoringMode = formData.get("lesson_authoring_mode");
  const lessonSchemaJson = formData.get("lesson_schema_json");
  const writingPrompt = formData.get("writing_prompt");
  const choiceOptions = normaliseChoiceOptions(formData.get("choice_options_text"));
  const allowMultipleChoices = formData.get("allow_multiple_choices") === "true";
  const estimatedMinutes = formData.get("estimated_minutes");
  const monthlyGoalTotal = formData.get("monthly_goal_total");
  const focusBlockId = formData.get("focus_block_id");
  const editorScope = formData.get("editor_scope");
  const coinRewardTrigger = formData.get("coin_reward_trigger");
  const goldCoinRewardAmount = formData.get("gold_coin_reward_amount");
  const weeklyDays = normaliseWeekdays(formData.getAll("weekly_days"));
  const isActive = formData.get("is_active") === "true";
  const structuredLessonSchema = parseStructuredLessonSchema(lessonSchemaJson, redirectPath);

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

  const safeCoinRewardTrigger =
    typeof coinRewardTrigger === "string" &&
    COURSE_COIN_REWARD_TRIGGERS.includes(
      coinRewardTrigger as (typeof COURSE_COIN_REWARD_TRIGGERS)[number],
    )
      ? normaliseRewardTriggerForTaskType(
          taskType as (typeof COURSE_TASK_TYPES)[number],
          coinRewardTrigger as (typeof COURSE_COIN_REWARD_TRIGGERS)[number],
        )
      : "none";

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
  const isRecurringTask =
    taskType === "recurring_daily" || taskType === "recurring_weekly";
  const effectiveCoinRewardTrigger =
    isRecurringTask && safeCoinRewardTrigger === "on_completion" && safeGoldCoinRewardAmount < 1
      ? "none"
      : safeCoinRewardTrigger;

  if (
    safeEstimatedMinutes !== null &&
    (!Number.isInteger(safeEstimatedMinutes) || safeEstimatedMinutes < 1 || safeEstimatedMinutes > 240)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Estimated minutes should be between 1 and 240."));
  }

  if (
    safeMonthlyGoalTotal !== null &&
    (!Number.isInteger(safeMonthlyGoalTotal) || safeMonthlyGoalTotal < 1 || safeMonthlyGoalTotal > 10000)
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Monthly goal total should be between 1 and 10000."));
  }

  if (
    !Number.isInteger(safeGoldCoinRewardAmount) ||
    safeGoldCoinRewardAmount < 0 ||
    safeGoldCoinRewardAmount > 500
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Gold Coin reward should be between 0 and 500."));
  }

  if (effectiveCoinRewardTrigger !== "none" && safeGoldCoinRewardAmount < 1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Set a Gold Coin reward amount or choose Progress only."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: existingTask } = await supabase
    .from("course_tasks")
    .select("id, course_id, task_type")
    .eq("id", taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!existingTask) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that task."));
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", existingTask.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const safeStructureType = normaliseCourseStructureType(course.structure_type);

  try {
    if (editorScope === "shared_task_creator") {
      const derivedCreatorMode =
        taskType === "lesson" || taskType === "test" || taskType === "recurring_daily" || taskType === "recurring_weekly"
          ? (taskType as SharedCreatorMode)
          : "checklist";

      assertTaskCreatorModeAllowedForCourse({
        structureType: safeStructureType,
        creatorMode: derivedCreatorMode,
      });
    }

    assertTaskTypeMutationAllowed({
      structureType: safeStructureType,
      taskType: taskType as (typeof COURSE_TASK_TYPES)[number],
      existingTaskType: existingTask.task_type,
    });

    if (typeof focusBlockId === "string" && focusBlockId.trim()) {
      assertFocusBlockAllowedForCourse(safeStructureType);
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
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
      lesson_schema:
        taskType === "lesson" || taskType === "test"
          ? lessonAuthoringMode === "structured"
            ? structuredLessonSchema
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
      coin_reward_trigger: effectiveCoinRewardTrigger,
      gold_coin_reward_amount:
        effectiveCoinRewardTrigger === "none" ? 0 : safeGoldCoinRewardAmount,
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

  revalidateCourseMutationPaths({
    redirectPath,
    moduleId: task.module_id,
  });
  redirect(buildRedirectWithMessage(redirectPath, "saved", "task order"));
}

export async function moveFocusBlock(formData: FormData) {
  const focusBlockId = formData.get("focus_block_id");
  const direction = formData.get("direction");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof focusBlockId !== "string" || !focusBlockId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that focus block."));
  }

  if (direction !== "up" && direction !== "down") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid focus block move."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: focusBlock } = await supabase
    .from("focus_blocks")
    .select("id, course_id, module_id")
    .eq("id", focusBlockId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!focusBlock?.module_id) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that focus block."));
  }

  const { data: tasks, error } = await supabase
    .from("course_tasks")
    .select("id, focus_block_id, position")
    .eq("module_id", focusBlock.module_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  if (error || !tasks) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error?.message),
      ),
    );
  }

  const units: Array<{ kind: "task" | "focus_block"; id: string; taskIds: string[] }> = [];
  let index = 0;
  while (index < tasks.length) {
    const task = tasks[index];
    if (task?.focus_block_id) {
      const groupTaskIds: string[] = [];
      const currentFocusBlockId = task.focus_block_id;
      while (index < tasks.length && tasks[index]?.focus_block_id === currentFocusBlockId) {
        groupTaskIds.push(tasks[index]!.id);
        index += 1;
      }
      units.push({ kind: "focus_block", id: currentFocusBlockId, taskIds: groupTaskIds });
      continue;
    }

    if (task) {
      units.push({ kind: "task", id: task.id, taskIds: [task.id] });
    }
    index += 1;
  }

  const currentIndex = units.findIndex((unit) => unit.kind === "focus_block" && unit.id === focusBlockId);
  if (currentIndex === -1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't place that focus block."));
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= units.length) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block order"));
  }

  const reorderedUnits = [...units];
  [reorderedUnits[currentIndex], reorderedUnits[targetIndex]] = [
    reorderedUnits[targetIndex],
    reorderedUnits[currentIndex],
  ];

  const orderedTaskIds = reorderedUnits.flatMap((unit) => unit.taskIds);
  const updateError = await updateTaskPositions(supabase, user.id, orderedTaskIds);

  if (updateError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(updateError.message),
      ),
    );
  }

  revalidateCourseMutationPaths({
    redirectPath,
    courseId: focusBlock.course_id,
    moduleId: focusBlock.module_id,
  });
  redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block order"));
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
      "id, course_id, module_id, focus_block_id, title, task_type, instructions, lesson_schema, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount, weekly_days, position, is_active",
    )
    .eq("id", taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!task) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that lesson."));
  }

  const [{ count }, { data: course }] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("module_id", task.module_id)
      .eq("parent_user_id", user.id),
    supabase
      .from("courses")
      .select("id, structure_type")
      .eq("id", task.course_id)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
  ]);

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  try {
    const courseStructure = normaliseCourseStructureType(course.structure_type);

    assertTaskTypeMutationAllowed({
      structureType: courseStructure,
      taskType: task.task_type,
      existingTaskType: task.task_type,
    });

    if (task.focus_block_id) {
      assertFocusBlockAllowedForCourse(courseStructure);
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

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
    lesson_schema: task.lesson_schema ?? null,
    writing_prompt: task.writing_prompt,
    choice_options: task.choice_options ?? [],
    allow_multiple_choices: task.allow_multiple_choices,
    estimated_minutes: task.estimated_minutes,
    monthly_goal_total: task.monthly_goal_total,
    coin_reward_trigger: task.coin_reward_trigger,
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
  redirect(buildRedirectWithMessage(redirectPath, "saved", "duplicated task"));
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

export async function deleteTaskInlineAction(input: {
  taskId: string;
}): Promise<DeleteActionResult> {
  if (!input.taskId) {
    return invalidDelete("We couldn't find that task.");
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return invalidDelete("Please log in again.");
  }

  const { data: task, error: taskLookupError } = await supabase
    .from("course_tasks")
    .select("id, course_id, module_id")
    .eq("id", input.taskId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (taskLookupError) {
    return invalidDelete(getFriendlyCourseDatabaseError(taskLookupError.message));
  }

  if (!task) {
    return invalidDelete("We couldn't find that task.");
  }

  const { error } = await supabase
    .from("course_tasks")
    .delete()
    .eq("id", input.taskId)
    .eq("parent_user_id", user.id);

  if (error) {
    return invalidDelete(getFriendlyCourseDatabaseError(error.message));
  }

  revalidatePath(`/courses/${task.course_id}`);
  revalidatePath(`/courses/${task.course_id}/modules/${task.module_id}`);

  return {
    ok: true,
    deletedId: input.taskId,
  };
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

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  try {
    assertFocusBlockAllowedForCourse(normaliseCourseStructureType(course.structure_type));

    if (typeof moduleId === "string" && moduleId.trim()) {
      await assertModuleBelongsToCourse({
        supabase,
        parentUserId: user.id,
        courseId,
        moduleId,
        invalidMessage: "Choose a valid timed module for that focus block.",
      });
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
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

export async function updateFocusBlock(formData: FormData) {
  const focusBlockId = formData.get("focus_block_id");
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const goal = formData.get("goal");
  const description = formData.get("description");
  const focusBlockTasksJson = formData.get("focus_block_tasks_json");

  if (typeof focusBlockId !== "string" || !focusBlockId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that focus block."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a focus block title."));
  }

  const miniTasks = parseFocusBlockTaskDrafts(focusBlockTasksJson, redirectPath);

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: focusBlock, error: focusBlockLookupError } = await supabase
    .from("focus_blocks")
    .select("id, course_id, module_id")
    .eq("id", focusBlockId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (focusBlockLookupError || !focusBlock || !focusBlock.module_id) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(focusBlockLookupError?.message),
      ),
    );
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", focusBlock.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  try {
    assertFocusBlockAllowedForCourse(normaliseCourseStructureType(course.structure_type));
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

  const { error } = await supabase
    .from("focus_blocks")
    .update({
      title: title.trim(),
      goal: typeof goal === "string" ? goal.trim() || null : null,
      description: typeof description === "string" ? description.trim() || null : null,
    })
    .eq("id", focusBlockId)
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

  const { data: moduleTasks, error: moduleTasksError } = await supabase
    .from("course_tasks")
    .select(
      "id, course_id, module_id, parent_user_id, focus_block_id, title, task_type, instructions, estimated_minutes, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount, weekly_days, position, is_active",
    )
    .eq("module_id", focusBlock.module_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  if (moduleTasksError || !moduleTasks) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(moduleTasksError?.message),
      ),
    );
  }

  const existingFocusTasks = moduleTasks.filter((task) => task.focus_block_id === focusBlock.id);
  const existingFocusTaskIds = new Set(existingFocusTasks.map((task) => task.id));
  const firstFocusTaskIndex = moduleTasks.findIndex((task) => task.focus_block_id === focusBlock.id);
  const beforeTasks =
    firstFocusTaskIndex === -1
      ? moduleTasks
      : moduleTasks
          .slice(0, firstFocusTaskIndex)
          .filter((task) => task.focus_block_id !== focusBlock.id);
  const afterTasks =
    firstFocusTaskIndex === -1
      ? []
      : moduleTasks
          .slice(firstFocusTaskIndex)
          .filter((task) => task.focus_block_id !== focusBlock.id);

  for (const draft of miniTasks) {
    if (draft.id && existingFocusTaskIds.has(draft.id)) {
      const { error: taskUpdateError } = await supabase
        .from("course_tasks")
        .update({
          title: draft.title,
          instructions: draft.instructions,
          estimated_minutes: draft.estimated_minutes,
          focus_block_id: focusBlock.id,
          task_type: "checklist",
        })
        .eq("id", draft.id)
        .eq("parent_user_id", user.id);

      if (taskUpdateError) {
        redirect(
          buildRedirectWithMessage(
            redirectPath,
            "error",
            getFriendlyCourseDatabaseError(taskUpdateError.message),
          ),
        );
      }
    }
  }

  const newDrafts = miniTasks.filter((draft) => !(draft.id && existingFocusTaskIds.has(draft.id)));
  let insertedIds: string[] = [];

  if (newDrafts.length > 0) {
    const { data: insertedTasks, error: insertError } = await supabase
      .from("course_tasks")
      .insert(
        newDrafts.map((draft, index) => ({
          course_id: focusBlock.course_id,
          module_id: focusBlock.module_id,
          parent_user_id: user.id,
          focus_block_id: focusBlock.id,
          title: draft.title,
          task_type: "checklist" as const,
          instructions: draft.instructions,
          lesson_schema: null,
          writing_prompt: null,
          choice_options: [],
          allow_multiple_choices: false,
          estimated_minutes: draft.estimated_minutes,
          monthly_goal_total: null,
          coin_reward_trigger: "none" as const,
          gold_coin_reward_amount: 0,
          weekly_days: [],
          position: moduleTasks.length + index,
          is_active: true,
        })),
      )
      .select("id");

    if (insertError || !insertedTasks) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(insertError?.message),
        ),
      );
    }

    insertedIds = insertedTasks.map((task) => task.id);
  }

  const finalFocusTaskIds: string[] = [];
  let insertedIndex = 0;
  for (const draft of miniTasks) {
    if (draft.id && existingFocusTaskIds.has(draft.id)) {
      finalFocusTaskIds.push(draft.id);
    } else {
      const insertedId = insertedIds[insertedIndex];
      if (insertedId) {
        finalFocusTaskIds.push(insertedId);
      }
      insertedIndex += 1;
    }
  }

  const removedTaskIds = existingFocusTasks
    .map((task) => task.id)
    .filter((taskId) => !finalFocusTaskIds.includes(taskId));

  if (removedTaskIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("course_tasks")
      .delete()
      .in("id", removedTaskIds)
      .eq("parent_user_id", user.id);

    if (deleteError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(deleteError.message),
        ),
      );
    }
  }

  const finalOrderedTaskIds = [
    ...beforeTasks.map((task) => task.id),
    ...finalFocusTaskIds,
    ...afterTasks.map((task) => task.id),
  ];
  const positionError = await updateTaskPositions(supabase, user.id, finalOrderedTaskIds);

  if (positionError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(positionError.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block"));
}

export async function deleteFocusBlock(formData: FormData) {
  const focusBlockId = formData.get("focus_block_id");
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );

  if (typeof focusBlockId !== "string" || !focusBlockId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that focus block."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error: taskDeleteError } = await supabase
    .from("course_tasks")
    .delete()
    .eq("focus_block_id", focusBlockId)
    .eq("parent_user_id", user.id);

  if (taskDeleteError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(taskDeleteError.message),
      ),
    );
  }

  const { error: focusBlockDeleteError } = await supabase
    .from("focus_blocks")
    .delete()
    .eq("id", focusBlockId)
    .eq("parent_user_id", user.id);

  if (focusBlockDeleteError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(focusBlockDeleteError.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "focus block"));
}

export async function deleteFocusBlockInlineAction(input: {
  focusBlockId: string;
}): Promise<DeleteActionResult> {
  if (!input.focusBlockId) {
    return invalidDelete("We couldn't find that focus block.");
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return invalidDelete("Please log in again.");
  }

  const { data: focusBlock, error: focusBlockLookupError } = await supabase
    .from("focus_blocks")
    .select("id, course_id, module_id")
    .eq("id", input.focusBlockId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (focusBlockLookupError) {
    return invalidDelete(getFriendlyCourseDatabaseError(focusBlockLookupError.message));
  }

  if (!focusBlock) {
    return invalidDelete("We couldn't find that focus block.");
  }

  const { error: taskDeleteError } = await supabase
    .from("course_tasks")
    .delete()
    .eq("focus_block_id", input.focusBlockId)
    .eq("parent_user_id", user.id);

  if (taskDeleteError) {
    return invalidDelete(getFriendlyCourseDatabaseError(taskDeleteError.message));
  }

  const { error: focusBlockDeleteError } = await supabase
    .from("focus_blocks")
    .delete()
    .eq("id", input.focusBlockId)
    .eq("parent_user_id", user.id);

  if (focusBlockDeleteError) {
    return invalidDelete(getFriendlyCourseDatabaseError(focusBlockDeleteError.message));
  }

  revalidatePath(`/courses/${focusBlock.course_id}`);
  revalidatePath(`/courses/${focusBlock.course_id}/modules/${focusBlock.module_id}`);

  return {
    ok: true,
    deletedId: input.focusBlockId,
  };
}
