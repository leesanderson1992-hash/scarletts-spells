"use client";

import { useEffect, useRef, useState } from "react";
import { speakAuthoredNarration, type NarrationKind } from "./narration";

export function speakWord(word: string, rate = 0.8): void {
  speakAuthoredNarration(word, rate <= 0.7 ? "dictation" : "word");
}

export function usePreferredBritishAudio(word: string, kind: NarrationKind = "word") {
  const [lookup, setLookup] = useState<{ key: string; src: string | null } | null>(null);
  const needsLookup = kind !== "guide" && Boolean(word.trim()) && word.length <= 500;
  const lookupKey = `${kind}:${word}`;
  const lookingUp = needsLookup && lookup?.key !== lookupKey;
  const recordingSrc = lookup?.key === lookupKey ? lookup.src : null;
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!needsLookup) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setLookup({ key: lookupKey, src: null });
    }, 2000);
    void fetch("/api/teaching-dictionary/british-recording", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: word, kind: kind === "dictation" ? "sentence" : "word" }),
      signal: controller.signal,
    }).then(async response => response.ok ? await response.json() as { src: string | null } : { src: null })
      .then(result => { if (active && !controller.signal.aborted) setLookup({ key: lookupKey, src: result.src }); })
      .catch(() => { if (active) setLookup({ key: lookupKey, src: null }); })
      .finally(() => { window.clearTimeout(timeout); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [kind, word, needsLookup, lookupKey]);
  async function play() {
    if (lookingUp) return;
    if (recordingSrc) {
      try {
        window.speechSynthesis?.cancel();
        audio.current?.pause();
        const clip = new Audio(recordingSrc);
        audio.current = clip;
        await clip.play();
        return;
      } catch { /* A missing or unsupported clip falls back to device speech. */ }
    }
    speakAuthoredNarration(word, kind);
  }
  return { play, lookingUp };
}

export function HearWordButton(props: {
  word: string;
  label?: string;
  muted?: boolean;
  kind?: NarrationKind;
}) {
  const { play, lookingUp } = usePreferredBritishAudio(props.word, props.kind ?? "word");
  return (
    <button
      type="button"
      onClick={() => { if (!props.muted) void play(); }}
      aria-disabled={props.muted || lookingUp}
      disabled={lookingUp}
      className="hear-word-button inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.22)]"
    >
      <span aria-hidden="true">🔊</span> {props.label ?? "Hear the word"}
    </button>
  );
}
