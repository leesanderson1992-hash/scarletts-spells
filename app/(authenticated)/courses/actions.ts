"use server";

import { redirect } from "next/navigation";

import { buildScopedPath } from "@/lib/children";

import {
  COURSE_GOAL_STATUSES,
  COURSE_STRUCTURE_TYPES,
  normaliseCourseStructureType,
  TIMED_COURSE_GOAL_KINDS,
} from "@/lib/courses/types";
import {
  assertCheckpointPlacementAllowedForCourse,
  assertCourseStructureCanChange,
  assertModuleBelongsToCourse,
  assertPhaseBelongsToCourse,
} from "@/lib/courses/validation";
import { getDateOnly } from "@/lib/courses/progress";
import {
  buildRedirectWithMessage,
  getAuthenticatedParent,
  getFriendlyCourseDatabaseError,
  getRedirectPath,
  parseGoalTaskIds,
  parseOptionalPositiveInteger,
  redirectForCourseActionError,
  revalidateCoursePages,
  validateGoalTaskIds,
  type SupabaseServerClient,
} from "@/app/courses/action-support";

function getTimedPhaseCount(
  durationWeeks: number | null | undefined,
  cycleLengthWeeks: number | null | undefined,
) {
  if (!durationWeeks || durationWeeks < 1) {
    return null;
  }

  const safeCycleLength = cycleLengthWeeks && cycleLengthWeeks > 0 ? cycleLengthWeeks : 4;
  return Math.ceil(durationWeeks / safeCycleLength);
}

function getTimedPhaseBoundaryDates(input: {
  startDate: string | null | undefined;
  durationWeeks: number | null | undefined;
  cycleLengthWeeks: number | null | undefined;
  phaseNumber: number;
}) {
  const { startDate, durationWeeks, cycleLengthWeeks, phaseNumber } = input;

  if (!startDate || !durationWeeks || durationWeeks < 1 || phaseNumber < 1) {
    return {
      start_date: null,
      end_date: null,
    };
  }

  const safeCycleLength = cycleLengthWeeks && cycleLengthWeeks > 0 ? cycleLengthWeeks : 4;
  const phaseStart = new Date(`${startDate}T00:00:00`);
  phaseStart.setDate(phaseStart.getDate() + (phaseNumber - 1) * safeCycleLength * 7);

  const phaseEnd = new Date(phaseStart);
  phaseEnd.setDate(phaseEnd.getDate() + safeCycleLength * 7 - 1);

  const courseEnd = new Date(`${startDate}T00:00:00`);
  courseEnd.setDate(courseEnd.getDate() + durationWeeks * 7 - 1);
  const boundedEnd = phaseEnd.getTime() <= courseEnd.getTime() ? phaseEnd : courseEnd;

  return {
    start_date: getDateOnly(phaseStart),
    end_date: getDateOnly(boundedEnd),
  };
}

