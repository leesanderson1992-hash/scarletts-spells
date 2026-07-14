"use client";

import { useState } from "react";
import { playInteractionSound } from "./sound";

export function SplitHandle(props: { word: string; splitPoints: number[]; muted?: boolean; missMessage?: string; repeatedMissMessage?: string; onComplete?: (parts: string[]) => void }) {
  const [misses, setMisses] = useState(0);
  const [split, setSplit] = useState<number | null>(null);
  const [handle, setHandle] = useState(1);
  function choose(point: number) {
    if (props.splitPoints.includes(point)) { setSplit(point); playInteractionSound("cleave", props.muted); props.onComplete?.([props.word.slice(0, point), props.word.slice(point)]); }
    else setMisses((value) => value + 1);
  }
  if (split !== null) return <div className="flex items-center justify-center gap-4" aria-live="polite"><span className="rounded-2xl bg-cyan-100 px-5 py-4 text-2xl font-black text-cyan-950">{props.word.slice(0, split)}</span><span aria-hidden="true" className="text-cyan-300">✦</span><span className="rounded-2xl bg-amber-100 px-5 py-4 text-2xl font-black text-amber-950">{props.word.slice(split)}</span></div>;
  return <div className="text-center"><p className="mb-3 text-3xl font-black tracking-wide text-white">{props.word}</p><label className="mx-auto mb-4 block max-w-sm text-xs font-bold uppercase tracking-wide text-cyan-100">Drag the split handle<input type="range" min="1" max={props.word.length - 1} value={handle} onChange={(event) => setHandle(Number(event.target.value))} onPointerUp={() => choose(handle)} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") choose(handle); }} className="mt-2 w-full accent-cyan-300" /></label><div role="group" aria-label={`Choose where to split ${props.word}`} className="inline-flex items-end">{props.word.split("").map((letter, index) => <span key={`${letter}-${index}`} className="inline-flex items-end"><span className="text-2xl font-black text-white">{letter}</span>{index < props.word.length - 1 ? <button type="button" aria-label={`Split after letter ${index + 1}`} onClick={() => choose(index + 1)} className={`mx-0.5 h-10 w-3 rounded-full transition motion-reduce:transition-none ${misses >= 2 && props.splitPoints.includes(index + 1) ? "animate-pulse bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)] motion-reduce:animate-none" : "bg-white/15 hover:bg-white/40 focus-visible:bg-cyan-300"}`} /> : null}</span>)}</div><p className="sr-only" aria-live="polite">{misses > 0 ? misses > 1 ? props.repeatedMissMessage ?? props.missMessage ?? "Try the boundary after the prefix." : props.missMessage ?? "That point resisted. Try another boundary." : ""}</p></div>;
}
