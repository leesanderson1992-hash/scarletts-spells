import {
  COURSE_TASK_TYPE_LABELS,
  PARENT_COURSE_TASK_TYPES,
  TASK_GOLD_BAR_RULE_LABELS,
  TASK_GOLD_BAR_RULES,
  WEEKDAY_OPTIONS,
  type CourseTaskRow,
  type FocusBlockRow,
} from "@/lib/courses/types";

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
  formId,
}: {
  task: CourseTaskRow;
  focusBlocks: FocusBlockRow[];
  formId: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
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
            {PARENT_COURSE_TASK_TYPES.map((taskType) => (
              <option key={taskType} value={taskType}>
                {COURSE_TASK_TYPE_LABELS[taskType]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1.5">
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

      <label className="grid gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
          Lesson or test HTML
        </span>
        <textarea
          name="content_html"
          form={formId}
          defaultValue={task.content_html ?? ""}
          rows={12}
          className="brand-input rounded-2xl px-4 py-3 font-mono text-xs"
          placeholder="Lesson or test content (simple HTML allowed)"
        />
      </label>

      <p className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-4 py-3 text-xs leading-6 text-[color:var(--mid)]">
        Use real form fields like <code>&lt;textarea&gt;</code>, <code>&lt;input&gt;</code>,{" "}
        <code>&lt;select&gt;</code>, or radio/checkbox inputs if you want answers tracked.
        Quiz scores are captured when the lesson updates <code>#score-num</code> and{" "}
        <code>#score-msg</code>.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
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

      <label className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--mid)]">
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

      <div className="grid gap-4 lg:grid-cols-3">
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
            max="500"
            defaultValue={task.monthly_goal_total ?? ""}
            className="brand-input h-11 rounded-2xl px-4 text-sm"
            placeholder="Monthly target"
          />
        </label>
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
      </div>

      {task.task_type === "recurring_daily" ? (
        <p className="text-xs text-[color:var(--mid)]">
          Child sees this as a daily habit.{" "}
          {getRecurringPaceText(task.task_type, task.monthly_goal_total) ??
            "Add a monthly target to suggest a daily pace."}
        </p>
      ) : null}
      {task.task_type === "recurring_weekly" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
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
          <p className="text-xs text-[color:var(--mid)]">
            Child sees this as a weekly goal.{" "}
            {getRecurringPaceText(task.task_type, task.monthly_goal_total) ??
              "Add a monthly target to suggest a weekly pace."}{" "}
            {formatWeekdayLabels(task.weekly_days)
              ? `Good days: ${formatWeekdayLabels(task.weekly_days)}.`
              : "Choose good days if you want the child week view to suggest the best days."}
          </p>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
            Reward rule
          </span>
          <select
            name="gold_bar_rule"
            form={formId}
            defaultValue={task.gold_bar_rule}
            className="brand-input h-11 rounded-2xl px-4 text-sm"
          >
            {TASK_GOLD_BAR_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {TASK_GOLD_BAR_RULE_LABELS[rule]}
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
    </div>
  );
}
