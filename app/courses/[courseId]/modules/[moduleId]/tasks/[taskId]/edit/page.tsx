import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { TaskEditorFields } from "@/app/courses/components/task-editor-fields";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  getActiveChildrenForUser,
  getModuleDetailForParent,
} from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";

import { updateTask } from "../../../../../../actions";

type TaskEditPageProps = {
  params: Promise<{ courseId: string; moduleId: string; taskId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
  }>;
};

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
  const detail = await getModuleDetailForParent(supabase, user.id, courseId, moduleId);

  if (!detail) {
    notFound();
  }

  const task = detail.module.tasks.find((item) => item.id === taskId) ?? null;
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
  const formId = `task-edit-form-${task.id}`;

  return (
    <AppShell
      currentPath="/courses"
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Edit task</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                Edit the full task in one place, including the lesson HTML, prompt, reward rule, and weekly rhythm.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={moduleBackPath}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              >
                Back to module
              </Link>
              <Link
                href={courseBackPath}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              >
                Back to course
              </Link>
            </div>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-4 grid gap-2">
              {resolvedSearchParams?.error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}
              {resolvedSearchParams?.saved ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                  Saved {resolvedSearchParams.saved}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <form id={formId} action={updateTask} className="brand-card rounded-3xl p-5">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
          <TaskEditorFields task={task} focusBlocks={detail.focusBlocks} formId={formId} />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
            >
              Save task
            </button>
            <Link
              href={moduleBackPath}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-5 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
