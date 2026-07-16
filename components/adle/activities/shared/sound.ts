"use client";

export type InteractionSound = "select" | "lift" | "attraction" | "snap" | "cleave" | "resist" | "sparkle" | "fusion" | "shutter" | "reveal" | "complete";
const FREQUENCY: Record<Exclude<InteractionSound, "cleave" | "sparkle">, number> = { select: 360, lift: 280, attraction: 340, snap: 440, resist: 120, fusion: 520, shutter: 190, reveal: 390, complete: 620 };
let sharedContext: AudioContext | null = null;

export function playInteractionSound(kind: InteractionSound, muted = false): void {
  if (muted || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = sharedContext ?? new AudioContextClass();
    sharedContext = context;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const now = context.currentTime;
    const tones = kind === "sparkle" ? [660, 880, 1100] : [kind === "cleave" ? 360 : FREQUENCY[kind]];
    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + (kind === "sparkle" ? index * 0.045 : 0);
      const duration = kind === "cleave" || kind === "resist" ? 0.16 : kind === "sparkle" ? 0.22 : 0.1;
      oscillator.type = kind === "cleave" ? "sawtooth" : kind === "resist" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === "cleave") oscillator.frequency.exponentialRampToValueAtTime(105, start + duration);
      gain.gain.setValueAtTime(kind === "cleave" ? 0.09 : kind === "resist" ? 0.065 : 0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });
    // Keep a single context alive: iOS and Chromium both make repeated contexts quieter or block them.
  } catch {
    // Sound is enhancement-only; blocked or unavailable audio must not stop an interaction.
  }
}
