import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadEnabledBaseWordReleaseAuthorities } from "@/lib/adle/loaders/curriculum-release-authority";
import { indexedEligibleBaseFamilyCounts, shortlistBaseFamilyPairs } from "@/lib/adle/base-word-family-counts";
import { BASE_WORD_SKILLS } from "@/lib/teaching-dictionary-manager/base-family-candidates";

export const dynamic = "force-dynamic";

export default async function BaseFamiliesPage({ searchParams }: {
  searchParams: Promise<{ x?: string }>;
}) {
  await requireAdminUser();
  const raw = Number((await searchParams).x ?? "1");
  const greaterThan = Number.isInteger(raw) && raw >= 0 && raw <= 20 ? raw : 1;
  const environment = resolveAdleRouteActivationEnvironment();
  const client = createServiceRoleClient();
  const [releases, candidateResult] = await Promise.all([
    environment ? loadEnabledBaseWordReleaseAuthorities({
      client, environmentKey: environment, microSkillKeys: [...BASE_WORD_SKILLS],
    }) : Promise.resolve([]),
    client.from("adle_base_word_lexical_family_authorizations")
      .select("family_key,revision,authorized_at")
      .is("withdrawn_at", null).order("family_key"),
  ]);
  if (candidateResult.error) throw new Error(`Base Word candidate sources unavailable: ${candidateResult.error.message}`);
  const candidates = candidateResult.data ?? [];
  const releasedKeys = new Set(releases.flatMap((release) =>
    release.family.families.map((family) => family.baseFamilyKey)));
  const views = releases.map((release) => {
    const counts = indexedEligibleBaseFamilyCounts(release);
    return { release, counts: counts.filter((family) => family.eligibleCount > greaterThan), exclusions: counts.flatMap((family) => family.regularityExclusions.map((excluded) => ({ familyKey: family.baseFamilyKey, ...excluded }))),
      pairs: shortlistBaseFamilyPairs(counts, greaterThan) };
  });
  return <main className="mx-auto grid max-w-6xl gap-5 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link href="/admin/teaching-dictionary" className="underline">← Teaching Dictionary</Link></nav>
    <header><h1 className="text-2xl font-semibold">Released Base Word families</h1>
      <p className="text-sm">Distinct assignment-ready words in the active family release and dictionary closure. Counts are a shortlist; the learner selector makes the final lesson decision.</p></header>
    <form method="get" className="flex items-end gap-3"><label className="grid gap-1 text-sm">Show families with more than x words
      <input className="w-24 rounded border border-[var(--border)] px-2 py-1" type="number" name="x" min="0" max="20" defaultValue={greaterThan} /></label>
      <button className="rounded border border-[var(--border)] px-3 py-1 text-sm font-semibold">Filter</button></form>
    {!environment && <p role="status">ADLE route activation environment is not configured.</p>}
    {environment && views.length === 0 && <p role="status">No Base Word family release is enabled in {environment}.</p>}
    {views.map(({ release, counts, pairs, exclusions }) => <section key={`${release.releaseManifestId}:${release.microSkillKey}`} className="grid gap-2 rounded border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">{release.microSkillKey}</h2>
      <p className="text-xs">Release {release.releaseKey} · {counts.length} families above x · {pairs.length} pairs with at least six distinct words</p>
      <table className="w-full text-left text-sm"><thead><tr><th className="py-1">Family</th><th>Eligible words</th><th>Six-word pair</th></tr></thead>
        <tbody>{counts.map((family) => <tr key={family.baseFamilyKey} className="border-t border-[var(--border)]">
          <td className="py-1">{family.baseFamilyKey}</td><td>{family.eligibleCount}</td>
          <td>{pairs.some((pair) => pair.includes(family.baseFamilyKey)) ? "Possible" : "No"}</td>
        </tr>)}</tbody></table>
      {exclusions.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">{exclusions.length} regularity exclusions</summary>
        <ul className="mt-2 grid gap-1">{exclusions.map((entry) => <li key={`${entry.familyKey}:${entry.canonicalWordId}`}>{entry.familyKey} · {entry.canonicalWordId} · {entry.status} · {entry.source} · {entry.reason}</li>)}</ul>
      </details>}
    </section>)}
    <section className="grid gap-2 rounded border border-[var(--border)] bg-white p-4">
      <h2 className="font-semibold">Authorised dictionary family sources</h2>
      <p className="text-sm">{candidates.length} approved lexical family revisions may supply Base Word lesson candidates. This authorisation does not approve a word–skill relationship, lesson content, or a route release.</p>
      <table className="w-full text-left text-sm"><thead><tr><th className="py-1">Family</th><th>Revision</th><th>Active release</th></tr></thead>
        <tbody>{candidates.map((candidate) => <tr key={`${candidate.family_key}:${candidate.revision}`} className="border-t border-[var(--border)]">
          <td className="py-1">{candidate.family_key}</td><td>{candidate.revision}</td>
          <td>{releasedKeys.has(candidate.family_key) ? "Included" : "Needs word and content review"}</td>
        </tr>)}</tbody></table>
    </section>
  </main>;
}