async function syncTimedCoursePhases(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  courseId: string;
  startDate: string | null | undefined;
  durationWeeks: number | null | undefined;
  cycleLengthWeeks: number | null | undefined;
}) {
  const {
    supabase,
    parentUserId,
    courseId,
    startDate,
    durationWeeks,
    cycleLengthWeeks,
  } = input;
  const phaseCount = getTimedPhaseCount(durationWeeks, cycleLengthWeeks);

  const { data: existingPhases, error: existingError } = await supabase
    .from("course_phases")
    .select("id, title, description, position, start_date, end_date")
    .eq("course_id", courseId)
    .eq("parent_user_id", parentUserId)
    .order("position", { ascending: true });

  if (existingError) {
    return existingError.message;
  }

  const phases = existingPhases ?? [];

  if (!phaseCount) {
    const phaseIdsWithBoundaries = phases
      .filter((phase) => phase.start_date || phase.end_date)
      .map((phase) => phase.id);

    if (phaseIdsWithBoundaries.length === 0) {
      return null;
    }

    const { error: clearDatesError } = await supabase
      .from("course_phases")
      .update({ start_date: null, end_date: null })
      .in("id", phaseIdsWithBoundaries)
      .eq("parent_user_id", parentUserId);

    if (clearDatesError) {
      return clearDatesError.message;
    }

    return null;
  }

  const surplusPhases = phases.slice(phaseCount);

  if (surplusPhases.length > 0) {
    const surplusPhaseIds = surplusPhases.map((phase) => phase.id);
    const { count: linkedModuleCount, error: linkedModuleError } = await supabase
      .from("course_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .in("phase_id", surplusPhaseIds);

    if (linkedModuleError) {
      return linkedModuleError.message;
    }

    if ((linkedModuleCount ?? 0) > 0) {
      return "Timed phases could not shrink because some modules are still linked to the later phases.";
    }

    const { error: deleteError } = await supabase
      .from("course_phases")
      .delete()
      .eq("course_id", courseId)
      .eq("parent_user_id", parentUserId)
      .in("id", surplusPhaseIds);

    if (deleteError) {
      return deleteError.message;
    }
  }

  const activePhases = phases.slice(0, phaseCount);
  const phasesToInsert = Array.from(
    { length: Math.max(phaseCount - activePhases.length, 0) },
    (_, index) => {
      const position = activePhases.length + index;
      return {
        course_id: courseId,
        parent_user_id: parentUserId,
        title: `Phase ${position + 1}`,
        description: null,
        position,
        ...getTimedPhaseBoundaryDates({
          startDate,
          durationWeeks,
          cycleLengthWeeks,
          phaseNumber: position + 1,
        }),
      };
    },
  );

  if (phasesToInsert.length > 0) {
    const { error: insertError } = await supabase.from("course_phases").insert(phasesToInsert);

    if (insertError) {
      return insertError.message;
    }
  }

  for (const [index, phase] of activePhases.entries()) {
    const nextBoundaries = getTimedPhaseBoundaryDates({
      startDate,
      durationWeeks,
      cycleLengthWeeks,
      phaseNumber: index + 1,
    });
    const positionChanged = phase.position !== index;
    const startDateChanged = (phase.start_date ?? null) !== nextBoundaries.start_date;
    const endDateChanged = (phase.end_date ?? null) !== nextBoundaries.end_date;

    if (!positionChanged && !startDateChanged && !endDateChanged) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("course_phases")
      .update({
        position: index,
        start_date: nextBoundaries.start_date,
        end_date: nextBoundaries.end_date,
      })
      .eq("id", phase.id)
      .eq("parent_user_id", parentUserId);

    if (updateError) {
      return updateError.message;
    }
  }

  return null;
}

export async function createCourse(formData: FormData) {
  const redirectPath = getRedirectPath(formData, "/courses");
  const childId = formData.get("child_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const structureType = formData.get("structure_type");
  const startDate = formData.get("start_date");
  const durationWeeks = parseOptionalPositiveInteger(formData.get("duration_weeks"), {
    min: 1,
    max: 104,
    message: "Course length should be between 1 and 104 weeks.",
    redirectPath,
  });
  const cycleLengthWeeks = parseOptionalPositiveInteger(formData.get("cycle_length_weeks"), {
    min: 1,
    max: 12,
    message: "Cycle length should be between 1 and 12 weeks.",
    redirectPath,
  });

  if (typeof childId !== "string" || !childId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a child before creating a course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course title."));
  }

  if (
    typeof structureType !== "string" ||
    !COURSE_STRUCTURE_TYPES.includes(structureType as (typeof COURSE_STRUCTURE_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a course structure first."));
  }

  const safeStructureType = structureType as (typeof COURSE_STRUCTURE_TYPES)[number];
  const safeStartDate =
    safeStructureType === "timed" && typeof startDate === "string" && startDate
      ? startDate
      : null;
  const safeDurationWeeks = safeStructureType === "timed" ? durationWeeks : null;
  const safeCycleLengthWeeks = cycleLengthWeeks ?? 4;

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      parent_user_id: user.id,
      child_id: childId,
      structure_type: safeStructureType,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      start_date: safeStartDate,
      duration_weeks: safeDurationWeeks,
      cycle_length_weeks: safeCycleLengthWeeks,
      is_active: true,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error || !course) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error?.message),
      ),
    );
  }

  if (safeStructureType === "timed") {
    const phaseSyncError = await syncTimedCoursePhases({
      supabase,
      parentUserId: user.id,
      courseId: course.id,
      startDate: safeStartDate,
      durationWeeks: safeDurationWeeks,
      cycleLengthWeeks: safeCycleLengthWeeks ?? 4,
    });

    if (phaseSyncError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(phaseSyncError),
        ),
      );
    }
  }

  revalidateCoursePages();
  redirect(buildScopedPath(`/courses/${course.id}`, childId, "parent"));
}

