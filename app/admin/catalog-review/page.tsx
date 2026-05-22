import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type CatalogReviewCaseRow = {
  id: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  source_provenance: string;
  case_status: string;
  parent_note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CatalogReviewGroup = {
  key: string;
  misspelling: string;
  correction: string;
  count: number;
  latestDate: string;
  representativeContext: string | null;
  parentNote: string | null;
  sourceProvenanceLabels: string[];
  statusLabels: string[];
  latestOriginalChildSpelling: string | null;
  latestOriginalCorrectSpelling: string | null;
};

function readStringMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getLatestDate(row: CatalogReviewCaseRow) {
  return row.updated_at || row.created_at;
}

function buildCatalogReviewGroups(rows: CatalogReviewCaseRow[]) {
  const groups = new Map<string, CatalogReviewGroup>();

  for (const row of rows) {
    const key = `${row.misspelling_normalized}->${row.correct_spelling_normalized}`;
    const existing = groups.get(key);
    const latestDate = getLatestDate(row);
    const context = readStringMetadata(row.metadata, "context_text");
    const parentNote = row.parent_note?.trim() || null;
    const sourceLabel = formatLabel(row.source_provenance);
    const statusLabel = formatLabel(row.case_status);

    if (!existing) {
      groups.set(key, {
        key,
        misspelling: row.misspelling_normalized,
        correction: row.correct_spelling_normalized,
        count: 1,
        latestDate,
        representativeContext: context,
        parentNote,
        sourceProvenanceLabels: [sourceLabel],
        statusLabels: [statusLabel],
        latestOriginalChildSpelling: row.original_child_spelling,
        latestOriginalCorrectSpelling: row.original_correct_spelling,
      });
      continue;
    }

    existing.count += 1;

    if (!existing.sourceProvenanceLabels.includes(sourceLabel)) {
      existing.sourceProvenanceLabels.push(sourceLabel);
    }

    if (!existing.statusLabels.includes(statusLabel)) {
      existing.statusLabels.push(statusLabel);
    }

    if (new Date(latestDate).getTime() > new Date(existing.latestDate).getTime()) {
      existing.latestDate = latestDate;
      existing.representativeContext = context ?? existing.representativeContext;
      existing.parentNote = parentNote ?? existing.parentNote;
      existing.latestOriginalChildSpelling = row.original_child_spelling;
      existing.latestOriginalCorrectSpelling = row.original_correct_spelling;
    } else {
      existing.representativeContext ??= context;
      existing.parentNote ??= parentNote;
    }
  }

  return Array.from(groups.values()).sort(
    (left, right) =>
      new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime(),
  );
}

function EmptyState() {
  return (
    <section className="brand-card rounded-2xl p-8">
      <h2 className="brand-title text-2xl font-semibold">No open cases</h2>
      <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
        Parent-raised spelling catalog-review cases will appear here after a
        parent uses No matching skill in Review Work.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-950">
      <h2 className="text-xl font-semibold">Catalog review is unavailable</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6">
        The admin shell loaded, but the catalog-review case list could not be
        read. Check the server-side admin/service-role configuration before
        using this surface for triage.
      </p>
    </section>
  );
}

function CatalogReviewTable({ groups }: { groups: CatalogReviewGroup[] }) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="catalog-review-cases-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="catalog-review-cases-heading"
          className="brand-title text-2xl font-semibold"
        >
          Open catalog-review cases
        </h2>
        <p className="brand-copy mt-2 text-sm">
          Read-only triage grouped by normalized spelling pair.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
          <thead className="bg-[var(--mist)]/55 text-xs uppercase tracking-wide text-[var(--mid)]">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                Misspelling -&gt; correction
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Count
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Latest
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Representative context
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Parent note
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Source
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {groups.map((group) => (
              <tr key={group.key} className="align-top">
                <th scope="row" className="px-5 py-4 font-semibold text-[var(--text)]">
                  <span className="block">
                    {group.misspelling} -&gt; {group.correction}
                  </span>
                  {group.latestOriginalChildSpelling ||
                  group.latestOriginalCorrectSpelling ? (
                    <span className="brand-copy mt-1 block text-xs font-normal">
                      Latest original: {group.latestOriginalChildSpelling ?? "unknown"}{" "}
                      -&gt; {group.latestOriginalCorrectSpelling ?? "unknown"}
                    </span>
                  ) : null}
                </th>
                <td className="px-5 py-4">
                  <span className="brand-chip-strong inline-flex min-w-9 justify-center px-3 py-1 text-xs font-semibold">
                    {group.count}
                  </span>
                </td>
                <td className="px-5 py-4 text-[var(--text)]">
                  <time dateTime={group.latestDate}>
                    {formatDateTime(group.latestDate)}
                  </time>
                </td>
                <td className="max-w-xs px-5 py-4 text-[var(--text)]">
                  {group.representativeContext ?? (
                    <span className="brand-copy">No context saved</span>
                  )}
                </td>
                <td className="max-w-xs px-5 py-4 text-[var(--text)]">
                  {group.parentNote ?? (
                    <span className="brand-copy">No parent note</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className="brand-chip inline-flex px-3 py-1 text-xs font-semibold">
                    {group.sourceProvenanceLabels.join(", ")}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="brand-chip-review inline-flex px-3 py-1 text-xs font-semibold">
                    {group.statusLabels.join(", ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function getOpenCatalogReviewCases() {
  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_catalog_review_cases")
    .select(
      [
        "id",
        "original_child_spelling",
        "original_correct_spelling",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "source_provenance",
        "case_status",
        "parent_note",
        "metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("case_status", "open")
    .order("updated_at", { ascending: false });
}

export default async function AdminCatalogReviewPage() {
  await requireAdminUser();

  let rows: CatalogReviewCaseRow[] = [];
  let hasError = false;

  try {
    const { data, error } = await getOpenCatalogReviewCases();

    if (error) {
      hasError = true;
    } else {
      rows = ((data ?? []) as unknown) as CatalogReviewCaseRow[];
    }
  } catch {
    hasError = true;
  }

  const groups = buildCatalogReviewGroups(rows);

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Catalog review
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Internal read-only triage for parent-raised spelling catalog gaps.
            Open cases are evidence for future catalog curation only.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Catalog review summary">
          <div className="brand-card rounded-2xl p-5">
            <p className="brand-eyebrow">Open groups</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">
              {groups.length}
            </p>
          </div>
          <div className="brand-card rounded-2xl p-5">
            <p className="brand-eyebrow">Open cases</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--text)]">
              {rows.length}
            </p>
          </div>
          <div className="brand-card rounded-2xl p-5">
            <p className="brand-eyebrow">Mode</p>
            <p className="mt-3 text-sm font-semibold text-[var(--text)]">
              Read-only triage
            </p>
          </div>
        </section>

        {hasError ? (
          <ErrorState />
        ) : groups.length === 0 ? (
          <EmptyState />
        ) : (
          <CatalogReviewTable groups={groups} />
        )}
      </div>
    </main>
  );
}
