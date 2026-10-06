import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  buildTimedPhaseBackingModuleDescription,
  buildTimedPhaseBackingModuleTitle,
} from "@/lib/courses/timed-phase-modules";
import { isStructuredLessonDocument } from "@/lib/lessons/schema";
import {
  assertPhaseBelongsToCourse,
  CourseValidationError,
} from "@/lib/courses/validation";
import {
  type CourseModuleRow,
} from "@/lib/courses/types";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type TimedPhaseModuleResolution = { error: string } | { module: CourseModuleRow };

export function getFriendlyCourseDatabaseError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't save that course change just yet.";
  }

  if (
    message.includes('relation "courses" does not exist') ||
    message.includes('relation "course_modules" does not exist') ||
    message.includes('relation "course_tasks" does not exist') ||
    message.includes('relation "course_phases" does not exist') ||
    message.includes('relation "focus_blocks" does not exist') ||
    message.includes('relation "course_goals" does not exist') ||
    message.includes('relation "course_goal_task_sources" does not exist') ||
    message.includes('relation "course_checkpoints" does not exist') ||
    message.includes('relation "task_submissions" does not exist') ||
    message.includes('relation "task_completions" does not exist')
  ) {
    return "The course tables are missing in Supabase. Run the latest course migration before trying again.";
  }

  if (message.includes("lesson_schema")) {
    return "The course task schema is missing the structured lesson field. Run the latest structured lesson migration in Supabase.";
  }

  if (message.includes("choice_options") || message.includes("allow_multiple_choices")) {
    return "The course task schema is missing the latest lesson/test authoring fields. Run the latest course migration in Supabase.";
  }

  if (message.includes("gold_coin_reward_amount")) {
    return "The course task schema is missing the latest Gold Coin reward field. Run the latest course migration in Supabase.";
  }

  if (message.includes("course_goals")) {
    return "The timed goal could not be saved with the current values. Check the goal kind, target fields, and aspiration note, then try again.";
  }

  return `We couldn't save that course change just yet. ${message}`;
}

export function getRedirectPath(formData: FormData, fallbackPath: string) {
  const redirectPath = formData.get("redirect_path");
  return typeof redirectPath === "string" && redirectPath ? redirectPath : fallbackPath;
}

export function buildRedirectWithMessage(
  path: string,
  key: "error" | "saved",
  value: string,
) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set(key, value);
  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function normaliseWeekdays(rawWeekdays: FormDataEntryValue[]) {
  const allowed = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

  return Array.from(
    new Set(
      rawWeekdays
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => allowed.has(value)),
    ),
  );
}

export function normaliseChoiceOptions(rawOptions: FormDataEntryValue | null) {
  if (typeof rawOptions !== "string" || !rawOptions.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      rawOptions
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function parseOptionalPositiveInteger(
  value: FormDataEntryValue | null,
  {
    min,
    max,
    message,
    redirectPath,
  }: {
    min: number;
    max: number;
    message: string;
    redirectPath: string;
  },
) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    redirect(buildRedirectWithMessage(redirectPath, "error", message));
  }

  return parsed;
}

export function parseStructuredLessonSchema(
  value: FormDataEntryValue | null,
  redirectPath: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isStructuredLessonDocument(parsed)) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "The structured lesson blocks are not valid yet."));
    }

    return parsed;
  } catch {
    redirect(buildRedirectWithMessage(redirectPath, "error", "The structured lesson could not be read."));
  }
}

type FocusBlockTaskDraft = {
  id?: string | null;
  position?: number;
  title?: string;
  instructions?: string;
  estimated_minutes?: string | number | null;
};

export function parseGoalTaskIds(
  formData: FormData,
  redirectPath: string,
) {
  const rawValues = formData.getAll("goal_task_ids");
  const directValues = Array.from(
    new Set(
      rawValues
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

  if (directValues.length > 0) {
    return directValues;
  }

  const value = formData.get("goal_task_ids");

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "The selected recurring tasks could not be read."));
    }

    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  } catch {
    redirect(buildRedirectWithMessage(redirectPath, "error", "The selected recurring tasks could not be read."));
  }
}

export async function validateGoalTaskIds(
  supabase: SupabaseServerClient,
  userId: string,
  courseId: string,
  goalTaskIds: string[],
  redirectPath: string,
) {
  if (goalTaskIds.length === 0) {
    return [];
  }

  const { data: matchingTasks, error: matchingTasksError } = await supabase
    .from("course_tasks")
    .select("id, task_type")
    .eq("course_id", courseId)
    .eq("parent_user_id", userId)
    .in("id", goalTaskIds);

  if (matchingTasksError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(matchingTasksError.message),
      ),
    );
  }

  const allowedTaskIds = new Set(
    (matchingTasks ?? [])
      .filter(
        (task) =>
          task.task_type === "recurring_daily" || task.task_type === "recurring_weekly",
      )
      .map((task) => task.id),
  );

  if (allowedTaskIds.size !== goalTaskIds.length) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Choose only recurring daily or weekly tasks from this course for the goal mapping.",
      ),
    );
  }

  return goalTaskIds;
}

