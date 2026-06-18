import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type SeedImportBatchRow = {
  id: string;
  batch_name: string;
  source_name: string;
  source_dataset: string | null;
  source_url: string | null;
  source_license_note: string;
  source_file_name: string;
  source_file_sha256: string;
  dry_run_report_schema_version: string;
  dry_run_report_sha256: string;
  dry_run_generated_at: string;
  batch_status: string;
  total_row_count: number;
  candidate_review_row_count: number;
  manual_review_row_count: number;
  rejected_row_count: number;
  duplicate_row_count: number;
  conflict_row_count: number;
  created_by_admin_email: string | null;
  created_at: string;
  updated_at: string;
};

type SeedImportRow = {
  id: string;
  batch_id: string;
  source_row_number: number;
  source_row_id: string | null;
  source_row_hash: string | null;
  raw_misspelling: string;
  raw_correction: string;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  dialect_code: string;
  normalization_version: string;
  suggested_micro_skill_key: string;
  source_confidence_raw: string | null;
  source_confidence_normalized: number | null;
  source_note: string;
  source_url: string | null;
  source_dataset: string | null;
  age_band: string | null;
  pattern_hint: string | null;
  route_hint: string | null;
  dry_run_bucket: string;
  dry_run_report_row_number: number | null;
  dry_run_recommended_next_action: string | null;
  row_status: string;
  status_reason: string | null;
  validation_reasons: unknown;
  blocking_errors: unknown;
  manual_review_warnings: unknown;
  canonical_match_ids: unknown;
  canonical_conflict_ids: unknown;
  supporting_evidence_ids: unknown;
  supporting_evidence_counts: unknown;
  duplicate_group_key: string | null;
  conflict_group_key: string | null;
  duplicate_of_seed_import_row_id: string | null;
  reviewed_by_admin_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  canonical_mapping_id: string | null;
  created_at: string;
  updated_at: string;
};

type MicroSkillRow = {
  micro_skill_key: string;
  display_name: string;
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

function formatShortHash(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}

function formatConfidence(row: SeedImportRow) {
  if (row.source_confidence_normalized !== null) {
    return `${Math.round(row.source_confidence_normalized * 100)}%`;
  }

  return row.source_confidence_raw?.trim() || "Not recorded";
}

function countJsonEntries(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }

  return 0;
}

function formatJsonCount(value: unknown, emptyLabel = "None") {
  const count = countJsonEntries(value);

  return count === 0 ? emptyLabel : String(count);
}

function BatchSummary({
  batches,
}: {
  batches: SeedImportBatchRow[];
}) {
  const totalRows = batches.reduce((sum, batch) => sum + batch.total_row_count, 0);
  const candidateRows = batches.reduce(
    (sum, batch) => sum + batch.candidate_review_row_count,
    0,
  );
  const latestBatch = batches[0] ?? null;

  return (
    <section
      className="grid gap-4 md:grid-cols-3"
      aria-label="Seed import batch summary"
    >
      <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
          Batches
        </p>
        <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
          {batches.length}
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
          Imported rows
        </p>
        <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
          {candidateRows}
        </p>
        <p className="mt-2 text-xs text-[color:var(--mid)]">
          {totalRows} source rows represented in imported batches
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
          Latest batch
        </p>
        <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
          {latestBatch ? formatDate(latestBatch.created_at) : "No imports yet"}
        </p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="brand-card rounded-2xl p-8">
      <h2 className="brand-title text-2xl font-semibold">
        No seed imports yet
      </h2>
      <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
        Candidate-review seed rows will appear here after an operator runs the
        Slice 4D import path. Manual-review and rejected dry-run rows remain
        report-only.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-950">
      <h2 className="text-xl font-semibold">Seed imports are unavailable</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6">
        The admin shell loaded, but seed import rows could not be read. Check
        the server-side admin/service-role configuration before using this
        surface.
      </p>
    </section>
  );
}

