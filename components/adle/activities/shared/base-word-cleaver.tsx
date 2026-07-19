"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

const STRIKE_MS = 220;

export type BaseWordCleaveSegment = { id: string; text: string };

function CleaverIcon(props: { striking: boolean; reducedMotion: boolean }) {
  const transform = props.striking ? "translateY(32px) rotate(8deg)" : "translateY(0) rotate(-16deg)";
  return <svg aria-hidden="true" viewBox="0 0 88 88" className={`h-16 w-16 drop-shadow-[0_12px_12px_rgba(8,47,73,.38)] ${props.reducedMotion ? "" : "transition-transform duration-200 ease-in"}`} style={{ transform, transformOrigin: "74px 74px" }}><path d="M13 10h48c9 0 15 7 15 16v28H13C8 54 4 50 4 45V19c0-5 4-9 9-9Z" fill="#cffafe" stroke="#22d3ee" strokeWidth="4" /><path d="M8 43c18 7 42 8 68 2v9H13c-3 0-5-1-7-3Z" fill="#67e8f9" /><circle cx="22" cy="24" r="5" fill="#0e7490" opacity=".7" /><path d="m62 54 17 25" stroke="#f59e0b" strokeWidth="12" strokeLinecap="round" /><path d="m62 54 17 25" stroke="#fef3c7" strokeWidth="4" strokeLinecap="round" /><path d="M76 76l6 8" stroke="#92400e" strokeWidth="14" strokeLinecap="round" /></svg>;
}

/**
 * A guided morphology activity which removes the material on either side of
 * one reviewed base. It intentionally has no evidence or completion writes.
 */
