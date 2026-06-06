import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { AdminCaseDecisionRow } from "./admin-decision-row";

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
  source_suggestion_id: string | null;
  created_at: string;
  updated_at: string;
};

type CatalogReviewDecisionRow = {
  id: string;
  case_id: string;
  decision_type: string;
  previous_status: string;
  new_status: string;
  decision_note: string | null;
  linked_micro_skill_key: string | null;
  canonical_mapping_id: string | null;
  admin_email: string | null;
  created_at: string;
};

type MicroSkillOptionRow = {
  micro_skill_key: string;
  display_name: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
};

type SkillFamilyRow = {
  skill_family_key: string;
  display_name: string;
};

type SkillClusterRow = {
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
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

type CaseRowWithEvidence = CatalogReviewCaseRow & {
  sourceCount: number;
  representativeContext: string | null;
  decisions: CatalogReviewDecisionRow[];
  suggestedMicroSkillKey: string | null;
};

type SuggestedMicroSkillRow = {
  id: string;
  suggested_micro_skill_key: string | null;
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

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSourceLabel(value: string) {
  if (value === "lesson_submission_parent_added_missed_word") {
    return "Parent-added";
  }

  if (value === "lesson_submission_existing_output") {
    return "Lesson";
  }

  return formatLabel(value);
}

function readSuggestedMicroSkillKey(row: CatalogReviewCaseRow) {
  const metadataKey =
    readStringMetadata(row.metadata, "suggested_micro_skill_key") ??
    readStringMetadata(row.metadata, "selected_micro_skill_key") ??
    readStringMetadata(row.metadata, "verified_micro_skill_key") ??
    readStringMetadata(row.metadata, "micro_skill_key");

  return metadataKey;
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

function buildSourceCounts(rows: CatalogReviewCaseRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.misspelling_normalized}->${row.correct_spelling_normalized}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function buildDecisionMap(decisions: CatalogReviewDecisionRow[]) {
  const decisionsByCaseId = new Map<string, CatalogReviewDecisionRow[]>();

  for (const decision of decisions) {
    const existing = decisionsByCaseId.get(decision.case_id) ?? [];
    existing.push(decision);
    decisionsByCaseId.set(decision.case_id, existing);
  }

  return decisionsByCaseId;
}

function buildCasesWithEvidence(input: {
  rows: CatalogReviewCaseRow[];
  decisions: CatalogReviewDecisionRow[];
  suggestedMicroSkillKeys: Map<string, string>;
}) {
  const sourceCounts = buildSourceCounts(input.rows);
  const decisionsByCaseId = buildDecisionMap(input.decisions);

  return input.rows.map((row) => {
    const groupKey = `${row.misspelling_normalized}->${row.correct_spelling_normalized}`;

    return {
      ...row,
      sourceCount: sourceCounts.get(groupKey) ?? 1,
      representativeContext: readStringMetadata(row.metadata, "context_text"),
      decisions: decisionsByCaseId.get(row.id) ?? [],
      suggestedMicroSkillKey:
        readSuggestedMicroSkillKey(row) ??
        (row.source_suggestion_id
          ? input.suggestedMicroSkillKeys.get(row.source_suggestion_id) ?? null
          : null),
    };
  });
}

function buildSkillFamilyOptions(families: SkillFamilyRow[]) {
  return families.sort((left, right) =>
    left.display_name.localeCompare(right.display_name),
  );
}

function buildSkillClusterOptions(clusters: SkillClusterRow[]) {
  return clusters.sort((left, right) =>
    left.display_name.localeCompare(right.display_name),
  );
}

function buildMicroSkillOptions(options: MicroSkillOptionRow[]) {
  return options.sort((left, right) =>
    left.display_name.localeCompare(right.display_name),
  );
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

function AdminSetupWarnings({
  decisionStorageUnavailable,
  microSkillOptionsUnavailable,
}: {
  decisionStorageUnavailable: boolean;
  microSkillOptionsUnavailable: boolean;
}) {
  if (!decisionStorageUnavailable && !microSkillOptionsUnavailable) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950"
      aria-label="Admin decision setup warnings"
    >
      <p className="font-semibold">Admin decision setup needs attention</p>
      {decisionStorageUnavailable ? (
        <p className="mt-2">
          The case list is available, but Slice 4D.1 decision storage could not
          be read. Apply the Slice 4D.1 migration before resolving cases.
        </p>
      ) : null}
      {microSkillOptionsUnavailable ? (
        <p className="mt-2">
          Active D4 micro-skill options could not be loaded. Add canonical
          mapping decisions should wait until the catalog option read is
          healthy.
        </p>
      ) : null}
    </section>
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

function AdminCaseDecisionTable({
  cases,
  canResolveCases,
  familyOptions,
  clusterOptions,
  microSkillOptions,
  microSkillOptionsUnavailable,
}: {
  cases: CaseRowWithEvidence[];
  canResolveCases: boolean;
  familyOptions: SkillFamilyRow[];
  clusterOptions: SkillClusterRow[];
  microSkillOptions: MicroSkillOptionRow[];
  microSkillOptionsUnavailable: boolean;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="admin-case-decision-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="admin-case-decision-heading"
          className="brand-title text-2xl font-semibold"
        >
          Case decisions
        </h2>
        <p className="brand-copy mt-2 text-sm">
          Resolve individual open cases only. Add canonical mapping creates
          canonical storage. Resolver use requires separate resolver visibility
          enablement and the runtime feature flag.
        </p>
      </div>

      <div>
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="bg-[rgba(255,247,220,0.45)] text-left text-[10px] font-medium uppercase leading-tight tracking-normal text-[color:var(--mid)]">
              <th scope="col" className="px-2 py-3">
                Wrong Word
              </th>
              <th scope="col" className="px-2 py-3">
                Correct Word
              </th>
              <th scope="col" className="px-2 py-3">
                Reason
              </th>
              <th scope="col" className="px-2 py-3">
                Skill Family
              </th>
              <th scope="col" className="px-2 py-3">
                Skill Cluster
              </th>
              <th scope="col" className="px-2 py-3">
                Micro-skill
              </th>
              <th scope="col" className="px-2 py-3">
                Decision
              </th>
              <th scope="col" className="px-2 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {cases.map((row) => (
              <AdminCaseDecisionRow
                key={row.id}
                canResolveCases={canResolveCases}
                caseId={row.id}
                correctWord={
                  row.original_correct_spelling ?? row.correct_spelling_normalized
                }
                currentStatus={row.case_status}
                decisions={row.decisions}
                defaultMicroSkillKey={row.suggestedMicroSkillKey}
                evidenceCount={row.sourceCount}
                familyOptions={familyOptions}
                clusterOptions={clusterOptions}
                microSkillOptions={microSkillOptions}
                microSkillOptionsUnavailable={microSkillOptionsUnavailable}
                originalCorrectWord={row.original_correct_spelling}
                originalWrongWord={row.original_child_spelling}
                parentNote={row.parent_note}
                representativeContext={row.representativeContext}
                sourceLabel={formatSourceLabel(row.source_provenance)}
                wrongWord={row.original_child_spelling ?? row.misspelling_normalized}
              />
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
        "source_suggestion_id",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("case_status", "open")
    .order("updated_at", { ascending: false });
}

async function getCatalogReviewDecisionRows(caseIds: string[]) {
  if (caseIds.length === 0) {
    return { data: [] as CatalogReviewDecisionRow[], error: null };
  }

  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_catalog_review_case_decisions")
    .select(
      [
        "id",
        "case_id",
        "decision_type",
        "previous_status",
        "new_status",
        "decision_note",
        "linked_micro_skill_key",
        "canonical_mapping_id",
        "admin_email",
        "created_at",
      ].join(", "),
    )
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
}

async function getSuggestedMicroSkillRows(sourceSuggestionIds: string[]) {
  if (sourceSuggestionIds.length === 0) {
    return { data: [] as SuggestedMicroSkillRow[], error: null };
  }

  const supabase = createServiceRoleClient();

  return supabase
    .from("writing_issue_suggestions")
    .select("id, suggested_micro_skill_key")
    .in("id", sourceSuggestionIds);
}

async function getAdminMicroSkillOptions() {
  const supabase = createServiceRoleClient();
  const { data: microSkills, error: microSkillError } = await supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name, skill_family_key, skill_cluster_key")
    .eq("mastery_domain_key", "D4")
    .eq("is_active", true)
    .eq("is_assignable", true)
    .order("display_name", { ascending: true });

  if (microSkillError) {
    return {
      clusterOptions: [] as SkillClusterRow[],
      error: microSkillError,
      familyOptions: [] as SkillFamilyRow[],
      microSkillOptions: [] as MicroSkillOptionRow[],
    };
  }

  const microSkillOptions = (microSkills ?? []) as unknown as MicroSkillOptionRow[];
  const familyKeys = Array.from(
    new Set(microSkillOptions.map((row) => row.skill_family_key).filter(Boolean)),
  );
  const clusterKeys = Array.from(
    new Set(
      microSkillOptions
        .map((row) => row.skill_cluster_key)
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    ),
  );
  const [{ data: families }, { data: clusters }] = await Promise.all([
    familyKeys.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("micro_skill_families")
          .select("skill_family_key, display_name")
          .in("skill_family_key", familyKeys)
          .order("display_name", { ascending: true }),
    clusterKeys.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("micro_skill_clusters")
          .select("skill_family_key, skill_cluster_key, display_name")
          .in("skill_cluster_key", clusterKeys)
          .order("display_name", { ascending: true }),
  ]);

  return {
    clusterOptions: buildSkillClusterOptions(
      ((clusters ?? []) as unknown) as SkillClusterRow[],
    ),
    error: null,
    familyOptions: buildSkillFamilyOptions(
      ((families ?? []) as unknown) as SkillFamilyRow[],
    ),
    microSkillOptions: buildMicroSkillOptions(microSkillOptions),
  };
}

type AdminCatalogReviewPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminCatalogReviewPage({
  searchParams,
}: AdminCatalogReviewPageProps) {
  await requireAdminUser();

  let rows: CatalogReviewCaseRow[] = [];
  let decisions: CatalogReviewDecisionRow[] = [];
  let familyOptions: SkillFamilyRow[] = [];
  let clusterOptions: SkillClusterRow[] = [];
  let microSkillOptions: MicroSkillOptionRow[] = [];
  let suggestedMicroSkillKeys = new Map<string, string>();
  let hasError = false;
  let decisionStorageUnavailable = false;
  let microSkillOptionsUnavailable = false;
  const resolvedSearchParams = await searchParams;

  try {
    const { data, error } = await getOpenCatalogReviewCases();

    if (error) {
      hasError = true;
    } else {
      rows = ((data ?? []) as unknown) as CatalogReviewCaseRow[];
    }

    const sourceSuggestionIds = Array.from(
      new Set(rows.map((row) => row.source_suggestion_id).filter(Boolean)),
    ) as string[];
    const [
      { data: decisionData, error: decisionError },
      { data: suggestedMicroSkillData },
      microSkillOptionResult,
    ] = await Promise.all([
      getCatalogReviewDecisionRows(rows.map((row) => row.id)),
      getSuggestedMicroSkillRows(sourceSuggestionIds),
      getAdminMicroSkillOptions(),
    ]);

    if (decisionError) {
      decisionStorageUnavailable = true;
    } else {
      decisions = ((decisionData ?? []) as unknown) as CatalogReviewDecisionRow[];
    }

    if (microSkillOptionResult.error) {
      microSkillOptionsUnavailable = true;
    } else {
      familyOptions = microSkillOptionResult.familyOptions;
      clusterOptions = microSkillOptionResult.clusterOptions;
      microSkillOptions = microSkillOptionResult.microSkillOptions;
    }

    suggestedMicroSkillKeys = new Map(
      (((suggestedMicroSkillData ?? []) as unknown) as SuggestedMicroSkillRow[])
        .filter((row) => row.suggested_micro_skill_key)
        .map((row) => [row.id, row.suggested_micro_skill_key as string]),
    );
  } catch {
    hasError = true;
  }

  const groups = buildCatalogReviewGroups(rows);
  const cases = buildCasesWithEvidence({
    decisions,
    rows,
    suggestedMicroSkillKeys,
  });

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-4xl">
          <p className="brand-eyebrow">Admin</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            Catalog review
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            Internal per-case resolution for parent-raised spelling catalog
            gaps. Add canonical mapping creates canonical storage. Resolver use
            requires separate resolver visibility enablement and the runtime
            feature flag. Historical Slice 4D.1 decisions stay readable as
            case-only history.
          </p>
        </header>

        <StatusMessage
          error={resolvedSearchParams?.error}
          saved={resolvedSearchParams?.saved}
        />

        <AdminSetupWarnings
          decisionStorageUnavailable={decisionStorageUnavailable}
          microSkillOptionsUnavailable={microSkillOptionsUnavailable}
        />

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
              Canonical curation
            </p>
          </div>
        </section>

        {hasError ? (
          <ErrorState />
        ) : groups.length === 0 ? (
          <EmptyState />
        ) : (
          <AdminCaseDecisionTable
            cases={cases}
            canResolveCases={!decisionStorageUnavailable}
            clusterOptions={clusterOptions}
            familyOptions={familyOptions}
            microSkillOptions={microSkillOptions}
            microSkillOptionsUnavailable={microSkillOptionsUnavailable}
          />
        )}
      </div>
    </main>
  );
}
