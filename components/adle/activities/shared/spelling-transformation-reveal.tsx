"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";
import type { DegreeTransformation } from "@/lib/adle/inflection/contracts";
import type { ReactNode } from "react";

/** A presentation-only source/surface reveal composed after Split has completed. */
type SourceRevealProps = {
  surfaceText: string;
  sourceText: string;
  explanation: string;
  actionLabel?: string;
  continueLabel?: string;
  muted?: boolean;
  onContinue: () => void;
};
export interface ForwardTransformationProps {
  mode: "base_to_degree";
  transformation: DegreeTransformation;
  revealed: boolean;
  revealing?: boolean;
  muted?: boolean;
  actionAdornment?: ReactNode;
  onReveal: () => void;
  onContinue: () => void;
}
interface RestoreDegreeProps {
  mode: "degree_to_base";
  transformation: DegreeTransformation;
  onContinue: () => void;
}
export function SpellingTransformationReveal(props: SourceRevealProps | ForwardTransformationProps | RestoreDegreeProps) {
  if (!("mode" in props)) return <SourceReveal {...props} />;
  return props.mode === "degree_to_base" ? <RestoreDegree {...props} /> : <ForwardTransformation {...props} />;
}

/** Shared letter-level presentation; all spellings come from the reviewed family. */
export function AnimatedSpellingChange(props: {
  transformation: DegreeTransformation;
  direction: "build" | "restore";
  onComplete?: () => void;
  completedContent?: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<"separating" | "changing" | "joining" | "complete">("separating");
  const onComplete = useRef(props.onComplete);
  useEffect(() => { onComplete.current = props.onComplete; }, [props.onComplete]);
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase("changing"), reducedMotion ? 0 : props.direction === "build" ? 100 : 450),
      ...(props.direction === "build" ? [window.setTimeout(() => setPhase("joining"), reducedMotion ? 0 : 420)] : []),
      window.setTimeout(() => { setPhase("complete"); onComplete.current?.(); }, reducedMotion ? 0 : props.direction === "build" ? 750 : 1850),
    ];
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [reducedMotion, props.direction]);
  const t = props.transformation;
  const from = props.direction === "build" ? t.base : t.stem;
  const to = props.direction === "build" ? t.stem : t.base;
  let sharedLength = 0;
  while (sharedLength < Math.min(from.length, to.length) && from[sharedLength] === to[sharedLength]) sharedLength++;
  const oldLetters = from.slice(sharedLength);
  const newLetters = to.slice(sharedLength);
  const changed = phase !== "separating";
  const joining = props.direction === "build" && (phase === "joining" || phase === "complete");
  const caption = from === to ? `The base ${t.base} stays the same.`
    : oldLetters && newLetters ? `${oldLetters} changes to ${newLetters}.`
      : oldLetters ? props.direction === "restore" ? `The extra ${oldLetters} disappears.` : `The final ${oldLetters} is removed.`
        : props.direction === "restore" ? `${newLetters} returns to the base.` : `${newLetters} is added to the base spelling.`;
  return <div className="grid gap-4 text-center" data-spelling-change={props.direction} data-spelling-change-state={phase}>
    {phase === "complete" && props.completedContent ? props.completedContent : <>
    <div aria-hidden="true" className={`mx-auto flex min-h-24 max-w-full items-center justify-center text-3xl font-black sm:text-4xl ${joining ? "rounded-2xl bg-cyan-100" : ""}`} style={{ gap: joining ? 0 : ".75rem", transition: reducedMotion ? "none" : "gap 250ms ease-out" }}>
      <span className="inline-flex items-center rounded-2xl bg-cyan-100 py-4 pl-5 text-cyan-950" style={{ paddingRight: joining ? 0 : "1.25rem", transition: reducedMotion ? "none" : "padding-right 250ms ease-out" }}>
        {from.slice(0, sharedLength)}
        <span className="relative inline-block h-[1.2em] overflow-hidden align-bottom motion-reduce:transition-none" style={{ width: `${(changed ? newLetters.length : oldLetters.length) * .65}em`, transition: reducedMotion ? "none" : "width 220ms ease-out" }}>
          <span className="absolute inset-0 text-amber-700" style={{ opacity: changed ? 0 : 1, transform: changed ? "translateY(-.4em)" : "translateY(0)", transition: reducedMotion ? "none" : "opacity 220ms ease-out, transform 220ms ease-out" }}>{oldLetters}</span>
          <span className="absolute inset-0 text-emerald-700" style={{ opacity: changed ? 1 : 0, transform: changed ? "translateY(0)" : "translateY(.4em)", transition: reducedMotion ? "none" : "opacity 220ms ease-out, transform 220ms ease-out" }}>{newLetters}</span>
        </span>
      </span>
      <span className={`rounded-2xl py-4 pr-5 ${joining ? "bg-cyan-100 text-cyan-950" : "bg-white text-slate-950"}`} style={{ paddingLeft: joining ? 0 : "1.25rem", marginLeft: props.direction === "restore" ? changed ? ".5rem" : 0 : changed ? 0 : ".5rem", transition: reducedMotion ? "none" : "margin-left 250ms ease-out, padding-left 250ms ease-out, background-color 250ms ease-out" }}>{t.ending}</span>
    </div>
    <p role="status" className="font-semibold text-cyan-100">{phase === "complete" ? caption : props.direction === "restore" ? "Watch the ending move aside and the base return." : "Watch the base spelling change before the ending joins."}</p>
    <p className="sr-only">{phase === "complete" ? `${to} plus ${t.ending}${props.direction === "build" ? ` makes ${t.result}` : `; ${t.base} is the base word`}.` : `${from} plus ${t.ending}.`}</p>
    {phase === "complete" && props.direction === "build" ? <p className="text-2xl font-black text-white">{t.result}</p> : null}
    </>}
  </div>;
}

