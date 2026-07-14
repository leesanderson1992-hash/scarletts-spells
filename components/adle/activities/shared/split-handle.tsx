"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

const STRIKE_MS = 220;
const RESULT_MS = 450;

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

export function SplitHandle(props: { word: string; splitPoints: number[]; muted?: boolean; missMessage?: string; repeatedMissMessage?: string; onComplete?: (parts: string[]) => void }) {
  const reducedMotion = useReducedMotion();
  const [misses, setMisses] = useState(0);
  const [split, setSplit] = useState<number | null>(null);
  const [activeBoundary, setActiveBoundary] = useState(1);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const timers = useRef<number[]>([]);
  const completed = useRef(false);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function later(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function choose(point: number) {
    if (striking || completed.current) return;
    const correct = props.splitPoints.includes(point);
    setActiveBoundary(point);
    setStruckBoundary(point);
    setStriking(true);
    playInteractionSound("cleave", props.muted);

    later(() => {
      if (correct) {
        completed.current = true;
        setSplit(point);
        setStriking(false);
        playInteractionSound("sparkle", props.muted);
        later(() => props.onComplete?.([props.word.slice(0, point), props.word.slice(point)]), reducedMotion ? 0 : RESULT_MS);
      } else {
        setMisses((value) => value + 1);
        setStriking(false);
        setStruckBoundary(null);
      }
    }, reducedMotion ? 0 : STRIKE_MS);
  }

  if (split !== null) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4" aria-live="polite">
        <span className="rounded-2xl bg-cyan-100 px-5 py-4 text-2xl font-black text-cyan-950">{props.word.slice(0, split)}</span>
        <span aria-hidden="true" className="text-2xl text-amber-300">✦</span>
        <span className="rounded-2xl bg-amber-100 px-5 py-4 text-2xl font-black text-amber-950">{props.word.slice(split)}</span>
        <span className="sr-only">Correct. {props.word} splits after letter {split}.</span>
      </div>
    );
  }

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
          const active = activeBoundary === point;
          return (
            <button
              key={point}
              type="button"
              aria-label={`Split after letter ${point}`}
              onPointerEnter={() => setActiveBoundary(point)}
              onPointerDown={() => setActiveBoundary(point)}
              onFocus={() => setActiveBoundary(point)}
              onClick={() => choose(point)}
              aria-disabled={striking}
              className={`absolute top-0 h-36 w-11 -translate-x-1/2 cursor-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 ${striking ? "cursor-wait" : ""} ${misses >= 2 && props.splitPoints.includes(point) ? "bg-cyan-300/15 motion-safe:animate-pulse" : "hover:bg-white/5"}`}
              style={{ left: `${(point / props.word.length) * 100}%` }}
            >
              <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                <CleaverIcon striking={striking && struckBoundary === point} reducedMotion={reducedMotion} />
              </span>
              <span aria-hidden="true" className={`absolute bottom-2 left-1/2 h-11 w-1 -translate-x-1/2 rounded-full ${active ? "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.75)]" : "bg-white/15"}`} />
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{misses > 0 ? misses > 1 ? props.repeatedMissMessage ?? props.missMessage ?? "Try the boundary after the prefix." : props.missMessage ?? "That point resisted. Try another boundary." : ""}</p>
    </div>
  );
}
