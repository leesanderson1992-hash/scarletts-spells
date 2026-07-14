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
import { getChildLearningReflections, type ChildLearningReflection } from "@/lib/adle/morphology/reflections";

type LearnPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
  }>;
};

export default async function LearnPage({ searchParams }: LearnPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "child");
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  const courses = selectedChild
    ? await getCoursesForChild(supabase, user.id, selectedChild.id, { activeOnly: true })
    : [];
  let wordLabReflections: ChildLearningReflection[] = [];
  if (selectedChild) {
    try {
      wordLabReflections = await getChildLearningReflections(supabase, { parentUserId: user.id, childId: selectedChild.id, limit: 10 });
    } catch (error) {
      console.error("[my-learning] private Word Lab reflections failed to load", error);
    }
  }
  const currentPath = "/learn";

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
              <p className="brand-eyebrow">My learning</p>
              <h1 className="brand-title mt-1 text-2xl font-semibold tracking-tight">
                Courses and tasks
              </h1>
              <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
                Open a course to go deeper, or use the weekly page to keep your learning organised in one place.
              </p>
            </div>
            <Link
              href={buildScopedPath("/learn/week", selectedChild?.id ?? null, mode)}
              className="brand-secondary-btn"
            >
              Open this week
            </Link>
          </div>
        </div>

        <section className="brand-card overflow-hidden rounded-3xl p-0">
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            <span>Course</span>
            <span className="text-right">Open</span>
          </div>
          {courses.map((course) => (
            <div
              key={course.id}
              className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{course.title}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">
                  {course.description || "Open this course to see the tasks inside it."}
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Link
                  href={buildScopedPath(`/learn/courses/${course.id}`, selectedChild?.id ?? null, mode)}
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
            </div>
          ))}

          {courses.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[color:var(--mid)]">
              No courses are ready yet. A parent can add one in parent mode.
            </div>
          ) : null}
        </section>

        <section className="brand-card overflow-hidden rounded-3xl p-0" aria-labelledby="word-lab-reflections-heading">
          <div className="border-b border-[var(--border)] bg-white/70 px-4 py-3">
            <p className="brand-eyebrow">Private learning notes</p>
            <h2 id="word-lab-reflections-heading" className="mt-1 text-lg font-semibold text-[color:var(--ink)]">My Word Lab reflections</h2>
          </div>
          {wordLabReflections.map((reflection) => (
            <article key={reflection.id} className="border-b border-[var(--border)] px-4 py-4 last:border-b-0">
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[color:var(--mid)]">{reflection.assignmentDate ?? reflection.createdAt.slice(0, 10)}</p>
              <p className="mt-2 text-sm text-[color:var(--mid)]">{reflection.promptText}</p>
              <blockquote className="mt-2 rounded-2xl bg-cyan-50 p-3 text-sm leading-6 text-cyan-950">{reflection.reflectionText}</blockquote>
            </article>
          ))}
          {wordLabReflections.length === 0 ? <p className="px-4 py-4 text-sm text-[color:var(--mid)]">Your Word Lab reflections will appear here after you finish a lesson.</p> : null}
        </section>
      </section>
    </AppShell>
  );
}
