import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PreSubmitChecklist } from "@/components/pre-submit-checklist";
import { RewardCelebration } from "@/components/reward-celebration";
import { StructuredLessonResponse as StructuredLessonResponseForm } from "@/components/structured-lesson-response";
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
import { getLessonRuntimeMode } from "@/lib/lessons/runtime";
import {
  getReturnedWritingIssueFeedback,
  getStructuredFieldFeedback,
  getInitialStructuredLessonResponse,
} from "@/lib/lessons/responses";
import {
  getAggregateProgressState,
  getChildProgressBadge,
  getChildTaskBadges,
  getCourseTaskProgressState,
  getDateOnly,
  getRecurringTaskProgressSummary,
  isTaskCompleteForProgress,
  isTaskDoneForChildSurface,
} from "@/lib/courses/progress";
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
  saveTaskDraftSilently,
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
    focus_near_reward_coins?: string;
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
  const timedCycle =
    detail.course.structure_type === "timed"
      ? detail.phases.find((phase) => phase.id === detail.module.phase_id) ?? null
      : null;
  const timedCycleLabel = timedCycle ? `Cycle ${timedCycle.position + 1}` : "Current cycle";

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

  const latestSubmission =
    detail.submissions.find((submission) => submission.task_id === task.id) ?? null;
  const { data: latestDraft } = await supabase
    .from("task_submission_drafts")
    .select("draft_text, draft_review_summary, draft_payload, updated_at")
    .eq("task_id", task.id)
    .eq("child_id", selectedChild.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  const done = isTaskDoneForChildSurface(
    task,
    detail.completions,
    detail.submissions,
  );
  const lessonRuntimeMode = getLessonRuntimeMode(task);
  const structuredLesson =
    task.lesson_schema && !Array.isArray(task.lesson_schema)
      ? task.lesson_schema
      : null;
  const structuredInitialResponse = getInitialStructuredLessonResponse({
    payloadValue: latestDraft?.draft_payload,
    isReturned: latestSubmission?.parent_review_status === "returned",
  });
  const latestStructuredFieldFeedback = getStructuredFieldFeedback(
    latestDraft?.draft_payload,
  );
  const returnedWritingIssues =
    latestSubmission?.parent_review_status === "returned"
      ? getReturnedWritingIssueFeedback(latestDraft?.draft_payload)
      : [];
  const recurringSummary = getRecurringTaskProgressSummary(task, detail.completions, {
    windowType: "month",
    referenceDate: getDateOnly(),
  });
  const rewardCoins =
    typeof resolvedSearchParams?.reward_coins === "string"
      ? Number(resolvedSearchParams.reward_coins)
      : 0;
  const earnedRewardCoins = Number.isInteger(rewardCoins) && rewardCoins > 0 ? rewardCoins : 0;
  const focusNearRewardCoins =
    typeof resolvedSearchParams?.focus_near_reward_coins === "string"
      ? Number(resolvedSearchParams.focus_near_reward_coins)
      : 0;
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
                  {detail.course.structure_type === "timed"
                    ? `Cycle ${moduleProgressBadge.label.toLowerCase()}`
                    : `Module ${moduleProgressBadge.label.toLowerCase()}`}
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                {detail.course.structure_type === "timed" ? timedCycleLabel : detail.module.title}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={modulePath}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              {detail.course.structure_type === "timed" ? "Back to cycle" : "Back to module"}
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
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 animate-pulse">
                        Sent for review
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={modulePath}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-800 transition hover:text-[var(--scarlett)]"
                        >
                          {detail.course.structure_type === "timed" ? "Back to cycle" : "Back to module"}
                        </Link>
                        <Link
                          href={scopedCurrentPath}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-800 transition hover:text-[var(--scarlett)]"
                        >
                          Stay on this task
                        </Link>
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
                  body="This task is now complete and the reward has been added to your coin balance."
                />
              ) : Number.isInteger(focusNearRewardCoins) && focusNearRewardCoins > 0 ? (
                <RewardCelebration
                  goldCoinAmount={focusNearRewardCoins}
                  title={`You have nearly earned ${focusNearRewardCoins} coin${focusNearRewardCoins === 1 ? "" : "s"}. Keep going!`}
                  body="Finish the last mini task in this focus block to unlock the full reward."
                />
              ) : null}

              {resolvedSearchParams?.saved &&
              resolvedSearchParams.saved !== "submission" &&
              earnedRewardCoins < 1 &&
              !(Number.isInteger(focusNearRewardCoins) && focusNearRewardCoins > 0) ? (
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
          {lessonRuntimeMode === "structured" ? (
            structuredLesson ? (
              <div className="mt-3">
                <form action={submitTaskResponse} className="grid gap-3">
                  <input type="hidden" name="task_id" value={task.id} />
                  <input type="hidden" name="course_id" value={detail.course.id} />
                  <input type="hidden" name="child_id" value={selectedChild.id} />
                  <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                  <StructuredLessonResponseForm
                    lesson={structuredLesson}
                  submitLabel={task.task_type === "test" ? "Save test work" : "Save lesson work"}
                  saveDraftAction={saveTaskDraft}
                  saveDraftSilentlyAction={saveTaskDraftSilently}
                  initialResponse={structuredInitialResponse}
                  initialFieldFeedback={latestStructuredFieldFeedback}
                  returnedIssueFeedback={returnedWritingIssues}
                  draftContext={{
                    taskId: task.id,
                    courseId: detail.course.id,
                    childId: selectedChild.id,
                      redirectPath: scopedCurrentPath,
                    }}
                  />
                </form>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-4 py-3 text-sm text-[color:var(--mid)]">
                This lesson is marked as structured but the lesson schema is missing.
              </div>
            )
          ) : null}
          {(task.task_type === "lesson" || task.task_type === "test") &&
          lessonRuntimeMode === "plain_writing" ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This lesson is still using the older plain-writing compatibility path because it does not have a structured lesson schema yet. Open it in parent mode and rebuild it in the structured lesson builder.
            </div>
          ) : null}
          {recurringSummary ? (
            <p className="mt-3 text-sm font-medium text-[color:var(--mid)]">
              {recurringSummary.windowTotal} of {recurringSummary.targetAmount} done this month
              {` · ${recurringSummary.remainingToTarget} left`}
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

          {isWritingTask(task.task_type) && lessonRuntimeMode === "plain_writing" ? (
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
              {latestSubmission?.parent_review_status === "returned" &&
              returnedWritingIssues.length > 0 ? (
                <div className="grid gap-3 rounded-[1.75rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      Fix these in your writing
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      Edit your work below, use the notes to guide you, and then resubmit the whole task.
                    </p>
                  </div>
                  {returnedWritingIssues.map((issue, index) => (
                    <div
                      key={issue.issue_id}
                      className="rounded-[1.5rem] border border-amber-200 bg-white px-4 py-4 text-sm text-[color:var(--ink)] shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                            Note {index + 1}
                          </p>
                          {issue.child_note ? (
                            <p className="leading-6 text-amber-950">{issue.child_note}</p>
                          ) : null}
                          {issue.observed_text ? (
                            <p className="text-sm leading-6 text-[color:var(--mid)]">
                              Look at: <span className="font-medium text-[color:var(--ink)]">“{issue.observed_text}”</span>
                            </p>
                          ) : null}
                          <p className="text-sm leading-6 text-[color:var(--mid)]">
                            Try fixing this yourself before you resubmit.
                          </p>
                          {issue.context_text ? (
                            <p className="rounded-2xl bg-[rgba(252,228,244,0.32)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">
                              {issue.context_text}
                            </p>
                          ) : null}
                        </div>
                        <div className="grid gap-3">
                          <label className="inline-flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm text-[color:var(--ink)]">
                            <input
                              type="checkbox"
                              name={`returned_issue_fixed:${issue.issue_id}`}
                              value="true"
                              defaultChecked={issue.marked_fixed === true}
                              className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                            />
                            <span>I&apos;ve fixed this</span>
                          </label>
                          {issue.allow_confidence ? (
                            <fieldset className="grid gap-2">
                              <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                                How did this feel?
                              </legend>
                              <div className="flex flex-wrap gap-2">
                                {(["easy", "medium", "hard"] as const).map((value) => (
                                  <label
                                    key={`${issue.issue_id}-${value}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]"
                                  >
                                    <input
                                      type="radio"
                                      name={`returned_issue_reflection:${issue.issue_id}`}
                                      value={value}
                                      defaultChecked={issue.reflection === value}
                                      className="h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
                                    />
                                    <span className="capitalize">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <textarea
                name="submission_text"
                rows={task.task_type === "lesson" ? 5 : 4}
                className="brand-input rounded-2xl px-4 py-3 text-base"
                defaultValue={latestDraft?.draft_text ?? ""}
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
              {lessonRuntimeMode === "plain_writing" ? (
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
                  max="10000"
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
