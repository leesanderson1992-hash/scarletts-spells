"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { GoldForgePanel } from "@/components/gold-forge-panel";
import { PreSubmitChecklist } from "@/components/pre-submit-checklist";
import { RewardCelebration } from "@/components/reward-celebration";
import { formatCourseWeekdays } from "@/lib/courses/queries";
import {
  type CourseTaskType,
  getCourseTaskTypeLabel,
  isCompletionTask,
  isWritingTask,
} from "@/lib/courses/types";
import {
  getChildTaskBadges,
  getLatestSubmissionForTask,
  getRecurringTaskProgressSummary,
  getRecurringTaskCompletionForDate,
  type ChildSurfaceBadge,
} from "@/lib/courses/progress";
import {
  clearTaskDayPlan,
  completeCourseTask,
  moveTaskToDayPlan,
  submitTaskResponse,
} from "@/app/learn/actions";
import type {
  DailySpellingPracticeReadItem,
  DailySpellingPracticeReadModel,
} from "@/lib/writing-practice/daily-spelling-practice-read-model";

type PlannerTask = {
  id: string;
  course_id: string;
  title: string;
  task_type: CourseTaskType;
  instructions: string | null;
  lesson_schema?: unknown;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  gold_coin_reward_amount: number;
  weekly_days: string[] | null;
  structureType: "phased" | "timed";
  moduleTitle: string;
  courseTitle: string;
};

type PlannerCompletion = {
  task_id: string;
  completion_date: string;
  quantity_completed: number;
};

type PlannerSubmission = {
  task_id: string;
  submitted_at: string;
  submission_text: string;
  parent_review_status: "pending" | "approved" | "returned";
  parent_review_note: string | null;
};

type PlannerDay = {
  key: string;
  label: string;
  dayNumber: number;
};

type PlannerDayPlan = {
  task_id: string;
  planned_date: string;
};

type LearnWeekPlannerProps = {
  basePath: string;
  progressPath: string;
  coursesPath: string;
  childId: string;
  currentDate: string;
  selectedDay: string;
  viewMode: "day" | "week";
  weekDays: PlannerDay[];
  weekStartDate: string;
  dailyTasks: PlannerTask[];
  flexibleTasks: PlannerTask[];
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  dayPlans: PlannerDayPlan[];
  dailySpellingPractice: DailySpellingPracticeReadModel;
  checkedInToday: boolean;
  nuggetCount: number;
  inMachineCount: number;
  goldBarCount: number;
  goldCoinCount: number;
  provenBagItems: Array<{ id: string; label: string; kind: string }>;
  flashError?: string;
  flashSaved?: string | null;
  flashRewardCoins?: number;
  flashFocusNearRewardCoins?: number;
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

function getWeekdayKeyFromDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" })
    .format(new Date(`${date}T12:00:00`))
    .slice(0, 3)
    .toLowerCase();
}

function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function isTaskDoneOnDate(
  task: PlannerTask,
  completions: PlannerCompletion[],
  submissions: PlannerSubmission[],
  targetDate: string,
) {
  if (isWritingTask(task.task_type)) {
    return submissions.some(
      (submission) =>
        submission.task_id === task.id && submission.submitted_at.slice(0, 10) === targetDate,
    );
  }

  if (task.task_type === "recurring_daily" || task.task_type === "recurring_weekly") {
    return Boolean(getRecurringTaskCompletionForDate(task, completions, targetDate));
  }

  return completions.some((completion) => completion.task_id === task.id);
}

function getRecurringPacingText(task: PlannerTask) {
  const goal = task.monthly_goal_total ?? 0;

  if (!goal) {
    return null;
  }

  if (task.task_type === "recurring_daily") {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return `About ${Math.max(1, Math.ceil(goal / daysInMonth))} a day`;
  }

  if (task.task_type === "recurring_weekly") {
    return `About ${Math.max(1, Math.ceil(goal / 4))} a week`;
  }

  return null;
}

function getTaskRhythmText(task: PlannerTask, weekdayKey: string) {
  if (task.task_type === "recurring_daily") {
    return "Every day";
  }

  if (task.task_type === "recurring_weekly") {
    if (task.weekly_days?.length) {
      return task.weekly_days.includes(weekdayKey)
        ? `Good day · ${formatCourseWeekdays(task.weekly_days)}`
        : `Flexible this week · ${formatCourseWeekdays(task.weekly_days)}`;
    }

    return "Can do this week";
  }

  return getCourseTaskTypeLabel(task.task_type);
}