export async function deleteCourse(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "deleted course"));
}

export async function createModule(formData: FormData) {
  const courseId = formData.get("course_id");
  const phaseId = formData.get("phase_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a module title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: course }, { count }, { data: phase }] = await Promise.all([
    supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id),
    typeof phaseId === "string" && phaseId.trim()
      ? supabase
          .from("course_phases")
          .select("id")
          .eq("id", phaseId)
          .eq("course_id", courseId)
          .eq("parent_user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof phaseId === "string" && phaseId.trim() && !phase) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid phase for that module."));
  }

  const { error } = await supabase.from("course_modules").insert({
    course_id: courseId,
    parent_user_id: user.id,
    phase_id: typeof phaseId === "string" && phaseId.trim() ? phaseId : null,
    title: title.trim(),
    description: typeof description === "string" ? description.trim() || null : null,
    position: count ?? 0,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module"));
}

export async function createCoursePhase(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a phase title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: course }, { count }] = await Promise.all([
    supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_phases")
      .select("*", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id),
  ]);

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const { error } = await supabase.from("course_phases").insert({
    course_id: courseId,
    parent_user_id: user.id,
    title: title.trim(),
    description: typeof description === "string" ? description.trim() || null : null,
    position: count ?? 0,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "phase"));
}

export async function updateCoursePhase(formData: FormData) {
  const phaseId = formData.get("phase_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof phaseId !== "string" || !phaseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that phase."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a phase title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("course_phases")
    .update({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
    })
    .eq("id", phaseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "phase"));
}

export async function updateCourse(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const description = formData.get("description");
  const structureType = formData.get("structure_type");
  const startDate = formData.get("start_date");
  const durationWeeks = parseOptionalPositiveInteger(formData.get("duration_weeks"), {
    min: 1,
    max: 104,
    message: "Course length should be between 1 and 104 weeks.",
    redirectPath,
  });
  const cycleLengthWeeks = parseOptionalPositiveInteger(formData.get("cycle_length_weeks"), {
    min: 1,
    max: 12,
    message: "Cycle length should be between 1 and 12 weeks.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course title."));
  }

  if (
    typeof structureType !== "string" ||
    !COURSE_STRUCTURE_TYPES.includes(structureType as (typeof COURSE_STRUCTURE_TYPES)[number])
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid course structure."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: existingCourse } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!existingCourse) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  try {
    await assertCourseStructureCanChange({
      supabase,
      parentUserId: user.id,
      courseId,
      currentStructureType: existingCourse.structure_type,
      nextStructureType: structureType,
    });
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

  const { error } = await supabase
    .from("courses")
    .update({
      structure_type: structureType,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      start_date: typeof startDate === "string" && startDate ? startDate : null,
      duration_weeks: durationWeeks,
      cycle_length_weeks: cycleLengthWeeks ?? 4,
    })
    .eq("id", courseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  if (structureType === "timed") {
    const phaseSyncError = await syncTimedCoursePhases({
      supabase,
      parentUserId: user.id,
      courseId,
      startDate: typeof startDate === "string" && startDate ? startDate : null,
      durationWeeks,
      cycleLengthWeeks: cycleLengthWeeks ?? 4,
    });

    if (phaseSyncError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(phaseSyncError),
        ),
      );
    }
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "course"));
}

