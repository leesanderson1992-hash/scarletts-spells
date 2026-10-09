import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { activityVariantsForRoute } from "@/lib/adle/composable-lesson/activity-variants";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { auditDerivedItyCandidates } from "@/lib/adle/morphology/derived-suffix-candidate-loader";
import { compareItyDerivedSelection } from "@/lib/adle/morphology/ity-derived-shadow-comparison";
import { ityDerivedBlockerAction, ityShadowBlockerMessage } from "@/lib/adle/morphology/ity-derived-blockers";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";

export const dynamic = "force-dynamic";
const ZERO_CHILD_ID = "00000000-0000-0000-0000-000000000000";

export default async function TeachingDictionaryRoutesPage({ searchParams }: {
  searchParams: Promise<{ audit?: string; child?: string }>;
}) {
  await requireAdminUser();
  const { audit, child } = await searchParams;
  const db = createServiceRoleClient();
  const children = audit === "ity" ? await db.from("children")
    .select("id,first_name,last_name").eq("is_archived", false).order("first_name").limit(200) : null;
  if (children?.error) throw new Error("ITY_AUDIT_CHILD_LIST_FAILED");
  const childId = typeof child === "string" && isUuid(child)
    && children?.data?.some((item) => item.id === child) ? child : null;
  const selectedChild = children?.data?.find((item) => item.id === childId);
  const suffix = audit === "ity" ? await loadDynamicSuffixProfiles(db, childId ?? ZERO_CHILD_ID) : null;
  const ity = suffix?.profiles.find((profile) => profile.microSkillKey === "D4_MOR_SUFFIXES_ITY");
  const result = ity ? await auditDerivedItyCandidates(db, ity) : null;
  const comparison = ity && result && childId ? compareItyDerivedSelection({
    profile: ity, learningItems: suffix?.learningItems ?? [], audit: result,
  }) : null;
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
            {result.newlyEligible.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Automatic selection stays off: no additional reviewed word passes the -ity question checks. Complete a direct word&apos;s reviewed facts, then rerun this audit. Multi-part words such as activity need reviewed route content until a separate adapter is released.</p>}
            {blockerCounts.size > 0 && <div><strong>Most common blockers</strong><ul className="mt-1 grid gap-1">{[...blockerCounts].sort((a, b) => b[1] - a[1]).map(([code, count]) => <li key={code}>{code.replaceAll("_", " ")}: {count}</li>)}</ul></div>}
            {result.newlyEligible.length > 0 && <details><summary className="cursor-pointer">Show directly derivable words</summary><ul className="mt-2 grid gap-1">{result.newlyEligible.map((word) => <li key={word.canonicalWordId}><Link className="underline" href={`/admin/teaching-dictionary/${word.canonicalWordId}`}>{word.displayWord}</Link></li>)}</ul></details>}
            {result.excluded.length > 0 && <details id="ity-excluded"><summary className="cursor-pointer">Show excluded words and actions</summary><ul className="mt-2 grid gap-3">{result.excluded.map((item) => <li key={item.canonicalWordId} className="rounded-lg border border-[var(--border)] p-2"><Link className="font-semibold underline" href={`/admin/teaching-dictionary/${item.canonicalWordId}`}>{item.displayWord}</Link><ul className="mt-1 list-disc pl-5">{item.blockers.map((code) => {
              const action = ityDerivedBlockerAction(code);
              return <li key={code}><Link className="underline" href={`/admin/teaching-dictionary/${item.canonicalWordId}${action.target ? `#${action.target}` : ""}`}>{action.label}</Link></li>;
            })}</ul></li>)}</ul></details>}
          </div>}
    </section>
    {audit === "ity" && <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="text-lg font-semibold">Child lesson comparison</h2>
      <p className="mt-1 text-sm">Run both selectors and the current question compiler in memory. This does not create or change an assignment.</p>
      <form action="/admin/teaching-dictionary/routes" method="get" className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="audit" value="ity" />
        <label className="grid gap-1">Learner
          <select name="child" defaultValue={childId ?? ""} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2">
            <option value="">Choose a learner</option>
            {(children?.data ?? []).map((item) => <option key={item.id} value={item.id}>{[item.first_name, item.last_name].filter(Boolean).join(" ")}</option>)}
          </select>
        </label>
        <button className="rounded-lg border border-[var(--border)] px-3 py-2 font-semibold">Compare lesson</button>
      </form>
      {comparison && <div className="mt-3 grid gap-2 text-sm">
        <p><strong>{[selectedChild?.first_name, selectedChild?.last_name].filter(Boolean).join(" ")}</strong> · {comparison.learningItemCount} -ity learning items · {comparison.releasedPoolSize} released words · {comparison.newCandidateCount} additional reviewed candidates</p>
        <p>Released selection: {comparison.released ? `${comparison.released.wordIds.length} words · compiler ${comparison.released.compiler}` : "No selectable four-word group"}</p>
        <p>Reviewed-facts selection: {comparison.shadow ? `${comparison.shadow.wordIds.length} words · compiler ${comparison.shadow.compiler}` : "No selectable four-word group"}</p>
        {Object.keys(comparison.learningItemStatuses).length > 0 && <p>Learning item states: {Object.entries(comparison.learningItemStatuses).map(([status, count]) => `${status.replaceAll("_", " ")} ${count}`).join(" · ")}</p>}
        {comparison.blockers.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-amber-950"><strong>Pilot blockers</strong><ul className="mt-1 list-disc pl-5">{comparison.blockers.map((code) => <li key={code}>{ityShadowBlockerMessage(code)}</li>)}</ul><p className="mt-2">The selector remains on released members.</p></div>}
        {comparison.compilerReadyForChild && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-950">The new selection compiles for this learner. A separate learner-flow proof and snapshot replay are still required before enabling automatic selection.</p>}
      </div>}
    </section>}
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
