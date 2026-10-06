"use client";

import Link from "next/link";

import type {
  ReorderActionResult,
  ReorderDirection,
} from "@/lib/courses/types";
import { useOptimisticReorderList } from "@/app/courses/components/use-optimistic-reorder-list";

type ModuleCardViewModel = {
  id: string;
  title: string;
  description: string | null;
  taskCount: number;
  isComplete: boolean;
  isEditing: boolean;
  editHref: string;
  openHref: string;
  cancelEditHref: string;
};

type PhaseCardViewModel = {
  id: string;
  title: string;
  description: string | null;
  checkpointCount: number;
  modules: ModuleCardViewModel[];
};

type PhasedModuleOrderListProps = {
  phases: PhaseCardViewModel[];
  currentWizardPath: string;
  updateModuleAction: (formData: FormData) => void | Promise<void>;
  deleteModuleAction: (formData: FormData) => void | Promise<void>;
  reorderModuleAction: (input: {
    moduleId: string;
    direction: ReorderDirection;
  }) => Promise<ReorderActionResult>;
};

function PhaseModuleCards({
  phase,
  currentWizardPath,
  updateModuleAction,
  deleteModuleAction,
  reorderModuleAction,
}: {
  phase: PhaseCardViewModel;
  currentWizardPath: string;
  updateModuleAction: PhasedModuleOrderListProps["updateModuleAction"];
  deleteModuleAction: PhasedModuleOrderListProps["deleteModuleAction"];
  reorderModuleAction: PhasedModuleOrderListProps["reorderModuleAction"];
}) {
  const { items, error, isPending, moveItem } = useOptimisticReorderList({
    initialItems: phase.modules,
    getId: (module) => module.id,
  });

  return (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[color:var(--ink)]">{phase.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
            {items.length} module{items.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[color:var(--mid)]">
            {phase.checkpointCount} review point{phase.checkpointCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {phase.description ? (
        <p className="mt-1 text-sm text-[color:var(--mid)]">{phase.description}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {items.length > 0 ? (
          items.map((module, moduleIndex) => {
            const formId = `phase-module-form-${module.id}`;
            const deleteFormId = `phase-module-delete-form-${module.id}`;

            return (
              <div
                key={module.id}
                className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{module.title}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          module.isComplete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-[var(--border)] bg-white text-[color:var(--mid)]"
                        }`}
                      >
                        {module.isComplete ? "Complete" : "In progress"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--mid)]">
                      {module.taskCount} task{module.taskCount === 1 ? "" : "s"}
                    </p>
                    {module.description ? (
                      <p className="mt-2 text-sm text-[color:var(--mid)]">{module.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending || moduleIndex === 0}
                      onClick={() =>
                        moveItem({
                          itemId: module.id,
                          direction: "up",
                          request: () => reorderModuleAction({ moduleId: module.id, direction: "up" }),
                        })
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                      title={`Move ${module.title} up`}
                      aria-label={`Move ${module.title} up`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M10 4.6 5.7 8.9a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 1.4 0l5 5a1 1 0 1 1-1.4 1.4L11 4.6V17a1 1 0 1 1-2 0V4.6Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={isPending || moduleIndex === items.length - 1}
                      onClick={() =>
                        moveItem({
                          itemId: module.id,
                          direction: "down",
                          request: () => reorderModuleAction({ moduleId: module.id, direction: "down" }),
                        })
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition enabled:hover:text-[var(--scarlett)] disabled:cursor-not-allowed disabled:opacity-35"
                      title={`Move ${module.title} down`}
                      aria-label={`Move ${module.title} down`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M10 15.4 14.3 11.1a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L9 15.4V3a1 1 0 1 1 2 0v12.4Z" />
                      </svg>
                    </button>
                    <Link
                      href={module.editHref}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                      title={`Edit ${module.title}`}
                      aria-label={`Edit ${module.title}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                      </svg>
                    </Link>
                    <button
                      type="submit"
                      form={deleteFormId}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                      title={`Delete empty module ${module.title}`}
                      aria-label={`Delete empty module ${module.title}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                      </svg>
                    </button>
                    <Link
                      href={module.openHref}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--scarlett)] px-3 text-xs font-medium text-white transition hover:brightness-105"
                    >
                      Open
                    </Link>
                  </div>
                </div>

                {module.isEditing ? (
                  <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                    <input type="hidden" name="module_id" value={module.id} form={formId} />
                    <input type="hidden" name="redirect_path" value={currentWizardPath} form={formId} />
                    <input
                      type="text"
                      name="title"
                      form={formId}
                      defaultValue={module.title}
                      className="brand-input h-10 rounded-2xl px-3 text-sm"
                      aria-label={`Module title for ${module.title}`}
                    />
                    <input
                      type="text"
                      name="description"
                      form={formId}
                      defaultValue={module.description ?? ""}
                      className="brand-input h-10 rounded-2xl px-3 text-sm"
                      aria-label={`Description for ${module.title}`}
                      placeholder="What sits inside this module?"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        form={formId}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:brightness-105"
                      >
                        Save
                      </button>
                      <Link
                        href={module.cancelEditHref}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title="Stop editing"
                        aria-label="Stop editing"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                          <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                ) : null}

                <form id={formId} action={updateModuleAction} className="hidden" />
                <form id={deleteFormId} action={deleteModuleAction} className="hidden">
                  <input type="hidden" name="module_id" value={module.id} />
                  <input type="hidden" name="redirect_path" value={currentWizardPath} />
                </form>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-[color:var(--mid)]">No modules in this phase yet.</p>
        )}
      </div>
    </div>
  );
}

export function PhasedModuleOrderList({
  phases,
  currentWizardPath,
  updateModuleAction,
  deleteModuleAction,
  reorderModuleAction,
}: PhasedModuleOrderListProps) {
  return (
    <div className="mt-3 grid gap-3">
      {phases.map((phase) => (
        <PhaseModuleCards
          key={`${phase.id}:${phase.modules
            .map((module) => `${module.id}:${module.title}:${module.description ?? ""}`)
            .join("|")}`}
          phase={phase}
          currentWizardPath={currentWizardPath}
          updateModuleAction={updateModuleAction}
          deleteModuleAction={deleteModuleAction}
          reorderModuleAction={reorderModuleAction}
        />
      ))}
    </div>
  );
}
