"use client";

export type NarrationKind = "guide" | "word" | "dictation";

const FEMALE_UK_HINTS = ["amy", "emma", "sonia", "libby", "abbi", "bella", "hollie", "maisie", "olivia", "kate", "flo", "shelley", "sandy"];
type NarrationManifest = { clips: Array<{ text: string; kind: NarrationKind; path: string }> };
let manifestPromise: Promise<NarrationManifest> | null = null;
let resolvedManifest: NarrationManifest | null = null;

function friendlyBritishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en-gb"));
  return voices.find((voice) => FEMALE_UK_HINTS.some((hint) => voice.name.toLowerCase().includes(hint))) ?? voices[0] ?? null;
}

/**
 * One safe local fallback for every spoken prompt. Reviewed authored clips can
 * replace this call without ever sending child-specific text to a TTS vendor.
 */
export function speakAuthoredNarration(text: string, kind: NarrationKind = "word"): void {
  if (typeof window === "undefined" || text.trim() === "") return;
  const play = (manifest: NarrationManifest) => {
    const clip = manifest.clips.find((candidate) => candidate.text === text && candidate.kind === kind);
    if (!clip) {
      speakWithBrowserVoice(text, kind);
      return;
    }
    window.speechSynthesis.cancel();
    const audio = new Audio(clip.path);
    void audio.play().catch(() => speakWithBrowserVoice(text, kind));
  };
  if (resolvedManifest) {
    play(resolvedManifest);
    return;
  }
  if (!manifestPromise) {
    manifestPromise = fetch("/audio/narration/manifest.json")
      .then((response) => response.ok ? response.json() as Promise<NarrationManifest> : { clips: [] })
      .catch(() => ({ clips: [] }));
  }
  void manifestPromise.then((manifest) => {
    resolvedManifest = manifest;
    play(manifest);
  });
}

function speakWithBrowserVoice(text: string, kind: NarrationKind): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || text.trim() === "") return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = kind === "dictation" ? 0.7 : kind === "guide" ? 0.85 : 0.8;
  const voice = friendlyBritishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}
