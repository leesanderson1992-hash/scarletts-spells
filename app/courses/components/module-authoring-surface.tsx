"use client";

import Link from "next/link";

import { FocusBlockModuleRow } from "@/components/focus-block-module-row";
import { SharedTaskCreatorForm } from "@/components/shared-task-creator-form";
import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";
import { builderIconButtonClass } from "@/app/courses/components/builder-control-styles";
import { TaskModuleRow } from "@/app/courses/components/task-module-row";
import { useOptimisticReorderList } from "@/app/courses/components/use-optimistic-reorder-list";
import {
  type DeleteActionResult,
  type FocusBlockRow,
  type ModuleAuthoringViewModel,
  type ReorderActionResult,
  type ReorderDirection,
  type SharedCreatorMode,
  type AuthoringUnitViewModel,
} from "@/lib/courses/types";

type ModuleAuthoringSurfaceProps = {
  model: ModuleAuthoringViewModel;
  courseId: string;
  moduleId: string;
  redirectPath: string;
  creatorModes: SharedCreatorMode[];
  focusBlocks: FocusBlockRow[];
  createTaskAction: (formData: FormData) => void | Promise<void>;
  bulkUpdateTasksAction: (formData: FormData) => void | Promise<void>;
  updateTaskAction: (formData: FormData) => void | Promise<void>;
  deleteTaskAction: (input: { taskId: string }) => Promise<DeleteActionResult>;
  duplicateTaskAction: (formData: FormData) => void | Promise<void>;
  reorderTaskAction: (input: {
    taskId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
  updateFocusBlockAction: (formData: FormData) => void | Promise<void>;
  deleteFocusBlockAction: (input: { focusBlockId: string }) => Promise<DeleteActionResult>;
  reorderFocusBlockAction: (input: {
    focusBlockId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
};

function normaliseAuthoringUnits(units: AuthoringUnitViewModel[]) {
  return units.map((unit, index) =>
    unit.kind === "focus_block" || unit.kind === "task"
      ? {
          ...unit,
          canMoveUp: index > 0,
          canMoveDown: index < units.length - 1,
        }
      : unit,
  );
}

export function ModuleAuthoringSurface({
  model,
  courseId,
  moduleId,
  redirectPath,
  creatorModes,
  focusBlocks,
  createTaskAction,
  bulkUpdateTasksAction,
  updateTaskAction,
  deleteTaskAction,
  duplicateTaskAction,
  reorderTaskAction,
  updateFocusBlockAction,
  deleteFocusBlockAction,
  reorderFocusBlockAction,
}: ModuleAuthoringSurfaceProps) {
  const { items: orderedUnits, error, isPending, moveItem, removeItem } = useOptimisticReorderList({
    initialItems: model.units,
    getId: (unit) => unit.id,
    normaliseItems: normaliseAuthoringUnits,
  });

  return (
    <>
      <section className="brand-card overflow-visible rounded-3xl p-0">
        <div className="sticky top-3 z-20 border-b border-[var(--border)] bg-[rgba(255,255,255,0.94)] px-4 py-2.5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Tasks
              </p>
              <BuilderInfoHint label="Task table help">
                Tick shows a task in child mode, and the bin removes it forever.
              </BuilderInfoHint>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                form="bulk-task-form"
                name="bulk_action"
                value="activate"
                className={builderIconButtonClass("success", "sm")}
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
                value="delete"
                className={builderIconButtonClass("destructive", "sm")}
                title="Delete selected tasks forever"
                aria-label="Delete selected tasks forever"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                  <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                </svg>
              </button>
              {!model.isAddingTask ? (
                <Link
                  href={model.addTaskHref}
                  className={builderIconButtonClass("accent", "sm")}
                  title="Add task"
                  aria-label="Add task"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                    <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                  </svg>
                </Link>
              ) : (
                <Link
                  href={model.closeAddTaskHref}
                  className={builderIconButtonClass("neutral", "sm")}
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
          {model.isAddingTask ? (
            <div className="mt-3 rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,255,255,0.92)] px-3 py-3">
              <SharedTaskCreatorForm
                action={createTaskAction}
                courseId={courseId}
                moduleId={moduleId}
                redirectPath={redirectPath}
                creatorModes={creatorModes}
                focusBlocks={focusBlocks}
                showFocusBlockField={model.showFocusBlockField}
              />
            </div>
          ) : null}

          {model.units.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              {error ? (
                <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}
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
                    {model.showFocusBlockField ? <th className="pb-2 pr-3">Focus</th> : null}
                    <th className="pb-2 pr-3">Notes</th>
                    <th className="pb-2 text-right">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedUnits.map((unit) =>
                    unit.kind === "focus_block" ? (
                      <FocusBlockModuleRow
                        key={unit.id}
                        row={unit}
                        updateAction={updateFocusBlockAction}
                        reorderPending={isPending}
                        onDelete={() =>
                          removeItem({
                            itemId: unit.id,
                            request: () =>
                              deleteFocusBlockAction({
                                focusBlockId: unit.id,
                              }),
                          })
                        }
                        onMove={(direction) =>
                          moveItem({
                            itemId: unit.id,
                            direction,
                            request: () =>
                              reorderFocusBlockAction({
                                focusBlockId: unit.id,
                                direction,
                              }),
                          })
                        }
                      />
                    ) : (
                      <TaskModuleRow
                        key={unit.id}
                        row={unit}
                        showFocusBlockField={model.showFocusBlockField}
                        reorderPending={isPending}
                        onDelete={() =>
                          removeItem({
                            itemId: unit.id,
                            request: () =>
                              deleteTaskAction({
                                taskId: unit.id,
                              }),
                          })
                        }
                        onMove={(direction) =>
                          moveItem({
                            itemId: unit.id,
                            direction,
                            request: () =>
                              reorderTaskAction({
                                taskId: unit.id,
                                direction,
                              }),
                          })
                        }
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <form id="bulk-task-form" action={bulkUpdateTasksAction} className="hidden">
          <input type="hidden" name="redirect_path" value={redirectPath} />
        </form>

        {model.units.map((unit) =>
          unit.kind === "task" ? (
            <div key={`task-forms-${unit.id}`}>
              <form id={unit.formId} action={updateTaskAction} className="hidden" />
              <form id={unit.duplicateFormId} action={duplicateTaskAction} className="hidden">
                <input type="hidden" name="task_id" value={unit.id} />
                <input type="hidden" name="redirect_path" value={redirectPath} />
              </form>
            </div>
          ) : (
            <div key={`focus-block-forms-${unit.id}`} className="hidden" />
          ),
        )}

        {model.units.length === 0 ? (
          <div className="px-4 py-4 text-sm text-[color:var(--mid)]">No tasks yet in this module.</div>
        ) : null}
      </section>
    </>
  );
}
