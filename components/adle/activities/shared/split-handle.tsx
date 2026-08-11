"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

const STRIKE_MS = 220;

export function splitHandleDisplayParts(
  word: string,
  splitPoints: readonly number[],
  components?: readonly string[],
): string[] {
  if (components && components.length > 0) return [...components];
  const split = [...splitPoints]
    .sort((left, right) => left - right)
    .reduce<{ parts: string[]; start: number }>((result, point) => ({
      parts: [...result.parts, word.slice(result.start, point)],
      start: point,
    }), { parts: [], start: 0 });
  return [...split.parts, word.slice(split.start)];
}

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
  components?: readonly string[];
  misses: number;
  correct: boolean;
  muted?: boolean;
  missMessage?: string;
  repeatedMissMessage?: string;
  correctHeading?: string;
  correctExplanation?: string;
  prompt?: string;
  missPrompt?: string;
  repeatedMissPrompt?: string;
  revealCorrectBoundaryAfterMisses?: boolean;
  continueLabel?: string;
  onMiss: (misses: number) => void;
  onCorrect: () => void;
  onContinue: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [activeBoundary, setActiveBoundary] = useState(1);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [lastWrongBoundary, setLastWrongBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [foundBoundaries, setFoundBoundaries] = useState<number[]>([]);
  const timers = useRef<number[]>([]);
  const completed = useRef(props.correct);
  const correctButton = useRef<HTMLButtonElement | null>(null);
  const continueButton = useRef<HTMLButtonElement | null>(null);
  const boundaryButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatedMiss = props.misses >= 2;
  const scaffolded =
    props.revealCorrectBoundaryAfterMisses !== false && repeatedMiss;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (scaffolded && !props.correct) correctButton.current?.focus();
  }, [props.correct, scaffolded]);
  useEffect(() => {
    if (props.correct) continueButton.current?.focus();
  }, [props.correct]);
  useEffect(() => {
    if (!props.correct && props.misses === 1 && lastWrongBoundary !== null) {
      boundaryButtons.current[lastWrongBoundary]?.focus();
    }
  }, [lastWrongBoundary, props.correct, props.misses]);

  function later(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function choose(point: number) {
    if (striking || completed.current || foundBoundaries.includes(point) || (scaffolded && !props.splitPoints.includes(point))) return;
    const correct = props.splitPoints.includes(point);
    setActiveBoundary(point);
    setStruckBoundary(point);
    setStriking(true);
    playInteractionSound("cleave", props.muted);

    later(() => {
      setStriking(false);
      if (correct) {
        setLastWrongBoundary(null);
        const next = [...foundBoundaries, point];
        setFoundBoundaries(next);
        if (props.splitPoints.every((candidate) => next.includes(candidate))) {
          completed.current = true;
          setShowSparkles(!reducedMotion);
          later(() => setShowSparkles(false), reducedMotion ? 0 : 700);
          playInteractionSound("sparkle", props.muted);
          props.onCorrect();
        } else {
          playInteractionSound("snap", props.muted);
        }
      } else {
        setLastWrongBoundary(point);
        setStruckBoundary(null);
        playInteractionSound("resist", props.muted);
        props.onMiss(Math.min(2, props.misses + 1));
      }
    }, reducedMotion ? 0 : STRIKE_MS);
  }

  if (props.correct) {
    const parts = splitHandleDisplayParts(props.word, props.splitPoints, props.components);
    return (
      <section className="grid gap-5 text-center" aria-labelledby="split-correct-heading" aria-live="polite">
        <div className="relative flex flex-wrap items-center justify-center gap-4">
          {showSparkles && !reducedMotion ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center text-4xl text-amber-200 motion-safe:animate-[pulse_700ms_ease-out_2]">✦ ✧ ✦</span> : null}
          {parts.map((part, index) => <span key={`${part}-${index}`} className="contents"><span className={`rounded-2xl px-5 py-4 text-3xl font-black ${index % 2 === 0 ? "bg-cyan-100 text-cyan-950" : "bg-amber-100 text-amber-950"}`}>{part}</span>{index + 1 < parts.length ? <span aria-hidden="true" className="text-3xl text-emerald-300">✓</span> : null}</span>)}
        </div>
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-300/40 bg-emerald-50 p-4 text-emerald-950">
          <h2 id="split-correct-heading" className="text-xl font-black">{props.correctHeading ?? "Yes — you found the word parts."}</h2>
          <p className="mt-1 text-base font-semibold">{props.correctExplanation ?? "The word is split at the reviewed boundary."}</p>
        </div>
        <button ref={continueButton} type="button" onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">{props.continueLabel ?? "Continue to meanings"}</button>
      </section>
    );
  }

  const feedback = repeatedMiss
    ? props.repeatedMissMessage ?? props.repeatedMissPrompt ?? "Look again for the word-part boundary."
    : props.misses > 0
      ? props.missMessage ?? props.missPrompt ?? "Not there yet. Look again for the word parts."
      : "";
  return (
    <div className="text-center">
      <p className="mb-2 text-sm font-bold text-cyan-100">Move the cleaver to each word-part boundary, then strike.</p>
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
          const found = foundBoundaries.includes(point);
          const disabled = striking || found || (scaffolded && !isCorrectBoundary);
          return (
            <button
              key={point}
              ref={(node) => {
                boundaryButtons.current[point] = node;
                if (isCorrectBoundary) correctButton.current = node;
              }}
              type="button"
              aria-label={`Split at boundary ${point}${found ? ", found" : ""}`}
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
              className={`absolute top-0 h-36 w-11 -translate-x-1/2 cursor-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 disabled:cursor-not-allowed ${found ? "bg-emerald-300/25 opacity-100" : "disabled:opacity-40"} ${scaffolded && isCorrectBoundary ? "bg-cyan-300/20 motion-safe:animate-pulse" : "hover:bg-white/5"}`}
              style={{ left: `${(point / props.word.length) * 100}%` }}
            >
              <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                <CleaverIcon striking={striking && struckBoundary === point} reducedMotion={reducedMotion} />
              </span>
              <span aria-hidden="true" className={`absolute bottom-2 left-1/2 grid h-11 w-3 -translate-x-1/2 place-items-center rounded-full text-lg font-black ${found ? "bg-emerald-300 text-emerald-950" : wrong ? "bg-red-400 text-red-950 shadow-[0_0_16px_rgba(248,113,113,.8)]" : scaffolded && isCorrectBoundary ? "bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" : active ? "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.75)]" : "bg-white/15"}`}>{found ? "✓" : wrong ? "×" : ""}</span>
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" className={`mx-auto mt-4 min-h-16 max-w-xl whitespace-pre-line rounded-2xl p-3 text-sm font-bold ${feedback ? repeatedMiss ? "bg-cyan-100 text-cyan-950" : "bg-red-100 text-red-950" : "bg-transparent text-cyan-100"}`}>{feedback || props.prompt || "Find the word-part boundary."}</div>
    </div>
  );
}
