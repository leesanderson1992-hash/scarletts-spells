import type {
  CourseGoalRow,
  CourseGoalTimeSpan,
  CourseRow,
} from "./types";
import { getTimedCourseGoalKind } from "./types";

export type CourseGoalGuidance = {
  recommended_task_type: string;
  recommended_daily_pace: number | null;
  recommended_weekly_pace: number | null;
  recommended_tracking_mode: string;
  suggested_mission_shape: string | null;
  suggested_checkpoint_frequency: string | null;
  suggested_next_step: string;
  parent_control_note: string;
};

function getWeeksForTimeSpan(
  timeSpan: CourseGoalTimeSpan,
  course: Pick<CourseRow, "duration_weeks" | "cycle_length_weeks">,
) {
  if (timeSpan === "monthly") {
    return 4;
  }

  if (timeSpan === "cycle") {
    return course.cycle_length_weeks && course.cycle_length_weeks > 0
      ? course.cycle_length_weeks
      : 4;
  }

  return course.duration_weeks && course.duration_weeks > 0
    ? course.duration_weeks
    : null;
}

function roundPace(value: number | null) {
  if (value === null) {
    return null;
  }

  if (value >= 10) {
    return Math.round(value);
  }

  return Math.max(0.5, Math.round(value * 10) / 10);
}

function getCountGoalTaskType(weeklyPace: number | null, dailyPace: number | null) {
  if ((dailyPace ?? 0) >= 1 || (weeklyPace ?? 0) >= 5) {
    return "Recurring daily task";
  }

  return "Recurring weekly task";
}

export function getCourseGoalGuidance(
  goal: CourseGoalRow,
  course: Pick<CourseRow, "duration_weeks" | "cycle_length_weeks">,
): CourseGoalGuidance {
  const timedGoalKind = getTimedCourseGoalKind(goal);
  const weeks = getWeeksForTimeSpan(goal.time_span, course);
  const weeklyPace = weeks ? roundPace(goal.target_quantity / weeks) : null;
  const dailyPace = weeklyPace ? roundPace(weeklyPace / 7) : null;

  if (timedGoalKind === "numerical") {
    const recommendedTaskType = getCountGoalTaskType(weeklyPace, dailyPace);

    return {
      recommended_task_type: recommendedTaskType,
      recommended_daily_pace: recommendedTaskType === "Recurring daily task" ? dailyPace : null,
      recommended_weekly_pace: weeklyPace,
      recommended_tracking_mode: "Log quantities completed against the target",
      suggested_mission_shape: null,
      suggested_checkpoint_frequency:
        goal.time_span === "monthly" ? "Monthly" : "Every cycle",
      suggested_next_step:
        recommendedTaskType === "Recurring daily task"
          ? `Create one recurring daily task for ${goal.unit} and set the monthly target to ${goal.target_quantity}.`
          : `Create one recurring weekly task for ${goal.unit} and set the monthly target to ${goal.target_quantity}.`,
      parent_control_note:
        "Use the pace as a planning guide only. The parent still decides how strict or flexible the week should feel.",
    };
  }

  return {
    recommended_task_type: "Checkpoint and focus review",
    recommended_daily_pace: null,
    recommended_weekly_pace: null,
    recommended_tracking_mode: "Review manually at checkpoints and at the end of the course",
    suggested_mission_shape: "One current mission plus short recurring practice if it genuinely helps",
    suggested_checkpoint_frequency: "Every cycle and end of course",
    suggested_next_step:
      "Write what success looks like in parent words, then plan recurring work separately only if it helps the child move toward that aspiration.",
    parent_control_note:
      "Aspiration goals should stay reflective and parent-reviewed. They should not turn into disguised recurring checklist engines.",
  };
}

export function formatCourseGoalTarget(goal: Pick<CourseGoalRow, "target_quantity" | "unit">) {
  return `${goal.target_quantity} ${goal.unit}`.trim();
}

export function formatSuggestedPace(value: number | null, frame: "day" | "week") {
  if (value === null) {
    return null;
  }

  return `About ${value} a ${frame}`;
}