export function BaseWordCleaver(props: {
  word: string;
  segments: BaseWordCleaveSegment[];
  baseIndex: number;
  completedCuts: number;
  misses: number;
  muted?: boolean;
  onMiss: (misses: number) => void;
  onContinue: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [activeBoundary, setActiveBoundary] = useState<number | null>(null);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [lastWrongBoundary, setLastWrongBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const [correct, setCorrect] = useState(false);
  const timers = useRef<number[]>([]);
  const correctButton = useRef<HTMLButtonElement | null>(null);
  const boundaryButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const requiredCuts = [props.baseIndex > 0 ? props.baseIndex - 1 : null, props.baseIndex < props.segments.length - 1 ? props.baseIndex : null].filter((value): value is number => value !== null);
  const targetBoundary = requiredCuts[props.completedCuts];
  const scaffolded = props.misses >= 2;
  const cutBefore = (segmentIndex: number) => requiredCuts.slice(0, props.completedCuts).includes(segmentIndex - 1);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (scaffolded && !correct) correctButton.current?.focus();
  }, [correct, scaffolded]);
  useEffect(() => {
    if (!correct && props.misses === 1 && lastWrongBoundary !== null) boundaryButtons.current[lastWrongBoundary]?.focus();
  }, [correct, lastWrongBoundary, props.misses]);

  function later(callback: () => void, delay: number) { timers.current.push(window.setTimeout(callback, delay)); }
  function choose(boundary: number) {
    if (striking || correct || (scaffolded && boundary !== targetBoundary)) return;
    setActiveBoundary(boundary);
    setStruckBoundary(boundary);
    setStriking(true);
    playInteractionSound("cleave", props.muted);
    later(() => {
      setStriking(false);
      if (boundary === targetBoundary) {
        setCorrect(true);
        setLastWrongBoundary(null);
        playInteractionSound("sparkle", props.muted);
      } else {
        setLastWrongBoundary(boundary);
        setStruckBoundary(null);
        playInteractionSound("resist", props.muted);
        props.onMiss(Math.min(2, props.misses + 1));
      }
    }, reducedMotion ? 0 : STRIKE_MS);
  }

  const isFinalCut = props.completedCuts + 1 === requiredCuts.length;
  const direction = targetBoundary < props.baseIndex ? "before" : "after";
  const neighbour = props.segments[direction === "before" ? targetBoundary : targetBoundary + 1];
  const feedback = scaffolded ? `The next cut separates ${props.segments[targetBoundary]?.text} and ${props.segments[targetBoundary + 1]?.text}.` : props.misses > 0 ? "Try again. Look for the edge of a meaningful word part." : "Choose where to make the next cut.";

  return <section className="grid gap-5 text-center" aria-labelledby="base-cleaver-heading">
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Cleave out the base</p>
    <h2 id="base-cleaver-heading" className="text-3xl font-black text-white">Separate the part {direction} <span className="text-amber-200">{props.segments[props.baseIndex]?.text}</span>.</h2>
    <p className="text-cyan-50">We are moving <strong>{neighbour?.text}</strong> aside so that <strong>{props.segments[props.baseIndex]?.text}</strong> is left in the middle.</p>
    <div className="mx-auto w-full max-w-3xl overflow-x-auto rounded-3xl border border-cyan-200/25 bg-slate-950/30 px-3 py-10">
      <div role="group" aria-label={`Separate the word parts in ${props.word}`} className="mx-auto flex min-w-max items-center justify-center px-4">
        {props.segments.map((segment, index) => {
          const separatedBefore = cutBefore(index) || (correct && index === targetBoundary + 1);
          const isolated = isFinalCut && correct && index === props.baseIndex;
          const movedAside = (index < props.baseIndex && cutBefore(index + 1)) || (index > props.baseIndex && cutBefore(index)) || (correct && isFinalCut && index !== props.baseIndex);
          return <div key={segment.id} className="contents">
            {index > 0 ? <button ref={(node) => { boundaryButtons.current[index - 1] = node; if (index - 1 === targetBoundary) correctButton.current = node; }} type="button" aria-label={`Separate ${props.segments[index - 1].text} from ${segment.text}`} disabled={striking || correct || requiredCuts.slice(0, props.completedCuts).includes(index - 1) || (scaffolded && index - 1 !== targetBoundary)} onPointerEnter={() => setActiveBoundary(index - 1)} onFocus={() => setActiveBoundary(index - 1)} onClick={() => choose(index - 1)} className={`relative grid h-20 w-12 shrink-0 place-items-start rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 disabled:cursor-not-allowed ${separatedBefore ? "mx-4" : "mx-0"} ${scaffolded && index - 1 === targetBoundary ? "bg-cyan-300/20 motion-safe:animate-pulse" : "hover:bg-white/10"}`}><span className={`absolute top-0 ${activeBoundary === index - 1 || scaffolded && index - 1 === targetBoundary ? "opacity-100" : "opacity-0"}`}><CleaverIcon striking={striking && struckBoundary === index - 1} reducedMotion={reducedMotion} /></span><span aria-hidden="true" className={`absolute bottom-1 h-10 w-1 rounded-full ${lastWrongBoundary === index - 1 ? "bg-red-400" : scaffolded && index - 1 === targetBoundary ? "bg-cyan-300" : "bg-white/30"}`} /></button> : null}
            <span className={`rounded-2xl px-4 py-3 text-3xl font-black transition-all duration-300 ${isolated ? "scale-110 bg-amber-100 text-amber-950 shadow-[0_0_0_5px_rgba(252,211,77,.35)]" : movedAside ? "bg-cyan-950/70 text-cyan-100 opacity-75" : "bg-white text-slate-950"}`}>{segment.text}</span>
          </div>;
        })}
      </div>
    </div>
    {correct ? <div className="grid gap-4" role="status" aria-live="polite"><div className="rounded-2xl bg-emerald-100 p-4 text-emerald-950"><p className="text-xl font-black">{isFinalCut ? `You found the base word: ${props.segments[props.baseIndex]?.text}.` : `Yes — ${props.segments[targetBoundary]?.text} is separate.`}</p><p className="mt-1 font-semibold">{isFinalCut ? "The other word parts have moved aside." : "Now find the other edge of the base word."}</p></div><button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">{isFinalCut ? "Build words from meanings" : "Make the next cut"}</button></div> : <div role="status" aria-live="polite" className={`mx-auto min-h-14 max-w-xl rounded-2xl p-3 text-sm font-bold ${props.misses ? scaffolded ? "bg-cyan-100 text-cyan-950" : "bg-red-100 text-red-950" : "bg-white/10 text-cyan-50"}`}>{feedback}</div>}
  </section>;
}
