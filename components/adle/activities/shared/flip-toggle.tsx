"use client";

import { useState } from "react";
import { INTERACTION_MOTION } from "./motion";
import { useReducedMotion } from "./motion";

export function FlipToggle(props: { prefix: string; base: string; baseMeaning: string; derivedMeaning: string; disabled?: boolean; onChange?: (joined: boolean) => void }) {
  const [joined, setJoined] = useState(false);
  const reducedMotion = useReducedMotion();
  return <div className="grid justify-items-center gap-5"><button type="button" disabled={props.disabled} aria-pressed={joined} onClick={() => { const next = !joined; setJoined(next); props.onChange?.(next); }} className="relative flex min-h-28 min-w-72 items-center justify-center rounded-3xl border border-cyan-300/40 bg-slate-950/60 p-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40"><span style={{ transform: reducedMotion ? undefined : `translateX(${joined ? 0 : -28}px)`, transition: reducedMotion ? "none" : `transform ${INTERACTION_MOTION.snapMs}ms` }} className="rounded-xl bg-cyan-100 px-4 py-3 text-2xl font-black text-cyan-950">{props.prefix}</span><span className="rounded-xl bg-amber-100 px-4 py-3 text-2xl font-black text-amber-950">{props.base}</span></button><p aria-live="polite" className="min-h-7 text-lg font-semibold text-cyan-50">{joined ? props.derivedMeaning : props.baseMeaning}</p></div>;
}
