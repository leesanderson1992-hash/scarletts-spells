export const COURSE_TASK_TYPES = [
  "checklist",
  "lesson",
  "test",
  "recurring_daily",
  "recurring_weekly",
  "checkpoint",
] as const;

export const PARENT_COURSE_TASK_TYPES = [
  "checklist",
  "lesson",
  "test",
  "recurring_daily",
  "recurring_weekly",
  "checkpoint",
] as const satisfies readonly CourseTaskType[];

export type CourseTaskType = (typeof COURSE_TASK_TYPES)[number];

export const TASK_GOLD_BAR_RULES = [
  "auto",
  "on_completion",
  "on_monthly_target",
  "none",
] as const;

export type TaskGoldBarRule = (typeof TASK_GOLD_BAR_RULES)[number];

export const COURSE_STRUCTURE_TYPES = ["phased", "timed"] as const;

export type CourseStructureType = (typeof COURSE_STRUCTURE_TYPES)[number];

export type CourseRow = {
  id: string;
  child_id: string;
  structure_type: CourseStructureType;
  title: string;
  description: string | null;
  start_date: string | null;
  duration_weeks: number | null;
  cycle_length_weeks: number | null;
  is_archived: boolean;
  created_at: string;
};

export const COURSE_GOAL_TYPES = [
  "count_goal",
  "completion_goal",
  "skill_goal",
  "submission_goal",
] as const;

export type CourseGoalType = (typeof COURSE_GOAL_TYPES)[number];

export const COURSE_GOAL_PROGRESS_SOURCES = [
  "task_completion",
  "task_submission",
  "focus_block_completion",
  "manual_review",
  "spelling_progress",
] as const;

export type CourseGoalProgressSource = (typeof COURSE_GOAL_PROGRESS_SOURCES)[number];

export const COURSE_GOAL_TIME_SPANS = [
  "monthly",
  "cycle",
  "course_duration",
] as const;

export type CourseGoalTimeSpan = (typeof COURSE_GOAL_TIME_SPANS)[number];

export const COURSE_GOAL_STATUSES = [
  "planned",
  "active",
  "secure",
  "paused",
] as const;

export type CourseGoalStatus = (typeof COURSE_GOAL_STATUSES)[number];

export type CourseModuleRow = {
  id: string;
  course_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
};

export type CoursePhaseRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  badge_image_url: string | null;
  created_at: string;
};

export type CourseTaskRow = {
  id: string;
  course_id: string;
  module_id: string;
  focus_block_id: string | null;
  title: string;
  task_type: CourseTaskType;
  instructions: string | null;
  content_html: string | null;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  gold_bar_rule: TaskGoldBarRule;
  gold_coin_reward_amount: number;
  weekly_days: string[] | null;
  position: number;
  is_active: boolean;
  created_at: string;
};

export type TaskSubmissionRow = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  submission_text: string;
  submitted_at: string;
  parent_review_status: "pending" | "approved" | "returned";
  parent_review_note: string | null;
  parent_reviewed_at: string | null;
};

export type TaskCompletionRow = {
  id: string;
  task_id: string;
  course_id: string;
  child_id: string;
  completion_date: string;
  quantity_completed: number;
  completed_at: string;
};

export type FocusBlockRow = {
  id: string;
  course_id: string;
  module_id: string | null;
  cycle_number: number | null;
  title: string;
  goal: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type CourseGoalRow = {
  id: string;
  course_id: string;
  title: string;
  goal_type: CourseGoalType;
  unit: string;
  target_quantity: number;
  progress_source: CourseGoalProgressSource;
  time_span: CourseGoalTimeSpan;
  success_description: string | null;
  stretch_target: number | null;
  status: CourseGoalStatus;
  created_at: string;
};

export type CourseCheckpointRow = {
  id: string;
  course_id: string;
  module_id: string | null;
  cycle_number: number | null;
  title: string;
  target: string | null;
  scheduled_date: string | null;
  notes: string | null;
  created_at: string;
};

export type ChildOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

export type CourseModuleWithTasks = CourseModuleRow & {
  tasks: CourseTaskRow[];
};

export type CourseDetail = {
  course: CourseRow;
  phases: CoursePhaseRow[];
  modules: CourseModuleWithTasks[];
  goals: CourseGoalRow[];
  focusBlocks: FocusBlockRow[];
  checkpoints: CourseCheckpointRow[];
};

export const COURSE_TASK_TYPE_LABELS: Record<CourseTaskType, string> = {
  checklist: "Checklist",
  lesson: "Lesson",
  test: "Test",
  recurring_daily: "Recurring daily",
  recurring_weekly: "Recurring weekly",
  checkpoint: "Checkpoint",
};

export const TASK_GOLD_BAR_RULE_LABELS: Record<TaskGoldBarRule, string> = {
  auto: "Auto reward",
  on_completion: "Reward on completion",
  on_monthly_target: "Reward at target",
  none: "Progress only",
};

export const COURSE_GOAL_TYPE_LABELS: Record<CourseGoalType, string> = {
  count_goal: "Count goal",
  completion_goal: "Completion goal",
  skill_goal: "Skill goal",
  submission_goal: "Submission goal",
};

export const COURSE_GOAL_PROGRESS_SOURCE_LABELS: Record<CourseGoalProgressSource, string> = {
  task_completion: "Task completion",
  task_submission: "Writing submissions",
  focus_block_completion: "Focus block completion",
  manual_review: "Manual review",
  spelling_progress: "Spelling progress",
};

export const COURSE_GOAL_TIME_SPAN_LABELS: Record<CourseGoalTimeSpan, string> = {
  monthly: "Monthly",
  cycle: "Per cycle",
  course_duration: "Whole course",
};

export const COURSE_GOAL_STATUS_LABELS: Record<CourseGoalStatus, string> = {
  planned: "Planned",
  active: "Active",
  secure: "Secure",
  paused: "Paused",
};

export const WEEKDAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

export function getCourseTaskTypeLabel(taskType: CourseTaskType) {
  return COURSE_TASK_TYPE_LABELS[taskType];
}

export function isWritingTask(taskType: CourseTaskType) {
  return taskType === "lesson" || taskType === "test";
}

export function isCompletionTask(taskType: CourseTaskType) {
  return !isWritingTask(taskType);
}
