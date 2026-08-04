/* eslint-disable @typescript-eslint/no-explicit-any -- additive intake tables precede generated Supabase types */
import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { isCanonicalIntakeEnabled } from "@/lib/adle/canonical-intake";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  acknowledgeIntakeDemand,
  assignIntakeDemandToMe,
  enqueueIntakeDemandRecheck,
  updateIntakeDemandStatus,
} from "./actions";

export const dynamic = "force-dynamic";

const CONTENT_CHECKLIST = [
  "Canonical Teaching Dictionary word",
  "Active and reviewed canonical status",
  "Age, frequency and complexity bands",
  "Reviewed morphology, decomposition and reconstruction",
  "Semantic base and teaching surface",
  "Reviewed base word and affix/inflection treatment",
  "Syllable and pronunciation facts",
  "Child-friendly meaning",
  "Approved dictation sentence, target position and matching audio text",
  "Route profile membership and assignment eligibility",
  "Teaching parts, joins and meaning-bin assignment",
  "Ordered Build choices and valid-choice audit",
  "Governed release provenance and reviewer approval",
] as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function title(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--mist)] px-2.5 py-1 text-xs font-semibold">
      {title(value)}
    </span>
  );
}

export default async function AdleCanonicalIntakeReadinessPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    demand?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const db = createServiceRoleClient() as any;
  const [candidateResult, demandResult, linkResult, eventResult] =
    await Promise.all([
      db
        .from("adle_canonical_intake_candidates")
        .select("id,child_id,candidate_state")
        .limit(20000),
      db
        .from("adle_canonical_intake_demands")
        .select(
          "id,demand_type,target_identity_status,normalized_target_token,canonical_word_id,target_record_link_status,route_id,route_version,micro_skill_key,lifecycle_status,primary_blocker_code,blockers,readiness_fingerprint,owner_user_id,reviewer_user_id,governed_release_id,occurrence_count,notification_status,first_seen_at,last_seen_at,last_reconciled_at,last_reconciliation_outcome,resolution_note,activated_at",
        )
        .order("first_seen_at", { ascending: true })
        .limit(2000),
      db
        .from("adle_canonical_intake_candidate_demands")
        .select("candidate_id,demand_id,link_status")
        .limit(20000),
      db
        .from("adle_canonical_intake_events")
        .select("id,demand_id,event_type,actor_type,event_payload,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
  const storageError =
    candidateResult.error ??
    demandResult.error ??
    linkResult.error ??
    eventResult.error;
  const candidates = (candidateResult.data ?? []) as Array<{
    id: string;
    child_id: string;
    candidate_state: string;
  }>;
  const demands = (demandResult.data ?? []) as any[];
  const links = (linkResult.data ?? []) as Array<{
    candidate_id: string;
    demand_id: string;
    link_status: string;
  }>;
  const events = (eventResult.data ?? []) as any[];
  const candidateById = new Map(candidates.map((row) => [row.id, row]));
  const demandTypeFilter =
    params.type === "resolver" || params.type === "teaching_content"
      ? params.type
      : null;
  const visibleDemands = demands.filter(
    (demand) => !demandTypeFilter || demand.demand_type === demandTypeFilter,
  );
  const unresolved = demands.filter(
    (demand) =>
      !["activated", "rejected", "superseded"].includes(
        demand.lifecycle_status,
      ),
  );
  const cards = [
    ["Activated candidates", candidates.filter((row) => row.candidate_state === "activated").length],
    ["Pending teaching content", candidates.filter((row) => row.candidate_state === "pending_content").length],
    ["Pending mapping", candidates.filter((row) => row.candidate_state === "pending_mapping").length],
    ["Unresolved demand notifications", unresolved.filter((row) => row.notification_status !== "resolved").length],
  ] as const;

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-7">
        <header>
          <p className="brand-eyebrow">Admin · actionable demand queue</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">
            ADLE canonical intake readiness
          </h1>
          <p className="brand-copy mt-4 max-w-4xl text-sm leading-6">
            Readiness comes from reviewed mapping and Teaching Dictionary truth.
            Admin workflow state never marks a child ready and this dashboard
            cannot create an assignment.
          </p>
          <p className="brand-copy mt-2 text-sm">
            Intake feature flag: <strong>{isCanonicalIntakeEnabled() ? "enabled" : "disabled"}</strong>
          </p>
          <Link href="/admin/spelling-review" className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">
            Back to spelling review
          </Link>
        </header>

        {params.saved ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{params.saved}</p> : null}
        {params.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{params.error}</p> : null}
        {storageError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
            Canonical-intake demand storage is unavailable. Apply the reviewed
            intake migration in this environment before using this queue.
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map(([label, count]) => (
                <article key={label} className="rounded-2xl border border-[var(--border)] bg-white p-5">
                  <p className="text-sm text-[color:var(--muted)]">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{count}</p>
                </article>
              ))}
            </section>

            <nav className="flex flex-wrap gap-2" aria-label="Demand filters">
              <Link href="/admin/adle-canonical-intake-readiness" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">All demands</Link>
              <Link href="/admin/adle-canonical-intake-readiness?type=teaching_content" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Teaching Content</Link>
              <Link href="/admin/adle-canonical-intake-readiness?type=resolver" className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Resolver</Link>
            </nav>

            <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
              <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
                <thead className="bg-[var(--mist)]">
                  <tr>
                    {[
                      "Target", "Demand", "Mapping identity", "Route / microskill",
                      "Blocker", "Seen / occurrences", "Waiting / children", "Owner", "Reconciliation", "Actions",
                    ].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {visibleDemands.map((demand) => {
                    const waitingLinks = links.filter((link) => link.demand_id === demand.id && link.link_status === "waiting");
                    const affectedChildren = new Set(waitingLinks.map((link) => candidateById.get(link.candidate_id)?.child_id).filter(Boolean)).size;
                    const isUnlockedContent = demand.demand_type === "teaching_content" && demand.normalized_target_token === "unlocked";
                    return (
                      <tr key={demand.id} className={params.demand === demand.id ? "bg-amber-50" : undefined}>
                        <td className="px-4 py-4 align-top">
                          <p className="font-semibold">{demand.normalized_target_token}</p>
                          {isUnlockedContent ? <p className="mt-2 max-w-64 text-amber-900">Teaching Dictionary content is required for <code>`unlocked`</code>.</p> : null}
                          <StatusBadge value={demand.notification_status} />
                        </td>
                        <td className="px-4 py-4 align-top"><StatusBadge value={demand.demand_type} /><div className="mt-2"><StatusBadge value={demand.lifecycle_status} /></div></td>
                        <td className="px-4 py-4 align-top"><strong>{demand.target_identity_status === "established" ? "Resolved and visible" : "Unresolved"}</strong><p className="mt-1 text-xs text-[color:var(--muted)]">{demand.target_record_link_status === "canonical_word_linked" ? "Canonical row linked" : "Target token retained"}</p></td>
                        <td className="px-4 py-4 align-top"><p>{demand.route_id} {demand.route_version}</p><code className="text-xs">{demand.micro_skill_key}</code></td>
                        <td className="px-4 py-4 align-top"><StatusBadge value={demand.primary_blocker_code} /></td>
                        <td className="px-4 py-4 align-top"><p>{formatDate(demand.first_seen_at)}</p><p className="mt-1 text-xs">Last {formatDate(demand.last_seen_at)}</p><p className="mt-1">Occurrences: {demand.occurrence_count}</p></td>
                        <td className="px-4 py-4 align-top"><p>Waiting: {waitingLinks.length}</p><p>Children: {affectedChildren}</p></td>
                        <td className="px-4 py-4 align-top">{demand.owner_user_id ? "Assigned" : "Unassigned"}</td>
                        <td className="px-4 py-4 align-top"><p>{demand.last_reconciliation_outcome ?? "Not reconciled"}</p><p className="mt-1 text-xs">{formatDate(demand.last_reconciled_at)}</p></td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex min-w-44 flex-col gap-2">
                            <Link href={`/admin/adle-canonical-intake-readiness?demand=${demand.id}`} className="rounded-lg border px-3 py-2 text-center font-semibold">Open checklist</Link>
                            {demand.notification_status === "unread" ? <form action={acknowledgeIntakeDemand}><input type="hidden" name="demand_id" value={demand.id} /><button className="w-full rounded-lg border px-3 py-2 font-semibold">Acknowledge</button></form> : null}
                            {!demand.owner_user_id ? <form action={assignIntakeDemandToMe}><input type="hidden" name="demand_id" value={demand.id} /><button className="w-full rounded-lg border px-3 py-2 font-semibold">Assign to me</button></form> : null}
                            <form action={enqueueIntakeDemandRecheck}><input type="hidden" name="demand_id" value={demand.id} /><button className="w-full rounded-lg border px-3 py-2 font-semibold">Recheck readiness</button></form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleDemands.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-[color:var(--muted)]">No demands match this filter.</td></tr> : null}
                </tbody>
              </table>
            </section>

            {params.demand ? demands.filter((demand) => demand.id === params.demand).map((demand) => (
              <section key={demand.id} className="rounded-2xl border border-[var(--border)] bg-white p-6">
                <h2 className="text-2xl font-semibold">Teaching readiness for {demand.normalized_target_token}</h2>
                <p className="mt-2 text-sm">Mapping identity: <strong>{demand.target_identity_status === "established" ? "resolved and resolver-visible" : "unresolved"}</strong>.</p>
                <h3 className="mt-6 text-lg font-semibold">Required reviewed content</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {CONTENT_CHECKLIST.map((item) => <li key={item} className="rounded-xl border border-[var(--border)] p-3 text-sm">{item}</li>)}
                </ul>
                <h3 className="mt-6 text-lg font-semibold">Governed content workflow context</h3>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--mist)] p-4 text-xs">{`target=${demand.normalized_target_token}\nsource=canonical_intake_demand\nroute=${demand.route_id}\nmicroSkillKey=${demand.micro_skill_key}\ndemandId=${demand.id}`}</pre>
                <p className="mt-2 text-xs text-[color:var(--muted)]">This context does not create, approve or publish teaching facts.</p>
                <h3 className="mt-6 text-lg font-semibold">Audited status</h3>
                <form action={updateIntakeDemandStatus} className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto]">
                  <input type="hidden" name="demand_id" value={demand.id} />
                  <select name="status" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2" defaultValue="in_review"><option value="in_review">In review</option><option value="rejected">Rejected</option><option value="superseded">Superseded</option></select>
                  <input name="note" maxLength={500} placeholder="Required note for reject/supersede" className="rounded-xl border border-[var(--border)] px-3 py-2" />
                  <button className="rounded-xl border border-[var(--border)] px-4 py-2 font-semibold">Save status</button>
                </form>
                <h3 className="mt-6 text-lg font-semibold">Audit history</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {events.filter((event) => event.demand_id === demand.id).map((event) => <li key={event.id} className="rounded-xl border border-[var(--border)] p-3"><strong>{title(event.event_type)}</strong> · {formatDate(event.created_at)} · {title(event.actor_type)}</li>)}
                </ul>
              </section>
            )) : null}
          </>
        )}
      </div>
    </main>
  );
}
