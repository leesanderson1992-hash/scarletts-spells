import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
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

import { updateModule } from "../../../../actions";

type ModuleEditPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
  }>;
};

export default async function ModuleEditPage({
  params,
  searchParams,
}: ModuleEditPageProps) {
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
  const currentPath = `/courses/${courseId}/modules/${moduleId}/edit`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const backPath = buildScopedPath(`/courses/${courseId}`, selectedChild?.id ?? null, mode);
  const moduleBackPath = buildScopedPath(
    `/courses/${courseId}/modules/${moduleId}`,
    selectedChild?.id ?? null,
    mode,
  );

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
              <p className="brand-eyebrow">Edit module</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {detail.module.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                Edit the module in a full-page view, then return to the module overview or task table.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={moduleBackPath}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              >
                Open module
              </Link>
              <Link
                href={backPath}
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

        <form action={updateModule} className="brand-card rounded-3xl p-5">
          <input type="hidden" name="module_id" value={detail.module.id} />
          <input type="hidden" name="redirect_path" value={scopedCurrentPath} />

          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Title
              </span>
              <input
                type="text"
                name="title"
                defaultValue={detail.module.title}
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                Description
              </span>
              <textarea
                name="description"
                defaultValue={detail.module.description ?? ""}
                rows={6}
                className="brand-input rounded-2xl px-4 py-3 text-sm"
                placeholder="What sits inside this module?"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
            >
              Save module
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
