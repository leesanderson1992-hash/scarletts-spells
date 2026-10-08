"use client";

import type { ReactNode } from "react";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { LessonGuide } from "./lesson-guide";

const PHASES = ["Learn", "Discover", "Split", "Match", "Build", "Remember"] as const;
const PHASE_CUES = ["Learn the idea", "Explore the meaning", "Find the word parts", "Match the meaning", "Build a word", "Remember and reflect"] as const;

export function WordLabScene(props: { beat: GuideBeatV1; phase: number; muted: boolean; onMutedChange: (muted: boolean) => void; silent?: boolean; help?: string; onHelp?: () => void; guideName?: string; phases?: readonly string[]; phaseCues?: readonly string[]; toolbar?: ReactNode; children: ReactNode }) {
  const phases = props.phases ?? PHASES;
  const phaseCues = props.phaseCues ?? PHASE_CUES;
  return <section className="adle-presentation word-lab-scene w-full max-w-full min-w-0 overflow-hidden rounded-[2rem] p-3 md:p-5">
    <nav aria-label="Lesson progress" className="mb-4 flex max-w-full items-center justify-start gap-1 overflow-x-auto text-[11px] font-black uppercase tracking-wider text-cyan-100 md:justify-center">
      {phases.map((label, index) => <span key={`${label}-${index}`} aria-current={index === props.phase ? "step" : undefined} className={`word-lab-step shrink-0 rounded-full px-3 py-2 ${index <= props.phase ? "is-reached" : ""}`}>{label}</span>)}
    </nav>
    <div className="grid min-h-[620px] min-w-0 gap-4 lg:grid-cols-[minmax(220px,30%)_1fr]">
      <LessonGuide beat={props.beat} phaseCue={phaseCues[props.phase] ?? phaseCues[0]} muted={props.muted} onMutedChange={props.onMutedChange} silent={props.silent} help={props.help} guideName={props.guideName} />
      <main className="word-lab-workspace relative grid min-h-[520px] min-w-0 content-center rounded-3xl p-4 pt-20 md:p-8 md:pt-20">
        <div className="absolute left-4 top-4">{props.toolbar}</div>
        {props.onHelp ? <div className="absolute right-4 top-4"><button type="button" onClick={props.onHelp} className="word-lab-tool min-h-11 rounded-full px-4 text-sm font-bold">Need a clue?</button></div> : null}
        {props.children}
      </main>
    </div>
  </section>;
}
