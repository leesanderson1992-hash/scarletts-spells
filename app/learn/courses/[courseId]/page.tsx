import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PreSubmitChecklist } from "@/components/pre-submit-checklist";
import { RewardCelebration } from "@/components/reward-celebration";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  formatCourseDate,
  formatCourseWeekdays,
  getCurrentCycle,
  getCourseActivityForChild,
  getActiveChildrenForUser,
  getCycleDateRange,
  getCourseDetailForChild,
  getTotalCycles,
} from "@/lib/courses/queries";
import {
  getAggregateProgressState,
  getChildProgressBadge,
  getChildTaskBadges,
  getCourseTaskProgressState,
  getDateOnly,
  getFocusBlockProgressState,
  getLatestSubmissionForTask,
  getModuleCompletionMap,
  getRecurringTaskProgressSummary,
  isTaskCompleteForProgress,
  isTaskDoneForChildSurface,
} from "@/lib/courses/progress";
import {
  getCourseTaskTypeLabel,
  isCompletionTask,
  isWritingTask,
  type CourseTaskRow,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";
import { completeCourseTask, submitTaskResponse } from "../../actions";

type LearnCoursePageProps = {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
    focus_near_reward_coins?: string;
  }>;
};

function getStartOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getThisWeekDays() {
  const start = getStartOfWeek(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      key: getDateOnly(date),
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      dayNumber: date.getDate(),
    };
  });
}

function getWeeklyTaskState(task: CourseTaskRow, currentWeekday: string) {
  if (task.task_type === "recurring_daily") {
    return "Daily";
  }

  if (task.task_type === "recurring_weekly") {
    if (task.weekly_days && task.weekly_days.length > 0) {
      return task.weekly_days.includes(currentWeekday)
        ? `Due this week · ${formatCourseWeekdays(task.weekly_days)}`
        : `Flexible this week · ${formatCourseWeekdays(task.weekly_days)}`;
    }

    return "Weekly";
  }

  return getCourseTaskTypeLabel(task.task_type);
}

function getTimedCycleLabel(
  phaseId: string | null | undefined,
  phases: Array<{ id: string; position: number }>,
) {
  const matchedPhase = phaseId ? phases.find((phase) => phase.id === phaseId) ?? null : null;
  return matchedPhase ? `Cycle ${matchedPhase.position + 1}` : "Current cycle";
}

