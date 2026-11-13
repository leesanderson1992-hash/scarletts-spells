"use client";

import { useEffect, useRef, useState } from "react";
import { speakAuthoredNarration } from "@/components/adle/activities/shared/narration";

export function DictationListen({ sentence, recordingSrc }: { sentence: string; recordingSrc?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playing = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => () => {
    if (playing.current) window.speechSynthesis?.cancel();
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
      speakAuthoredNarration(sentence, "dictation");
    }
  }

  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
    <button type="button" disabled={!sentence.trim()} onClick={() => void listen()}
      className="rounded-lg border border-[var(--border)] px-3 py-2 font-semibold hover:border-[var(--scarlett)] disabled:opacity-50">
      Listen
    </button>
    {recordingSrc && <audio ref={audio} preload="none" src={recordingSrc} />}
    {sentence.trim() && <span className={recordingSrc ? "text-emerald-800" : "text-[color:var(--mid)]"}>
      {recordingSrc ? "✓ British recording available" : "British recording missing · Device voice"}
    </span>}
    {error && <span role="alert">Audio could not play.</span>}
  </div>;
}