export async function updateCourseParentVisibility(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const isActive = formData.get("is_active");

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (isActive !== "true" && isActive !== "false") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid parent view state."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const { error } = await supabase
    .from("courses")
    .update({ is_active: isActive === "true" })
    .eq("id", courseId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      isActive === "true" ? "course activated" : "course hidden",
    ),
  );
}

export async function updateModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a module title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("course_modules")
    .update({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
    })
    .eq("id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module"));
}

export async function moveModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const direction = formData.get("direction");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if (direction !== "up" && direction !== "down") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid module move."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: module } = await supabase
    .from("course_modules")
    .select("id, course_id, phase_id, position")
    .eq("id", moduleId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  let siblingsQuery = supabase
    .from("course_modules")
    .select("id, position")
    .eq("course_id", module.course_id)
    .eq("parent_user_id", user.id)
    .order("position", { ascending: true });

  siblingsQuery =
    module.phase_id === null
      ? siblingsQuery.is("phase_id", null)
      : siblingsQuery.eq("phase_id", module.phase_id);

  const { data: siblings } = await siblingsQuery;
  const orderedSiblings = siblings ?? [];
  const currentIndex = orderedSiblings.findIndex((item) => item.id === module.id);

  if (currentIndex === -1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't place that module."));
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= orderedSiblings.length) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "module order"));
  }

  const targetModule = orderedSiblings[targetIndex];

  const [{ error: currentError }, { error: targetError }] = await Promise.all([
    supabase
      .from("course_modules")
      .update({ position: targetModule.position })
      .eq("id", module.id)
      .eq("parent_user_id", user.id),
    supabase
      .from("course_modules")
      .update({ position: module.position })
      .eq("id", targetModule.id)
      .eq("parent_user_id", user.id),
  ]);

  const error = currentError ?? targetError;

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "module order"));
}

export async function archiveModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: module } = await supabase
    .from("course_modules")
    .select("id")
    .eq("id", moduleId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { error } = await supabase
    .from("course_tasks")
    .update({ is_active: false })
    .eq("module_id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(
    buildRedirectWithMessage(
      redirectPath,
      "saved",
      "archived module",
    ),
  );
}

export async function deleteModule(formData: FormData) {
  const moduleId = formData.get("module_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof moduleId !== "string" || !moduleId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const [{ data: module }, { count }] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id")
      .eq("id", moduleId)
      .eq("parent_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("course_tasks")
      .select("*", { count: "exact", head: true })
      .eq("module_id", moduleId)
      .eq("parent_user_id", user.id),
  ]);

  if (!module) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that module."));
  }

  if ((count ?? 0) > 0) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Clear or archive the tasks in this module before deleting it.",
      ),
    );
  }

  const { error } = await supabase
    .from("course_modules")
    .delete()
    .eq("id", moduleId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "deleted module"));
}


