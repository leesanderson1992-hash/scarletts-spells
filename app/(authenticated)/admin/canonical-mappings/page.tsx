import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/access";

import {
  loadResolutionPage,
  parseResolutionFilters,
  resolutionHref,
} from "./resolution-read-model";
import { ResolutionWorkspace } from "./resolution-workspace";
import "../adle-canonical-intake-readiness/readiness.css";
import "./resolution.css";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

export default async function CanonicalMisspellingResolverPage({ searchParams }: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const filters = parseResolutionFilters(params);
  let result: Awaited<ReturnType<typeof loadResolutionPage>> | null = null;
  let loadError: string | null = null;
  try {
    result = await loadResolutionPage(filters);
  } catch (cause) {
    console.error("[canonical-misspelling-resolver] load failed", cause);
    loadError = "Misspelling records could not be loaded. Try again shortly.";
  }
  const totalPages = result ? Math.max(1, Math.ceil(result.total / filters.size)) : 1;
  if (result && filters.page > totalPages) redirect(resolutionHref(filters, totalPages));

  return <main className="adle-admin-page resolution-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="adle-admin-eyebrow">Admin / Spelling</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Canonical Misspelling Resolver</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59616b]">
            Review spelling evidence, confirm canonical corrections, and control resolver use in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/no-matching-skill" className="adle-admin-secondary">No Matching Skill</Link>
          <Link href="/admin/spelling-review" className="adle-admin-secondary">Spelling review</Link>
        </div>
      </header>

      {params.saved ? <p role="status" className="adle-admin-success">{params.saved}</p> : null}
      {params.error ? <p role="alert" className="adle-admin-alert">{params.error}</p> : null}
      {loadError ? <p role="alert" className="adle-admin-alert">{loadError}</p> : null}

      {result ? <>
        <div className="adle-admin-toolbar">
          <form action="/admin/canonical-mappings" method="get" role="search" className="adle-admin-filter-form">
            <label htmlFor="resolution-search" className="sr-only">Search misspelling or correction</label>
            <input id="resolution-search" name="q" type="search" defaultValue={filters.q}
              placeholder="Search misspelling or correction" className="adle-admin-search" />
            <label htmlFor="resolution-family" className="sr-only">Family</label>
            <select id="resolution-family" name="family" defaultValue={filters.family} className="adle-admin-select">
              <option value="">All families</option>
              {result.families.map((family) => <option key={family.skill_family_key} value={family.skill_family_key}>{family.display_name}</option>)}
            </select>
            <label htmlFor="resolution-cluster" className="sr-only">Cluster</label>
            <select id="resolution-cluster" name="cluster" defaultValue={filters.cluster} className="adle-admin-select">
              <option value="">All clusters</option>
              {result.clusters.filter((cluster) => !filters.family || cluster.skill_family_key === filters.family)
                .map((cluster) => <option key={`${cluster.skill_family_key}:${cluster.skill_cluster_key}`}
                  value={cluster.skill_cluster_key}>{cluster.display_name}</option>)}
            </select>
            <label htmlFor="resolution-skill" className="sr-only">Skill</label>
            <select id="resolution-skill" name="skill" defaultValue={filters.skill} className="adle-admin-select">
              <option value="">All skills</option>
              {result.skills.filter((skill) => (!filters.family || skill.skill_family_key === filters.family) &&
                (!filters.cluster || skill.skill_cluster_key === filters.cluster))
                .map((skill) => <option key={skill.micro_skill_key} value={skill.micro_skill_key}>{skill.display_name}</option>)}
            </select>
            <label htmlFor="resolution-status" className="sr-only">Status</label>
            <select id="resolution-status" name="status" defaultValue={filters.status} className="adle-admin-select">
              <option value="open">Unresolved and confirmed</option>
              <option value="pending">Unresolved only</option>
              <option value="confirmed">Confirmed only</option>
              <option value="closed">Closed history</option>
              <option value="all">All statuses</option>
            </select>
            <label htmlFor="resolution-enabled" className="sr-only">Resolver enabled</label>
            <select id="resolution-enabled" name="resolver" defaultValue={filters.resolver} className="adle-admin-select">
              <option value="all">Resolver: all</option>
              <option value="yes">Resolver enabled</option>
              <option value="no">Resolver off</option>
            </select>
            <label htmlFor="resolution-size" className="sr-only">Rows per page</label>
            <select id="resolution-size" name="size" defaultValue={filters.size} className="adle-admin-select">
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
            </select>
            <button type="submit" className="adle-admin-primary">Apply</button>
          </form>
        </div>
        <ResolutionWorkspace key={JSON.stringify(filters)} rows={result.rows} skills={result.skills} families={result.families}
          clusters={result.clusters} total={result.total} />
        <nav aria-label="Table pages" className="mt-5 flex items-center justify-end gap-3 text-sm">
          {filters.page > 1 ? <Link href={resolutionHref(filters, filters.page - 1)} className="adle-admin-secondary">Previous</Link> : null}
          <span>Page {filters.page} of {totalPages}</span>
          {filters.page < totalPages ? <Link href={resolutionHref(filters, filters.page + 1)} className="adle-admin-secondary">Next</Link> : null}
        </nav>
      </> : null}
    </div>
  </main>;
}
