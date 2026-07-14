"use client";

import type { ReactNode } from "react";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { LessonGuide } from "./lesson-guide";

const PHASES = ["Learn", "Discover", "Split", "Match", "Build", "Remember"] as const;
const PHASE_CUES = ["Learn the idea", "Explore the meaning", "Find the word parts", "Match the meaning", "Build a word", "Remember and reflect"] as const;

export function WordLabScene(props: { beat: GuideBeatV1; phase: number; muted: boolean; onMutedChange: (muted: boolean) => void; silent?: boolean; help?: string; onHelp?: () => void; children: ReactNode }) {
  return <section className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(8,145,178,.22),transparent_42%),linear-gradient(145deg,#07111f,#0f2742)] p-3 shadow-[0_30px_100px_rgba(2,6,23,.35)] md:p-5"><nav aria-label="Lesson progress" className="mb-4 flex items-center justify-center gap-1 overflow-x-auto text-[11px] font-black uppercase tracking-wider text-cyan-100">{PHASES.map((label, index) => <span key={label} aria-current={index === props.phase ? "step" : undefined} className={`rounded-full px-3 py-2 ${index <= props.phase ? "bg-cyan-300 text-slate-950" : "bg-white/8"}`}>{label}</span>)}</nav><div className="grid min-h-[620px] gap-4 lg:grid-cols-[minmax(220px,30%)_1fr]"><LessonGuide beat={props.beat} phaseCue={PHASE_CUES[props.phase] ?? PHASE_CUES[0]} muted={props.muted} onMutedChange={props.onMutedChange} silent={props.silent} help={props.help} /><main className="relative grid min-h-[520px] content-center rounded-3xl border border-white/10 bg-white/[0.055] p-4 md:p-8"><div className="absolute right-4 top-4"><button type="button" onClick={props.onHelp} className="min-h-11 rounded-full border border-cyan-100/20 bg-slate-950/50 px-4 text-sm font-bold text-cyan-50">Need a clue?</button></div>{props.children}</main></div></section>;
}
