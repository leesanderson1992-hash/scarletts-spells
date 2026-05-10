import {
  isSubmissionActive,
  isSubmissionApproved,
  isSubmissionReturned,
  type ParentReviewStatus,
} from "@/lib/submissions/status";

type TaskLike = {
  id: string;
  task_type: string;
  monthly_goal_total: number | null;
  coin_reward_trigger?: "none" | "on_completion" | "on_approval" | "on_target" | null;
  gold_coin_reward_amount?: number | null;
  is_active?: boolean;
};

type CompletionLike = {
  id?: string;
  task_id: string;
  completion_date: string;
  quantity_completed: number;
};

type SubmissionLike = {
  task_id: string;
  parent_review_status?: ParentReviewStatus;
  parent_review_note?: string | null;
};

export function getDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStartOfWeekDateOnly(dateInput: Date | string) {
  const date =
    typeof dateInput === "string" ? new Date(`${dateInput}T12:00:00`) : new Date(dateInput);
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  start.setHours(12, 0, 0, 0);
  return getDateOnly(start);
}

export function getEndOfWeekDateOnly(dateInput: Date | string) {
  const end = new Date(`${getStartOfWeekDateOnly(dateInput)}T12:00:00`);
  end.setDate(end.getDate() + 6);
  return getDateOnly(end);
}

function isDateWithinWeek(dateOnly: string, referenceDate: string) {
  return (
    dateOnly >= getStartOfWeekDateOnly(referenceDate) &&
    dateOnly <= getEndOfWeekDateOnly(referenceDate)
  );
}

export type CourseProgressState = "not_started" | "in_progress" | "complete";

export const COURSE_PROGRESS_LABELS: Record<CourseProgressState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function getCourseProgressBadgeClasses(state: CourseProgressState) {
  if (state === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "in_progress") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-[var(--border)] bg-white text-[color:var(--mid)]";
}

export function getFocusBlockProgressState(input: {
  isActive: boolean;
  totalTaskCount?: number;
  completedTaskCount?: number;
  relatedProgressCount?: number;
}): CourseProgressState {
  if (!input.isActive) {
    return "complete";
  }

  const totalTaskCount = input.totalTaskCount ?? 0;
  const completedTaskCount = input.completedTaskCount ?? 0;
  if (totalTaskCount > 0 && completedTaskCount >= totalTaskCount) {
    return "complete";
  }

  if ((input.relatedProgressCount ?? 0) > 0) {
    return "in_progress";
  }

  return "not_started";
}

export function getAggregateProgressState(
  states: CourseProgressState[],
): CourseProgressState {
  if (states.length === 0) {
    return "not_started";
  }

  if (states.every((state) => state === "complete")) {
    return "complete";
  }

  if (states.some((state) => state === "in_progress" || state === "complete")) {
    return "in_progress";
  }

  return "not_started";
}

export function getLatestSubmissionForTask(
  taskId: string,
  submissions: SubmissionLike[],
) {
  return submissions.find((submission) => submission.task_id === taskId) ?? null;
}

export function hasApprovedSubmissionForTask(
  taskId: string,
  submissions: SubmissionLike[],
) {
  const latestSubmission = getLatestSubmissionForTask(taskId, submissions);
  return Boolean(latestSubmission && isSubmissionApproved(latestSubmission.parent_review_status));
}

export function hasActiveSubmissionForTask(
  taskId: string,
  submissions: SubmissionLike[],
) {
  const latestSubmission = getLatestSubmissionForTask(taskId, submissions);
  return Boolean(latestSubmission && isSubmissionActive(latestSubmission.parent_review_status));
}

export function isTaskCompleteForProgress(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
) {
  if (task.is_active === false) {
    return true;
  }

  if (task.task_type === "lesson" || task.task_type === "test") {
    return hasApprovedSubmissionForTask(task.id, submissions);
  }

  if (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") {
    const monthlyCompletedTotal =
      getRecurringTaskProgressSummary(task, completions, {
        windowType: "month",
        referenceDate: getDateOnly(),
      })?.windowTotal ?? 0;
    return task.monthly_goal_total
      ? monthlyCompletedTotal >= task.monthly_goal_total
      : monthlyCompletedTotal > 0;
  }

  return completions.some((completion) => completion.task_id === task.id);
}