export async function moveCourseCheckpoint(formData: FormData) {
  const checkpointId = formData.get("checkpoint_id");
  const direction = formData.get("direction");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof checkpointId !== "string" || !checkpointId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that checkpoint."));
  }

  if (direction !== "up" && direction !== "down") {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid checkpoint move."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: checkpoint } = await supabase
    .from("course_checkpoints")
    .select("id, course_id, cycle_number, scheduled_date, created_at")
    .eq("id", checkpointId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!checkpoint) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that checkpoint."));
  }

  const { data: siblings, error } = await supabase
    .from("course_checkpoints")
    .select("id, cycle_number, scheduled_date, created_at")
    .eq("course_id", checkpoint.course_id)
    .eq("parent_user_id", user.id)
    .eq("cycle_number", checkpoint.cycle_number)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error || !siblings) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error?.message),
      ),
    );
  }

  const currentIndex = siblings.findIndex((item) => item.id === checkpoint.id);

  if (currentIndex === -1) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't place that checkpoint."));
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint order"));
  }

  const targetCheckpoint = siblings[targetIndex];
  const [{ error: currentError }, { error: targetError }] = await Promise.all([
    supabase
      .from("course_checkpoints")
      .update({ scheduled_date: targetCheckpoint.scheduled_date })
      .eq("id", checkpoint.id)
      .eq("parent_user_id", user.id),
    supabase
      .from("course_checkpoints")
      .update({ scheduled_date: checkpoint.scheduled_date })
      .eq("id", targetCheckpoint.id)
      .eq("parent_user_id", user.id),
  ]);

  const updateError = currentError ?? targetError;

  if (updateError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(updateError.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint order"));
}

export async function createCourseGoal(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const goalScope = formData.get("goal_scope");
  const timedGoalKind = formData.get("timed_goal_kind");
  const goalType = formData.get("goal_type");
  const unit = formData.get("unit");
  const progressSource = formData.get("progress_source");
  const timeSpan = formData.get("time_span");
  const goalTaskIds = parseGoalTaskIds(formData, redirectPath);
  const successDescription = formData.get("success_description");
  const status = formData.get("status");
  const targetQuantity = parseOptionalPositiveInteger(formData.get("target_quantity"), {
    min: 1,
    max: 10000,
    message: "Target quantity should be between 1 and 10000.",
    redirectPath,
  });
  const stretchTarget = parseOptionalPositiveInteger(formData.get("stretch_target"), {
    min: 1,
    max: 10000,
    message: "Stretch target should be between 1 and 10000.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course goal title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  let safeGoalType = goalType;
  let safeProgressSource = progressSource;
  let safeTimeSpan = timeSpan;
  let safeStatus = status;
  let safeTargetQuantity = targetQuantity;
  let safeStretchTarget = stretchTarget;
  let safeUnit = typeof unit === "string" ? unit.trim() : "";
  const trimmedTitle = title.trim();
  const safeSuccessDescription =
    typeof successDescription === "string" ? successDescription.trim() || null : null;

  if (
    goalScope === "timed_course_goal" &&
    normaliseCourseStructureType(course.structure_type) === "timed"
  ) {
    if (
      typeof timedGoalKind !== "string" ||
      !TIMED_COURSE_GOAL_KINDS.includes(
        timedGoalKind as (typeof TIMED_COURSE_GOAL_KINDS)[number],
      )
    ) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid timed goal kind."));
    }

    safeGoalType = timedGoalKind === "numerical" ? "count_goal" : "skill_goal";
    safeProgressSource = timedGoalKind === "numerical" ? "task_completion" : "manual_review";
    safeTimeSpan = "course_duration";
    safeStatus =
      typeof status === "string" &&
      COURSE_GOAL_STATUSES.includes(status as (typeof COURSE_GOAL_STATUSES)[number])
        ? status
        : "active";

    if (timedGoalKind === "numerical") {
      if (!safeTargetQuantity) {
        redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a numerical target."));
      }

      if (!safeUnit) {
        redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter what should be counted."));
      }
    } else {
      safeTargetQuantity = 1;
      safeStretchTarget = null;
      safeUnit = safeUnit || "aspiration";

      if (!safeSuccessDescription) {
        redirect(buildRedirectWithMessage(redirectPath, "error", "Describe what success looks like for this aspiration."));
      }
    }
  } else {
    if (!safeUnit) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter the goal unit."));
    }

    if (
      goalType !== "count_goal" &&
      goalType !== "completion_goal" &&
      goalType !== "skill_goal" &&
      goalType !== "submission_goal"
    ) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid goal type."));
    }

    if (
      progressSource !== "task_completion" &&
      progressSource !== "task_submission" &&
      progressSource !== "focus_block_completion" &&
      progressSource !== "manual_review" &&
      progressSource !== "spelling_progress"
    ) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid progress source."));
    }

    if (timeSpan !== "monthly" && timeSpan !== "cycle" && timeSpan !== "course_duration") {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid time span."));
    }

    if (status !== "planned" && status !== "active" && status !== "secure" && status !== "paused") {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid goal status."));
    }

    if (!safeTargetQuantity) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a target quantity."));
    }
  }

  if (goalTaskIds.length > 0 && safeProgressSource !== "task_completion") {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Only numerical task-completion goals can link recurring tasks.",
      ),
    );
  }

  const validatedGoalTaskIds = await validateGoalTaskIds(
    supabase,
    user.id,
    courseId,
    goalTaskIds,
    redirectPath,
  );

  const { data: insertedGoal, error } = await supabase
    .from("course_goals")
    .insert({
    course_id: courseId,
    parent_user_id: user.id,
    title: trimmedTitle,
    goal_type: safeGoalType,
    unit: safeUnit,
    target_quantity: safeTargetQuantity,
    progress_source: safeProgressSource,
    time_span: safeTimeSpan,
    success_description: safeSuccessDescription ?? trimmedTitle,
    stretch_target: safeStretchTarget,
    status: safeStatus,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  if (validatedGoalTaskIds.length > 0 && insertedGoal?.id) {
    const { error: goalTaskSourcesError } = await supabase
      .from("course_goal_task_sources")
      .insert(
        validatedGoalTaskIds.map((taskId) => ({
          course_id: courseId,
          goal_id: insertedGoal.id,
          task_id: taskId,
          parent_user_id: user.id,
        })),
      );

    if (goalTaskSourcesError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(goalTaskSourcesError.message),
        ),
      );
    }
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "course goal"));
}

