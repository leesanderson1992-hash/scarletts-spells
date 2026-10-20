"use client";

import { LESSON_ACTIVITY_COPY } from "@/lib/adle/lesson-activity-copy";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";
import { SpellingTransformationReveal } from "./spelling-transformation-reveal";
import type { DegreeQuestion, DegreeTransformation } from "@/lib/adle/inflection/contracts";

const STRIKE_MS = 220;

export interface TransformTargetProps {
  transformation: Pick<DegreeTransformation, "base" | "stem" | "ending" | "result" | "explanation"> | { base: string; stem: string; ending: "ing"; result: string; explanation: string };
  question: DegreeQuestion;
  stepLabel: string;
  muted?: boolean;
  initialProgress?: { revealed: boolean; questionShown: boolean; selectedOptionId: string | null; splitMisses?: number };
  onProgress?: (progress: NonNullable<TransformTargetProps["initialProgress"]>) => void;
  onContinue: () => void;
}
/** CLEAVER.transform_target@1. Shared boundary interaction, then source restoration. */
export function TransformTarget(props: TransformTargetProps) {
  const [progress, setProgress] = useState(props.initialProgress ?? { revealed: false, questionShown: false, selectedOptionId: null });
  function change(next: typeof progress) { setProgress(next); props.onProgress?.(next); }
  const t = props.transformation;
  const endingLabel = t.ending === "ing" ? "-ing" : "-er or -est";
  const correct = progress.selectedOptionId === props.question.correctOptionId;
  return <section className="grid gap-5 text-center" data-transform-target-state={progress.questionShown ? "question" : "demonstration"}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p>
    {!progress.revealed ? <BoundarySplitHandle
      word={t.result} splitPoints={[t.stem.length]} components={[t.stem, t.ending]}
      misses={progress.splitMisses ?? 0} correct={false} muted={props.muted}
      prompt={`Find where the base spelling ends and ${endingLabel} begins.`}
      missMessage={`Try again. Find the ending ${endingLabel}.`}
      repeatedMissMessage="Strike the glowing gap before the ending."
      onMiss={splitMisses => change({ ...progress, splitMisses })}
      onCorrect={() => change({ ...progress, revealed: true })} onContinue={() => undefined}
    /> : !progress.questionShown ? <SpellingTransformationReveal mode="degree_to_base" transformation={t}
      onContinue={() => change({ ...progress, questionShown: true })} /> : <>
      <p className="text-3xl font-black text-white">{props.transformation.result}</p>
      <h2 className="text-xl font-bold text-cyan-100">{props.question.prompt}</h2>
      <div role="group" aria-label="Choose the spelling rule" className="grid gap-3">
        {props.question.options.map(option => <button key={option.id} type="button" disabled={correct} aria-pressed={progress.selectedOptionId === option.id}
          onClick={() => { playInteractionSound(option.id === props.question.correctOptionId ? "snap" : "resist", props.muted); change({ ...progress, selectedOptionId: option.id }); }}
          className={`min-h-16 rounded-2xl border p-4 text-left font-bold focus-visible:ring-4 focus-visible:ring-cyan-300 ${progress.selectedOptionId === option.id ? correct ? "bg-emerald-100 text-emerald-950" : "bg-rose-100 text-rose-950" : "border-cyan-300/40 bg-white/10 text-white"}`}>{option.text}</button>)}
      </div>
      <p aria-live="polite" className="min-h-6 text-cyan-100">{progress.selectedOptionId === null ? "Choose one answer." : `${correct ? "Correct." : "Not quite. Try again."} ${props.question.explanation}`}</p>
      {correct ? <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Continue</button> : null}
    </>}
  </section>;
}

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

export interface SplitHandleProps {
  word: string;
  splitPoints: number[];
  components?: readonly string[];
  selectedBoundaries?: readonly number[];
  isolatedComponentIndex?: number;
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
  onSelectedBoundariesChange?: (boundaries: number[]) => void;
  onMiss: (misses: number) => void;
  onCorrect: () => void;
  onContinue: () => void;
}

