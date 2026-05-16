import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";

import { saveManualWritingSample } from "./actions";

type AnalysePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
  }>;
};

export default async function AnalysePage({
  searchParams,
}: AnalysePageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "parent");

  if (mode === "child") {
    const activeChildId = await getActiveChildIdFromCookies();
    const childId = resolvedSearchParams?.child ?? activeChildId ?? null;
    redirect(buildScopedPath("/learn/week", childId, "child"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const reviewWorkPath = buildScopedPath("/courses/review", selectedChild.id, "parent");

  return (
    <AppShell
      currentPath="/analyse"
      mode="parent"
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="brand-card rounded-3xl p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="brand-eyebrow">Analyse Writing</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
              Add a manual writing sample
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
              Paste writing completed outside the app to create canonical
              writing-sample truth for this child. Review Work is where the
              parent checks suggested issues and records verified decisions.
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
            Intake only
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={reviewWorkPath} className="brand-secondary-btn">
            Open Review Work
          </Link>
        </div>

        {resolvedSearchParams?.saved ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {resolvedSearchParams.saved}
          </p>
        ) : null}
        {resolvedSearchParams?.error ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {resolvedSearchParams.error}
          </p>
        ) : null}

        <form action={saveManualWritingSample} className="mt-6 grid gap-4">
          <input name="child_id" type="hidden" value={selectedChild.id} />
          <input name="mode" type="hidden" value="parent" />

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[color:var(--ink)]">
              Writing sample
            </span>
            <textarea
              name="sample_text"
              rows={14}
              className="min-h-[18rem] rounded-3xl border border-[var(--border)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--ink)] shadow-sm outline-none transition focus:border-[var(--scarlett)] focus:ring-2 focus:ring-[rgba(206,71,125,0.15)]"
              placeholder="Paste the paper-written work here."
              required
            />
          </label>

          <p className="text-sm leading-6 text-[color:var(--mid)]">
            This page saves writing only. It does not verify, classify, assign,
            or create durable learning effects.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="brand-primary-btn">
              Save and open Review Work
            </button>
            <Link href={reviewWorkPath} className="brand-secondary-btn">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