export function parseFocusBlockTaskDrafts(
  value: FormDataEntryValue | null,
  redirectPath: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Add at least one mini task to the focus block."));
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Add at least one mini task to the focus block."));
    }

    const drafts = parsed
      .map((item, index) => {
        const draft = item as FocusBlockTaskDraft;
        const id = typeof draft?.id === "string" && draft.id.trim() ? draft.id.trim() : null;
        const title = typeof draft?.title === "string" ? draft.title.trim() : "";
        const instructions =
          typeof draft?.instructions === "string" ? draft.instructions.trim() : "";
        const estimatedMinutesRaw = draft?.estimated_minutes;
        const estimatedMinutes =
          typeof estimatedMinutesRaw === "number"
            ? estimatedMinutesRaw
            : typeof estimatedMinutesRaw === "string" && estimatedMinutesRaw.trim()
              ? Number(estimatedMinutesRaw)
              : null;

        if (!title) {
          redirect(
            buildRedirectWithMessage(
              redirectPath,
              "error",
              `Mini task ${index + 1} needs a title.`,
            ),
          );
        }

        if (
          estimatedMinutes !== null &&
          (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 240)
        ) {
          redirect(
            buildRedirectWithMessage(
              redirectPath,
              "error",
              `Mini task ${index + 1} minutes should be between 1 and 240.`,
            ),
          );
        }

        return {
          id,
          title,
          instructions: instructions || null,
          estimated_minutes: estimatedMinutes,
          position: index,
        };
      })
      .filter(Boolean);

    if (drafts.length === 0) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Add at least one mini task to the focus block."));
    }

    return drafts;
  } catch {
    redirect(buildRedirectWithMessage(redirectPath, "error", "The focus block mini tasks could not be read."));
  }
}

export function redirectForCourseActionError(
  error: unknown,
  redirectPath: string,
  fallbackMessage = "We couldn't save that course change just yet.",
): never {
  if (error instanceof CourseValidationError) {
    redirect(buildRedirectWithMessage(redirectPath, "error", error.message));
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = typeof error.message === "string" ? error.message : fallbackMessage;
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(message),
      ),
    );
  }

  redirect(buildRedirectWithMessage(redirectPath, "error", fallbackMessage));
}

export async function resolveOrCreateTimedPhaseBackingModule(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  courseId: string;
  phaseId: string;
}): Promise<TimedPhaseModuleResolution> {
  const { supabase, parentUserId, courseId, phaseId } = input;

  const { data: existingModule, error: existingModuleError } = await supabase
    .from("course_modules")
    .select("id, course_id, phase_id, title, description, position, created_at")
    .eq("course_id", courseId)
    .eq("phase_id", phaseId)
    .eq("parent_user_id", parentUserId)
    .limit(1)
    .maybeSingle();

  if (existingModuleError) {
    return { error: getFriendlyCourseDatabaseError(existingModuleError.message) };
  }

  if (existingModule) {
    return { module: existingModule as CourseModuleRow };
  }

  const phase = await assertPhaseBelongsToCourse({
    supabase,
    parentUserId,
    courseId,
    phaseId,
    invalidMessage: "Choose a valid cycle before adding tasks.",
  });

  const { data: modules, error: modulesError } = await supabase
    .from("course_modules")
    .select("id", { count: "exact" })
    .eq("course_id", courseId)
    .eq("parent_user_id", parentUserId);

  if (modulesError) {
    return { error: getFriendlyCourseDatabaseError(modulesError.message) };
  }

  const { data: insertedModule, error: insertError } = await supabase
    .from("course_modules")
    .insert({
      course_id: courseId,
      phase_id: phaseId,
      parent_user_id: parentUserId,
      title: buildTimedPhaseBackingModuleTitle(`Phase ${phase.position + 1}`),
      description: buildTimedPhaseBackingModuleDescription(phaseId),
      position: modules?.length ?? 0,
    })
    .select("id, course_id, phase_id, title, description, position, created_at")
    .single();

  if (insertError || !insertedModule) {
    return {
      error: getFriendlyCourseDatabaseError(insertError?.message),
    };
  }

  return { module: insertedModule as CourseModuleRow };
}

export function revalidateCoursePages() {
  revalidatePath("/courses");
  revalidatePath("/learn");
}

function getPathnameOnly(path: string) {
  return path.split("?")[0] || path;
}

export function revalidateCourseMutationPaths(input: {
  redirectPath: string;
  courseId?: string | null;
  moduleId?: string | null;
}) {
  const redirectPathname = getPathnameOnly(input.redirectPath);
  revalidatePath(redirectPathname);

  if (input.courseId) {
    revalidatePath(`/courses/${input.courseId}`);
    revalidatePath(`/learn/courses/${input.courseId}`);
  }

  if (input.moduleId) {
    if (input.courseId) {
      revalidatePath(`/courses/${input.courseId}/modules/${input.moduleId}`);
    }
    revalidatePath(`/learn/modules/${input.moduleId}`);
  }
}

export async function updateTaskPositions(
  supabase: SupabaseServerClient,
  parentUserId: string,
  orderedTaskIds: string[],
) {
  const updateResults = await Promise.all(
    orderedTaskIds.map((taskId, position) =>
      supabase
        .from("course_tasks")
        .update({ position })
        .eq("id", taskId)
        .eq("parent_user_id", parentUserId),
    ),
  );

  const failedUpdate = updateResults.find((result) => result.error);
  return failedUpdate?.error ?? null;
}

export async function getAuthenticatedParent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}