export async function updateCourseGoal(formData: FormData) {
  const courseId = formData.get("course_id");
  const goalId = formData.get("goal_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const title = formData.get("title");
  const timedGoalKind = formData.get("timed_goal_kind");
  const unit = formData.get("unit");
  const goalTaskIds = parseGoalTaskIds(formData, redirectPath);
  const successDescription = formData.get("success_description");
  const targetQuantity = parseOptionalPositiveInteger(formData.get("target_quantity"), {
    min: 1,
    max: 10000,
    message: "Target quantity should be between 1 and 10000.",
    redirectPath,
  });
  const stretchTarget = parseOptionalPositiveInteger(formData.get("stretch_target"), {
    min: 1,
    max: 10000,
    message: "Stretch target should be between 1 and 10000.",
    redirectPath,
  });

  if (
    typeof courseId !== "string" ||
    !courseId ||
    typeof goalId !== "string" ||
    !goalId
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course goal."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a course goal title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: goal, error: goalError } = await supabase
    .from("course_goals")
    .select("id, course_id, goal_type, progress_source, time_span, status")
    .eq("id", goalId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (goalError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(goalError.message),
      ),
    );
  }

  if (!goal) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course goal."));
  }

  if (
    typeof timedGoalKind !== "string" ||
    !TIMED_COURSE_GOAL_KINDS.includes(
      timedGoalKind as (typeof TIMED_COURSE_GOAL_KINDS)[number],
    )
  ) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Choose a valid timed goal kind."));
  }

  const trimmedTitle = title.trim();
  const safeSuccessDescription =
    typeof successDescription === "string" ? successDescription.trim() || null : null;
  const safeGoalType = timedGoalKind === "numerical" ? "count_goal" : "skill_goal";
  const safeProgressSource =
    timedGoalKind === "numerical" ? "task_completion" : "manual_review";
  let safeTargetQuantity = targetQuantity;
  let safeStretchTarget = stretchTarget;
  let safeUnit = typeof unit === "string" ? unit.trim() : "";

  if (timedGoalKind === "numerical") {
    if (!safeTargetQuantity) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a numerical target."));
    }

    if (!safeUnit) {
      redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter what should be counted."));
    }
  } else {
    safeTargetQuantity = 1;
    safeStretchTarget = null;
    safeUnit = safeUnit || "aspiration";

    if (!safeSuccessDescription) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          "Describe what success looks like for this aspiration.",
        ),
      );
    }
  }

  if (goalTaskIds.length > 0 && safeProgressSource !== "task_completion") {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Only numerical task-completion goals can link recurring tasks.",
      ),
    );
  }

  const validatedGoalTaskIds = await validateGoalTaskIds(
    supabase,
    user.id,
    courseId,
    goalTaskIds,
    redirectPath,
  );

  const { error: updateError } = await supabase
    .from("course_goals")
    .update({
      title: trimmedTitle,
      goal_type: safeGoalType,
      unit: safeUnit,
      target_quantity: safeTargetQuantity,
      progress_source: safeProgressSource,
      time_span: "course_duration",
      success_description: safeSuccessDescription ?? trimmedTitle,
      stretch_target: safeStretchTarget,
      status: goal.status,
    })
    .eq("id", goalId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id);

  if (updateError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(updateError.message),
      ),
    );
  }

  const { error: deleteMappingError } = await supabase
    .from("course_goal_task_sources")
    .delete()
    .eq("goal_id", goalId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id);

  if (deleteMappingError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(deleteMappingError.message),
      ),
    );
  }

  if (validatedGoalTaskIds.length > 0) {
    const { error: insertMappingError } = await supabase
      .from("course_goal_task_sources")
      .insert(
        validatedGoalTaskIds.map((taskId) => ({
          course_id: courseId,
          goal_id: goalId,
          task_id: taskId,
          parent_user_id: user.id,
        })),
      );

    if (insertMappingError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(insertMappingError.message),
        ),
      );
    }
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "course goal"));
}

