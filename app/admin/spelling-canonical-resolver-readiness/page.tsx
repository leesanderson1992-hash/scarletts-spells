import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  classifyResolverVisibilityReadiness,
  type ResolverVisibilityReadinessClassification,
  type ResolverVisibilityReadinessConflictSummaryInput,
  type ResolverVisibilityReadinessEventInput,
  type ResolverVisibilityReadinessEventSummaryInput,
  type ResolverVisibilityReadinessMappingInput,
  type ResolverVisibilityReadinessMicroSkillInput,
  type ResolverVisibilityReadinessRecommendationInput,
  type ResolverVisibilityReadinessSeedImportInput,
  type ResolverVisibilityReadinessState,
} from "@/lib/writing-engine/spelling/resolver-visibility-readiness";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  state?: string;
};

type CanonicalMappingReadModel = {
  id: string;
  misspelling_normalized: string | null;
  correct_spelling_normalized: string | null;
  micro_skill_key: string | null;
  mapping_status: string | null;
  resolver_visibility_status: string | null;
  dialect_code: string | null;
  normalization_version: string | null;
  source_case_id: string | null;
  source_decision_id: string | null;
  source_recommendation_id: string | null;
  source_candidate_mapping_id: string | null;
  source_parent_verification_id: string | null;
  source_seed_import_row_id: string | null;
  created_by_admin_user_id: string | null;
  created_by_admin_email: string | null;
  deactivated_by_admin_user_id: string | null;
  deactivated_by_admin_email: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
};

type MicroSkillReadModel = {
  micro_skill_key: string;
  display_name: string | null;
  mastery_domain_key: string | null;
  is_active: boolean | null;
  is_assignable: boolean | null;
};

type CanonicalMappingEventReadModel = {
  id: string;
  mapping_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  previous_resolver_visibility_status: string | null;
  new_resolver_visibility_status: string | null;
  admin_user_id: string | null;
  admin_email: string | null;
  source_case_id: string | null;
  source_decision_id: string | null;
  source_recommendation_id: string | null;
  source_seed_import_row_id: string | null;
  note: string | null;
  created_at: string;
};

type EventSummaryReadModel = {
  has_created_event: boolean;
  has_seed_import_adopted_event: boolean;
  has_pcrm_adopted_event: boolean;
  latest_event_at: string | null;
  event_count: number;
  latest_events: CanonicalMappingEventReadModel[];
};

type SeedImportLineageReadModel = {
  id: string;
  row_status: string | null;
  canonical_mapping_id: string | null;
  source_row_number: number | null;
  source_row_id: string | null;
  source_dataset: string | null;
  source_note: string | null;
  reviewed_by_admin_user_id: string | null;
  reviewed_by_admin_email: string | null;
  reviewed_at: string | null;
  batch: {
    id: string;
    batch_name: string | null;
    source_name: string | null;
    source_dataset: string | null;
    source_license_note: string | null;
    source_file_name: string | null;
    source_file_sha256: string | null;
    dry_run_report_schema_version: string | null;
    dry_run_report_sha256: string | null;
  } | null;
};

type PcrmLineageReadModel = {
  id: string;
  recommendation_status: string | null;
  canonical_mapping_id: string | null;
  source_row_type: string | null;
  source_provenance: string | null;
  parent_verification_id: string | null;
  candidate_mapping_id: string | null;
  reviewed_by_admin_user_id: string | null;
  reviewed_by_admin_email: string | null;
  reviewed_at: string | null;
};

type CatalogLineageReadModel = {
  source_case_id: string | null;
  source_decision_id: string | null;
  has_catalog_case_decision_lineage: boolean;
};

type LineageSummaryReadModel = {
  seed_import: SeedImportLineageReadModel | null;
  pcrm: PcrmLineageReadModel | null;
  catalog: CatalogLineageReadModel;
};

type ConflictSummaryReadModel = {
  has_active_exact_pair_different_micro_skill: boolean;
  has_active_same_misspelling_conflicting_correction: boolean;
  has_inactive_exact_pair_historical_mapping: boolean;
};

