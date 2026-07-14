"use client";

export type InteractionSound = "lift" | "attraction" | "snap" | "cleave" | "sparkle" | "fusion" | "shutter" | "reveal" | "complete";
const FREQUENCY: Record<Exclude<InteractionSound, "cleave" | "sparkle">, number> = { lift: 280, attraction: 340, snap: 440, fusion: 520, shutter: 190, reveal: 390, complete: 620 };

export function playInteractionSound(kind: InteractionSound, muted = false): void {
  if (muted || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const tones = kind === "sparkle" ? [660, 880, 1100] : [kind === "cleave" ? 360 : FREQUENCY[kind]];
    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + (kind === "sparkle" ? index * 0.045 : 0);
      const duration = kind === "cleave" ? 0.16 : kind === "sparkle" ? 0.22 : 0.1;
      oscillator.type = kind === "cleave" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      if (kind === "cleave") oscillator.frequency.exponentialRampToValueAtTime(105, start + duration);
      gain.gain.setValueAtTime(kind === "cleave" ? 0.045 : 0.03, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });
    window.setTimeout(() => void context.close().catch(() => undefined), kind === "sparkle" ? 400 : 250);
  } catch {
    // Sound is enhancement-only; blocked or unavailable audio must not stop an interaction.
  }
}