export async function updateCourseGoalTaskSources(formData: FormData) {
  const courseId = formData.get("course_id");
  const goalId = formData.get("goal_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const goalTaskIds = parseGoalTaskIds(formData, redirectPath);

  if (typeof courseId !== "string" || !courseId || typeof goalId !== "string" || !goalId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course goal."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: goal, error: goalError } = await supabase
    .from("course_goals")
    .select("id, course_id, goal_type, progress_source")
    .eq("id", goalId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (goalError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(goalError.message),
      ),
    );
  }

  if (!goal) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course goal."));
  }

  if (goal.progress_source !== "task_completion" || goal.goal_type !== "count_goal") {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        "Only numerical task-completion goals can link recurring tasks.",
      ),
    );
  }

  const validatedGoalTaskIds = await validateGoalTaskIds(
    supabase,
    user.id,
    courseId,
    goalTaskIds,
    redirectPath,
  );

  const { error: deleteError } = await supabase
    .from("course_goal_task_sources")
    .delete()
    .eq("goal_id", goalId)
    .eq("course_id", courseId)
    .eq("parent_user_id", user.id);

  if (deleteError) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(deleteError.message),
      ),
    );
  }

  if (validatedGoalTaskIds.length > 0) {
    const { error: insertError } = await supabase
      .from("course_goal_task_sources")
      .insert(
        validatedGoalTaskIds.map((taskId) => ({
          course_id: courseId,
          goal_id: goalId,
          task_id: taskId,
          parent_user_id: user.id,
        })),
      );

    if (insertError) {
      redirect(
        buildRedirectWithMessage(
          redirectPath,
          "error",
          getFriendlyCourseDatabaseError(insertError.message),
        ),
      );
    }
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "goal mapping"));
}

