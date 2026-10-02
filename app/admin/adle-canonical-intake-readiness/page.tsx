import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { isCanonicalIntakeEnabled } from "@/lib/adle/canonical-intake";

import { loadReadinessRows, type ReadinessView } from "./read-model";
import { ReadinessTable } from "./readiness-table";
import "./readiness.css";

export const dynamic = "force-dynamic";

const VIEWS: Array<{ key: ReadinessView; label: string }> = [
  { key: "current", label: "Current blockers" },
  { key: "other", label: "Other unresolved" },
  { key: "resolved", label: "Resolved history" },
  { key: "archived", label: "Archived" },
];

function href(view: ReadinessView, search: string, page = 1) {
  const params = new URLSearchParams({ view });
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  return `/admin/adle-canonical-intake-readiness?${params}`;
}

export default async function AdleCanonicalIntakeReadinessPage({ searchParams }: {
  searchParams?: Promise<{ view?: string; q?: string; page?: string; saved?: string; error?: string }>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const view = VIEWS.some((option) => option.key === params.view) ? params.view as ReadinessView : "current";
  const search = (params.q ?? "").trim().slice(0, 100);
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  let result: Awaited<ReturnType<typeof loadReadinessRows>> | null = null;
  let error: string | null = null;
  try {
    result = await loadReadinessRows({ view, search, page });
  } catch (cause) {
    console.error("[adle-readiness-admin] read model failed", cause);
    error = "The readiness facts could not be loaded. Try again shortly.";
  }
  return <main className="adle-admin-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div><p className="adle-admin-eyebrow">Admin / ADLE</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Words waiting for ADLE</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">See what each authentic word needs before it can enter a learner’s ADLE practice.</p>
        </div>
        <Link href="/admin/spelling-review" className="adle-admin-secondary">Spelling review</Link>
      </header>
      {!isCanonicalIntakeEnabled() ? <p className="adle-admin-alert">Canonical intake is disabled in this environment. The facts below remain read-only.</p> : null}
      {params.saved ? <p role="status" className="adle-admin-success">{params.saved}</p> : null}
      {params.error ? <p role="alert" className="adle-admin-alert">{params.error}</p> : null}
      {error ? <p role="alert" className="adle-admin-alert">{error}</p> : null}
      {result ? <>
        <nav aria-label="Readiness views" className="adle-admin-tabs">
          {VIEWS.map((option) => <Link key={option.key} href={href(option.key, search)}
            aria-current={view === option.key ? "page" : undefined}
            className={`adle-admin-tab ${view === option.key ? "is-active" : ""}`}>
            {option.label}
          </Link>)}
        </nav>
        <div className="adle-admin-toolbar">
          <form action="/admin/adle-canonical-intake-readiness" method="get" role="search" className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="view" value={view} />
            <label htmlFor="adle-word-search" className="sr-only">Search word or micro skill</label>
            <input id="adle-word-search" name="q" type="search" defaultValue={search}
              placeholder="Search word or micro skill" className="adle-admin-search" />
            <button type="submit" className="adle-admin-primary">Search</button>
          </form>
          <p className="text-sm text-[#59616b]">{result.total} {result.total === 1 ? "word" : "words"}</p>
        </div>
        <ReadinessTable rows={result.rows} view={view} />
        {result.total > 25 ? <nav aria-label="Table pages" className="mt-5 flex items-center justify-end gap-3 text-sm">
          {page > 1 ? <Link href={href(view, search, page - 1)} className="adle-admin-secondary">Previous</Link> : null}
          <span>Page {page} of {Math.ceil(result.total / 25)}</span>
          {page * 25 < result.total ? <Link href={href(view, search, page + 1)} className="adle-admin-secondary">Next</Link> : null}
        </nav> : null}
      </> : null}
    </div>
  </main>;
}
