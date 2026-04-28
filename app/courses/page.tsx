import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser, getCoursesForChild } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";

import { createCourse, deleteCourse, updateCourse } from "./actions";

type CoursesPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    add?: string;
    edit?: string;
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

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  const courses = selectedChild
    ? await getCoursesForChild(supabase, user.id, selectedChild.id)
    : [];
  const currentPath = "/courses";
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild?.id ?? null, mode);
  const isAddingCourse = resolvedSearchParams?.add === "course";
  const editingCourseId = resolvedSearchParams?.edit ?? null;

  return (
    <AppShell
      currentPath={currentPath}
      mode={mode}
      activeChildId={selectedChild?.id ?? null}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Courses</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--ink)]">
                Learning structure
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
                Keep courses separate from spelling. This is the parent planning area for modules,
                recurring tasks, and writing work.
              </p>
            </div>
            <div className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </div>
          </div>

          {(resolvedSearchParams?.error || resolvedSearchParams?.saved) ? (
            <div className="mt-3 grid gap-2">
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

          {selectedChild && !isAddingCourse ? (
            <div className="mt-3">
              <Link
                href={withQuery(scopedCurrentPath, { add: "course", edit: null })}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                title={`Add course for ${selectedChild.first_name}`}
                aria-label={`Add course for ${selectedChild.first_name}`}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                  <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                </svg>
              </Link>
            </div>
          ) : null}

          {selectedChild && isAddingCourse ? (
            <form
              action={createCourse}
              className="mt-3 grid gap-3 rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4"
            >
              <input type="hidden" name="child_id" value={selectedChild.id} />
              <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  1. Choose the structure
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.2)] px-4 py-3.5 text-sm text-[color:var(--ink)]">
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="structure_type"
                        value="phased"
                        className="mt-1 h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
                      />
                      <span className="grid gap-1">
                        <span className="font-semibold">Phased course</span>
                        <span className="text-sm leading-6 text-[color:var(--mid)]">
                          Ordered phases with modules inside each stage.
                        </span>
                      </span>
                    </span>
                  </label>
                  <label className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-4 py-3.5 text-sm text-[color:var(--ink)]">
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="structure_type"
                        value="timed"
                        className="mt-1 h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
                      />
                      <span className="grid gap-1">
                        <span className="font-semibold">Timed course</span>
                        <span className="text-sm leading-6 text-[color:var(--mid)]">
                          Cycles, recurring work, focus blocks, and review points.
                        </span>
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    2. Name the course
                  </p>
                <input
                  type="text"
                  name="title"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Creative Writing"
                />
              </div>
              <div className="grid gap-2">
                <textarea
                  name="description"
                  rows={1}
                  className="brand-input min-h-11 rounded-2xl px-4 py-3 text-sm"
                  placeholder="What is this course for?"
                />
              </div>
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  3. Add timing only if this is a timed course
                </p>
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  type="date"
                  name="start_date"
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  aria-label="Course start date"
                />
                <input
                  type="number"
                  name="duration_weeks"
                  min={1}
                  max={104}
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Weeks"
                  aria-label="Course duration in weeks"
                />
                <input
                  type="number"
                  name="cycle_length_weeks"
                  min={1}
                  max={12}
                  defaultValue={4}
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                  placeholder="Cycle"
                  aria-label="Cycle length in weeks"
                />
              </div>
              </div>
              <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
                title={`Create course for ${selectedChild.first_name}`}
                aria-label={`Create course for ${selectedChild.first_name}`}
              >
                Create course
              </button>
              <Link
                href={withQuery(scopedCurrentPath, { add: null })}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                title="Close add course"
                aria-label="Close add course"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                    <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                  </svg>
                </Link>
              </div>
            </form>
          ) : !selectedChild ? (
            <p className="mt-6 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
              Add a child profile first so the course can be assigned cleanly.
            </p>
          ) : null}
        </div>

        <section className="brand-card overflow-hidden rounded-3xl p-0">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_92px] gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            <span>Course</span>
            <span>Notes</span>
            <span>Structure</span>
            <span className="text-right">Open</span>
          </div>

          {courses.map((course) => {
            const formId = `course-form-${course.id}`;
            const isEditing = editingCourseId === course.id;

            return (
              <div
                key={course.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_92px] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  {isEditing ? (
                    <>
                      <input type="hidden" name="course_id" value={course.id} form={formId} />
                      <input type="hidden" name="redirect_path" value={scopedCurrentPath} form={formId} />
                      <input
                        type="text"
                        name="title"
                        form={formId}
                        defaultValue={course.title}
                        className="brand-input h-10 w-full rounded-2xl px-3 text-sm font-semibold"
                        aria-label={`Course title for ${course.title}`}
                      />
                    </>
                  ) : (
                    <p className="pt-2 text-sm font-semibold text-[color:var(--ink)]">{course.title}</p>
                  )}
                </div>
                <div className="min-w-0">
                  {isEditing ? (
                    <input
                      type="text"
                      name="description"
                      form={formId}
                      defaultValue={course.description ?? ""}
                      className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                      aria-label={`Description for ${course.title}`}
                      placeholder="No description yet"
                    />
                  ) : (
                    <p className="pt-2 text-sm text-[color:var(--mid)]">
                      {course.description || "No description yet"}
                    </p>
                  )}
                </div>
                <div className="pt-2 text-sm text-[color:var(--mid)]">
                  {isEditing ? (
                    <div className="grid gap-2">
                      <select
                        name="structure_type"
                        form={formId}
                        defaultValue={course.structure_type}
                        className="brand-input h-10 w-full rounded-2xl px-3 text-sm"
                        aria-label={`Course structure for ${course.title}`}
                      >
                        <option value="phased">Phased course</option>
                        <option value="timed">Timed course</option>
                      </select>
                      <div className="grid gap-2 md:grid-cols-3">
                        <input
                          type="date"
                          name="start_date"
                          form={formId}
                          defaultValue={course.start_date ?? ""}
                          className="brand-input h-10 rounded-2xl px-3 text-sm"
                          aria-label={`Start date for ${course.title}`}
                        />
                        <input
                          type="number"
                          name="duration_weeks"
                          form={formId}
                          min={1}
                          max={104}
                          defaultValue={course.duration_weeks ?? ""}
                          className="brand-input h-10 rounded-2xl px-3 text-sm"
                          placeholder="Weeks"
                          aria-label={`Duration weeks for ${course.title}`}
                        />
                        <input
                          type="number"
                          name="cycle_length_weeks"
                          form={formId}
                          min={1}
                          max={12}
                          defaultValue={course.cycle_length_weeks ?? 4}
                          className="brand-input h-10 rounded-2xl px-3 text-sm"
                          placeholder="Cycle"
                          aria-label={`Cycle length for ${course.title}`}
                        />
                      </div>
                    </div>
                  ) : course.structure_type === "phased" ? (
                    <>
                      <p>Phased course</p>
                      <p className="text-xs">Stages and modules in order</p>
                    </>
                  ) : course.duration_weeks ? (
                    <>
                      <p>Timed course</p>
                      <p className="text-xs">
                        {course.duration_weeks} weeks · {course.cycle_length_weeks ?? 4}-week cycles
                        {course.start_date ? ` from ${course.start_date}` : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Timed course</p>
                      <p className="text-xs">No timeline set yet</p>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="submit"
                        form={formId}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title={`Save ${course.title}`}
                        aria-label={`Save ${course.title}`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M4 3h9.6a1 1 0 0 1 .7.3l2.4 2.4a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v10h10V7.4L13.6 5H13v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5H5Zm4 0v2h2V5H9Z" />
                        </svg>
                      </button>
                      <Link
                        href={withQuery(scopedCurrentPath, { edit: null })}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title="Stop editing"
                        aria-label="Stop editing"
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
                        </svg>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href={buildScopedPath(`/courses/${course.id}/edit`, selectedChild?.id ?? null, mode)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                        title={`Edit ${course.title}`}
                        aria-label={`Edit ${course.title}`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M13.6 3.6a2 2 0 0 1 2.8 2.8l-8 8a1 1 0 0 1-.47.26l-3 0.8a1 1 0 0 1-1.22-1.22l.8-3a1 1 0 0 1 .26-.47l8-8Zm1.4 1.4a1 1 0 0 0-1.4 0L6.02 12.6l-.43 1.62 1.62-.43L15 6.4a1 1 0 0 0 0-1.4Z" />
                        </svg>
                      </Link>
                      <button
                        type="submit"
                        form={`delete-course-form-${course.id}`}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-rose-700 transition hover:bg-rose-50"
                        title={`Delete ${course.title} forever`}
                        aria-label={`Delete ${course.title} forever`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                          <path d="M8 3a1 1 0 0 0-.9.55L6.38 5H4a1 1 0 1 0 0 2h.12l.68 8.14A2 2 0 0 0 6.79 17h6.42a2 2 0 0 0 1.99-1.86L15.88 7H16a1 1 0 1 0 0-2h-2.38l-.72-1.45A1 1 0 0 0 12 3H8Zm.62 2 .5-1h1.76l.5 1H8.62ZM7 8a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V8Zm4-1a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <Link
                    href={buildScopedPath(`/courses/${course.id}`, selectedChild?.id ?? null, mode)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scarlett)] text-white transition hover:brightness-105"
                    title={`Open ${course.title}`}
                    aria-label={`Open ${course.title}`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 fill-current">
                      <path d="M7 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0V6.4l-7.3 7.3a1 1 0 0 1-1.4-1.4L12.6 5H8a1 1 0 0 1-1-1Z" />
                      <path d="M4 6a2 2 0 0 1 2-2h2a1 1 0 1 1 0 2H6v8h8v-2a1 1 0 1 1 2 0v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
                    </svg>
                  </Link>
                </div>
                {isEditing ? <form id={formId} action={updateCourse} className="hidden" /> : null}
                <form id={`delete-course-form-${course.id}`} action={deleteCourse} className="hidden">
                  <input type="hidden" name="course_id" value={course.id} />
                  <input type="hidden" name="redirect_path" value={scopedCurrentPath} />
                </form>
              </div>
            );
          })}

          {courses.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[color:var(--mid)]">
              No courses yet for this child. Create the first one above.
            </div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
