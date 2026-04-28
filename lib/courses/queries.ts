import { createClient } from "@/lib/supabase/server";

import type {
  ChildOption,
  CourseDetail,
  CourseGoalRow,
  CourseCheckpointRow,
  CoursePhaseRow,
  CourseModuleRow,
  CourseModuleWithTasks,
  CourseRow,
  CourseTaskRow,
  FocusBlockRow,
  TaskCompletionRow,
  TaskSubmissionRow,
} from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function formatCourseWeekdays(weekdays: string[] | null | undefined) {
  const cleaned = (weekdays ?? []).filter(Boolean);

  if (cleaned.length === 0) {
    return "Weekly";
  }

  return cleaned
    .map((day) => day.slice(0, 1).toUpperCase() + day.slice(1))
    .join(", ");
}

export function formatCourseDate(date: string | null | undefined) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function getTotalCycles(
  durationWeeks: number | null | undefined,
  cycleLengthWeeks: number | null | undefined,
) {
  if (!durationWeeks || durationWeeks < 1) {
    return null;
  }

  const safeCycleLength = cycleLengthWeeks && cycleLengthWeeks > 0 ? cycleLengthWeeks : 4;
  return Math.ceil(durationWeeks / safeCycleLength);
}

export function getCycleDateRange(
  startDate: string | null | undefined,
  cycleLengthWeeks: number | null | undefined,
  cycleNumber: number | null | undefined,
) {
  if (!startDate || !cycleNumber || cycleNumber < 1) {
    return null;
  }

  const safeCycleLength = cycleLengthWeeks && cycleLengthWeeks > 0 ? cycleLengthWeeks : 4;
  const cycleStart = new Date(`${startDate}T00:00:00`);
  cycleStart.setDate(cycleStart.getDate() + (cycleNumber - 1) * safeCycleLength * 7);

  const cycleEnd = new Date(cycleStart);
  cycleEnd.setDate(cycleEnd.getDate() + safeCycleLength * 7 - 1);

  return {
    start: cycleStart.toISOString().slice(0, 10),
    end: cycleEnd.toISOString().slice(0, 10),
  };
}

export function getCurrentCycle(
  startDate: string | null | undefined,
  durationWeeks: number | null | undefined,
  cycleLengthWeeks: number | null | undefined,
) {
  if (!startDate || !durationWeeks || durationWeeks < 1) {
    return null;
  }

  const safeCycleLength = cycleLengthWeeks && cycleLengthWeeks > 0 ? cycleLengthWeeks : 4;
  const courseStart = new Date(`${startDate}T00:00:00`);
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((today.getTime() - courseStart.getTime()) / msPerDay);

  if (daysSinceStart < 0) {
    return 1;
  }

  const totalCycles = getTotalCycles(durationWeeks, safeCycleLength);
  if (!totalCycles) {
    return null;
  }

  const weekOffset = Math.floor(daysSinceStart / 7);
  const derivedCycle = Math.floor(weekOffset / safeCycleLength) + 1;

  return Math.min(Math.max(derivedCycle, 1), totalCycles);
}

export function groupTasksByModule(
  modules: CourseModuleRow[],
  tasks: CourseTaskRow[],
): CourseModuleWithTasks[] {
  return modules.map((module) => ({
    ...module,
    tasks: tasks
      .filter((task) => task.module_id === module.id)
      .sort((left, right) => left.position - right.position),
  }));
}

export async function getActiveChildrenForUser(
  supabase: SupabaseServerClient,
  parentUserId: string,
) {
  const { data } = await supabase
    .from("children")
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", parentUserId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  return (data ?? []) as ChildOption[];
}

export async function getCoursesForChild(
  supabase: SupabaseServerClient,
  parentUserId: string,
  childId: string,
) {
  const { data } = await supabase
    .from("courses")
    .select("id, child_id, structure_type, title, description, start_date, duration_weeks, cycle_length_weeks, is_archived, created_at")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  return (data ?? []) as CourseRow[];
}

