"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

/** A presentation-only source/surface reveal composed after Split has completed. */
export function SpellingTransformationReveal(props: {
  surfaceText: string;
  sourceText: string;
  explanation: string;
  actionLabel?: string;
  continueLabel?: string;
  muted?: boolean;
  onContinue: () => void;
}) {
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