function BatchProvenance({
  batch,
}: {
  batch: SeedImportBatchRow;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="brand-eyebrow">{formatLabel(batch.batch_status)}</p>
          <h2 className="brand-title mt-2 text-2xl font-semibold">
            {batch.batch_name}
          </h2>
          <p className="brand-copy mt-2 text-sm leading-6">
            {batch.source_name}
            {batch.source_dataset ? ` · ${batch.source_dataset}` : ""}
          </p>
        </div>
        <div className="text-left text-xs text-[color:var(--mid)] lg:text-right">
          <p>Created {formatDate(batch.created_at)}</p>
          <p>Dry run {formatDate(batch.dry_run_generated_at)}</p>
          {batch.created_by_admin_email ? (
            <p>Imported by {batch.created_by_admin_email}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-xs md:grid-cols-3">
        <div>
          <dt className="font-semibold text-[color:var(--ink)]">License</dt>
          <dd className="mt-1 text-[color:var(--mid)]">
            {batch.source_license_note}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[color:var(--ink)]">Source file</dt>
          <dd className="mt-1 text-[color:var(--mid)]">
            {batch.source_file_name} · {formatShortHash(batch.source_file_sha256)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[color:var(--ink)]">Dry-run report</dt>
          <dd className="mt-1 text-[color:var(--mid)]">
            {batch.dry_run_report_schema_version} ·{" "}
            {formatShortHash(batch.dry_run_report_sha256)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SeedRowTable({
  batches,
  microSkillNames,
  rows,
}: {
  batches: Map<string, SeedImportBatchRow>;
  microSkillNames: Map<string, string>;
  rows: SeedImportRow[];
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="seed-import-rows-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="seed-import-rows-heading"
          className="brand-title text-2xl font-semibold"
        >
          Imported candidate rows
        </h2>
        <p className="brand-copy mt-2 text-sm leading-6">
          Read-only seed evidence. Decision history is not append-only yet;
          status decisions belong to Slice 4E.2 and canonical adoption belongs
          to Slice 4F.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-[rgba(255,247,220,0.45)] text-left text-[10px] font-medium uppercase leading-tight tracking-normal text-[color:var(--mid)]">
              <th scope="col" className="px-3 py-3">
                Row
              </th>
              <th scope="col" className="px-3 py-3">
                Pair
              </th>
              <th scope="col" className="px-3 py-3">
                Micro-skill
              </th>
              <th scope="col" className="px-3 py-3">
                Source
              </th>
              <th scope="col" className="px-3 py-3">
                Dry run
              </th>
              <th scope="col" className="px-3 py-3">
                Evidence
              </th>
              <th scope="col" className="px-3 py-3">
                Status
              </th>
              <th scope="col" className="px-3 py-3">
                Review
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const batch = batches.get(row.batch_id);
              const microSkillDisplayName = microSkillNames.get(
                row.suggested_micro_skill_key,
              );

              return (
                <tr key={row.id} className="align-top">
                  <th
                    scope="row"
                    className="border-t border-[var(--border)] px-3 py-4 text-xs font-medium text-[color:var(--ink)]"
                  >
                    <span className="block">
                      {batch?.batch_name ?? "Unknown batch"}
                    </span>
                    <span className="mt-1 block text-[color:var(--mid)]">
                      Source row {row.source_row_number}
                    </span>
                    {row.source_row_id ? (
                      <span className="mt-1 block text-[color:var(--mid)]">
                        {row.source_row_id}
                      </span>
                    ) : null}
                  </th>
                  <td className="border-t border-[var(--border)] px-3 py-4">
                    <span className="block text-sm font-semibold text-[color:var(--ink)]">
                      {row.raw_misspelling} to {row.raw_correction}
                    </span>
                    <span className="mt-1 block text-xs text-[color:var(--mid)]">
                      {row.misspelling_normalized} to{" "}
                      {row.correct_spelling_normalized}
                    </span>
                    <span className="mt-1 block text-xs text-[color:var(--mid)]">
                      {row.dialect_code} · {row.normalization_version}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block font-semibold text-[color:var(--ink)]">
                      {microSkillDisplayName ?? row.suggested_micro_skill_key}
                    </span>
                    <span className="mt-1 block">
                      {row.suggested_micro_skill_key}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block font-semibold text-[color:var(--ink)]">
                      {batch?.source_name ?? "Unknown source"}
                    </span>
                    <span className="mt-1 block">
                      {row.source_dataset ?? batch?.source_dataset ?? "No dataset"}
                    </span>
                    <span className="mt-1 block">Confidence {formatConfidence(row)}</span>
                    <span className="mt-1 block">{row.source_note}</span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block font-semibold text-[color:var(--ink)]">
                      {formatLabel(row.dry_run_bucket)}
                    </span>
                    <span className="mt-1 block">
                      {row.dry_run_recommended_next_action
                        ? formatLabel(row.dry_run_recommended_next_action)
                        : "No next action"}
                    </span>
                    <span className="mt-1 block">
                      Reasons {formatJsonCount(row.validation_reasons)}
                    </span>
                    <span className="mt-1 block">
                      Warnings {formatJsonCount(row.manual_review_warnings)}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block">
                      Canonical matches {formatJsonCount(row.canonical_match_ids)}
                    </span>
                    <span className="mt-1 block">
                      Canonical conflicts{" "}
                      {formatJsonCount(row.canonical_conflict_ids)}
                    </span>
                    <span className="mt-1 block">
                      Supporting ids {formatJsonCount(row.supporting_evidence_ids)}
                    </span>
                    <span className="mt-1 block">
                      Supporting counts{" "}
                      {formatJsonCount(row.supporting_evidence_counts)}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block font-semibold text-[color:var(--ink)]">
                      {formatLabel(row.row_status)}
                    </span>
                    <span className="mt-1 block">
                      {row.status_reason ?? "No status reason"}
                    </span>
                    <span className="mt-1 block">
                      Duplicate target{" "}
                      {row.duplicate_of_seed_import_row_id
                        ? formatShortHash(row.duplicate_of_seed_import_row_id)
                        : "none"}
                    </span>
                    <span className="mt-1 block">
                      Canonical mapping{" "}
                      {row.canonical_mapping_id
                        ? formatShortHash(row.canonical_mapping_id)
                        : "none"}
                    </span>
                  </td>
                  <td className="border-t border-[var(--border)] px-3 py-4 text-xs text-[color:var(--mid)]">
                    <span className="block">
                      {row.reviewed_by_admin_email ?? "Not reviewed"}
                    </span>
                    <span className="mt-1 block">{formatDate(row.reviewed_at)}</span>
                    <span className="mt-1 block">
                      {row.review_note ?? "No review note"}
                    </span>
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

async function getSeedImportBatches() {
  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_seed_import_batches")
    .select(
      [
        "id",
        "batch_name",
        "source_name",
        "source_dataset",
        "source_url",
        "source_license_note",
        "source_file_name",
        "source_file_sha256",
        "dry_run_report_schema_version",
        "dry_run_report_sha256",
        "dry_run_generated_at",
        "batch_status",
        "total_row_count",
        "candidate_review_row_count",
        "manual_review_row_count",
        "rejected_row_count",
        "duplicate_row_count",
        "conflict_row_count",
        "created_by_admin_email",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("updated_at", { ascending: false })
    .limit(25);
}

async function getSeedImportRows() {
  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_seed_import_rows")
    .select(
      [
        "id",
        "batch_id",
        "source_row_number",
        "source_row_id",
        "source_row_hash",
        "raw_misspelling",
        "raw_correction",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "dialect_code",
        "normalization_version",
        "suggested_micro_skill_key",
        "source_confidence_raw",
        "source_confidence_normalized",
        "source_note",
        "source_url",
        "source_dataset",
        "age_band",
        "pattern_hint",
        "route_hint",
        "dry_run_bucket",
        "dry_run_report_row_number",
        "dry_run_recommended_next_action",
        "row_status",
        "status_reason",
        "validation_reasons",
        "blocking_errors",
        "manual_review_warnings",
        "canonical_match_ids",
        "canonical_conflict_ids",
        "supporting_evidence_ids",
        "supporting_evidence_counts",
        "duplicate_group_key",
        "conflict_group_key",
        "duplicate_of_seed_import_row_id",
        "reviewed_by_admin_email",
        "reviewed_at",
        "review_note",
        "canonical_mapping_id",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("updated_at", { ascending: false })
    .limit(100);
}

async function getMicroSkillNames(keys: string[]) {
  if (keys.length === 0) {
    return new Map<string, string>();
  }

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name")
    .in("micro_skill_key", keys);

  return new Map(
    ((data ?? []) as MicroSkillRow[]).map((row) => [
      row.micro_skill_key,
      row.display_name,
    ]),
  );
}

export default async function AdminSeedImportReviewPage() {
  await requireAdminUser();

  let batches: SeedImportBatchRow[] = [];
  let rows: SeedImportRow[] = [];
  let hasError = false;

  try {
    const [batchResult, rowResult] = await Promise.all([
      getSeedImportBatches(),
      getSeedImportRows(),
    ]);

    if (batchResult.error || rowResult.error) {
      throw batchResult.error ?? rowResult.error;
    }

    batches = ((batchResult.data ?? []) as unknown) as SeedImportBatchRow[];
    rows = ((rowResult.data ?? []) as unknown) as SeedImportRow[];
  } catch {
    hasError = true;
  }

  const microSkillNames = await getMicroSkillNames([
    ...new Set(rows.map((row) => row.suggested_micro_skill_key)),
  ]);
  const batchMap = new Map(batches.map((batch) => [batch.id, batch]));

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Seed Import Review
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Inspect imported candidate-review seed rows. This surface is
            read-only: it does not make review decisions, create canonical
            mappings, or change resolver visibility.
          </p>
          <Link
            href="/admin/spelling-review"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
          >
            Back to spelling review
          </Link>
        </header>

        {hasError ? (
          <ErrorState />
        ) : batches.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <BatchSummary batches={batches} />
            <div className="grid gap-4 lg:grid-cols-2">
              {batches.slice(0, 2).map((batch) => (
                <BatchProvenance key={batch.id} batch={batch} />
              ))}
            </div>
            <SeedRowTable
              batches={batchMap}
              microSkillNames={microSkillNames}
              rows={rows}
            />
          </>
        )}
      </div>
    </main>
  );
}
