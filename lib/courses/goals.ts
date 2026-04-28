import type {
  CourseGoalRow,
  CourseGoalTimeSpan,
  CourseRow,
} from "./types";

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
  const weeks = getWeeksForTimeSpan(goal.time_span, course);
  const weeklyPace = weeks ? roundPace(goal.target_quantity / weeks) : null;
  const dailyPace = weeklyPace ? roundPace(weeklyPace / 7) : null;

  if (goal.goal_type === "count_goal") {
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

  if (goal.goal_type === "completion_goal") {
    return {
      recommended_task_type: "Checklist or focus-block task",
      recommended_daily_pace: null,
      recommended_weekly_pace: weeklyPace,
      recommended_tracking_mode: "Mark mini tasks complete as the mission moves forward",
      suggested_mission_shape: `Create one current mission and split ${goal.target_quantity} ${goal.unit} into mini tasks`,
      suggested_checkpoint_frequency: "Every cycle",
      suggested_next_step: `Create one focus block for this goal, then add the next few ${goal.unit} as small checklist tasks.`,
      parent_control_note:
        "The app is suggesting a mission shape, not building every future chapter or step for you.",
    };
  }

  if (goal.goal_type === "skill_goal") {
    return {
      recommended_task_type: "Recurring drill task",
      recommended_daily_pace: (weeklyPace ?? 0) >= 5 ? dailyPace : null,
      recommended_weekly_pace: weeklyPace ? Math.max(weeklyPace, 1) : null,
      recommended_tracking_mode: "Use recurring drills plus review checkpoints",
      suggested_mission_shape: "One focus block with repeat practice, review, and occasional reflection",
      suggested_checkpoint_frequency: "Every cycle",
      suggested_next_step:
        "Create one or two recurring drills, then add a checkpoint to review whether the skill is becoming more secure.",
      parent_control_note:
        "Skill goals should guide practice rhythm and reviews, not fabricate highly specific content tasks automatically.",
    };
  }

  return {
      recommended_task_type:
      (weeklyPace ?? 0) > 1 ? "Short written response task" : "Long written response task",
    recommended_daily_pace: null,
    recommended_weekly_pace: weeklyPace,
    recommended_tracking_mode: "Count saved submissions toward the goal",
    suggested_mission_shape: "Recurring writing mission with submission tracking",
    suggested_checkpoint_frequency: "Every cycle",
    suggested_next_step:
      "Create one recurring writing task, then use saved submissions to count progress toward the goal.",
    parent_control_note:
      "The app suggests a writing shape and pace, but the parent still chooses the actual prompts and schedule.",
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
