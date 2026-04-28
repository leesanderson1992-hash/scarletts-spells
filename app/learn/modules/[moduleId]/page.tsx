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
  formatCourseWeekdays,
  getActiveChildrenForUser,
  getModuleDetailForChild,
} from "@/lib/courses/queries";
import {
  getChildProgressBadge,
  getChildTaskBadges,
  getCourseTaskProgressState,
  getMonthlyCompletedTotal,
  isTaskCompleteForProgress,
  isTaskDoneForChildSurface,
} from "@/lib/courses/progress";
import { getInlineLessonPreviewHtml, isFullDocumentHtml } from "@/lib/courses/html-preview";
import {
  getAggregateProgressState,
} from "@/lib/progress/stateModel";
import {
  getCourseTaskTypeLabel,
  isCompletionTask,
  isWritingTask,
  type CourseTaskRow,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import { addTaskToWeekSelection, completeCourseTask, submitTaskResponse } from "../../actions";

type LearnModulePageProps = {
  params: Promise<{ moduleId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
    task?: string;
  }>;
};

function getChildTaskTypeSummary(task: CourseTaskRow) {
  switch (task.task_type) {
    case "checklist":
      return "A simple task to tick off once it is done.";
    case "lesson":
      return "Read, work through the lesson, and type your answers when you are ready.";
    case "test":
      return "Complete the test and type your answers so they can be reviewed later.";
    case "checkpoint":
      return "A progress check to pause, look back, and notice how things are going.";
    case "recurring_daily":
      return "A daily habit task.";
    case "recurring_weekly":
      return "A weekly habit task.";
    default:
      return "";
  }
}

export default async function LearnModulePage({
  params,
  searchParams,
}: LearnModulePageProps) {
  const { moduleId } = await params;
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

  const { data: moduleRecord } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .maybeSingle();

  if (!moduleRecord) {
    notFound();
  }

  const detail = await getModuleDetailForChild(
    supabase,
    user.id,
    selectedChild.id,
    moduleRecord.course_id,
    moduleId,
  );

  if (!detail) {
    notFound();
  }

  const currentPath = `/learn/modules/${moduleId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild.id, mode);
  const rewardCoins =
    typeof resolvedSearchParams?.reward_coins === "string"
      ? Number(resolvedSearchParams.reward_coins)
      : 0;
  const earnedRewardCoins = Number.isInteger(rewardCoins) && rewardCoins > 0 ? rewardCoins : 0;
  const taskStateById = new Map(
    detail.module.tasks.map((task) => [
      task.id,
      getCourseTaskProgressState(task, detail.completions, detail.submissions),
    ]),
  );
  const moduleState = getAggregateProgressState(
    detail.module.tasks.map((task) => taskStateById.get(task.id) ?? "golden_nugget"),
  );
  const moduleProgressBadge = getChildProgressBadge(moduleState);
  const orderedPhasedModules = detail.course.structure_type === "phased"
    ? detail.phases
        .flatMap((phase) => detail.modules.filter((module) => module.phase_id === phase.id))
    : [];
  const currentModuleIndex = orderedPhasedModules.findIndex((module) => module.id === detail.module.id);
  const predecessorModule =
    detail.course.structure_type === "phased" && currentModuleIndex > 0
      ? orderedPhasedModules[currentModuleIndex - 1]
      : null;
  const predecessorComplete = predecessorModule
    ? predecessorModule.tasks.filter((task) => task.is_active).every((task) =>
        isTaskCompleteForProgress(task, detail.completions, detail.submissions),
      )
    : true;
  const isLocked = detail.course.structure_type === "phased" && !predecessorComplete;
  if (isLocked) {
    return (
      <AppShell
        currentPath="/learn"
        mode={mode}
        activeChildId={selectedChild.id}
        availableChildren={children}
        userEmail={user.email}
      >
        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-5">
            <p className="brand-eyebrow">Module locked</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
              {detail.module.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
              Finish {predecessorModule?.title ?? "the previous module"} first, then this one will unlock.
            </p>
          </div>
        </section>
      </AppShell>
    );
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
            <p className="brand-eyebrow">Module</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="brand-title text-2xl font-semibold tracking-tight">
                {detail.module.title}
              </h1>
              {moduleProgressBadge ? (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${moduleProgressBadge.className}`}>
                  {moduleProgressBadge.label}
                </span>
              ) : null}
            </div>
            <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
              {detail.module.description || "Open one lesson or activity at a time, and add it to your week when you want to schedule it."}
            </p>

            {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
              <div className="mt-3 grid gap-2">
                {resolvedSearchParams?.error ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                    {resolvedSearchParams.error}
                  </p>
                ) : null}

                {resolvedSearchParams?.saved === "submission" ? (
                  <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,rgba(255,247,220,0.98),rgba(236,253,245,0.95),rgba(252,228,244,0.95))] px-5 py-5 text-emerald-900 shadow-[0_18px_40px_rgba(16,185,129,0.12)]">
                    <div className="absolute -left-3 top-3 h-16 w-16 rounded-full bg-[rgba(245,190,57,0.18)]" />
                    <div className="absolute right-4 top-4 h-10 w-10 rounded-full bg-[rgba(194,24,91,0.12)]" />
                    <div className="absolute bottom-[-18px] right-10 h-20 w-20 rounded-full bg-[rgba(16,185,129,0.12)]" />
                    <div className="relative flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-3xl shadow-sm animate-bounce">
                        🌟
                      </div>
                      <div className="min-w-0">
                        <p className="text-xl font-black tracking-tight text-[color:var(--ink)]">
                          Lesson complete!
                        </p>
                        <p className="mt-1 text-sm font-semibold text-emerald-800">
                          Your work is saved and ready for review.
                        </p>
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-700 animate-pulse">
                          Gold moved
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {earnedRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={earnedRewardCoins}
                    title="Coins earned!"
                    body="You finished a task and your Gold Coins have landed straight in your balance."
                  />
                ) : null}

                {resolvedSearchParams?.saved && resolvedSearchParams.saved !== "submission" ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Saved {resolvedSearchParams.saved}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <section className="brand-card rounded-3xl p-4">
            <p className="brand-eyebrow">Inside this module</p>
            <div className="mt-3 grid gap-2">
              {detail.module.tasks.map((task) => {
                const badges = getChildTaskBadges(
                  task,
                  detail.completions,
                  detail.submissions,
                );
                const inlineLessonPreview = getInlineLessonPreviewHtml(task.content_html);
                const hasEmbeddedLessonDocument = isFullDocumentHtml(task.content_html);

                return (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-[color:var(--mid)]">{getCourseTaskTypeLabel(task.task_type)}</p>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={buildScopedPath(
                        `/learn/modules/${moduleId}/tasks/${task.id}`,
                        selectedChild.id,
                        mode,
                      )}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                    >
                      Open
                    </Link>
                    <form action={addTaskToWeekSelection}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="course_id" value={detail.course.id} />
                      <input type="hidden" name="child_id" value={selectedChild.id} />
                      <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                      >
                        Add to my week
                      </button>
                    </form>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
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
          <p className="brand-eyebrow">Module</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="brand-title text-2xl font-semibold tracking-tight">
              {detail.module.title}
            </h1>
            {moduleProgressBadge ? (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${moduleProgressBadge.className}`}>
                {moduleProgressBadge.label}
              </span>
            ) : null}
          </div>
          <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
            {detail.module.description || "Work through the tasks in a calm order that works for you."}
          </p>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3 grid gap-2">
              {resolvedSearchParams?.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}

              {resolvedSearchParams?.saved ? (
                earnedRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={earnedRewardCoins}
                    title="Coins earned!"
                    body="That task counted and your coin balance has gone up."
                  />
                ) : (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Saved {resolvedSearchParams.saved}.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--mid)]">
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
              Checklist = do and tick
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
              Lesson = read and answer
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
              Test = answer and submit
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
              Checkpoint = stop and reflect
            </span>
          </div>
        </div>

        <section className="grid gap-4">
          {detail.module.tasks.length > 0 ? (
            <div className="brand-card overflow-hidden rounded-3xl p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)] md:grid-cols-[minmax(0,1.1fr)_180px_110px]">
                <span>Task</span>
                <span className="hidden md:block">Type</span>
                <span className="text-right">Done</span>
              </div>

              {detail.module.tasks.map((task) => {
                const taskCompletions = detail.completions.filter((completion) => completion.task_id === task.id);
                const latestSubmission =
                  detail.submissions.find((submission) => submission.task_id === task.id) ?? null;
                const done = isTaskDoneForChildSurface(
                  task,
                  detail.completions,
                  detail.submissions,
                );
                const monthlyCompletedTotal = getMonthlyCompletedTotal(task.id, detail.completions);
                const monthlyRemainingTotal =
                  task.monthly_goal_total !== null && task.monthly_goal_total !== undefined
                    ? Math.max(task.monthly_goal_total - monthlyCompletedTotal, 0)
                    : null;
                const badges = getChildTaskBadges(
                  task,
                  detail.completions,
                  detail.submissions,
                );
                const inlineLessonPreview = getInlineLessonPreviewHtml(task.content_html);
                const hasEmbeddedLessonDocument = isFullDocumentHtml(task.content_html);

                return (
                  <div
                    key={task.id}
                    className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 border-b border-[var(--border)] px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1.1fr)_180px_110px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-[color:var(--ink)]">
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
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        {getChildTaskTypeSummary(task)}
                      </p>
                      {task.instructions ? (
                        <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                          {task.instructions}
                        </p>
                      ) : null}
                      {task.content_html && inlineLessonPreview ? (
                        <div
                          className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--ink)]"
                          dangerouslySetInnerHTML={{ __html: inlineLessonPreview }}
                        />
                      ) : null}
                      {task.content_html && hasEmbeddedLessonDocument ? (
                        <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                          This task includes a full interactive lesson. Open it to work inside the full page.
                        </p>
                      ) : null}
                      {(task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") &&
                      task.monthly_goal_total ? (
                        <p className="mt-2 text-sm font-medium text-[color:var(--mid)]">
                          {monthlyCompletedTotal} of {task.monthly_goal_total} done this month
                          {monthlyRemainingTotal !== null ? ` · ${monthlyRemainingTotal} left` : ""}
                        </p>
                      ) : null}
                      {task.task_type === "recurring_daily" ? (
                        <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                          Daily
                        </p>
                      ) : null}
                      {task.task_type === "recurring_weekly" && task.weekly_days && task.weekly_days.length > 0 ? (
                        <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                          {formatCourseWeekdays(task.weekly_days)}
                        </p>
                      ) : null}
                      {task.focus_block_id ? (
                        <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                          Focus: {detail.focusBlocks.find((focusBlock) => focusBlock.id === task.focus_block_id)?.title ?? "Current focus"}
                        </p>
                      ) : null}
                      {task.writing_prompt ? (
                        <div className="mt-3 rounded-2xl bg-[rgba(252,228,244,0.38)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
                          Prompt: {task.writing_prompt}
                        </div>
                      ) : null}
                      {isWritingTask(task.task_type) ? (
                        <form action={submitTaskResponse} className="mt-4 grid gap-3">
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
                            rows={task.task_type === "lesson" ? 5 : 4}
                            className="brand-input rounded-2xl px-4 py-3 text-base"
                            placeholder={task.task_type === "test" ? "Write your answers here" : "Write your lesson response here"}
                          />
                          <PreSubmitChecklist
                            submitLabel={task.task_type === "test" ? "Submit test" : "Submit lesson"}
                          />
                        </form>
                      ) : null}
                      {latestSubmission ? (
                        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                            Latest submission
                          </p>
                          {latestSubmission.parent_review_status === "returned" && latestSubmission.parent_review_note ? (
                            <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                              Try again: {latestSubmission.parent_review_note}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                            {latestSubmission.submission_text}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="hidden text-sm text-[color:var(--mid)] md:block">
                      {getCourseTaskTypeLabel(task.task_type)}
                    </div>

                    <div className="flex justify-end">
                      {isCompletionTask(task.task_type) ? (
                        <form action={completeCourseTask}>
                          <input type="hidden" name="task_id" value={task.id} />
                          <input type="hidden" name="course_id" value={detail.course.id} />
                          <input type="hidden" name="child_id" value={selectedChild.id} />
                          <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                          {task.task_type === "recurring_daily" || task.task_type === "recurring_weekly" ? (
                            <input
                              type="number"
                              name="quantity_completed"
                              min="1"
                              max="500"
                              defaultValue={1}
                              aria-label={`How many completed for ${task.title}`}
                              className="mb-2 h-11 w-20 rounded-2xl border border-[var(--border)] bg-white px-3 text-center text-sm text-[color:var(--ink)]"
                            />
                          ) : null}
                          <button
                            type="submit"
                            aria-label={done ? `${task.title} completed` : `Mark ${task.title} as done`}
                            className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
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
                      ) : done ? (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                            <path d="M7.9 13.4 4.5 10a1 1 0 1 1 1.4-1.4l2 2 6.2-6.2a1 1 0 0 1 1.4 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z" />
                          </svg>
                        </span>
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)]">
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current opacity-35">
                            <path d="M7.9 13.4 4.5 10a1 1 0 1 1 1.4-1.4l2 2 6.2-6.2a1 1 0 0 1 1.4 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {detail.module.tasks.length === 0 ? (
            <div className="brand-card rounded-3xl p-6">
              <p className="text-sm text-[color:var(--mid)]">No tasks are ready in this module yet.</p>
            </div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
