import type { StructuredLessonDocument } from "@/lib/lessons/schema";
export {
  getAllowedRewardTriggersForTaskType,
  getQuickAddRecurringRewardTrigger,
  normaliseRewardTriggerForTaskType,
} from "@/lib/courses/reward-trigger-rules";

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

export const COURSE_COIN_REWARD_TRIGGERS = [
  "none",
  "on_completion",
  "on_approval",
  "on_target",
] as const;

export type CourseCoinRewardTrigger = (typeof COURSE_COIN_REWARD_TRIGGERS)[number];

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
  gold_coin_reward_amount: number;
  coin_reward_trigger: "none" | "on_completion";
  is_active: boolean;
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

export const TIMED_COURSE_GOAL_KINDS = [
  "numerical",
  "aspiration",
] as const;

export type TimedCourseGoalKind = (typeof TIMED_COURSE_GOAL_KINDS)[number];

export type CourseModuleRow = {
  id: string;
  course_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  gold_coin_reward_amount: number;
  coin_reward_trigger: "none" | "on_completion";
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
  start_date: string | null;
  end_date: string | null;
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
  lesson_schema?: StructuredLessonDocument | null;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  coin_reward_trigger: CourseCoinRewardTrigger;
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
  gold_coin_reward_amount: number;
  coin_reward_trigger: "none" | "on_completion";
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

export type CourseGoalTaskSourceRow = {
  id: string;
  course_id: string;
  goal_id: string;
  task_id: string;
  parent_user_id: string;
  created_at: string;
};

export type CourseCheckpointRow = {
  id: string;
  course_id: string;
  phase_id: string | null;
  module_id: string | null;
  cycle_number: number | null;
  title: string;
  target: string | null;
  scheduled_date: string | null;
  notes: string | null;
  gold_coin_reward_amount: number;
  coin_reward_trigger: "none" | "on_completion";
  created_at: string;
};

export type ChildOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

export type SharedTaskPlacementModuleOption = {
  id: string;
  label: string;
};

export type SharedTaskPlacementGroup = {
  id: string;
  label: string;
  moduleOptions: SharedTaskPlacementModuleOption[];
};

export type SharedTaskPlacementSelection = {
  label: string;
  groups: SharedTaskPlacementGroup[];
  summaryLabel?: string;
  moduleLabel?: string;
  emptyGroupMessage?: string;
};

export type StepThreeTaskTableRowViewModel = {
  kind: "task" | "focus_block";
  id: string;
  title: string;
  typeLabel: string;
  rewardAmount: number;
  editHref: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type StepThreeTaskTableModuleViewModel = {
  id: string;
  title: string;
  taskCount: number;
  statusLabel: string;
  rows: StepThreeTaskTableRowViewModel[];
};

export type StepThreeTaskTableGroupViewModel = {
  id: string;
  title: string;
  detail?: string | null;
  moduleCount: number;
  taskCount: number;
  isCurrent?: boolean;
  modules: StepThreeTaskTableModuleViewModel[];
};

export type StepThreeTaskTableViewModel = {
  groupLabel: string;
  moduleLabel: string;
  summaryLabel?: string;
  emptyGroupMessage: string;
  emptyModuleMessage: string;
  emptyRowMessage: string;
  groups: StepThreeTaskTableGroupViewModel[];
};

export type FinalReviewGapViewModel = {
  step: number;
  label: string;
  href: string;
};

export type FinalReviewStatViewModel = {
  label: string;
  value: string;
};

export type FinalReviewActionKind = "module" | "task" | "focus_block" | "checkpoint";

export type FinalReviewItemViewModel = {
  id: string;
  kind: FinalReviewActionKind;
  title: string;
  badgeLabel?: string | null;
  detail?: string | null;
  notes?: string | null;
  stats?: string[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  moveEntityId?: string;
  editHref?: string | null;
  children?: FinalReviewItemViewModel[];
  defaultOpen?: boolean;
};

export type FinalReviewGroupViewModel = {
  id: string;
  title: string;
  detail?: string | null;
  statusLabel?: string | null;
  isHighlighted?: boolean;
  stats: string[];
  items: FinalReviewItemViewModel[];
};

export type FinalReviewSectionViewModel = {
  title: string;
  description: string;
  badgeLabel: string;
  emptyMessage: string;
  groups: FinalReviewGroupViewModel[];
};

export type FinalReviewSimpleSectionViewModel = {
  title: string;
  emptyMessage: string;
  items: FinalReviewItemViewModel[];
};

export type FinalReviewAuditViewModel = {
  heading: string;
  description: string;
  readinessLabel: string;
  readinessTone: "ready" | "attention";
  readinessMessage: string;
  readinessHelpText: string;
  gaps: FinalReviewGapViewModel[];
  stats: FinalReviewStatViewModel[];
  primarySection: FinalReviewSectionViewModel;
};

export type ReorderDirection = "up" | "down";

export type ReorderChange = {
  id: string;
  position?: number;
  scheduledDate?: string | null;
};

export type ReorderActionResult =
  | {
      ok: true;
      changed: ReorderChange[];
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type DeleteActionResult =
  | {
      ok: true;
      deletedId: string;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type TaskPlanSummaryViewModel = {
  heading: string;
  detail: string;
};

export type FocusBlockOptionViewModel = {
  id: string;
  title: string;
};

export type TaskRowViewModel = {
  kind: "task";
  id: string;
  title: string;
  instructions: string | null;
  lessonSchema?: StructuredLessonDocument | null;
  taskType: CourseTaskType;
  taskTypeLabel: string;
  isActive: boolean;
  planSummary: TaskPlanSummaryViewModel;
  rewardSummary: string;
  coinRewardTrigger: CourseCoinRewardTrigger;
  goldCoinRewardAmount: number;
  focusBlockLabel: string | null;
  focusBlockOptions: FocusBlockOptionViewModel[];
  notesLabel: string;
  notesDetail: string | null;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDuplicate: boolean;
  formId: string;
  duplicateFormId: string;
  moveUpFormId: string;
  moveDownFormId: string;
  deleteFormId: string;
  stopEditingHref: string;
  fullEditHref: string;
  estimatedMinutes: number | null;
  monthlyGoalTotal: number | null;
  weeklyDays: string[] | null;
  recurringPaceHint: string | null;
  weekdaySummary: string | null;
  writingPrompt: string | null;
  choiceOptionsText: string;
  allowMultipleChoices: boolean;
  selectedFocusBlockId: string | null;
};

export type FocusBlockMiniTaskViewModel = {
  id: string;
  title: string;
  instructions: string | null;
  estimatedMinutes: number | null;
  stateLabel: string;
};

export type FocusBlockRowViewModel = {
  kind: "focus_block";
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  statusLabel: string;
  planLabel: string;
  rewardLabel: string;
  focusLabel: string;
  completedSummary: string;
  editHref: string;
  closeEditHref: string;
  deleteFormId: string;
  moveUpFormId: string;
  moveDownFormId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isEditing: boolean;
  redirectPath: string;
  groupTaskIds: string[];
  miniTasks: FocusBlockMiniTaskViewModel[];
};

export type AuthoringUnitViewModel = TaskRowViewModel | FocusBlockRowViewModel;

export type ModuleAuthoringViewModel = {
  taskCount: number;
  addTaskHref: string;
  closeAddTaskHref: string;
  isAddingTask: boolean;
  showFocusBlockField: boolean;
  focusBlockOptions: FocusBlockOptionViewModel[];
  units: AuthoringUnitViewModel[];
};

export type CourseModuleWithTasks = CourseModuleRow & {
  tasks: CourseTaskRow[];
};

export type CourseDetail = {
  course: CourseRow;
  phases: CoursePhaseRow[];
  modules: CourseModuleWithTasks[];
  goals: CourseGoalRow[];
  goalTaskSources: CourseGoalTaskSourceRow[];
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

export const COURSE_COIN_REWARD_TRIGGER_LABELS: Record<CourseCoinRewardTrigger, string> = {
  none: "Progress only",
  on_completion: "Reward on completion",
  on_approval: "Reward on approval",
  on_target: "Reward at target",
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

export const TIMED_COURSE_GOAL_KIND_LABELS: Record<TimedCourseGoalKind, string> = {
  numerical: "Numerical goal",
  aspiration: "Aspiration",
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

export const SHARED_CREATOR_MODES = [
  "checklist",
  "lesson",
  "test",
  "recurring_daily",
  "recurring_weekly",
  "focus_block",
] as const;

export type SharedCreatorMode = (typeof SHARED_CREATOR_MODES)[number];

export const SHARED_CREATOR_MODE_LABELS: Record<SharedCreatorMode, string> = {
  checklist: "Checklist",
  lesson: "Lesson",
  test: "Test",
  recurring_daily: "Daily recurring",
  recurring_weekly: "Weekly recurring",
  focus_block: "Focus block",
};

export function getCourseTaskTypeLabel(taskType: CourseTaskType) {
  return COURSE_TASK_TYPE_LABELS[taskType];
}

export function normaliseCourseStructureType(
  structureType: string | null | undefined,
): CourseStructureType {
  return structureType === "phased" ? "phased" : "timed";
}

export function getSharedCreatorTaskTypes(currentTaskType?: CourseTaskType | null) {
  const baseTaskTypes: readonly CourseTaskType[] = [
    "checklist",
    "lesson",
    "test",
    "recurring_daily",
    "recurring_weekly",
  ];

  if (currentTaskType && !baseTaskTypes.includes(currentTaskType)) {
    return [...baseTaskTypes, currentTaskType];
  }

  return [...baseTaskTypes];
}

export function getSharedCreatorModes(
  structureType: CourseStructureType,
  currentMode?: SharedCreatorMode | null,
) {
  const baseModes: readonly SharedCreatorMode[] =
    structureType === "timed"
      ? ["checklist", "lesson", "test", "recurring_daily", "recurring_weekly", "focus_block"]
      : ["checklist", "lesson", "test"];

  if (currentMode && !baseModes.includes(currentMode)) {
    return [...baseModes, currentMode];
  }

  return [...baseModes];
}

export function isTaskTypeAllowedInSharedCreator(taskType: CourseTaskType) {
  return getSharedCreatorTaskTypes().includes(taskType);
}

export function canCourseStructureUseFocusBlocks(structureType: CourseStructureType) {
  return structureType === "timed";
}

export function getTimedCourseGoalKind(goal: Pick<CourseGoalRow, "goal_type" | "progress_source">) {
  if (goal.progress_source === "manual_review" || goal.goal_type === "skill_goal") {
    return "aspiration" satisfies TimedCourseGoalKind;
  }

  return "numerical" satisfies TimedCourseGoalKind;
}

export function isWritingTask(taskType: CourseTaskType) {
  return taskType === "lesson" || taskType === "test";
}

export function isCompletionTask(taskType: CourseTaskType) {
  return !isWritingTask(taskType);
}
