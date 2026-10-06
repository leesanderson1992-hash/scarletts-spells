import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser, getCourseDetailForParent } from "@/lib/courses/queries";
import { normaliseCourseStructureType } from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import { updateCourse } from "../../actions";
import { BuilderInfoHint } from "../../components/builder-info-hint";

type CourseEditPageProps = {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
  }>;
};

export default async function CourseEditPage({
  params,
  searchParams,
}: CourseEditPageProps) {
  const { courseId } = await params;
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

  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie ?? detail.course.child_id,
  );
  const currentPath = `/courses/${courseId}/edit`;
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const backPath = buildScopedPath(`/courses/${courseId}`, selectedChild?.id ?? null, mode);

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
              <p className="brand-eyebrow">Edit course</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {detail.course.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-3 py-3 text-sm text-[color:var(--mid)]">
                <span className="rounded-full border border-[var(--border)] px-3 py-1 font-medium text-[color:var(--ink)]">
                  {normaliseCourseStructureType(detail.course.structure_type) === "timed"
                    ? "Timed course"
                    : "Progress course"}
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1">
                  Structure stays intact here
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1">
                  Tasks and checkpoints edit separately
                </span>
                <BuilderInfoHint label="Course edit help">
                  Use this page for identity and timing only. Task, module, and checkpoint changes
                  still live in their own builder steps.
                </BuilderInfoHint>
              </div>
            </div>
            <Link
              href={backPath}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              Back to course
            </Link>
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

        <form action={updateCourse} className="brand-card rounded-3xl p-5">
          <input type="hidden" name="course_id" value={detail.course.id} />
          <input type="hidden" name="redirect_path" value={scopedCurrentPath} />

          <div className="grid gap-4">
            <section className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Identity
              </p>
              <div className="mt-3 grid gap-4">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Title
                  </span>
                  <input
                    type="text"
                    name="title"
                    defaultValue={detail.course.title}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Description
                  </span>
                  <textarea
                    name="description"
                    defaultValue={detail.course.description ?? ""}
                    rows={4}
                    className="brand-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="What is this course for?"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                Structure and timing
              </p>
              <div className="mt-3 grid gap-4 lg:grid-cols-4">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Structure
                  </span>
                  <select
                    name="structure_type"
                    defaultValue={normaliseCourseStructureType(detail.course.structure_type)}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  >
                    <option value="phased">Progress course</option>
                    <option value="timed">Timed course</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Start date
                  </span>
                  <input
                    type="date"
                    name="start_date"
                    defaultValue={detail.course.start_date ?? ""}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Duration weeks
                  </span>
                  <input
                    type="number"
                    name="duration_weeks"
                    min={1}
                    max={104}
                    defaultValue={detail.course.duration_weeks ?? ""}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                    Cycle length
                  </span>
                  <input
                    type="number"
                    name="cycle_length_weeks"
                    min={1}
                    max={12}
                    defaultValue={detail.course.cycle_length_weeks ?? 4}
                    className="brand-input h-11 rounded-2xl px-4 text-sm"
                  />
                </label>
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="mr-2 h-4.5 w-4.5 fill-current">
                <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
              </svg>
              Save course
            </button>
            <Link
              href={backPath}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-5 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="mr-2 h-4.5 w-4.5 fill-current">
                <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
              </svg>
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
