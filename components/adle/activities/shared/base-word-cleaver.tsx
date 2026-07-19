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

function segmentBoundaries(segments: BaseWordCleaveSegment[]): number[] {
  let position = 0;
  return segments.slice(0, -1).map((segment) => (position += segment.text.length));
}

/** A guided, no-evidence activity that visually cuts a joined word down to its reviewed base. */
export function BaseWordCleaver(props: {
  word: string;
  segments: BaseWordCleaveSegment[];
  baseIndex: number;
  selectedCuts: number[];
  misses: number;
  muted?: boolean;
  onCutsChange: (cuts: number[]) => void;
  onMiss: (misses: number) => void;
  onContinue: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [activeBoundary, setActiveBoundary] = useState<number | null>(null);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [lastWrongBoundary, setLastWrongBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const timers = useRef<number[]>([]);
  const boundaryButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const boundaries = segmentBoundaries(props.segments);
  const validCuts = [props.baseIndex > 0 ? boundaries[props.baseIndex - 1] : null, props.baseIndex < props.segments.length - 1 ? boundaries[props.baseIndex] : null].filter((value): value is number => value !== null);
  const selectedCuts = [...new Set(props.selectedCuts)].filter((point) => validCuts.includes(point)).sort((a, b) => a - b);
  const availableCuts = validCuts.filter((point) => !selectedCuts.includes(point));
  const complete = availableCuts.length === 0;
  const scaffolded = props.misses >= 2;
  const baseStart = props.segments.slice(0, props.baseIndex).reduce((total, segment) => total + segment.text.length, 0);
  const baseEnd = baseStart + props.segments[props.baseIndex].text.length;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (scaffolded && !complete) boundaryButtons.current[availableCuts[0]]?.focus();
  }, [availableCuts, complete, scaffolded]);

  function later(callback: () => void, delay: number) { timers.current.push(window.setTimeout(callback, delay)); }
  function choose(point: number) {
    if (striking || complete || (scaffolded && !availableCuts.includes(point))) return;
    setActiveBoundary(point);
    setStruckBoundary(point);
    setStriking(true);
    playInteractionSound("cleave", props.muted);
    later(() => {
      setStriking(false);
      if (availableCuts.includes(point)) {
        setLastWrongBoundary(null);
        props.onCutsChange([...selectedCuts, point].sort((a, b) => a - b));
        playInteractionSound("sparkle", props.muted);
      } else {
        setLastWrongBoundary(point);
        setStruckBoundary(null);
        playInteractionSound("resist", props.muted);
        props.onMiss(Math.min(2, props.misses + 1));
      }
    }, reducedMotion ? 0 : STRIKE_MS);
  }

  function choppedBefore(segmentIndex: number): boolean {
    const point = props.segments.slice(0, segmentIndex).reduce((total, segment) => total + segment.text.length, 0);
    return selectedCuts.includes(point);
  }

  const feedback = complete ? `You found the base word: ${props.segments[props.baseIndex]?.text}.` : scaffolded ? "Choose one of the glowing gaps beside the base word." : props.misses ? "Try again. Look for the edge of a meaningful word part." : selectedCuts.length ? "Great chop. Find another edge of the base word." : "Choose where to chop the word.";
  return <section className="grid gap-5 text-center" aria-labelledby="base-cleaver-heading">
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Cleave out the base</p>
    <h2 id="base-cleaver-heading" className="text-3xl font-black text-white">Chop the word until only <span className="text-amber-200">{props.segments[props.baseIndex]?.text}</span> is left in the middle.</h2>
    <p className="text-cyan-50">Choose where to chop. Some words need one chop; others need two.</p>
    <div className="mx-auto w-full max-w-3xl overflow-x-auto rounded-3xl border border-cyan-200/25 bg-slate-950/30 px-3 py-10">
      <div role="group" aria-label={`Chop ${props.word} to find its base word`} className="relative mx-auto h-32 min-w-[18rem] max-w-xl select-none">
        <div className="absolute inset-x-0 top-16 flex justify-center text-4xl font-black tracking-normal text-white">
          {props.segments.map((segment, index) => {
            const separated = choppedBefore(index);
            const isolated = complete && index === props.baseIndex;
            const aside = selectedCuts.length > 0 && index !== props.baseIndex && (choppedBefore(index) || selectedCuts.some((point) => point === baseEnd && index > props.baseIndex));
            return <span key={segment.id} className={`transition-all duration-300 ${separated ? "ml-10" : "ml-0"} ${isolated ? "rounded-2xl bg-amber-100 px-3 py-1 text-amber-950 shadow-[0_0_0_5px_rgba(252,211,77,.35)]" : aside ? "text-cyan-100 opacity-65" : ""}`}>{segment.text}</span>;
          })}
        </div>
        {props.word.slice(0, -1).split("").map((_, index) => {
          const point = index + 1;
          const selected = selectedCuts.includes(point);
          const valid = availableCuts.includes(point);
          const disabled = striking || complete || selected || (scaffolded && !valid);
          const before = props.word.slice(0, point);
          const after = props.word.slice(point);
          return <button key={point} ref={(node) => { boundaryButtons.current[point] = node; }} type="button" aria-label={`Chop between ${before} and ${after}`} disabled={disabled} onPointerEnter={() => !disabled && setActiveBoundary(point)} onFocus={() => !disabled && setActiveBoundary(point)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(point); } }} onClick={() => choose(point)} className={`absolute top-0 h-28 w-8 -translate-x-1/2 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 disabled:cursor-not-allowed ${scaffolded && valid ? "bg-cyan-300/20 motion-safe:animate-pulse" : "hover:bg-white/10"}`} style={{ left: `${(point / props.word.length) * 100}%` }}><span className={`absolute top-0 left-1/2 -translate-x-1/2 ${activeBoundary === point || scaffolded && valid ? "opacity-100" : "opacity-0"}`}><CleaverIcon striking={striking && struckBoundary === point} reducedMotion={reducedMotion} /></span><span aria-hidden="true" className={`absolute bottom-0 left-1/2 h-9 w-1 -translate-x-1/2 rounded-full ${lastWrongBoundary === point ? "bg-red-400" : scaffolded && valid ? "bg-cyan-300" : selected ? "bg-emerald-300" : "bg-white/25"}`} /></button>;
        })}
      </div>
    </div>
    <div role="status" aria-live="polite" className={`mx-auto min-h-14 max-w-xl rounded-2xl p-3 text-sm font-bold ${complete ? "bg-emerald-100 text-emerald-950" : props.misses ? scaffolded ? "bg-cyan-100 text-cyan-950" : "bg-red-100 text-red-950" : "bg-white/10 text-cyan-50"}`}>{feedback}</div>
    {complete ? <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Build words from meanings</button> : null}
  </section>;
}
