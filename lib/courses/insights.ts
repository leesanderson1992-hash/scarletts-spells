import {
  getCourseTaskProgressState,
  getExpectedProgressByNow,
  getMissedRecurringEventSummaries,
  getModuleCompletionMap,
  type RecurringProgressWindowContext,
  getWindowRange,
  getRecurringTaskProgressSummary,
} from "@/lib/courses/progress";
import {
  getCourseWindowContext,
  getCurrentCycle,
  getCycleDateRange,
  getNextCheckpoint,
  getPhaseWindowContext,
} from "@/lib/courses/queries";

import type {
  CourseCheckpointRow,
  CourseDetail,
  CourseGoalRow,
  CourseTaskRow,
  TaskCompletionRow,
  TaskSubmissionRow,
} from "./types";
import { getTimedCourseGoalKind } from "./types";

type CompletionLike = Pick<TaskCompletionRow, "task_id" | "completion_date" | "quantity_completed">;
type SubmissionLike = {
  task_id: string;
  parent_review_status?: TaskSubmissionRow["parent_review_status"];
};

export type ParentInsightWarningSeverity = "info" | "watch";

export type ParentInsightWarning = {
  kind: "locked_path" | "behind_recurring_pace" | "behind_goal_pace" | "missed_recurring" | "review_marker";
  severity: ParentInsightWarningSeverity;
  title: string;
  detail: string;
};

export type ProgressPathPhaseSummary = {
  phaseId: string;
  title: string;
  unlockedModuleCount: number;
  lockedModuleCount: number;
  completedModuleCount: number;
  moduleCount: number;
};

export type ProgressCourseInsightSummary = {
  structureType: "phased";
  courseId: string;
  courseTitle: string;
  unlockedModuleCount: number;
  lockedModuleCount: number;
  completedModuleCount: number;
  moduleCount: number;
  nextUnlockedModuleTitle: string | null;
  nextLockedModuleTitle: string | null;
  nextReviewMarker: CourseCheckpointRow | null;
  phasePath: ProgressPathPhaseSummary[];
  warnings: ParentInsightWarning[];
};

export type TimedRecurringPaceSummary = {
  taskId: string;
  title: string;
  taskType: "recurring_daily" | "recurring_weekly";
  allTimeTotal: number;
  windowType: "month" | "phase" | "course";
  windowStart: string;
  windowEnd: string;
  windowTotal: number;
  targetAmount: number;
  expectedByNow: number;
  behindBy: number;
  remainingToTarget: number;
  windowLabel: string;
};

export type TimedRecurringProgressByWindow = {
  month: TimedRecurringPaceSummary[];
  phase: TimedRecurringPaceSummary[];
  course: TimedRecurringPaceSummary[];
};

export type TimedCourseInsightSummary = {
  structureType: "timed";
  courseId: string;
  courseTitle: string;
  currentCycle: number | null;
  currentCycleRange: { start: string; end: string } | null;
  currentFocusTitle: string | null;
  nextReviewMarker: CourseCheckpointRow | null;
  missedWeeklyCount: number;
  recurringTaskCount: number;
  recurringProgressByWindow: TimedRecurringProgressByWindow;
  behindPaceTasks: TimedRecurringPaceSummary[];
  goalProgress: GoalProgressSummary[];
  behindGoalPaceGoals: GoalProgressSummary[];
  warnings: ParentInsightWarning[];
};

export type ParentCourseInsightSummary =
  | ProgressCourseInsightSummary
  | TimedCourseInsightSummary;

export type GoalProgressCourseContext = {
  courseId: string;
  structureType: "phased" | "timed";
  currentPhaseId?: string | null;
  phaseWindows?: Array<{ phaseId: string; start: string; end: string }>;
  courseWindow?: { start: string; end: string } | null;
};

export type GoalProgressSummary = {
  goalId: string;
  title: string;
  status: CourseGoalRow["status"];
  supported: boolean;
  windowType: "phase" | "course";
  recurringTaskIds: string[];
  recurringTaskTitles: string[];
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel: string | null;
  aggregatedWindowTotal: number;
  targetAmount: number;
  remainingToTarget: number;
  progressPercent: number;
  expectedByNow: number;
  behindBy: number;
};