export async function getCourseDetailForParent(
  supabase: SupabaseServerClient,
  parentUserId: string,
  courseId: string,
) {
  const [{ data: course }, { data: phases }, { data: modules }, { data: tasks }, { data: goals }, { data: focusBlocks }, { data: checkpoints }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, child_id, structure_type, title, description, start_date, duration_weeks, cycle_length_weeks, is_archived, created_at")
      .eq("id", courseId)
      .eq("parent_user_id", parentUserId)
      .eq("is_archived", false)
      .maybeSingle(),
    supabase
      .from("course_phases")
      .select("id, course_id, title, description, position, badge_image_url, created_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_modules")
      .select("id, course_id, phase_id, title, description, position, created_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_tasks")
      .select(
        "id, course_id, module_id, focus_block_id, title, task_type, instructions, content_html, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, gold_bar_rule, gold_coin_reward_amount, weekly_days, position, is_active, created_at",
      )
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_goals")
      .select("id, course_id, title, goal_type, unit, target_quantity, progress_source, time_span, success_description, stretch_target, status, created_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("focus_blocks")
      .select("id, course_id, module_id, cycle_number, title, goal, description, start_date, end_date, is_active, created_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("course_checkpoints")
      .select("id, course_id, module_id, cycle_number, title, target, scheduled_date, notes, created_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  if (!course) {
    return null;
  }

  return {
    course: course as CourseRow,
    phases: (phases ?? []) as CoursePhaseRow[],
    modules: groupTasksByModule(
      (modules ?? []) as CourseModuleRow[],
      (tasks ?? []) as CourseTaskRow[],
    ),
    goals: (goals ?? []) as CourseGoalRow[],
    focusBlocks: (focusBlocks ?? []) as FocusBlockRow[],
    checkpoints: (checkpoints ?? []) as CourseCheckpointRow[],
  } satisfies CourseDetail;
}

export async function getModuleDetailForParent(
  supabase: SupabaseServerClient,
  parentUserId: string,
  courseId: string,
  moduleId: string,
) {
  const detail = await getCourseDetailForParent(supabase, parentUserId, courseId);

  if (!detail) {
    return null;
  }

  const module = detail.modules.find((item) => item.id === moduleId) ?? null;

  if (!module) {
    return null;
  }

  return {
    course: detail.course,
    module,
    focusBlocks: detail.focusBlocks,
  };
}

export async function getCourseDetailForChild(
  supabase: SupabaseServerClient,
  parentUserId: string,
  childId: string,
  courseId: string,
) {
  const detail = await getCourseDetailForParent(supabase, parentUserId, courseId);

  if (!detail || detail.course.child_id !== childId) {
    return null;
  }

  const activeModules = detail.modules
    .map((module) => ({
      ...module,
      tasks: module.tasks.filter((task) => task.is_active),
    }))
    .filter((module) => module.tasks.length > 0);

  return {
    ...detail,
    modules: activeModules,
  };
}

export async function getModuleDetailForChild(
  supabase: SupabaseServerClient,
  parentUserId: string,
  childId: string,
  courseId: string,
  moduleId: string,
) {
  const detail = await getCourseDetailForChild(
    supabase,
    parentUserId,
    childId,
    courseId,
  );

  if (!detail) {
    return null;
  }

  const module = detail.modules.find((item) => item.id === moduleId) ?? null;

  if (!module) {
    return null;
  }

  const [{ data: completions }, { data: submissions }] = await Promise.all([
    supabase
      .from("task_completions")
      .select("id, task_id, course_id, child_id, completion_date, quantity_completed, completed_at")
      .eq("course_id", courseId)
      .eq("child_id", childId),
    supabase
      .from("task_submissions")
      .select("id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
      .eq("course_id", courseId)
      .eq("child_id", childId)
      .order("submitted_at", { ascending: false }),
  ]);

  return {
    course: detail.course,
    phases: detail.phases,
    modules: detail.modules,
    module,
    focusBlocks: detail.focusBlocks,
    completions: (completions ?? []) as TaskCompletionRow[],
    submissions: (submissions ?? []) as TaskSubmissionRow[],
  };
}

export async function getCourseActivityForChild(
  supabase: SupabaseServerClient,
  childId: string,
  courseId: string,
) {
  const [{ data: completions }, { data: submissions }] = await Promise.all([
    supabase
      .from("task_completions")
      .select("id, task_id, course_id, child_id, completion_date, quantity_completed, completed_at")
      .eq("course_id", courseId)
      .eq("child_id", childId),
    supabase
      .from("task_submissions")
      .select("id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
      .eq("course_id", courseId)
      .eq("child_id", childId)
      .order("submitted_at", { ascending: false }),
  ]);

  return {
    completions: (completions ?? []) as TaskCompletionRow[],
    submissions: (submissions ?? []) as TaskSubmissionRow[],
  };
}