export function isTaskDoneForChildSurface(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
  today = getDateOnly(),
) {
  if (task.task_type === "lesson" || task.task_type === "test") {
    return hasActiveSubmissionForTask(task.id, submissions);
  }

  if (task.task_type === "recurring_daily") {
    return completions
      .filter((completion) => completion.task_id === task.id)
      .some((completion) => completion.completion_date === today);
  }

  if (task.task_type === "recurring_weekly") {
    return completions
      .filter((completion) => completion.task_id === task.id)
      .some((completion) => isDateWithinWeek(completion.completion_date, today));
  }

  return completions.some((completion) => completion.task_id === task.id);
}

export function getCourseTaskProgressState(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
): CourseProgressState {
  if (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") {
    const monthlySummary = getRecurringTaskProgressSummary(task, completions, {
      windowType: "month",
      referenceDate: getDateOnly(),
    });
    const goal = monthlySummary?.targetAmount ?? task.monthly_goal_total ?? 0;
    const completed = monthlySummary?.windowTotal ?? 0;

    if (goal > 0 && completed >= goal) {
      return "complete";
    }

    if (completed > 0) {
      return "in_progress";
    }

    return "not_started";
  }

  if (task.task_type === "lesson" || task.task_type === "test") {
    if (hasApprovedSubmissionForTask(task.id, submissions)) {
      return "complete";
    }

    if (hasActiveSubmissionForTask(task.id, submissions)) {
      return "in_progress";
    }

    return "not_started";
  }

  if (completions.some((completion) => completion.task_id === task.id)) {
    return "complete";
  }

  return "not_started";
}

export function getModuleCompletionMap<
  TModule extends { id: string; tasks: TaskLike[] }
>(
  modules: TModule[],
  completions: CompletionLike[],
  submissions: SubmissionLike[],
) {
  return new Map(
    modules.map((module) => {
      const activeTasks = module.tasks.filter((task) => task.is_active !== false);
      const isComplete =
        activeTasks.length > 0 &&
        activeTasks.every((task) => isTaskCompleteForProgress(task, completions, submissions));

      return [module.id, isComplete] as const;
    }),
  );
}

export type ChildSurfaceBadge = {
  kind: "workflow" | "progress" | "reward";
  label: string;
  className: string;
};

export type MissedRecurringEventSummary = {
  policy: "weekly_end_of_week_v1";
  taskId: string;
  courseId: string;
  title: string;
  taskType: "recurring_weekly";
  windowType: "week";
  windowStart: string;
  windowEnd: string;
  expectedWindowLabel: string;
  weeklyGoodDaysAreAdvisory: true;
};

export type RecurringProgressWindowType =
  | "day"
  | "week"
  | "month"
  | "phase"
  | "course";

export type RecurringProgressWindowContext = {
  windowType: RecurringProgressWindowType;
  referenceDate?: string;
  startDate?: string;
  endDate?: string;
  targetAmount?: number | null;
  windowLabel?: string | null;
};

export type RecurringTaskProgressSummary = {
  allTimeTotal: number;
  windowType: RecurringProgressWindowType;
  windowStart: string;
  windowEnd: string;
  windowTotal: number;
  currentOccurrenceQuantity: number;
  targetAmount: number;
  remainingToTarget: number;
  progressPercent: number;
  expectedByNow: number;
  behindBy: number;
  windowLabel: string;
  occurrenceLabel: "Logged today" | "Logged this week";
};

export function getAllTimeCompletedTotal(
  taskId: string,
  completions: CompletionLike[],
) {
  return completions
    .filter((completion) => completion.task_id === taskId)
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
}

export type ResolvedRecurringWindowRange = {
  start: string;
  end: string;
  label: string;
};

export function getWindowRange(
  windowContext: RecurringProgressWindowContext,
  fallbackReferenceDate: string,
): ResolvedRecurringWindowRange | null {
  const referenceDate = windowContext.referenceDate ?? fallbackReferenceDate;

  if (windowContext.windowType === "day") {
    return {
      start: referenceDate,
      end: referenceDate,
      label: windowContext.windowLabel ?? referenceDate,
    };
  }

  if (windowContext.windowType === "week") {
    const start = getStartOfWeekDateOnly(referenceDate);
    const end = getEndOfWeekDateOnly(referenceDate);

    return {
      start,
      end,
      label: windowContext.windowLabel ?? `${start} to ${end}`,
    };
  }

  if (windowContext.windowType === "month") {
    const monthPrefix = referenceDate.slice(0, 7);
    const [year, month] = monthPrefix.split("-").map(Number);
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

    return {
      start: monthStart,
      end: monthEnd,
      label: windowContext.windowLabel ?? monthPrefix,
    };
  }

  if (windowContext.startDate && windowContext.endDate) {
    return {
      start: windowContext.startDate,
      end: windowContext.endDate,
      label: windowContext.windowLabel ?? `${windowContext.startDate} to ${windowContext.endDate}`,
    };
  }

  return null;
}