export interface SyllableSplitHandleProps {
  mode: "syllables";
  word: string;
  selectedBoundaries: readonly number[];
  onSelectedBoundariesChange: (boundaries: number[]) => void;
  onBoundaryAttempt?: (boundaries: number[]) => boolean;
  feedback?: string;
  muted?: boolean;
  disabled?: boolean;
}

export function SplitHandle(props: SplitHandleProps | TransformTargetProps | SyllableSplitHandleProps) {
  if ("mode" in props) return <SyllableSplitHandle {...props} />;
  return "transformation" in props ? <TransformTarget {...props} /> : <BoundarySplitHandle {...props} />;
}

function BoundarySplitHandle(props: SplitHandleProps) {
  const reducedMotion = useReducedMotion();
  const requiredBoundaries = [...new Set(props.splitPoints)]
    .filter((point) => Number.isInteger(point) && point > 0 && point < props.word.length)
    .sort((left, right) => left - right);
  const restoredBoundaries = [...new Set(props.selectedBoundaries ?? [])]
    .filter((point) => requiredBoundaries.includes(point))
    .sort((left, right) => left - right);
  const [internalBoundaries, setInternalBoundaries] = useState<number[]>(restoredBoundaries);
  const foundBoundaries = props.selectedBoundaries === undefined ? internalBoundaries : restoredBoundaries;
  const remainingBoundaries = requiredBoundaries.filter((point) => !foundBoundaries.includes(point));
  const nextRemainingBoundary = remainingBoundaries[0];
  const [activeBoundary, setActiveBoundary] = useState<number | null>(null);
  const [struckBoundary, setStruckBoundary] = useState<number | null>(null);
  const [lastWrongBoundary, setLastWrongBoundary] = useState<number | null>(null);
  const [striking, setStriking] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const timers = useRef<number[]>([]);
  const completed = useRef(props.correct);
  const continueButton = useRef<HTMLButtonElement | null>(null);
  const boundaryButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatedMiss = props.misses >= 2;
  const scaffolded =
    props.revealCorrectBoundaryAfterMisses !== false && repeatedMiss;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    completed.current = props.correct;
  }, [props.correct]);
  useEffect(() => {
    if (scaffolded && !props.correct) boundaryButtons.current[nextRemainingBoundary]?.focus();
  }, [nextRemainingBoundary, props.correct, scaffolded]);
  useEffect(() => {
    if (props.correct) continueButton.current?.focus();
  }, [props.correct]);
  useEffect(() => {
    if (!props.correct && props.misses === 1 && lastWrongBoundary !== null) {
      boundaryButtons.current[lastWrongBoundary]?.focus();
    }
  }, [lastWrongBoundary, props.correct, props.misses]);
  useEffect(() => {
    if (!props.correct && !striking && lastWrongBoundary === null && foundBoundaries.length > 0) {
      boundaryButtons.current[nextRemainingBoundary]?.focus();
    }
  }, [foundBoundaries.length, lastWrongBoundary, nextRemainingBoundary, props.correct, striking]);

  function later(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  }

  function choose(point: number) {
    if (striking || completed.current || foundBoundaries.includes(point) || (scaffolded && !requiredBoundaries.includes(point))) return;
    const correct = requiredBoundaries.includes(point);
    setActiveBoundary(point);
    setStruckBoundary(point);
    setStriking(true);
    playInteractionSound("cleave", props.muted);

    later(() => {
      setStriking(false);
      if (correct) {
        setLastWrongBoundary(null);
        const next = [...foundBoundaries, point].sort((left, right) => left - right);
        if (props.selectedBoundaries === undefined) setInternalBoundaries(next);
        props.onSelectedBoundariesChange?.(next);
        if (requiredBoundaries.every((candidate) => next.includes(candidate))) {
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
    const parts = splitHandleDisplayParts(props.word, requiredBoundaries, props.components);
    return (
      <section className="grid gap-5 text-center" aria-labelledby="split-correct-heading" aria-live="polite" data-split-state="complete">
        <div className="relative flex flex-wrap items-center justify-center gap-4">
          {showSparkles && !reducedMotion ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center text-4xl text-amber-200 motion-safe:animate-[pulse_700ms_ease-out_2]">✦ ✧ ✦</span> : null}
          {parts.map((part, index) => <span key={`${part}-${index}`} className="contents"><span data-isolated-component={index === props.isolatedComponentIndex ? "true" : undefined} className={`rounded-2xl px-5 py-4 text-3xl font-black ${index === props.isolatedComponentIndex ? "bg-amber-100 text-amber-950 ring-4 ring-amber-300/70" : index % 2 === 0 ? "bg-cyan-100 text-cyan-950" : "bg-white text-slate-950"}`}>{part}</span>{index + 1 < parts.length ? <span aria-hidden="true" className="text-3xl text-emerald-300">✓</span> : null}</span>)}
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
    <div className="text-center" data-split-state={foundBoundaries.length > 0 ? "active" : "initial"}>
      <p className="mb-2 text-sm font-bold text-cyan-100">Move the cleaver to each word-part boundary, then strike.</p>
      <div role="group" aria-label={`Choose where to split ${props.word}`} className="relative mx-auto mt-2 h-32 w-full max-w-xl select-none pt-20">
        <div className="cleaver-letters grid h-12 items-center" style={{ gridTemplateColumns: `repeat(${props.word.length}, minmax(0, 1fr))` }}>
          {props.word.split("").map((letter, index) => {
            const separating = striking && struckBoundary !== null;
            const offset = separating ? (index < struckBoundary ? -5 : 5) : 0;
            return <span key={`${letter}-${index}`} className={`cleaver-letter text-3xl font-black text-white ${reducedMotion ? "" : "transition-transform duration-200"}`} style={{ transform: `translateX(${offset}px)` }}>{letter}</span>;
          })}
        </div>
        {props.word.slice(0, -1).split("").map((_, index) => {
          const point = index + 1;
          const isCorrectBoundary = requiredBoundaries.includes(point);
          const active = activeBoundary === point;
          const wrong = lastWrongBoundary === point;
          const found = foundBoundaries.includes(point);
          const disabled = striking || found || (scaffolded && !isCorrectBoundary);
          return (
            <button
              key={point}
              ref={(node) => {
                boundaryButtons.current[point] = node;
              }}
              type="button"
              aria-label={`Split at boundary ${point}. Split between ${props.word.slice(0, point)} and ${props.word.slice(point)}${found ? ", found" : ""}`}
              onPointerEnter={() => !disabled && setActiveBoundary(point)}
              onPointerLeave={() => setActiveBoundary((current) => current === point ? null : current)}
              onPointerDown={() => !disabled && setActiveBoundary(point)}
              onFocus={() => setActiveBoundary(point)}
              onBlur={() => setActiveBoundary((current) => current === point ? null : current)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                choose(point);
              }}
              onClick={() => choose(point)}
              disabled={disabled}
              className={`absolute top-0 h-32 w-11 -translate-x-1/2 cursor-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 disabled:cursor-not-allowed ${found ? "bg-emerald-300/25 opacity-100" : "disabled:opacity-40"} ${scaffolded && isCorrectBoundary ? "bg-cyan-300/20 motion-safe:animate-pulse" : "hover:bg-white/5"}`}
              style={{ left: `${(point / props.word.length) * 100}%` }}
            >
              <span className={`absolute left-1/2 top-0 -translate-x-1/2 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                <CleaverIcon striking={striking && struckBoundary === point} reducedMotion={reducedMotion} />
              </span>
              <span aria-hidden="true" className={`absolute bottom-2 left-1/2 grid h-11 w-3 -translate-x-1/2 place-items-center rounded-full text-lg font-black ${found ? "bg-emerald-300 text-emerald-950" : wrong ? "bg-red-400 text-red-950 shadow-[0_0_16px_rgba(248,113,113,.8)]" : scaffolded && isCorrectBoundary ? "bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,.8)]" : active ? "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.75)]" : "bg-transparent"}`}>{found ? "✓" : wrong ? "×" : ""}</span>
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" className={`mx-auto mt-4 min-h-16 max-w-xl whitespace-pre-line rounded-2xl p-3 text-sm font-bold ${feedback ? repeatedMiss ? "bg-cyan-100 text-cyan-950" : "bg-red-100 text-red-950" : "bg-transparent text-cyan-100"}`}>{feedback || props.prompt || LESSON_ACTIVITY_COPY.boundaryCleaver}</div>
    </div>
  );
}

/** Phonological mode of the shared cleaver: review each gap as it is cut. */
function SyllableSplitHandle(props: SyllableSplitHandleProps) {
  const reducedMotion = useReducedMotion();
  const [wrongBoundary, setWrongBoundary] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const board = useRef<HTMLDivElement | null>(null);
  const selected = [...new Set(props.selectedBoundaries)].sort((a, b) => a - b);
  const parts = splitHandleDisplayParts(props.word, selected);

  function toggle(point: number) {
    if (props.disabled) return;
    const next = selected.includes(point) ? selected.filter((cut) => cut !== point) : [...selected, point].sort((a, b) => a - b);
    if (props.onBoundaryAttempt && !props.onBoundaryAttempt(next)) {
      setWrongBoundary(point);
      playInteractionSound("resist", props.muted);
      return;
    }
    setWrongBoundary(null);
    playInteractionSound(selected.includes(point) ? "snap" : "cleave", props.muted);
    props.onSelectedBoundariesChange(next);
  }

  return <section className="grid gap-5" aria-label={`Cut ${props.word} into the syllables you hear`}>
    <p className="text-center text-sm font-semibold text-[color:var(--mid)]">Move the cleaver over a letter gap, then click or tap to cut. Tap a cut again to join it.</p>
    <div ref={board} onPointerMove={(event) => {
      if (event.pointerType === "touch") return;
      const bounds = board.current?.getBoundingClientRect();
      if (bounds) setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }} onPointerLeave={() => setPointer(null)} className="relative mx-auto w-full max-w-2xl overflow-x-auto rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
      {pointer && !props.disabled && <span aria-hidden="true" className="pointer-events-none absolute z-20 -translate-x-1/3 -translate-y-1/4 scale-75" style={{ left: pointer.x, top: pointer.y }}><CleaverIcon striking={false} reducedMotion={reducedMotion} /></span>}
      <div role="group" aria-label={`Letter gaps in ${props.word}`} className="flex min-w-max items-stretch justify-center">
        {Array.from(props.word).map((letter, index) => <span key={`${index}-${letter}`} className="flex items-stretch">
          <span className={`grid min-h-16 min-w-8 place-items-center text-3xl font-black text-[color:var(--ink)] sm:min-w-10 sm:text-4xl ${!reducedMotion ? "transition-transform duration-150" : ""}`}>{letter}</span>
          {index < props.word.length - 1 && <button
            type="button"
            aria-pressed={selected.includes(index + 1)}
            aria-label={`${selected.includes(index + 1) ? "Remove" : "Make"} cut after ${props.word.slice(0, index + 1)}`}
            disabled={props.disabled}
            onClick={() => toggle(index + 1)}
            className={`relative -mx-1.5 min-h-16 min-w-11 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${pointer ? "cursor-none" : "cursor-pointer"} ${wrongBoundary === index + 1 ? "bg-rose-100" : selected.includes(index + 1) ? "bg-amber-200" : "hover:bg-white"}`}
          ><span aria-hidden="true" className={`mx-auto grid h-10 w-5 place-items-center rounded-full text-2xl font-black ${wrongBoundary === index + 1 ? "text-rose-700" : selected.includes(index + 1) ? "text-amber-700" : "text-cyan-300"}`}>{wrongBoundary === index + 1 ? "×" : "│"}</span></button>}
        </span>)}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-live="polite">
        {parts.map((part, index) => <span key={`${index}-${part}`} className="rounded-xl border border-cyan-200 bg-white px-4 py-2 text-lg font-bold text-cyan-950">{part}</span>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3">
      {selected.length > 0 && !props.disabled && <button type="button" onClick={() => { setWrongBoundary(null); props.onSelectedBoundariesChange([]); }} className="brand-secondary-btn min-h-12">Join all</button>}
    </div>
    <p role="status" aria-live="polite" className={`min-h-6 text-center font-semibold ${wrongBoundary !== null ? "text-rose-700" : "text-[color:var(--mid)]"}`}>{wrongBoundary !== null ? "× That cut does not match the syllables in this recording. Try another gap." : props.feedback || `${parts.length} ${parts.length === 1 ? "piece" : "pieces"} on the board.`}</p>
  </section>;
}
