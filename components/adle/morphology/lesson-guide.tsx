"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { speakAuthoredNarration } from "@/components/adle/activities/shared/narration";

export function LessonGuide(props: { beat: GuideBeatV1; phaseCue: string; muted: boolean; onMutedChange: (muted: boolean) => void; silent?: boolean; help?: string; guideName?: string }) {
  const [primed, setPrimed] = useState(false);
  const line = props.help || props.beat.say || "Take your time and work with the word.";
  useEffect(() => { if (primed && !props.muted && !props.silent && line) speakAuthoredNarration(props.beat.narration ?? line, "guide"); }, [line, primed, props.muted, props.silent, props.beat.narration]);
  return <aside className="adie-guide" aria-label="Adie, your lesson guide">
    <div className="adie-guide-portrait"><Image src="/adie/adie-head.png" width={320} height={320} alt="Adie, a smiling white and pink robot with glowing pink eyes" priority /><p>ADIE</p></div>
    <div className="adie-guide-bubble"><p className="adie-guide-cue">{props.silent ? "Quiet recall" : props.phaseCue}</p><p>{props.silent ? "Listen, remember, and write." : line}</p></div>
    <div className="adie-guide-actions"><button type="button" onClick={() => { setPrimed(true); if (!props.muted && !props.silent) speakAuthoredNarration(props.beat.narration ?? line, "guide"); }} disabled={props.silent}>Hear Adie</button><button type="button" onClick={() => props.onMutedChange(!props.muted)} aria-pressed={props.muted}>{props.muted ? "Sound off" : "Sound on"}</button></div>
  </aside>;
}
