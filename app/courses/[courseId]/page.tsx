import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  formatCourseDate,
  getCurrentCycle,
  getCourseActivityForChild,
  getActiveChildrenForUser,
  getCycleDateRange,
  getCourseDetailForParent,
  getTotalCycles,
} from "@/lib/courses/queries";
import {
  formatCourseGoalTarget,
  formatSuggestedPace,
  getCourseGoalGuidance,
} from "@/lib/courses/goals";
import { getModuleCompletionMap } from "@/lib/courses/progress";
import {
  COURSE_STRUCTURE_TYPES,
  COURSE_GOAL_PROGRESS_SOURCE_LABELS,
  COURSE_GOAL_PROGRESS_SOURCES,
  COURSE_GOAL_STATUSES,
  COURSE_GOAL_STATUS_LABELS,
  COURSE_GOAL_TIME_SPANS,
  COURSE_GOAL_TIME_SPAN_LABELS,
  COURSE_GOAL_TYPE_LABELS,
  COURSE_GOAL_TYPES,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import {
  archiveModule,
  createCoursePhase,
  createCourseGoal,
  createCourseCheckpoint,
  createFocusBlock,
  createModule,
  createTask,
  deleteCourse,
  deleteModule,
  moveModule,
  updateCourse,
  updateModule,
} from "../actions";

type CourseDetailPageProps = {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    edit?: string;
    step?: string;
  }>;
};

function withQuery(path: string, updates: Record<string, string | null | undefined>) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function formatWeeklyGoodDays(weekdays: string[] | null | undefined) {
  if (!weekdays?.length) {
    return null;
  }

  const labels: Record<string, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };

  return weekdays.map((day) => labels[day] ?? day).join(", ");
}

