"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

const STRIKE_MS = 220;

function CleaverIcon(props: { striking: boolean; reducedMotion: boolean }) {
  const transform = props.striking ? "translateY(38px) rotate(8deg)" : "translateY(0) rotate(-16deg)";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 88 88"
      className={`h-20 w-20 drop-shadow-[0_12px_12px_rgba(8,47,73,.38)] ${props.reducedMotion ? "" : "transition-transform duration-200 ease-in"}`}
      style={{ transform, transformOrigin: "74px 74px" }}
    >
      <path d="M13 10h48c9 0 15 7 15 16v28H13C8 54 4 50 4 45V19c0-5 4-9 9-9Z" fill="#cffafe" stroke="#22d3ee" strokeWidth="4" />
      <path d="M8 43c18 7 42 8 68 2v9H13c-3 0-5-1-7-3Z" fill="#67e8f9" />
      <circle cx="22" cy="24" r="5" fill="#0e7490" opacity=".7" />
      <path d="m62 54 17 25" stroke="#f59e0b" strokeWidth="12" strokeLinecap="round" />
      <path d="m62 54 17 25" stroke="#fef3c7" strokeWidth="4" strokeLinecap="round" opacity=".65" />
      <path d="M76 76l6 8" stroke="#92400e" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

export function SplitHandle(props: {
  word: string;
  splitPoints: number[];
  misses: number;
  correct: boolean;
  muted?: boolean;
  missMessage?: string;
  repeatedMissMessage?: string;
  onMiss: (misses: number) => void;
  onCorrect: () => void;
  onContinue: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [activeBoundary, setActiveBoundary] = useState(1);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [lastWrongBoundary, setLastWrongBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const timers = useRef<number[]>([]);
  const completed = useRef(props.correct);
  const correctButton = useRef<HTMLButtonElement | null>(null);
  const splitPoint = props.splitPoints[0];
  const scaffolded = props.misses >= 2;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (scaffolded && !props.correct) correctButton.current?.focus();
  }, [props.correct, scaffolded]);

  function later(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function choose(point: number) {
    if (striking || completed.current || (scaffolded && !props.splitPoints.includes(point))) return;
    const correct = props.splitPoints.includes(point);
    setActiveBoundary(point);
    setStruckBoundary(point);
    setStriking(true);
    playInteractionSound("cleave", props.muted);

    later(() => {
      setStriking(false);
      if (correct) {
        completed.current = true;
        setLastWrongBoundary(null);
        playInteractionSound("sparkle", props.muted);
        props.onCorrect();
      } else {
        setLastWrongBoundary(point);
        setStruckBoundary(null);
        playInteractionSound("resist", props.muted);
        props.onMiss(Math.min(2, props.misses + 1));
      }
    }, reducedMotion ? 0 : STRIKE_MS);
  }

  if (props.correct) {
    return (
      <section className="grid gap-5 text-center" aria-labelledby="split-correct-heading" aria-live="polite">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span className="rounded-2xl bg-cyan-100 px-5 py-4 text-3xl font-black text-cyan-950">{props.word.slice(0, splitPoint)}</span>
          <span aria-hidden="true" className="text-3xl text-emerald-300">✓</span>
          <span className="rounded-2xl bg-amber-100 px-5 py-4 text-3xl font-black text-amber-950">{props.word.slice(splitPoint)}</span>
        </div>
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-300/40 bg-emerald-50 p-4 text-emerald-950">
          <h2 id="split-correct-heading" className="text-xl font-black">Yes — un- is the first two letters.</h2>
          <p className="mt-1 text-base font-semibold">un + happy makes unhappy.</p>
        </div>
        <button type="button" onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Rebuild the word</button>
      </section>
    );
  }

  const feedback = scaffolded ? props.repeatedMissMessage ?? "un- is the first two letters. Chop after the n." : props.misses > 0 ? props.missMessage ?? "Not there yet. Look for the prefix un- at the front." : "";
  return (
    <div className="text-center">
      <p className="mb-2 text-sm font-bold text-cyan-100">Move the cleaver between two letters, then strike.</p>
      <div role="group" aria-label={`Choose where to split ${props.word}`} className="relative mx-auto mt-2 h-36 w-full max-w-md select-none pt-24">
        <div className="grid h-12 items-center" style={{ gridTemplateColumns: `repeat(${props.word.length}, minmax(0, 1fr))` }}>
          {props.word.split("").map((letter, index) => {
            const separating = striking && struckBoundary !== null;
            const offset = separating ? (index < struckBoundary ? -5 : 5) : 0;
            return <span key={`${letter}-${index}`} className={`text-3xl font-black text-white ${reducedMotion ? "" : "transition-transform duration-200"}`} style={{ transform: `translateX(${offset}px)` }}>{letter}</span>;
          })}
        </div>
        {props.word.slice(0, -1).split("").map((_, index) => {
          const point = index + 1;
          const isCorrectBoundary = props.splitPoints.includes(point);
          const active = activeBoundary === point;
          const wrong = lastWrongBoundary === point;
          const disabled = striking || (scaffolded && !isCorrectBoundary);
          return (
            <button
              key={point}
              ref={isCorrectBoundary ? correctButton : undefined}
              type="button"
              aria-label={`Split after letter ${point}`}
              onPointerEnter={() => !disabled && setActiveBoundary(point)}
              onPointerDown={() => !disabled && setActiveBoundary(point)}
              onFocus={() => setActiveBoundary(point)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                choose(point);
              }}
              onClick={() => choose(point)}
              disabled={disabled}
              className={`absolute top-0 h-36 w-11 -translate-x-1/2 cursor-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 disabled:cursor-not-allowed disabled:opacity-40 ${scaffolded && isCorrectBoundary ? "bg-cyan-300/20 motion-safe:animate-pulse" : "hover:bg-white/5"}`}
              style={{ left: `${(point / props.word.length) * 100}%` }}
            >
              <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                <CleaverIcon striking={striking && struckBoundary === point} reducedMotion={reducedMotion} />
              </span>
              <span aria-hidden="true" className={`absolute bottom-2 left-1/2 grid h-11 w-3 -translate-x-1/2 place-items-center rounded-full text-lg font-black ${wrong ? "bg-red-400 text-red-950 shadow-[0_0_16px_rgba(248,113,113,.8)]" : scaffolded && isCorrectBoundary ? "bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" : active ? "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.75)]" : "bg-white/15"}`}>{wrong ? "×" : ""}</span>
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" className={`mx-auto mt-4 min-h-16 max-w-xl rounded-2xl p-3 text-sm font-bold ${feedback ? scaffolded ? "bg-cyan-100 text-cyan-950" : "bg-red-100 text-red-950" : "bg-transparent text-cyan-100"}`}>{feedback || "Find the end of the prefix at the front of the word."}</div>
    </div>
  );
}