type ResolverReadinessReadModel = {
  readiness_state: ResolverVisibilityReadinessState;
  readiness_source: string;
  mapping: CanonicalMappingReadModel;
  micro_skill: MicroSkillReadModel | null;
  event_summary: EventSummaryReadModel;
  lineage_summary: LineageSummaryReadModel;
  conflict_summary: ConflictSummaryReadModel;
};

type ResolverReadinessRpcRow = {
  total_count: number;
  readiness_row: ResolverReadinessReadModel;
};

type ReadinessRow = ResolverReadinessReadModel & {
  classification: ResolverVisibilityReadinessClassification;
};

const PAGE_SIZE = 25;
const STATE_FILTERS: Array<ResolverVisibilityReadinessState | "all"> = [
  "all",
  "eligible_for_visibility_review",
  "needs_manual_authority_review",
  "blocked",
];

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

function parsePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseState(value: string | undefined) {
  return STATE_FILTERS.includes(value as ResolverVisibilityReadinessState)
    ? (value as ResolverVisibilityReadinessState | "all")
    : "all";
}

function shortId(value: string | null | undefined) {
  if (!value) {
    return "none";
  }

  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function stateClassName(state: ResolverVisibilityReadinessState) {
  if (state === "eligible_for_visibility_review") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (state === "needs_manual_authority_review") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }

  return "border-rose-200 bg-rose-50 text-rose-950";
}

function mapMappingInput(
  mapping: CanonicalMappingReadModel,
): ResolverVisibilityReadinessMappingInput {
  return {
    id: mapping.id,
    misspellingNormalized: mapping.misspelling_normalized,
    correctSpellingNormalized: mapping.correct_spelling_normalized,
    microSkillKey: mapping.micro_skill_key,
    mappingStatus: mapping.mapping_status,
    resolverVisibilityStatus: mapping.resolver_visibility_status,
    dialectCode: mapping.dialect_code,
    sourceSeedImportRowId: mapping.source_seed_import_row_id,
    sourceRecommendationId: mapping.source_recommendation_id,
    sourceCaseId: mapping.source_case_id,
    sourceDecisionId: mapping.source_decision_id,
  };
}

function mapMicroSkillInput(
  microSkill: MicroSkillReadModel | null,
): ResolverVisibilityReadinessMicroSkillInput | null {
  if (!microSkill?.micro_skill_key) {
    return null;
  }

  return {
    microSkillKey: microSkill.micro_skill_key,
    masteryDomainKey: microSkill.mastery_domain_key,
    isActive: microSkill.is_active,
    isAssignable: microSkill.is_assignable,
  };
}

function mapEventInput(
  event: CanonicalMappingEventReadModel,
): ResolverVisibilityReadinessEventInput {
  return {
    eventType: event.event_type,
    newStatus: event.new_status,
    sourceSeedImportRowId: event.source_seed_import_row_id,
    sourceRecommendationId: event.source_recommendation_id,
    sourceCaseId: event.source_case_id,
    sourceDecisionId: event.source_decision_id,
  };
}

function mapEventSummaryInput(
  summary: EventSummaryReadModel,
): ResolverVisibilityReadinessEventSummaryInput {
  return {
    hasCreatedEvent: summary.has_created_event,
    hasSeedImportAdoptedEvent: summary.has_seed_import_adopted_event,
    hasPcrmAdoptedEvent: summary.has_pcrm_adopted_event,
  };
}

function mapSeedInput(
  row: SeedImportLineageReadModel | null,
): ResolverVisibilityReadinessSeedImportInput | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    rowStatus: row.row_status,
    canonicalMappingId: row.canonical_mapping_id,
  };
}

function mapRecommendationInput(
  row: PcrmLineageReadModel | null,
): ResolverVisibilityReadinessRecommendationInput | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    recommendationStatus: row.recommendation_status,
    canonicalMappingId: row.canonical_mapping_id,
  };
}

