import type { createClient } from "@/lib/supabase/server";

import {
  canCourseStructureUseFocusBlocks,
  getSharedCreatorModes,
  normaliseCourseStructureType,
  SHARED_CREATOR_MODES,
  type CourseStructureType,
  type CourseTaskType,
  type SharedCreatorMode,
} from "@/lib/courses/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export class CourseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseValidationError";
  }
}

function fail(message: string): never {
  throw new CourseValidationError(message);
}

function getAllowedTaskTypesForStructure(
  structureType: CourseStructureType,
): readonly CourseTaskType[] {
  return structureType === "timed"
    ? ["checklist", "lesson", "test", "recurring_daily", "recurring_weekly"]
    : ["checklist", "lesson", "test"];
}

export function resolveSharedCreatorMode(input: {
  creatorScope: FormDataEntryValue | null;
  creatorMode: FormDataEntryValue | null;
  taskType: FormDataEntryValue | null;
}) {
  const rawCreatorMode =
    typeof input.creatorMode === "string" ? input.creatorMode.trim() : "";
  const rawTaskType = typeof input.taskType === "string" ? input.taskType.trim() : "";

  if (input.creatorScope === "shared_task_creator") {
    if (!SHARED_CREATOR_MODES.includes(rawCreatorMode as SharedCreatorMode)) {
      fail("Choose a valid creator type.");
    }

    if (rawCreatorMode === "focus_block") {
      if (rawTaskType && rawTaskType !== "checklist") {
        fail("The shared creator payload for Focus block is not valid.");
      }

      return "focus_block" satisfies SharedCreatorMode;
    }

    if (rawTaskType !== rawCreatorMode) {
      fail("The task type does not match the selected creator type.");
    }

    return rawCreatorMode as SharedCreatorMode;
  }

  if (SHARED_CREATOR_MODES.includes(rawCreatorMode as SharedCreatorMode)) {
    return rawCreatorMode as SharedCreatorMode;
  }

  if (SHARED_CREATOR_MODES.includes(rawTaskType as SharedCreatorMode)) {
    return rawTaskType as SharedCreatorMode;
  }

  return "checklist" satisfies SharedCreatorMode;
}

export function assertTaskCreatorModeAllowedForCourse(input: {
  structureType: CourseStructureType;
  creatorMode: SharedCreatorMode;
}) {
  const allowedModes = getSharedCreatorModes(input.structureType);

  if (!allowedModes.includes(input.creatorMode)) {
    fail("That creator type is not allowed for this course type.");
  }
}

export function assertTaskTypeMutationAllowed(input: {
  structureType: CourseStructureType;
  taskType: CourseTaskType;
  existingTaskType?: CourseTaskType | null;
}) {
  const allowedTaskTypes = getAllowedTaskTypesForStructure(input.structureType);

  if (allowedTaskTypes.includes(input.taskType)) {
    return;
  }

  if (input.existingTaskType && input.existingTaskType === input.taskType) {
    return;
  }

  fail("That task type is not allowed for this course type.");
}

export function assertFocusBlockAllowedForCourse(structureType: CourseStructureType) {
  if (!canCourseStructureUseFocusBlocks(structureType)) {
    fail("Focus blocks are available only in Timed courses.");
  }
}

export function assertCheckpointPlacementAllowedForCourse(input: {
  structureType: CourseStructureType;
  phaseId: FormDataEntryValue | null;
  cycleNumber: number | null;
}) {
  const hasPhaseId =
    typeof input.phaseId === "string" && input.phaseId.trim().length > 0;

  if (input.structureType === "phased") {
    if (!hasPhaseId) {
      fail("Choose the phase this review point belongs after.");
    }

    if (input.cycleNumber !== null) {
      fail("Cycle placement is not allowed in Progress courses.");
    }

    return;
  }

  if (input.cycleNumber === null) {
    fail("Choose the cycle this checkpoint belongs in.");
  }

  if (hasPhaseId) {
    fail("Phase placement is not allowed in Timed courses.");
  }
}

export async function assertPhaseBelongsToCourse(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  courseId: string;
  phaseId: string;
  invalidMessage: string;
}) {
  const { data: phase } = await input.supabase
    .from("course_phases")
    .select("id, position")
    .eq("id", input.phaseId)
    .eq("course_id", input.courseId)
    .eq("parent_user_id", input.parentUserId)
    .maybeSingle();

  if (!phase) {
    fail(input.invalidMessage);
  }

  return phase;
}

export async function assertModuleBelongsToCourse(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  courseId: string;
  moduleId: string;
  invalidMessage: string;
}) {
  const { data: module } = await input.supabase
    .from("course_modules")
    .select("id")
    .eq("id", input.moduleId)
    .eq("course_id", input.courseId)
    .eq("parent_user_id", input.parentUserId)
    .maybeSingle();

  if (!module) {
    fail(input.invalidMessage);
  }

  return module;
}

export async function assertCourseStructureCanChange(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  courseId: string;
  currentStructureType: string | null | undefined;
  nextStructureType: string | null | undefined;
}) {
  const currentStructure = normaliseCourseStructureType(input.currentStructureType);
  const nextStructure = normaliseCourseStructureType(input.nextStructureType);

  if (currentStructure === nextStructure) {
    return;
  }

  const [
    { count: moduleCount, error: moduleCountError },
    { count: taskCount, error: taskCountError },
    { count: completionCount, error: completionCountError },
    { count: submissionCount, error: submissionCountError },
    { count: checkpointCount, error: checkpointCountError },
    { count: focusBlockCount, error: focusBlockCountError },
    { count: goalCount, error: goalCountError },
    { count: goalSourceCount, error: goalSourceCountError },
    { count: courseRewardCount, error: courseRewardCountError },
  ] = await Promise.all([
    input.supabase
      .from("course_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("task_completions")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("task_submissions")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("course_checkpoints")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("focus_blocks")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("course_goals")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("course_goal_task_sources")
      .select("*", { count: "exact", head: true })
      .eq("course_id", input.courseId)
      .eq("parent_user_id", input.parentUserId),
    input.supabase
      .from("child_gold_coin_ledger_events")
      .select("*", { count: "exact", head: true })
      .eq("parent_user_id", input.parentUserId)
      .eq("related_entity_type", "course")
      .eq("related_entity_id", input.courseId),
  ]);

  const firstError = [
    moduleCountError,
    taskCountError,
    completionCountError,
    submissionCountError,
    checkpointCountError,
    focusBlockCountError,
    goalCountError,
    goalSourceCountError,
    courseRewardCountError,
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  const hasLinkedRecords =
    (moduleCount ?? 0) > 0 ||
    (taskCount ?? 0) > 0 ||
    (completionCount ?? 0) > 0 ||
    (submissionCount ?? 0) > 0 ||
    (checkpointCount ?? 0) > 0 ||
    (focusBlockCount ?? 0) > 0 ||
    (goalCount ?? 0) > 0 ||
    (goalSourceCount ?? 0) > 0 ||
    (courseRewardCount ?? 0) > 0;

  if (hasLinkedRecords) {
    fail(
      "This course already has linked planning or activity records, so its structure can no longer be switched safely. Create a new course instead.",
    );
  }
}
