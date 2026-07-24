import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADLE_CANONICAL_INTAKE_FEATURE_FLAG } from "@/lib/adle/canonical-intake";

export const dynamic = "force-dynamic";

export default async function AdleCanonicalIntakeReadinessPage() {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const [
    candidateResult,
    sourceResult,
    scheduleResult,
    itemResult,
    routeResult,
  ] = await Promise.all([
    db
      .from("parent_verified_spelling_candidate_mappings")
      .select("id,candidate_status")
      .limit(20000),
    db
      .from("adle_learning_item_sources")
      .select("parent_verified_candidate_mapping_id")
      .eq("row_status", "active")
      .limit(20000),
    db
      .from("adle_review_schedule_words")
      .select("id,child_id,canonical_word_id")
      .eq("row_status", "active")
      .limit(10000),
    db
      .from("adle_learning_items")
      .select("child_id,canonical_word_id,micro_skill_key,item_status")
      .eq("row_status", "active")
      .neq("item_status", "resolved")
      .limit(20000),
    db
      .from("adle_review_schedule_word_routes")
      .select("schedule_word_id")
      .eq("row_status", "active")
      .limit(20000),
  ]);
  const error =
    candidateResult.error ??
    sourceResult.error ??
    scheduleResult.error ??
    itemResult.error ??
    routeResult.error;
  const candidates = candidateResult.data ?? [];
  const linkedCandidateIds = new Set(
    (sourceResult.data ?? [])
      .map((row) => row.parent_verified_candidate_mapping_id)
      .filter(Boolean),
  );
  const approved = candidates.filter(
    (row) =>
      row.candidate_status === "parent_local_promoted" ||
      row.candidate_status === "global_canonical_promoted",
  );
  const inReview = candidates.filter(
    (row) => row.candidate_status === "in_review",
  ).length;
  const linkedScheduleIds = new Set(
    (routeResult.data ?? []).map((row) => row.schedule_word_id),
  );
  const itemSkills = new Map<string, Set<string>>();
  for (const item of itemResult.data ?? []) {
    const key = `${item.child_id}\u0000${item.canonical_word_id}`;
    const skills = itemSkills.get(key) ?? new Set<string>();
    skills.add(item.micro_skill_key);
    itemSkills.set(key, skills);
  }
  const multiSkillWords = [...itemSkills.values()].filter(
    (skills) => skills.size > 1,
  ).length;
  const schedulesNeedingLinks = (scheduleResult.data ?? []).filter(
    (row) =>
      (itemSkills.get(`${row.child_id}\u0000${row.canonical_word_id}`)?.size ??
        0) > 1 && !linkedScheduleIds.has(row.id),
  ).length;
  const cards = [
    ["Approved correction candidates", approved.length],
    [
      "Candidates linked to ADLE",
      approved.filter((row) => linkedCandidateIds.has(row.id)).length,
    ],
    [
      "Approved candidates not linked",
      approved.filter((row) => !linkedCandidateIds.has(row.id)).length,
    ],
    ["In-review candidates (ineligible)", inReview],
    ["Active multi-skill words", multiSkillWords],
    ["Schedules needing explicit links", schedulesNeedingLinks],
  ] as const;

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <header>
          <p className="brand-eyebrow">Admin · read only</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            ADLE canonical intake readiness
          </h1>
          <p className="brand-copy mt-4 max-w-3xl text-sm leading-6">
            This view audits linkage only. It never approves a mapping, creates
            a learning item, reconciles a schedule, or imports dictionary data.
          </p>
          <p className="brand-copy mt-2 text-sm">
            Intake feature flag:{" "}
            <strong>
              {process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG] === "enabled"
                ? "enabled"
                : "disabled"}
            </strong>
          </p>
          <Link
            href="/admin/spelling-review"
            className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold"
          >
            Back to spelling review
          </Link>
        </header>
        {error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
            Readiness storage is unavailable: {error.message}
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(([label, count]) => (
                <article
                  key={label}
                  className="rounded-2xl border border-[var(--border)] bg-white p-5"
                >
                  <p className="text-sm text-[color:var(--muted)]">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{count}</p>
                </article>
              ))}
            </section>
            <section className="rounded-2xl border border-[var(--border)] bg-white p-5 text-sm leading-6">
              <h2 className="text-lg font-semibold">Precise blocker audit</h2>
              <p className="mt-2">
                Run <code>npm run adle:canonical-intake-audit</code> against
                staging for candidate-level blocker reasons, unresolved target
                text, multi-skill words, and schedules needing linkage.
                Reconciliation is a separate dry-run-first command.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
