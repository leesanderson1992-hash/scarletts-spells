import { buildScopedPath, type AppMode } from "@/lib/children";
import {
  COURSE_COIN_REWARD_TRIGGER_LABELS,
  COURSE_TASK_TYPE_LABELS,
  type AuthoringUnitViewModel,
  type CourseTaskRow,
  type FocusBlockRow,
  type ModuleAuthoringViewModel,
  type TaskRowViewModel,
  WEEKDAY_OPTIONS,
} from "@/lib/courses/types";
import { getCourseTaskProgressState, isTaskCompleteForProgress } from "@/lib/courses/progress";

type ModuleAuthoringInput = {
  courseId: string;
  moduleId: string;
  courseStructure: "phased" | "timed";
  scopedCurrentPath: string;
  selectedChildId: string | null;
  mode: AppMode;
  isAddingTask: boolean;
  editingTaskId: string | null;
  editingFocusBlockId: string | null;
  showFocusBlockField: boolean;
  tasks: CourseTaskRow[];
  focusBlocks: FocusBlockRow[];
  completions: Array<{
    task_id: string;
    completion_date: string;
    quantity_completed: number;
  }>;
  submissions: Array<{
    task_id: string;
    parent_review_status?: "pending" | "approved" | "returned";
    parent_review_note?: string | null;
  }>;
};

function formatWeekdayLabels(weekdays: string[] | null | undefined) {
  if (!weekdays?.length) {
    return null;
  }

  const labelByValue: Record<string, string> = Object.fromEntries(
    WEEKDAY_OPTIONS.map((day) => [day.value, day.label]),
  );
  return weekdays.map((day) => labelByValue[day] ?? day).join(", ");
}

function getRecurringPaceText(taskType: CourseTaskRow["task_type"], monthlyGoalTotal: number | null) {
  if (!monthlyGoalTotal) {
    return null;
  }

  if (taskType === "recurring_daily") {
    return `About ${Math.max(1, Math.ceil(monthlyGoalTotal / 30))} a day`;
  }

  if (taskType === "recurring_weekly") {
    return `About ${Math.max(1, Math.ceil(monthlyGoalTotal / 4))} a week`;
  }

  return null;
}

