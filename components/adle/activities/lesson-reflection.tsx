"use client";

import { useId, type ReactNode } from "react";

import {
  LESSON_REFLECTION_MAX_RESPONSE_LENGTH,
  type LessonReflectionContextRecap,
  type NormalizedLessonReflectionMistake,
} from "@/lib/adle/lesson-reflection";

export interface LessonReflectionSpecialistRecap {
  id: string;
  heading: string;
  content: ReactNode;
  position?: "before_mistakes" | "after_response";
}

export interface LessonReflectionProps {
  mistakes: readonly NormalizedLessonReflectionMistake[];
  prompt: string;
  response: string;
  onResponseChange: (value: string) => void;
  onComplete?: () => void;
  completionType?: "button" | "submit";
  completionLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  successMessage?: string;
  contextRecap?: LessonReflectionContextRecap;
  specialistRecaps?: readonly LessonReflectionSpecialistRecap[];
}

function SpecialistRecaps(props: {
  recaps: readonly LessonReflectionSpecialistRecap[];
  position: NonNullable<LessonReflectionSpecialistRecap["position"]>;
}) {
  return props.recaps
    .filter((recap) => (recap.position ?? "before_mistakes") === props.position)
    .map((recap) => (
      <section key={recap.id} className="grid gap-4" aria-labelledby={`lesson-reflection-recap-${recap.id}`}>
        <h2 id={`lesson-reflection-recap-${recap.id}`} className="text-center text-2xl font-black text-white">
          {recap.heading}
        </h2>
        {recap.content}
      </section>
    ));
}

export function LessonReflection(props: LessonReflectionProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const responseId = `${instanceId}-response`;
  const responseHelpId = `${instanceId}-response-help`;
  const statusId = `${instanceId}-response-status`;
  const responseReady = props.response.trim().length > 0;
  const recaps = props.specialistRecaps ?? [];
  return (
    <div className="grid gap-5 text-cyan-50" data-lesson-reflection="canonical">
      <SpecialistRecaps recaps={recaps} position="before_mistakes" />
      <section className="rounded-3xl border border-cyan-300/40 bg-slate-950/45 p-5" aria-labelledby={titleId}>
        <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Look back</p>
        <h2 id={titleId} className="mt-2 text-3xl font-black text-white">What went wrong</h2>
        {props.mistakes.length ? (
          <>
            <p className="mt-2 text-cyan-100">Let&apos;s look at the spellings that need another careful check.</p>
            <div className="mt-4 grid gap-3">
              {props.mistakes.map((mistake) => (
                <article key={mistake.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-slate-950" aria-label={`Compare your spelling of ${mistake.correctSpelling}`}>
                  <h3 className="text-xl font-black">{mistake.correctSpelling}</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/80 p-3">
                      <dt className="text-xs font-black uppercase tracking-wide text-amber-900">You wrote</dt>
                      <dd className="mt-1 break-words text-lg font-bold">{mistake.attempt || "nothing yet"}</dd>
                    </div>
                    <div className="rounded-xl bg-emerald-100 p-3">
                      <dt className="text-xs font-black uppercase tracking-wide text-emerald-900">Correct spelling</dt>
                      <dd className="mt-1 break-words text-lg font-black text-emerald-950">{mistake.correctSpelling}</dd>
                    </div>
                  </dl>
                  {mistake.sentenceComparison ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-sm">
                      <p><span className="font-black">You wrote the sentence:</span> “{mistake.sentenceComparison.attempt || "nothing yet"}”</p>
                      <p className="mt-2"><span className="font-black">Correct sentence:</span> “{mistake.sentenceComparison.correct}”</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-950" role="status">
            {props.successMessage ?? "You checked each spelling carefully. Use your reflection to explain what helped you."}
          </p>
        )}
      </section>

      {props.contextRecap?.items.length ? (
        <section className="rounded-3xl border border-cyan-300/40 bg-slate-950/45 p-5" aria-labelledby={`${instanceId}-context-heading`} data-reflection-context-recap="recap-only">
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Sentence recap</p>
          <h2 id={`${instanceId}-context-heading`} className="mt-2 text-xl font-black text-white">{props.contextRecap.heading}</h2>
          {props.contextRecap.introduction ? <p className="mt-2 text-cyan-100">{props.contextRecap.introduction}</p> : null}
          <ul className="mt-3 grid gap-2">
            {props.contextRecap.items.map((item) => <li key={item.id} className="rounded-xl bg-white/10 p-3 font-semibold text-cyan-50">{item.text}</li>)}
          </ul>
          {props.contextRecap.overflowText ? <p className="mt-2 text-sm font-semibold text-cyan-100">{props.contextRecap.overflowText}</p> : null}
        </section>
      ) : null}

      <label htmlFor={responseId} className="grid gap-2 rounded-3xl border border-cyan-300/40 bg-slate-950/45 p-5 text-lg font-black text-white">
        {props.prompt}
        <span id={responseHelpId} className="text-sm font-semibold text-cyan-100">
          Write about what you learned{props.mistakes.length ? " or what you will remember next time" : "."}
        </span>
        <textarea
          id={responseId}
          required
          maxLength={LESSON_REFLECTION_MAX_RESPONSE_LENGTH}
          autoFocus={props.autoFocus ?? true}
          value={props.response}
          disabled={props.disabled || props.pending}
          onChange={(event) => props.onResponseChange(event.target.value)}
          aria-describedby={`${responseHelpId} ${statusId}`}
          placeholder="I learned that..."
          className="min-h-32 w-full rounded-2xl border-4 border-cyan-300 bg-white p-4 text-lg font-semibold text-slate-950 placeholder:text-slate-500 shadow-inner outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-200 disabled:opacity-70"
        />
        <span id={statusId} className="text-right text-xs font-semibold text-cyan-100" aria-live="polite">
          {props.response.length} of {LESSON_REFLECTION_MAX_RESPONSE_LENGTH} characters{responseReady ? "" : " · Write one thing to finish"}
        </span>
      </label>

      <SpecialistRecaps recaps={recaps} position="after_response" />
      <button
        type={props.completionType ?? "button"}
        disabled={props.disabled || props.pending || !responseReady}
        onClick={props.onComplete}
        aria-describedby={statusId}
        className="min-h-12 rounded-full bg-cyan-300 px-6 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.pending ? props.pendingLabel ?? "Saving your Word Lab…" : props.completionLabel ?? "Finish Word Lab"}
      </button>
    </div>
  );
}
