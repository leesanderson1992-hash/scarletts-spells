import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { returnToCanonicalResolver } from "./actions";
import "../adle-canonical-intake-readiness/readiness.css";
import "../canonical-mappings/resolution.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
type SearchParams = Record<string, string | undefined>;
type QueueRow = {
  queue_id: string;
  resolution_item_id: string | null;
  catalog_case_id: string | null;
  misspelling: string;
  correction: string;
  dialect_code: string;
  source_type: "resolver_intake" | "parent_catalog";
  case_status: string;
  updated_at: string;
  parent_note: string | null;
  source_evidence: Array<{ type: string; id: string }>;
};

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
  const safe = q.replace(/[^a-zA-Z0-9-]/g, "").trim();
  let query = createServiceRoleClient().from("spelling_no_matching_skill_queue")
    .select("*", { count: "exact" });
  if (safe) query = query.or(`misspelling.ilike.%${safe}%,correction.ilike.%${safe}%`);
  const { data, count, error } = await query.order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as QueueRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <main className="adle-admin-page resolution-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="adle-admin-eyebrow">Admin / Spelling</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">No Matching Skill</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">
            Parent catalog cases and spelling pairs set aside from the Canonical Misspelling Resolver, together in one queue.
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
      <p className="mb-3 text-sm text-[#59616b]">{total} {total === 1 ? "case" : "cases"}</p>
      <div className="adle-admin-table-wrap">
        <table className="adle-admin-table resolution-table">
          <thead><tr><th scope="col">Misspelling</th><th scope="col">Correction</th>
            <th scope="col">Source</th><th scope="col">Status</th>
            <th scope="col">Evidence</th><th scope="col">Updated</th><th scope="col">Action</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.queue_id}>
            <th scope="row" className="word">{row.misspelling}</th>
            <td>{row.correction}</td>
            <td>{row.source_type === "parent_catalog" ? "Parent catalog case" : "Resolver intake"}</td>
            <td>{row.case_status.replaceAll("_", " ")}</td>
            <td><details className="adle-admin-detail-section"><summary className="cursor-pointer">
              {row.source_evidence.length} linked {row.source_evidence.length === 1 ? "record" : "records"}
            </summary>
              <ul className="mt-2 space-y-2">{row.source_evidence.map((source) => <li key={`${source.type}:${source.id}`}>
                <strong>{source.type}</strong> · <code>{source.id}</code>
              </li>)}</ul>
              {row.parent_note ? <p className="mt-2 text-sm text-[#59616b]">Parent note: {row.parent_note}</p> : null}
            </details></td>
            <td>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(row.updated_at))}</td>
            <td>{row.resolution_item_id ? <form action={returnToCanonicalResolver}>
              <input type="hidden" name="item_id" value={row.resolution_item_id} />
              <button type="submit" className="adle-admin-secondary">Return to resolver</button>
            </form> : <Link className="adle-admin-secondary" href={`/admin/canonical-mappings?status=pending&q=${encodeURIComponent(row.misspelling)}`}>
              Review pair
            </Link>}</td>
          </tr>)}</tbody>
        </table>
        {!rows.length ? <div className="adle-admin-empty">No spelling pairs are waiting for a matching skill.</div> : null}
      </div>
      <nav aria-label="Table pages" className="mt-5 flex items-center justify-end gap-3 text-sm">
        {page > 1 ? <Link href={pageHref(q, page - 1)} className="adle-admin-secondary">Previous</Link> : null}
        <span>Page {page} of {totalPages}</span>
        {page < totalPages ? <Link href={pageHref(q, page + 1)} className="adle-admin-secondary">Next</Link> : null}
      </nav>
    </div>
  </main>;
}
