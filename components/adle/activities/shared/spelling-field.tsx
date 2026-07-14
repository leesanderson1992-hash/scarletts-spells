"use client";

import { useId } from "react";

export function speakWord(word: string, rate = 0.8): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || word.trim() === "") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-GB";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function HearWordButton(props: { word: string; label?: string; muted?: boolean }) {
  return (
    <button type="button" onClick={() => !props.muted && speakWord(props.word)} aria-disabled={props.muted} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.22)]">
      <span aria-hidden="true">🔊</span> {props.label ?? "Hear the word"}
    </button>
  );
}

export function GrownUpReveal(props: { word: string }) {
  return <details className="mt-1 text-xs text-[color:var(--mid)]"><summary className="cursor-pointer">No sound? Grown-up: tap to read the word aloud</summary><span className="font-semibold">{props.word}</span></details>;
}

export function SpellingField(props: { word: string; value: string; onChange: (value: string) => void; label: string; reveal?: boolean; sentenceContext?: boolean; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
      <label htmlFor={id} className="text-sm font-medium text-[color:var(--ink)]">{props.label}{props.sentenceContext ? " — write it inside a sentence that shows what it means" : ""}</label>
      {props.reveal ? <p className="mt-1 text-lg font-semibold tracking-wide text-[color:var(--scarlett)]">{props.word}</p> : <div className="mt-1 flex flex-col gap-1"><HearWordButton word={props.word} /><GrownUpReveal word={props.word} /></div>}
      <input id={id} type="text" autoComplete="off" spellCheck={false} autoFocus={props.autoFocus} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}
