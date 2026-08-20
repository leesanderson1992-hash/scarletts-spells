"use client";

import { useEffect, useId, useRef } from "react";

import { DiffReveal } from "./diff-reveal";
import { HearWordButton } from "./authored-audio";

export interface SentenceDictationProps {
  audioText: string;
  correctSentence: string;
  value: string;
  checked: boolean;
  stepLabel: string;
  continueLabel?: string;
  muted?: boolean;
  onValueChange: (value: string) => void;
  onCheck: () => void;
  onContinue?: () => void;
}

export function SentenceDictation(props: SentenceDictationProps) {
  const inputId = useId();
  const comparisonId = useId();
  const checkRequested = useRef(false);

  useEffect(() => {
    if (!props.checked) checkRequested.current = false;
  }, [props.checked]);

  function checkSentence() {
    if (props.checked || !props.value.trim() || checkRequested.current) return;
    checkRequested.current = true;
    props.onCheck();
  }

  return (
    <section
      className="grid gap-4"
      data-sentence-dictation-state={props.checked ? "checked" : "writing"}
    >
      <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">
        {props.stepLabel}
      </p>
      <div className="flex justify-center">
        <HearWordButton
          word={props.audioText}
          label="Play sentence"
          muted={props.muted}
          kind="dictation"
        />
      </div>
      <label htmlFor={inputId} className="text-sm font-semibold text-cyan-50">
        Write the whole sentence
      </label>
      <textarea
        id={inputId}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="sentences"
        readOnly={props.checked}
        aria-describedby={props.checked ? comparisonId : undefined}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            checkSentence();
          }
        }}
        className="min-h-28 w-full rounded-2xl bg-white p-4 text-lg text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 read-only:bg-slate-100"
      />
      {!props.checked ? (
        <button
          type="button"
          disabled={!props.value.trim()}
          onClick={checkSentence}
          className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40"
        >
          Check sentence
        </button>
      ) : (
        <>
          <div id={comparisonId} aria-live="polite">
            <DiffReveal
              attempt={props.value}
              expected={props.correctSentence}
              mode="sentence"
            />
          </div>
          {props.onContinue ? (
            <button
              type="button"
              onClick={props.onContinue}
              className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950"
            >
              {props.continueLabel ?? "Continue"}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
