"use client";

import Link from "next/link";
import { useState } from "react";

import { builderIconButtonClass } from "@/app/courses/components/builder-control-styles";
import { FocusBlockMiniTaskBuilder } from "@/components/focus-block-mini-task-builder";
import type {
  FocusBlockRowViewModel,
  ReorderDirection,
} from "@/lib/courses/types";

type FocusBlockModuleRowProps = {
  row: FocusBlockRowViewModel;
  updateAction: (formData: FormData) => void | Promise<void>;
  reorderPending?: boolean;
  onMove?: (direction: ReorderDirection) => void;
  onDelete?: () => void;
};

export function FocusBlockModuleRow({
  row,
  updateAction,
  reorderPending = false,
  onMove,
  onDelete,
}: FocusBlockModuleRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const showDetails = isExpanded || row.isEditing;

  return (
    <>
      <tr className="border-t border-[var(--border)] align-top">
        <td className="py-3 pr-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => setIsSelected(event.target.checked)}
            className="mt-2 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
            aria-label={`Select ${row.title}`}
          />
          {isSelected
            ? row.groupTaskIds.map((taskId) => (
                <input
                  key={taskId}
                  type="hidden"
                  name="task_ids"
                  value={taskId}
                  form="bulk-task-form"
                />
              ))
            : null}
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
              aria-label={showDetails ? `Collapse ${row.title}` : `Expand ${row.title}`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={`h-4.5 w-4.5 fill-current transition-transform ${showDetails ? "rotate-180" : ""}`}
              >
                <path d="M5.7 7.6a1 1 0 0 1 1.4 0L10 10.5l2.9-2.9a1 1 0 1 1 1.4 1.4l-3.6 3.6a1 1 0 0 1-1.4 0L5.7 9a1 1 0 0 1 0-1.4Z" />
              </svg>
            </button>
            <div>
              <p className="text-sm font-semibold text-[color:var(--ink)]">{row.title}</p>
              <p className="mt-1 text-sm text-[color:var(--mid)]">
                {row.goal || "Current focus mission"}
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3">
          <p className="text-sm text-[color:var(--ink)]">Focus block</p>
          <p className="mt-1 text-xs font-medium text-[color:var(--mid)]">{row.statusLabel}</p>
        </td>
        <td className="py-3 pr-3">
          <p className="text-sm text-[color:var(--ink)]">Current mission</p>
          <p className="mt-1 text-xs text-[color:var(--mid)]">{row.planLabel}</p>
        </td>
        <td className="py-3 pr-3">
          <p className="text-sm text-[color:var(--mid)]">{row.rewardLabel}</p>
        </td>
        <td className="py-3 pr-3">
          <p className="text-sm text-[color:var(--mid)]">{row.focusLabel}</p>
        </td>
        <td className="py-3 pr-3">
          <p className="text-sm text-[color:var(--mid)]">{row.description || "No notes"}</p>
        </td>
        <td className="py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Link
              href={row.isEditing ? row.closeEditHref : row.editHref}
              className={builderIconButtonClass()}
              title={row.isEditing ? "Close focus block editing" : `Edit ${row.title}`}
              aria-label={row.isEditing ? "Close focus block editing" : `Edit ${row.title}`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
              </svg>
            </Link>
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
          </div>
        </td>
      </tr>

      {showDetails ? (
        <tr className="border-t border-[var(--border)] bg-[rgba(252,228,244,0.12)]">
          <td className="py-3 px-0" colSpan={8}>
            <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                  Mini Tasks
                </p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">{row.completedSummary}</p>
              </div>

              <div className="grid gap-2">
                {row.miniTasks.map((miniTask, index) => (
                  <div
                    key={miniTask.id}
                    className="grid gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-3 lg:grid-cols-[minmax(0,1.4fr)_180px_180px]"
                  >
                    <div>
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--ink)]">
                          Mini task {index + 1}: {miniTask.title}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--mid)]">
                          {miniTask.instructions || "No instructions"}
                          {miniTask.estimatedMinutes ? ` · ${miniTask.estimatedMinutes} min` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-[color:var(--mid)]">
                      {miniTask.estimatedMinutes ? `${miniTask.estimatedMinutes} min` : "No time set"}
                    </div>
                    <div>
                      <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.12)] px-3 py-1 text-[11px] font-medium text-[color:var(--mid)]">
                        {miniTask.stateLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {row.isEditing ? (
                <form action={updateAction} className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.12)] px-3 py-3">
                  <input type="hidden" name="focus_block_id" value={row.id} />
                  <input type="hidden" name="redirect_path" value={row.redirectPath} />
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <input
                      type="text"
                      name="title"
                      defaultValue={row.title}
                      className="brand-input h-10 rounded-2xl px-3 text-sm"
                      placeholder="Focus block title"
                      aria-label={`Focus block title for ${row.title}`}
                    />
                    <input
                      type="text"
                      name="goal"
                      defaultValue={row.goal ?? ""}
                      className="brand-input h-10 rounded-2xl px-3 text-sm"
                      placeholder="Current mission"
                      aria-label={`Goal for ${row.title}`}
                    />
                  </div>
                  <textarea
                    name="description"
                    defaultValue={row.description ?? ""}
                    rows={3}
                    className="brand-input rounded-2xl px-3 py-2 text-sm"
                    placeholder="Optional notes for this focus block"
                    aria-label={`Description for ${row.title}`}
                  />
                  <FocusBlockMiniTaskBuilder
                    initialTasks={row.miniTasks.map((miniTask) => ({
                      id: miniTask.id,
                      title: miniTask.title,
                      instructions: miniTask.instructions ?? "",
                      estimated_minutes: miniTask.estimatedMinutes?.toString() ?? "",
                    }))}
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:brightness-105"
                    >
                      Save focus block
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
