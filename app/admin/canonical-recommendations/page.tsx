import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { AdminRecommendationRow } from "./admin-recommendation-row";

export const dynamic = "force-dynamic";

type CanonicalRecommendationRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  source_row_type: string;
  source_provenance: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  recommendation_status: string;
  duplicate_of_recommendation_id: string | null;
  merge_target_recommendation_id: string | null;
  superseded_by_recommendation_id: string | null;
  reviewed_by_admin_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
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

function formatSourceLabel(value: string) {
  if (value === "lesson_submission_parent_added_missed_word") {
    return "Parent-added";
  }

  if (value === "lesson_submission_existing_output") {
    return "Lesson";
  }

  return formatLabel(value);
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

function EmptyState() {
  return (
    <section className="brand-card rounded-2xl p-8">
      <h2 className="brand-title text-2xl font-semibold">
        No recommendations yet
      </h2>
      <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
        Parent-submitted canonical mapping recommendations will appear here
        after a parent recommends a promoted parent-local spelling pair.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-950">
      <h2 className="text-xl font-semibold">
        Recommendations are unavailable
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6">
        The admin shell loaded, but PCRM recommendation evidence could not be
        read. Check the server-side admin/service-role configuration before
        using this surface.
      </p>
    </section>
  );
}

function RecommendationTable({
  microSkillNames,
  recommendations,
}: {
  microSkillNames: Map<string, string>;
  recommendations: CanonicalRecommendationRow[];
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/90 shadow-[var(--shadow-soft)]"
      aria-labelledby="admin-recommendation-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <h2
          id="admin-recommendation-heading"
          className="brand-title text-2xl font-semibold"
        >
          Recommendation decisions
        </h2>
        <p className="brand-copy mt-2 text-sm">
          Curate parent recommendation evidence only. Accepting here does not
          create resolver-visible truth; resolver adoption remains a future
          PCRM slice.
        </p>
      </div>

      <div>
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[20%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[21%]" />
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
                Micro-skill
              </th>
              <th scope="col" className="px-2 py-3">
                Status
              </th>
              <th scope="col" className="px-2 py-3">
                Source
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
            {recommendations.map((row) => (
              <AdminRecommendationRow
                key={row.id}
                childId={row.child_id}
                correctWord={
                  row.original_correct_spelling ?? row.correct_spelling_normalized
                }
                createdAt={row.created_at}
                currentStatus={row.recommendation_status}
                microSkillDisplayName={
                  microSkillNames.get(row.micro_skill_key) ?? null
                }
                microSkillKey={row.micro_skill_key}
                originalCorrectWord={row.original_correct_spelling}
                originalWrongWord={row.original_child_spelling}
                parentUserId={row.parent_user_id}
                recommendationId={row.id}
                reviewNote={row.review_note}
                reviewedAt={row.reviewed_at}
                reviewedByAdminEmail={row.reviewed_by_admin_email}
                sourceLabel={formatSourceLabel(row.source_provenance)}
                sourceRowType={row.source_row_type}
                targetRecommendationId={
                  row.duplicate_of_recommendation_id ??
                  row.merge_target_recommendation_id ??
                  row.superseded_by_recommendation_id
                }
                wrongWord={
                  row.original_child_spelling ?? row.misspelling_normalized
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function getCanonicalRecommendations() {
  const supabase = createServiceRoleClient();

  return supabase
    .from("spelling_canonical_mapping_recommendations")
    .select(
      [
        "id",
        "parent_user_id",
        "child_id",
        "source_row_type",
        "source_provenance",
        "original_child_spelling",
        "original_correct_spelling",
        "misspelling_normalized",
        "correct_spelling_normalized",
        "micro_skill_key",
        "recommendation_status",
        "duplicate_of_recommendation_id",
        "merge_target_recommendation_id",
        "superseded_by_recommendation_id",
        "reviewed_by_admin_email",
        "reviewed_at",
        "review_note",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("updated_at", { ascending: false })
    .limit(100);
}

async function getMicroSkillNames(keys: string[]) {
  if (keys.length === 0) {
    return { data: [] as MicroSkillRow[], error: null };
  }

  const supabase = createServiceRoleClient();

  return supabase
    .from("micro_skill_catalog")
    .select("micro_skill_key, display_name")
    .in("micro_skill_key", keys);
}

export default async function AdminCanonicalRecommendationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdminUser();

  const params = (await searchParams) ?? {};
  const { data, error } = await getCanonicalRecommendations();
  const recommendations = ((data ?? []) as unknown) as CanonicalRecommendationRow[];
  const microSkillKeys = [
    ...new Set(
      recommendations
        .map((row) => row.micro_skill_key)
        .filter((key) => key.length > 0),
    ),
  ];
  const { data: microSkillRows } = await getMicroSkillNames(microSkillKeys);
  const microSkillNames = new Map(
    ((microSkillRows ?? []) as MicroSkillRow[]).map((row) => [
      row.micro_skill_key,
      row.display_name,
    ]),
  );

  return (
    <main className="min-h-screen bg-[var(--paper)] px-4 py-8 text-[color:var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="max-w-3xl">
          <p className="brand-kicker">Admin</p>
          <h1 className="brand-title mt-2 text-4xl font-semibold">
            Canonical recommendations
          </h1>
          <p className="brand-copy mt-3 text-sm leading-6">
            Review parent-submitted spelling canonical recommendation evidence.
            This surface records admin curation status only; it does not change
            resolver behavior.
          </p>
        </header>

        <StatusMessage error={params.error} saved={params.saved} />

        {error ? (
          <ErrorState />
        ) : recommendations.length === 0 ? (
          <EmptyState />
        ) : (
          <RecommendationTable
            microSkillNames={microSkillNames}
            recommendations={recommendations}
          />
        )}
      </div>
    </main>
  );
}