function normaliseWizardStep(value: string | undefined, maxStep: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 1;
  }

  return Math.min(Math.max(parsed, 1), maxStep);
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: CourseDetailPageProps) {
  const { courseId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const detail = await getCourseDetailForParent(supabase, user.id, courseId);

  if (!detail) {
    notFound();
  }

  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie ?? detail.course.child_id,
  );
  const courseActivity = await getCourseActivityForChild(
    supabase,
    detail.course.child_id,
    courseId,
  );
  const currentPath = `/courses/${courseId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const scopedCoursesPath = buildScopedPath("/courses", selectedChild?.id ?? null, mode);
  const stepOnePath = withQuery(scopedCurrentPath, { step: "1" });
  const stepTwoPath = withQuery(scopedCurrentPath, { step: "2" });
  const stepThreePath = withQuery(scopedCurrentPath, { step: "3" });
  const stepFourPath = withQuery(scopedCurrentPath, { step: "4" });
  const stepFivePath = withQuery(scopedCurrentPath, { step: "5" });
  const stepSixPath = withQuery(scopedCurrentPath, { step: "6" });
  const editingModuleId = resolvedSearchParams?.edit ?? null;
  const courseStructure = detail.course.structure_type ?? "timed";
  const wizardSteps =
    courseStructure === "phased"
      ? ([
          { id: 1, label: "Phases" },
          { id: 2, label: "Modules" },
          { id: 3, label: "Lessons and activities" },
          { id: 4, label: "Phase review" },
          { id: 5, label: "Final review" },
        ] as const)
      : ([
          { id: 1, label: "Goals" },
          { id: 2, label: "Focus" },
          { id: 3, label: "Recurring" },
          { id: 4, label: "Tasks" },
          { id: 5, label: "Review point" },
          { id: 6, label: "Course review" },
        ] as const);
  const activeStep = normaliseWizardStep(resolvedSearchParams?.step, wizardSteps.length);
  const contentStep = courseStructure === "phased" ? activeStep + 1 : activeStep;
  const currentWizardPath = withQuery(scopedCurrentPath, { step: String(activeStep) });
  const totalCycles = getTotalCycles(
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
  );
  const allTasks = detail.modules.flatMap((module) =>
    module.tasks.map((task) => ({
      ...task,
      moduleTitle: module.title,
    })),
  );
  const recurringDailyTasks = allTasks.filter((task) => task.task_type === "recurring_daily");
  const recurringWeeklyTasks = allTasks.filter((task) => task.task_type === "recurring_weekly");
  const otherTasks = allTasks.filter(
    (task) => task.task_type !== "recurring_daily" && task.task_type !== "recurring_weekly",
  );
  const recurringDailyModules = detail.modules.filter((module) =>
    module.tasks.some((task) => task.task_type === "recurring_daily"),
  );
  const recurringWeeklyModules = detail.modules.filter((module) =>
    module.tasks.some((task) => task.task_type === "recurring_weekly"),
  );
  const currentCycle = getCurrentCycle(
    detail.course.start_date,
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
  );
  const currentCycleRange = getCycleDateRange(
    detail.course.start_date,
    detail.course.cycle_length_weeks,
    currentCycle,
  );
  const nextCheckpoint =
    detail.checkpoints.find((checkpoint) => {
      if (!checkpoint.scheduled_date) {
        return false;
      }

      return new Date(`${checkpoint.scheduled_date}T00:00:00`).getTime() >= Date.now() - 86400000;
    }) ?? detail.checkpoints[0] ?? null;
  const activeFocusBlock =
    detail.focusBlocks.find((focusBlock) =>
      currentCycle ? focusBlock.cycle_number === currentCycle : focusBlock.is_active,
    ) ?? detail.focusBlocks.find((focusBlock) => focusBlock.is_active) ?? null;
  const linkedFocusTasks = activeFocusBlock
    ? allTasks.filter((task) => task.focus_block_id === activeFocusBlock.id)
    : [];
  const recurringTaskCount = recurringDailyTasks.length + recurringWeeklyTasks.length;
  const checkpointsThisCycle = currentCycle
    ? detail.checkpoints.filter((checkpoint) => checkpoint.cycle_number === currentCycle)
    : [];
  const cyclePlan =
    totalCycles && totalCycles > 0
      ? Array.from({ length: totalCycles }, (_, index) => {
          const cycleNumber = index + 1;
          const focusBlock =
            detail.focusBlocks.find((item) => item.cycle_number === cycleNumber) ?? null;
          const checkpoints = detail.checkpoints.filter(
            (item) => item.cycle_number === cycleNumber,
          );
          const range = getCycleDateRange(
            detail.course.start_date,
            detail.course.cycle_length_weeks,
            cycleNumber,
          );

          return {
            cycleNumber,
            focusBlock,
            checkpoints,
            range,
            isCurrent: currentCycle === cycleNumber,
          };
        })
      : [];
  const nextPlanningMove =
    courseStructure === "phased"
      ? detail.phases.length === 0
        ? "Add the first phase so this course has a clear sequence."
        : detail.modules.length === 0
          ? "Add modules inside the phases so the child can work through them in order."
          : !nextCheckpoint
            ? "Add a review point so the phased course still has a clear check-in moment."
            : "The main phased structure is in place. Add the lessons, activities, and checks inside the ordered modules."
      : detail.goals.length === 0
        ? "Add a course goal first so the course has a clear outcome."
        : !activeFocusBlock
          ? "Add one focus block for this cycle so the course has a clear current mission."
          : recurringTaskCount === 0
            ? "Add recurring training next so monthly targets live on daily or weekly tasks."
            : !nextCheckpoint
              ? "Add a checkpoint so this cycle has a clear review point."
              : "The main planning pieces are in place. Adjust tasks and focus links as the cycle evolves.";
  const reviewGaps = (
    courseStructure === "phased"
      ? [
          detail.phases.length === 0 ? { label: "Add at least one phase", step: 1 } : null,
          detail.modules.length === 0 ? { label: "Add modules inside the phases", step: 2 } : null,
          !nextCheckpoint ? { label: "Add a review point", step: 4 } : null,
        ]
      : [
          detail.goals.length === 0 ? { label: "Add at least one course goal", step: 1 } : null,
          !activeFocusBlock ? { label: "Plan the current cycle focus block", step: 2 } : null,
          recurringTaskCount === 0 ? { label: "Add daily habits or weekly goals", step: 3 } : null,
          !nextCheckpoint ? { label: "Add one review checkpoint", step: 5 } : null,
          detail.modules.length === 0 ? { label: "Add a module for course organisation", step: 4 } : null,
        ]
  ).filter((item): item is { label: string; step: number } => Boolean(item));
  const [{ data: submissions }, { data: linkedSamples }] = await Promise.all([
    supabase
      .from("task_submissions")
      .select("id, task_id, submission_text, submitted_at")
      .eq("course_id", courseId)
      .eq("parent_user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(12),
    supabase
      .from("writing_samples")
      .select("id, task_submission_id")
      .eq("parent_user_id", user.id)
      .not("task_submission_id", "is", null),
  ]);
  const analysedSubmissionIds = new Set(
    (linkedSamples ?? [])
      .map((sample) => sample.task_submission_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const modulePhaseOptions = detail.phases.map((phase) => ({
    ...phase,
    modules: detail.modules.filter((module) => module.phase_id === phase.id),
  }));
  const moduleCompletionById = getModuleCompletionMap(
    detail.modules,
    courseActivity.completions,
    courseActivity.submissions,
  );
  return (
    <AppShell
      currentPath="/courses"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-3">
        <div className="brand-card rounded-3xl p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Course</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                {detail.course.title}
              </h1>
              {detail.course.description ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  {detail.course.description}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {detail.modules.length} {detail.modules.length === 1 ? "module" : "modules"}
              </div>
              <Link
                href={buildScopedPath(`/courses/${courseId}/edit`, selectedChild?.id ?? null, mode)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                title={`Edit ${detail.course.title}`}
                aria-label={`Edit ${detail.course.title}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                </svg>
              </Link>
              <button
                type="submit"
                form="delete-course-detail-form"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                title={`Delete ${detail.course.title} forever`}
                aria-label={`Delete ${detail.course.title} forever`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                </svg>
              </button>
            </div>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3 grid gap-2">
              {resolvedSearchParams?.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}

              {resolvedSearchParams?.saved ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  Saved {resolvedSearchParams.saved}.
                </p>
              ) : null}
            </div>
          ) : null}

          <form id="delete-course-detail-form" action={deleteCourse} className="hidden">
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="redirect_path" value={scopedCoursesPath} />
          </form>

          <div className="mt-3 grid gap-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
            {courseStructure === "phased" ? (
              <>
                <form
                  action={updateCourse}
                  className="grid gap-2 rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input type="hidden" name="structure_type" value={courseStructure} />
                  <input type="hidden" name="duration_weeks" value={detail.course.duration_weeks ?? ""} />
                  <input type="hidden" name="cycle_length_weeks" value={detail.course.cycle_length_weeks ?? 4} />
                  <input type="hidden" name="title" value={detail.course.title} />
                  <input type="hidden" name="description" value={detail.course.description ?? ""} />
                  <input
                    type="date"
                    name="start_date"
                    defaultValue={detail.course.start_date ?? ""}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    aria-label="Optional course start date"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                    title="Save course details"
                    aria-label="Save course details"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                      <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
                    </svg>
                  </button>
                </form>

                <div className="rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="brand-eyebrow">Phases</p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {detail.phases.length} phase{detail.phases.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {detail.phases.length > 0
                      ? "Use phases as ordered stages for the child to work through."
                      : "Add phases first so the course has a clear sequence."}
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="brand-eyebrow">Progression</p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {detail.modules.length} module{detail.modules.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {nextCheckpoint
                      ? `Next review: ${nextCheckpoint.title}`
                      : "Add a review point when a phase or chunk is ready to check."}
                  </p>
                </div>
              </>
            ) : (
              <>
                <form
                  action={updateCourse}
                  className="grid gap-2 rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto]"
                >
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input type="hidden" name="structure_type" value={courseStructure} />
                  <input
                    type="date"
                    name="start_date"
                    defaultValue={detail.course.start_date ?? ""}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    aria-label="Course start date"
                  />
                  <input
                    type="number"
                    name="duration_weeks"
                    min={1}
                    max={104}
                    defaultValue={detail.course.duration_weeks ?? ""}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Duration weeks"
                    aria-label="Course duration in weeks"
                  />
                  <input
                    type="number"
                    name="cycle_length_weeks"
                    min={1}
                    max={12}
                    defaultValue={detail.course.cycle_length_weeks ?? 4}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Cycle"
                    aria-label="Course cycle length in weeks"
                  />
                  <input type="hidden" name="title" value={detail.course.title} />
                  <input type="hidden" name="description" value={detail.course.description ?? ""} />
                  <button
                    type="submit"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                    title="Save course timing"
                    aria-label="Save course timing"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                      <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
                    </svg>
                  </button>
                </form>

                <div className="rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="brand-eyebrow">Cycle plan</p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {detail.course.duration_weeks
                      ? `${detail.course.duration_weeks}-week course`
                      : "Course length not set"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {totalCycles
                      ? `${totalCycles} cycle${totalCycles === 1 ? "" : "s"} of ${detail.course.cycle_length_weeks ?? 4} weeks`
                      : "Add a course length to break this into 4-week cycles."}
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3">
                  <p className="brand-eyebrow">Current cycle</p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                    {currentCycle ? `Cycle ${currentCycle}` : "Not started yet"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {currentCycleRange
                      ? `${formatCourseDate(currentCycleRange.start)} to ${formatCourseDate(currentCycleRange.end)}`
                      : "Set a start date to show the live cycle window."}
                  </p>
                  {nextCheckpoint ? (
                    <p className="mt-2 text-xs text-[color:var(--mid)]">
                      Next checkpoint: {nextCheckpoint.title}
                      {nextCheckpoint.scheduled_date
                        ? ` · ${formatCourseDate(nextCheckpoint.scheduled_date)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div className="mt-3 rounded-[1.25rem] border border-[var(--border)] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Planner</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {nextPlanningMove}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeStep > 1 ? (
                  <Link
                    href={withQuery(scopedCurrentPath, { step: String(activeStep - 1) })}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                    title="Previous step"
                    aria-label="Previous step"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M11.7 4.3a1 1 0 0 1 0 1.4L7.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  </Link>
                ) : null}
                {activeStep < wizardSteps.length ? (
                  <Link
                    href={withQuery(scopedCurrentPath, { step: String(activeStep + 1) })}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                    title="Next step"
                    aria-label="Next step"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M8.3 15.7a1 1 0 0 1 0-1.4L12.6 10 8.3 5.7a1 1 0 1 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z" />
                    </svg>
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {wizardSteps.map((step) => {
                const done =
                  courseStructure === "phased"
                    ? step.id === 1
                      ? detail.phases.length > 0
                      : step.id === 2
                        ? detail.modules.length > 0
                        : step.id === 3
                          ? allTasks.length > 0
                          : step.id === 4
                            ? Boolean(nextCheckpoint)
                            : false
                    : step.id === 1
                      ? detail.goals.length > 0
                      : step.id === 2
                        ? Boolean(activeFocusBlock)
                        : step.id === 3
                          ? recurringTaskCount > 0
                          : step.id === 4
                            ? otherTasks.length > 0 || detail.modules.length > 0
                            : step.id === 5
                              ? Boolean(nextCheckpoint)
                              : false;

                return (
                  <Link
                    key={step.id}
                    href={withQuery(scopedCurrentPath, { step: String(step.id) })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      activeStep === step.id
                        ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.55)] text-[color:var(--ink)]"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                    }`}
                  >
                    {step.id}. {step.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {contentStep === 1 ? (
          <section className="brand-card rounded-3xl p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Set the outcome
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Course type and timing stay in the settings above. Use course goals here to decide what this timed course is aiming for overall.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                Timed course
              </div>
            </div>

            <div className="mt-3 grid gap-2.5">

              {courseStructure === "timed" ? detail.goals.map((goal) => {
                const guidance = getCourseGoalGuidance(goal, detail.course);

                return (
                  <div key={goal.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">{goal.title}</p>
                          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                            {COURSE_GOAL_TYPE_LABELS[goal.goal_type]}
                          </span>
                          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                            {COURSE_GOAL_STATUS_LABELS[goal.status]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--ink)]">
                          Target: {formatCourseGoalTarget(goal)}
                          {goal.stretch_target ? ` · Stretch ${goal.stretch_target} ${goal.unit}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {COURSE_GOAL_TIME_SPAN_LABELS[goal.time_span]} · {COURSE_GOAL_PROGRESS_SOURCE_LABELS[goal.progress_source]}
                        </p>
                        {goal.success_description ? (
                          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                            {goal.success_description}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          Recommended shape
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                          {guidance.recommended_task_type}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.62)] px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          Suggested pace
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                          {formatSuggestedPace(guidance.recommended_daily_pace, "day") ??
                            formatSuggestedPace(guidance.recommended_weekly_pace, "week") ??
                            "No fixed pace needed"}
                        </p>
                        {guidance.recommended_daily_pace && guidance.recommended_weekly_pace ? (
                          <p className="mt-1 text-xs text-[color:var(--mid)]">
                            {formatSuggestedPace(guidance.recommended_weekly_pace, "week")}
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(236,253,245,0.6)] px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          Tracking
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                          {guidance.recommended_tracking_mode}
                        </p>
                      </div>
                      {guidance.suggested_mission_shape ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                            Mission suggestion
                          </p>
                          <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                            {guidance.suggested_mission_shape}
                          </p>
                        </div>
                      ) : null}
                      {guidance.suggested_checkpoint_frequency ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                            Checkpoint suggestion
                          </p>
                          <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                            {guidance.suggested_checkpoint_frequency}
                          </p>
                        </div>
                      ) : null}
                      <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3 md:col-span-2 xl:col-span-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          Best next step
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink)]">
                          {guidance.suggested_next_step}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[color:var(--mid)]">
                          {guidance.parent_control_note}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }) : null}

              {courseStructure === "timed" && detail.goals.length === 0 ? (
                <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                  No course goals yet. Add a goal first, then use the suggestions to decide recurring tasks, current missions, and checkpoints.
                </p>
              ) : null}

              {courseStructure === "timed" ? (
                <form
                  action={createCourseGoal}
                  className="grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1.1fr)_180px_140px_140px_auto]"
                >
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input
                    type="text"
                    name="title"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Course goal title"
                  />
                  <select
                    name="goal_type"
                    defaultValue="count_goal"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  >
                    {COURSE_GOAL_TYPES.map((goalType) => (
                      <option key={goalType} value={goalType}>
                        {COURSE_GOAL_TYPE_LABELS[goalType]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="target_quantity"
                    min={1}
                    max={10000}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Target"
                  />
                  <input
                    type="text"
                    name="unit"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Unit"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                  >
                    Add goal
                  </button>
                  <input type="hidden" name="progress_source" value="task_completion" />
                  <input type="hidden" name="time_span" value="course_duration" />
                  <input type="hidden" name="status" value="active" />
                  <input type="hidden" name="success_description" value="" />
                </form>
              ) : null}
            </div>
          </section>
          ) : null}

          {contentStep === 2 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add the phases
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      A phased course moves through stages. Add the phases first, then place modules inside them in the next step.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.phases.length} phase{detail.phases.length === 1 ? "" : "s"}
                  </div>
                </div>

                <form action={createCoursePhase} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  <input
                    type="text"
                    name="title"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Phase title"
                  />
                  <input
                    type="text"
                    name="description"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="What happens in this phase?"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                  >
                    Add phase
                  </button>
                </form>

                <div className="mt-3 grid gap-2">
                  {detail.phases.length > 0 ? (
                    detail.phases.map((phase) => {
                      const phaseModules = detail.modules.filter((module) => module.phase_id === phase.id);
                      return (
                        <div key={phase.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{phase.title}</p>
                            <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                              {phaseModules.length} module{phaseModules.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {phase.description ? (
                            <p className="mt-1 text-sm text-[color:var(--mid)]">{phase.description}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-[color:var(--mid)]">
                            Modules are added in the next step. Badge upload comes in a later pass.
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                      No phases yet. Add the stages first, then place modules into them.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Choose the current mission
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Add one focus block for this cycle. This is the main push right now, not the whole future plan.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {linkedFocusTasks.length} linked task{linkedFocusTasks.length === 1 ? "" : "s"}
              </div>
            </div>

            <form action={createFocusBlock} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_140px_auto]">
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="redirect_path" value={currentWizardPath} />
              <input
                type="text"
                name="title"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder="Focus block title"
              />
              <input
                type="text"
                name="goal"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder="Current mission"
              />
              <input
                type="number"
                name="cycle_number"
                min={1}
                max={totalCycles ?? 52}
                defaultValue={currentCycle ?? ""}
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder="Cycle"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
              >
                Add focus block
              </button>
            </form>

            <div className="mt-3 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                {activeFocusBlock ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{activeFocusBlock.title}</p>
                      {activeFocusBlock.cycle_number ? (
                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                          Cycle {activeFocusBlock.cycle_number}
                        </span>
                      ) : null}
                    </div>
                    {activeFocusBlock.goal ? (
                      <p className="mt-2 text-sm text-[color:var(--ink)]">{activeFocusBlock.goal}</p>
                    ) : null}
                    {activeFocusBlock.description ? (
                      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">{activeFocusBlock.description}</p>
                    ) : null}
                    {(activeFocusBlock.start_date || activeFocusBlock.end_date) ? (
                      <p className="mt-2 text-xs text-[color:var(--mid)]">
                        {formatCourseDate(activeFocusBlock.start_date) ?? "Now"} to {formatCourseDate(activeFocusBlock.end_date) ?? "open end"}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-[color:var(--mid)]">
                    No active focus block yet. Add one when this course needs a clear current mission.
                  </p>
                )}
              </div>

              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Linked tasks
                  </p>
                  {activeFocusBlock && linkedFocusTasks.length > 0 ? (
                    <span className="text-xs text-[color:var(--mid)]">
                      Practical next steps
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {linkedFocusTasks.length > 0 ? (
                    linkedFocusTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.42)] px-3 py-3">
                        <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                        <p className="mt-1 text-xs text-[color:var(--mid)]">
                          {task.moduleTitle}
                          {task.estimated_minutes ? ` · ${task.estimated_minutes} min` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">
                      No tasks are linked yet. Link the next few practical steps to this focus block rather than planning the whole future at once.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Across the course
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    Plan one focus block per cycle so you can see what is current, what is next, and which cycles still need a mission.
                  </p>
                </div>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
                  {cyclePlan.length} cycle{cyclePlan.length === 1 ? "" : "s"}
                </span>
              </div>

              {cyclePlan.length > 0 ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {cyclePlan.map((cycle) => (
                    <div
                      key={cycle.cycleNumber}
                      className={`rounded-2xl border px-3 py-3 ${
                        cycle.isCurrent
                          ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.28)]"
                          : "border-[var(--border)] bg-[rgba(255,247,220,0.35)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--ink)]">
                          Cycle {cycle.cycleNumber}
                        </p>
                        {cycle.isCurrent ? (
                          <span className="rounded-full border border-[var(--scarlett)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--mid)]">
                        {cycle.range
                          ? `${formatCourseDate(cycle.range.start)} to ${formatCourseDate(cycle.range.end)}`
                          : "Date window appears once the course timing is set"}
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--ink)]">
                        {cycle.focusBlock ? cycle.focusBlock.title : "No focus block planned yet"}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--mid)]">
                        {cycle.checkpoints.length} checkpoint{cycle.checkpoints.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--mid)]">
                  Add course timing first to see the full cycle plan.
                </p>
              )}
            </div>
              </>
            )}
          </section>
          ) : null}

          {contentStep === 3 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add modules inside the phases
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      Modules sit inside phases and can be completed in order. Each module becomes a container for lessons, tests, checklists, and written responses.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {detail.modules.length} module{detail.modules.length === 1 ? "" : "s"}
                  </div>
                </div>

                {detail.phases.length > 0 ? (
                  <>
                    <form action={createModule} className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.1fr)_auto]">
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="redirect_path" value={currentWizardPath} />
                      <select
                        name="phase_id"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        defaultValue={detail.phases[0]?.id ?? ""}
                      >
                        {detail.phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="title"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Module title"
                      />
                      <input
                        type="text"
                        name="description"
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="What sits inside this module?"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                      >
                        Add module
                      </button>
                    </form>

                    <div className="mt-3 grid gap-3">
                      {modulePhaseOptions.map((phase) => (
                        <div key={phase.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{phase.title}</p>
                            <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                              {phase.modules.length} module{phase.modules.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {phase.description ? (
                            <p className="mt-1 text-sm text-[color:var(--mid)]">{phase.description}</p>
                          ) : null}
                          <div className="mt-3 grid gap-2">
                            {phase.modules.length > 0 ? (
                              phase.modules.map((module, moduleIndex) => {
                                const formId = `phase-module-form-${module.id}`;
                                const deleteFormId = `phase-module-delete-form-${module.id}`;
                                const moveUpFormId = `phase-module-up-form-${module.id}`;
                                const moveDownFormId = `phase-module-down-form-${module.id}`;
                                const isEditing = editingModuleId === module.id;
                                const isComplete = moduleCompletionById.get(module.id) ?? false;

                                return (
                                  <div key={module.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                            isComplete
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                                          }`}>
                                            {isComplete ? "Complete" : "In progress"}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs text-[color:var(--mid)]">
                                          {module.tasks.length} task{module.tasks.length === 1 ? "" : "s"}
                                        </p>
                                        {module.description ? (
                                          <p className="mt-2 text-sm text-[color:var(--mid)]">{module.description}</p>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="submit"
                                          form={moveUpFormId}
                                          disabled={moduleIndex === 0}
                                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                                          title={`Move ${module.title} up`}
                                          aria-label={`Move ${module.title} up`}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                            <path d="M10 4.6 5.7 8.9a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.4L11 4.6V17a1 1 0 1 1-2 0V4.6Z" />
                                          </svg>
                                        </button>
                                        <button
                                          type="submit"
                                          form={moveDownFormId}
                                          disabled={moduleIndex === phase.modules.length - 1}
                                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                                          title={`Move ${module.title} down`}
                                          aria-label={`Move ${module.title} down`}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                            <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
                                          </svg>
                                        </button>
                                        <Link
                                          href={buildScopedPath(`/courses/${courseId}/modules/${module.id}/edit`, selectedChild?.id ?? null, mode)}
                                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                          title={`Edit ${module.title}`}
                                          aria-label={`Edit ${module.title}`}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                            <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                                          </svg>
                                        </Link>
                                        <button
                                          type="submit"
                                          form={deleteFormId}
                                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                                          title={`Delete empty module ${module.title}`}
                                          aria-label={`Delete empty module ${module.title}`}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                            <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                                          </svg>
                                        </button>
                                        <Link
                                          href={buildScopedPath(`/courses/${courseId}/modules/${module.id}`, selectedChild?.id ?? null, mode)}
                                          className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--scarlett)] px-3 text-xs font-medium text-white transition hover:brightness-105"
                                        >
                                          Open
                                        </Link>
                                      </div>
                                    </div>

                                    {isEditing ? (
                                      <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                                        <input type="hidden" name="module_id" value={module.id} form={formId} />
                                        <input type="hidden" name="redirect_path" value={currentWizardPath} form={formId} />
                                        <input
                                          type="text"
                                          name="title"
                                          form={formId}
                                          defaultValue={module.title}
                                          className="brand-input h-10 rounded-2xl px-3 text-sm"
                                          aria-label={`Module title for ${module.title}`}
                                        />
                                        <input
                                          type="text"
                                          name="description"
                                          form={formId}
                                          defaultValue={module.description ?? ""}
                                          className="brand-input h-10 rounded-2xl px-3 text-sm"
                                          aria-label={`Description for ${module.title}`}
                                          placeholder="What sits inside this module?"
                                        />
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="submit"
                                            form={formId}
                                            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:brightness-105"
                                          >
                                            Save
                                          </button>
                                          <Link
                                            href={withQuery(currentWizardPath, { edit: null })}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                            title="Stop editing"
                                            aria-label="Stop editing"
                                          >
                                            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                              <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                                            </svg>
                                          </Link>
                                        </div>
                                      </div>
                                    ) : null}

                                    <form id={formId} action={updateModule} className="hidden" />
                                    <form id={deleteFormId} action={deleteModule} className="hidden">
                                      <input type="hidden" name="module_id" value={module.id} />
                                      <input type="hidden" name="redirect_path" value={currentWizardPath} />
                                    </form>
                                    <form id={moveUpFormId} action={moveModule} className="hidden">
                                      <input type="hidden" name="module_id" value={module.id} />
                                      <input type="hidden" name="direction" value="up" />
                                      <input type="hidden" name="redirect_path" value={currentWizardPath} />
                                    </form>
                                    <form id={moveDownFormId} action={moveModule} className="hidden">
                                      <input type="hidden" name="module_id" value={module.id} />
                                      <input type="hidden" name="direction" value="down" />
                                      <input type="hidden" name="redirect_path" value={currentWizardPath} />
                                    </form>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-sm text-[color:var(--mid)]">
                                No modules in this phase yet.
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    Add a phase first, then place modules into it here.
                  </p>
                )}
              </>
            ) : (
              <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Add recurring training
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Use recurring tasks for the repeatable work. Monthly targets live here, not on the course itself.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {recurringDailyTasks.length + recurringWeeklyTasks.length} recurring task{recurringDailyTasks.length + recurringWeeklyTasks.length === 1 ? "" : "s"}
              </div>
            </div>

            {detail.modules.length > 0 ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Add daily habit
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        Use this for drills that happen little and often. The child sees a simple daily pace.
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.24)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                      Daily
                    </span>
                  </div>

                  <form action={createTask} className="mt-3 grid gap-2">
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="task_type" value="recurring_daily" />
                    <input type="hidden" name="redirect_path" value={stepThreePath} />
                    <input type="hidden" name="gold_bar_rule" value="auto" />
                    <select
                      name="module_id"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      defaultValue={detail.modules[0]?.id ?? ""}
                    >
                      {detail.modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="title"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="CT-Art tactics"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="number"
                        name="monthly_goal_total"
                        min={1}
                        max={500}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Monthly target"
                      />
                      <input
                        type="number"
                        name="estimated_minutes"
                        min={1}
                        max={240}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Minutes"
                      />
                    </div>
                    <input
                      type="number"
                      name="gold_coin_reward_amount"
                      min={1}
                      max={500}
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="Gold Coin reward"
                      defaultValue={1}
                    />
                    <input
                      type="text"
                      name="instructions"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="Optional instructions"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                    >
                      Add daily habit
                    </button>
                  </form>
                </div>

                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Add weekly goal
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        Use this for flexible work across the week. Good days become suggestions, not a rigid calendar.
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.24)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                      Weekly
                    </span>
                  </div>

                  <form action={createTask} className="mt-3 grid gap-2">
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="task_type" value="recurring_weekly" />
                    <input type="hidden" name="redirect_path" value={stepThreePath} />
                    <input type="hidden" name="gold_bar_rule" value="auto" />
                    <select
                      name="module_id"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      defaultValue={detail.modules[0]?.id ?? ""}
                    >
                      {detail.modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="title"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="Long game review"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="number"
                        name="monthly_goal_total"
                        min={1}
                        max={500}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Monthly target"
                      />
                      <input
                        type="number"
                        name="estimated_minutes"
                        min={1}
                        max={240}
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                        placeholder="Minutes"
                      />
                    </div>
                    <input
                      type="number"
                      name="gold_coin_reward_amount"
                      min={1}
                      max={500}
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="Gold Coin reward"
                      defaultValue={1}
                    />
                    <div className="flex flex-wrap gap-2">
                      {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
                        <label
                          key={day}
                          className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[color:var(--mid)]"
                        >
                          <input type="checkbox" name="weekly_days" value={day} className="mr-2" />
                          {day.slice(0, 1).toUpperCase() + day.slice(1, 3)}
                        </label>
                      ))}
                    </div>
                    <input
                      type="text"
                      name="instructions"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      placeholder="Optional instructions"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                    >
                      Add weekly goal
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[color:var(--ink)]">Add one module first</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">
                  Recurring training lives in the wizard now, but it still needs a module to sit inside for organisation.
                </p>
                <form action={createModule} className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={stepThreePath} />
                  <input
                    type="text"
                    name="title"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="Daily Habits"
                  />
                  <input
                    type="text"
                    name="description"
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                    placeholder="What sits in this module?"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                  >
                    Add module
                  </button>
                </form>
              </div>
            )}

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {[
                {
                  title: "Daily training",
                  rows: recurringDailyTasks,
                  empty: "No daily recurring tasks yet.",
                  paceFrame: "day" as const,
                  childHint: "Child view shows these as daily habits with a simple pace.",
                  modules: recurringDailyModules,
                },
                {
                  title: "Weekly training",
                  rows: recurringWeeklyTasks,
                  empty: "No weekly recurring tasks yet.",
                  paceFrame: "week" as const,
                  childHint: "Child view shows these as weekly goals with good days and a week strip.",
                  modules: recurringWeeklyModules,
                },
              ].map((section) => (
                <div key={section.title} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        {section.title}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        {section.childHint}
                      </p>
                    </div>
                    <span className="text-xs text-[color:var(--mid)]">{section.rows.length}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {section.modules.length > 0 ? (
                      section.modules.map((module) => (
                        <Link
                          key={module.id}
                          href={buildScopedPath(`/courses/${courseId}/modules/${module.id}`, selectedChild?.id ?? null, mode)}
                          className="inline-flex items-center rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.24)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                        >
                          Open {module.title}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-[color:var(--mid)]">
                        Add these in a module task table.
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2">
                    {section.rows.length > 0 ? (
                      section.rows.map((task) => {
                        const pace =
                          task.monthly_goal_total && task.monthly_goal_total > 0
                            ? section.paceFrame === "day"
                              ? `About ${Math.max(1, Math.ceil(task.monthly_goal_total / 30))} a day`
                              : `About ${Math.max(1, Math.ceil(task.monthly_goal_total / 4))} a week`
                            : "No target set yet";

                        return (
                          <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-[color:var(--mid)]">{task.moduleTitle}</span>
                                {task.focus_block_id && activeFocusBlock && task.focus_block_id === activeFocusBlock.id ? (
                                  <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                                    In current focus
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-1 text-sm text-[color:var(--mid)]">
                              Monthly target: {task.monthly_goal_total ?? "Not set"}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--mid)]">{pace}</p>
                            {task.task_type === "recurring_weekly" ? (
                              <p className="mt-1 text-xs text-[color:var(--mid)]">
                                {formatWeeklyGoodDays(task.weekly_days)
                                  ? `Good days: ${formatWeeklyGoodDays(task.weekly_days)}`
                                  : "Good days not set yet"}
                              </p>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-[color:var(--mid)]">{section.empty}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
              </>
            )}
          </section>
          ) : null}

          {contentStep === 4 ? (
          <section className="brand-card rounded-3xl p-3.5">
            {courseStructure === "phased" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Step {activeStep}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Add lessons and activities inside modules
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                      Open each module and add the learning pieces inside it: checklists, lessons, tests, or written work. Child writing can later feed into the spelling review flow.
                    </p>
                    <p className="mt-2 text-sm font-medium text-[color:var(--ink)]">
                      To edit or remove the items inside a module, open that module below.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {allTasks.length} task{allTasks.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {detail.modules.length > 0 ? (
                    detail.modules.map((module) => (
                      <div key={module.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                            <p className="mt-1 text-sm text-[color:var(--mid)]">
                              {module.tasks.length} task{module.tasks.length === 1 ? "" : "s"} ready
                            </p>
                          </div>
                          <Link
                            href={buildScopedPath(`/courses/${courseId}/modules/${module.id}`, selectedChild?.id ?? null, mode)}
                            className="brand-secondary-btn"
                          >
                            Open module
                          </Link>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--mid)]">
                          <span className="rounded-full border border-[var(--border)] px-2 py-1">Checklist</span>
                          <span className="rounded-full border border-[var(--border)] px-2 py-1">Lesson</span>
                          <span className="rounded-full border border-[var(--border)] px-2 py-1">Test</span>
                          <span className="rounded-full border border-[var(--border)] px-2 py-1">Writing</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                      Add modules first so there is somewhere to place the tasks.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Add support work
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Use these for checkpoint-style tasks, writing, and one-off support work. Keep recurring training and focus tasks separate so the planning stays readable.
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {otherTasks.length} task{otherTasks.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {otherTasks.length > 0 ? (
                otherTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                      <span className="text-xs text-[color:var(--mid)]">{task.moduleTitle}</span>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      {task.task_type.replaceAll("_", " ")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                  No one-off or writing tasks yet.
                </p>
              )}
            </div>
              </>
            )}
          </section>
          ) : null}

          {contentStep === 5 ? (
          <section className="brand-card rounded-3xl p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  {courseStructure === "phased" ? "Add the review point" : "Add the review point"}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  {courseStructure === "phased"
                    ? "Use review points at the end of a phase or a meaningful chunk of modules. Keep this as the running record of how the phased course is progressing."
                    : "Keep one clear review point for the current cycle, then keep the rest of the checkpoint list as your wider course record."}
                </p>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {detail.checkpoints.length} checkpoint{detail.checkpoints.length === 1 ? "" : "s"}
              </div>
            </div>

            <form action={createCourseCheckpoint} className={`mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 ${
              courseStructure === "phased"
                ? "lg:grid-cols-[minmax(0,1fr)_160px_auto]"
                : "lg:grid-cols-[minmax(0,1fr)_140px_160px_auto]"
            }`}>
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="redirect_path" value={currentWizardPath} />
              <input
                type="text"
                name="title"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder="Checkpoint title"
              />
              {courseStructure === "timed" ? (
                <input
                  type="number"
                  name="cycle_number"
                  min={1}
                  max={totalCycles ?? 52}
                  defaultValue={currentCycle ?? ""}
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Cycle"
                />
              ) : null}
              <input
                type="date"
                name="scheduled_date"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
              >
                Add checkpoint
              </button>
            </form>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Next checkpoint
                </p>
                {nextCheckpoint ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                      {nextCheckpoint.title}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      {nextCheckpoint.scheduled_date
                        ? formatCourseDate(nextCheckpoint.scheduled_date)
                        : "No date set yet"}
                    </p>
                    {nextCheckpoint.target ? (
                      <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                        {nextCheckpoint.target}
                      </p>
                    ) : null}
                    {nextCheckpoint.notes ? (
                      <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                        {nextCheckpoint.notes}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[color:var(--mid)]">
                    {courseStructure === "phased"
                      ? "No review point yet. Add one when a phase or chunk is ready to be reviewed."
                      : "No checkpoint yet. Add one for the end of this cycle so the course has a clear review rhythm."}
                  </p>
                )}
              </div>

              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  {courseStructure === "phased" ? "All review points" : "This cycle"}
                </p>
                <div className="mt-3 grid gap-2">
                  {(courseStructure === "phased" ? detail.checkpoints : checkpointsThisCycle).length > 0 ? (
                    (courseStructure === "phased" ? detail.checkpoints : checkpointsThisCycle).map((checkpoint) => (
                      <div key={checkpoint.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.42)] px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">
                            {checkpoint.title}
                          </p>
                          <span className="text-xs text-[color:var(--mid)]">
                            {checkpoint.scheduled_date
                              ? formatCourseDate(checkpoint.scheduled_date)
                              : "No date"}
                          </span>
                        </div>
                        {checkpoint.target ? (
                          <p className="mt-1 text-sm text-[color:var(--mid)]">{checkpoint.target}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">
                      {courseStructure === "phased"
                        ? "No review points added yet."
                        : "No checkpoints tied to the current cycle yet."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
          ) : null}

          {contentStep === 6 ? (
          <section className="brand-card rounded-3xl p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Step {activeStep}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Review the whole course
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  {courseStructure === "phased"
                    ? "Check the full sequence before using it. This review shows the phases, modules, lessons and activities, and review rhythm together."
                    : "Check the structure before using it for the week. This is the final overview of outcome, mission, recurring work, and review rhythm."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={buildScopedPath("/learn/week", selectedChild?.id ?? null, mode)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                  title="Preview child week"
                  aria-label="Preview child week"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M10 4c4.3 0 7.8 3.1 9 5.5-1.2 2.4-4.7 5.5-9 5.5S2.2 11.9 1 9.5C2.2 7.1 5.7 4 10 4Zm0 2C7 6 4.3 8 3.1 9.5 4.3 11 7 13 10 13s5.7-2 6.9-3.5C15.7 8 13 6 10 6Zm0 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
                  </svg>
                </Link>
              </div>
            </div>

            {reviewGaps.length > 0 ? (
              <div className="mt-4 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Still to set up
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reviewGaps.map((gap) => (
                    <Link
                      key={`${gap.step}-${gap.label}`}
                      href={withQuery(scopedCurrentPath, { step: String(gap.step) })}
                      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                    >
                      Step {gap.step}: {gap.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[1.35rem] border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-700">
                The main pieces are in place. This course is ready for a real weekly pilot.
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="brand-eyebrow">{courseStructure === "phased" ? "Phases" : "Outcome"}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {courseStructure === "phased"
                    ? `${detail.phases.length} phase${detail.phases.length === 1 ? "" : "s"}`
                    : `${detail.goals.length} goal${detail.goals.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="brand-eyebrow">{courseStructure === "phased" ? "Modules" : "Current mission"}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {courseStructure === "phased"
                    ? `${detail.modules.length} module${detail.modules.length === 1 ? "" : "s"}`
                    : activeFocusBlock?.title ?? "No focus block yet"}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="brand-eyebrow">{courseStructure === "phased" ? "Lessons and activities" : "Recurring work"}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {courseStructure === "phased"
                    ? `${allTasks.length} task${allTasks.length === 1 ? "" : "s"}`
                    : `${recurringTaskCount} recurring task${recurringTaskCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="brand-eyebrow">Review point</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {nextCheckpoint?.title ?? "No checkpoint yet"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    {courseStructure === "phased" ? "Phase order" : "Course timeline"}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    {courseStructure === "phased"
                      ? "This is the full sequence of phases and modules before you start using the course."
                      : "This is the whole timeframe view before you start using the course for the week."}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
                  {courseStructure === "phased"
                    ? `${detail.phases.length} phase${detail.phases.length === 1 ? "" : "s"}`
                    : `${cyclePlan.length} cycle${cyclePlan.length === 1 ? "" : "s"}`}
                </span>
              </div>

              {courseStructure === "phased" ? (
                detail.phases.length > 0 ? (
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {modulePhaseOptions.map((phase, index) => (
                      <div key={phase.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">
                            Phase {index + 1}: {phase.title}
                          </p>
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--mid)]">
                            {phase.modules.length} module{phase.modules.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        {phase.description ? (
                          <p className="mt-1 text-sm text-[color:var(--mid)]">{phase.description}</p>
                        ) : null}
                        <div className="mt-3 grid gap-2">
                          {phase.modules.length > 0 ? (
                            phase.modules.map((module) => (
                              <div key={module.id} className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                                  <span className="text-xs text-[color:var(--mid)]">{module.tasks.length} tasks</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[color:var(--mid)]">No modules in this phase yet.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[color:var(--mid)]">
                    Add phases to review the full sequence.
                  </p>
                )
              ) : cyclePlan.length > 0 ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {cyclePlan.map((cycle) => (
                    <div
                      key={cycle.cycleNumber}
                      className={`rounded-2xl border px-3 py-3 ${
                        cycle.isCurrent
                          ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.28)]"
                          : "border-[var(--border)] bg-[rgba(255,247,220,0.35)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--ink)]">
                          Cycle {cycle.cycleNumber}
                        </p>
                        {cycle.isCurrent ? (
                          <span className="rounded-full border border-[var(--scarlett)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--mid)]">
                        {cycle.range
                          ? `${formatCourseDate(cycle.range.start)} to ${formatCourseDate(cycle.range.end)}`
                          : "Date window appears once timing is set"}
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--ink)]">
                        {cycle.focusBlock ? cycle.focusBlock.title : "No focus block planned yet"}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--mid)]">
                        {cycle.checkpoints.length} checkpoint{cycle.checkpoints.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--mid)]">
                  Add course timing to review the full cycle timeline.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Modules
                </p>
                <div className="mt-3 grid gap-2">
                  {detail.modules.length > 0 ? (
                    detail.modules.map((module) => (
                      <div key={module.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                          <span className="text-xs text-[color:var(--mid)]">{module.tasks.length} tasks</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">No modules yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Writing and spelling bridge
                </p>
                <div className="mt-3 grid gap-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.3)] px-3 py-3 text-sm text-[color:var(--mid)]">
                    {(submissions ?? []).length} saved submission{(submissions ?? []).length === 1 ? "" : "s"}
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[rgba(236,253,245,0.35)] px-3 py-3 text-sm text-[color:var(--mid)]">
                    {(submissions ?? []).filter((submission) => analysedSubmissionIds.has(submission.id)).length} already sent to spelling review
                  </div>
                </div>
              </div>
            </div>
          </section>
          ) : null}

          <section className="brand-card rounded-3xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Parent review</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                  Lesson and test submissions
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  Submitted work is now easiest to manage from one shared review page across all courses.
                </p>
              </div>
              <Link
                href={buildScopedPath("/courses/review", selectedChild?.id ?? null, mode)}
                className="brand-secondary-btn"
              >
                Open review work
              </Link>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                {(submissions ?? []).length} saved submission{(submissions ?? []).length === 1 ? "" : "s"}
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                {(submissions ?? []).filter((submission) => analysedSubmissionIds.has(submission.id)).length} in spelling analyse
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                Multiple choice and written work are both visible on the review page
              </div>
            </div>
          </section>

          {courseStructure === "timed" && activeStep >= 4 ? (
          <section className="brand-card overflow-hidden rounded-3xl p-0">
            <div className="border-b border-[var(--border)] px-4 py-4">
              <p className="brand-eyebrow">Modules</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
                Secondary organisation
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                Modules are here to organise the course content. They should not be the first thing you have to think about when planning goals, recurring work, and the current mission.
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_90px_152px] gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              <span>Module</span>
              <span>Notes</span>
              <span>Tasks</span>
              <span className="text-right">Actions</span>
            </div>

            {detail.modules.map((module) => {
              const formId = `module-form-${module.id}`;
              const archiveFormId = `archive-module-form-${module.id}`;
              const deleteFormId = `delete-module-form-${module.id}`;
              const isEditing = editingModuleId === module.id;

              return (
                <div
                  key={module.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_90px_152px] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    {isEditing ? (
                      <>
                        <input type="hidden" name="module_id" value={module.id} form={formId} />
                        <input type="hidden" name="redirect_path" value={currentWizardPath} form={formId} />
                        <input
                          type="text"
                          name="title"
                          form={formId}
                          defaultValue={module.title}
                          className="brand-input h-10 w-full rounded-2xl px-3 text-sm font-semibold"
                          aria-label={`Module title for ${module.title}`}
                        />
                      </>
                    ) : (
                      <p className="pt-2 text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        name="description"
                        form={formId}
                        defaultValue={module.description ?? ""}
                        className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                        aria-label={`Description for ${module.title}`}
                        placeholder="No description yet"
                      />
                    ) : (
                      <p className="pt-2 text-sm text-[color:var(--mid)]">
                        {module.description || "No description yet"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center text-sm font-medium text-[color:var(--mid)]">
                    {module.tasks.length}
                  </div>
                <div className="flex items-center justify-end gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="submit"
                          form={formId}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                          title={`Save ${module.title}`}
                          aria-label={`Save ${module.title}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                            <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
                          </svg>
                        </button>
                        <Link
                          href={withQuery(scopedCurrentPath, { edit: null })}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                          title="Stop editing"
                          aria-label="Stop editing"
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                            <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                          </svg>
                        </Link>
                      </>
                    ) : (
                      <>
                        <button
                          type="submit"
                          form={archiveFormId}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-amber-700 transition hover:bg-amber-50"
                          title={`Hide ${module.title} from the child week view`}
                          aria-label={`Hide ${module.title} from the child week view`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                            <path d="M6 4a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm8 0a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" />
                          </svg>
                        </button>
                        <button
                          type="submit"
                          form={deleteFormId}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                          title={`Delete empty module ${module.title}`}
                          aria-label={`Delete empty module ${module.title}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                            <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                          </svg>
                        </button>
                        <Link
                          href={buildScopedPath(`/courses/${courseId}/modules/${module.id}/edit`, selectedChild?.id ?? null, mode)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                          title={`Edit ${module.title}`}
                          aria-label={`Edit ${module.title}`}
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                            <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 0.8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                          </svg>
                        </Link>
                      </>
                    )}
                    <Link
                      href={buildScopedPath(
                        `/courses/${courseId}/modules/${module.id}`,
                        selectedChild?.id ?? null,
                        mode,
                      )}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                      title={`Open ${module.title}`}
                      aria-label={`Open ${module.title}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                        <path d="M7 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0V6.4l-7.3 7.3a1 1 0 0 1-1.4-1.4L12.6 5H8a1 1 0 0 1-1-1Z" />
                        <path d="M4 6a2 2 0 0 1 2-2h2a1 1 0 1 1 0 2H6v8h8v-2a1 1 0 1 1 2 0v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
                      </svg>
                    </Link>
                  </div>
                  {isEditing ? <form id={formId} action={updateModule} className="hidden" /> : null}
                  <form id={archiveFormId} action={archiveModule} className="hidden">
                    <input type="hidden" name="module_id" value={module.id} />
                    <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  </form>
                  <form id={deleteFormId} action={deleteModule} className="hidden">
                    <input type="hidden" name="module_id" value={module.id} />
                    <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  </form>
                </div>
              );
            })}

            {detail.modules.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[color:var(--mid)]">
                No modules yet. Add the first one below.
              </div>
            ) : null}
          </section>
          ) : null}

          {activeStep >= 4 ? (
          <aside className="grid gap-4">
            <section className="brand-card rounded-3xl p-4">
              <p className="brand-eyebrow">Add module</p>
              <form action={createModule} className="mt-3 grid gap-3">
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                  {courseStructure === "phased" && detail.phases.length > 0 ? (
                    <select
                      name="phase_id"
                      className="brand-input h-11 rounded-2xl px-4 text-sm"
                      defaultValue={detail.phases[0]?.id ?? ""}
                    >
                      {detail.phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    type="text"
                    name="title"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Opening Principles"
                />
                <textarea
                  name="description"
                  rows={3}
                  className="brand-input rounded-2xl px-4 py-3 text-sm"
                  placeholder="What sits inside this module?"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                  title="Add module"
                  aria-label="Add module"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                    <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                  </svg>
                </button>
              </form>
            </section>

          </aside>
          ) : null}
        </div>

      </section>
    </AppShell>
  );
}
