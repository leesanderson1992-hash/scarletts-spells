import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ModuleAuthoringSurface } from "@/app/courses/components/module-authoring-surface";
import { ModuleAuthoringShell } from "@/app/courses/components/module-authoring-shell";
import { buildModuleAuthoringViewModel } from "@/app/courses/components/module-authoring-view-model";
import { ProgressBuilderContext } from "@/app/courses/components/progress-builder-context";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  getActiveChildrenForUser,
  getCourseActivityForChild,
  getModuleDetailForParent,
} from "@/lib/courses/queries";
import {
  canCourseStructureUseFocusBlocks,
  getSharedCreatorModes,
  normaliseCourseStructureType,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";
import {
  reorderFocusBlockAction,
  reorderTaskAction,
} from "@/app/courses/reorder-actions";

import {
  bulkUpdateTasks,
  createTask,
  deleteFocusBlockInlineAction,
  deleteTaskInlineAction,
  duplicateTask,
  updateFocusBlock,
  updateTask,
} from "../../../module-authoring-actions";

type ModuleDetailPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    add?: string;
    edit?: string;
    editFocus?: string;
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
  const childActivity = selectedChild
    ? await getCourseActivityForChild(supabase, selectedChild.id, courseId)
    : { completions: [], submissions: [] };
  const currentPath = `/courses/${courseId}/modules/${moduleId}`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const scopedCoursePath = buildScopedPath(`/courses/${courseId}`, selectedChild?.id ?? null, mode);
  const progressBuilderPath = withQuery(scopedCoursePath, { step: "3" });
  const progressOverviewPath = withQuery(scopedCoursePath, { step: "5" });
  const moduleEditPath = buildScopedPath(
    `/courses/${courseId}/modules/${moduleId}/edit`,
    selectedChild?.id ?? null,
    mode,
  );
  const isAddingTask = resolvedSearchParams?.add === "task";
  const editingTaskId = resolvedSearchParams?.edit ?? null;
  const editingFocusBlockId = resolvedSearchParams?.editFocus ?? null;
  const courseStructure = normaliseCourseStructureType(detail.course.structure_type);
  const sharedCreatorModes = getSharedCreatorModes(courseStructure);
  const showFocusBlockField = canCourseStructureUseFocusBlocks(courseStructure);
  const authoringModel = buildModuleAuthoringViewModel({
    courseId,
    moduleId,
    courseStructure,
    scopedCurrentPath,
    selectedChildId: selectedChild?.id ?? null,
    mode,
    isAddingTask,
    editingTaskId,
    editingFocusBlockId,
    showFocusBlockField,
    tasks: detail.module.tasks,
    focusBlocks: detail.focusBlocks,
    completions: childActivity.completions,
    submissions: childActivity.submissions,
  });

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
              moduleTitle={detail.module.title}
              builderPath={progressBuilderPath}
              overviewPath={progressOverviewPath}
              moduleEditPath={moduleEditPath}
            />
          ) : null
        }
        eyebrow="Module"
        title={detail.module.title}
        description={detail.module.description ?? undefined}
        controls={
          <>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {detail.module.tasks.length} {detail.module.tasks.length === 1 ? "task" : "tasks"}
            </span>
            <Link
              href={moduleEditPath}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
              title={`Edit ${detail.module.title}`}
              aria-label={`Edit ${detail.module.title}`}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 .8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
              </svg>
            </Link>
          </>
        }
        error={resolvedSearchParams?.error}
        saved={resolvedSearchParams?.saved}
      >
        <ModuleAuthoringSurface
          model={authoringModel}
          courseId={courseId}
          moduleId={moduleId}
          redirectPath={scopedCurrentPath}
          creatorModes={sharedCreatorModes}
          focusBlocks={detail.focusBlocks}
          createTaskAction={createTask}
          bulkUpdateTasksAction={bulkUpdateTasks}
          updateTaskAction={updateTask}
          deleteTaskAction={deleteTaskInlineAction}
          duplicateTaskAction={duplicateTask}
          reorderTaskAction={reorderTaskAction}
          updateFocusBlockAction={updateFocusBlock}
          deleteFocusBlockAction={deleteFocusBlockInlineAction}
          reorderFocusBlockAction={reorderFocusBlockAction}
        />
      </ModuleAuthoringShell>
    </AppShell>
  );
}
