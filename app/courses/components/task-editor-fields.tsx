import {
  canCourseStructureUseFocusBlocks,
  getAllowedRewardTriggersForTaskType,
  getSharedCreatorTaskTypes,
  COURSE_COIN_REWARD_TRIGGER_LABELS,
  COURSE_TASK_TYPE_LABELS,
  type CourseStructureType,
  WEEKDAY_OPTIONS,
  type CourseTaskRow,
  type FocusBlockRow,
} from "@/lib/courses/types";
import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { StructuredLessonBuilder } from "@/components/structured-lesson-builder";

function getChoiceOptionsText(choiceOptions: string[] | null | undefined) {
  return (choiceOptions ?? []).join("\n");
}

function formatWeekdayLabels(weekdays: string[] | null | undefined) {
  if (!weekdays?.length) {
    return null;
  }

  const labelByValue: Record<string, string> = Object.fromEntries(
    WEEKDAY_OPTIONS.map((day) => [day.value, day.label]),
  );

  return weekdays.map((day) => labelByValue[day] ?? day).join(", ");
}

function getRecurringPaceText(taskType: CourseTaskRow["task_type"], monthlyGoalTotal: number | null) {
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

export function TaskEditorFields({
  task,
  focusBlocks,
  courseStructure,
  formId,
}: {
  task: CourseTaskRow;
  focusBlocks: FocusBlockRow[];
  courseStructure: CourseStructureType;
  formId: string;
}) {
  const allowedRewardTriggers = getAllowedRewardTriggersForTaskType(task.task_type);
  const allowedTaskTypes = getSharedCreatorTaskTypes(task.task_type);
  const showFocusBlockField = canCourseStructureUseFocusBlocks(courseStructure);

  return (
    <div className="grid gap-4">
      <section className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Task setup
          </p>
          <BuilderInfoHint label="Task setup help">
            Name the task, choose the right type, and give the child the shortest useful instruction.
          </BuilderInfoHint>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Title
            </span>
            <input
              type="text"
              name="title"
              form={formId}
              defaultValue={task.title}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Task type
            </span>
            <select
              name="task_type"
              form={formId}
              defaultValue={task.task_type}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
            >
              {allowedTaskTypes.map((taskType) => (
                <option key={taskType} value={taskType}>
                  {COURSE_TASK_TYPE_LABELS[taskType]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
            Instructions
          </span>
          <textarea
            name="instructions"
            form={formId}
            defaultValue={task.instructions ?? ""}
            rows={3}
            className="brand-input rounded-2xl px-4 py-3 text-sm"
            placeholder="Instructions"
          />
        </label>
      </section>

      <section className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Content and answers
          </p>
          <BuilderInfoHint label="Content and answers help">
            Keep the lesson content, prompt, and answer format together so you can see the full child response path in one place.
          </BuilderInfoHint>
        </div>
        {task.task_type === "lesson" || task.task_type === "test" ? (
          <div className="mt-3">
            <StructuredLessonBuilder
              formId={formId}
              taskTitle={task.title}
              initialLesson={task.lesson_schema ?? null}
            />
          </div>
        ) : null}
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Writing prompt
            </span>
            <textarea
              name="writing_prompt"
              form={formId}
              defaultValue={task.writing_prompt ?? ""}
              rows={3}
              className="brand-input rounded-2xl px-4 py-3 text-sm"
              placeholder="Prompt"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Choice options
            </span>
            <textarea
              name="choice_options_text"
              form={formId}
              defaultValue={getChoiceOptionsText(task.choice_options)}
              rows={3}
              className="brand-input rounded-2xl px-4 py-3 text-sm"
              placeholder="Optional test choices, one per line"
            />
          </label>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--mid)]">
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
      </section>

      <section className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Delivery, pacing, and reward
          </p>
          <BuilderInfoHint label="Delivery, pacing, and reward help">
            Use this section to decide how often the task appears, whether it belongs in a timed focus block, and if it pays coins directly.
          </BuilderInfoHint>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <label className="grid gap-1.5">
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
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="Minutes"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Monthly target
            </span>
            <input
              type="number"
              name="monthly_goal_total"
              form={formId}
              min="1"
              max="10000"
              defaultValue={task.monthly_goal_total ?? ""}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="Monthly target"
            />
          </label>
          {showFocusBlockField ? (
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Focus block
              </span>
              <select
                name="focus_block_id"
                form={formId}
                defaultValue={task.focus_block_id ?? ""}
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              >
                <option value="">No focus block</option>
                {focusBlocks.map((focusBlock) => (
                  <option key={focusBlock.id} value={focusBlock.id}>
                    {focusBlock.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {task.task_type === "recurring_daily" ? (
          <p className="mt-4 text-xs text-[color:var(--mid)]">
            {getRecurringPaceText(task.task_type, task.monthly_goal_total) ??
              "Add a monthly target to suggest a daily pace."}
          </p>
        ) : null}
        {task.task_type === "recurring_weekly" ? (
          <>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS.map((day) => (
                <label
                  key={day.value}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--mid)]"
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
            <p className="mt-3 text-xs text-[color:var(--mid)]">
              {getRecurringPaceText(task.task_type, task.monthly_goal_total) ??
                "Add a monthly target to suggest a weekly pace."}{" "}
              {formatWeekdayLabels(task.weekly_days)
                ? `Good days: ${formatWeekdayLabels(task.weekly_days)}.`
                : "Choose good days if you want the child week view to suggest the best days."}
            </p>
          </>
        ) : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Reward rule
            </span>
            <select
              name="coin_reward_trigger"
              form={formId}
              defaultValue={task.coin_reward_trigger}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
            >
              {allowedRewardTriggers.map((rule) => (
                <option key={rule} value={rule}>
                  {COURSE_COIN_REWARD_TRIGGER_LABELS[rule]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
              Gold Coin reward
            </span>
            <input
              type="number"
              name="gold_coin_reward_amount"
              form={formId}
              min="0"
              max="500"
              defaultValue={task.gold_coin_reward_amount}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="Gold Coins"
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[color:var(--mid)]">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              form={formId}
              defaultChecked={task.is_active}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
            />
            Active in child mode
          </label>
        </div>
      </section>
    </div>
  );
}