export function getGoalProgressSummary(
  goal: Pick<CourseGoalRow, "id" | "title" | "status" | "time_span" | "target_quantity">,
  context: GoalProgressCourseContext,
  referenceDate: string,
  recurringTaskSummaries: Array<{
    taskId: string;
    title: string;
    windowStart: string;
    windowEnd: string;
    windowLabel: string;
    windowTotal: number;
  }>,
  recurringTaskIds: string[],
): GoalProgressSummary {
  const scopedSummaries = recurringTaskSummaries.filter((summary) =>
    recurringTaskIds.includes(summary.taskId),
  );
  const windowType = goal.time_span === "cycle" ? "phase" : "course";
  const resolvedWindow =
    windowType === "course"
      ? context.courseWindow
        ? getWindowRange(
            {
              windowType: "course",
              startDate: context.courseWindow.start,
              endDate: context.courseWindow.end,
            },
            context.courseWindow.start,
          )
        : null
      : (() => {
          const currentPhaseWindow =
            context.phaseWindows?.find((phase) => phase.phaseId === context.currentPhaseId) ??
            context.phaseWindows?.[0] ??
            null;

          return currentPhaseWindow
            ? getWindowRange(
                {
                  windowType: "phase",
                  startDate: currentPhaseWindow.start,
                  endDate: currentPhaseWindow.end,
                },
                currentPhaseWindow.start,
              )
            : null;
        })();
  const supported = recurringTaskIds.length > 0 && Boolean(resolvedWindow);
  const aggregatedWindowTotal = scopedSummaries.reduce((sum, summary) => sum + summary.windowTotal, 0);
  const expectedByNow = resolvedWindow
    ? getExpectedProgressByNow(
        goal.target_quantity,
        referenceDate,
        resolvedWindow.start,
        resolvedWindow.end,
      )
    : 0;
  const behindBy = Math.max(expectedByNow - aggregatedWindowTotal, 0);
  const remainingToTarget = Math.max(goal.target_quantity - aggregatedWindowTotal, 0);
  const progressPercent =
    goal.target_quantity > 0
      ? Math.min(100, Math.round((aggregatedWindowTotal / goal.target_quantity) * 100))
      : 0;

  return {
    goalId: goal.id,
    title: goal.title,
    status: goal.status,
    supported,
    windowType,
    recurringTaskIds,
    recurringTaskTitles: scopedSummaries.map((summary) => summary.title),
    windowStart: resolvedWindow?.start ?? null,
    windowEnd: resolvedWindow?.end ?? null,
    windowLabel: resolvedWindow?.label ?? null,
    aggregatedWindowTotal,
    targetAmount: goal.target_quantity,
    remainingToTarget,
    progressPercent,
    expectedByNow,
    behindBy,
  };
}

