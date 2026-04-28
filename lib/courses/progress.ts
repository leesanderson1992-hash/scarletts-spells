import { doesTaskEarnGoldBar, getTaskProgressState, type UniversalProgressState } from "@/lib/progress/stateModel";
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
  gold_bar_rule?: "auto" | "on_completion" | "on_monthly_target" | "none" | null;
  gold_coin_reward_amount?: number | null;
  is_active?: boolean;
};

type CompletionLike = {
  task_id: string;
  completion_date: string;
  quantity_completed: number;
};

type SubmissionLike = {
  task_id: string;
  parent_review_status?: ParentReviewStatus;
  parent_review_note?: string | null;
};

export function getCurrentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthlyCompletedTotal(
  taskId: string,
  completions: CompletionLike[],
  monthPrefix = getCurrentMonthPrefix(),
) {
  return completions
    .filter(
      (completion) =>
        completion.task_id === taskId &&
        completion.completion_date.startsWith(monthPrefix),
    )
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
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
    const monthlyCompletedTotal = getMonthlyCompletedTotal(task.id, completions);
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
  today = new Date().toISOString().slice(0, 10),
) {
  if (task.task_type === "lesson" || task.task_type === "test") {
    return hasActiveSubmissionForTask(task.id, submissions);
  }

  if (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") {
    return completions
      .filter((completion) => completion.task_id === task.id)
      .some((completion) => completion.completion_date === today);
  }

  return completions.some((completion) => completion.task_id === task.id);
}

export function getCourseTaskProgressState(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
): UniversalProgressState {
  return getTaskProgressState({
    taskType: task.task_type,
    monthlyGoalTotal: task.monthly_goal_total,
    monthlyCompletedTotal: getMonthlyCompletedTotal(task.id, completions),
    hasCompletion: completions.some((completion) => completion.task_id === task.id),
    hasSubmission: hasApprovedSubmissionForTask(task.id, submissions),
    hasSubmittedWork: hasActiveSubmissionForTask(task.id, submissions),
  });
}

export function doesCourseTaskEarnGoldBar(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
) {
  return doesTaskEarnGoldBar({
    taskType: task.task_type,
    monthlyGoalTotal: task.monthly_goal_total,
    monthlyCompletedTotal: getMonthlyCompletedTotal(task.id, completions),
    hasCompletion: completions.some((completion) => completion.task_id === task.id),
    hasSubmission: hasApprovedSubmissionForTask(task.id, submissions),
    goldBarRule: task.gold_bar_rule ?? "auto",
  });
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

function getProgressBadge(state: UniversalProgressState): ChildSurfaceBadge | null {
  if (state === "golden_nugget") {
    return null;
  }

  if (state === "gold_bar") {
    return {
      kind: "progress",
      label: "Gold Bar",
      className: "border-emerald-200 bg-[rgba(236,253,245,0.8)] text-emerald-800",
    };
  }

  return {
    kind: "progress",
    label: "In the Machine",
    className: "border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.5)] text-[color:var(--ink)]",
  };
}

function getWorkflowBadge(
  label: "Waiting for review" | "Returned" | "Complete" | "Done today",
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

export function getChildProgressBadge(state: UniversalProgressState) {
  return getProgressBadge(state);
}

export function getChildTaskBadges(
  task: TaskLike,
  completions: CompletionLike[],
  submissions: SubmissionLike[],
  today = new Date().toISOString().slice(0, 10),
): ChildSurfaceBadge[] {
  const badges: ChildSurfaceBadge[] = [];
  const latestSubmission = getLatestSubmissionForTask(task.id, submissions);

  if (task.task_type === "lesson" || task.task_type === "test") {
    if (latestSubmission?.parent_review_status) {
      if (isSubmissionReturned(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Returned"));
      } else if (isSubmissionApproved(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Complete"));
      } else if (isSubmissionActive(latestSubmission.parent_review_status)) {
        badges.push(getWorkflowBadge("Waiting for review"));
      }
    }
  } else if (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") {
    const doneToday = completions.some(
      (completion) =>
        completion.task_id === task.id && completion.completion_date === today,
    );

    if (doneToday) {
      badges.push(getWorkflowBadge("Done today"));
    }
  } else if (completions.some((completion) => completion.task_id === task.id)) {
    badges.push(getWorkflowBadge("Complete"));
  }

  const rewardBadge = getChildRewardBadge(task.gold_coin_reward_amount);
  if (rewardBadge) {
    badges.push(rewardBadge);
  }

  const progressBadge = getProgressBadge(
    getCourseTaskProgressState(task, completions, submissions),
  );
  if (progressBadge) {
    badges.push(progressBadge);
  }

  return badges;
}