function getRecurringTaskSummary(
  task: PlannerTask,
  completions: PlannerCompletion[],
  currentDate: string,
) {
  const summary = getRecurringTaskProgressSummary(task, completions, {
    windowType: "month",
    referenceDate: currentDate,
  });
  const rhythm =
    task.task_type === "recurring_daily"
      ? "Daily recurring"
      : task.weekly_days?.length
        ? `Weekly recurring · ${formatCourseWeekdays(task.weekly_days)}`
        : "Weekly recurring";

  if (!summary) {
    return null;
  }

  return {
    ...summary,
    rhythm,
  };
}

function getPlannerContextLabel(task: PlannerTask) {
  return task.structureType === "timed" ? task.courseTitle : task.moduleTitle;
}

function getPlannerContextSummary(task: PlannerTask) {
  return task.structureType === "timed"
    ? task.courseTitle
    : `${task.courseTitle} · ${task.moduleTitle}`;
}

function renderTaskBadges(taskId: string, badges: ChildSurfaceBadge[]) {
  return badges.map((badge) => (
    <span
      key={`${taskId}-${badge.kind}-${badge.label}`}
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  ));
}

function TaskCard({
  task,
  dayKey,
  currentDate,
  childId,
  redirectPath,
  completions,
  submissions,
  draggable = false,
  onDragStart,
  defaultExpanded = false,
  hideToggleLabel = false,
  compact = false,
}: {
  task: PlannerTask;
  dayKey: string;
  currentDate: string;
  childId: string;
  redirectPath: string;
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  draggable?: boolean;
  onDragStart?: (taskId: string) => void;
  defaultExpanded?: boolean;
  hideToggleLabel?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const recurringSummary = getRecurringTaskProgressSummary(task, completions, {
    windowType: "month",
    referenceDate: currentDate,
  });
  const isRecurringTask = recurringSummary !== null;
  const badges = getChildTaskBadges(task, completions, submissions, dayKey);
  const doneForDay = isTaskDoneOnDate(task, completions, submissions, dayKey);
  const weekdayKey = getWeekdayKeyFromDate(dayKey);
  const latestSubmission = getLatestSubmissionForTask(task.id, submissions);
  if (compact) {
    const primaryBadge = badges[0] ?? null;
    const compactRecurringSummary = isRecurringTask
      ? getRecurringTaskSummary(task, completions, currentDate)
      : null;

    return (
      <div
        draggable={draggable}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", task.id);
          onDragStart?.(task.id);
        }}
        className={`rounded-2xl border bg-white px-3 py-2.5 ${
          draggable
            ? "cursor-grab border-[rgba(206,71,125,0.22)] shadow-[0_8px_18px_rgba(206,71,125,0.06)]"
            : "border-[var(--border)]"
        }`}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {draggable ? (
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(252,228,244,0.55)] text-[color:var(--scarlett)]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                <path d="M7 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 5Zm0 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 10Zm0 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 15ZM15.5 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" />
              </svg>
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
              {primaryBadge ? renderTaskBadges(task.id, [primaryBadge]) : null}
            </div>
            <p className="mt-1 truncate text-xs text-[color:var(--mid)]">
              {getPlannerContextLabel(task)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[color:var(--mid)]">
              <span>{getCourseTaskTypeLabel(task.task_type)}</span>
              {task.gold_coin_reward_amount > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{`+${task.gold_coin_reward_amount} coins`}</span>
                </>
              ) : null}
              {task.estimated_minutes ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{`${task.estimated_minutes} min`}</span>
                </>
              ) : null}
            </div>
            {compactRecurringSummary ? (
              <p className="mt-1 text-[10px] text-[color:var(--mid)]">
                {compactRecurringSummary.allTimeTotal} all time
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart?.(task.id);
      }}
      className={`rounded-2xl border bg-white px-3 py-3 ${
        draggable
          ? "cursor-grab border-[rgba(206,71,125,0.22)] shadow-[0_10px_24px_rgba(206,71,125,0.08)]"
          : "border-[var(--border)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {draggable ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(252,228,244,0.55)] text-[color:var(--scarlett)]">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                  <path d="M7 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 5Zm0 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 10Zm0 5a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 7 15ZM15.5 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" />
                </svg>
              </span>
            ) : null}
            <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
            {renderTaskBadges(task.id, badges)}
          </div>
          <p className="mt-1 text-xs text-[color:var(--mid)]">
            {getPlannerContextSummary(task)}
          </p>
        </div>
        {!hideToggleLabel ? (
          <span className="text-xs text-[color:var(--mid)]">{expanded ? "Hide" : "Open"}</span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-3 grid gap-2">
          <p className="text-sm text-[color:var(--mid)]">{getTaskRhythmText(task, weekdayKey)}</p>
          {task.instructions ? (
            <p className="text-sm leading-6 text-[color:var(--ink)]">{task.instructions}</p>
          ) : null}
          {task.lesson_schema ? (
            <p className="text-xs font-medium text-[color:var(--mid)]">
              This task includes a structured lesson. Open it to work inside the full page.
            </p>
          ) : null}
          {task.writing_prompt ? (
            <p className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-2 text-sm text-[color:var(--mid)]">
              Prompt: {task.writing_prompt}
            </p>
          ) : null}
          {task.monthly_goal_total ? (
            <p className="text-xs font-medium text-[color:var(--mid)]">
              {recurringSummary?.windowTotal ?? 0} of {isRecurringTask ? recurringSummary.targetAmount : task.monthly_goal_total} done this month
              {getRecurringPacingText(task) ? ` · ${getRecurringPacingText(task)}` : ""}
            </p>
          ) : null}
          {recurringSummary ? (
            <p className="text-xs text-[color:var(--mid)]">
              {recurringSummary.allTimeTotal} completed all time
            </p>
          ) : null}
          {recurringSummary?.currentOccurrenceQuantity ? (
            <p className="text-xs text-[color:var(--mid)]">
              {recurringSummary.occurrenceLabel}: {recurringSummary.currentOccurrenceQuantity}
            </p>
          ) : null}
          {task.estimated_minutes ? (
            <p className="text-xs text-[color:var(--mid)]">{task.estimated_minutes} minutes</p>
          ) : null}

          {isCompletionTask(task.task_type) ? (
            <form action={completeCourseTask} className="flex items-center gap-2">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="course_id" value={task.course_id} />
              <input type="hidden" name="child_id" value={childId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
              <input type="hidden" name="completion_date" value={dayKey} />
              {isRecurringTask ? (
                <input
                  type="number"
                  name="quantity_completed"
                  min="1"
                  max="10000"
                  defaultValue={1}
                  className="h-10 w-16 rounded-2xl border border-[var(--border)] bg-white px-2 text-center text-sm text-[color:var(--ink)]"
                />
              ) : null}
              <button
                type="submit"
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                  doneForDay
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[var(--border)] bg-white text-[color:var(--mid)] hover:text-[var(--scarlett)]"
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M7.9 13.4 4.5 10a1 1 0 1 1 1.4-1.4l2 2 6.2-6.2a1 1 0 0 1 1.4 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z" />
                </svg>
              </button>
            </form>
          ) : null}

          {isWritingTask(task.task_type) &&
          (!latestSubmission || latestSubmission.parent_review_status === "returned") ? (
            <form action={submitTaskResponse} className="grid gap-2">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="course_id" value={task.course_id} />
              <input type="hidden" name="child_id" value={childId} />
              <input type="hidden" name="redirect_path" value={redirectPath} />
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
          {isWritingTask(task.task_type) &&
          latestSubmission &&
          latestSubmission.parent_review_status !== "returned" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Submitted! Your work is saved.</p>
              <p className="mt-1">It is waiting for a grown-up to review.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WeekMiniTask({
  task,
  dayKey,
  currentDate,
  completions,
  submissions,
  isSelected = false,
  onSelect,
}: {
  task: PlannerTask;
  dayKey: string;
  currentDate: string;
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const doneForDay = isTaskDoneOnDate(task, completions, submissions, dayKey);
  const badges = getChildTaskBadges(task, completions, submissions, dayKey);
  const primaryBadge = badges[0] ?? null;
  const miniRecurringSummary =
    task.task_type === "recurring_daily" || task.task_type === "recurring_weekly"
      ? getRecurringTaskSummary(task, completions, currentDate)
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full min-w-0 rounded-lg border px-2 py-1.5 text-left transition ${
        isSelected
          ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.35)]"
          : doneForDay
            ? "border-emerald-200 bg-emerald-50"
            : "border-[var(--border)] bg-white hover:border-[rgba(206,71,125,0.3)]"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
          doneForDay ? "bg-emerald-500" : "bg-[rgba(206,71,125,0.4)]"
        }`} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-[color:var(--ink)]">
            {task.title}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-[color:var(--mid)]">
            <span className="truncate">{task.courseTitle}</span>
            {primaryBadge ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{primaryBadge.label}</span>
              </>
            ) : null}
          </div>
          {miniRecurringSummary ? (
            <p className="mt-1 text-[9px] text-[color:var(--mid)]">
              {miniRecurringSummary.allTimeTotal} all time
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function formatDailyPracticeWordCount(count: number) {
  return `${count} word${count === 1 ? "" : "s"}`;
}

function getDailyPracticeItemLabel(item: DailySpellingPracticeReadItem) {
  const targetWord = item.targetWord?.trim();
  const microSkillLabel = item.microSkillLabel?.trim();

  return targetWord || microSkillLabel || "Practice word";
}

function getDailyPracticePreviewGroups(practice: DailySpellingPracticeReadModel) {
  const groups = [
    { label: practice.childCopy.dueReview, items: practice.groups.dueReview },
    { label: practice.childCopy.newPractice, items: practice.groups.newPractice },
    { label: practice.childCopy.readyForToday, items: practice.groups.practice },
  ];
  let remainingPreviewSlots = 3;

  return groups
    .map((group) => {
      const supportedItems = group.items.filter((item) => item.isSupportedForChildSurface);
      const previewItems = supportedItems.slice(0, remainingPreviewSlots);
      remainingPreviewSlots -= previewItems.length;

      return {
        ...group,
        previewItems,
        supportedCount: supportedItems.length,
      };
    })
    .filter((group) => group.supportedCount > 0);
}

function getDailyPracticeViewerPath(childId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("child", childId);
  searchParams.set("mode", "child");

  return `/learn/week/practice?${searchParams.toString()}`;
}

function DailySpellingPracticeCard({
  practice,
  childId,
}: {
  practice: DailySpellingPracticeReadModel;
  childId: string;
}) {
  const copy = practice.childCopy;
  const previewGroups = getDailyPracticePreviewGroups(practice);
  const supportedItemCount = previewGroups.reduce(
    (total, group) => total + group.supportedCount,
    0,
  );
  const previewItemCount = previewGroups.reduce(
    (total, group) => total + group.previewItems.length,
    0,
  );
  const extraItemCount = Math.max(0, supportedItemCount - previewItemCount);
  const isReady = practice.state === "ready";
  const isClosed = practice.state === "completed" || practice.state === "skipped";
  const isQuiet = practice.state === "missing" || practice.state === "empty";
  const statusText = isClosed
    ? copy.done
    : practice.state === "blocked"
      ? "This practice is not ready here yet."
      : isQuiet
        ? copy.empty
        : copy.ready;
  const supportText =
    isQuiet || isClosed
      ? "You can carry on with your week."
      : isReady
        ? copy.readyForToday
        : null;

  return (
    <section
      aria-label={copy.title}
      className="mt-4 rounded-[1.35rem] border border-[rgba(64,128,112,0.2)] bg-[linear-gradient(180deg,#f8fffc_0%,#edf9f4_100%)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="brand-eyebrow">{copy.title}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
            {statusText}
          </h2>
          {supportText ? (
            <p className="mt-2 text-sm text-[color:var(--mid)]">{supportText}</p>
          ) : null}
        </div>
        {isReady && supportedItemCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[rgba(64,128,112,0.22)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {formatDailyPracticeWordCount(supportedItemCount)}
            </span>
            <Link
              href={getDailyPracticeViewerPath(childId)}
              className="brand-primary-btn px-3 py-2 text-xs"
            >
              Open practice
            </Link>
          </div>
        ) : null}
      </div>

      {isReady && previewGroups.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {previewGroups.map((group) => (
            <div
              key={group.label}
              className="rounded-2xl border border-[rgba(64,128,112,0.16)] bg-white px-3 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                {group.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.previewItems.length > 0 ? (
                  group.previewItems.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-full border border-[rgba(64,128,112,0.18)] bg-[rgba(236,249,244,0.8)] px-2.5 py-1 text-xs font-medium text-[color:var(--ink)]"
                    >
                      {getDailyPracticeItemLabel(item)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[color:var(--mid)]">{copy.readyForToday}</span>
                )}
              </div>
            </div>
          ))}
          {extraItemCount > 0 ? (
            <div className="flex items-center rounded-2xl border border-dashed border-[rgba(64,128,112,0.24)] bg-white px-3 py-3 text-sm font-medium text-[color:var(--mid)]">
              +{extraItemCount} more
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function LearnWeekPlanner({
  basePath,
  progressPath,
  coursesPath,
  childId,
  currentDate,
  selectedDay,
  viewMode,
  weekDays,
  weekStartDate,
  dailyTasks,
  flexibleTasks,
  completions,
  submissions,
  dayPlans,
  dailySpellingPractice,
  checkedInToday,
  nuggetCount,
  inMachineCount,
  goldBarCount,
  goldCoinCount,
  provenBagItems,
  flashError,
  flashSaved,
  flashRewardCoins = 0,
  flashFocusNearRewardCoins = 0,
}: LearnWeekPlannerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [localPlans, setLocalPlans] = useState(dayPlans);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [selectedWeekTask, setSelectedWeekTask] = useState<{ taskId: string; dayKey: string } | null>(null);

  const selectedDayPath = useMemo(
    () => withQuery(basePath, { day: selectedDay, view: viewMode }),
    [basePath, selectedDay, viewMode],
  );

  const plannedTaskById = useMemo(() => {
    const map = new Map<string, string>();
    for (const plan of localPlans) {
      map.set(plan.task_id, plan.planned_date);
    }
    return map;
  }, [localPlans]);

  const bankTasks = flexibleTasks.filter((task) => !plannedTaskById.has(task.id));
  const monthlyRecurringTasks = useMemo(() => {
    const seen = new Set<string>();
    const recurring = [...dailyTasks, ...flexibleTasks].filter(
      (task) =>
        task.task_type === "recurring_daily" || task.task_type === "recurring_weekly",
    );

    return recurring.filter((task) => {
      if (seen.has(task.id)) {
        return false;
      }
      seen.add(task.id);
      return true;
    });
  }, [dailyTasks, flexibleTasks]);

  const plannedByDay = useMemo(() => {
    const map = new Map<string, PlannerTask[]>();
    for (const day of weekDays) {
      map.set(day.key, []);
    }

    for (const task of flexibleTasks) {
      const plannedDate = plannedTaskById.get(task.id);
      if (plannedDate && map.has(plannedDate)) {
        map.get(plannedDate)?.push(task);
      }
    }

    return map;
  }, [flexibleTasks, plannedTaskById, weekDays]);

  const selectedDayMeta = weekDays.find((day) => day.key === selectedDay) ?? weekDays[0];
  const selectedDayLabel = selectedDayMeta
    ? `${selectedDayMeta.label} ${selectedDayMeta.dayNumber}`
    : "This day";
  const selectedWeekTaskRecord = selectedWeekTask
    ? [...dailyTasks, ...flexibleTasks].find((task) => task.id === selectedWeekTask.taskId) ?? null
    : null;

  const handleMove = (taskId: string, plannedDate: string | null) => {
    const previousPlans = localPlans;
    const nextPlans = plannedDate
      ? [
          ...localPlans.filter((plan) => plan.task_id !== taskId),
          { task_id: taskId, planned_date: plannedDate },
        ]
      : localPlans.filter((plan) => plan.task_id !== taskId);

    setLocalPlans(nextPlans);
    setPlannerError(null);

    startTransition(async () => {
      const result = plannedDate
        ? await moveTaskToDayPlan({
            taskId,
            childId,
            courseId: flexibleTasks.find((task) => task.id === taskId)?.course_id ?? "",
            weekStartDate,
            plannedDate,
          })
        : await clearTaskDayPlan({
            taskId,
            childId,
            weekStartDate,
          });

      if (!result.ok) {
        setLocalPlans(previousPlans);
        setPlannerError(result.error ?? "We couldn't save that change.");
        return;
      }

      setSelectedWeekTask(plannedDate ? { taskId, dayKey: plannedDate } : null);

      router.refresh();
    });
  };

  return (
    <section className="grid gap-4">
      <div className="brand-card rounded-3xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="brand-eyebrow">This week</p>
            <h1 className="brand-title mt-1 text-xl font-semibold tracking-tight">
              Build your week
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={viewMode}
              onChange={(event) =>
                router.replace(withQuery(basePath, { view: event.target.value, day: selectedDay }))
              }
              className="brand-input h-10 rounded-2xl px-3 text-sm"
              aria-label="Week or day view"
            >
              <option value="day">Day view</option>
              <option value="week">Week view</option>
            </select>
            <Link href={progressPath} className="brand-secondary-btn">
              My progress
            </Link>
            <Link
              href={coursesPath}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              All courses
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Chosen day", value: selectedDayLabel },
            { label: "Unplanned tasks", value: `${bankTasks.length} to place` },
            { label: "Gold", value: `${goldBarCount} bars` },
          ].map((item) => (
            <div key={item.label} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                {item.label}
              </span>
              <span className="text-sm font-semibold text-[color:var(--ink)]">{item.value}</span>
            </div>
          ))}
        </div>

        {(flashError || plannerError || flashSaved || flashRewardCoins > 0 || flashFocusNearRewardCoins > 0) ? (
          <div className="mt-3 grid gap-2">
            {flashError || plannerError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {plannerError ?? flashError}
              </p>
            ) : null}
            {flashRewardCoins > 0 ? (
              <RewardCelebration
                goldCoinAmount={flashRewardCoins}
                title="Coins earned!"
                body="Nice work. Your completed task just added more Gold Coins to your balance."
              />
            ) : flashFocusNearRewardCoins > 0 ? (
              <RewardCelebration
                goldCoinAmount={flashFocusNearRewardCoins}
                title={`You have nearly earned ${flashFocusNearRewardCoins} coin${flashFocusNearRewardCoins === 1 ? "" : "s"}. Keep going!`}
                body="Finish the last mini task in this focus block to unlock the full reward."
              />
            ) : null}
            {flashSaved && flashRewardCoins < 1 && flashFocusNearRewardCoins < 1 ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {flashSaved}
              </p>
            ) : null}
          </div>
        ) : null}

        <DailySpellingPracticeCard
          practice={dailySpellingPractice}
          childId={childId}
        />

        <div className="mt-4">
          <GoldForgePanel
            nuggetCount={nuggetCount}
            inMachineCount={inMachineCount}
            goldBarCount={goldBarCount}
            provenBagItems={provenBagItems}
            goldCoinCount={goldCoinCount}
            checkedInToday={checkedInToday}
            variant="compact"
          />
        </div>

        <div className="mt-4 rounded-[1.35rem] border border-[rgba(245,190,57,0.22)] bg-[linear-gradient(180deg,#fffdf4_0%,#fff8e2_100%)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="brand-eyebrow">This month</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
                Recurring progress for {getCurrentMonthLabel()}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--mid)]">
                Weekly recurring tasks roll up here so you can see monthly movement while still planning week by week.
              </p>
            </div>
            <span className="rounded-full border border-[rgba(245,190,57,0.24)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {monthlyRecurringTasks.length} recurring item{monthlyRecurringTasks.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {monthlyRecurringTasks.length > 0 ? (
              monthlyRecurringTasks.map((task) => {
                const summary = getRecurringTaskSummary(task, completions, currentDate);
                if (!summary) {
                  return null;
                }

                return (
                  <div
                    key={`month-${task.id}`}
                    className="rounded-[1.15rem] border border-[rgba(245,190,57,0.2)] bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                      <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.2)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                        {task.task_type === "recurring_daily" ? "Daily" : "Weekly"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--mid)]">
                      {getPlannerContextSummary(task)}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                      {summary.rhythm}
                    </p>
                    <p className="mt-3 text-sm text-[color:var(--ink)]">
                      {summary.targetAmount > 0
                        ? `${summary.windowTotal} of ${summary.targetAmount} done this month · ${summary.remainingToTarget} left`
                        : `${summary.windowTotal} logged this month`}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      {summary.allTimeTotal} completed all time
                    </p>
                    {summary.targetAmount > 0 ? (
                      <div className="mt-3">
                        <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(245,190,57,0.15)]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#f5be39_0%,#ce477d_100%)]"
                            style={{ width: `${Math.max(summary.progressPercent, summary.windowTotal > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--mid)]">
                          {summary.progressPercent}% of target
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--mid)] md:col-span-2 xl:col-span-3">
                No recurring monthly targets are visible in this planner yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">{viewMode === "week" ? "Week board" : "Day board"}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                {viewMode === "week" ? "Drop tasks into the week" : `Plan ${selectedDayLabel}`}
              </h2>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {viewMode === "week" ? "Whole week" : "One day"}
            </span>
          </div>

          {viewMode === "week" ? (
            <div className="mt-3 grid gap-4">
              <div className="rounded-[1.35rem] border border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.22)] p-4 shadow-[0_10px_24px_rgba(206,71,125,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Week bank</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
                      Available this week
                    </h3>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    Drag into a day
                  </span>
                </div>
                <p className="mt-2 text-sm text-[color:var(--mid)]">
                  Tasks you added to your week stay here until you drop them into a specific day.
                </p>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                    if (taskId) {
                      handleMove(taskId, null);
                    }
                  }}
                  className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3"
                >
                  {bankTasks.length > 0 ? (
                    bankTasks.map((task) => (
                      <TaskCard
                        key={`bank-week-${task.id}`}
                        task={task}
                        dayKey={selectedDay}
                        currentDate={currentDate}
                        childId={childId}
                        redirectPath={selectedDayPath}
                        completions={completions}
                        submissions={submissions}
                        draggable
                        onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
                        compact
                      />
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-4 py-3 text-sm text-[color:var(--mid)] md:col-span-2 xl:col-span-3">
                      The week bank is empty right now.
                    </p>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[980px] grid-cols-7 gap-2">
                {weekDays.map((day) => (
                  <div
                    key={day.key}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                      if (taskId) {
                        handleMove(taskId, day.key);
                      }
                    }}
                    className={`min-w-0 rounded-[1.15rem] border p-2.5 ${
                      day.key === selectedDay
                        ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.28)]"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => router.replace(withQuery(basePath, { day: day.key, view: viewMode }))}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
                          {day.label}
                        </p>
                        <p className="mt-1 text-base font-semibold text-[color:var(--ink)]">{day.dayNumber}</p>
                      </div>
                      {day.key === selectedDay ? (
                        <span className="rounded-full border border-[var(--scarlett)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
                          Chosen
                        </span>
                      ) : null}
                    </button>

                    <div className="mt-2 grid gap-1.5">
                      {dailyTasks.map((task) => (
                        <WeekMiniTask
                          key={`${day.key}-${task.id}`}
                          task={task}
                          dayKey={day.key}
                          currentDate={currentDate}
                          completions={completions}
                          submissions={submissions}
                          isSelected={
                            selectedWeekTask?.taskId === task.id && selectedWeekTask?.dayKey === day.key
                          }
                          onSelect={() => setSelectedWeekTask({ taskId: task.id, dayKey: day.key })}
                        />
                      ))}
                      {(plannedByDay.get(day.key) ?? []).map((task) => (
                        <WeekMiniTask
                          key={`${day.key}-planned-${task.id}`}
                          task={task}
                          dayKey={day.key}
                          currentDate={currentDate}
                          completions={completions}
                          submissions={submissions}
                          isSelected={
                            selectedWeekTask?.taskId === task.id && selectedWeekTask?.dayKey === day.key
                          }
                          onSelect={() => setSelectedWeekTask({ taskId: task.id, dayKey: day.key })}
                        />
                      ))}
                      {dailyTasks.length === 0 && (plannedByDay.get(day.key) ?? []).length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border)] px-2.5 py-3 text-center text-[11px] text-[color:var(--mid)]">
                          Drop here
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="brand-card-soft rounded-[1.35rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Week bank</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
                      Available this week
                    </h3>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    Drag across
                  </span>
                </div>
                <p className="mt-2 text-sm text-[color:var(--mid)]">
                  Pick from the weekly bank and drop tasks into the chosen day.
                </p>
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Every day</p>
                  <div className="mt-3 grid gap-2">
                    {dailyTasks.length > 0 ? (
                      dailyTasks.map((task) => (
                        <TaskCard
                          key={`${selectedDay}-${task.id}`}
                          task={task}
                          dayKey={selectedDay}
                          currentDate={currentDate}
                          childId={childId}
                          redirectPath={selectedDayPath}
                          completions={completions}
                          submissions={submissions}
                        />
                      ))
                    ) : (
                      <p className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-4 py-3 text-sm text-[color:var(--mid)]">
                        No daily habits waiting.
                      </p>
                    )}
                  </div>
                </div>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                    if (taskId) {
                      handleMove(taskId, null);
                    }
                  }}
                  className="mt-3 grid gap-2"
                >
                  {bankTasks.length > 0 ? (
                    bankTasks.map((task) => (
                      <TaskCard
                        key={`bank-day-${task.id}`}
                        task={task}
                        dayKey={selectedDay}
                        currentDate={currentDate}
                        childId={childId}
                        redirectPath={selectedDayPath}
                        completions={completions}
                        submissions={submissions}
                        draggable
                        onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
                        compact
                      />
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-4 py-3 text-sm text-[color:var(--mid)]">
                      The week bank is empty right now.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2 md:grid-cols-7">
                {weekDays.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => router.replace(withQuery(basePath, { day: day.key, view: viewMode }))}
                    className={`rounded-2xl border px-3 py-2.5 text-center transition ${
                      day.key === selectedDay
                        ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.35)] text-[color:var(--ink)]"
                        : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                      {day.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{day.dayNumber}</p>
                  </button>
                ))}
                </div>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                    if (taskId) {
                      handleMove(taskId, selectedDay);
                    }
                  }}
                  className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5"
                >
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Dropped into {selectedDayLabel}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    Drag tasks here and they save automatically.
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(plannedByDay.get(selectedDay) ?? []).length > 0 ? (
                      (plannedByDay.get(selectedDay) ?? []).map((task) => (
                        <TaskCard
                          key={`${selectedDay}-planned-${task.id}`}
                          task={task}
                          dayKey={selectedDay}
                          currentDate={currentDate}
                          childId={childId}
                          redirectPath={selectedDayPath}
                          completions={completions}
                          submissions={submissions}
                          draggable
                          onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
                        />
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(255,247,220,0.32)] px-4 py-3 text-sm text-[color:var(--mid)]">
                        Nothing dropped into this day yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {viewMode === "week" && selectedWeekTaskRecord && selectedWeekTask ? (
        <>
          <button
            type="button"
            aria-label="Close task details"
            onClick={() => setSelectedWeekTask(null)}
            className="fixed inset-0 z-40 bg-[rgba(32,16,24,0.26)] backdrop-blur-[1px]"
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[rgba(255,251,253,0.98)] shadow-[-18px_0_40px_rgba(194,24,91,0.12)]">
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[rgba(255,251,253,0.96)] px-4 py-4 backdrop-blur-xl">
              <div>
                <p className="brand-eyebrow">Task details</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">
                  {(weekDays.find((day) => day.key === selectedWeekTask.dayKey)?.label ?? "Day")}{" "}
                  {weekDays.find((day) => day.key === selectedWeekTask.dayKey)?.dayNumber ?? ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWeekTask(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M5.7 4.3a1 1 0 0 1 1.4 0L10 7.2l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 8.6l2.9 2.9a1 1 0 1 1-1.4 1.4L10 10l-2.9 2.9a1 1 0 1 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <TaskCard
                task={selectedWeekTaskRecord}
                dayKey={selectedWeekTask.dayKey}
                currentDate={currentDate}
                childId={childId}
                redirectPath={withQuery(basePath, { day: selectedWeekTask.dayKey, view: viewMode })}
                completions={completions}
                submissions={submissions}
                draggable={
                  selectedWeekTaskRecord.task_type !== "recurring_daily" &&
                  plannedTaskById.has(selectedWeekTaskRecord.id)
                }
                onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
                defaultExpanded
                hideToggleLabel
              />
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
