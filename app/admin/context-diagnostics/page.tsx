import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
type ShadowOperations = {
  totals: Record<string, number | null>; eligible_detector_occurrences: number; routing_excluded: number;
  pending_jobs: number; failed_jobs: number; oldest_queue_seconds: number; unrecorded_sends: number; reserved_exposure_usd: number;
  daily_capacity: Record<string, string | number | null>;
  groups: { family_key: string; result_status: string; reason_code: string; model: string;
    returned_model: string | null; rate_card_version: string | null; attempts: number; provider_calls: number }[];
};

export default async function ContextDiagnosticsPage() {
  await requireAdminUser();
  const service = createServiceRoleClient();
  const [metrics, scopes, promoted, feedback, detector, operations, spelling, shadowRead] = await Promise.all([
    service.from("writing_context_advisory_review_metrics").select("*")
      .order("family_key").order("child_id"),
    service.from("writing_context_advisory_scope_metrics").select("*")
      .order("family_key").order("assessed_scope"),
    service.from("writing_context_diagnostic_promotions").select("*")
      .order("created_at", { ascending: false }).limit(200),
    service.from("writing_context_feedback_ai_metrics_v1").select("*")
      .order("family_key"),
    service.from("writing_context_feedback_detector_metrics_v1").select("*")
      .order("family_key"),
    service.from("writing_context_feedback_operations_v1").select("*")
      .order("family_key"),
    service.from("writing_spelling_feedback_detector_metrics_v1").select("*")
      .order("detection_version"),
    service.rpc("writing_context_shadow_operations", { p_since: null, p_until: null }),
  ]);
  const shadow = !shadowRead.error && shadowRead.data ? shadowRead.data as ShadowOperations : null;
  if (metrics.error || scopes.error || promoted.error || feedback.error ||
      detector.error || operations.error || spelling.error) throw new Error("Context diagnostic evidence is unavailable.");
  const ids = (promoted.data ?? []).map((row) => row.occurrence_id);
  const occurrences = ids.length ? await service.from("writing_occurrences")
    .select("id,observed_text,start_utf16,end_utf16,field_path")
    .in("id", ids) : { data: [], error: null };
  if (occurrences.error) throw new Error("Promoted occurrence references are unavailable.");
  const byId = new Map((occurrences.data ?? []).map((row) => [row.id, row]));
  const detectorTotals = new Map<string, {
    family_key: string; detector_version: string; registry_version: string;
    surfaced: number; reviewed: number; parent_confirmed: number;
    parent_rejected: number; parent_added_misses: number;
  }>();
  for (const row of detector.data ?? []) {
    const key = `${row.detector_version}:${row.registry_version}:${row.family_key}`;
    const total = detectorTotals.get(key) ?? {
      family_key: row.family_key, detector_version: row.detector_version,
      registry_version: row.registry_version, surfaced: 0, reviewed: 0,
      parent_confirmed: 0, parent_rejected: 0, parent_added_misses: 0,
    };
    total.surfaced += Number(row.surfaced ?? 0);
    total.reviewed += Number(row.reviewed ?? 0);
    total.parent_confirmed += Number(row.parent_confirmed ?? 0);
    total.parent_rejected += Number(row.parent_rejected ?? 0);
    total.parent_added_misses += Number(row.parent_added_misses ?? 0);
    detectorTotals.set(key, total);
  }
  const spellingTotals = new Map<string, {
    detection_version: string; mapping_authority_fingerprint: string;
    eligible_occurrence_count: number; surfaced: number; parent_confirmed: number;
    parent_rejected: number; parent_added_misses: number;
  }>();
  for (const row of spelling.data ?? []) {
    const key = `${row.detection_version}:${row.mapping_authority_fingerprint}`;
    const total = spellingTotals.get(key) ?? {
      detection_version: row.detection_version,
      mapping_authority_fingerprint: row.mapping_authority_fingerprint,
      eligible_occurrence_count: 0, surfaced: 0, parent_confirmed: 0,
      parent_rejected: 0, parent_added_misses: 0,
    };
    total.eligible_occurrence_count += Number(row.eligible_occurrence_count ?? 0);
    total.surfaced += Number(row.surfaced ?? 0);
    total.parent_confirmed += Number(row.parent_confirmed ?? 0);
    total.parent_rejected += Number(row.parent_rejected ?? 0);
    total.parent_added_misses += Number(row.parent_added_misses ?? 0);
    spellingTotals.set(key, total);
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-3xl font-semibold">Contextual diagnostics</h1>
    <p className="text-sm">Parent-reviewed authentic writing. Development/regression evidence only—not independent qualification gold.</p>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Stage 1 shadow operations · last 24 hours</h2>
      <p className="text-xs">Output distributions measure operations, not accuracy. Indexed detector scope precedes privacy, learner authorisation and local paragraph eligibility. Unavailable billing remains unknown; reserved exposure is conservative and the provider invoice is authoritative.</p>
      {shadow ? <>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {Object.entries({ eligible_detector_occurrences: shadow.eligible_detector_occurrences, routing_excluded: shadow.routing_excluded,
            pending_jobs: shadow.pending_jobs, failed_jobs: shadow.failed_jobs, oldest_queue_seconds: shadow.oldest_queue_seconds,
            unrecorded_sends: shadow.unrecorded_sends, reserved_exposure_for_overlapping_utc_days_usd: shadow.reserved_exposure_usd,
            ...shadow.totals }).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value ?? "Unavailable"}</dd></div>)}
        </dl>
        <h3 className="mt-3 font-semibold">Daily capacity · UTC</h3>
        <p className="text-xs">Non-personal operational accounting survives learner/source deletion. Known usage does not refund reserved capacity. Unknown exposure includes admitted requests whose usage is unavailable or unsettled; unadmitted reservations are separate.</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {Object.entries(shadow.daily_capacity).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value ?? "Unavailable"}</dd></div>)}
        </dl>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr><th>Family</th><th>Outcome</th><th>Reason</th><th>Requested model</th><th>Returned model</th><th>Rate card</th><th>Attempts</th><th>Calls</th></tr></thead>
          <tbody>{shadow.groups.map((r, i) => <tr key={i} className="border-t"><td>{r.family_key}</td><td>{r.result_status}</td>
            <td>{r.reason_code}</td><td>{r.model}</td><td>{r.returned_model ?? "Unavailable"}</td><td>{r.rate_card_version ?? "Unavailable"}</td><td>{r.attempts}</td><td>{r.provider_calls}</td></tr>)}</tbody>
        </table></div>
      </> : <p className="mt-3 text-xs">Stage 1 operations are unavailable; confirm infrastructure migrations before activation.</p>}
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">AI versus parent · current decisions</h2>
      <p className="text-xs">Each comparison preserves its linked observation or independently bound shadow attempt. Total reviewed measures coverage. Comparable requires decisive parent truth and gate-passed VALID, INVALID or linguistic UNCERTAIN; NOT_ASSESSED and missing evidence are outside that denominator. Operational NOT_ASSESSED is also shown separately and can overlap excluded cases.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th>Family</th><th>Model</th><th>Mode</th><th>Total reviewed</th><th>Comparable</th><th>Excluded</th><th>Unresolved</th><th>Operational NOT_ASSESSED</th><th>Agreed valid</th><th>Agreed invalid</th><th>False invalid</th><th>Missed invalid</th><th>Abstention resolved</th><th>Replacement changed</th><th>Not comparable</th></tr></thead>
        <tbody>{(feedback.data ?? []).map((row) => <tr key={`${row.family_key}:${row.model}:${row.prompt_fingerprint}:${row.schema_fingerprint}:${row.gate_version}:${row.ai_mode}`} className="border-t">
          <td>{row.family_key}</td><td>{row.model ?? "No AI evidence"}</td><td>{row.ai_mode ?? "—"}</td>
          <td>{row.total_reviewed_count}</td><td>{row.comparable_count}</td><td>{row.excluded_count}</td>
          <td>{row.unresolved_count}</td><td>{row.operational_not_assessed_count}</td>
          <td>{row.agreed_valid}</td><td>{row.agreed_invalid}</td>
          <td>{row.false_invalid}</td><td>{row.missed_invalid}</td><td>{row.abstentions_resolved}</td>
          <td>{row.replacement_changed}</td><td>{row.not_comparable}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Context candidate routing</h2>
      <p className="text-xs">Only completed, versioned four-family detector runs count. “Rejected” means a parent excluded a surfaced occurrence; marking a valid family word correct is not a routing false positive. Recall is a reviewed-scope proxy, not population recall.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th>Family</th><th>Detector</th><th>Registry</th><th>Surfaced</th><th>Reviewed</th><th>Confirmed invalid</th><th>Excluded</th><th>Exact misses</th><th>Recall proxy</th></tr></thead>
        <tbody>{[...detectorTotals.values()].map((row) => {
          const confirmed = Number(row.parent_confirmed ?? 0);
          const missed = Number(row.parent_added_misses ?? 0);
          return <tr key={`${row.detector_version}:${row.registry_version}:${row.family_key}`} className="border-t">
            <td>{row.family_key}</td><td>{row.detector_version}</td><td>{row.registry_version}</td>
            <td>{row.surfaced}</td><td>{row.reviewed}</td><td>{confirmed}</td><td>{row.parent_rejected}</td><td>{missed}</td>
            <td>{confirmed + missed ? `${((confirmed / (confirmed + missed)) * 100).toFixed(1)}%` : "—"}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Provider operations</h2>
      <p className="text-xs">No learner writing is stored in these aggregates. Costs are estimates only when a versioned rate card was configured.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th>Family</th><th>Mode</th><th>Result</th><th>Reason</th><th>Attempts</th><th>Calls</th><th>Assessed</th><th>Median ms</th><th>P95 ms</th><th>Input</th><th>Cached</th><th>Output</th><th>Estimated USD</th></tr></thead>
        <tbody>{(operations.data ?? []).map((row, index) => <tr key={`${row.family_key}:${row.mode}:${row.result_status}:${row.reason_code}:${index}`} className="border-t">
          <td>{row.family_key}</td><td>{row.mode}</td><td>{row.result_status}</td><td>{row.reason_code}</td>
          <td>{row.attempts}</td><td>{row.provider_calls}</td><td>{row.assessed}</td>
          <td>{row.median_latency_ms ?? "—"}</td><td>{row.p95_latency_ms ?? "—"}</td>
          <td>{row.input_tokens ?? "—"}</td><td>{row.cached_input_tokens ?? "—"}</td>
          <td>{row.output_tokens ?? "—"}</td><td>{row.estimated_cost_usd ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Known-spelling detector feedback</h2>
      <p className="text-xs">Completed S6 assessed scopes only, including bounded replays. A miss requires an exact occurrence check inside that batch with no surfaced finding. Sharing a snapshot is insufficient. Legacy unlinked words and incomplete batches are excluded. Recall uses confirmed / (confirmed + exact misses); reviewed false-positive rate uses rejected / (confirmed + rejected).</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr><th>Detector</th><th>Mapping authority</th><th>Eligible</th><th>Surfaced</th><th>Confirmed</th><th>Rejected</th><th>Exact misses</th><th>Recall proxy</th><th>Reviewed false-positive rate</th></tr></thead>
        <tbody>{[...spellingTotals.values()].map((row) => {
          const confirmed = Number(row.parent_confirmed ?? 0);
          const rejected = Number(row.parent_rejected ?? 0);
          const missed = Number(row.parent_added_misses ?? 0);
          return <tr key={`${row.detection_version}:${row.mapping_authority_fingerprint}`} className="border-t">
            <td>{row.detection_version}</td><td className="font-mono">{String(row.mapping_authority_fingerprint).slice(0, 12)}</td>
            <td>{row.eligible_occurrence_count}</td><td>{row.surfaced}</td>
            <td>{confirmed}</td><td>{rejected}</td><td>{missed}</td>
            <td>{confirmed + missed ? `${((confirmed / (confirmed + missed)) * 100).toFixed(1)}%` : "—"}</td>
            <td>{confirmed + rejected ? `${((rejected / (confirmed + rejected)) * 100).toFixed(1)}%` : "—"}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Legacy advisory occurrence metrics</h2>
      <p className="text-xs">This pre-feedback view pairs the current parent decision with the latest observation. Use the linked-decision comparison above for AI agreement rates and historical analysis.</p>
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
