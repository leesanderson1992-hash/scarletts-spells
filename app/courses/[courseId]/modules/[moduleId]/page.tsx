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
  getActiveChildrenForUser,
  getModuleDetailForParent,
} from "@/lib/courses/queries";
import {
  COURSE_TASK_TYPE_LABELS,
  COURSE_TASK_TYPES,
  PARENT_COURSE_TASK_TYPES,
  type CourseTaskRow,
  TASK_GOLD_BAR_RULE_LABELS,
  TASK_GOLD_BAR_RULES,
  WEEKDAY_OPTIONS,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import { bulkUpdateTasks, createTask, deleteTask, duplicateTask, moveTask, updateTask } from "../../../actions";

type ModuleDetailPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    add?: string;
    edit?: string;
  }>;
};

function formatWeekdayLabels(weekdays: string[] | null | undefined) {
  if (!weekdays?.length) {
    return null;
  }

  const labelByValue: Record<string, string> = Object.fromEntries(
    WEEKDAY_OPTIONS.map((day) => [day.value, day.label]),
  );
  return weekdays.map((day) => labelByValue[day] ?? day).join(", ");
}

function getRecurringPaceText(taskType: (typeof COURSE_TASK_TYPES)[number], monthlyGoalTotal: number | null) {
  if (!monthlyGoalTotal) {
    return null;
  }

  if (taskType === "recurring_daily") {
    return `About ${Math.max(1, Math.ceil(monthlyGoalTotal / 30))} a day`;
  }

  if (taskType === "recurring_weekly") {
    return `About ${Math.max(1, Math.ceil(monthlyGoalTotal / 4))} a week`;
  }

  return null;
}

