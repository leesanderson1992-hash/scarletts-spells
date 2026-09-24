import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function ContextDiagnosticsPage() {
  await requireAdminUser();
  const service = createServiceRoleClient();
  const [metrics, scopes, promoted] = await Promise.all([
    service.from("writing_context_advisory_review_metrics").select("*")
      .order("family_key").order("child_id"),
    service.from("writing_context_advisory_scope_metrics").select("*")
      .order("family_key").order("assessed_scope"),
    service.from("writing_context_diagnostic_promotions").select("*")
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (metrics.error || scopes.error || promoted.error) throw new Error("Context diagnostic evidence is unavailable.");
  const ids = (promoted.data ?? []).map((row) => row.occurrence_id);
  const occurrences = ids.length ? await service.from("writing_occurrences")
    .select("id,observed_text,start_utf16,end_utf16,field_path")
    .in("id", ids) : { data: [], error: null };
  if (occurrences.error) throw new Error("Promoted occurrence references are unavailable.");
  const byId = new Map((occurrences.data ?? []).map((row) => [row.id, row]));
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-3xl font-semibold">Context Resolver diagnostics</h1>
    <p className="text-sm">Parent-reviewed authentic writing. Development/regression evidence only—not independent qualification gold.</p>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Reviewed occurrence metrics</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th>Family</th><th>Child</th><th>Seen</th><th>Reviewed</th><th>Pending</th><th>Exact agreement</th><th>False valid</th><th>Wrong alternative</th><th>Abstained error</th></tr></thead>
        <tbody>{(metrics.data ?? []).map((row) => <tr key={`${row.family_key}:${row.child_id}`} className="border-t">
          <td>{row.family_key}</td><td>{row.child_id}</td><td>{row.occurrence_count}</td>
          <td>{row.reviewed_count}</td><td>{row.pending_count}</td><td>{row.exact_agreement_count}</td>
          <td>{row.false_valid_count}</td><td>{row.wrong_alternative_count}</td><td>{row.abstained_error_count}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-xs">Never divide agreement by all seen when reviews are pending. Constructions and protected cases require separate trace review.</p>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Analyser-assessed scopes</h2>
      <p className="text-xs">These are machine scope labels for diagnosis, not independently human-confirmed construction truth.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th>Family</th><th>Scope</th><th>Seen</th><th>Reviewed</th><th>Exact agreement</th></tr></thead>
        <tbody>{(scopes.data ?? []).map((row) => <tr key={`${row.family_key}:${row.child_id}:${row.assessed_scope}`} className="border-t">
          <td>{row.family_key}</td><td>{row.assessed_scope ?? "Unresolved"}</td>
          <td>{row.observed_count}</td><td>{row.reviewed_count}</td><td>{row.exact_agreement_count}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Deliberately promoted examples</h2>
      {(promoted.data ?? []).length ? <ul className="mt-3 space-y-3">{(promoted.data ?? []).map((row) => {
        const source = byId.get(row.occurrence_id);
        return <li key={row.id} className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">{row.category} · {source?.observed_text ?? "Source unavailable"}</p>
          <p>{row.parent_note ?? "No parent note"}</p>
          <p className="text-xs">Decision {row.decision_id} · Occurrence {row.occurrence_id}</p>
        </li>;
      })}</ul> : <p className="mt-3 text-sm">No examples have been promoted.</p>}
    </section>
  </main>;
}
