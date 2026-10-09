import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { activityVariantsForRoute } from "@/lib/adle/composable-lesson/activity-variants";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { auditDerivedItyCandidates } from "@/lib/adle/morphology/derived-suffix-candidate-loader";

export const dynamic = "force-dynamic";
const ZERO_CHILD_ID = "00000000-0000-0000-0000-000000000000";

export default async function TeachingDictionaryRoutesPage({ searchParams }: {
  searchParams: Promise<{ audit?: string }>;
}) {
  await requireAdminUser();
  const { audit } = await searchParams;
  const db = createServiceRoleClient();
  const suffix = audit === "ity" ? await loadDynamicSuffixProfiles(db, ZERO_CHILD_ID) : null;
  const ity = suffix?.profiles.find((profile) => profile.microSkillKey === "D4_MOR_SUFFIXES_ITY");
  const result = ity ? await auditDerivedItyCandidates(db, ity) : null;
  const blockerCounts = new Map<string, number>();
  for (const item of result?.excluded ?? []) {
    for (const code of item.blockers) blockerCounts.set(code, (blockerCounts.get(code) ?? 0) + 1);
  }
  return <main className="mx-auto grid max-w-7xl gap-5 p-6 text-[color:var(--ink)]">
    <header><Link className="text-sm underline" href="/admin/teaching-dictionary">← Teaching Dictionary Manager</Link>
      <h1 className="mt-3 text-3xl font-semibold">ADLE activity requirements</h1>
      <p className="mt-2 text-sm">Question variants and lesson group checks from the current released route recipes. This inventory does not activate a new route.</p>
    </header>
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="text-lg font-semibold">-ity dictionary comparison</h2>
      <p className="mt-1 text-sm">Compare directly derivable reviewed words with released members. A word is excluded when its structure, meaning or dictation cannot be validated. This read-only audit does not change learner selection.</p>
      {audit !== "ity" ? <Link className="mt-3 inline-block rounded-lg border border-[var(--border)] px-3 py-2 text-sm" href="?audit=ity">Run -ity audit</Link>
        : !result ? <p className="mt-3 text-sm text-amber-900">The released -ity profile is unavailable. Check its release and environment gates.</p>
          : <div className="mt-3 grid gap-3 text-sm">
            <p><strong>{result.scanned}</strong> reviewed -ity words scanned · <strong>{result.alreadyReleased.length}</strong> already released · <strong>{result.newlyEligible.length}</strong> directly derivable · <strong>{result.excluded.length}</strong> excluded</p>
            {blockerCounts.size > 0 && <div><strong>Most common blockers</strong><ul className="mt-1 grid gap-1">{[...blockerCounts].sort((a, b) => b[1] - a[1]).map(([code, count]) => <li key={code}>{code.replaceAll("_", " ")}: {count}</li>)}</ul></div>}
            {result.newlyEligible.length > 0 && <details><summary className="cursor-pointer">Show directly derivable words</summary><ul className="mt-2 grid gap-1">{result.newlyEligible.map((word) => <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.displayWord}</Link></li>)}</ul></details>}
            {result.excluded.length > 0 && <details><summary className="cursor-pointer">Show excluded words and exact blockers</summary><ul className="mt-2 grid gap-1">{result.excluded.map((item) => <li key={item.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${item.canonicalWordId}`}>{item.displayWord}</Link>: {item.blockers.join(", ").replaceAll("_", " ")}</li>)}</ul></details>}
          </div>}
    </section>
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="text-lg font-semibold">Current lesson routes</h2>
      <div className="mt-3 grid gap-3">{ADLE_CURRICULUM_ROUTE_REGISTRY.map((route) => {
        const skills = route.compatibilityScope.kind === "generic_composer_fallback"
          ? ["generic_composer_fallback"] : route.supportedMicroSkillKeys;
        return <details key={route.routeId} className="rounded-lg border border-[var(--border)] p-3">
          <summary className="cursor-pointer font-semibold">{route.routeId.replaceAll("_", " ")} · {skills.length} {skills.length === 1 ? "skill" : "skills"}</summary>
          <p className="mt-2 text-sm">Lesson words: {route.wordCounts.lesson.join("–")} · authentic targets: {route.wordCounts.authentic.join("–")} · group checks: {route.coverageRequirements.join(", ")}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Skill</th><th className="p-2">Question part</th><th className="p-2">Variant</th><th className="p-2">Word use</th><th className="p-2">Facts needed</th></tr></thead><tbody>
            {skills.flatMap((skill) => activityVariantsForRoute(route.routeId, skill).map((variant) =>
              <tr key={`${skill}:${variant.kind}`} className="border-b align-top"><td className="p-2">{skill}</td><td className="p-2">{variant.kind.replaceAll("_", " ")}{!variant.enabled ? " (not used)" : ""}</td><td className="p-2">{variant.variantKey.replaceAll("_", " ")}</td><td className="p-2">{variant.wordScope.replaceAll("_", " ")}</td><td className="p-2">{variant.requiredFacts.map((fact) => fact.factKey.replaceAll("_", " ")).join(", ")}</td></tr>))}
          </tbody></table></div>
        </details>;
      })}</div>
    </section>
  </main>;
}
