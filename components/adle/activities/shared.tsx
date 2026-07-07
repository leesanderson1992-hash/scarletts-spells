"use client";

/**
 * ADLE Slice 7a (7a-A): shared primitives for the activity registry components.
 * Audio dictation + the spelling field are lifted out of the Slice 6 runner so
 * every archetype uses one focused, calm input. The input itself stays clean —
 * warmth lands on framing and feedback, never over the box while a child spells
 * ("rewarding without being noisy").
 */

import { useId } from "react";

/** Play a word aloud with the browser speech engine. Feature-detected — a
 * silent no-op when the device has no synthesis (the grown-up reveal covers
 * that case). */
export function speakWord(word: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || word.trim() === "") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-GB";
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
}

export function HearWordButton(props: { word: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => speakWord(props.word)}
      className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)] transition hover:border-[color:var(--scarlett)]"
    >
      🔊 {props.label ?? "Hear the word"}
    </button>
  );
}

/** Collapsed fallback so a grown-up can read the word aloud on a device with no
 * audio — parent-gated so it never lets the child simply copy. */
export function GrownUpReveal(props: { word: string }) {
  return (
    <details className="mt-1 text-xs text-[color:var(--mid)]">
      <summary className="cursor-pointer">No sound? Grown-up: tap to read the word aloud</summary>
      <span className="font-semibold">{props.word}</span>
    </details>
  );
}

/**
 * One calm spelling field. `reveal` shows the word (a deliberate copy task —
 * controlled spelling); otherwise the word is hidden and only heard (dictation
 * / probe), so recall is tested, not copying.
 */
export function SpellingField(props: {
  word: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  reveal?: boolean;
  sentenceContext?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
      <label htmlFor={id} className="text-sm font-medium text-[color:var(--ink)]">
        {props.label}
        {props.sentenceContext ? " — write it inside a sentence that shows what it means" : ""}
      </label>
      {props.reveal ? (
        <p className="mt-1 text-lg font-semibold tracking-wide text-[color:var(--scarlett)]">{props.word}</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          <HearWordButton word={props.word} />
          <GrownUpReveal word={props.word} />
        </div>
      )}
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoFocus={props.autoFocus}
        className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