function RestoreDegree(props: RestoreDegreeProps) {
  const [complete, setComplete] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (complete) continueButton.current?.focus({ preventScroll: true }); }, [complete]);
  return <section className="grid gap-5 text-center" data-transformation-kind="degree_to_base" data-transformation-state={complete ? "revealed" : "restoring"}>
    <h2 className="text-2xl font-black text-white">Find the base inside {props.transformation.result}</h2>
    <AnimatedSpellingChange transformation={props.transformation} direction="restore" onComplete={() => setComplete(true)} />
    {complete ? <>
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-300/40 bg-emerald-50 p-4 text-emerald-950"><h3 className="text-xl font-black">Yes — {props.transformation.base} is the base word.</h3><p className="mt-1 font-semibold">{props.transformation.explanation}</p></div>
      <button ref={continueButton} type="button" onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Answer the rule question</button>
    </> : null}
  </section>;
}
function SourceReveal(props: SourceRevealProps) {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const continueButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (revealed) continueButton.current?.focus();
  }, [revealed]);

  function reveal() {
    setRevealed(true);
    playInteractionSound("sparkle", props.muted);
  }

  return (
    <section
      className="grid gap-5 text-center"
      aria-labelledby="spelling-transformation-heading"
      aria-live="polite"
      data-transformation-state={revealed ? "revealed" : "surface"}
      data-transformation-kind="surface_to_source"
    >
      <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Notice the source form</p>
      <h2 id="spelling-transformation-heading" className="text-3xl font-black text-white">
        The split is complete. Now restore the base word.
      </h2>
      <div className="mx-auto flex min-h-28 w-full max-w-md items-center justify-center gap-4 rounded-3xl border border-cyan-200/25 bg-slate-950/30 p-6 text-3xl font-black">
        <span className={revealed ? "text-cyan-100 opacity-55 line-through" : "rounded-2xl bg-amber-100 px-5 py-4 text-amber-950"}>{props.surfaceText}</span>
        <span aria-hidden="true" className="text-cyan-200">→</span>
        <span className={`rounded-2xl px-5 py-4 ${revealed ? `bg-amber-100 text-amber-950 ${reducedMotion ? "" : "motion-safe:animate-[pulse_500ms_ease-out_2]"}` : "bg-white/10 text-white/40"}`}>
          {revealed ? props.sourceText : "?"}
        </span>
      </div>
      <p className="mx-auto max-w-xl rounded-2xl bg-cyan-100 p-4 font-bold text-cyan-950">{props.explanation}</p>
      {!revealed ? (
        <button type="button" autoFocus onClick={reveal} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">
          {props.actionLabel ?? "Restore the source form"}
        </button>
      ) : (
        <>
          <p className="font-black text-emerald-100">Yes — {props.sourceText} is the base word.</p>
          <button ref={continueButton} type="button" onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">
            {props.continueLabel ?? "Continue"}
          </button>
        </>
      )}
    </section>
  );
}

function ForwardTransformation(props: ForwardTransformationProps) {
  const reducedMotion = useReducedMotion();
  const t = props.transformation;
  const actions = { regular: "Keep every base letter", drop_e: "Remove the final e", y_to_i: "Replace the final y with i", double_final_consonant: `Duplicate the final ${t.base.at(-1)}` };
  return <section className="grid gap-5 text-center" data-transformation-kind="base_to_degree" data-transformation-state={props.revealed ? "revealed" : "base"}>
    <p className="text-sm font-bold text-cyan-100">Use the cleaver to reveal the reviewed spelling change.</p>
    <h2 className="text-2xl font-black text-white">Watch {t.base} transform</h2>
    {!props.revealed ? <div className="relative mx-auto grid min-h-40 w-full max-w-md place-items-center rounded-3xl border border-cyan-200/20 bg-slate-950/30 px-5 py-6">
      <p className="flex flex-wrap items-center justify-center gap-3 text-3xl font-black"><span className="rounded-2xl bg-cyan-100 px-5 py-4 text-cyan-950">{t.base}</span><span className="text-cyan-200">+</span><span className="rounded-2xl bg-white px-5 py-4 text-slate-950">{t.ending}</span></p>
      <button type="button" autoFocus disabled={props.revealing} onClick={() => { playInteractionSound("cleave", props.muted); props.onReveal(); }} className="absolute -bottom-7 left-1/2 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-2xl border border-cyan-300 bg-slate-950 px-6 py-2 font-black text-white shadow-[0_12px_24px_rgba(8,47,73,.38)] focus-visible:ring-4 focus-visible:ring-amber-300 disabled:opacity-60">
        {props.actionAdornment}<span>Use the cleaver</span>
      </button>
    </div> : <>
      <p className="rounded-2xl bg-amber-100 p-4 font-bold text-amber-950">{actions[t.rule]}.</p>
      <div className={`relative mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-3 ${reducedMotion ? "" : "motion-safe:animate-[pulse_500ms_ease-out_1]"}`}>
        <span className="rounded-2xl bg-cyan-100 px-5 py-4 text-3xl font-black text-cyan-950">{t.stem}</span>
        <span className="text-2xl font-black text-cyan-200">+</span>
        <span className="rounded-2xl bg-white px-5 py-4 text-3xl font-black text-slate-950">{t.ending}</span>
        <span aria-hidden="true" className="text-3xl text-emerald-300">→</span>
        <span className="rounded-2xl bg-emerald-100 px-5 py-4 text-3xl font-black text-emerald-950 ring-4 ring-emerald-300/70">{t.result}</span>
      </div>
      <p className="text-cyan-100">{t.explanation}</p>
      <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Answer the rule question</button>
    </>}
  </section>;
}
