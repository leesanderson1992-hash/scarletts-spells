import { createClient } from "@/lib/supabase/server";
import { getDateOnly } from "@/lib/courses/progress";

import type {
  ChildOption,
  CourseDetail,
  CourseGoalRow,
  CourseGoalTaskSourceRow,
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
    start: getDateOnly(cycleStart),
    end: getDateOnly(cycleEnd),
  };
}

export function getTimedPhaseDateRange(
  startDate: string | null | undefined,
  durationWeeks: number | null | undefined,
  cycleLengthWeeks: number | null | undefined,
  cycleNumber: number | null | undefined,
) {
  if (!startDate || !durationWeeks || durationWeeks < 1 || !cycleNumber || cycleNumber < 1) {
    return null;
  }

  const baseRange = getCycleDateRange(startDate, cycleLengthWeeks, cycleNumber);

  if (!baseRange) {
    return null;
  }

  const courseEnd = new Date(`${startDate}T00:00:00`);
  courseEnd.setDate(courseEnd.getDate() + durationWeeks * 7 - 1);
  const phaseEnd = new Date(`${baseRange.end}T00:00:00`);
  const boundedEnd = phaseEnd.getTime() <= courseEnd.getTime() ? phaseEnd : courseEnd;

  return {
    start: baseRange.start,
    end: getDateOnly(boundedEnd),
  };
}

export function getPhaseWindowContext(phase: Pick<CoursePhaseRow, "title"> & {
  start_date?: string | null;
  end_date?: string | null;
}) {
  if (!phase.start_date || !phase.end_date) {
    return null;
  }

  return {
    windowType: "phase" as const,
    startDate: phase.start_date,
    endDate: phase.end_date,
    windowLabel: phase.title,
  };
}