function buildProgressCourseInsightSummary(
  detail: CourseDetail,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
  today: string,
): ProgressCourseInsightSummary {
  const moduleCompletionById = getModuleCompletionMap(detail.modules, completions, submissions);
  const phaseGroups = detail.phases.map((phase) => ({
    ...phase,
    modules: detail.modules.filter((module) => module.phase_id === phase.id),
  }));
  const orderedModules = phaseGroups.flatMap((phase) => phase.modules);
  const unlockedModuleIds = new Set<string>();
  let previousComplete = true;

  for (const courseModule of orderedModules) {
    if (previousComplete) {
      unlockedModuleIds.add(courseModule.id);
    }

    previousComplete = moduleCompletionById.get(courseModule.id) ?? false;
  }

  const completedModuleCount = orderedModules.filter(
    (module) => moduleCompletionById.get(module.id) ?? false,
  ).length;
  const unlockedModuleCount = orderedModules.filter((module) =>
    unlockedModuleIds.has(module.id),
  ).length;
  const lockedModuleCount = Math.max(orderedModules.length - unlockedModuleCount, 0);
  const nextUnlockedModuleTitle =
    orderedModules.find(
      (module) =>
        unlockedModuleIds.has(module.id) && !(moduleCompletionById.get(module.id) ?? false),
    )?.title ?? null;
  const nextLockedModuleTitle =
    orderedModules.find((module) => !unlockedModuleIds.has(module.id))?.title ?? null;
  const nextReviewMarker = getNextCheckpoint(detail.checkpoints, new Date(`${today}T12:00:00`));
  const phasePath = phaseGroups.map((phase) => {
    const unlockedModules = phase.modules.filter((module) => unlockedModuleIds.has(module.id));
    const completedModules = phase.modules.filter(
      (module) => moduleCompletionById.get(module.id) ?? false,
    );

    return {
      phaseId: phase.id,
      title: phase.title,
      unlockedModuleCount: unlockedModules.length,
      lockedModuleCount: Math.max(phase.modules.length - unlockedModules.length, 0),
      completedModuleCount: completedModules.length,
      moduleCount: phase.modules.length,
    };
  });

  const warnings: ParentInsightWarning[] = [];

  if (lockedModuleCount > 0) {
    warnings.push({
      kind: "locked_path",
      severity: "info",
      title: `${lockedModuleCount} module${lockedModuleCount === 1 ? "" : "s"} still locked`,
      detail: nextLockedModuleTitle
        ? `${nextLockedModuleTitle} will unlock when the earlier module path is complete.`
        : "More modules are waiting behind the current path.",
    });
  }

  if (nextReviewMarker?.title) {
    warnings.push({
      kind: "review_marker",
      severity: "info",
      title: `Next review: ${nextReviewMarker.title}`,
      detail: nextReviewMarker.scheduled_date
        ? `Planned for ${nextReviewMarker.scheduled_date}.`
        : "Review markers stay informational and do not block progression.",
    });
  }

  return {
    structureType: "phased",
    courseId: detail.course.id,
    courseTitle: detail.course.title,
    unlockedModuleCount,
    lockedModuleCount,
    completedModuleCount,
    moduleCount: orderedModules.length,
    nextUnlockedModuleTitle,
    nextLockedModuleTitle,
    nextReviewMarker,
    phasePath,
    warnings,
  };
}

