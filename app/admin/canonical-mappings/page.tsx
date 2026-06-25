import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";

import {
  disableCanonicalMappingResolverVisibility,
  enableCanonicalMappingResolverVisibility,
} from "./actions";
import {
  buildCanonicalMappingOperationsSearchParams,
  CANONICAL_MAPPING_OPERATIONS_EXPORT_LIMIT,
  CANONICAL_MAPPING_SOURCE_FILTERS,
  CANONICAL_MAPPING_STATUS_FILTERS,
  CANONICAL_MAPPING_VISIBILITY_FILTERS,
  loadCanonicalMappingOperationsPage,
  parseCanonicalMappingOperationsFilters,
  type CanonicalMappingOperationsFilters,
  type CanonicalMappingOperationsRow,
  type ReturnedCorrectionReplayRecommendationRow,
} from "./read-model";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  saved?: string;
  page?: string;
  q?: string;
  status?: string;
  visibility?: string;
  source?: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function shortId(value: string | null | undefined) {
  if (!value) {
    return "none";
  }

  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function readSnapshotString(
  snapshot: Record<string, unknown>,
  key: string,
) {
  const value = snapshot[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readSnapshotBoolean(
  snapshot: Record<string, unknown>,
  key: string,
) {
  const value = snapshot[key];
  return typeof value === "boolean" ? value : null;
}

function readSnapshotStringArray(
  snapshot: Record<string, unknown>,
  key: string,
) {
  const value = snapshot[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function canonicalMappingsHref(filters: Partial<CanonicalMappingOperationsFilters>) {
  const params = buildCanonicalMappingOperationsSearchParams(filters);
  const query = params.toString();

  return `/admin/canonical-mappings${query ? `?${query}` : ""}`;
}

function statusClassName(value: string) {
  if (value === "active" || value === "visible") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (value === "hidden") {
    return "border-sky-200 bg-sky-50 text-sky-950";
  }

  if (value === "disabled") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-800";
}

function StatusMessage({
  error,
  saved,
}: {
  error?: string;
  saved?: string;
}) {
  if (error) {
    return (
      <section
        className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-950"
        role="status"
      >
        {error}
      </section>
    );
  }

  if (saved) {
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-950"
        role="status"
      >
        {saved}
      </section>
    );
  }

  return null;
}

function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName(value)}`}
    >
      {formatLabel(value)}
    </span>
  );
}

function VisibilityForm({
  action,
  label,
  mappingId,
  mode,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  mappingId: string;
  mode: "enable" | "disable";
}) {
  return (
    <form action={action} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="mapping_id" value={mappingId} />
      <label className="sr-only" htmlFor={`${mappingId}-${mode}-note`}>
        {label} note
      </label>
      <textarea
        id={`${mappingId}-${mode}-note`}
        name="note"
        required
        maxLength={600}
        rows={2}
        placeholder="Required admin reason"
        className="min-h-16 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs text-[color:var(--ink)]"
      />
      <button
        type="submit"
        className="min-h-9 rounded-xl border border-[var(--border)] bg-[var(--mist)] px-3 py-2 text-xs font-semibold text-[color:var(--ink)] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
      >
        {label}
      </button>
    </form>
  );
}

function FilterControls({
  filters,
}: {
  filters: CanonicalMappingOperationsFilters;
}) {
  const exportParams = buildCanonicalMappingOperationsSearchParams({
    ...filters,
    page: 1,
  });

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-white/90 p-5"
      aria-label="Canonical mapping filters"
    >
      <form className="grid gap-4 lg:grid-cols-[1.3fr_repeat(3,0.8fr)_auto]">
        <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">
          Search
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Pair, micro-skill, or mapping id"
            className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">
          Status
          <select
            name="status"
            defaultValue={filters.status}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-normal"
          >
            {CANONICAL_MAPPING_STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">
          Visibility
          <select
            name="visibility"
            defaultValue={filters.visibility}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-normal"
          >
            {CANONICAL_MAPPING_VISIBILITY_FILTERS.map((visibility) => (
              <option key={visibility} value={visibility}>
                {formatLabel(visibility)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">
          Source
          <select
            name="source"
            defaultValue={filters.source}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-normal"
          >
            {CANONICAL_MAPPING_SOURCE_FILTERS.map((source) => (
              <option key={source} value={source}>
                {formatLabel(source)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Apply
          </button>
          <Link
            href="/admin/canonical-mappings"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)]"
          >
            Reset
          </Link>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/admin/canonical-mappings/export?${exportParams.toString()}`}
          className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)]"
        >
          Export filtered CSV
        </Link>
        <span className="text-xs text-[color:var(--mid)]">
          Export is capped at {CANONICAL_MAPPING_OPERATIONS_EXPORT_LIMIT} rows
          and includes the applied filters.
        </span>
      </div>
    </section>
  );
}