export async function createCourseCheckpoint(formData: FormData) {
  const courseId = formData.get("course_id");
  const redirectPath = getRedirectPath(
    formData,
    typeof courseId === "string" ? `/courses/${courseId}` : "/courses",
  );
  const phaseId = formData.get("phase_id");
  const moduleId = formData.get("module_id");
  const title = formData.get("title");
  const target = formData.get("target");
  const scheduledDate = formData.get("scheduled_date");
  const notes = formData.get("notes");
  const cycleNumber = parseOptionalPositiveInteger(formData.get("cycle_number"), {
    min: 1,
    max: 52,
    message: "Cycle number should be between 1 and 52.",
    redirectPath,
  });

  if (typeof courseId !== "string" || !courseId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a checkpoint title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", courseId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const structureType = normaliseCourseStructureType(course.structure_type);
  let safePhaseId: string | null = null;

  try {
    assertCheckpointPlacementAllowedForCourse({
      structureType,
      phaseId,
      cycleNumber,
    });

    if (structureType === "phased") {
      safePhaseId = (
        await assertPhaseBelongsToCourse({
          supabase,
          parentUserId: user.id,
          courseId,
          phaseId: phaseId as string,
          invalidMessage: "Choose a valid phase for that review point.",
        })
      ).id;
    }

    if (typeof moduleId === "string" && moduleId.trim()) {
      await assertModuleBelongsToCourse({
        supabase,
        parentUserId: user.id,
        courseId,
        moduleId,
        invalidMessage: "Choose a valid module for that review point.",
      });
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

  const { error } = await supabase.from("course_checkpoints").insert({
    course_id: courseId,
    phase_id: safePhaseId,
    module_id: typeof moduleId === "string" && moduleId.trim() ? moduleId : null,
    parent_user_id: user.id,
    title: title.trim(),
    cycle_number: structureType === "timed" ? cycleNumber : null,
    target: typeof target === "string" ? target.trim() || null : null,
    scheduled_date: typeof scheduledDate === "string" && scheduledDate ? scheduledDate : null,
    notes: typeof notes === "string" ? notes.trim() || null : null,
  });

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint"));
}

export async function updateCourseCheckpoint(formData: FormData) {
  const checkpointId = formData.get("checkpoint_id");
  const title = formData.get("title");
  const target = formData.get("target");
  const scheduledDate = formData.get("scheduled_date");
  const notes = formData.get("notes");
  const phaseId = formData.get("phase_id");
  const redirectPath = getRedirectPath(formData, "/courses");
  const cycleNumber = parseOptionalPositiveInteger(formData.get("cycle_number"), {
    min: 1,
    max: 52,
    message: "Cycle number should be between 1 and 52.",
    redirectPath,
  });

  if (typeof checkpointId !== "string" || !checkpointId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that checkpoint."));
  }

  if (typeof title !== "string" || !title.trim()) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "Please enter a checkpoint title."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { data: checkpoint } = await supabase
    .from("course_checkpoints")
    .select("id, course_id")
    .eq("id", checkpointId)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!checkpoint) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that checkpoint."));
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, structure_type")
    .eq("id", checkpoint.course_id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that course."));
  }

  const structureType = normaliseCourseStructureType(course.structure_type);
  let safePhaseId: string | null = null;

  try {
    assertCheckpointPlacementAllowedForCourse({
      structureType,
      phaseId,
      cycleNumber,
    });

    if (structureType === "phased") {
      safePhaseId = (
        await assertPhaseBelongsToCourse({
          supabase,
          parentUserId: user.id,
          courseId: course.id,
          phaseId: phaseId as string,
          invalidMessage: "Choose a valid phase for that review point.",
        })
      ).id;
    }
  } catch (error) {
    redirectForCourseActionError(error, redirectPath);
  }

  const { error } = await supabase
    .from("course_checkpoints")
    .update({
      title: title.trim(),
      target: typeof target === "string" ? target.trim() || null : null,
      scheduled_date: typeof scheduledDate === "string" && scheduledDate ? scheduledDate : null,
      notes: typeof notes === "string" ? notes.trim() || null : null,
      cycle_number: structureType === "timed" ? cycleNumber : null,
      phase_id: structureType === "phased" ? safePhaseId : null,
    })
    .eq("id", checkpointId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint"));
}

export async function deleteCourseCheckpoint(formData: FormData) {
  const checkpointId = formData.get("checkpoint_id");
  const redirectPath = getRedirectPath(formData, "/courses");

  if (typeof checkpointId !== "string" || !checkpointId) {
    redirect(buildRedirectWithMessage(redirectPath, "error", "We couldn't find that checkpoint."));
  }

  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("course_checkpoints")
    .delete()
    .eq("id", checkpointId)
    .eq("parent_user_id", user.id);

  if (error) {
    redirect(
      buildRedirectWithMessage(
        redirectPath,
        "error",
        getFriendlyCourseDatabaseError(error.message),
      ),
    );
  }

  revalidateCoursePages();
  redirect(buildRedirectWithMessage(redirectPath, "saved", "checkpoint"));
}
