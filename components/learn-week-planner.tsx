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
  type ChildSurfaceBadge,
} from "@/lib/courses/progress";
import { getInlineLessonPreviewHtml, isFullDocumentHtml } from "@/lib/courses/html-preview";
import {
  clearTaskDayPlan,
  completeCourseTask,
  moveTaskToDayPlan,
  submitTaskResponse,
} from "@/app/learn/actions";

type PlannerTask = {
  id: string;
  course_id: string;
  title: string;
  task_type: CourseTaskType;
  instructions: string | null;
  content_html: string | null;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  gold_coin_reward_amount: number;
  weekly_days: string[] | null;
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
  practicePath: string;
  childId: string;
  selectedDay: string;
  viewMode: "day" | "week";
  weekDays: PlannerDay[];
  weekStartDate: string;
  dailyTasks: PlannerTask[];
  flexibleTasks: PlannerTask[];
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  dayPlans: PlannerDayPlan[];
  spellingReadyCount: number;
  spellingReviewCount: number;
  checkedInToday: boolean;
  nuggetCount: number;
  inMachineCount: number;
  goldBarCount: number;
  goldCoinCount: number;
  provenBagItems: Array<{ id: string; label: string; kind: string }>;
  flashError?: string;
  flashSaved?: string | null;
  flashRewardCoins?: number;
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

function getCurrentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthlyCompletedTotal(
  taskId: string,
  completions: PlannerCompletion[],
) {
  const monthPrefix = getCurrentMonthPrefix();

  return completions
    .filter(
      (completion) =>
        completion.task_id === taskId &&
        completion.completion_date.startsWith(monthPrefix),
    )
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
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
    return completions.some(
      (completion) => completion.task_id === task.id && completion.completion_date === targetDate,
    );
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
  childId,
  redirectPath,
  completions,
  submissions,
  draggable = false,
  onDragStart,
  defaultExpanded = false,
  hideToggleLabel = false,
}: {
  task: PlannerTask;
  dayKey: string;
  childId: string;
  redirectPath: string;
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  draggable?: boolean;
  onDragStart?: (taskId: string) => void;
  defaultExpanded?: boolean;
  hideToggleLabel?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const monthlyCompleted = getMonthlyCompletedTotal(task.id, completions);
  const badges = getChildTaskBadges(task, completions, submissions, dayKey);
  const doneForDay = isTaskDoneOnDate(task, completions, submissions, dayKey);
  const weekdayKey = getWeekdayKeyFromDate(dayKey);
  const latestSubmission = getLatestSubmissionForTask(task.id, submissions);
  const inlineLessonPreview = getInlineLessonPreviewHtml(task.content_html);
  const hasEmbeddedLessonDocument = isFullDocumentHtml(task.content_html);

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
            {task.courseTitle} · {task.moduleTitle}
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
          {task.content_html && inlineLessonPreview ? (
            <div
              className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 text-[color:var(--ink)]"
              dangerouslySetInnerHTML={{ __html: inlineLessonPreview }}
            />
          ) : null}
          {task.content_html && hasEmbeddedLessonDocument ? (
            <p className="text-xs font-medium text-[color:var(--mid)]">
              This task includes a full interactive lesson. Open it to work inside the full page.
            </p>
          ) : null}
          {task.writing_prompt ? (
            <p className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-2 text-sm text-[color:var(--mid)]">
              Prompt: {task.writing_prompt}
            </p>
          ) : null}
          {task.monthly_goal_total ? (
            <p className="text-xs font-medium text-[color:var(--mid)]">
              {monthlyCompleted} of {task.monthly_goal_total} done this month
              {getRecurringPacingText(task) ? ` · ${getRecurringPacingText(task)}` : ""}
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
              {task.task_type === "recurring_daily" || task.task_type === "recurring_weekly" ? (
                <input
                  type="number"
                  name="quantity_completed"
                  min="1"
                  max="500"
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

          {isWritingTask(task.task_type) ? (
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
              {latestSubmission ? (
                <p className="text-xs text-[color:var(--mid)]">A response has already been saved before.</p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WeekMiniTask({
  task,
  dayKey,
  completions,
  submissions,
  isSelected = false,
  onSelect,
}: {
  task: PlannerTask;
  dayKey: string;
  completions: PlannerCompletion[];
  submissions: PlannerSubmission[];
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const doneForDay = isTaskDoneOnDate(task, completions, submissions, dayKey);
  const badges = getChildTaskBadges(task, completions, submissions, dayKey);
  const primaryBadge = badges[0] ?? null;

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
        </div>
      </div>
    </button>
  );
}

function SpellingTaskCard({
  practicePath,
  dayKey,
  readyCount,
  reviewCount,
}: {
  practicePath: string;
  dayKey: string;
  readyCount: number;
  reviewCount: number;
}) {
  const practicePathForDay = withQuery(practicePath, { day: dayKey });
  const hasWordsReady = readyCount > 0 || reviewCount > 0;

  return (
    <div className="rounded-2xl border border-[rgba(206,71,125,0.22)] bg-[rgba(252,228,244,0.2)] px-3 py-3 shadow-[0_10px_24px_rgba(206,71,125,0.06)]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[color:var(--ink)]">Daily spelling</p>
        <span className="rounded-full border border-[rgba(206,71,125,0.24)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
          Every day
        </span>
        {hasWordsReady ? (
          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {readyCount > 0 ? `${readyCount} ready` : `${reviewCount} review`}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[color:var(--mid)]">Spelling practice</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
        Open your spelling practice for the day and work through the words waiting for you.
      </p>
      <div className="mt-3">
        <Link
          href={practicePathForDay}
          className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
        >
          Open spelling
        </Link>
      </div>
    </div>
  );
}

function SpellingMiniTask({
  practicePath,
  dayKey,
  readyCount,
  reviewCount,
}: {
  practicePath: string;
  dayKey: string;
  readyCount: number;
  reviewCount: number;
}) {
  const practicePathForDay = withQuery(practicePath, { day: dayKey });
  const label =
    readyCount > 0 ? `${readyCount} ready` : reviewCount > 0 ? `${reviewCount} review` : "Open";

  return (
    <Link
      href={practicePathForDay}
      className="block w-full min-w-0 rounded-lg border border-[rgba(206,71,125,0.22)] bg-[rgba(252,228,244,0.2)] px-2 py-1.5 text-left transition hover:border-[var(--scarlett)]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--scarlett)]" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-[color:var(--ink)]">
            Daily spelling
          </p>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-[color:var(--mid)]">
            <span className="truncate">Spelling practice</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{label}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LearnWeekPlanner({
  basePath,
  progressPath,
  coursesPath,
  practicePath,
  childId,
  selectedDay,
  viewMode,
  weekDays,
  weekStartDate,
  dailyTasks,
  flexibleTasks,
  completions,
  submissions,
  dayPlans,
  spellingReadyCount,
  spellingReviewCount,
  checkedInToday,
  nuggetCount,
  inMachineCount,
  goldBarCount,
  goldCoinCount,
  provenBagItems,
  flashError,
  flashSaved,
  flashRewardCoins = 0,
}: LearnWeekPlannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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

  const renderDropZone = (day: PlannerDay) => (
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
      className={`rounded-[1.35rem] border p-3 ${
        day.key === selectedDay
          ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.28)]"
          : "border-[var(--border)] bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => router.replace(withQuery(basePath, { day: day.key, view: viewMode }))}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
            {day.label}
          </p>
          <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{day.dayNumber}</p>
        </div>
        {day.key === selectedDay ? (
          <span className="rounded-full border border-[var(--scarlett)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--scarlett)]">
            Chosen
          </span>
        ) : null}
      </button>

        <div className="mt-3 grid gap-2">
          <SpellingTaskCard
            practicePath={practicePath}
            dayKey={day.key}
            readyCount={spellingReadyCount}
            reviewCount={spellingReviewCount}
          />
          {dailyTasks.map((task) => (
            <TaskCard
              key={`${day.key}-${task.id}`}
            task={task}
            dayKey={day.key}
            childId={childId}
            redirectPath={withQuery(basePath, { day: day.key, view: viewMode })}
            completions={completions}
            submissions={submissions}
          />
        ))}
        {(plannedByDay.get(day.key) ?? []).map((task) => (
          <TaskCard
            key={`${day.key}-${task.id}`}
            task={task}
            dayKey={day.key}
            childId={childId}
            redirectPath={withQuery(basePath, { day: day.key, view: viewMode })}
            completions={completions}
            submissions={submissions}
            draggable
            onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
          />
        ))}
      </div>
    </div>
  );

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
            { label: "Spelling", value: spellingReadyCount > 0 ? `${spellingReadyCount} ready` : "Nothing set yet" },
            { label: "Week bank", value: `${bankTasks.length} waiting` },
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

        {(flashError || plannerError || flashSaved || flashRewardCoins > 0) ? (
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
            ) : null}
            {flashSaved && flashRewardCoins < 1 ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {flashSaved}
              </p>
            ) : null}
          </div>
        ) : null}

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
            <div className="mt-3 overflow-x-auto pb-2">
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
                    <SpellingMiniTask
                      practicePath={practicePath}
                      dayKey={day.key}
                      readyCount={spellingReadyCount}
                      reviewCount={spellingReviewCount}
                    />
                    {dailyTasks.map((task) => (
                      <WeekMiniTask
                        key={`${day.key}-${task.id}`}
                        task={task}
                        dayKey={day.key}
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
                {spellingReadyCount > 0 ? (
                  <Link href={practicePath} className="mt-3 inline-flex items-center rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]">
                    Spelling {spellingReadyCount}
                  </Link>
                ) : null}
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
                        childId={childId}
                        redirectPath={selectedDayPath}
                        completions={completions}
                        submissions={submissions}
                        draggable
                        onDragStart={(taskId) => setDraggedTaskId(taskId ?? null)}
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

                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Every day</p>
                  <div className="mt-3 grid gap-2">
                    <SpellingTaskCard
                      practicePath={practicePath}
                      dayKey={selectedDay}
                      readyCount={spellingReadyCount}
                      reviewCount={spellingReviewCount}
                    />
                    {dailyTasks.length > 0 ? (
                      dailyTasks.map((task) => (
                        <TaskCard
                          key={`${selectedDay}-${task.id}`}
                          task={task}
                          dayKey={selectedDay}
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
