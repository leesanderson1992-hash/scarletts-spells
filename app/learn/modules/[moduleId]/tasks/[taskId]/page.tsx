import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { EmbeddedLessonResponse } from "@/components/embedded-lesson-response";
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
import {
  getAggregateProgressState,
} from "@/lib/progress/stateModel";
import {
  isCompletionTask,
  isWritingTask,
  type CourseTaskRow,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import {
  addTaskToWeekSelection,
  completeCourseTask,
  saveTaskDraft,
  submitTaskResponse,
} from "../../../../actions";

type LearnModuleTaskPageProps = {
  params: Promise<{ moduleId: string; taskId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
  }>;
};

function normaliseTaskTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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

export default async function LearnModuleTaskPage({
  params,
  searchParams,
}: LearnModuleTaskPageProps) {
  const { moduleId, taskId } = await params;
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

  const task = detail.module.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    notFound();
  }

  const currentPath = `/learn/modules/${moduleId}/tasks/${taskId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild.id, mode);
  const modulePath = buildScopedPath(`/learn/modules/${moduleId}`, selectedChild.id, mode);

  const moduleState = getAggregateProgressState(
    detail.module.tasks.map((moduleTask) =>
      getCourseTaskProgressState(moduleTask, detail.completions, detail.submissions),
    ),
  );
  const taskBadges = getChildTaskBadges(task, detail.completions, detail.submissions);
  const moduleProgressBadge = getChildProgressBadge(moduleState);

  const orderedPhasedModules =
    detail.course.structure_type === "phased"
      ? detail.phases.flatMap((phase) =>
          detail.modules.filter((module) => module.phase_id === phase.id),
        )
      : [];
  const currentModuleIndex = orderedPhasedModules.findIndex(
    (module) => module.id === detail.module.id,
  );
  const predecessorModule =
    detail.course.structure_type === "phased" && currentModuleIndex > 0
      ? orderedPhasedModules[currentModuleIndex - 1]
      : null;
  const predecessorComplete = predecessorModule
    ? predecessorModule.tasks.filter((candidate) => candidate.is_active).every((candidate) =>
        isTaskCompleteForProgress(candidate, detail.completions, detail.submissions),
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

  const taskCompletions = detail.completions.filter((completion) => completion.task_id === task.id);
  const latestSubmission =
    detail.submissions.find((submission) => submission.task_id === task.id) ?? null;
  const { data: latestDraft } = await supabase
    .from("task_submission_drafts")
    .select("draft_text, draft_review_summary, draft_payload, updated_at")
    .eq("task_id", task.id)
    .eq("child_id", selectedChild.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  const shouldRestoreDraftValues = Boolean(latestDraft);
  const orderedTasks = [...detail.module.tasks]
    .filter((candidate) => candidate.is_active)
    .sort((left, right) => left.position - right.position);
  const currentTaskIndex = orderedTasks.findIndex((candidate) => candidate.id === task.id);
  const previousProblemTask = currentTaskIndex > 0
    ? [...orderedTasks.slice(0, currentTaskIndex)]
        .reverse()
        .find((candidate) =>
          normaliseTaskTitle(candidate.title).includes("what problem do i want to solve"),
        ) ?? null
    : null;
  const previousProblemSubmission = previousProblemTask
    ? detail.submissions.find((submission) => submission.task_id === previousProblemTask.id) ?? null
    : null;
  const previousProblemPath = previousProblemTask
    ? buildScopedPath(`/learn/modules/${moduleId}/tasks/${previousProblemTask.id}`, selectedChild.id, mode)
    : "";
  const done = isTaskDoneForChildSurface(
    task,
    detail.completions,
    detail.submissions,
  );
  const monthlyCompletedTotal = getMonthlyCompletedTotal(task.id, detail.completions);
  const rewardCoins =
    typeof resolvedSearchParams?.reward_coins === "string"
      ? Number(resolvedSearchParams.reward_coins)
      : 0;
  const earnedRewardCoins = Number.isInteger(rewardCoins) && rewardCoins > 0 ? rewardCoins : 0;
  const monthlyRemainingTotal =
    task.monthly_goal_total !== null && task.monthly_goal_total !== undefined
      ? Math.max(task.monthly_goal_total - monthlyCompletedTotal, 0)
      : null;

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Open item</p>
              <h1 className="brand-title mt-1 text-2xl font-semibold tracking-tight">
                {task.title}
              </h1>
              <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
                {getChildTaskTypeSummary(task)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {taskBadges.map((badge) => (
                <span
                  key={`${task.id}-${badge.kind}-${badge.label}`}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
              ))}
              {moduleProgressBadge ? (
                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${moduleProgressBadge.className}`}
                >
                  {moduleProgressBadge.label}
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                {detail.module.title}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={modulePath}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              Back to module
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
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-4xl shadow-sm animate-bounce">
                      🏅
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-black tracking-tight text-[color:var(--ink)]">
                        You did it!
                      </p>
                      <p className="mt-1 text-base font-semibold text-emerald-800">
                        This lesson has been saved and sent for review.
                      </p>
                      <p className="mt-2 text-sm leading-6 text-emerald-700">
                        Your answers are safe and your grown-up can review everything later. Once they approve it, this task will count as complete.
                      </p>
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-700 animate-pulse">
                        Gold moved
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {resolvedSearchParams?.saved === "draft" ? (
                <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
                  Draft saved. You can safely come back later.
                </p>
              ) : null}

              {earnedRewardCoins > 0 ? (
                <RewardCelebration
                  goldCoinAmount={earnedRewardCoins}
                  title="You earned Gold Coins!"
                  body="That task is complete and your reward has landed straight in your coin balance."
                />
              ) : null}

              {resolvedSearchParams?.saved &&
              resolvedSearchParams.saved !== "submission" &&
              earnedRewardCoins < 1 ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  Saved {resolvedSearchParams.saved}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="brand-card rounded-3xl p-4">
          {task.instructions ? (
            <p className="text-sm leading-6 text-[color:var(--ink)]">{task.instructions}</p>
          ) : null}
          {task.content_html ? (
            <div className="mt-3">
              <form action={submitTaskResponse} className="grid gap-3">
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="course_id" value={detail.course.id} />
                <input type="hidden" name="child_id" value={selectedChild.id} />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                <EmbeddedLessonResponse
                  contentHtml={task.content_html}
                  submitLabel={task.task_type === "test" ? "Save test work" : "Save lesson work"}
                  saveDraftAction={saveTaskDraft}
                  injectedLinks={
                    previousProblemSubmission && previousProblemPath
                      ? { "previous-task-link": previousProblemPath }
                      : undefined
                  }
                  draftValues={
                    shouldRestoreDraftValues &&
                    latestDraft?.draft_payload &&
                    typeof latestDraft.draft_payload === "object" &&
                    !Array.isArray(latestDraft.draft_payload)
                      ? (latestDraft.draft_payload as Record<string, unknown>)
                      : undefined
                  }
                />
              </form>
            </div>
          ) : null}
          {(task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") &&
          task.monthly_goal_total ? (
            <p className="mt-3 text-sm font-medium text-[color:var(--mid)]">
              {monthlyCompletedTotal} of {task.monthly_goal_total} done this month
              {monthlyRemainingTotal !== null ? ` · ${monthlyRemainingTotal} left` : ""}
            </p>
          ) : null}
          {task.task_type === "recurring_daily" ? (
            <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">Daily</p>
          ) : null}
          {task.task_type === "recurring_weekly" && task.weekly_days && task.weekly_days.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
              {formatCourseWeekdays(task.weekly_days)}
            </p>
          ) : null}
          {task.writing_prompt ? (
            <div className="mt-3 rounded-2xl bg-[rgba(252,228,244,0.38)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
              Prompt: {task.writing_prompt}
            </div>
          ) : null}

          {isWritingTask(task.task_type) && !task.content_html ? (
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
                placeholder={
                  task.task_type === "test"
                    ? "Write your answers here"
                    : "Write your lesson response here"
                }
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
              {!task.content_html ? (
                <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                  {latestSubmission.submission_text}
                </p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Your answers are already restored into the lesson above, so you can continue from the real question boxes.
                </p>
              )}
            </div>
          ) : null}
          {(!latestSubmission || latestSubmission.parent_review_status === "returned") &&
          latestDraft?.draft_text ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                {latestSubmission?.parent_review_status === "returned"
                  ? "Restored from your last try"
                  : "Saved draft"}
              </p>
              <p className="mt-2 text-sm leading-6 text-sky-900">
                {latestSubmission?.parent_review_status === "returned"
                  ? "Your last answers have been put back into the lesson so you can improve them and submit again."
                  : "Your draft has been restored. You can keep going and submit when you are ready."}
              </p>
            </div>
          ) : null}

          {isCompletionTask(task.task_type) ? (
            <form action={completeCourseTask} className="mt-4 flex flex-wrap items-center gap-3">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="course_id" value={detail.course.id} />
              <input type="hidden" name="child_id" value={selectedChild.id} />
              <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              {task.task_type === "recurring_daily" || task.task_type === "recurring_weekly" ? (
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="quantity_completed"
                  defaultValue={1}
                  className="brand-input h-11 w-28 rounded-full px-4 text-base"
                />
              ) : null}
              <button type="submit" className="brand-primary-btn">
                {done ? "Add more" : "Mark as done"}
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
