import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import {
  loadResolutionPage, RESOLUTION_PAGE_SIZE, type ResolutionFilters,
} from "@/app/admin/canonical-mappings/resolution-read-model";
import { returnToCanonicalResolver } from "./actions";
import "../adle-canonical-intake-readiness/readiness.css";
import "../canonical-mappings/resolution.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

function pageHref(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  return `/admin/no-matching-skill${params.size ? `?${params}` : ""}`;
}

export default async function NoMatchingSkillPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const filters: ResolutionFilters = {
    page, q, family: "", cluster: "", skill: "", status: "no_matching_skill", resolver: "all",
  };
  const result = await loadResolutionPage(filters);
  const totalPages = Math.max(1, Math.ceil(result.total / RESOLUTION_PAGE_SIZE));

  return <main className="adle-admin-page resolution-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="adle-admin-eyebrow">Admin / Spelling</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">No Matching Skill</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">
            Spelling pairs set aside until a suitable teaching skill can be chosen. Source evidence stays linked to each pair.
          </p>
        </div>
        <Link href="/admin/canonical-mappings" className="adle-admin-secondary">Canonical Misspelling Resolver</Link>
      </header>
      {params.saved ? <p role="status" className="adle-admin-success">{params.saved}</p> : null}
      {params.error ? <p role="alert" className="adle-admin-alert">{params.error}</p> : null}
      <div className="adle-admin-toolbar">
        <form action="/admin/no-matching-skill" method="get" role="search" className="adle-admin-filter-form">
          <label htmlFor="no-skill-search" className="sr-only">Search misspelling or correction</label>
          <input id="no-skill-search" name="q" type="search" defaultValue={q}
            placeholder="Search misspelling or correction" className="adle-admin-search" />
          <button type="submit" className="adle-admin-primary">Search</button>
        </form>
      </div>
      <p className="mb-3 text-sm text-[#59616b]">{result.total} {result.total === 1 ? "spelling pair" : "spelling pairs"}</p>
      <div className="adle-admin-table-wrap">
        <table className="adle-admin-table resolution-table">
          <thead><tr><th scope="col">Misspelling</th><th scope="col">Correction</th>
            <th scope="col">Dialect</th><th scope="col">Source evidence</th>
            <th scope="col">Moved</th><th scope="col">Action</th></tr></thead>
          <tbody>{result.rows.map((row) => <tr key={row.id}>
            <th scope="row" className="word">{row.misspelling}</th>
            <td>{row.correction}</td><td>{row.dialect}</td>
            <td><details className="adle-admin-detail-section"><summary className="cursor-pointer">{row.sources.length} linked {row.sources.length === 1 ? "record" : "records"}</summary>
              <ul className="mt-2 space-y-2">{row.sources.map((source) => <li key={`${source.type}:${source.id}`}>
                <strong>{source.type}</strong> · {source.status} · {source.originalMisspelling} → {source.originalCorrection}
                {source.note ? <span className="block text-xs text-[#59616b]">{source.note}</span> : null}
              </li>)}</ul>
            </details></td>
            <td>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(row.updatedAt))}</td>
            <td><form action={returnToCanonicalResolver}><input type="hidden" name="item_id" value={row.id} />
              <button type="submit" className="adle-admin-secondary">Return to resolver</button></form></td>
          </tr>)}</tbody>
        </table>
        {!result.rows.length ? <div className="adle-admin-empty">No spelling pairs are waiting for a matching skill.</div> : null}
      </div>
      <nav aria-label="Table pages" className="mt-5 flex items-center justify-end gap-3 text-sm">
        {page > 1 ? <Link href={pageHref(q, page - 1)} className="adle-admin-secondary">Previous</Link> : null}
        <span>Page {page} of {totalPages}</span>
        {page < totalPages ? <Link href={pageHref(q, page + 1)} className="adle-admin-secondary">Next</Link> : null}
      </nav>
    </div>
  </main>;
}
