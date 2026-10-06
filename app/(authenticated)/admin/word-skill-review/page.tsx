import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadWordSkillPackage, loadWordSkillReviewControls, loadWordSkillPackageLabels, previewWordSkillPackage } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { importWordSkillPackage, recordWordSkillReview, publishWordSkillReview, withdrawWordSkillReview } from "./actions";

const inputClass = "rounded-lg border border-[var(--border)] bg-white px-3 py-2";
const buttonClass = `${inputClass} font-semibold disabled:opacity-40`;
const PATH = "/admin/word-skill-review";

export default async function WordSkillReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminUser();
  const params = await searchParams;
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return <main className="p-6"><h1>Word–skill review</h1><p>Review is unavailable until the server environment is configured.</p></main>;
  const client = createServiceRoleClient();
  const id = typeof params.package === "string" && isUuid(params.package) ? params.package : null;
  const before = typeof params.before === "string" && isUuid(params.before) ? params.before : null;
  let query = client.from("adle_word_skill_candidate_packages").select("id,package_key,created_at").eq("environment_key", environment).order("id", { ascending: false }).limit(51);
  if (before) query = query.lt("id", before);
  let controls: Awaited<ReturnType<typeof loadWordSkillReviewControls>>;
  let selected: Awaited<ReturnType<typeof loadWordSkillPackage>> | null;
  let listing: { id: string; package_key: string; created_at: string }[];
  try {
    const [flags, pack, rows] = await Promise.all([loadWordSkillReviewControls(client, environment), id ? loadWordSkillPackage(client, environment, id) : null, query]);
    if (rows.error) throw new Error("WORD_SKILL_PACKAGE_READ_FAILED");
    controls = flags; selected = pack; listing = rows.data ?? [];
  } catch {
    return <main className="p-6"><h1>Word–skill review</h1><p role="alert">The review store could not be read. Check the migration and service configuration.</p></main>;
  }
  let preview: Awaited<ReturnType<typeof previewWordSkillPackage>> | null = null;
  let previewFailed = false;
  let words = new Map<string, string>();
  let skills = new Map<string, string>();
  let withdrawn = false;
  if (selected) {
    try {
      const candidates = selected.package.candidates;
      const [result, labels, withdrawal] = await Promise.all([
        previewWordSkillPackage(client, selected.package, selected.review),
        loadWordSkillPackageLabels(client, candidates),
        selected.publication ? client.from("adle_reviewed_word_skill_withdrawals").select("release_id").eq("release_id", selected.publication.release_id).maybeSingle() : null,
      ]);
      if (withdrawal?.error) throw new Error("WORD_SKILL_REFERENCE_READ_FAILED");
      preview = result;
      words = labels.words;
      skills = labels.skills;
      withdrawn = Boolean(withdrawal?.data);
    } catch { previewFailed = true; }
  }
  const approved = selected?.review?.decisions.filter(d => d === "approved").length ?? 0;
  const blocked = preview?.pairs.filter((p, i) => selected?.review?.decisions[i] !== "rejected" && !p.ready).length ?? 0;
  return <main className="mx-auto grid max-w-6xl gap-6 p-6 text-[color:var(--ink)]">
    <header><h1 className="text-2xl font-semibold">Word–skill review</h1><p>Review exact associations before publishing reusable knowledge. Environment: {environment}.</p>
      <p>Candidate import and relationship recognition do not verify learner performance or change proficiency.</p></header>
    {params.saved === "1" && <p role="status">Saved.</p>}
    {typeof params.error === "string" && <p role="alert">Action did not complete: {/^[A-Z_]+$/.test(params.error) ? params.error : "WORD_SKILL_ACTION_FAILED"}. Reload the package and check its state.</p>}
    <p>Review: {controls.review_enabled ? "enabled" : "off"} · Publication: {controls.publication_enabled ? "enabled" : "off"} · Withdrawal: {controls.withdrawal_enabled ? "enabled" : "off"}</p>
    {selected ? <section className="grid gap-4">
      <Link href={PATH}>Back to packages</Link><h2 className="text-xl font-semibold">{selected.package.package_key}</h2>
      <p>{selected.package.candidates.length} pairs · {selected.review ? `${approved} approved` : "Awaiting human review"} · {blocked} blocked by current authority</p>
      {previewFailed && <p role="alert">Authority reconciliation is unavailable. Review and publication are blocked until all sources can be read.</p>}
      <form action={recordWordSkillReview} className="grid gap-4">
        <input type="hidden" name="package_id" value={selected.package.id} />
        <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{["Canonical word", "Micro-skill and role", "Provenance", "Phase B preview", "Review decision"].map(label => <th className="border-b p-2" key={label}>{label}</th>)}</tr></thead>
          <tbody>{selected.package.candidates.map((candidate, i) => <tr key={`${candidate.canonicalWordId}:${candidate.microSkillKey}`}>
            <td className="border-b p-2 align-top">{words.get(candidate.canonicalWordId) ?? "Identity unavailable"}<small className="block">{candidate.canonicalWordId}</small></td>
            <td className="border-b p-2 align-top">{skills.get(candidate.microSkillKey) ?? candidate.microSkillKey}<small className="block">{candidate.microSkillKey}</small><span>{candidate.relationshipRole}</span></td>
            <td className="border-b p-2 align-top break-words">{candidate.sourceReference}<br />Licence/source rights: {candidate.licenceReference}<br />{candidate.method}</td>
            <td className="border-b p-2 align-top">{selected?.review?.decisions[i] === "rejected" ? "Rejected; excluded from publication" : preview?.pairs[i].reasons.join(", ") ?? "Unavailable"}
              {preview && <details><summary>Existing source decisions</summary>{preview.pairs[i].sources.length ? preview.pairs[i].sources.map((source, n) => <p key={n}>{source.source}: {source.reason} ({source.provenanceId})</p>) : <p>No existing source for this pair.</p>}</details>}</td>
            <td className="border-b p-2 align-top">{selected?.review
              ? <>{selected.review.decisions[i]}{selected.rejectionReasons.get(i) && <small className="block">Reason: {selected.rejectionReasons.get(i)}</small>}</>
              : <><select className={inputClass} name={`decision_${i}`} aria-label={`Decision for pair ${i + 1}`} required defaultValue="" disabled={!controls.review_enabled || previewFailed}>
                <option value="" disabled>Choose</option><option value="approved">Approve exact pair</option><option value="rejected">Reject</option></select>
                <label className="mt-2 block">Rejection reason<input className={inputClass} name={`rejection_reason_${i}`} maxLength={2000} /></label></>}</td>
          </tr>)}</tbody></table></div>
        {!selected.review && <><label className="grid gap-1">Review note<textarea className={inputClass} name="review_note" maxLength={2000} required /></label>
          <label className="grid gap-1">Curator active time in seconds (optional)<input className={inputClass} type="number" name="curator_active_seconds" min={0} step={1} /></label>
          <p>Every rejected pair requires a reason. Decisions are final for this package. Submit a new package to revise an association.</p><button className={buttonClass} disabled={!controls.review_enabled || previewFailed}>Record pair decisions</button></>}
      </form>
      {selected.review && <p>Reviewed {selected.review.reviewed_at} by {selected.review.reviewed_by}: {selected.review.review_note}{selected.curatorActiveSeconds === null ? " · curator time not recorded" : ` · ${selected.curatorActiveSeconds}s curator time`}</p>}
      {selected.publication ? <><p>Release: {selected.publication.release_id} · {withdrawn ? "Withdrawn" : "Published"}</p>{!withdrawn && <form action={withdrawWordSkillReview} className="grid gap-3">
        <input type="hidden" name="package_id" value={selected.package.id} /><label className="grid gap-1">Withdrawal reason<textarea className={inputClass} name="reason" required maxLength={2000} /></label><p>Future authority reads exclude this release. Existing evidence history stays intact.</p><button className={buttonClass} disabled={!controls.withdrawal_enabled || previewFailed}>Withdraw release</button>
      </form>}</> : selected.review && <form action={publishWordSkillReview} className="grid gap-3">
        <input type="hidden" name="package_id" value={selected.package.id} /><input type="hidden" name="authority_fingerprint" value={preview?.result.reconciliation.sourceFingerprint ?? ""} />
        <label><input type="checkbox" name="confirm_publication" value="yes" required /> Publish these {approved} approved pairs as authoritative knowledge.</label>
        <p>Only approved pairs are published. Enabled shadow cohorts may be reanalysed; no learning consequence is authorized.</p>
        <button className={buttonClass} disabled={!controls.publication_enabled || !approved || blocked > 0 || previewFailed}>Publish reviewed pairs</button>
      </form>}
      {preview && <details><summary>Reconciliation receipt</summary><p>Hypothetical candidate inclusion; not an approval.</p><pre className="overflow-x-auto text-xs">{JSON.stringify(preview.result.reconciliation, null, 2)}</pre></details>}
    </section> : <>
      <section className="grid gap-3"><h2 className="text-xl font-semibold">Candidate packages</h2><ul>{listing.slice(0, 50).map(row => <li key={row.id}><Link className="underline" href={`${PATH}?package=${row.id}`}>{row.package_key}</Link> · {row.created_at}</li>)}</ul>{!listing.length && <p>No packages on this page.</p>}{listing.length > 50 && <Link href={`${PATH}?before=${listing[49].id}`}>Next page</Link>}</section>
      <form action={importWordSkillPackage} className="grid gap-3"><h2 className="text-xl font-semibold">Import candidates</h2>
        <label className="grid gap-1">Unique package key<input className={inputClass} name="package_key" maxLength={120} required /></label>
        <label className="grid gap-1">Candidate JSON array<textarea className={`${inputClass} font-mono text-sm`} name="candidates" rows={10} maxLength={500000} required /></label>
        <p>Each candidate needs canonicalWordId, microSkillKey, relationshipRole, sourceReference, licenceReference and method (existing_authority, deterministic_candidate or batch_ai_candidate). Maximum 1,000 exact pairs. Imported approval fields are ignored.</p>
        <button className={buttonClass} disabled={!controls.review_enabled}>Import for review</button>
      </form>
    </>}
  </main>;
}
