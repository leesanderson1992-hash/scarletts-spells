"use client";

import { useState, useSyncExternalStore } from "react";
import { isDeviceSpeechSource } from "@/lib/adle/weak-vowel/audio-source";

export function deviceSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

// Speech API support is a browser capability, so there is no change event.
const subscribeToSpeechSupport = () => () => undefined;
const assumeSpeechSupportOnServer = () => true;

export function useWeakVowelAudioError(source: string) {
  const speechAvailable = useSyncExternalStore(subscribeToSpeechSupport, deviceSpeechAvailable, assumeSpeechSupportOnServer);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const audioError = failedSource === source || (isDeviceSpeechSource(source) && !speechAvailable);
  const setAudioError = (failed: boolean) => setFailedSource(failed ? source : null);
  return [audioError, setAudioError] as const;
}

/** A British voice is preferred. If none is installed, the device default is used. */
export function speakWeakVowelDeviceSource(src: string): boolean {
  if (!isDeviceSpeechSource(src) || !deviceSpeechAvailable()) return false;
  try {
    const text = decodeURIComponent(src.slice("device-speech:".length));
    if (!text.trim()) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const british = window.speechSynthesis.getVoices().find((voice) => /^en[-_]GB$/i.test(voice.lang));
    if (british) { utterance.voice = british; utterance.lang = "en-GB"; }
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch { return false; }
}