function getTaskPlanSummary(task: CourseTaskRow) {
  if (task.task_type === "recurring_daily") {
    return {
      heading: "Daily habit",
      detail: task.monthly_goal_total
        ? `Monthly target ${task.monthly_goal_total} · ${getRecurringPaceText(task.task_type, task.monthly_goal_total)}`
        : "Add a monthly target to guide the pace",
    };
  }

  if (task.task_type === "recurring_weekly") {
    const weekdayText = formatWeekdayLabels(task.weekly_days);
    return {
      heading: "Weekly goal",
      detail: [
        task.monthly_goal_total
          ? `Monthly target ${task.monthly_goal_total}`
          : "Add a monthly target",
        getRecurringPaceText(task.task_type, task.monthly_goal_total),
        weekdayText ? `Good days: ${weekdayText}` : "Good days not set",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    heading: "One-off task",
    detail: task.estimated_minutes ? `${task.estimated_minutes} min` : "No time set",
  };
}

function getTaskRewardSummary(task: CourseTaskRow) {
  if (task.coin_reward_trigger === "none" || task.gold_coin_reward_amount < 1) {
    return `${COURSE_COIN_REWARD_TRIGGER_LABELS.none} · no direct Gold Coins`;
  }

  return `${COURSE_COIN_REWARD_TRIGGER_LABELS[task.coin_reward_trigger]} · ${task.gold_coin_reward_amount} Gold Coin${task.gold_coin_reward_amount === 1 ? "" : "s"}`;
}

function getChoiceOptionsText(choiceOptions: string[] | null | undefined) {
  return (choiceOptions ?? []).join("\n");
}

function getFocusBlockRewardSummary(focusBlock: Pick<FocusBlockRow, "coin_reward_trigger" | "gold_coin_reward_amount">) {
  if (focusBlock.coin_reward_trigger === "none" || focusBlock.gold_coin_reward_amount < 1) {
    return `${COURSE_COIN_REWARD_TRIGGER_LABELS.none} · no direct Gold Coins`;
  }

  return `${COURSE_COIN_REWARD_TRIGGER_LABELS.on_completion} · ${focusBlock.gold_coin_reward_amount} Gold Coin${focusBlock.gold_coin_reward_amount === 1 ? "" : "s"}`;
}

function withQuery(path: string, updates: Record<string, string | null | undefined>) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function buildModuleAuthoringViewModel({
  courseId,
  moduleId,
  courseStructure,
  scopedCurrentPath,
  selectedChildId,
  mode,
  isAddingTask,
  editingTaskId,
  editingFocusBlockId,
  showFocusBlockField,
  tasks,
  focusBlocks,
  completions,
  submissions,
}: ModuleAuthoringInput): ModuleAuthoringViewModel {
  const taskStateById = new Map(
    tasks.map((task) => [
      task.id,
      getCourseTaskProgressState(task, completions, submissions),
    ]),
  );

  const focusBlockTaskGroups = new Map(
    focusBlocks.map((focusBlock) => {
      const groupedTasks = tasks
        .filter((task) => task.focus_block_id === focusBlock.id)
        .sort((left, right) => left.position - right.position);
      const completedCount = groupedTasks.filter((task) =>
        isTaskCompleteForProgress(task, completions, submissions),
      ).length;
      const nextTask =
        groupedTasks.find((task) => !isTaskCompleteForProgress(task, completions, submissions)) ?? null;

      return [
        focusBlock.id,
        {
          focusBlock,
          tasks: groupedTasks,
          completedCount,
          nextTask,
        },
      ] as const;
    }),
  );

  const authoringUnits: Array<{ kind: "task" | "focus_block"; id: string }> = [];
  for (const task of tasks) {
    if (task.focus_block_id) {
      if (authoringUnits[authoringUnits.length - 1]?.id !== task.focus_block_id) {
        authoringUnits.push({ kind: "focus_block", id: task.focus_block_id });
      }
      continue;
    }

    authoringUnits.push({ kind: "task", id: task.id });
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const focusBlockMoveState = new Map(
    authoringUnits
      .map((unit, index) =>
        unit.kind === "focus_block"
          ? [
              unit.id,
              {
                canMoveUp: index > 0,
                canMoveDown: index < authoringUnits.length - 1,
              },
            ]
          : null,
      )
      .filter(Boolean) as Array<[string, { canMoveUp: boolean; canMoveDown: boolean }]>,
  );

  const units: AuthoringUnitViewModel[] = [];
  for (const unit of authoringUnits) {
    if (unit.kind === "focus_block") {
      const focusGroup = focusBlockTaskGroups.get(unit.id);
      if (!focusGroup) {
        continue;
      }

      units.push({
        kind: "focus_block",
        id: focusGroup.focusBlock.id,
        title: focusGroup.focusBlock.title,
        goal: focusGroup.focusBlock.goal,
        description: focusGroup.focusBlock.description,
        statusLabel: focusGroup.completedCount === focusGroup.tasks.length ? "Complete" : "Active",
        planLabel: focusGroup.nextTask
          ? `Next: ${focusGroup.nextTask.title}`
          : "All mini tasks complete",
        rewardLabel: getFocusBlockRewardSummary(focusGroup.focusBlock),
        focusLabel: `Cycle ${focusGroup.focusBlock.cycle_number ?? "not set"}`,
        completedSummary: `${focusGroup.completedCount} of ${focusGroup.tasks.length} mini tasks complete${focusGroup.nextTask ? ` · Next: ${focusGroup.nextTask.title}` : " · Focus block complete"}`,
        editHref: withQuery(scopedCurrentPath, { editFocus: focusGroup.focusBlock.id }),
        closeEditHref: withQuery(scopedCurrentPath, { editFocus: null }),
        deleteFormId: `delete-focus-block-form-${focusGroup.focusBlock.id}`,
        moveUpFormId: `move-focus-block-up-form-${focusGroup.focusBlock.id}`,
        moveDownFormId: `move-focus-block-down-form-${focusGroup.focusBlock.id}`,
        canMoveUp: focusBlockMoveState.get(focusGroup.focusBlock.id)?.canMoveUp ?? false,
        canMoveDown: focusBlockMoveState.get(focusGroup.focusBlock.id)?.canMoveDown ?? false,
        isEditing: editingFocusBlockId === focusGroup.focusBlock.id,
        redirectPath: withQuery(scopedCurrentPath, { editFocus: null }),
        groupTaskIds: focusGroup.tasks.map((miniTask) => miniTask.id),
        miniTasks: focusGroup.tasks.map((miniTask) => {
          const miniTaskState = taskStateById.get(miniTask.id) ?? "not_started";
          return {
            id: miniTask.id,
            title: miniTask.title,
            instructions: miniTask.instructions,
            estimatedMinutes: miniTask.estimated_minutes,
            stateLabel:
              miniTaskState === "complete"
                ? "Complete"
                : focusGroup.nextTask?.id === miniTask.id
                  ? "Next up"
                  : "Queued",
          };
        }),
      });
      continue;
    }

    const task = taskById.get(unit.id);
    if (!task) {
      continue;
    }

    const planSummary = getTaskPlanSummary(task);
    const selectedFocusBlock =
      focusBlocks.find((focusBlock) => focusBlock.id === task.focus_block_id) ?? null;
    const canDuplicate =
      courseStructure === "phased" || task.task_type === "lesson" || task.task_type === "test";

    units.push({
      kind: "task",
      id: task.id,
      title: task.title,
      instructions: task.instructions,
      lessonSchema: task.lesson_schema ?? null,
      taskType: task.task_type,
      taskTypeLabel: COURSE_TASK_TYPE_LABELS[task.task_type],
      isActive: task.is_active,
      planSummary,
      rewardSummary: getTaskRewardSummary(task),
      coinRewardTrigger: task.coin_reward_trigger,
      goldCoinRewardAmount: task.gold_coin_reward_amount,
      focusBlockLabel: selectedFocusBlock?.title ?? null,
      focusBlockOptions: focusBlocks.map((focusBlock) => ({
        id: focusBlock.id,
        title: focusBlock.title,
      })),
      notesLabel: task.writing_prompt || "No prompt",
      notesDetail: task.choice_options?.length
        ? `${task.choice_options.length} choice option${task.choice_options.length === 1 ? "" : "s"}${task.allow_multiple_choices ? " · multi-select" : ""}`
        : null,
      isEditing: editingTaskId === task.id,
      canMoveUp: tasks[0]?.id !== task.id,
      canMoveDown: tasks[tasks.length - 1]?.id !== task.id,
      canDuplicate,
      formId: `task-form-${task.id}`,
      duplicateFormId: `duplicate-task-form-${task.id}`,
      moveUpFormId: `move-task-up-form-${task.id}`,
      moveDownFormId: `move-task-down-form-${task.id}`,
      deleteFormId: `delete-task-form-${task.id}`,
      stopEditingHref: withQuery(scopedCurrentPath, { edit: null }),
      fullEditHref: buildScopedPath(
        `/courses/${courseId}/modules/${moduleId}/tasks/${task.id}/edit`,
        selectedChildId,
        mode,
      ),
      estimatedMinutes: task.estimated_minutes,
      monthlyGoalTotal: task.monthly_goal_total,
      weeklyDays: task.weekly_days,
      recurringPaceHint: getRecurringPaceText(task.task_type, task.monthly_goal_total),
      weekdaySummary: formatWeekdayLabels(task.weekly_days),
      writingPrompt: task.writing_prompt,
      choiceOptionsText: getChoiceOptionsText(task.choice_options),
      allowMultipleChoices: task.allow_multiple_choices,
      selectedFocusBlockId: task.focus_block_id,
    } satisfies TaskRowViewModel);
  }

  return {
    taskCount: tasks.length,
    addTaskHref: withQuery(scopedCurrentPath, { add: "task", edit: null }),
    closeAddTaskHref: withQuery(scopedCurrentPath, { add: null }),
    isAddingTask,
    showFocusBlockField,
    focusBlockOptions: focusBlocks.map((focusBlock) => ({
      id: focusBlock.id,
      title: focusBlock.title,
    })),
    units,
  };
}