export function getExpectedProgressByNow(
  targetAmount: number,
  referenceDate: string,
  windowStart: string,
  windowEnd: string,
) {
  if (targetAmount <= 0) {
    return 0;
  }

  const start = new Date(`${windowStart}T12:00:00`);
  const end = new Date(`${windowEnd}T12:00:00`);
  const today = new Date(`${referenceDate}T12:00:00`);
  const totalDays = Math.max(Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1);
  const elapsedDays = Math.min(
    Math.max(Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 0),
    totalDays,
  );
  const progressRatio = elapsedDays / totalDays;

  return Math.min(targetAmount, Math.floor(targetAmount * progressRatio));
}

function getWindowCompletedTotal(
  taskId: string,
  completions: CompletionLike[],
  windowStart: string,
  windowEnd: string,
) {
  return completions
    .filter(
      (completion) =>
        completion.task_id === taskId &&
        completion.completion_date >= windowStart &&
        completion.completion_date <= windowEnd,
    )
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
}

function getProgressBadge(state: CourseProgressState): ChildSurfaceBadge | null {
  if (state === "not_started") {
    return null;
  }

  if (state === "complete") {
    return {
      kind: "progress",
      label: "Complete",
      className: "border-emerald-200 bg-[rgba(236,253,245,0.8)] text-emerald-800",
    };
  }

  return {
    kind: "progress",
    label: "In progress",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  };
}

