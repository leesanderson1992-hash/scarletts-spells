import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const OPEN_CATALOG_CASE_STATUSES = new Set(["open"]);
const OPEN_RECOMMENDATION_STATUSES = new Set([
  "recommended",
  "pending_admin_review",
]);
const OPEN_SEED_IMPORT_ROW_STATUSES = new Set([
  "pending_candidate_review",
  "kept_pending",
  "conflict_blocked",
  "nominated_for_canonical_adoption",
]);

type QueueSummary = {
  openCount: number;
  reviewedCount: number;
  latestUpdatedAt: string | null;
  statusCounts: Array<{
    count: number;
    label: string;
  }>;
};

type QueueRow = {
  status: string;
  updated_at: string | null;
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
    return "No activity yet";
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

function buildSummary(rows: QueueRow[], openStatuses: Set<string>): QueueSummary {
  const statusCounts = new Map<string, number>();
  let latestUpdatedAt: string | null = null;
  let openCount = 0;

  for (const row of rows) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);

    if (openStatuses.has(row.status)) {
      openCount += 1;
    }

    if (
      row.updated_at &&
      (!latestUpdatedAt ||
        new Date(row.updated_at).getTime() > new Date(latestUpdatedAt).getTime())
    ) {
      latestUpdatedAt = row.updated_at;
    }
  }

  return {
    latestUpdatedAt,
    openCount,
    reviewedCount: rows.length - openCount,
    statusCounts: Array.from(statusCounts.entries())
      .map(([status, count]) => ({
        count,
        label: formatLabel(status),
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

async function getCatalogGapSummary() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("spelling_catalog_review_cases")
    .select("case_status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    throw error;
  }

  return buildSummary(
    ((data ?? []) as Array<{ case_status: string; updated_at: string | null }>)
      .map((row) => ({
        status: row.case_status,
        updated_at: row.updated_at,
      })),
    OPEN_CATALOG_CASE_STATUSES,
  );
}

async function getCanonicalRecommendationSummary() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("spelling_canonical_mapping_recommendations")
    .select("recommendation_status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    throw error;
  }

  return buildSummary(
    ((data ?? []) as Array<{
      recommendation_status: string;
      updated_at: string | null;
    }>).map((row) => ({
      status: row.recommendation_status,
      updated_at: row.updated_at,
    })),
    OPEN_RECOMMENDATION_STATUSES,
  );
}

async function getSeedImportRowSummary() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("spelling_seed_import_rows")
    .select("row_status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    throw error;
  }

  return buildSummary(
    ((data ?? []) as Array<{ row_status: string; updated_at: string | null }>).map(
      (row) => ({
        status: row.row_status,
        updated_at: row.updated_at,
      }),
    ),
    OPEN_SEED_IMPORT_ROW_STATUSES,
  );
}

function StatusPills({ summary }: { summary: QueueSummary }) {
  if (summary.statusCounts.length === 0) {
    return (
      <p className="text-sm text-[color:var(--mid)]">
        No rows have been captured yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Queue status summary">
      {summary.statusCounts.map((status) => (
        <li
          key={status.label}
          className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]"
        >
          {status.label}: {status.count}
        </li>
      ))}
    </ul>
  );
}

function QueueSection({
  description,
  href,
  linkLabel,
  sourceTable,
  summary,
  title,
}: {
  description: string;
  href: string;
  linkLabel: string;
  sourceTable: string;
  summary: QueueSummary;
  title: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby={`${sourceTable}-heading`}
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <p className="brand-eyebrow">{sourceTable}</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2
              id={`${sourceTable}-heading`}
              className="brand-title text-2xl font-semibold"
            >
              {title}
            </h2>
            <p className="brand-copy mt-2 text-sm leading-6">{description}</p>
          </div>
          <Link
            href={href}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--mist)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
          >
            {linkLabel}
          </Link>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-3">
        <div className="border-b border-[var(--border)] px-6 py-5 md:border-b-0 md:border-r">
          <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
            Open
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
            {summary.openCount}
          </p>
        </div>
        <div className="border-b border-[var(--border)] px-6 py-5 md:border-b-0 md:border-r">
          <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
            Reviewed
          </p>
          <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
            {summary.reviewedCount}
          </p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
            Latest activity
          </p>
          <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
            {formatDate(summary.latestUpdatedAt)}
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-6 py-4">
        <StatusPills summary={summary} />
      </div>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-950">
      <h2 className="text-xl font-semibold">Spelling review is unavailable</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6">
        The admin shell loaded, but one of the spelling review summaries could
        not be read. Check the server-side admin/service-role configuration
        before using this hub.
      </p>
    </section>
  );
}

export default async function AdminSpellingReviewPage() {
  await requireAdminUser();

  let catalogGapSummary: QueueSummary | null = null;
  let recommendationSummary: QueueSummary | null = null;
  let seedImportRowSummary: QueueSummary | null = null;
  let hasError = false;

  try {
    [catalogGapSummary, recommendationSummary, seedImportRowSummary] =
      await Promise.all([
        getCatalogGapSummary(),
        getCanonicalRecommendationSummary(),
        getSeedImportRowSummary(),
      ]);
  } catch {
    hasError = true;
  }

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Spelling Review
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            One place to see the spelling admin queues. The queues remain
            separate so catalog gaps, parent recommendations, seed imports,
            canonical mapping storage, and resolver visibility keep their
            current boundaries.
          </p>
          <Link
            href="/admin/canonical-mappings"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
          >
            Open canonical mappings
          </Link>
          <Link
            href="/admin/spelling-canonical-resolver-readiness"
            className="ml-0 mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2 sm:ml-3 sm:mt-4"
          >
            Open resolver readiness
          </Link>
        </header>

        {hasError ||
        !catalogGapSummary ||
        !recommendationSummary ||
        !seedImportRowSummary ? (
          <ErrorState />
        ) : (
          <>
            <QueueSection
              description="Catalog gaps: parent could not find a suitable existing skill."
              href="/admin/catalog-review"
              linkLabel="Open catalog gaps"
              sourceTable="spelling_catalog_review_cases"
              summary={catalogGapSummary}
              title="Catalog gaps / No matching skill cases"
            />
            <QueueSection
              description="Recommended mappings: parent selected an existing skill and recommends the word/correction pairing for admin review."
              href="/admin/canonical-recommendations"
              linkLabel="Open recommendations"
              sourceTable="spelling_canonical_mapping_recommendations"
              summary={recommendationSummary}
              title="Parent recommended canonical mappings"
            />
            <QueueSection
              description="Seed imports: external/operator candidate evidence awaiting read-only review."
              href="/admin/seed-import-review"
              linkLabel="Open seed imports"
              sourceTable="spelling_seed_import_rows"
              summary={seedImportRowSummary}
              title="Imported seed candidate rows"
            />
          </>
        )}
      </div>
    </main>
  );
}
