"use client";

import Link from "next/link";
import { useState } from "react";

import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { builderIconButtonClass } from "@/app/courses/components/builder-control-styles";
import type {
  ReorderActionResult,
  ReorderDirection,
  StepThreeTaskTableRowViewModel,
  StepThreeTaskTableViewModel,
} from "@/lib/courses/types";
import { useOptimisticReorderList } from "@/app/courses/components/use-optimistic-reorder-list";

type StepThreeTaskTableProps = {
  model: StepThreeTaskTableViewModel;
  courseId: string;
  redirectPath: string;
  reorderTaskAction: (input: {
    taskId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  deleteTaskAction: (formData: FormData) => void | Promise<void>;
  reorderFocusBlockAction: (input: {
    focusBlockId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  deleteFocusBlockAction: (formData: FormData) => void | Promise<void>;
};

function normaliseRows(rows: StepThreeTaskTableRowViewModel[]) {
  return rows.map((row, index) => ({
    ...row,
    canMoveUp: index > 0,
    canMoveDown: index < rows.length - 1,
  }));
}

function ReorderableTaskRows({
  rows,
  courseId,
  redirectPath,
  reorderTaskAction,
  deleteTaskAction,
  reorderFocusBlockAction,
  deleteFocusBlockAction,
}: {
  rows: StepThreeTaskTableRowViewModel[];
  courseId: string;
  redirectPath: string;
  reorderTaskAction: StepThreeTaskTableProps["reorderTaskAction"];
  deleteTaskAction: StepThreeTaskTableProps["deleteTaskAction"];
  reorderFocusBlockAction: StepThreeTaskTableProps["reorderFocusBlockAction"];
  deleteFocusBlockAction: StepThreeTaskTableProps["deleteFocusBlockAction"];
}) {
  const { items, error, isPending, moveItem } = useOptimisticReorderList({
    initialItems: rows,
    getId: (row) => row.id,
    normaliseItems: normaliseRows,
  });

  return (
    <>
      {error ? (
        <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <table className="min-w-full text-left">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            <th className="pb-2 pr-4">Task title</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Reward</th>
            <th className="pb-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)] align-middle">
              <td className="py-3 pr-4">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{row.title}</p>
              </td>
              <td className="py-3 pr-4 text-sm text-[color:var(--mid)]">{row.typeLabel}</td>
              <td className="py-3 pr-4 text-sm text-[color:var(--mid)]">{row.rewardAmount}</td>
              <td className="py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={row.editHref}
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
                    disabled={isPending || !row.canMoveUp}
                    onClick={() =>
                      moveItem({
                        itemId: row.id,
                        direction: "up",
                        request: () =>
                          row.kind === "focus_block"
                            ? reorderFocusBlockAction({ focusBlockId: row.id, direction: "up" })
                            : reorderTaskAction({ taskId: row.id, direction: "up" }),
                      })
                    }
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
                    disabled={isPending || !row.canMoveDown}
                    onClick={() =>
                      moveItem({
                        itemId: row.id,
                        direction: "down",
                        request: () =>
                          row.kind === "focus_block"
                            ? reorderFocusBlockAction({ focusBlockId: row.id, direction: "down" })
                            : reorderTaskAction({ taskId: row.id, direction: "down" }),
                      })
                    }
                    className={builderIconButtonClass()}
                    title={`Move ${row.title} down`}
                    aria-label={`Move ${row.title} down`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
                    </svg>
                  </button>

                  <form action={row.kind === "focus_block" ? deleteFocusBlockAction : deleteTaskAction}>
                    <input
                      type="hidden"
                      name={row.kind === "focus_block" ? "focus_block_id" : "task_id"}
                      value={row.id}
                    />
                    {row.kind === "focus_block" ? (
                      <input type="hidden" name="course_id" value={courseId} />
                    ) : null}
                    <input type="hidden" name="redirect_path" value={redirectPath} />
                    <button
                      type="submit"
                      className={builderIconButtonClass("destructive")}
                      title={`Delete ${row.title} forever`}
                      aria-label={`Delete ${row.title} forever`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                        <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                      </svg>
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function StepThreeTaskTable({
  model,
  courseId,
  redirectPath,
  reorderTaskAction,
  deleteTaskAction,
  reorderFocusBlockAction,
  deleteFocusBlockAction,
}: StepThreeTaskTableProps) {
  const groups = model.groups;
  const initialGroup =
    groups.find((group) => group.modules.some((module) => module.rows.length > 0)) ??
    groups.find((group) => group.modules.length > 0) ??
    groups[0] ??
    null;
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroup?.id ?? "");
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? initialGroup;
  const availableModules = selectedGroup?.modules ?? [];
  const initialModule =
    availableModules.find((module) => module.rows.length > 0) ?? availableModules[0] ?? null;
  const [selectedModuleId, setSelectedModuleId] = useState(initialModule?.id ?? "");
  const selectedModule =
    availableModules.find((module) => module.id === selectedModuleId) ?? initialModule;
  const rows = selectedModule?.rows ?? [];

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
        {model.emptyGroupMessage}
      </p>
    );
  }

  return (
    <section className="brand-card overflow-hidden rounded-3xl p-0">
      <div className="border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Task overview
              </p>
              <BuilderInfoHint label="Task overview help">
                Filter by placement to confirm tasks landed in the right module, then use the compact row actions for fast edits, reordering, or deletion.
              </BuilderInfoHint>
            </div>
          </div>
          {model.summaryLabel ? (
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[color:var(--mid)]">
              {model.summaryLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selectedGroup?.id ?? ""}
            onChange={(event) => {
              const nextGroup = groups.find((group) => group.id === event.target.value) ?? groups[0] ?? null;
              const nextModules = nextGroup?.modules ?? [];
              const nextModule = nextModules.find((module) => module.rows.length > 0) ?? nextModules[0] ?? null;

              setSelectedGroupId(nextGroup?.id ?? "");
              setSelectedModuleId(nextModule?.id ?? "");
            }}
            className="brand-input h-11 min-w-[180px] flex-[1_1_220px] rounded-2xl px-4 text-sm"
            aria-label={model.groupLabel}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>

          <select
            value={selectedModule?.id ?? ""}
            onChange={(event) => setSelectedModuleId(event.target.value)}
            className="brand-input h-11 min-w-[180px] flex-[1_1_220px] rounded-2xl px-4 text-sm"
            aria-label={model.moduleLabel}
            disabled={availableModules.length === 0}
          >
            {availableModules.length > 0 ? (
              availableModules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.title}
                </option>
              ))
            ) : (
              <option value="">{model.emptyModuleMessage}</option>
            )}
          </select>
        </div>

        {selectedGroup || selectedModule ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--mid)]">
            {selectedGroup?.detail ? <span>{selectedGroup.detail}</span> : null}
            {selectedModule ? (
              <>
                <span>{selectedModule.taskCount} task{selectedModule.taskCount === 1 ? "" : "s"}</span>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium">
                  {selectedModule.statusLabel}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto px-4 py-3">
          <ReorderableTaskRows
            key={`${selectedModule?.id ?? "empty"}:${rows
              .map((row) => `${row.id}:${row.title}:${row.rewardAmount}`)
              .join("|")}`}
            rows={rows}
            courseId={courseId}
            redirectPath={redirectPath}
            reorderTaskAction={reorderTaskAction}
            deleteTaskAction={deleteTaskAction}
            reorderFocusBlockAction={reorderFocusBlockAction}
            deleteFocusBlockAction={deleteFocusBlockAction}
          />
        </div>
      ) : (
        <div className="px-4 py-4 text-sm text-[color:var(--mid)]">{model.emptyRowMessage}</div>
      )}
    </section>
  );
}
