import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/access";
import { loadLearnerEvidenceProjection } from "@/lib/adle/proficiency/evidence/repository";
import { loadCanonicalWordSkillRelationshipAuthority } from "@/lib/adle/word-skill-relationships/repository";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadPublishedWritingAssociations } from "@/lib/writing-engine/whole-writing/knowledge-repository";
import { reconcileExactCompatibilityLineage } from "@/lib/writing-engine/whole-writing/projection";
import { loadWholeWritingLongitudinalReport, type WholeWritingReportMode } from "@/lib/writing-engine/whole-writing/projection-repository";

const PATH = "/admin/whole-writing-evidence";
const selectClass = "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function textParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function reportHref(childId: string | null, mode: WholeWritingReportMode, compatibility = false) {
  const params = new URLSearchParams({ mode });
  if (childId) params.set("child", childId);
  if (compatibility) params.set("compatibility", "1");
  return `${PATH}?${params.toString()}`;
}

export default async function WholeWritingEvidencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminUser();
  const params = await searchParams;
  const mode: WholeWritingReportMode = textParam(params.mode) === "history" ? "history" : "current";
  const client = createServiceRoleClient();
  let report: Awaited<ReturnType<typeof loadWholeWritingLongitudinalReport>>;
  try {
    report = await loadWholeWritingLongitudinalReport(client, textParam(params.child), mode);
  } catch {
    return <main className="p-6"><h1>Whole-writing evidence</h1><p role="alert">The shadow evidence store could not be read. Check the S5 migration and service configuration.</p></main>;
  }

  const compatibilityRequested = textParam(params.compatibility) === "1";
  let compatibility = new Map<string, ReturnType<typeof reconcileExactCompatibilityLineage>[number]>();
  let compatibilityUnavailable = false;
  if (compatibilityRequested && report.selectedChildId) {
    const environment = resolveAdleRouteActivationEnvironment();
    if (!environment) {
      compatibilityUnavailable = true;
    } else {
      try {
        const published = await loadPublishedWritingAssociations(client, environment);
        const authority = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations: published });
        const existing = await loadLearnerEvidenceProjection({ client, relationshipAuthority: authority });
        const decisions = reconcileExactCompatibilityLineage(
          report.rows.map((row) => ({
            receiptId: row.receiptId, learnerId: row.learnerId, canonicalWordId: row.canonicalWordId,
            occurredAt: row.occurredAt, performanceLineageKey: row.performanceLineageKey,
          })),
          existing.events.filter((event) => event.learnerId === report.selectedChildId),
        );
        compatibility = new Map(decisions.map((decision) => [decision.receiptId, decision]));
      } catch {
        compatibilityUnavailable = true;
      }
    }
  }

  return <main className="mx-auto grid max-w-[96rem] gap-6 p-6 text-[color:var(--ink)]">
    <header className="grid gap-2">
      <h1 className="text-2xl font-semibold">Whole-writing evidence</h1>
      <p>Read-only Phase C shadow history for every extracted learner-authored occurrence. Target Word membership is not a filter.</p>
      <p>Unknown correctness, context, environment and independence remain blocked. This report cannot change lessons, rewards, proficiency, Authentic Use, Review or retirement.</p>
    </header>

    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-white/70 p-4">
      <label className="grid gap-1 text-sm">Learner
        <select className={selectClass} name="child" defaultValue={report.selectedChildId ?? ""}>
          {report.children.length === 0 ? <option value="">No shadow evidence</option> : null}
          {report.children.map((child) => <option key={child.id} value={child.id}>{child.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Interpretations
        <select className={selectClass} name="mode" defaultValue={mode}>
          <option value="current">Current per source</option>
          <option value="history">Full history</option>
        </select>
      </label>
      <button className={`${selectClass} font-semibold`}>Load report</button>
      <Link className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold" href={reportHref(report.selectedChildId, mode, true)}>
        Reconcile exact compatibility lineage
      </Link>
    </form>

    <section aria-label="Shadow totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {[
        ["Batches", report.batchCount], ["Occurrences", report.candidateCount], ["Blocked", report.blockedCount],
        ["Admitted events", report.admittedEventCount], ["Skill projections", report.admittedProjectionCount],
        ["Exact replay links", report.exactHistoricalMatchCount],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--border)] bg-white/70 p-4"><p className="text-xs uppercase tracking-[0.14em] text-[var(--mid)]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
    </section>

    {compatibilityUnavailable ? <p role="alert">Existing Phase C compatibility evidence could not be reconciled. No approximate match was substituted.</p> : null}
    {compatibilityRequested && !compatibilityUnavailable ? <p role="status">Compatibility scan complete. Only an explicitly identical performance-lineage key can match; submission, word, date or text similarity is ignored.</p> : null}
    {report.truncated ? <p role="status">This bounded report is truncated. Select a learner and current interpretations to reduce the result set.</p> : null}

    <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white/70">
      <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
        <thead><tr>{["Occurrence", "Canonical identity", "Governed micro-skills", "Phase C decision", "Interpretation lineage", "Compatibility"].map((label) => <th className="border-b p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{report.rows.map((row) => {
          const exact = compatibility.get(row.receiptId);
          return <tr key={row.receiptId}>
            <td className="border-b p-3 align-top"><strong>{row.observedText}</strong><small className="mt-1 block break-all text-[var(--mid)]">{row.fieldPath} · UTF-16 {row.startUtf16}–{row.endUtf16}<br />Occurred {row.occurredAt}</small></td>
            <td className="border-b p-3 align-top">{row.canonicalWord ?? "Unresolved"}<small className="mt-1 block break-all text-[var(--mid)]">{row.resolutionStatus} · {row.canonicalWordId ?? row.normalizedForm}</small></td>
            <td className="border-b p-3 align-top">{row.skillCandidates.length ? row.skillCandidates.map((skill) => <p key={`${row.receiptId}:${skill.microSkillKey}`}>{skill.displayName}<small className="block text-[var(--mid)]">{skill.microSkillKey}</small></p>) : "No admitted relationship"}</td>
            <td className="border-b p-3 align-top"><strong>{row.disposition}</strong><small className="mt-1 block text-[var(--mid)]">{row.reason}</small>{row.admittedProjections.length ? row.admittedProjections.map((projection) => <small className="mt-1 block" key={`${row.receiptId}:${projection.microSkillKey}`}>{projection.polarity} · {projection.microSkillKey} · {projection.environment}</small>) : <small className="mt-1 block">No admitted skill evidence</small>}</td>
            <td className="border-b p-3 align-top">{row.lineageReconciliation === "EXACT_HISTORICAL_MATCH" ? "Exact prior interpretation" : "First interpretation"}<small className="mt-1 block break-all text-[var(--mid)]">{row.performanceLineageKey}<br />Batch {row.batchId}<br />Interpreted {row.batchCreatedAt}</small></td>
            <td className="border-b p-3 align-top">{exact ? exact.status : "Not scanned"}{exact?.eventId ? <small className="mt-1 block break-all text-[var(--mid)]">{exact.sourceKind} · {exact.eventId}</small> : null}</td>
          </tr>;
        })}</tbody>
      </table>
      {report.rows.length === 0 ? <p className="p-6">No S5 projection batches are available for this selection.</p> : null}
    </section>
  </main>;
}
