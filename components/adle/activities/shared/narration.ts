"use client";

export type NarrationKind = "guide" | "word" | "dictation";

/**
 * Use the learner's device-selected system voice. This keeps voice choice with
 * the family and never sends child-specific text to a TTS vendor.
 */
export function speakAuthoredNarration(text: string, kind: NarrationKind = "word"): void {
  speakWithBrowserVoice(text, kind);
}

function speakWithBrowserVoice(text: string, kind: NarrationKind): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || text.trim() === "") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = kind === "dictation" ? 0.7 : kind === "guide" ? 0.85 : 0.8;
  window.speechSynthesis.speak(utterance);
}
