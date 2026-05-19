export type UniversalProgressState = "golden_nugget" | "in_machine" | "gold_bar";

export const UNIVERSAL_PROGRESS_LABELS: Record<UniversalProgressState, string> = {
  golden_nugget: "Golden Nugget",
  in_machine: "In the Machine",
  gold_bar: "Gold Bar so far",
};

export function getUniversalProgressBadgeClasses(state: UniversalProgressState) {
  if (state === "gold_bar") {
    return "border-emerald-200 bg-[rgba(236,253,245,0.8)] text-emerald-800";
  }

  if (state === "in_machine") {
    return "border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.5)] text-[color:var(--ink)]";
  }

  return "border-[rgba(245,190,57,0.28)] bg-[rgba(255,247,220,0.82)] text-[color:var(--ink)]";
}

type WordProgressStateInput = {
  reviewStage: number | null | undefined;
  masteryLevel: number | null | undefined;
  correctAttempts: number | null | undefined;
  incorrectAttempts: number | null | undefined;
  masteredAt: string | null | undefined;
  isAssignedNow?: boolean;
};

export function isWordSecure(input: WordProgressStateInput) {
  return (
    Boolean(input.masteredAt) ||
    ((input.reviewStage ?? 0) >= 3 &&
      (input.correctAttempts ?? 0) > (input.incorrectAttempts ?? 0)) ||
    ((input.masteryLevel ?? 0) >= 4 &&
      (input.correctAttempts ?? 0) >= Math.max((input.incorrectAttempts ?? 0) + 2, 3))
  );
}

export function getWordProgressState(input: WordProgressStateInput): UniversalProgressState {
  if (isWordSecure(input)) {
    return "gold_bar";
  }

  if (
    input.isAssignedNow ||
    (input.reviewStage ?? 0) > 0 ||
    (input.masteryLevel ?? 0) > 0 ||
    (input.correctAttempts ?? 0) > 0 ||
    (input.incorrectAttempts ?? 0) > 0
  ) {
    return "in_machine";
  }

  return "golden_nugget";
}

type TaskProgressStateInput = {
  taskType: string;
  monthlyGoalTotal?: number | null;
  monthlyCompletedTotal?: number;
  hasCompletion?: boolean;
  hasSubmission?: boolean;
  hasSubmittedWork?: boolean;
};

type TaskGoldBarRule = "auto" | "on_completion" | "on_monthly_target" | "none";

export function getTaskProgressState(input: TaskProgressStateInput): UniversalProgressState {
  if (input.taskType === "recurring_daily" || input.taskType === "recurring_weekly") {
    const goal = input.monthlyGoalTotal ?? 0;
    const completed = input.monthlyCompletedTotal ?? 0;

    if (goal > 0 && completed >= goal) {
      return "gold_bar";
    }

    if (completed > 0) {
      return "in_machine";
    }

    return "golden_nugget";
  }

  if (input.hasCompletion || input.hasSubmission) {
    return "gold_bar";
  }

  if (input.hasSubmittedWork) {
    return "in_machine";
  }

  return "golden_nugget";
}

type TaskGoldBarInput = TaskProgressStateInput & {
  goldBarRule?: TaskGoldBarRule | null;
};

export function doesTaskEarnGoldBar(input: TaskGoldBarInput) {
  const rule = input.goldBarRule ?? "auto";
  const hasCompletion = Boolean(input.hasCompletion || input.hasSubmission);
  const monthlyGoal = input.monthlyGoalTotal ?? 0;
  const monthlyCompleted = input.monthlyCompletedTotal ?? 0;
  const monthlyTargetMet = monthlyGoal > 0 && monthlyCompleted >= monthlyGoal;

  if (rule === "none") {
    return false;
  }

  if (rule === "on_completion") {
    return hasCompletion;
  }

  if (rule === "on_monthly_target") {
    return monthlyTargetMet;
  }

  if (input.taskType === "recurring_daily" || input.taskType === "recurring_weekly") {
    return monthlyTargetMet;
  }

  return hasCompletion;
}

type FocusBlockStateInput = {
  isActive: boolean;
  relatedProgressCount?: number;
};

export function getFocusBlockProgressState(
  input: FocusBlockStateInput,
): UniversalProgressState {
  if (!input.isActive) {
    return "gold_bar";
  }

  if ((input.relatedProgressCount ?? 0) > 0) {
    return "in_machine";
  }

  return "golden_nugget";
}

export function getAggregateProgressState(
  states: UniversalProgressState[],
): UniversalProgressState {
  if (states.length === 0) {
    return "golden_nugget";
  }

  if (states.every((state) => state === "gold_bar")) {
    return "gold_bar";
  }

  if (states.some((state) => state === "in_machine" || state === "gold_bar")) {
    return "in_machine";
  }

  return "golden_nugget";
}
