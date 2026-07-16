"use client";

import { useState } from "react";
import { DiffReveal } from "./diff-reveal";
import { playInteractionSound } from "./sound";
import { useReducedMotion } from "./motion";

export type ShutterState = "look" | "cover" | "write" | "check";

export function CoverShutter(props: { word: string; splitPoints: number[]; initialState?: ShutterState; initialAttempt?: string; muted?: boolean; onStateChange?: (state: ShutterState, attempt: string) => void; onComplete?: (attempt: string) => void }) {
  const [state, setState] = useState<ShutterState>(props.initialState ?? "look");
  const [attempt, setAttempt] = useState(props.initialAttempt ?? "");
  const reducedMotion = useReducedMotion();
  function change(next: ShutterState) { setState(next); props.onStateChange?.(next, attempt); }
  function closeShutter() { change("cover"); playInteractionSound("shutter", props.muted); window.setTimeout(() => change("write"), reducedMotion ? 0 : 300); }
  return <div className="grid gap-4 rounded-3xl border border-white/15 bg-slate-950/50 p-5"><div className="relative min-h-28 overflow-hidden rounded-2xl bg-white/5 p-6 text-center">{state === "look" || state === "check" ? <p className="text-4xl font-black tracking-wide text-white">{props.word.slice(0, props.splitPoints[0])}<span className="mx-1 text-cyan-300">|</span>{props.word.slice(props.splitPoints[0])}</p> : null}<div aria-hidden="true" className={`absolute inset-0 grid place-items-center bg-gradient-to-b from-slate-700 to-slate-900 text-sm font-bold uppercase tracking-[0.3em] text-cyan-100 ${reducedMotion ? "" : "transition-transform duration-300"} ${state === "cover" || state === "write" ? "translate-y-0" : state === "check" ? "-translate-y-full" : "-translate-y-full"}`}>word covered</div></div>{state === "look" ? <button type="button" onClick={closeShutter} className="min-h-12 rounded-full bg-cyan-300 px-5 font-black text-slate-950">Cover the word</button> : null}{state === "write" ? <div><label className="text-sm font-semibold text-cyan-50">Type the whole word<input autoFocus autoComplete="off" spellCheck={false} value={attempt} onChange={(event) => { setAttempt(event.target.value); props.onStateChange?.("write", event.target.value); }} className="mt-2 w-full rounded-2xl border border-cyan-300/40 bg-white p-4 text-xl text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30" /></label><button type="button" disabled={!attempt.trim()} onClick={() => { change("check"); playInteractionSound("reveal", props.muted); props.onComplete?.(attempt); }} className="mt-3 min-h-12 w-full rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40">Check</button></div> : null}{state === "check" ? <DiffReveal attempt={attempt} expected={props.word} splitPoints={props.splitPoints} /> : null}</div>;
}