function Summary({
  pageCount,
  summary,
  totalCount,
}: {
  pageCount: number;
  totalCount: number;
  summary: {
    activeCount: number;
    visibleCount: number;
    hiddenCount: number;
    disabledVisibilityCount: number;
  };
}) {
  const items = [
    ["Total matches", totalCount],
    ["On this page", pageCount],
    ["Active", summary.activeCount],
    ["Visible", summary.visibleCount],
    ["Hidden", summary.hiddenCount],
    ["Disabled visibility", summary.disabledVisibilityCount],
  ] as const;

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Canonical mapping summary">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-[var(--border)] bg-white/90 p-4"
        >
          <p className="text-xs font-semibold uppercase text-[color:var(--mid)]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
            {value}
          </p>
        </div>
      ))}
    </section>
  );
}

function DeferredReplayPanel({
  recommendations,
}: {
  recommendations: ReturnedCorrectionReplayRecommendationRow[];
}) {
  const replayableCount = recommendations.filter(
    (row) => row.replay_status === "pending",
  ).length;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="deferred-replay-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
        <div>
          <p className="brand-eyebrow">Stage F.2/F.3</p>
          <h2
            id="deferred-replay-heading"
            className="brand-title mt-2 text-2xl font-semibold"
          >
            Deferred learning replay available
          </h2>
          <p className="brand-copy mt-2 max-w-3xl text-sm">
            These rows are surfaced by the Stage F planner. Canonical/admin
            truth supplies route support only; manual apply still requires the
            dry-run plan to be safe.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="block text-xs font-semibold uppercase">
            Replayable
          </span>
          <span className="text-2xl font-semibold">{replayableCount}</span>
        </div>
      </div>
      {recommendations.length === 0 ? (
        <div className="px-6 py-5 text-sm text-[color:var(--mid)]">
          No pending or blocked deferred replay recommendations are currently
          surfaced.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-[rgba(255,247,220,0.45)] text-left text-[10px] font-medium uppercase leading-tight tracking-normal text-[color:var(--mid)]">
                <th scope="col" className="px-3 py-3">
                  Child / Parent
                </th>
                <th scope="col" className="px-3 py-3">
                  Issue
                </th>
                <th scope="col" className="px-3 py-3">
                  Spelling Pair
                </th>
                <th scope="col" className="px-3 py-3">
                  Classification
                </th>
                <th scope="col" className="px-3 py-3">
                  Route Source
                </th>
                <th scope="col" className="px-3 py-3">
                  Catalog
                </th>
                <th scope="col" className="px-3 py-3">
                  Existing State
                </th>
                <th scope="col" className="px-3 py-3">
                  Dry-run Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((recommendation) => {
                const snapshot = recommendation.planner_snapshot;
                const observed = readSnapshotString(snapshot, "observedText");
                const correction = readSnapshotString(snapshot, "correctionText");
                const classification = readSnapshotString(
                  snapshot,
                  "finalClassification",
                );
                const proposedAction =
                  readSnapshotString(snapshot, "proposedAction") ?? "none";
                const safeToApply = readSnapshotBoolean(snapshot, "safeToApply");
                const reasons = readSnapshotStringArray(snapshot, "reasons");
                const existingLearningItemIds =
                  readSnapshotStringArray(snapshot, "existingLearningItemIds");
                const existingIssueLinkIds =
                  readSnapshotStringArray(snapshot, "existingIssueLinkIds");
                const evidenceCount =
                  typeof snapshot.evidenceCount === "number"
                    ? snapshot.evidenceCount
                    : 0;

                return (
                  <tr key={recommendation.id} className="align-top">
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block font-semibold text-[color:var(--ink)]">
                        {shortId(recommendation.child_id)}
                      </span>
                      <span className="block">{shortId(recommendation.parent_user_id)}</span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block font-semibold text-[color:var(--ink)]">
                        {shortId(recommendation.writing_issue_id)}
                      </span>
                      <span className="block">
                        Misspelling {shortId(recommendation.source_misspelling_instance_id)}
                      </span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-sm text-[color:var(--ink)]">
                      <span className="block">{observed ?? "unknown"}</span>
                      <span className="block text-xs text-[color:var(--mid)]">
                        to {correction ?? "unknown"}
                      </span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <Badge value={classification ?? "unknown"} />
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block font-semibold text-[color:var(--ink)]">
                        {formatLabel(recommendation.route_source)}
                      </span>
                      <span className="block">Case {shortId(recommendation.admin_case_id)}</span>
                      <span className="block">
                        Mapping {shortId(recommendation.canonical_mapping_id)}
                      </span>
                      <span className="block">
                        Decision {shortId(recommendation.admin_decision_id)}
                      </span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block font-semibold text-[color:var(--ink)]">
                        {recommendation.micro_skill_key ?? "none"}
                      </span>
                      <span className="block">
                        Active/assignable: {recommendation.replay_status === "pending" ? "yes" : "blocked"}
                      </span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block">
                        Learning items {existingLearningItemIds.length}
                      </span>
                      <span className="block">
                        Issue links {existingIssueLinkIds.length}
                      </span>
                      <span className="block">Evidence rows {evidenceCount}</span>
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                      <span className="block font-semibold text-[color:var(--ink)]">
                        {formatLabel(proposedAction)}
                      </span>
                      <span className="block">
                        {safeToApply ? "Safe to apply manually" : "Blocked for review"}
                      </span>
                      <span className="mt-1 block">
                        {reasons.join(" ") || "No planner reason recorded."}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SourceLineage({ mapping }: { mapping: CanonicalMappingOperationsRow }) {
  return (
    <div className="grid gap-1">
      <p>Catalog case {shortId(mapping.source_case_id)}</p>
      <p>Decision {shortId(mapping.source_decision_id)}</p>
      <p>PCRM {shortId(mapping.source_recommendation_id)}</p>
      <p>Seed row {shortId(mapping.source_seed_import_row_id)}</p>
      <p>Admin {mapping.created_by_admin_email ?? "unknown"}</p>
    </div>
  );
}

function AuditSummary({ mapping }: { mapping: CanonicalMappingOperationsRow }) {
  return (
    <div className="grid gap-1">
      <p>Events {mapping.event_count}</p>
      <p>Latest {mapping.latest_event_type ? formatLabel(mapping.latest_event_type) : "none"}</p>
      <p>{formatDate(mapping.latest_event_at)}</p>
      <p>Admin {mapping.latest_event_admin_email ?? "unknown"}</p>
      {mapping.latest_event_note ? <p>Note {mapping.latest_event_note}</p> : null}
    </div>
  );
}

function PaginationControls({
  filters,
  totalPages,
}: {
  filters: CanonicalMappingOperationsFilters;
  totalPages: number;
}) {
  const previousFilters = { ...filters, page: Math.max(1, filters.page - 1) };
  const nextFilters = { ...filters, page: filters.page + 1 };

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white/90 p-4 text-sm"
      aria-label="Canonical mapping pagination"
    >
      <p className="text-[color:var(--mid)]">
        Page {filters.page} of {totalPages}
      </p>
      <div className="flex gap-2">
        {filters.page > 1 ? (
          <Link
            href={canonicalMappingsHref(previousFilters)}
            className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)]"
          >
            Previous
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--mid)]">
            Previous
          </span>
        )}
        {filters.page < totalPages ? (
          <Link
            href={canonicalMappingsHref(nextFilters)}
            className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)]"
          >
            Next
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--mid)]">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

function MappingsTable({ mappings }: { mappings: CanonicalMappingOperationsRow[] }) {
  if (mappings.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white/90 p-8">
        <h2 className="brand-title text-2xl font-semibold">
          No canonical mappings match these filters
        </h2>
        <p className="brand-copy mt-3 text-sm">
          Adjust the search, status, visibility, or source filters to continue
          the audit.
        </p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="canonical-mappings-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="canonical-mappings-heading"
          className="brand-title text-2xl font-semibold"
        >
          Resolver visibility controls
        </h2>
        <p className="brand-copy mt-2 text-sm">
          Disabling resolver visibility removes resolver use while preserving
          canonical mapping truth and audit history.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1420px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-[rgba(255,247,220,0.45)] text-left text-[10px] font-medium uppercase leading-tight tracking-normal text-[color:var(--mid)]">
              <th scope="col" className="px-3 py-3">
                Exact Pair
              </th>
              <th scope="col" className="px-3 py-3">
                Micro-skill
              </th>
              <th scope="col" className="px-3 py-3">
                Scope
              </th>
              <th scope="col" className="px-3 py-3">
                Status
              </th>
              <th scope="col" className="px-3 py-3">
                Source Lineage
              </th>
              <th scope="col" className="px-3 py-3">
                Audit
              </th>
              <th scope="col" className="px-3 py-3">
                Created
              </th>
              <th scope="col" className="px-3 py-3">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => {
              const canEnable =
                mapping.mapping_status === "active" &&
                (mapping.resolver_visibility_status === "hidden" ||
                  mapping.resolver_visibility_status === "disabled");
              const canDisable =
                mapping.mapping_status === "active" &&
                mapping.resolver_visibility_status === "visible";

              return (
                <tr key={mapping.id} className="align-top">
                  <th
                    scope="row"
                    className="border-t border-[var(--border)] px-3 py-4 text-sm font-medium text-[color:var(--ink)]"
                  >
                    <span className="block">{mapping.misspelling_normalized}</span>
                    <span className="block text-xs text-[color:var(--mid)]">
                      to {mapping.correct_spelling_normalized}
                    </span>
                    <span className="mt-2 block text-[11px] text-[color:var(--mid)]">
                      {shortId(mapping.id)}
                    </span>
                  </th>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block font-semibold text-[color:var(--ink)]">
                      {mapping.micro_skill_display_name ??
                        mapping.micro_skill_key}
                    </span>
                    <span className="block">{mapping.micro_skill_key}</span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block">{mapping.dialect_code}</span>
                    <span className="block">{mapping.normalization_version}</span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <div className="flex flex-col items-start gap-2">
                      <Badge value={mapping.mapping_status} />
                      <Badge value={mapping.resolver_visibility_status} />
                    </div>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <SourceLineage mapping={mapping} />
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <AuditSummary mapping={mapping} />
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block">{formatDate(mapping.created_at)}</span>
                    <span className="block">
                      Updated {formatDate(mapping.updated_at)}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4">
                    {canEnable ? (
                      <VisibilityForm
                        action={enableCanonicalMappingResolverVisibility}
                        label="Enable visibility"
                        mappingId={mapping.id}
                        mode="enable"
                      />
                    ) : null}
                    {canDisable ? (
                      <VisibilityForm
                        action={disableCanonicalMappingResolverVisibility}
                        label="Disable resolver visibility"
                        mappingId={mapping.id}
                        mode="disable"
                      />
                    ) : null}
                    {!canEnable && !canDisable ? (
                      <span className="text-xs text-[color:var(--mid)]">
                        No resolver visibility action available.
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminCanonicalMappingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdminUser();

  const params = (await searchParams) ?? {};
  const filters = parseCanonicalMappingOperationsFilters(params);
  const page = await loadCanonicalMappingOperationsPage(filters);

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Canonical Spelling Mappings
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Search, filter, export, and operate resolver visibility for
            already-created canonical exact-pair mappings. Resolver visibility
            is explicit admin authority; this page does not create, edit,
            deprecate, or supersede canonical mapping truth.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/admin/spelling-review"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              Back to spelling review
            </Link>
            <Link
              href="/admin/spelling-canonical-resolver-readiness"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              Resolver readiness
            </Link>
          </div>
        </header>

        <StatusMessage error={params.error} saved={params.saved} />
        <FilterControls filters={filters} />
        <Summary
          pageCount={page.pageCount}
          summary={page.summary}
          totalCount={page.totalCount}
        />
        <DeferredReplayPanel recommendations={page.replayRecommendations} />
        <PaginationControls filters={filters} totalPages={page.totalPages} />
        <MappingsTable mappings={page.rows} />
        <PaginationControls filters={filters} totalPages={page.totalPages} />
      </div>
    </main>
  );
}
