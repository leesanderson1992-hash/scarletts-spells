"use client";

import { useState } from "react";
import { INTERACTION_MOTION } from "./motion";
import { useReducedMotion } from "./motion";

export function FlipToggle(props: { prefix: string; base: string; baseMeaning: string; derivedMeaning: string; disabled?: boolean; onChange?: (joined: boolean) => void }) {
  const [joined, setJoined] = useState(false);
  const reducedMotion = useReducedMotion();
  return <div className="grid items-stretch gap-4 md:grid-cols-2"><button type="button" disabled={props.disabled} aria-pressed={joined} onClick={() => { const next = !joined; setJoined(next); props.onChange?.(next); }} className="relative flex min-h-44 items-center justify-center rounded-3xl border border-cyan-300/40 bg-slate-950/60 p-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40"><span style={{ transform: reducedMotion ? undefined : `translateX(${joined ? 0 : -28}px)`, transition: reducedMotion ? "none" : `transform ${INTERACTION_MOTION.snapMs}ms` }} className="rounded-xl bg-cyan-100 px-4 py-3 text-2xl font-black text-cyan-950">{props.prefix}</span><span className="rounded-xl bg-amber-100 px-4 py-3 text-2xl font-black text-amber-950">{props.base}</span></button><section className="grid min-h-44 content-center rounded-3xl border border-cyan-200/40 bg-cyan-50 p-5 text-left text-cyan-950"><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">{joined ? "Meaning with un-" : "Meaning before un-"}</p><p aria-live="polite" className="mt-3 text-2xl font-black leading-tight">{joined ? props.derivedMeaning : props.baseMeaning}</p></section></div>;
}