export default async function LearnCoursePage({
  params,
  searchParams,
}: LearnCoursePageProps) {
  const { courseId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "child");
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const detail = await getCourseDetailForChild(
    supabase,
    user.id,
    selectedChild.id,
    courseId,
  );

  if (!detail) {
    notFound();
  }

  const activity = await getCourseActivityForChild(
    supabase,
    selectedChild.id,
    courseId,
  );
  const currentPath = `/learn/courses/${courseId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild.id, mode);
  const allTasks = detail.modules.flatMap((module) =>
    module.tasks.map((task) => ({
      ...task,
      phaseId: module.phase_id,
      moduleTitle: module.title,
    })),
  );
  const weekDays = getThisWeekDays();
  const weekKeys = new Set(weekDays.map((day) => day.key));
  const weeklyCheckInDays = new Set(
    activity.completions
      .filter((completion) => weekKeys.has(completion.completion_date))
      .map((completion) => completion.completion_date),
  );
  for (const submission of activity.submissions) {
    const submissionDay = submission.submitted_at.slice(0, 10);
    if (weekKeys.has(submissionDay)) {
      weeklyCheckInDays.add(submissionDay);
    }
  }
  const currentWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" })
    .format(new Date())
    .slice(0, 3)
    .toLowerCase();
  const dailyTasks = allTasks.filter((task) => task.task_type === "recurring_daily");
  const weeklyTasks = allTasks.filter((task) => task.task_type === "recurring_weekly");
  const otherTasks = allTasks.filter(
    (task) =>
      task.task_type !== "recurring_daily" && task.task_type !== "recurring_weekly",
  );
  const taskStateById = new Map(
    allTasks.map((task) => [
      task.id,
      getCourseTaskProgressState(task, activity.completions, activity.submissions),
    ]),
  );

  const totalCycles = getTotalCycles(
    detail.course.duration_weeks,
    detail.course.cycle_length_weeks,
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
  const activeFocusBlock =
    detail.focusBlocks.find((focusBlock) =>
      currentCycle ? focusBlock.cycle_number === currentCycle : focusBlock.is_active,
    ) ?? detail.focusBlocks.find((focusBlock) => focusBlock.is_active) ?? null;
  const focusTasks = activeFocusBlock
    ? allTasks
        .filter((task) => task.focus_block_id === activeFocusBlock.id)
        .sort((left, right) => left.position - right.position)
    : [];
  const completedFocusTaskCount = focusTasks.filter((task) =>
    isTaskCompleteForProgress(task, activity.completions, activity.submissions),
  ).length;
  const nextFocusTask =
    focusTasks.find(
      (task) => !isTaskCompleteForProgress(task, activity.completions, activity.submissions),
    ) ?? null;
  const focusBlockState =
    activeFocusBlock
      ? getFocusBlockProgressState({
          isActive: activeFocusBlock.is_active,
          totalTaskCount: focusTasks.length,
          completedTaskCount: completedFocusTaskCount,
          relatedProgressCount:
            focusTasks.filter(
              (task) => (taskStateById.get(task.id) ?? "not_started") !== "not_started",
            ).length,
        })
      : "not_started";
  const nextCheckpoint =
    detail.checkpoints.find((checkpoint) =>
      currentCycle ? checkpoint.cycle_number === currentCycle : Boolean(checkpoint.scheduled_date),
    ) ?? detail.checkpoints[0] ?? null;
  const courseState = getAggregateProgressState([
    ...allTasks.map((task) => taskStateById.get(task.id) ?? "not_started"),
    ...(activeFocusBlock ? [focusBlockState] : []),
  ]);
  const courseProgressBadge = getChildProgressBadge(courseState);
  const focusProgressBadge = getChildProgressBadge(focusBlockState);
  const moduleCompletionById = getModuleCompletionMap(
    detail.modules,
    activity.completions,
    activity.submissions,
  );
  const phasedModuleGroups = detail.phases.map((phase) => ({
    ...phase,
    modules: detail.modules.filter((module) => module.phase_id === phase.id),
  }));
  const orderedPhasedModules = phasedModuleGroups.flatMap((phase) => phase.modules);
  const nextModule = orderedPhasedModules.find(
    (module) => !(moduleCompletionById.get(module.id) ?? false),
  ) ?? null;
  const rewardCoins =
    typeof resolvedSearchParams?.reward_coins === "string"
      ? Number(resolvedSearchParams.reward_coins)
      : 0;
  const earnedRewardCoins = Number.isInteger(rewardCoins) && rewardCoins > 0 ? rewardCoins : 0;
  const focusNearRewardCoins =
    typeof resolvedSearchParams?.focus_near_reward_coins === "string"
      ? Number(resolvedSearchParams.focus_near_reward_coins)
      : 0;
  const unlockedModuleIds = new Set<string>();
  let previousComplete = true;
  for (const courseModule of orderedPhasedModules) {
    if (previousComplete) {
      unlockedModuleIds.add(courseModule.id);
    }
    previousComplete = moduleCompletionById.get(courseModule.id) ?? false;
  }

  if (detail.course.structure_type === "phased") {
    return (
      <AppShell
        currentPath="/learn"
        mode={mode}
        activeChildId={selectedChild.id}
        availableChildren={children}
        userEmail={user.email}
      >
        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Course</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="brand-title text-2xl font-semibold tracking-tight">
                {detail.course.title}
              </h1>
              {courseProgressBadge ? (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${courseProgressBadge.className}`}>
                  {courseProgressBadge.label}
                </span>
              ) : null}
            </div>
            <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
              {detail.course.description || "Work through the modules in order. Open the next one when you're ready."}
            </p>

            {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
              <div className="mt-3 grid gap-2">
                {resolvedSearchParams?.error ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                    {resolvedSearchParams.error}
                  </p>
                ) : null}
                {earnedRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={earnedRewardCoins}
                    title="Coins earned!"
                    body="Your completed task paid out straight away and your coin balance has grown."
                  />
                ) : Number.isInteger(focusNearRewardCoins) && focusNearRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={focusNearRewardCoins}
                    title={`You have nearly earned ${focusNearRewardCoins} coin${focusNearRewardCoins === 1 ? "" : "s"}. Keep going!`}
                    body="Finish the last mini task in this focus block to unlock the full reward."
                  />
                ) : resolvedSearchParams?.saved ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Saved {resolvedSearchParams.saved}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                <p className="brand-eyebrow">How it works</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  Move through the phases
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  Each phase holds modules. Finish a module, then move on to the next one.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                <p className="brand-eyebrow">Next module</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {nextModule?.title ?? "All current modules complete"}
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  {nextModule ? "Open this next when you're ready." : "You have finished everything currently in this course."}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                <p className="brand-eyebrow">Review point</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {nextCheckpoint?.title ?? "No review point yet"}
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  {nextCheckpoint?.scheduled_date
                    ? formatCourseDate(nextCheckpoint.scheduled_date)
                    : "A phase review will show up here."}
                </p>
              </div>
            </div>
          </div>

          {phasedModuleGroups.length > 0 ? (
            <section className="grid gap-4">
              {phasedModuleGroups.map((phase) => (
                <div key={phase.id} className="brand-card rounded-3xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="brand-eyebrow">Phase</p>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                        {phase.title}
                      </h2>
                      {phase.description ? (
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
                          {phase.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                      {phase.modules.length} module{phase.modules.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {phase.modules.length > 0 ? (
                      phase.modules.map((module) => {
                        const isComplete = moduleCompletionById.get(module.id) ?? false;
                        const isNext = nextModule?.id === module.id;

                        const isLocked = !unlockedModuleIds.has(module.id);

                        const cardContent = (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="brand-eyebrow">Module</p>
                              <div className="flex items-center gap-2">
                                {isLocked ? (
                                  <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                                    Locked
                                  </span>
                                ) : null}
                                {isNext ? (
                                  <span className="rounded-full border border-[var(--scarlett)] bg-[rgba(252,228,244,0.45)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--ink)]">
                                    Next
                                  </span>
                                ) : null}
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                                  isComplete
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                                }`}>
                                  {isComplete ? "Complete" : "In progress"}
                                </span>
                              </div>
                            </div>
                            <h3 className="brand-title mt-2 text-2xl font-semibold tracking-tight">
                              {module.title}
                            </h3>
                            <p className="brand-copy mt-3 text-sm leading-6">
                              {module.description || "Open this module to see the lessons and activities inside it."}
                            </p>
                            <p className="mt-4 text-sm font-medium text-[color:var(--mid)]">
                              {module.tasks.length} item{module.tasks.length === 1 ? "" : "s"}
                            </p>
                          </>
                        );

                        return isLocked ? (
                          <div
                            key={module.id}
                            className="brand-card rounded-3xl p-5 opacity-75"
                          >
                            {cardContent}
                            <p className="mt-3 text-xs text-[color:var(--mid)]">
                              Finish the module before this one to unlock it.
                            </p>
                          </div>
                        ) : (
                          <Link
                            key={module.id}
                            href={buildScopedPath(`/learn/modules/${module.id}`, selectedChild.id, mode)}
                            className="brand-card rounded-3xl p-5 transition hover:-translate-y-0.5"
                          >
                            {cardContent}
                          </Link>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)] md:col-span-2">
                        No modules have been added to this phase yet.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <div className="brand-card rounded-3xl p-6">
              <p className="text-sm text-[color:var(--mid)]">
                This phased course does not have any phases yet.
              </p>
            </div>
          )}
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      currentPath="/learn"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Course</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="brand-title text-2xl font-semibold tracking-tight">
              {detail.course.title}
            </h1>
            {courseProgressBadge ? (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${courseProgressBadge.className}`}>
                {courseProgressBadge.label}
              </span>
            ) : null}
          </div>
          <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
            {detail.course.description || "Open a cycle to begin the tasks inside this course."}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
              <p className="brand-eyebrow">Current cycle</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                {currentCycle ? `Cycle ${currentCycle}` : "Waiting to start"}
              </p>
              <p className="mt-1 text-xs text-[color:var(--mid)]">
                {currentCycleRange
                  ? `${formatCourseDate(currentCycleRange.start)} to ${formatCourseDate(currentCycleRange.end)}`
                  : "Set a course start date to show the live cycle window."}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
              <p className="brand-eyebrow">Plan length</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                {detail.course.duration_weeks
                  ? `${detail.course.duration_weeks} weeks`
                  : "Not set yet"}
              </p>
              <p className="mt-1 text-xs text-[color:var(--mid)]">
                {totalCycles
                  ? `${totalCycles} cycle${totalCycles === 1 ? "" : "s"} of ${detail.course.cycle_length_weeks ?? 4} weeks`
                  : "No cycle plan yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
              <p className="brand-eyebrow">Next checkpoint</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                {nextCheckpoint?.title ?? "No checkpoint yet"}
              </p>
              <p className="mt-1 text-xs text-[color:var(--mid)]">
                {nextCheckpoint?.scheduled_date
                  ? formatCourseDate(nextCheckpoint.scheduled_date)
                  : "Your next review will show up here."}
              </p>
            </div>
          </div>
        </div>

        {activeFocusBlock ? (
          <section className="brand-card rounded-3xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Current focus</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                    {activeFocusBlock.title}
                  </h2>
                  {focusProgressBadge ? (
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${focusProgressBadge.className}`}>
                      {focusProgressBadge.label}
                    </span>
                  ) : null}
                </div>
                {activeFocusBlock.goal ? (
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
                    {activeFocusBlock.goal}
                  </p>
                ) : null}
              </div>
              <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                {focusTasks.length} mini task{focusTasks.length === 1 ? "" : "s"}
              </div>
            </div>

            {nextFocusTask ? (
              <div className="mt-3 rounded-2xl border border-[rgba(206,71,125,0.22)] bg-[rgba(252,228,244,0.22)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                  Next focus action
                </p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {nextFocusTask.title}
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  Add this into your week when you are ready to schedule the next mini task.
                </p>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2">
              {focusTasks.length > 0 ? (
                focusTasks.map((task) => {
                  const badges = getChildTaskBadges(task, activity.completions, activity.submissions);

                  return (
                    <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                          <p className="mt-1 text-xs text-[color:var(--mid)]">
                            {getTimedCycleLabel(task.phaseId, detail.phases)}
                          </p>
                          {nextFocusTask?.id === task.id ? (
                            <p className="mt-1 text-[11px] font-medium text-[var(--scarlett)]">
                              Next mini task to schedule
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {badges.map((badge) => (
                            <span
                              key={`${task.id}-${badge.kind}-${badge.label}`}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                  This focus block is ready, but no tasks are linked to it yet.
                </p>
              )}
            </div>
          </section>
        ) : null}

        <section className="brand-card rounded-3xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">This week</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                One place to check in
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
                Log daily habits, weekly goals, and other course tasks here first. Open a cycle task when you want to work on it in more detail.
              </p>
            </div>
            <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {allTasks.length} task{allTasks.length === 1 ? "" : "s"}
            </div>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3 grid gap-2">
              {resolvedSearchParams?.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}
              {earnedRewardCoins > 0 ? (
                <RewardCelebration
                  goldCoinAmount={earnedRewardCoins}
                  title="Coins earned!"
                  body="A completed task has just added more Gold Coins to your total."
                />
              ) : Number.isInteger(focusNearRewardCoins) && focusNearRewardCoins > 0 ? (
                <RewardCelebration
                  goldCoinAmount={focusNearRewardCoins}
                  title={`You have nearly earned ${focusNearRewardCoins} coin${focusNearRewardCoins === 1 ? "" : "s"}. Keep going!`}
                  body="Finish the last mini task in this focus block to unlock the full reward."
                />
              ) : resolvedSearchParams?.saved ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  Saved {resolvedSearchParams.saved}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {weekDays.map((day) => {
              const checkedIn = weeklyCheckInDays.has(day.key);

              return (
                <div
                  key={day.key}
                  className={`rounded-2xl border px-3 py-2.5 text-center ${
                    checkedIn
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {day.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{day.dayNumber}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4">
            {[
              {
                title: "Daily habits",
                rows: dailyTasks,
                empty: "No daily habits are set in this course yet.",
              },
              {
                title: "Weekly goals",
                rows: weeklyTasks,
                empty: "No flexible weekly goals are set in this course yet.",
              },
              {
                title: "Other tasks",
                rows: otherTasks,
                empty: "No extra checklist or writing tasks are ready yet.",
              },
            ].map((section) => (
              <div key={section.title} className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    {section.title}
                  </h3>
                  <span className="text-xs text-[color:var(--mid)]">
                    {section.rows.length}
                  </span>
                </div>

                {section.rows.length > 0 ? (
                  <div className="overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-white">
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-3 border-b border-[var(--border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)] md:grid-cols-[minmax(0,1.2fr)_180px_160px_120px]">
                      <span>Task</span>
                      <span className="hidden md:block">Cycle</span>
                      <span>Rhythm</span>
                      <span className="text-right">Log</span>
                    </div>

                    {section.rows.map((task) => {
                      const badges = getChildTaskBadges(
                        task,
                        activity.completions,
                        activity.submissions,
                      );
                      const latestSubmission = getLatestSubmissionForTask(task.id, activity.submissions);
                      const done = isTaskDoneForChildSurface(
                        task,
                        activity.completions,
                        activity.submissions,
                      );
                      const recurringSummary = getRecurringTaskProgressSummary(
                        task,
                        activity.completions,
                        { windowType: "month", referenceDate: getDateOnly() },
                      );

                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[minmax(0,1fr)_120px_120px] gap-3 border-b border-[var(--border)] px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_180px_160px_120px]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[color:var(--ink)]">
                                {task.title}
                              </p>
                              {badges.map((badge) => (
                                <span
                                  key={`${task.id}-${badge.kind}-${badge.label}`}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                            {task.instructions ? (
                              <p className="mt-1 text-sm text-[color:var(--mid)]">
                                {task.instructions}
                              </p>
                            ) : null}
                            {task.lesson_schema ? (
                              <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                                This task includes a structured lesson. Open it to work inside the full page.
                              </p>
                            ) : null}
                            {task.writing_prompt ? (
                              <p className="mt-2 text-sm text-[color:var(--mid)]">
                                Prompt: {task.writing_prompt}
                              </p>
                            ) : null}
                            {recurringSummary ? (
                              <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                                {recurringSummary.windowTotal} of {recurringSummary.targetAmount} done this month · {recurringSummary.remainingToTarget} left
                              </p>
                            ) : null}
                            {recurringSummary ? (
                              <p className="mt-1 text-xs text-[color:var(--mid)]">
                                {recurringSummary.allTimeTotal} completed all time
                              </p>
                            ) : null}
                            {latestSubmission ? (
                              latestSubmission.parent_review_status === "returned" ? (
                                <p className="mt-2 text-xs text-amber-800">
                                  Sent back to fix
                                  {latestSubmission.parent_review_note
                                    ? ` · ${latestSubmission.parent_review_note}`
                                    : ""}
                                </p>
                              ) : (
                                <p className="mt-2 text-xs text-[color:var(--mid)]">
                                  Latest writing saved
                                </p>
                              )
                            ) : null}
                          </div>

                          <div className="hidden text-sm text-[color:var(--mid)] md:block">
                            {getTimedCycleLabel(task.phaseId, detail.phases)}
                          </div>

                          <div className="text-sm text-[color:var(--mid)]">
                            {getWeeklyTaskState(task, currentWeekday)}
                          </div>

                          <div className="flex justify-end">
                            {isCompletionTask(task.task_type) ? (
                              <form action={completeCourseTask} className="flex items-center gap-2">
                                <input type="hidden" name="task_id" value={task.id} />
                                <input type="hidden" name="course_id" value={detail.course.id} />
                                <input type="hidden" name="child_id" value={selectedChild.id} />
                                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                                {task.task_type === "recurring_daily" || task.task_type === "recurring_weekly" ? (
                                  <input
                                    type="number"
                                    name="quantity_completed"
                                    min="1"
                                    max="10000"
                                    defaultValue={1}
                                    aria-label={`How many completed for ${task.title}`}
                                    className="h-10 w-16 rounded-2xl border border-[var(--border)] bg-white px-2 text-center text-sm text-[color:var(--ink)]"
                                  />
                                ) : null}
                                <button
                                  type="submit"
                                  aria-label={done ? `${task.title} completed` : `Mark ${task.title} as done`}
                                  className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                                    done
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-[var(--border)] bg-white text-[color:var(--mid)] hover:text-[var(--scarlett)]"
                                  }`}
                                >
                                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                                    <path d="M7.9 13.4 4.5 10a1 1 0 1 1 1.4-1.4l2 2 6.2-6.2a1 1 0 0 1 1.4 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z" />
                                  </svg>
                                </button>
                              </form>
                            ) : isWritingTask(task.task_type) &&
                              (!latestSubmission || latestSubmission.parent_review_status === "returned") ? (
                              <form action={submitTaskResponse} className="grid w-full gap-2">
                                <input type="hidden" name="task_id" value={task.id} />
                                <input type="hidden" name="course_id" value={detail.course.id} />
                                <input type="hidden" name="child_id" value={selectedChild.id} />
                                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                                {task.choice_options?.length ? (
                                  <fieldset className="grid gap-2">
                                    <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                                      Choose your answer
                                    </legend>
                                    {task.choice_options.map((option, index) => (
                                      <label
                                        key={`${task.id}-option-${index}`}
                                        className="inline-flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                      >
                                        <input
                                          type={task.allow_multiple_choices ? "checkbox" : "radio"}
                                          name="selected_options"
                                          value={option}
                                          className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                                        />
                                        <span>{option}</span>
                                      </label>
                                    ))}
                                  </fieldset>
                                ) : null}
                                <textarea
                                  name="submission_text"
                                  rows={task.task_type === "lesson" ? 4 : 3}
                                  className="brand-input rounded-2xl px-3 py-2 text-sm"
                                  placeholder={task.task_type === "test" ? "Write your answers here" : "Write here"}
                                />
                                <PreSubmitChecklist
                                  submitLabel={task.task_type === "test" ? "Submit test" : "Save lesson"}
                                />
                              </form>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                    {section.empty}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {(detail.focusBlocks.length > 0 || detail.checkpoints.length > 0) ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="brand-card rounded-3xl p-5">
              <p className="brand-eyebrow">Current focus</p>
              <div className="mt-3 grid gap-3">
                {activeFocusBlock ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{activeFocusBlock.title}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {focusProgressBadge ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${focusProgressBadge.className}`}>
                            {focusProgressBadge.label}
                          </span>
                        ) : null}
                        {activeFocusBlock.cycle_number ? (
                          <span className="text-xs text-[color:var(--mid)]">
                            Cycle {activeFocusBlock.cycle_number}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {activeFocusBlock.goal ? (
                      <p className="mt-1 text-sm text-[color:var(--mid)]">{activeFocusBlock.goal}</p>
                    ) : null}
                    {(activeFocusBlock.start_date || activeFocusBlock.end_date) ? (
                      <p className="mt-2 text-xs text-[color:var(--mid)]">
                        {formatCourseDate(activeFocusBlock.start_date) ?? "Now"} to{" "}
                        {formatCourseDate(activeFocusBlock.end_date) ?? "open end"}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[color:var(--mid)]">No active focus block set yet.</p>
                )}
              </div>
            </section>

            <section className="brand-card rounded-3xl p-5">
              <p className="brand-eyebrow">Checkpoints</p>
              <div className="mt-3 grid gap-3">
                {detail.checkpoints.slice(0, 3).map((checkpoint) => (
                  <div key={checkpoint.id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{checkpoint.title}</p>
                      {checkpoint.scheduled_date ? (
                        <span className="text-xs text-[color:var(--mid)]">
                          {formatCourseDate(checkpoint.scheduled_date)}
                        </span>
                      ) : null}
                    </div>
                    {checkpoint.target ? (
                      <p className="mt-1 text-sm text-[color:var(--mid)]">{checkpoint.target}</p>
                    ) : null}
                  </div>
                ))}

                {detail.checkpoints.length === 0 ? (
                  <p className="text-sm text-[color:var(--mid)]">No checkpoints yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {detail.phases.map((phase) => {
            const phaseModule = detail.modules.find((module) => module.phase_id === phase.id) ?? null;
            const cycleTasks = phaseModule?.tasks ?? [];
            const cycleComplete = phaseModule ? moduleCompletionById.get(phaseModule.id) ?? false : false;

            return (
            <Link
              key={phase.id}
              href={
                phaseModule
                  ? buildScopedPath(`/learn/modules/${phaseModule.id}`, selectedChild.id, mode)
                  : scopedCurrentPath
              }
              className="brand-card rounded-3xl p-6 transition hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="brand-eyebrow">Cycle</p>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                  cycleComplete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                }`}>
                  {cycleComplete ? "Complete" : "In progress"}
                </span>
              </div>
              <h2 className="brand-title mt-2 text-2xl font-semibold tracking-tight">
                {`Cycle ${phase.position + 1}`}
              </h2>
              <p className="brand-copy mt-3 text-sm leading-6">
                {phase.title || "Open this cycle to see the tasks inside it."}
              </p>
              <p className="mt-4 text-sm font-medium text-[color:var(--mid)]">
                {cycleTasks.length} task{cycleTasks.length === 1 ? "" : "s"}
              </p>
            </Link>
            );
          })}

          {detail.phases.length === 0 ? (
            <div className="brand-card rounded-3xl p-6 md:col-span-2">
              <p className="text-sm text-[color:var(--mid)]">
                This course does not have any cycles yet.
              </p>
            </div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
