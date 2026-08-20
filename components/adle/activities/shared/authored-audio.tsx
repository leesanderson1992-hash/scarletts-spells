"use client";

import { speakAuthoredNarration, type NarrationKind } from "./narration";

export function speakWord(word: string, rate = 0.8): void {
  speakAuthoredNarration(word, rate <= 0.7 ? "dictation" : "word");
}

export function HearWordButton(props: {
  word: string;
  label?: string;
  muted?: boolean;
  kind?: NarrationKind;
}) {
  return (
    <button
      type="button"
      onClick={() => !props.muted && speakAuthoredNarration(props.word, props.kind ?? "word")}
      aria-disabled={props.muted}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.22)]"
    >
      <span aria-hidden="true">🔊</span> {props.label ?? "Hear the word"}
    </button>
  );
}
