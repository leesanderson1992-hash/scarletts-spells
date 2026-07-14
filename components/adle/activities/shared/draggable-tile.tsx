"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { INTERACTION_MOTION } from "./motion";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

export function DraggableTile(props: { id: string; text: string; label?: string; gloss?: string; role?: "prefix" | "base" | "root" | "suffix" | "connector"; recallNeutral?: boolean; disabled?: boolean; selected?: boolean; muted?: boolean; onSelect?: (id: string) => void; onDrop?: (id: string, point: { x: number; y: number }) => void }) {
  const [lifted, setLifted] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const reducedMotion = useReducedMotion();

  function lift(x: number, y: number) { if (props.disabled) return; origin.current = { x: x - offset.x, y: y - offset.y }; setLifted(true); playInteractionSound("lift", props.muted); }
  function drop(x: number, y: number) { if (!lifted) return; setLifted(false); props.onDrop?.(props.id, { x, y }); setOffset({ x: 0, y: 0 }); }
  function onPointerDown(event: PointerEvent<HTMLButtonElement>) { event.currentTarget.setPointerCapture(event.pointerId); lift(event.clientX, event.clientY); props.onSelect?.(props.id); }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) { if (lifted) setOffset({ x: event.clientX - origin.current.x, y: event.clientY - origin.current.y }); }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (props.disabled) return;
    if (event.key === " ") { event.preventDefault(); if (lifted) drop(offset.x, offset.y); else { lift(0, 0); props.onSelect?.(props.id); } return; }
    if (event.key === "Enter") { event.preventDefault(); props.onSelect?.(props.id); return; }
    if (lifted && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); const step = 12; setOffset((current) => ({ x: current.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), y: current.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) }));
    }
  }
  const heavy = props.role === "base" || props.role === "root";
  return (
    <button type="button" disabled={props.disabled} aria-label={`${props.label ?? props.text}${lifted ? ", lifted" : ""}`} aria-pressed={props.selected || lifted} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(event) => drop(event.clientX, event.clientY)} onPointerCancel={() => { setLifted(false); setOffset({ x: 0, y: 0 }); }} onKeyDown={onKeyDown} onDoubleClick={() => !props.recallNeutral && props.gloss && setFlipped((value) => !value)} style={{ transform: `translate3d(${offset.x}px,${offset.y}px,0) scale(${lifted && !reducedMotion ? 1.06 : 1})`, transition: lifted || reducedMotion ? "none" : `transform ${INTERACTION_MOTION.snapMs}ms ease`, touchAction: "none" }} className={`relative min-h-14 min-w-20 rounded-2xl border px-4 py-3 text-lg font-black shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 ${heavy ? "border-amber-300 bg-amber-50 text-amber-950 shadow-md" : "border-cyan-300 bg-cyan-50 text-cyan-950"} ${props.selected ? "ring-4 ring-cyan-300/30" : ""}`}>
      <span className="block" style={{ transition: reducedMotion ? "none" : `transform ${INTERACTION_MOTION.flipMs}ms`, transform: flipped && !reducedMotion ? "rotateY(180deg)" : undefined }}>{flipped && !props.recallNeutral ? props.gloss : props.text}</span>
    </button>
  );
}
