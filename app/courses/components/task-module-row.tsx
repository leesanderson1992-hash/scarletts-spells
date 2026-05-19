"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { builderIconButtonClass } from "@/app/courses/components/builder-control-styles";
import { StructuredLessonBuilder } from "@/components/structured-lesson-builder";
import {
  COURSE_COIN_REWARD_TRIGGER_LABELS,
  COURSE_COIN_REWARD_TRIGGERS,
  COURSE_TASK_TYPE_LABELS,
  getSharedCreatorTaskTypes,
  type ReorderDirection,
  type TaskRowViewModel,
  WEEKDAY_OPTIONS,
} from "@/lib/courses/types";

type TaskModuleRowProps = {
  row: TaskRowViewModel;
  showFocusBlockField: boolean;
  reorderPending?: boolean;
  onMove?: (direction: ReorderDirection) => void;
  onDelete?: () => void;
};

export function TaskModuleRow({
  row,
  showFocusBlockField,
  reorderPending = false,
  onMove,
  onDelete,
}: TaskModuleRowProps) {
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleErrorId = useId();

  return (
    <tr className="border-t border-[var(--border)] align-top">
      <td className="py-3 pr-2">
        <input
          type="checkbox"
          name="task_ids"
          value={row.id}
          form="bulk-task-form"
          className="mt-2 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
          aria-label={`Select ${row.title}`}
        />
      </td>
      <td className="py-3 pr-3">
        {row.isEditing ? (
          <>
            <input type="hidden" name="task_id" value={row.id} form={row.formId} />
            <input type="hidden" name="redirect_path" value={row.stopEditingHref} form={row.formId} />
            <input type="hidden" name="editor_scope" value="shared_task_creator" form={row.formId} />
            <input
              type="text"
              name="title"
              form={row.formId}
              defaultValue={row.title}
              required
              aria-invalid={titleError ? "true" : undefined}
              aria-describedby={titleError ? titleErrorId : undefined}
              onInvalid={(event) => {
                event.currentTarget.setCustomValidity("Please enter a task title.");
                setTitleError("Please enter a task title.");
              }}
              onInput={(event) => {
                event.currentTarget.setCustomValidity("");
                if (event.currentTarget.value.trim()) {
                  setTitleError(null);
                }
              }}
              className="brand-input h-10 w-full rounded-2xl px-3 text-sm font-semibold"
              aria-label={`Task title for ${row.title}`}
            />
            {titleError ? (
              <p id={titleErrorId} className="mt-2 text-sm font-medium text-rose-700">
                {titleError}
              </p>
            ) : null}
            <textarea
              name="instructions"
              form={row.formId}
              defaultValue={row.instructions ?? ""}
              rows={2}
              className="brand-input mt-2 w-full rounded-2xl px-3 py-2 text-sm"
              aria-label={`Instructions for ${row.title}`}
              placeholder="Instructions"
            />
            {row.taskType === "lesson" || row.taskType === "test" ? (
              <div className="mt-2">
                <StructuredLessonBuilder
                  formId={row.formId}
                  taskTitle={row.title}
                  initialLesson={row.lessonSchema ?? null}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div>
            <p className="text-sm font-semibold text-[color:var(--ink)]">{row.title}</p>
            {row.instructions ? (
              <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">{row.instructions}</p>
            ) : (
              <p className="mt-1 text-sm text-[color:var(--mid)]">No instructions</p>
            )}
            {row.lessonSchema ? (
              <p className="mt-1 text-xs text-[color:var(--mid)]">Lesson content added</p>
            ) : null}
          </div>
        )}
      </td>
      <td className="py-3 pr-3">
        {row.isEditing ? (
          <>
            <select
              name="task_type"
              form={row.formId}
              defaultValue={row.taskType}
              className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
              aria-label={`Task type for ${row.title}`}
            >
              {getSharedCreatorTaskTypes(row.taskType).map((taskType) => (
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
                form={row.formId}
                defaultChecked={row.isActive}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
              />
              Active
            </label>
          </>
        ) : (
          <>
            <p className="text-sm text-[color:var(--ink)]">{row.taskTypeLabel}</p>
            <p className="mt-1 text-xs font-medium text-[color:var(--mid)]">
              {row.isActive ? "Active" : "Paused"}
            </p>
          </>
        )}
      </td>
      <td className="py-3 pr-3">
        {row.isEditing ? (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Time
              </span>
              <input
                type="number"
                name="estimated_minutes"
                form={row.formId}
                min="1"
                max="240"
                defaultValue={row.estimatedMinutes ?? ""}
                className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                placeholder="Minutes"
                aria-label={`Estimated minutes for ${row.title}`}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Monthly target
              </span>
              <input
                type="number"
                name="monthly_goal_total"
                form={row.formId}
                min="1"
                max="10000"
                defaultValue={row.monthlyGoalTotal ?? ""}
                className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                placeholder="Monthly target"
                aria-label={`Monthly goal for ${row.title}`}
              />
            </label>
            {row.taskType === "recurring_daily" ? (
              <p className="text-xs text-[color:var(--mid)]">
                Child sees this as a daily habit.{" "}
                {row.recurringPaceHint ?? "Add a monthly target to suggest a daily pace."}
              </p>
            ) : null}
            {row.taskType === "recurring_weekly" ? (
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
                        form={row.formId}
                        defaultChecked={row.weeklyDays?.includes(day.value)}
                        className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--scarlett)]"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-[color:var(--mid)]">
                  Child sees this as a weekly goal.{" "}
                  {row.recurringPaceHint ?? "Add a monthly target to suggest a weekly pace."}{" "}
                  {row.weekdaySummary
                    ? `Good days: ${row.weekdaySummary}.`
                    : "Choose good days if you want the child week view to suggest the best days."}
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-[color:var(--ink)]">{row.planSummary.heading}</p>
            <p className="mt-1 text-xs text-[color:var(--mid)]">{row.planSummary.detail}</p>
          </>
        )}
      </td>
      <td className="py-3 pr-3">
        {row.isEditing ? (
          <div className="grid gap-2">
            <select
              name="coin_reward_trigger"
              form={row.formId}
              defaultValue={row.coinRewardTrigger}
              className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
              aria-label={`Task reward rule for ${row.title}`}
            >
              {COURSE_COIN_REWARD_TRIGGERS.map((rule) => (
                <option key={rule} value={rule}>
                  {COURSE_COIN_REWARD_TRIGGER_LABELS[rule]}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="gold_coin_reward_amount"
              form={row.formId}
              min="0"
              max="500"
              defaultValue={row.goldCoinRewardAmount}
              className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
              placeholder="Gold Coins"
              aria-label={`Gold Coin reward for ${row.title}`}
            />
          </div>
        ) : (
          <p className="text-sm text-[color:var(--mid)]">{row.rewardSummary}</p>
        )}
      </td>
      {showFocusBlockField ? (
        <td className="py-3 pr-3">
          {row.isEditing ? (
            <select
              name="focus_block_id"
              form={row.formId}
              defaultValue={row.selectedFocusBlockId ?? ""}
              className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
              aria-label={`Focus block for ${row.title}`}
            >
              <option value="">No focus block</option>
              {row.focusBlockOptions?.map((focusBlock) => (
                <option key={focusBlock.id} value={focusBlock.id}>
                  {focusBlock.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-[color:var(--mid)]">{row.focusBlockLabel ?? "No focus block"}</p>
          )}
        </td>
      ) : null}
      <td className="py-3 pr-3">
        {row.isEditing ? (
          <div className="grid gap-2">
            <textarea
              name="writing_prompt"
              form={row.formId}
              defaultValue={row.writingPrompt ?? ""}
              rows={3}
              className="brand-input w-full rounded-2xl px-3 py-2 text-sm"
              aria-label={`Writing prompt for ${row.title}`}
              placeholder="Prompt"
            />
            <textarea
              name="choice_options_text"
              form={row.formId}
              defaultValue={row.choiceOptionsText}
              rows={3}
              className="brand-input w-full rounded-2xl px-3 py-2 text-sm"
              aria-label={`Choice options for ${row.title}`}
              placeholder="Optional test choices, one per line"
            />
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[color:var(--mid)]">
              <input
                type="checkbox"
                name="allow_multiple_choices"
                value="true"
                form={row.formId}
                defaultChecked={row.allowMultipleChoices}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
              />
              Allow multiple choices
            </label>
          </div>
        ) : (
          <div className="grid gap-1">
            <p className="text-sm text-[color:var(--mid)]">{row.notesLabel}</p>
            {row.notesDetail ? <p className="text-xs text-[color:var(--mid)]">{row.notesDetail}</p> : null}
          </div>
        )}
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {row.isEditing ? (
            <>
              <button
                type="submit"
                form={row.formId}
                className={builderIconButtonClass()}
                title={`Save ${row.title}`}
                aria-label={`Save ${row.title}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
                </svg>
              </button>
              <Link
                href={row.stopEditingHref}
                className={builderIconButtonClass()}
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
                type="button"
                onClick={() => onMove?.("up")}
                disabled={reorderPending || !row.canMoveUp}
                className={builderIconButtonClass()}
                title={`Move ${row.title} up`}
                aria-label={`Move ${row.title} up`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M10 4.6 5.7 8.9a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.4L11 4.6V17a1 1 0 1 1-2 0V4.6Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onMove?.("down")}
                disabled={reorderPending || !row.canMoveDown}
                className={builderIconButtonClass()}
                title={`Move ${row.title} down`}
                aria-label={`Move ${row.title} down`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
                </svg>
              </button>
              {row.canDuplicate ? (
                <button
                  type="submit"
                  form={row.duplicateFormId}
                  className={builderIconButtonClass()}
                  title={`Duplicate ${row.title}`}
                  aria-label={`Duplicate ${row.title}`}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M6 2a2 2 0 0 0-2 2v8h2V4h8V2H6Zm3 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9Zm0 2h7v8H9V8Z" />
                  </svg>
                </button>
              ) : null}
              <Link
                href={row.fullEditHref}
                className={builderIconButtonClass()}
                title={`Edit ${row.title}`}
                aria-label={`Edit ${row.title}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={onDelete}
                disabled={reorderPending}
                className={builderIconButtonClass("destructive")}
                title={`Delete ${row.title} forever`}
                aria-label={`Delete ${row.title} forever`}
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
}
