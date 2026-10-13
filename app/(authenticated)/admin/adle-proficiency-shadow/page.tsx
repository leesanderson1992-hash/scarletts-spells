import "server-only";

import { requireAdminUser } from "@/lib/admin/access";
import { loadParentInsightSkills } from "@/lib/parent-insights/proficiency";
import { loadScarlettShadowReport } from "@/lib/adle/proficiency/shadow-repository";
import { validCalculationDate } from "@/lib/adle/proficiency/shadow-v1";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function londonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function AdleProficiencyShadowPage({ searchParams }: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requireAdminUser();
  const params = await searchParams;
  const asOf = params.asOf ?? londonToday();
  if (!validCalculationDate(asOf)) return <main className="p-6"><h1>ADLE proficiency shadow</h1><p role="alert">Invalid calculation date.</p></main>;
  const client = createServiceRoleClient();
  let report: Awaited<ReturnType<typeof loadScarlettShadowReport>>;
  try {
    report = await loadScarlettShadowReport(client, asOf);
  } catch {
    return <main className="p-6"><h1>ADLE proficiency shadow</h1><p role="alert">Scarlett&apos;s shadow report cannot be calculated. Check learner identity and source authority availability.</p></main>;
  }
  let live: Awaited<ReturnType<typeof loadParentInsightSkills>> = [];
  let liveUnavailable = false;
  try { live = await loadParentInsightSkills(report.childId); } catch { liveUnavailable = true; }
  const liveByKey = new Map(live.map((skill) => [skill.key, skill]));
  const smallContext = report.results.filter((skill) => skill.profile === "CONTEXT_DEPENDENT_CLOSED_SET_V1" && skill.requiredPoolSize <= 3);
  const unresolved = report.results.filter((skill) => skill.status !== "calculated").length;
  const limited = report.results.filter((skill) => skill.levels.some((level) => level.blockedReasons.some((reason) => reason.startsWith("allocation_limited")))).length;
  return <main className="mx-auto max-w-[100rem] space-y-6 p-6 text-[color:var(--ink)]">
    <header className="space-y-2"><p className="text-sm uppercase tracking-widest">Admin / ADLE / read-only shadow</p><h1 className="text-2xl font-semibold">Scarlett&apos;s five-level proficiency evaluation</h1>
      <p>The proposed Level 1–5 result and the live three word-complexity bands measure different things. This page changes no learning state, queue, reward, or parent/child display.</p></header>
    <form method="get" className="flex items-end gap-3"><label className="grid gap-1">Calculation date<input className="rounded border bg-white p-2" type="date" name="asOf" defaultValue={asOf} /></label><button className="rounded border bg-white p-2 font-semibold">Calculate</button></form>
    <section className="grid gap-3 sm:grid-cols-4" aria-label="Report totals">{[
      ["Skills", report.results.length], ["Unresolved skills", unresolved], ["Allocation-limited skills", limited], ["Small context sets", smallContext.length],
      ["Qualified source events", report.source.admittedEvents], ["Blocked source facts", report.source.blocked], ["Ambiguous source facts", report.source.ambiguous], ["Live-band-blocked needs", report.blockedTeachingNeeds.length],
    ].map(([label, value]) => <div key={label} className="rounded border bg-white p-3"><small className="block">{label}</small><strong>{value}</strong></div>)}</section>
    <section className="rounded border bg-white p-4" aria-label="Age target versus actual need"><h2 className="text-lg font-semibold">Age target versus actual need</h2>
      <p>The required proficiency pool uses {report.requiredAgeBands?.join(" and ") ?? "unresolved age bands"} and medium/high-frequency words. It is a fair target, not a ceiling on genuine evidence.</p>
      <p>{report.activeNeedCount} active learner needs are recorded; {report.blockedTeachingNeeds.length} fall outside the live pilot teaching band. Their source kinds are shown below so a recorded stretch selection is not mistaken for a verified misspelling. Verified advanced or rare successes may count as evidence without increasing the required pool.</p>
      <p>Evidence-led optional stretch teaching is a separate proposed policy; this report does not activate it.</p></section>
    {report.warnings.map((warning) => <p key={warning} role="status" className="rounded border border-amber-500 bg-amber-50 p-3">{warning}</p>)}
    {liveUnavailable ? <p role="alert">The live three-band comparison could not be loaded.</p> : <p>The live three-band column is the current display as loaded now. It is not an historical snapshot for the selected calculation date.</p>}
    <section><h2 className="text-xl font-semibold">Small context-choice sets</h2><p>These skills need contextual choices from their actual word pool; an empty complexity band is not a learner failure.</p>
      <ul className="mt-2 grid gap-2">{smallContext.map((skill) => <li key={skill.skillKey} className="rounded border bg-white p-3">{skill.label}: {skill.requiredPoolSize} words in the requirement pool · {skill.observedWordCount} demonstrated · {skill.status === "calculated" ? `Level ${skill.achievedLevel ?? "not yet 1"}` : skill.status}</li>)}</ul></section>
    <section className="overflow-x-auto"><h2 className="text-xl font-semibold">All micro-skills</h2><table className="mt-2 min-w-[1050px] w-full border-collapse bg-white text-left text-sm"><thead><tr>{["Micro-skill", "Approved profile", "Proposed Level 1–5", "Live three-band result", "Required pool", "Demonstrated", "Outside pool", "Next step / blocker"].map((title) => <th key={title} className="border-b p-2">{title}</th>)}</tr></thead>
      <tbody>{report.results.map((skill) => { const current = liveByKey.get(skill.skillKey); const next = skill.levels[skill.achievedLevel ?? 0]; return <tr key={skill.skillKey} className="align-top"><th scope="row" className="border-b p-2">{skill.label}<small className="block break-all text-gray-500">{skill.skillKey}</small>
        <details className="mt-2"><summary className="cursor-pointer">Inspect five-level gates</summary><div className="mt-2 min-w-[340px] space-y-2 font-normal">{skill.levels.map((level) => <div key={level.level} className="rounded border p-2"><strong>Level {level.level}: {level.passed ? "certified" : level.certifiable ? "not yet met" : "not certifiable"}</strong><small className="block">{level.blockedReasons.join(", ") || "No allocation blocker"}</small>{level.gates.map((gate) => <small key={gate.name} className="block">{gate.name}: {gate.observed} / {gate.required} {gate.passed ? "✓" : "○"}</small>)}{level.requiredBands.length ? <small className="block">Required word types: {level.requiredBands.join(", ")} · missing {level.missingBands.join(", ") || "none"}</small> : null}</div>)}
          {skill.outsidePoolObservedWordIds.length ? <p>Demonstrated outside the required pool: {skill.outsidePoolObservedWordIds.map((id) => { const word = report.wordDetails[id]; return word ? `${word.word} (${word.ageBand ?? "age unknown"}, ${word.frequencyBand ?? "frequency unknown"})` : "unresolved identity"; }).join(", ")}</p> : null}</div></details>
      </th><td className="border-b p-2">{skill.profile}</td><td className="border-b p-2">{skill.status === "calculated" ? skill.achievedLevel === null ? "Ready to discover" : `Level ${skill.achievedLevel}` : skill.status}{skill.nextLevelProgress !== null ? <small className="block">{skill.nextLevelProgress}% toward next level</small> : null}</td><td className="border-b p-2">{current ? `Highest secured band: ${current.achievedLevel ?? "none"}` : "Unavailable"}</td><td className="border-b p-2">{skill.requiredPoolSize}</td><td className="border-b p-2">{skill.observedWordCount}</td><td className="border-b p-2">{skill.outsidePoolObservedWordCount}</td><td className="border-b p-2">{skill.blockers.length ? skill.blockers.join(", ") : next ? [...next.blockedReasons, ...next.gates.filter((gate) => !gate.passed).map((gate) => gate.name)].join(", ") || "All gates met" : "Maintenance"}</td></tr>; })}</tbody></table></section>
    <section><h2 className="text-xl font-semibold">Recorded needs blocked by the live pilot band</h2><p>These are existing learning items outside the fixed early/middle-primary, high/medium-frequency pilot band. Source kind does not alone certify the need. This instructional audit is separate from the age-based proficiency requirement pool.</p>
      {report.blockedTeachingNeeds.length ? <ul className="mt-2 grid gap-1">{report.blockedTeachingNeeds.map((need, index) => <li key={`${need.skillKey}:${need.word}:${index}`} className="border-b p-2">{need.word} · {need.skillKey} · {need.sourceKind} · age band {need.ageBand ?? "unknown"} · frequency {need.frequencyBand ?? "unknown"}</li>)}</ul> : <p className="mt-2">No active needs are blocked by this band check.</p>}</section>
    <footer className="text-xs text-gray-600">Model ADLE_PROFICIENCY_MODEL_V1 · as of {asOf} · complexity {report.complexityVersion} · relationship {report.relationshipFingerprint.slice(0, 12)} · evidence {report.projectionFingerprint.slice(0, 12)} · word authority {report.wordAuthorityFingerprint.slice(0, 12)} · groups {report.groupAuthorityFingerprint.slice(0, 12)}</footer>
  </main>;
}
