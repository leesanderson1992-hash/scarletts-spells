import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BUILDER_TEXT_BUTTON_CLASS } from "@/app/courses/components/builder-control-styles";
import { ModuleAuthoringShell } from "@/app/courses/components/module-authoring-shell";
import { ProgressBuilderContext } from "@/app/courses/components/progress-builder-context";
import { TaskEditorFields } from "@/app/courses/components/task-editor-fields";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  getActiveChildrenForUser,
  getCourseDetailForParent,
} from "@/lib/courses/queries";
import { normaliseCourseStructureType } from "@/lib/courses/types";
import type { SharedTaskPlacementSelection } from "@/lib/courses/types";
import {
  buildTimedPhaseBackingModuleOptionValue,
  isTimedPhaseBackingModule,
} from "@/lib/courses/timed-phase-modules";
import { createClient } from "@/lib/supabase/server";

import { updateTask } from "../../../../../../module-authoring-actions";

type TaskEditPageProps = {
  params: Promise<{ courseId: string; moduleId: string; taskId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
  }>;
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

export default async function TaskEditPage({
  params,
  searchParams,
}: TaskEditPageProps) {
  const { courseId, moduleId, taskId } = await params;
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
  const detail = await getCourseDetailForParent(supabase, user.id, courseId);

  if (!detail) {
    notFound();
  }

  const selectedModule = detail.modules.find((item) => item.id === moduleId) ?? null;

  if (!selectedModule) {
    notFound();
  }

  const task = selectedModule.tasks.find((item) => item.id === taskId) ?? null;
  if (!task) {
    notFound();
  }

  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie ?? detail.course.child_id,
  );
  const currentPath = `/courses/${courseId}/modules/${moduleId}/tasks/${taskId}/edit`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const moduleBackPath = buildScopedPath(
    `/courses/${courseId}/modules/${moduleId}`,
    selectedChild?.id ?? null,
    mode,
  );
  const courseBackPath = buildScopedPath(`/courses/${courseId}`, selectedChild?.id ?? null, mode);
  const progressBuilderPath = withQuery(courseBackPath, { step: "3" });
  const progressOverviewPath = withQuery(courseBackPath, { step: "5" });
  const moduleEditPath = buildScopedPath(
    `/courses/${courseId}/modules/${moduleId}/edit`,
    selectedChild?.id ?? null,
    mode,
  );
  const formId = `task-edit-form-${task.id}`;
  const courseStructure = normaliseCourseStructureType(detail.course.structure_type);
  const placementSelection: SharedTaskPlacementSelection | null =
    task.task_type === "lesson"
      ? courseStructure === "phased"
        ? {
            label: "Phase",
            moduleLabel: "Module",
            summaryLabel: `${detail.phases.length} phase${detail.phases.length === 1 ? "" : "s"}`,
            emptyGroupMessage: "Add a module to this phase first",
            groups: detail.phases.map((phase, index) => ({
              id: phase.id,
              label: `Phase ${index + 1} · ${phase.title}`,
              moduleOptions: detail.modules
                .filter((module) => module.phase_id === phase.id)
                .map((module) => ({
                  id: module.id,
                  label: module.title,
                })),
            })),
          }
        : {
            label: "Cycle",
            moduleLabel: "Module",
            summaryLabel: `${detail.phases.length} cycle${detail.phases.length === 1 ? "" : "s"}`,
            emptyGroupMessage: "No module choices are available for this cycle yet",
            groups: detail.phases.map((phase, index) => ({
              id: phase.id,
              label: `Cycle ${index + 1}`,
              moduleOptions: [
                {
                  id: buildTimedPhaseBackingModuleOptionValue(phase.id),
                  label: "Cycle tasks",
                },
                ...detail.modules
                  .filter((module) => module.phase_id === phase.id && !isTimedPhaseBackingModule(module))
                  .map((module) => ({
                    id: module.id,
                    label: module.title,
                  })),
              ],
            })),
          }
      : null;
  const initialPlacementId = selectedModule.phase_id;
  const initialPlacementModuleId =
    courseStructure === "timed" && isTimedPhaseBackingModule(selectedModule)
      ? buildTimedPhaseBackingModuleOptionValue(selectedModule.phase_id ?? "")
      : selectedModule.id;

  return (
    <AppShell
      currentPath="/courses"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <ModuleAuthoringShell
        builderContext={
          courseStructure === "phased" ? (
            <ProgressBuilderContext
              courseTitle={detail.course.title}
              moduleTitle={selectedModule.title}
              builderPath={progressBuilderPath}
              overviewPath={progressOverviewPath}
              modulePath={moduleBackPath}
              moduleEditPath={moduleEditPath}
            />
          ) : null
        }
        eyebrow="Edit task"
        title={task.title}
        description="Edit this task by decision type instead of one long form: identity, content, pacing, reward, and child visibility."
        controls={
          <>
            <Link
              href={moduleBackPath}
              className={BUILDER_TEXT_BUTTON_CLASS}
            >
              Back to module
            </Link>
            <Link
              href={courseBackPath}
              className={BUILDER_TEXT_BUTTON_CLASS}
            >
              Back to course
            </Link>
          </>
        }
        error={resolvedSearchParams?.error}
        saved={resolvedSearchParams?.saved}
      >
        <form id={formId} action={updateTask} className="brand-card rounded-3xl p-5">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
          <input type="hidden" name="editor_scope" value="shared_task_creator" />
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
              </svg>
              <span>Save</span>
            </button>
            <Link
              href={moduleBackPath}
              className={`${BUILDER_TEXT_BUTTON_CLASS} gap-2 px-5`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
              </svg>
              Cancel
            </Link>
          </div>
          <TaskEditorFields
            task={task}
            focusBlocks={detail.focusBlocks}
            courseStructure={normaliseCourseStructureType(detail.course.structure_type)}
            formId={formId}
            placementSelection={placementSelection}
            initialPlacementId={initialPlacementId}
            initialModuleId={initialPlacementModuleId}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
              </svg>
              <span>Save</span>
            </button>
            <Link
              href={moduleBackPath}
              className={`${BUILDER_TEXT_BUTTON_CLASS} gap-2 px-5`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
              </svg>
              Cancel
            </Link>
          </div>
        </form>
      </ModuleAuthoringShell>
    </AppShell>
  );
}
