import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { loadLessonReadiness } from "./read-model";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { launchReviewedAdleLesson, rollbackReviewedAdleLessonVersion } from "./actions";
import { loadRouteWordStatuses } from "@/lib/teaching-dictionary-manager/route-word-status-service";

export const dynamic = "force-dynamic";

export default async function AdleLessonReadinessPage({ searchParams }: {
  searchParams: Promise<{ route?: string; skill?: string; saved?: string; rolled_back?: string; error?: string }>;
}) {
  await requireAdminUser();
  const params = await searchParams;
  const rows = await loadLessonReadiness({ routeId: params.route || undefined, microSkillKey: params.skill || undefined });
  const selectedLesson = params.route && params.skill
    ? rows.find((row) => row.routeId === params.route && row.microSkillKey === params.skill) : undefined;
  const routeWords = selectedLesson ? await loadRouteWordStatuses({ routeId: selectedLesson.routeId,
    microSkillKey: selectedLesson.microSkillKey, lesson: selectedLesson }) : null;
  const counts = { released: rows.filter((row) => row.released).length,
    ready: rows.filter((row) => row.status === "ready_to_launch").length,
    blocked: rows.filter((row) => ["blocked", "needs_review"].includes(row.status)).length };
  return <main className="mx-auto grid max-w-7xl gap-6 p-6 text-[color:var(--ink)]">
    <header><Link href="/admin/teaching-dictionary" className="text-sm underline">← Teaching Dictionary</Link>
      <h1 className="mt-3 text-3xl font-semibold">ADLE lesson readiness</h1>
      <p className="mt-2 max-w-3xl text-sm">Inspect every registered lesson and its release facts. Launch a complete reviewed group through its route publisher.</p>
    </header>
    {params.saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-950">Reviewed lesson released. The scheduler can select it from the normal word queue.</p>}
    {params.rolled_back && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-950">The most recent reviewed profile version was rolled back. Earlier assignments keep their saved lesson snapshot.</p>}
    {params.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-950">Launch stopped: {params.error.replaceAll("_", " ")}.</p>}
    <section className="grid gap-2 rounded-xl border border-[var(--border)] bg-white p-4 sm:grid-cols-3" aria-label="Lesson readiness summary">
      <p><strong>{counts.released}</strong> content releases in this view</p><p><strong>{counts.ready}</strong> ready to launch in this view</p><p><strong>{counts.blocked}</strong> need work in this view</p>
    </section>
    <form action="/admin/adle-lesson-readiness" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-white p-4 text-sm">
      <label className="grid gap-1">Route<select name="route" defaultValue={params.route ?? ""} className="rounded-lg border border-[var(--border)] p-2"><option value="">All routes</option>{[...new Set(ADLE_CURRICULUM_ROUTE_REGISTRY.map((row) => row.routeId))].map((route) => <option key={route} value={route}>{route.replaceAll("_", " ")}</option>)}</select></label>
      <label className="grid gap-1">Micro-skill<select name="skill" defaultValue={params.skill ?? ""} className="max-w-xs rounded-lg border border-[var(--border)] p-2"><option value="">All skills</option>{[...new Set(ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap((row) => row.supportedMicroSkillKeys))].sort().map((skill) => <option key={skill} value={skill}>{skill.replaceAll("_", " ")}</option>)}</select></label>

      <button className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold">Show readiness</button>
    </form>
    {routeWords && <section className="rounded-xl border border-[var(--border)] bg-white p-4" aria-label="Governed word readiness">
      <h2 className="text-lg font-semibold">Word readiness for this route</h2>
      <p className="mt-1 text-sm">{routeWords.counts.candidates} associated or route-content words · {routeWords.counts.approvedRelationships} approved relationships · {routeWords.counts.technicalComplete} technically complete · {routeWords.counts.awaitingEditorial} awaiting content review · {routeWords.counts.missingContent} missing route content · {routeWords.counts.administrativeCandidates} through all administrative gates. Child selection is evaluated separately.</p>
      <details className="mt-3"><summary className="cursor-pointer font-semibold">Inspect word gates and blockers</summary>
        <ul className="mt-3 grid gap-2 text-sm">{routeWords.words.slice(0, 50).map((word) => <li key={word.wordId} className="rounded-lg border border-[var(--border)] p-2">
          <Link className="font-semibold underline" href={`/admin/teaching-dictionary/${word.wordId}`}>{word.displayWord}</Link>
          <span> · {word.status.contentRole === "reviewed family base (teaching support)" ? "reviewed family base; teaching support only"
            : word.status.relationshipApproved ? "relationship approved" : "relationship not approved"} · technical facts {word.status.technicalFacts.replaceAll("_", " ")} · {word.status.administrativeCandidate ? "administrative gates passed; child scope checked separately" : "blocked"}</span>
          {word.status.blockerDetails.length > 0 && <ul className="mt-1 list-disc pl-5">{word.status.blockerDetails.map((blocker, index) => <li key={`${blocker.code}:${index}`}>{blocker.gate}: {blocker.message}</li>)}</ul>}
        </li>)}</ul>
        {routeWords.words.length > 50 && <p className="mt-2 text-sm">Showing the first 50 words alphabetically; the counts cover all {routeWords.words.length} words.</p>}
      </details>
    </section>}
    <section className="grid gap-4" aria-label="Registered ADLE lessons">{rows.map((row) =>
      <article key={`${row.routeId}:${row.microSkillKey}`} className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-[color:var(--mid)]">{row.routeId.replaceAll("_", " ")} · {row.routeVersion}</p><h2 className="mt-1 text-lg font-semibold">{row.title}</h2></div>
          <div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${row.status === "released" ? "bg-emerald-50 text-emerald-900" : row.status === "ready_to_launch" ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-900"}`}>{row.status.replaceAll("_", " ")}</span>
            {row.released && row.status !== "released" && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">Content released</span>}
            {row.routeId !== "generic_composer" && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${row.activationEnabled ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-800"}`}>{row.activationEnabled ? "Activation on" : "Activation off"}</span>}</div></div>
        <p className="mt-2 text-sm">Lesson words {row.route.wordCounts.lesson.join("–")} · authentic {row.route.wordCounts.authentic.join("–")} · coverage: {row.route.coverageRequirements.join(", ")}</p>
        {row.releaseId && <p className="mt-1 break-all text-xs text-[color:var(--mid)]">Current release authority: {row.releaseId}{row.releasedBy ? ` · released by ${row.releasedBy}` : ""}{row.releasedAt ? ` · ${new Date(row.releasedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}` : ""}</p>}
        {row.routeId === "generic_composer" ? <p className="mt-2 text-sm">This is the fallback policy. It has no fixed lesson profile to release.</p> : null}
        {row.route.activationAuthority === "database_route_activation"
          ? <p className="mt-2 text-sm">This route uses a separate governed release package. Its published content and activation are shown here; this page does not yet publish a new package for this route.</p> : null}
        {row.route.activationAuthority === "database_route_activation" && !row.released
          ? <p className="mt-2 text-sm">This specialist route also needs its governed release manifest and dependencies. The Teaching Dictionary review alone cannot make it scheduler visible.</p> : null}
        {row.compilerReady && <p className="mt-2 text-sm text-emerald-900">A representative lesson selection compiles with the reviewed content.</p>}
        {row.blockers.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><strong>Content and review blockers</strong><ul className="mt-1 list-disc pl-5">{row.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
        {row.activationBlockers.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 p-3 text-sm"><strong>Separate activation gate</strong><ul className="mt-1 list-disc pl-5">{row.activationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}

        {row.words.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-semibold">Words and parts · {row.words.filter((word) => word.ready).length}/{row.words.length} {row.route.activationAuthority === "database_route_activation" ? "dictionary approved" : "reviewed or runtime ready"}</summary><ul className="mt-2 grid gap-2 text-sm">{row.words.map((word) => <li key={word.id} className="rounded-lg border border-[var(--border)] p-2"><Link className="font-semibold underline" href={word.editHref}>{word.word}</Link> · {word.role.replaceAll("_", " ")} · {word.ready ? row.route.activationAuthority === "database_route_activation" ? "dictionary approved" : "parts ready" : word.blockers.join("; ")}<details className="mt-2"><summary className="cursor-pointer underline">Review exact content</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-3 text-xs">{JSON.stringify(word.contentPreview, null, 2)}</pre></details></li>)}</ul></details>}
        {row.releaseContentPreview.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-semibold">Review exact lesson profile and dependencies</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-3 text-xs">{JSON.stringify(row.releaseContentPreview, null, 2)}</pre></details>}
        {row.status === "ready_to_launch" && <form action={launchReviewedAdleLesson} className="mt-4"><input type="hidden" name="preflight_fingerprint" value={row.preflightFingerprint} /><input type="hidden" name="route_id" value={row.routeId} /><input type="hidden" name="micro_skill_key" value={row.microSkillKey} /><button className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white">Launch reviewed lesson</button><p className="mt-1 text-xs">Publishes the entire lesson profile; the scheduler assigns it when its normal queue rules are met.</p></form>}
        {row.rollbackContentId && <form action={rollbackReviewedAdleLessonVersion} className="mt-4 flex flex-wrap items-end gap-2 text-sm"><input type="hidden" name="preflight_fingerprint" value={row.preflightFingerprint} /><input type="hidden" name="route_id" value={row.routeId} /><input type="hidden" name="micro_skill_key" value={row.microSkillKey} /><input type="hidden" name="content_version_id" value={row.rollbackContentId} /><label className="grid gap-1">Rollback reason<input name="reason" required minLength={8} className="rounded-lg border border-[var(--border)] p-2" placeholder="Reason for restoring the prior version" /></label><button className="rounded-lg border border-amber-500 px-4 py-2 font-semibold text-amber-950">Restore prior profile version</button></form>}
        {!row.released && row.reviewedCandidateIds.length === 0 && row.routeId !== "generic_composer" && <Link className="mt-3 inline-block text-sm underline" href="/admin/teaching-dictionary">Review lesson words in Teaching Dictionary</Link>}
      </article>)}
      {rows.length === 0 && <p className="rounded-lg border border-[var(--border)] bg-white p-4">No registered lesson matches these filters.</p>}
    </section>
  </main>;
}
