"use client";

import { useEffect, useId, useRef } from "react";

import { DiffReveal } from "./diff-reveal";
import { HearWordButton } from "./authored-audio";

export type ColdWordRecallMode = "scheduled_review" | "diagnostic_probe";

export interface ColdWordRecallProps {
  mode: ColdWordRecallMode;
  targetWord: string;
  audioText?: string;
  value: string;
  locked: boolean;
  label: string;
  muted?: boolean;
  onValueChange: (value: string) => void;
  onLock: () => void;
}

/**
 * One answer-safe word-recall interaction. Evidence, scheduling, probe intake,
 * rewards and persistence remain in the owning runtime adapter.
 */
export function ColdWordRecall(props: ColdWordRecallProps) {
  const inputId = useId();
  const feedbackId = useId();
  const lockRequested = useRef(false);

  useEffect(() => {
    if (!props.locked) lockRequested.current = false;
  }, [props.locked]);

  function lockAttempt() {
    if (props.locked || !props.value.trim() || lockRequested.current) return;
    lockRequested.current = true;
    props.onLock();
  }

  return (
    <section
      className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-3"
      data-cold-word-recall-mode={props.mode}
      data-cold-word-recall-state={props.locked ? "locked" : "recalling"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-[color:var(--ink)]">
          {props.label}
        </label>
        <HearWordButton
          word={props.audioText ?? props.targetWord}
          label="Play word"
          muted={props.muted}
          kind="dictation"
        />
      </div>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        readOnly={props.locked}
        aria-describedby={props.locked ? feedbackId : undefined}
        value={props.value}
        onChange={(event) => {
          if (!props.locked) props.onValueChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            lockAttempt();
          }
        }}
        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.18)] read-only:bg-slate-100"
      />
      {!props.locked ? (
        <button
          type="button"
          disabled={!props.value.trim()}
          onClick={lockAttempt}
          className="brand-primary-btn w-full disabled:opacity-40"
        >
          Lock and check
        </button>
      ) : (
        <div id={feedbackId} aria-live="polite">
          {props.mode === "diagnostic_probe" ? (
            <p className="mb-2 text-sm font-semibold text-[color:var(--mid)]">
              Answer locked — this detective word does not affect rewards.
            </p>
          ) : null}
          <DiffReveal attempt={props.value} expected={props.targetWord} />
          <p className="mt-2 text-center text-sm font-semibold text-[color:var(--ink)]">
            The correct spelling is <strong>{props.targetWord}</strong>.
          </p>
        </div>
      )}
    </section>
  );
}