function getWorkflowBadge(
  label:
    | "Waiting for review"
    | "Returned"
    | "Complete"
    | "Done today"
    | "Done this week",
): ChildSurfaceBadge {
  if (label === "Waiting for review") {
    return {
      kind: "workflow",
      label,
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (label === "Returned") {
    return {
      kind: "workflow",
      label,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    kind: "workflow",
    label,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export function getChildRewardBadge(goldCoinRewardAmount: number | null | undefined): ChildSurfaceBadge | null {
  const amount = goldCoinRewardAmount ?? 0;

  if (amount <= 0) {
    return null;
  }

  return {
    kind: "reward",
    label: `+${amount} Gold Coin${amount === 1 ? "" : "s"}`,
    className: "border-[rgba(245,190,57,0.34)] bg-[rgba(255,247,220,0.88)] text-amber-800",
  };
}

export function getChildProgressBadge(state: CourseProgressState) {
  return getProgressBadge(state);
}

export function getChildTaskBadges(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
  today = getDateOnly(),
): ChildSurfaceBadge[] {
  const badges: ChildSurfaceBadge[] = [];
  const latestSubmission = getLatestSubmissionForTask(task.id, submissions);
  let hasWorkflowBadge = false;

  if (task.task_type === "lesson" || task.task_type === "test") {
    if (latestSubmission?.parent_review_status) {
      if (isSubmissionReturned(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Returned"));
        hasWorkflowBadge = true;
      } else if (isSubmissionApproved(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Complete"));
        hasWorkflowBadge = true;
      } else if (isSubmissionActive(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Waiting for review"));
        hasWorkflowBadge = true;
      }
    }
  } else if (task.task_type === "recurring_daily") {
    const doneToday = completions.some(
      (completion) =>
        completion.task_id === task.id && completion.completion_date === today,
    );

    if (doneToday) {
      badges.push(getWorkflowBadge("Done today"));
      hasWorkflowBadge = true;
    }
  } else if (task.task_type === "recurring_weekly") {
    const doneThisWeek = completions.some(
      (completion) =>
        completion.task_id === task.id && isDateWithinWeek(completion.completion_date, today),
    );

    if (doneThisWeek) {
      badges.push(getWorkflowBadge("Done this week"));
      hasWorkflowBadge = true;
    }
  } else if (completions.some((completion) => completion.task_id === task.id)) {
    badges.push(getWorkflowBadge("Complete"));
    hasWorkflowBadge = true;
  }

  const rewardBadge = getChildRewardBadge(task.gold_coin_reward_amount);
  if (rewardBadge) {
    badges.push(rewardBadge);
  }

  const progressBadge = hasWorkflowBadge
    ? null
    : getProgressBadge(getCourseTaskProgressState(task, completions, submissions));
  if (progressBadge) {
    badges.push(progressBadge);
  }

  return badges;
}

export function getRecurringTaskCompletionForDate(
  task: Pick<TaskLike, "id" | "task_type">,
  completions: CompletionLike[],
  targetDate: string,
) {
  if (task.task_type === "recurring_daily") {
    return (
      completions.find(
        (completion) =>
          completion.task_id === task.id && completion.completion_date === targetDate,
      ) ?? null
    );
  }

  if (task.task_type === "recurring_weekly") {
    return (
      completions.find(
        (completion) =>
          completion.task_id === task.id &&
          isDateWithinWeek(completion.completion_date, targetDate),
      ) ?? null
    );
  }

  return null;
}

export function getRecurringTaskProgressSummary(
  task: Pick<TaskLike, "id" | "task_type" | "monthly_goal_total">,
  completions: CompletionLike[],
  windowContext: RecurringProgressWindowContext = {
    windowType: "month",
    referenceDate: getDateOnly(),
  },
): RecurringTaskProgressSummary | null {
  if (task.task_type !== "recurring_daily" && task.task_type !== "recurring_weekly") {
    return null;
  }

  const referenceDate = windowContext.referenceDate ?? getDateOnly();
  const allTimeTotal = getAllTimeCompletedTotal(task.id, completions);
  const resolvedWindowRange = getWindowRange(
    windowContext,
    referenceDate,
  );

  if (!resolvedWindowRange) {
    return null;
  }

  const { start: windowStart, end: windowEnd, label: windowLabel } = resolvedWindowRange;
  const windowTotal = getWindowCompletedTotal(task.id, completions, windowStart, windowEnd);
  const currentOccurrence =
    getRecurringTaskCompletionForDate(task, completions, referenceDate)?.quantity_completed ?? 0;
  const targetAmount = windowContext.targetAmount ?? task.monthly_goal_total ?? 0;
  const remainingToTarget =
    targetAmount > 0 ? Math.max(targetAmount - windowTotal, 0) : 0;
  const progressPercent =
    targetAmount > 0
      ? Math.min(100, Math.round((windowTotal / targetAmount) * 100))
      : 0;
  const expectedByNow = getExpectedProgressByNow(
    targetAmount,
    referenceDate,
    windowStart,
    windowEnd,
  );
  const behindBy = Math.max(expectedByNow - windowTotal, 0);

  return {
    allTimeTotal,
    windowType: windowContext.windowType,
    windowStart,
    windowEnd,
    windowTotal,
    currentOccurrenceQuantity: currentOccurrence,
    targetAmount,
    remainingToTarget,
    progressPercent,
    expectedByNow,
    behindBy,
    windowLabel,
    occurrenceLabel:
      task.task_type === "recurring_daily" ? "Logged today" : "Logged this week",
  };
}

export function getMissedRecurringEventSummaries<
  TTask extends Pick<TaskLike, "id" | "task_type"> & {
    course_id: string;
    title: string;
    is_active?: boolean;
  },
>(
  tasks: TTask[],
  completions: CompletionLike[],
  today = getDateOnly(),
): MissedRecurringEventSummary[] {
  const currentWeekStart = getStartOfWeekDateOnly(today);
  const previousWeekEndDate = new Date(`${currentWeekStart}T12:00:00`);
  previousWeekEndDate.setDate(previousWeekEndDate.getDate() - 1);
  const previousWeekEnd = getDateOnly(previousWeekEndDate);
  const previousWeekStart = getStartOfWeekDateOnly(previousWeekEnd);

  // Phase D v1 policy: only weekly recurring tasks can be "missed", and only
  // once the prior Monday-Sunday window has fully closed with no completion.
  return tasks
    .filter(
      (task) => task.is_active !== false && task.task_type === "recurring_weekly",
    )
    .filter((task) => {
      const hasCompletionLastWeek = completions.some(
        (completion) =>
          completion.task_id === task.id &&
          completion.completion_date >= previousWeekStart &&
          completion.completion_date <= previousWeekEnd,
      );
      return !hasCompletionLastWeek;
    })
    .map((task) => ({
      policy: "weekly_end_of_week_v1" as const,
      taskId: task.id,
      courseId: task.course_id,
      title: task.title,
      taskType: "recurring_weekly" as const,
      windowType: "week" as const,
      windowStart: previousWeekStart,
      windowEnd: previousWeekEnd,
      expectedWindowLabel: `${previousWeekStart} to ${previousWeekEnd}`,
      weeklyGoodDaysAreAdvisory: true as const,
    }));
}