export function getCourseWindowContext(course: Pick<CourseRow, "title" | "start_date" | "duration_weeks">) {
  if (!course.start_date || !course.duration_weeks || course.duration_weeks < 1) {
    return null;
  }

  const courseEnd = new Date(`${course.start_date}T00:00:00`);
  courseEnd.setDate(courseEnd.getDate() + course.duration_weeks * 7 - 1);

  return {
    windowType: "course" as const,
    startDate: course.start_date,
    endDate: getDateOnly(courseEnd),
    windowLabel: course.title,
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

export function getNextCheckpoint(
  checkpoints: CourseCheckpointRow[],
  today = new Date(),
) {
  const recentThreshold = new Date(today);
  recentThreshold.setDate(recentThreshold.getDate() - 1);

  return (
    checkpoints.find((checkpoint) => {
      if (!checkpoint.scheduled_date) {
        return false;
      }

      return (
        new Date(`${checkpoint.scheduled_date}T00:00:00`).getTime() >= recentThreshold.getTime()
      );
    }) ?? checkpoints[0] ?? null
  );
}

export function groupTasksByModule(
  modules: CourseModuleRow[],
  tasks: CourseTaskRow[],
): CourseModuleWithTasks[] {
  const tasksByModule = new Map<string, CourseTaskRow[]>();

  for (const task of tasks) {
    const existing = tasksByModule.get(task.module_id) ?? [];
    existing.push(task);
    tasksByModule.set(task.module_id, existing);
  }

  return modules.map((module) => ({
    ...module,
    tasks: [...(tasksByModule.get(module.id) ?? [])].sort(
      (left, right) => left.position - right.position,
    ),
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
  options?: {
    activeOnly?: boolean;
  },
) {
  let query = supabase
    .from("courses")
    .select("id, child_id, structure_type, title, description, start_date, duration_weeks, cycle_length_weeks, is_active, is_archived, created_at")
    .eq("parent_user_id", parentUserId)
    .eq("child_id", childId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data } = await query;

  return (data ?? []) as CourseRow[];
}

export async function getCourseDetailForParent(
  supabase: SupabaseServerClient,
  parentUserId: string,
  courseId: string,
) {
  const [detail] = await getCourseDetailsForParent(supabase, parentUserId, [courseId]);
  return detail ?? null;
}

export async function getCourseDetailsForParent(
  supabase: SupabaseServerClient,
  parentUserId: string,
  courseIds: string[],
) {
  const uniqueCourseIds = Array.from(
    new Set(courseIds.filter((courseId) => courseId.trim().length > 0)),
  );

  if (uniqueCourseIds.length === 0) {
    return [] as CourseDetail[];
  }

  const [{ data: courses }, { data: phases }, { data: modules }, { data: tasks }, { data: goals }, { data: goalTaskSources }, { data: focusBlocks }, { data: checkpoints }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, child_id, structure_type, title, description, start_date, duration_weeks, cycle_length_weeks, is_active, is_archived, created_at")
      .in("id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("course_phases")
      .select("id, course_id, title, description, position, badge_image_url, start_date, end_date, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_modules")
      .select("id, course_id, phase_id, title, description, position, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_tasks")
      .select(
        "id, course_id, module_id, focus_block_id, title, task_type, instructions, lesson_schema, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount, weekly_days, position, is_active, created_at",
      )
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("position", { ascending: true }),
    supabase
      .from("course_goals")
      .select("id, course_id, title, goal_type, unit, target_quantity, progress_source, time_span, success_description, stretch_target, status, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("course_goal_task_sources")
      .select("id, course_id, goal_id, task_id, parent_user_id, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("created_at", { ascending: true }),
    supabase
      .from("focus_blocks")
      .select("id, course_id, module_id, cycle_number, title, goal, description, gold_coin_reward_amount, coin_reward_trigger, start_date, end_date, is_active, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("course_checkpoints")
      .select("id, course_id, phase_id, module_id, cycle_number, title, target, scheduled_date, notes, gold_coin_reward_amount, coin_reward_trigger, created_at")
      .in("course_id", uniqueCourseIds)
      .eq("parent_user_id", parentUserId)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const courseById = new Map(
    ((courses ?? []) as CourseRow[]).map((course) => [course.id, course]),
  );
  const phasesByCourseId = new Map<string, CoursePhaseRow[]>();
  const modulesByCourseId = new Map<string, CourseModuleRow[]>();
  const tasksByCourseId = new Map<string, CourseTaskRow[]>();
  const goalsByCourseId = new Map<string, CourseGoalRow[]>();
  const goalTaskSourcesByCourseId = new Map<string, CourseGoalTaskSourceRow[]>();
  const focusBlocksByCourseId = new Map<string, FocusBlockRow[]>();
  const checkpointsByCourseId = new Map<string, CourseCheckpointRow[]>();

  for (const phase of (phases ?? []) as CoursePhaseRow[]) {
    const existing = phasesByCourseId.get(phase.course_id) ?? [];
    existing.push(phase);
    phasesByCourseId.set(phase.course_id, existing);
  }

  for (const moduleRow of (modules ?? []) as CourseModuleRow[]) {
    const existing = modulesByCourseId.get(moduleRow.course_id) ?? [];
    existing.push(moduleRow);
    modulesByCourseId.set(moduleRow.course_id, existing);
  }

  for (const task of (tasks ?? []) as CourseTaskRow[]) {
    const existing = tasksByCourseId.get(task.course_id) ?? [];
    existing.push(task);
    tasksByCourseId.set(task.course_id, existing);
  }

  for (const goal of (goals ?? []) as CourseGoalRow[]) {
    const existing = goalsByCourseId.get(goal.course_id) ?? [];
    existing.push(goal);
    goalsByCourseId.set(goal.course_id, existing);
  }

  for (const source of (goalTaskSources ?? []) as CourseGoalTaskSourceRow[]) {
    const existing = goalTaskSourcesByCourseId.get(source.course_id) ?? [];
    existing.push(source);
    goalTaskSourcesByCourseId.set(source.course_id, existing);
  }

  for (const focusBlock of (focusBlocks ?? []) as FocusBlockRow[]) {
    const existing = focusBlocksByCourseId.get(focusBlock.course_id) ?? [];
    existing.push(focusBlock);
    focusBlocksByCourseId.set(focusBlock.course_id, existing);
  }

  for (const checkpoint of (checkpoints ?? []) as CourseCheckpointRow[]) {
    const existing = checkpointsByCourseId.get(checkpoint.course_id) ?? [];
    existing.push(checkpoint);
    checkpointsByCourseId.set(checkpoint.course_id, existing);
  }

  return uniqueCourseIds.flatMap((courseId) => {
    const course = courseById.get(courseId);

    if (!course) {
      return [];
    }

    return [{
      course,
      phases: phasesByCourseId.get(courseId) ?? [],
      modules: groupTasksByModule(
        modulesByCourseId.get(courseId) ?? [],
        tasksByCourseId.get(courseId) ?? [],
      ),
      goals: goalsByCourseId.get(courseId) ?? [],
      goalTaskSources: goalTaskSourcesByCourseId.get(courseId) ?? [],
      focusBlocks: focusBlocksByCourseId.get(courseId) ?? [],
      checkpoints: checkpointsByCourseId.get(courseId) ?? [],
    } satisfies CourseDetail];
  });
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

  const selectedModule = detail.modules.find((item) => item.id === moduleId) ?? null;

  if (!selectedModule) {
    return null;
  }

  return {
    course: detail.course,
    module: selectedModule,
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

  if (!detail || detail.course.child_id !== childId || !detail.course.is_active) {
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

  const selectedModule = detail.modules.find((item) => item.id === moduleId) ?? null;

  if (!selectedModule) {
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
    module: selectedModule,
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
