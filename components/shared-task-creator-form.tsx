"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";

import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { FocusBlockMiniTaskBuilder } from "@/components/focus-block-mini-task-builder";
import {
  COURSE_COIN_REWARD_TRIGGER_LABELS,
  COURSE_COIN_REWARD_TRIGGERS,
  SHARED_CREATOR_MODE_LABELS,
  type SharedCreatorMode,
  type SharedTaskPlacementSelection,
  WEEKDAY_OPTIONS,
  type FocusBlockRow,
} from "@/lib/courses/types";

const StructuredLessonBuilder = dynamic(
  () =>
    import("@/components/structured-lesson-builder").then((module) => ({
      default: module.StructuredLessonBuilder,
    })),
  {
    loading: () => (
      <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
        Loading lesson builder…
      </div>
    ),
  },
);

export function SharedTaskCreatorForm({
  action,
  courseId,
  moduleId,
  phaseId,
  placementSelection,
  redirectPath,
  creatorModes,
  focusBlocks,
  showFocusBlockField,
}: {
  action: (formData: FormData) => void | Promise<void>;
  courseId: string;
  moduleId?: string;
  phaseId?: string;
  placementSelection?: SharedTaskPlacementSelection;
  redirectPath: string;
  creatorModes: SharedCreatorMode[];
  focusBlocks: FocusBlockRow[];
  showFocusBlockField: boolean;
}) {
  const [creatorMode, setCreatorMode] = useState<SharedCreatorMode>(creatorModes[0] ?? "checklist");
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleErrorId = useId();
  const formId = useId();
  const placementGroups = placementSelection?.groups ?? [];
  const initialPlacementId = (() => {
    if (phaseId && placementGroups.some((group) => group.id === phaseId)) {
      return phaseId;
    }

    return placementGroups.find((group) => group.moduleOptions.length > 0)?.id ?? placementGroups[0]?.id ?? "";
  })();
  const [selectedPlacementId, setSelectedPlacementId] = useState(initialPlacementId);
  const selectedPlacementGroup =
    placementGroups.find((group) => group.id === selectedPlacementId) ?? placementGroups[0] ?? null;
  const selectedModuleOptions = selectedPlacementGroup?.moduleOptions ?? [];
  const [selectedModuleId, setSelectedModuleId] = useState(
    moduleId && selectedModuleOptions.some((option) => option.id === moduleId)
      ? moduleId
      : selectedModuleOptions[0]?.id ?? "",
  );
  const isLesson = creatorMode === "lesson";
  const isTest = creatorMode === "test";
  const isRecurringDaily = creatorMode === "recurring_daily";
  const isRecurringWeekly = creatorMode === "recurring_weekly";
  const isRecurring = isRecurringDaily || isRecurringWeekly;
  const isFocusBlock = creatorMode === "focus_block";
  const showFocusSelector = showFocusBlockField && !isFocusBlock;
  const taskTypeValue = creatorMode === "focus_block" ? "checklist" : creatorMode;
  const instructionPlaceholder = isFocusBlock
    ? "Current focus or mission"
    : isLesson
      ? "Lesson focus"
      : isTest
        ? "Test directions"
        : isRecurring
          ? "Instructions or reminder"
          : "Instructions";

  const hasPlacementGroups = placementGroups.length > 0;
  const hasSelectedModuleOptions = selectedModuleOptions.length > 0;
  const placementSummaryLabel =
    placementSelection?.summaryLabel ??
    (hasPlacementGroups ? `${placementGroups.length} ${placementSelection?.label.toLowerCase()}${placementGroups.length === 1 ? "" : "s"}` : null);

  return (
    <form id={formId} action={action} className="mt-1 grid gap-2.5">
      <input type="hidden" name="course_id" value={courseId} />
      {moduleId && !hasPlacementGroups ? <input type="hidden" name="module_id" value={moduleId} /> : null}
      {phaseId && !hasPlacementGroups ? <input type="hidden" name="phase_id" value={phaseId} /> : null}
      <input type="hidden" name="redirect_path" value={redirectPath} />
      <input type="hidden" name="creator_scope" value="shared_task_creator" />
      <input type="hidden" name="creator_mode" value={creatorMode} />
      <input type="hidden" name="task_type" value={taskTypeValue} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Add a task
          </p>
          <BuilderInfoHint label="Task composer help">
            Choose the placement, title, and task type first. The form below will only show the fields that matter for that kind of task.
          </BuilderInfoHint>
        </div>
        {placementSummaryLabel ? (
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[color:var(--mid)]">
            {placementSummaryLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasPlacementGroups ? (
          <select
            name="phase_id"
            value={selectedPlacementId}
            onChange={(event) => {
              const nextPlacementId = event.target.value;
              const nextPlacementGroup =
                placementGroups.find((group) => group.id === nextPlacementId) ?? null;
              const nextModuleOptions = nextPlacementGroup?.moduleOptions ?? [];
              const nextModuleId = nextModuleOptions.some((option) => option.id === selectedModuleId)
                ? selectedModuleId
                : nextModuleOptions[0]?.id ?? "";

              setSelectedPlacementId(nextPlacementId);
              setSelectedModuleId(nextModuleId);
            }}
            className="brand-input h-11 min-w-[160px] flex-[1_1_180px] rounded-2xl px-4 text-sm"
            aria-label={placementSelection?.label ?? "Placement"}
          >
            {placementGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        ) : null}
        {hasPlacementGroups ? (
          <select
            name="module_id"
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
            className="brand-input h-11 min-w-[180px] flex-[1_1_220px] rounded-2xl px-4 text-sm"
            aria-label={placementSelection?.moduleLabel ?? "Module"}
            disabled={!hasSelectedModuleOptions}
          >
            {hasSelectedModuleOptions ? (
              selectedModuleOptions.map((moduleOption) => (
                <option key={moduleOption.id} value={moduleOption.id}>
                  {moduleOption.label}
                </option>
              ))
            ) : (
              <option value="">
                {placementSelection?.emptyGroupMessage ?? "Add a module first"}
              </option>
            )}
          </select>
        ) : null}
        <input
          type="text"
          name="title"
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
          className="brand-input h-11 min-w-[200px] flex-[2_1_260px] rounded-2xl px-4 text-sm"
          placeholder={isFocusBlock ? "Focus block title" : "Task title"}
        />
        <select
          name="creator_mode_select"
          value={creatorMode}
          onChange={(event) => setCreatorMode(event.target.value as SharedCreatorMode)}
          className="brand-input h-11 min-w-[170px] flex-[1_1_190px] rounded-2xl px-4 text-sm"
          aria-label="Creator type"
        >
            {creatorModes.map((mode) => (
              <option key={mode} value={mode}>
                {SHARED_CREATOR_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        <button
          type="submit"
          disabled={hasPlacementGroups && !hasSelectedModuleOptions}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
          title={isFocusBlock ? "Add focus block" : "Add task"}
          aria-label={isFocusBlock ? "Add focus block" : "Add task"}
        >
          {isFocusBlock ? "Add focus block" : "Add task"}
        </button>
      </div>
      {hasPlacementGroups && !hasSelectedModuleOptions ? (
        <p className="text-sm text-[color:var(--mid)]">
          {placementSelection?.emptyGroupMessage ?? "Add a module first before placing a task here."}
        </p>
      ) : null}
      {titleError ? (
        <p id={titleErrorId} className="text-sm font-medium text-rose-700">
          {titleError}
        </p>
      ) : null}

      {isFocusBlock ? (
        <>
          <div className="grid gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              Focus details
            </label>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <input
                type="text"
                name="goal"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder={instructionPlaceholder}
              />
              <input
                type="text"
                name="description"
                className="brand-input h-11 rounded-2xl px-4 text-sm"
                placeholder="Optional note for why this focus matters now"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Focus reward
                </p>
              <BuilderInfoHint label="Focus block reward help">
                Keep focus blocks quieter than normal tasks. Reward only when this cycle focus should pay out on completion.
              </BuilderInfoHint>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="coin_reward_trigger"
                className="brand-input h-11 min-w-[220px] flex-[1_1_260px] rounded-2xl px-4 text-sm"
                defaultValue="on_completion"
                aria-label="Focus block reward rule"
              >
                {COURSE_COIN_REWARD_TRIGGERS.map((rule) => (
                  <option key={rule} value={rule}>
                    {COURSE_COIN_REWARD_TRIGGER_LABELS[rule]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                max="500"
                name="gold_coin_reward_amount"
                className="brand-input h-11 min-w-[120px] flex-[0_1_140px] rounded-2xl px-4 text-sm"
                placeholder="Coins"
                defaultValue="1"
              />
            </div>
          </div>
          <div>
            <FocusBlockMiniTaskBuilder compact />
          </div>
        </>
      ) : (
        <>
          <div
            className={
              isLesson
                ? "flex flex-wrap items-center gap-3"
                : "grid gap-1.5"
            }
          >
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              {isLesson
                ? "Lesson focus"
                : isTest
                  ? "Test directions"
                  : isRecurring
                    ? "Instructions or reminder"
                    : "Instructions"}
            </label>
            <input
              type="text"
              name="instructions"
              className={`brand-input h-11 rounded-2xl px-4 text-sm ${
                isLesson ? "min-w-[240px] flex-[1_1_320px]" : ""
              }`}
              placeholder={instructionPlaceholder}
            />
          </div>

          {isLesson ? (
            <div>
              <StructuredLessonBuilder formId={formId} taskTitle="" initialLesson={null} compact />
            </div>
          ) : null}

          {isTest ? (
            <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.08)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Test answers
                </p>
                <BuilderInfoHint label="Test answer help">
                  Add one answer option per line. Only show multiple-choice behaviour when the task is a test.
                </BuilderInfoHint>
              </div>
              <textarea
                name="choice_options_text"
                rows={3}
                className="brand-input rounded-2xl px-4 py-3 text-sm"
                placeholder="Answer choices, one per line"
              />
              <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-[color:var(--mid)]">
                <input
                  type="checkbox"
                  name="allow_multiple_choices"
                  value="true"
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                />
                Allow multiple choices
              </label>
            </div>
          ) : null}

          {isRecurring ? (
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Recurring pace and reward
                </p>
                <BuilderInfoHint label="Recurring pace and reward help">
                  Use the monthly target for the repeating goal. Keep reward in the same row unless weekly day selection needs an extra line.
                </BuilderInfoHint>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  name="monthly_goal_total"
                  className="brand-input h-11 min-w-[200px] flex-[1_1_240px] rounded-2xl px-4 text-sm"
                  placeholder="Monthly target"
                />
                <select
                  name="coin_reward_trigger"
                  className="brand-input h-11 min-w-[220px] flex-[1_1_260px] rounded-2xl px-4 text-sm"
                  defaultValue="on_completion"
                  aria-label="Task reward rule"
                >
                  {COURSE_COIN_REWARD_TRIGGERS.map((rule) => (
                    <option key={rule} value={rule}>
                      {COURSE_COIN_REWARD_TRIGGER_LABELS[rule]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  max="500"
                  name="gold_coin_reward_amount"
                  className="brand-input h-11 min-w-[120px] flex-[0_1_140px] rounded-2xl px-4 text-sm"
                  placeholder="Coins"
                  defaultValue="1"
                />
              </div>
              {isRecurringWeekly ? (
                <div className="flex flex-wrap gap-2">
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
              ) : null}
            </div>
          ) : null}

          {showFocusSelector ? (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Cycle focus
              </p>
              <select
                name="focus_block_id"
                className="brand-input h-11 min-w-[220px] rounded-2xl px-4 text-sm"
                defaultValue=""
              >
                <option value="">No cycle focus</option>
                {focusBlocks.map((focusBlock) => (
                  <option key={focusBlock.id} value={focusBlock.id}>
                    {focusBlock.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {!isRecurring ? (
            <div className="grid gap-1.5 rounded-2xl border border-[var(--border)] bg-[rgba(236,253,245,0.35)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Reward
                </p>
                <BuilderInfoHint label="Task reward help">
                  Progress only keeps the task visible in learning progress without paying out. Use a reward trigger when this task should pay on completion or approval.
                </BuilderInfoHint>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <select
                  name="coin_reward_trigger"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  defaultValue="on_completion"
                  aria-label="Task reward rule"
                >
                  {COURSE_COIN_REWARD_TRIGGERS.map((rule) => (
                    <option key={rule} value={rule}>
                      {COURSE_COIN_REWARD_TRIGGER_LABELS[rule]}
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
              </div>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
