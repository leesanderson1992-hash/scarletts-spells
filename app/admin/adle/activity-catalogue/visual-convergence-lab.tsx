"use client";

import { useState } from "react";

import {
  ADLE_VISUAL_CONVERGENCE_GROUPS,
  type VisualConvergenceCandidate,
  type VisualConvergenceClassification,
  type VisualFixtureState,
} from "@/lib/adle/activity-visual-convergence";

import { VisualConvergenceCandidatePreview } from "./visual-convergence-candidates";

const CLASSIFICATIONS: readonly Exclude<VisualConvergenceClassification, "OWNER_REVIEW_REQUIRED">[] = [
  "SAME_ENGINE", "SAME_ENGINE_DIFFERENT_MODE", "SAME_ENGINE_DIFFERENT_SKIN",
  "GENUINELY_DIFFERENT_INTERACTION", "RETIRE",
];

const STATE_LABELS: Record<VisualFixtureState, string> = {
  initial: "Initial", active: "Active", incorrect: "Incorrect", scaffold: "Scaffold",
  success: "Success", completed: "Completed", restored: "Resume / restored",
};

function DetailList(props: { title: string; items: readonly string[] }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
    <h3 className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">{props.title}</h3>
    <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-cyan-50">{props.items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true" className="text-amber-300">•</span><span>{item}</span></li>)}</ul>
  </section>;
}

function CandidateCard(props: { groupId: string; candidate: VisualConvergenceCandidate }) {
  const [state, setState] = useState<VisualFixtureState>(props.candidate.supportedStates[0] ?? "initial");
  const documentedOnly = props.candidate.mount === "documented_only";
  return <article className={`overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-[0_18px_50px_rgba(15,23,42,.16)] ${props.candidate.id === "compound-generalized" ? "xl:col-span-2" : ""}`}>
    <header className="border-b border-white/10 bg-slate-900 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-white">{props.candidate.name}</h3>
          <p className="mt-1 text-xs font-semibold text-cyan-200">{props.candidate.provenance}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide ${props.candidate.classification === "OWNER_REVIEW_REQUIRED" ? "border-amber-300/50 bg-amber-300/10 text-amber-100" : props.candidate.classification === "RETIRE" ? "border-rose-300/50 bg-rose-300/10 text-rose-100" : "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"}`}>{props.candidate.classification}</span>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] text-slate-400">{props.candidate.componentPath}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-200">{props.candidate.mount.replaceAll("_", " ")}</span>
        {!documentedOnly ? props.candidate.supportedStates.map((fixtureState) => <button key={fixtureState} type="button" aria-pressed={state === fixtureState} onClick={() => setState(fixtureState)} className={`min-h-9 rounded-full border px-3 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 ${state === fixtureState ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/20 bg-white/5 text-cyan-50 hover:border-cyan-300/60"}`}>{STATE_LABELS[fixtureState]}</button>) : null}
      </div>
    </header>
    <div className="p-4 sm:p-5">
      {documentedOnly ? <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-amber-300/40 bg-amber-100/10 p-6 text-center"><div><p className="text-sm font-black uppercase tracking-[.16em] text-amber-200">Documented, not mounted</p><p className="mt-3 max-w-lg text-sm leading-6 text-amber-50">{props.candidate.note}</p></div></div> : <VisualConvergenceCandidatePreview key={`${props.candidate.id}:${state}`} groupId={props.groupId} candidateId={props.candidate.id} state={state} />}
      {!documentedOnly ? <p className="mt-5 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">{props.candidate.note}</p> : null}
    </div>
  </article>;
}

export function VisualConvergenceLab() {
  const [activeId, setActiveId] = useState(ADLE_VISUAL_CONVERGENCE_GROUPS[0].id);
  const group = ADLE_VISUAL_CONVERGENCE_GROUPS.find((candidate) => candidate.id === activeId) ?? ADLE_VISUAL_CONVERGENCE_GROUPS[0];
  return <section aria-labelledby="visual-convergence-heading" className="grid gap-6">
    <div className="rounded-[2rem] border border-slate-700 bg-slate-950 p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,.2)] sm:p-7">
      <p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300">Read-only comparison surface</p>
      <h2 id="visual-convergence-heading" className="mt-2 text-3xl font-black">Visual Convergence Lab</h2>
      <p className="mt-3 max-w-4xl leading-7 text-cyan-50">Compare the real interaction, not filenames. Pedagogical concepts remain governed by the Activity Catalogue; this lab asks whether several concepts or route adapters can eventually share a smaller renderer engine.</p>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Possible visual convergence classifications">{CLASSIFICATIONS.map((classification) => <span key={classification} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-black tracking-wide text-slate-200">{classification}</span>)}</div>
      <p className="mt-3 text-sm font-semibold text-amber-100">No owner-review classification is inferred from visual similarity alone. Existing audit-established development-preview duplicates are the only candidates pre-marked RETIRE.</p>
    </div>

    <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Visual convergence groups">{ADLE_VISUAL_CONVERGENCE_GROUPS.map((candidate) => <button key={candidate.id} type="button" onClick={() => setActiveId(candidate.id)} aria-current={candidate.id === group.id ? "page" : undefined} className={`min-h-12 shrink-0 rounded-full border px-4 text-sm font-black ${candidate.id === group.id ? "border-[color:var(--scarlett)] bg-[color:var(--scarlett)] text-white" : "border-[var(--border)] bg-white text-[color:var(--ink)] hover:border-[color:var(--scarlett)]"}`}>Group {candidate.number} · {candidate.title}</button>)}</nav>

    <section className="rounded-[2rem] border border-slate-700 bg-slate-900 p-5 text-white sm:p-7" aria-labelledby={`group-${group.id}-heading`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-4xl"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Group {group.number}</p><h2 id={`group-${group.id}-heading`} className="mt-1 text-3xl font-black">{group.title}</h2><p className="mt-3 text-lg leading-7 text-amber-100">{group.question}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 text-right"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Interaction family</p><p className="mt-1 max-w-xs font-semibold text-cyan-50">{group.interactionFamily}</p></div>
      </div>
      <p className="mt-5 text-sm text-slate-300"><span className="font-black text-white">Known concepts:</span> {group.pedagogicalConcepts.join(" · ")}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailList title="Behavioural differences" items={group.behaviouralDifferences} />
        <DetailList title="Visual-only differences" items={group.visualOnlyDifferences} />
        <DetailList title="Persistence / evidence" items={group.persistenceEvidenceDifferences} />
        <DetailList title="Historical replay" items={group.historicalReplayRequirements} />
      </div>
    </section>

    <div className="grid items-start gap-5 xl:grid-cols-2">{group.candidates.map((candidate) => <CandidateCard key={candidate.id} groupId={group.id} candidate={candidate} />)}</div>
  </section>;
}