function getTaskPlanSummary(task: CourseTaskRow) {
  if (task.task_type === "recurring_daily") {
    return {
      heading: "Daily habit",
      detail: task.monthly_goal_total
        ? `Monthly target ${task.monthly_goal_total} · ${getRecurringPaceText(task.task_type, task.monthly_goal_total)}`
        : "Add a monthly target to guide the pace",
    };
  }

  if (task.task_type === "recurring_weekly") {
    const weekdayText = formatWeekdayLabels(task.weekly_days);
    return {
      heading: "Weekly goal",
      detail: [
        task.monthly_goal_total
          ? `Monthly target ${task.monthly_goal_total}`
          : "Add a monthly target",
        getRecurringPaceText(task.task_type, task.monthly_goal_total),
        weekdayText ? `Good days: ${weekdayText}` : "Good days not set",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  return {
    heading: "One-off task",
    detail: task.estimated_minutes ? `${task.estimated_minutes} min` : "No time set",
  };
}

function getTaskRewardSummary(task: CourseTaskRow) {
  if (task.gold_bar_rule === "none" || task.gold_coin_reward_amount < 1) {
    return `${TASK_GOLD_BAR_RULE_LABELS.none} · no direct Gold Coins`;
  }

  return `${TASK_GOLD_BAR_RULE_LABELS[task.gold_bar_rule]} · ${task.gold_coin_reward_amount} Gold Coin${task.gold_coin_reward_amount === 1 ? "" : "s"}`;
}

function getChoiceOptionsText(choiceOptions: string[] | null | undefined) {
  return (choiceOptions ?? []).join("\n");
}

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

export default async function ModuleDetailPage({
  params,
  searchParams,
}: ModuleDetailPageProps) {
  const { courseId, moduleId } = await params;
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
  const detail = await getModuleDetailForParent(supabase, user.id, courseId, moduleId);

  if (!detail) {
    notFound();
  }

  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie ?? detail.course.child_id,
  );
  const currentPath = `/courses/${courseId}/modules/${moduleId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const isAddingTask = resolvedSearchParams?.add === "task";
  const editingTaskId = resolvedSearchParams?.edit ?? null;

  return (
    <AppShell
      currentPath="/courses"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Module</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                {detail.module.title}
              </h1>
              {detail.module.description ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                  {detail.module.description}
                </p>
              ) : null}
            </div>
            <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {detail.module.tasks.length} {detail.module.tasks.length === 1 ? "task" : "tasks"}
            </div>
            <Link
              href={buildScopedPath(`/courses/${courseId}/modules/${moduleId}/edit`, selectedChild?.id ?? null, mode)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
              title={`Edit ${detail.module.title}`}
              aria-label={`Edit ${detail.module.title}`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
              </svg>
            </Link>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3">
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
        </div>

        <section className="brand-card overflow-hidden rounded-3xl p-0">
          <div className="sticky top-3 z-20 border-b border-[var(--border)] bg-[rgba(255,255,255,0.94)] px-4 py-2.5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Tasks
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  form="bulk-task-form"
                  name="bulk_action"
                  value="activate"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-emerald-700 transition hover:bg-emerald-50"
                  title="Show selected tasks in child mode"
                  aria-label="Show selected tasks in child mode"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M7.9 13.4 4.5 10a1 1 0 1 1 1.4-1.4l2 2 6.2-6.2a1 1 0 0 1 1.4 1.4l-6.9 6.9a1 1 0 0 1-1.4 0Z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  form="bulk-task-form"
                  name="bulk_action"
                  value="pause"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-amber-700 transition hover:bg-amber-50"
                  title="Hide selected tasks from child mode"
                  aria-label="Hide selected tasks from child mode"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M6 4a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm8 0a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  form="bulk-task-form"
                  name="bulk_action"
                  value="delete"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                  title="Delete selected tasks forever"
                  aria-label="Delete selected tasks forever"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                  </svg>
                </button>
                {!isAddingTask ? (
                  <Link
                    href={withQuery(scopedCurrentPath, { add: "task", edit: null })}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                    title="Add task"
                    aria-label="Add task"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                    </svg>
                  </Link>
                ) : (
                  <Link
                    href={withQuery(scopedCurrentPath, { add: null })}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                    title="Close add task"
                    aria-label="Close add task"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.32)] px-3.5 py-2.5 text-sm text-[color:var(--mid)]">
              Monthly targets belong on recurring tasks. Weekly goals can also include good days so the child sees a clearer Monday-Sunday rhythm without turning it into a rigid calendar.
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--mid)]">
              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1">Tick = show in child mode</span>
              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1">Pause = hide for now</span>
              <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1">Bin = remove forever</span>
            </div>

            {isAddingTask ? (
              <form action={createTask} className="mt-2 grid gap-3 rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]">
                <input type="hidden" name="course_id" value={courseId} />
                <input type="hidden" name="module_id" value={moduleId} />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                <input
                  type="text"
                  name="title"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Task title"
                />
                <select name="task_type" className="brand-input h-11 rounded-2xl px-4 text-sm">
                  {PARENT_COURSE_TASK_TYPES.map((taskType) => (
                    <option key={taskType} value={taskType}>
                      {COURSE_TASK_TYPE_LABELS[taskType]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="instructions"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Instructions"
                />
                <textarea
                  name="content_html"
                  rows={4}
                  className="brand-input rounded-2xl px-4 py-3 text-sm lg:col-span-2"
                  placeholder="Lesson or test content (simple HTML allowed)"
                />
                <p className="text-xs leading-5 text-[color:var(--mid)] lg:col-span-2">
                  For tracked answers in custom HTML lessons, use real form fields like{" "}
                  <code>&lt;textarea&gt;</code>, <code>&lt;input&gt;</code>,{" "}
                  <code>&lt;select&gt;</code>, or radio/checkbox inputs. Quiz scores are captured when
                  the lesson updates visible elements like <code>#score-num</code> and{" "}
                  <code>#score-msg</code>.
                </p>
                <button
                  type="submit"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                  title="Add task"
                  aria-label="Add task"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                    <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                  </svg>
                </button>
                <input
                  type="text"
                  name="writing_prompt"
                  className="brand-input h-11 rounded-2xl px-4 text-sm lg:col-span-2"
                  placeholder="Optional writing prompt"
                />
                <textarea
                  name="choice_options_text"
                  rows={3}
                  className="brand-input rounded-2xl px-4 py-3 text-sm lg:col-span-2"
                  placeholder={"Optional test choices, one per line"}
                />
                <input
                  type="number"
                  min="1"
                  max="240"
                  name="estimated_minutes"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Minutes"
                />
                <input
                  type="number"
                  min="1"
                  max="500"
                  name="monthly_goal_total"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Monthly target"
                />
                <select
                  name="gold_bar_rule"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  defaultValue="auto"
                  aria-label="Task reward rule"
                >
                  {TASK_GOLD_BAR_RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {TASK_GOLD_BAR_RULE_LABELS[rule]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="500"
                  name="gold_coin_reward_amount"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Gold Coins"
                  defaultValue="1"
                />
                <select
                  name="focus_block_id"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  defaultValue=""
                >
                  <option value="">No focus block</option>
                  {detail.focusBlocks.map((focusBlock) => (
                    <option key={focusBlock.id} value={focusBlock.id}>
                      {focusBlock.title}
                    </option>
                  ))}
                </select>
                <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-sm text-[color:var(--mid)]">
                  <input type="checkbox" name="allow_multiple_choices" value="true" className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]" />
                  Allow multiple choices
                </label>
                <div className="flex flex-wrap gap-2 lg:col-span-4">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <label
                      key={day.value}
                      className="rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[color:var(--mid)]"
                    >
                      <input type="checkbox" name="weekly_days" value={day.value} className="mr-2" />
                      {day.label}
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.62)] px-4 py-3 text-sm text-[color:var(--mid)] lg:col-span-4 lg:grid-cols-3">
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">Daily habit</p>
                    <p className="mt-1">Use a monthly target. Child view turns this into a simple daily pace.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">Weekly goal</p>
                    <p className="mt-1">Use a monthly target and optional good days. Child view shows a flexible week strip.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">One-off task</p>
                    <p className="mt-1">Use for checklist, lesson, test, writing, or checkpoint tasks that do not need a repeating target.</p>
                  </div>
                </div>
                <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-4 py-3 text-sm text-[color:var(--mid)] lg:col-span-4">
                  <p className="font-semibold text-[color:var(--ink)]">Task reward rule</p>
                  <p>
                    Progress state is automatic. Golden Nugget, In the Machine, Gold Bar, and Proven Bag are not reward-rule labels.
                  </p>
                  <p>
                    Use <span className="font-medium text-[color:var(--ink)]">Progress only</span> when the task should move learning forward without a direct payout.
                  </p>
                  <p>
                    Use <span className="font-medium text-[color:var(--ink)]">Auto reward</span> when the standard platform reward behavior should apply automatically.
                  </p>
                  <p>
                    Use <span className="font-medium text-[color:var(--ink)]">Reward on completion</span> when simply finishing the task should trigger its reward.
                  </p>
                  <p>
                    Use <span className="font-medium text-[color:var(--ink)]">Reward at target</span> when the child must hit the defined target before the reward is granted.
                  </p>
                  <p>
                    Set the <span className="font-medium text-[color:var(--ink)]">Gold Coin</span> amount here. Use <span className="font-medium text-[color:var(--ink)]">0</span> only with <span className="font-medium text-[color:var(--ink)]">Progress only</span>.
                  </p>
                </div>
              </form>
            ) : null}

            {detail.module.tasks.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left">
                    <thead>
                      <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        <th className="w-10 pb-2 pr-2">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="pb-2 pr-3">Task</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">Plan</th>
                        <th className="pb-2 pr-3">Reward</th>
                        <th className="pb-2 pr-3">Focus</th>
                        <th className="pb-2 pr-3">Notes</th>
                        <th className="pb-2 text-right">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.module.tasks.map((task) => {
                        const formId = `task-form-${task.id}`;
                        const duplicateFormId = `duplicate-task-form-${task.id}`;
                        const moveUpFormId = `move-task-up-form-${task.id}`;
                        const moveDownFormId = `move-task-down-form-${task.id}`;
                        const isEditing = editingTaskId === task.id;

                        return (
                          <tr key={task.id} className="border-t border-[var(--border)] align-top">
                            <td className="py-3 pr-2">
                              <input
                                type="checkbox"
                                name="task_ids"
                                value={task.id}
                                form="bulk-task-form"
                                className="mt-2 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                                aria-label={`Select ${task.title}`}
                              />
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <>
                                  <input type="hidden" name="task_id" value={task.id} form={formId} />
                                  <input
                                    type="hidden"
                                    name="redirect_path"
                                    value={scopedCurrentPath}
                                    form={formId}
                                  />
                                  <input
                                    type="text"
                                    name="title"
                                    form={formId}
                                    defaultValue={task.title}
                                    className="brand-input h-10 w-full rounded-2xl px-3 text-sm font-semibold"
                                    aria-label={`Task title for ${task.title}`}
                                  />
                                  <textarea
                                    name="instructions"
                                    form={formId}
                                    defaultValue={task.instructions ?? ""}
                                    rows={2}
                                    className="brand-input mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                                    aria-label={`Instructions for ${task.title}`}
                                    placeholder="Instructions"
                                  />
                                  <textarea
                                    name="content_html"
                                    form={formId}
                                    defaultValue={task.content_html ?? ""}
                                    rows={4}
                                    className="brand-input mt-2 w-full rounded-2xl px-3 py-2 text-sm"
                                    aria-label={`Content for ${task.title}`}
                                    placeholder="Lesson or test content (simple HTML allowed)"
                                  />
                                  <p className="mt-2 text-xs leading-5 text-[color:var(--mid)]">
                                    Use real form fields like <code>&lt;textarea&gt;</code>,{" "}
                                    <code>&lt;input&gt;</code>, <code>&lt;select&gt;</code>, or
                                    radio/checkbox inputs if you want answers tracked. Quiz scores are
                                    captured when the lesson updates <code>#score-num</code> and{" "}
                                    <code>#score-msg</code>.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                                  {task.instructions ? (
                                    <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">{task.instructions}</p>
                                  ) : (
                                    <p className="mt-1 text-sm text-[color:var(--mid)]">No instructions</p>
                                  )}
                                  {task.content_html ? (
                                    <p className="mt-1 text-xs text-[color:var(--mid)]">
                                      Structured content added
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <>
                                  <select
                                    name="task_type"
                                    form={formId}
                                    defaultValue={task.task_type}
                                    className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                    aria-label={`Task type for ${task.title}`}
                                  >
                                    {PARENT_COURSE_TASK_TYPES.map((taskType) => (
                                      <option key={taskType} value={taskType}>
                                        {COURSE_TASK_TYPE_LABELS[taskType]}
                                      </option>
                                    ))}
                                  </select>
                                  <label className="mt-2 flex items-center gap-2 text-xs font-medium text-[color:var(--mid)]">
                                    <input
                                      type="checkbox"
                                      name="is_active"
                                      value="true"
                                      form={formId}
                                      defaultChecked={task.is_active}
                                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                                    />
                                    Active
                                  </label>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm text-[color:var(--ink)]">
                                    {COURSE_TASK_TYPE_LABELS[task.task_type]}
                                  </p>
                                  <p className="mt-1 text-xs font-medium text-[color:var(--mid)]">
                                    {task.is_active ? "Active" : "Paused"}
                                  </p>
                                </>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <div className="grid gap-2">
                                  <label className="grid gap-1">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                                      Time
                                    </span>
                                    <input
                                      type="number"
                                      name="estimated_minutes"
                                      form={formId}
                                      min="1"
                                      max="240"
                                      defaultValue={task.estimated_minutes ?? ""}
                                      className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                      placeholder="Minutes"
                                      aria-label={`Estimated minutes for ${task.title}`}
                                    />
                                  </label>
                                  <label className="grid gap-1">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                                      Monthly target
                                    </span>
                                    <input
                                      type="number"
                                      name="monthly_goal_total"
                                      form={formId}
                                      min="1"
                                      max="500"
                                      defaultValue={task.monthly_goal_total ?? ""}
                                      className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                      placeholder="Monthly target"
                                      aria-label={`Monthly goal for ${task.title}`}
                                    />
                                  </label>
                                  {task.task_type === "recurring_daily" ? (
                                    <p className="text-xs text-[color:var(--mid)]">
                                      Child sees this as a daily habit. {getRecurringPaceText(task.task_type, task.monthly_goal_total) ?? "Add a monthly target to suggest a daily pace."}
                                    </p>
                                  ) : null}
                                  {task.task_type === "recurring_weekly" ? (
                                    <>
                                      <div className="flex flex-wrap gap-1.5">
                                        {WEEKDAY_OPTIONS.map((day) => (
                                          <label
                                            key={day.value}
                                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[color:var(--mid)]"
                                          >
                                            <input
                                              type="checkbox"
                                              name="weekly_days"
                                              value={day.value}
                                              form={formId}
                                              defaultChecked={task.weekly_days?.includes(day.value)}
                                              className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--scarlett)]"
                                            />
                                            {day.label}
                                          </label>
                                        ))}
                                      </div>
                                      <p className="text-xs text-[color:var(--mid)]">
                                        Child sees this as a weekly goal. {getRecurringPaceText(task.task_type, task.monthly_goal_total) ?? "Add a monthly target to suggest a weekly pace."} {formatWeekdayLabels(task.weekly_days) ? `Good days: ${formatWeekdayLabels(task.weekly_days)}.` : "Choose good days if you want the child week view to suggest the best days."}
                                      </p>
                                    </>
                                  ) : null}
                                  {task.task_type !== "recurring_daily" && task.task_type !== "recurring_weekly" ? (
                                    <p className="text-xs text-[color:var(--mid)]">
                                      One-off tasks do not need a monthly target unless you later change them into recurring training.
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                (() => {
                                  const summary = getTaskPlanSummary(task);

                                  return (
                                    <>
                                      <p className="text-sm text-[color:var(--ink)]">{summary.heading}</p>
                                      <p className="mt-1 text-xs text-[color:var(--mid)]">{summary.detail}</p>
                                    </>
                                  );
                                })()
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <div className="grid gap-2">
                                  <select
                                    name="gold_bar_rule"
                                    form={formId}
                                    defaultValue={task.gold_bar_rule}
                                    className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                    aria-label={`Task reward rule for ${task.title}`}
                                  >
                                    {TASK_GOLD_BAR_RULES.map((rule) => (
                                      <option key={rule} value={rule}>
                                        {TASK_GOLD_BAR_RULE_LABELS[rule]}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    name="gold_coin_reward_amount"
                                    form={formId}
                                    min="0"
                                    max="500"
                                    defaultValue={task.gold_coin_reward_amount}
                                    className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                    placeholder="Gold Coins"
                                    aria-label={`Gold Coin reward for ${task.title}`}
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-[color:var(--mid)]">
                                  {getTaskRewardSummary(task)}
                                </p>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <select
                                  name="focus_block_id"
                                  form={formId}
                                  defaultValue={task.focus_block_id ?? ""}
                                  className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                                  aria-label={`Focus block for ${task.title}`}
                                >
                                  <option value="">No focus block</option>
                                  {detail.focusBlocks.map((focusBlock) => (
                                    <option key={focusBlock.id} value={focusBlock.id}>
                                      {focusBlock.title}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-sm text-[color:var(--mid)]">
                                  {detail.focusBlocks.find((focusBlock) => focusBlock.id === task.focus_block_id)?.title ?? "No focus block"}
                                </p>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {isEditing ? (
                                <div className="grid gap-2">
                                  <textarea
                                    name="writing_prompt"
                                    form={formId}
                                    defaultValue={task.writing_prompt ?? ""}
                                    rows={3}
                                    className="brand-input w-full rounded-2xl px-3 py-2 text-sm"
                                    aria-label={`Writing prompt for ${task.title}`}
                                    placeholder="Prompt"
                                  />
                                  <textarea
                                    name="choice_options_text"
                                    form={formId}
                                    defaultValue={getChoiceOptionsText(task.choice_options)}
                                    rows={3}
                                    className="brand-input w-full rounded-2xl px-3 py-2 text-sm"
                                    aria-label={`Choice options for ${task.title}`}
                                    placeholder="Optional test choices, one per line"
                                  />
                                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--mid)]">
                                    <input
                                      type="checkbox"
                                      name="allow_multiple_choices"
                                      value="true"
                                      form={formId}
                                      defaultChecked={task.allow_multiple_choices}
                                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                                    />
                                    Allow multiple choices
                                  </label>
                                </div>
                              ) : (
                                <div className="grid gap-1">
                                  <p className="text-sm text-[color:var(--mid)]">
                                    {task.writing_prompt || "No prompt"}
                                  </p>
                                  {task.choice_options?.length ? (
                                    <p className="text-xs text-[color:var(--mid)]">
                                      {task.choice_options.length} choice option{task.choice_options.length === 1 ? "" : "s"}
                                      {task.allow_multiple_choices ? " · multi-select" : ""}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="submit"
                                      form={formId}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                      title={`Save ${task.title}`}
                                      aria-label={`Save ${task.title}`}
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
                                      form={moveUpFormId}
                                      disabled={detail.module.tasks[0]?.id === task.id}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                                      title={`Move ${task.title} up`}
                                      aria-label={`Move ${task.title} up`}
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                                        <path d="M10 4.6 5.7 8.9a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.4L11 4.6V17a1 1 0 1 1-2 0V4.6Z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="submit"
                                      form={moveDownFormId}
                                      disabled={detail.module.tasks[detail.module.tasks.length - 1]?.id === task.id}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                                      title={`Move ${task.title} down`}
                                      aria-label={`Move ${task.title} down`}
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                                        <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
                                      </svg>
                                    </button>
                                    {(task.task_type === "lesson" || task.task_type === "test") ? (
                                      <button
                                        type="submit"
                                        form={duplicateFormId}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                        title={`Duplicate ${task.title}`}
                                        aria-label={`Duplicate ${task.title}`}
                                      >
                                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                                          <path d="M6 2a2 2 0 0 0-2 2v8h2V4h8V2H6Zm3 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9Zm0 2h7v8H9V8Z" />
                                        </svg>
                                      </button>
                                    ) : null}
                                    <Link
                                      href={buildScopedPath(`/courses/${courseId}/modules/${moduleId}/tasks/${task.id}/edit`, selectedChild?.id ?? null, mode)}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                                      title={`Edit ${task.title}`}
                                      aria-label={`Edit ${task.title}`}
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                                        <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 0.8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                                      </svg>
                                    </Link>
                                    <button
                                      type="submit"
                                      form={`delete-task-form-${task.id}`}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                                      title={`Delete ${task.title} forever`}
                                      aria-label={`Delete ${task.title} forever`}
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                                        <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            ) : null}
          </div>

          <form id="bulk-task-form" action={bulkUpdateTasks} className="hidden">
            <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
          </form>

          {detail.module.tasks.map((task) => (
            <div key={`task-forms-${task.id}`}>
              <form
                id={`task-form-${task.id}`}
                action={updateTask}
                className="hidden"
              />
              <form
                id={`delete-task-form-${task.id}`}
                action={deleteTask}
                className="hidden"
              >
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              </form>
              <form
                id={`duplicate-task-form-${task.id}`}
                action={duplicateTask}
                className="hidden"
              >
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              </form>
              <form
                id={`move-task-up-form-${task.id}`}
                action={moveTask}
                className="hidden"
              >
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="direction" value="up" />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              </form>
              <form
                id={`move-task-down-form-${task.id}`}
                action={moveTask}
                className="hidden"
              >
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="direction" value="down" />
                <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              </form>
            </div>
          ))}

          {detail.module.tasks.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[color:var(--mid)]">No tasks yet in this module.</div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