function mapConflictSummaryInput(
  summary: ConflictSummaryReadModel,
): ResolverVisibilityReadinessConflictSummaryInput {
  return {
    hasActiveExactPairDifferentMicroSkill:
      summary.has_active_exact_pair_different_micro_skill,
    hasActiveSameMisspellingConflictingCorrection:
      summary.has_active_same_misspelling_conflicting_correction,
    hasInactiveExactPairHistoricalMapping:
      summary.has_inactive_exact_pair_historical_mapping,
  };
}

async function getReadinessPage(input: {
  page: number;
  state: ResolverVisibilityReadinessState | "all";
}) {
  const supabase = createServiceRoleClient();
  const offset = (input.page - 1) * PAGE_SIZE;
  const { data, error } = await supabase.rpc(
    "get_spelling_canonical_resolver_readiness_admin",
    {
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_readiness_state: input.state,
    },
  );

  if (error) {
    throw error;
  }

  const rows = (((data ?? []) as unknown) as ResolverReadinessRpcRow[]).map(
    (row): ReadinessRow => {
      const readinessRow = row.readiness_row;

      return {
        ...readinessRow,
        classification: classifyResolverVisibilityReadiness({
          mapping: mapMappingInput(readinessRow.mapping),
          microSkill: mapMicroSkillInput(readinessRow.micro_skill),
          events: readinessRow.event_summary.latest_events.map(mapEventInput),
          eventSummary: mapEventSummaryInput(readinessRow.event_summary),
          seedImportRow: mapSeedInput(
            readinessRow.lineage_summary.seed_import,
          ),
          recommendation: mapRecommendationInput(
            readinessRow.lineage_summary.pcrm,
          ),
          conflictSummary: mapConflictSummaryInput(
            readinessRow.conflict_summary,
          ),
        }),
      };
    },
  );

  return {
    rows,
    totalCount: rows[0]?.classification
      ? Number((((data ?? []) as unknown) as ResolverReadinessRpcRow[])[0]?.total_count ?? 0)
      : 0,
  };
}

function FilterControls({
  selectedState,
}: {
  selectedState: ResolverVisibilityReadinessState | "all";
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Readiness filters">
      {STATE_FILTERS.map((state) => {
        const href =
          state === "all"
            ? "/admin/spelling-canonical-resolver-readiness"
            : `/admin/spelling-canonical-resolver-readiness?state=${state}`;

        return (
          <Link
            key={state}
            href={href}
            className={`inline-flex min-h-10 items-center rounded-xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2 ${
              selectedState === state
                ? "border-[var(--scarlett)] bg-[var(--scarlett)] text-white"
                : "border-[var(--border)] bg-white text-[color:var(--ink)] hover:bg-[var(--mist)]"
            }`}
          >
            {formatLabel(state)}
          </Link>
        );
      })}
    </nav>
  );
}

function PaginationControls({
  page,
  state,
  totalCount,
}: {
  page: number;
  state: ResolverVisibilityReadinessState | "all";
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const stateParam = state === "all" ? "" : `&state=${state}`;
  const previousHref =
    page <= 2
      ? `/admin/spelling-canonical-resolver-readiness${state === "all" ? "" : `?state=${state}`}`
      : `/admin/spelling-canonical-resolver-readiness?page=${page - 1}${stateParam}`;
  const nextHref = `/admin/spelling-canonical-resolver-readiness?page=${
    page + 1
  }${stateParam}`;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white/90 p-4 text-sm"
      aria-label="Readiness pagination"
    >
      <p className="text-[color:var(--mid)]">
        Page {page} of {totalPages} · {totalCount} matching hidden mappings
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={previousHref}
            className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)]"
          >
            Previous
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[color:var(--mid)]">
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={nextHref}
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