function buildTimedCourseInsightSummary(
  detail: CourseDetail,
  completions: CompletionLike[],
  today: string,
): TimedCourseInsightSummary {
  const recurringTasks = detail.modules
    .flatMap((module) => module.tasks)
    .filter(
      (task): task is CourseTaskRow & { task_type: "recurring_daily" | "recurring_weekly" } =>
        task.is_active &&
        (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly"),
    );
  const currentPhase =
    detail.phases.find(
      (phase) =>
        phase.start_date &&
        phase.end_date &&
        today >= phase.start_date &&
        today <= phase.end_date,
    ) ??
    detail.phases.find((phase) => phase.start_date && phase.end_date && today < phase.start_date) ??
    null;
  const phaseWindowBase = currentPhase ? getPhaseWindowContext(currentPhase) : null;
  const courseWindowBase = getCourseWindowContext(detail.course);
  const monthWindowContext: RecurringProgressWindowContext = {
    windowType: "month",
    referenceDate: today,
  };
  const phaseWindowContext = phaseWindowBase
    ? { ...phaseWindowBase, referenceDate: today }
    : null;
  const courseWindowContext = courseWindowBase
    ? { ...courseWindowBase, referenceDate: today }
    : null;

  function buildRecurringWindowSummaries(
    windowContext: RecurringProgressWindowContext | null,
  ) {
    if (!windowContext) {
      return [];
    }

    return recurringTasks
      .map((task) => {
        const summary = getRecurringTaskProgressSummary(task, completions, windowContext);

        if (!summary) {
          return null;
        }

        return {
          taskId: task.id,
          title: task.title,
          taskType: task.task_type,
          allTimeTotal: summary.allTimeTotal,
          windowType: summary.windowType,
          windowStart: summary.windowStart,
          windowEnd: summary.windowEnd,
          windowTotal: summary.windowTotal,
          targetAmount: summary.targetAmount,
          expectedByNow: summary.expectedByNow,
          behindBy: summary.behindBy,
          remainingToTarget: summary.remainingToTarget,
          windowLabel: summary.windowLabel,
        };
      })
      .filter(
        (
          task,
        ): task is {
          taskId: string;
          title: string;
          taskType: "recurring_daily" | "recurring_weekly";
          allTimeTotal: number;
          windowType: "day" | "week" | "month" | "phase" | "course";
          windowStart: string;
          windowEnd: string;
          windowTotal: number;
          targetAmount: number;
          expectedByNow: number;
          behindBy: number;
          remainingToTarget: number;
          windowLabel: string;
        } => Boolean(task),
      );
  }

  function buildRecurringProgressForWindow(
    windowType: "month" | "phase" | "course",
    windowContext: RecurringProgressWindowContext | null,
  ) {
    return buildRecurringWindowSummaries(windowContext)
      .map((summary) => {
        if (summary.targetAmount <= 0) {
          return null;
        }

        return {
          taskId: summary.taskId,
          title: summary.title,
          taskType: summary.taskType,
          allTimeTotal: summary.allTimeTotal,
          windowType,
          windowStart: summary.windowStart,
          windowEnd: summary.windowEnd,
          windowTotal: summary.windowTotal,
          targetAmount: summary.targetAmount,
          expectedByNow: summary.expectedByNow,
          behindBy: summary.behindBy,
          remainingToTarget: summary.remainingToTarget,
          windowLabel: summary.windowLabel,
        } satisfies TimedRecurringPaceSummary;
      })
      .filter((task): task is TimedRecurringPaceSummary => Boolean(task))
      .sort((left, right) => right.behindBy - left.behindBy || left.title.localeCompare(right.title));
  }

  const recurringProgressByWindow: TimedRecurringProgressByWindow = {
    month: buildRecurringProgressForWindow("month", monthWindowContext),
    phase: buildRecurringProgressForWindow("phase", phaseWindowContext),
    course: buildRecurringProgressForWindow("course", courseWindowContext),
  };
  const recurringWindowSummariesByType = {
    month: buildRecurringWindowSummaries(monthWindowContext),
    phase: buildRecurringWindowSummaries(phaseWindowContext),
    course: buildRecurringWindowSummaries(courseWindowContext),
  } as const;
  const behindPaceTasks = recurringProgressByWindow.month.filter((task) => task.behindBy > 0);
  const recurringTaskTitleById = new Map(recurringTasks.map((task) => [task.id, task.title]));
  const recurringTaskIdsByGoal = new Map<string, string[]>();

  detail.goalTaskSources.forEach((source) => {
    const existing = recurringTaskIdsByGoal.get(source.goal_id) ?? [];
    recurringTaskIdsByGoal.set(source.goal_id, [...existing, source.task_id]);
  });

  const goalProgress = detail.goals
    .filter((goal) => getTimedCourseGoalKind(goal) === "numerical")
    .map((goal) => {
      const windowType = goal.time_span === "cycle" ? "phase" : "course";
      const recurringTaskIds = recurringTaskIdsByGoal.get(goal.id) ?? [];
      const scopedRecurringTaskIds = recurringTaskIds.filter((taskId) => recurringTaskTitleById.has(taskId));

      return getGoalProgressSummary(
        goal,
        {
          courseId: detail.course.id,
          structureType: "timed",
          currentPhaseId: currentPhase?.id ?? null,
          phaseWindows: detail.phases
            .filter((phase) => phase.start_date && phase.end_date)
            .map((phase) => ({
              phaseId: phase.id,
              start: phase.start_date as string,
              end: phase.end_date as string,
            })),
          courseWindow:
            courseWindowBase?.startDate && courseWindowBase?.endDate
              ? {
                  start: courseWindowBase.startDate,
                  end: courseWindowBase.endDate,
                }
              : null,
        },
        today,
        recurringWindowSummariesByType[windowType],
        scopedRecurringTaskIds,
      );
    })
    .sort((left, right) => right.behindBy - left.behindBy || left.title.localeCompare(right.title));
  const behindGoalPaceGoals = goalProgress.filter((goal) => goal.supported && goal.behindBy > 0);
  const missedWeeklySummaries = getMissedRecurringEventSummaries(recurringTasks, completions, today);
  const currentCycle = getCurrentCycle(
    detail.course.start_date,
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
  );
  const currentCycleRange = getCycleDateRange(
    detail.course.start_date,
    detail.course.cycle_length_weeks,
    currentCycle,
  );
  const currentFocusTitle =
    detail.focusBlocks.find((focusBlock) =>
      currentCycle ? focusBlock.cycle_number === currentCycle : focusBlock.is_active,
    )?.title ??
    detail.focusBlocks.find((focusBlock) => focusBlock.is_active)?.title ??
    null;
  const nextReviewMarker = getNextCheckpoint(detail.checkpoints, new Date(`${today}T12:00:00`));
  const warnings: ParentInsightWarning[] = [];

  if (behindPaceTasks.length > 0) {
    const mostBehindTask = behindPaceTasks[0];
    warnings.push({
      kind: "behind_recurring_pace",
      severity: "watch",
      title: `${behindPaceTasks.length} recurring pacing signal${behindPaceTasks.length === 1 ? "" : "s"}`,
      detail: `${mostBehindTask.title} is ${mostBehindTask.behindBy} behind the month-to-date recommendation.`,
    });
  }

  if (behindGoalPaceGoals.length > 0) {
    const mostBehindGoal = behindGoalPaceGoals[0];
    warnings.push({
      kind: "behind_goal_pace",
      severity: "watch",
      title: `${behindGoalPaceGoals.length} numerical goal${behindGoalPaceGoals.length === 1 ? "" : "s"} behind pace`,
      detail: `${mostBehindGoal.title} is ${mostBehindGoal.behindBy} behind the ${mostBehindGoal.windowType} target.`,
    });
  }

  if (missedWeeklySummaries.length > 0) {
    warnings.push({
      kind: "missed_recurring",
      severity: "watch",
      title: `${missedWeeklySummaries.length} weekly event${missedWeeklySummaries.length === 1 ? "" : "s"} missed last week`,
      detail: "Missed weeks stay in parent insights rather than creating duplicate backlog cards.",
    });
  }

  if (nextReviewMarker?.title) {
    warnings.push({
      kind: "review_marker",
      severity: "info",
      title: `Next checkpoint: ${nextReviewMarker.title}`,
      detail: nextReviewMarker.scheduled_date
        ? `Planned for ${nextReviewMarker.scheduled_date}.`
        : "Checkpoint rhythm is informational and does not change completion truth.",
    });
  }

  return {
    structureType: "timed",
    courseId: detail.course.id,
    courseTitle: detail.course.title,
    currentCycle,
    currentCycleRange,
    currentFocusTitle,
    nextReviewMarker,
    missedWeeklyCount: missedWeeklySummaries.length,
    recurringTaskCount: recurringTasks.length,
    recurringProgressByWindow,
    behindPaceTasks,
    goalProgress,
    behindGoalPaceGoals,
    warnings,
  };
}

export function getParentCourseInsightSummary(
  detail: CourseDetail,
  activity: {
    completions: CompletionLike[];
    submissions: SubmissionLike[];
  },
  today: string,
): ParentCourseInsightSummary {
  if (detail.course.structure_type === "phased") {
    return buildProgressCourseInsightSummary(
      detail,
      activity.completions,
      activity.submissions,
      today,
    );
  }

  return buildTimedCourseInsightSummary(
    detail,
    activity.completions,
    today,
  );
}

export function getCourseTaskCounts(
  detail: CourseDetail,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
) {
  const tasks = detail.modules.flatMap((module) => module.tasks).filter((task) => task.is_active);
  const completedCount = tasks.filter(
    (task) => getCourseTaskProgressState(task, completions, submissions) === "complete",
  ).length;
  const movingCount = tasks.filter(
    (task) => getCourseTaskProgressState(task, completions, submissions) === "in_progress",
  ).length;

  return {
    completedCount,
    movingCount,
  };
}
