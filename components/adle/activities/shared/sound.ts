"use client";

export type InteractionSound = "lift" | "attraction" | "snap" | "cleave" | "fusion" | "shutter" | "reveal" | "complete";
const FREQUENCY: Record<InteractionSound, number> = { lift: 280, attraction: 340, snap: 440, cleave: 240, fusion: 520, shutter: 190, reveal: 390, complete: 620 };

export function playInteractionSound(kind: InteractionSound, muted = false): void {
  if (muted || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = FREQUENCY[kind];
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.1);
  oscillator.addEventListener("ended", () => void context.close());
}