function Summary({
  rows,
  totalCount,
}: {
  rows: ReadinessRow[];
  totalCount: number;
}) {
  const counts = new Map<ResolverVisibilityReadinessState, number>();

  for (const row of rows) {
    counts.set(
      row.classification.state,
      (counts.get(row.classification.state) ?? 0) + 1,
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-4" aria-label="Readiness summary">
      <div className="rounded-2xl border border-[var(--border)] bg-white/90 p-5">
        <p className="text-xs font-medium uppercase text-[color:var(--mid)]">
          Matching mappings
        </p>
        <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
          {totalCount}
        </p>
      </div>
      {STATE_FILTERS.filter(
        (state): state is ResolverVisibilityReadinessState => state !== "all",
      ).map((state) => (
        <div
          key={state}
          className={`rounded-2xl border p-5 ${stateClassName(state)}`}
        >
          <p className="text-xs font-medium uppercase">
            {formatLabel(state)} on page
          </p>
          <p className="mt-2 text-3xl font-semibold">{counts.get(state) ?? 0}</p>
        </div>
      ))}
    </section>
  );
}

function LineageDetails({ row }: { row: ReadinessRow }) {
  const { mapping, lineage_summary: lineage } = row;
  const seedImport = lineage.seed_import;
  const recommendation = lineage.pcrm;

  return (
    <div className="grid gap-3 text-xs text-[color:var(--mid)] lg:grid-cols-3">
      <div>
        <p className="font-semibold text-[color:var(--ink)]">Canonical lineage</p>
        <p>Case {shortId(mapping.source_case_id)}</p>
        <p>Decision {shortId(mapping.source_decision_id)}</p>
        <p>Recommendation {shortId(mapping.source_recommendation_id)}</p>
        <p>Candidate {shortId(mapping.source_candidate_mapping_id)}</p>
        <p>Parent verification {shortId(mapping.source_parent_verification_id)}</p>
        <p>Seed row {shortId(mapping.source_seed_import_row_id)}</p>
      </div>
      <div>
        <p className="font-semibold text-[color:var(--ink)]">Seed import lineage</p>
        {seedImport ? (
          <>
            <p>Status {formatLabel(seedImport.row_status ?? "unknown")}</p>
            <p>Source row {seedImport.source_row_number ?? "unknown"}</p>
            <p>Source id {seedImport.source_row_id ?? "none"}</p>
            <p>Dataset {seedImport.source_dataset ?? "none"}</p>
            <p>Reviewed by {seedImport.reviewed_by_admin_email ?? "unknown"}</p>
            <p>Reviewed {formatDate(seedImport.reviewed_at)}</p>
            {seedImport.batch ? (
              <p>
                Batch {seedImport.batch.batch_name ?? "unknown"} ·{" "}
                {seedImport.batch.source_name ?? "unknown source"}
              </p>
            ) : null}
          </>
        ) : (
          <p>No seed import lineage.</p>
        )}
      </div>
      <div>
        <p className="font-semibold text-[color:var(--ink)]">PCRM lineage</p>
        {recommendation ? (
          <>
            <p>
              Status {formatLabel(recommendation.recommendation_status ?? "unknown")}
            </p>
            <p>Source {recommendation.source_row_type ?? "unknown"}</p>
            <p>Provenance {recommendation.source_provenance ?? "unknown"}</p>
            <p>Reviewed by {recommendation.reviewed_by_admin_email ?? "unknown"}</p>
            <p>Reviewed {formatDate(recommendation.reviewed_at)}</p>
          </>
        ) : (
          <p>No PCRM lineage.</p>
        )}
      </div>
    </div>
  );
}

function EventDetails({ row }: { row: ReadinessRow }) {
  const { event_summary: summary } = row;
  const events = summary.latest_events ?? [];

  return (
    <div className="mt-3 grid gap-3">
      <div className="grid gap-2 text-xs text-[color:var(--mid)] sm:grid-cols-3">
        <p>Created event: {summary.has_created_event ? "yes" : "no"}</p>
        <p>
          Seed adoption event:{" "}
          {summary.has_seed_import_adopted_event ? "yes" : "no"}
        </p>
        <p>PCRM adoption event: {summary.has_pcrm_adopted_event ? "yes" : "no"}</p>
        <p>Event count: {summary.event_count}</p>
        <p>Latest event: {formatDate(summary.latest_event_at)}</p>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-[color:var(--mid)]">
          No canonical mapping events were found for this mapping.
        </p>
      ) : (
        <div className="grid gap-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs text-[color:var(--mid)]"
            >
              <p className="font-semibold text-[color:var(--ink)]">
                {formatLabel(event.event_type)} · {formatDate(event.created_at)}
              </p>
              <p>
                Status {event.previous_status ?? "none"} to{" "}
                {event.new_status ?? "none"}
              </p>
              <p>
                Resolver {event.previous_resolver_visibility_status ?? "none"} to{" "}
                {event.new_resolver_visibility_status ?? "none"}
              </p>
              <p>Admin {event.admin_email ?? shortId(event.admin_user_id)}</p>
              {event.note ? <p>Note {event.note}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadinessTable({ rows }: { rows: ReadinessRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="brand-card rounded-2xl p-8">
        <h2 className="brand-title text-2xl font-semibold">
          No hidden mappings match this filter
        </h2>
        <p className="brand-copy mt-3 text-sm leading-6">
          This readiness audit only lists active canonical mappings that are
          still hidden from the resolver.
        </p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="resolver-readiness-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="resolver-readiness-heading"
          className="brand-title text-2xl font-semibold"
        >
          Hidden canonical mapping readiness
        </h2>
        <p className="brand-copy mt-2 text-sm leading-6">
          Readiness only. This table does not enable resolver visibility and
          does not make hidden mappings available to Stage 2A or Stage 2C.
        </p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <article key={row.mapping.id} className="grid gap-4 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[color:var(--ink)]">
                  {row.mapping.misspelling_normalized} to{" "}
                  {row.mapping.correct_spelling_normalized}
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  {row.mapping.dialect_code} ·{" "}
                  {row.mapping.normalization_version ?? "unknown normalization"} ·
                  mapping {shortId(row.mapping.id)}
                </p>
                <p className="mt-1 text-xs text-[color:var(--mid)]">
                  {row.micro_skill?.display_name ?? row.mapping.micro_skill_key} ·{" "}
                  {row.mapping.micro_skill_key}
                </p>
              </div>
              <div className="flex flex-col gap-2 lg:items-end">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${stateClassName(row.classification.state)}`}
                >
                  {formatLabel(row.classification.state)}
                </span>
                <span className="text-xs text-[color:var(--mid)]">
                  Source {formatLabel(row.classification.source)}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] p-4">
              <p className="text-xs font-semibold text-[color:var(--ink)]">
                Readiness reasons
              </p>
              {row.classification.reasons.length === 0 ? (
                <p className="mt-2 text-xs text-[color:var(--mid)]">
                  No blocking reasons found. Later visibility enablement would
                  still require a separate explicit admin action.
                </p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--mid)]">
                  {row.classification.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-1"
                    >
                      {formatLabel(reason)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <LineageDetails row={row} />

            <details className="rounded-xl border border-[var(--border)] bg-white p-4">
              <summary className="cursor-pointer text-xs font-semibold text-[color:var(--ink)]">
                Canonical mapping event summary
              </summary>
              <EventDetails row={row} />
            </details>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              Future action placeholder: visibility enablement is intentionally
              unavailable in Slice 4G.0a.
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function AdminSpellingCanonicalResolverReadinessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdminUser();

  const params = (await searchParams) ?? {};
  const selectedState = parseState(params.state);
  const page = parsePage(params.page);
  const { rows, totalCount } = await getReadinessPage({
    page,
    state: selectedState,
  });

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Resolver Visibility Readiness
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Read-only audit of hidden active canonical mappings that may need a
            later resolver visibility decision. This surface does not enable
            visibility, write canonical mappings, or change resolver behavior.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/spelling-review"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              Back to spelling review
            </Link>
            <Link
              href="/admin/canonical-mappings"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)] transition hover:bg-[var(--mist)] focus:outline-none focus:ring-2 focus:ring-[var(--scarlett)] focus:ring-offset-2"
            >
              Open visibility controls
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          Readiness is audit-only. It is not assignment eligibility, mastery
          evidence, Review Work behavior, scoring input, analytics policy, or
          resolver visibility.
        </section>

        <Summary rows={rows} totalCount={totalCount} />
        <FilterControls selectedState={selectedState} />
        <PaginationControls
          page={page}
          state={selectedState}
          totalCount={totalCount}
        />
        <ReadinessTable rows={rows} />
      </div>
    </main>
  );
}
