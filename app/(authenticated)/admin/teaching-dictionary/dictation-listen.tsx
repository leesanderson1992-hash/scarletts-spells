"use client";

import { useEffect, useRef, useState } from "react";
import { speakAuthoredNarration } from "@/components/adle/activities/shared/narration";

export function DictationListen({ sentence, recordingSrc, label = "Listen to sentence", kind = "dictation", recordingDescription = "✓ British recording available", fallbackDescription = "British recording missing · Device voice" }: {
  sentence: string; recordingSrc?: string; label?: string; kind?: "word" | "dictation";
  recordingDescription?: string; fallbackDescription?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const playing = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
      if (playing.current) window.speechSynthesis?.cancel();
    };
  }, []);

  async function listen() {
    setError(false);
    if (audio.current) {
      try {
        window.speechSynthesis?.cancel();
        audio.current.currentTime = 0;
        await audio.current.play();
      } catch {
        setError(true);
      }
    } else {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        setError(true);
        return;
      }
      playing.current = true;
      speakAuthoredNarration(sentence, kind);
    }
  }

  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <button type="button" disabled={!sentence.trim()} onClick={() => void listen()}
      className="rounded-lg border border-[var(--border)] px-3 py-2 font-semibold hover:border-[var(--scarlett)] disabled:opacity-50">
      {label}
    </button>
    {recordingSrc && <audio ref={audio} preload="none" src={recordingSrc} />}
    {sentence.trim() && <span className={recordingSrc ? "text-emerald-800" : "text-[color:var(--mid)]"}>
      {recordingSrc ? recordingDescription : fallbackDescription}
    </span>}
    {error && <span role="alert">Audio could not play.</span>}
  </div>;
}
