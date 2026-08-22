"use client";
/* eslint-disable react-hooks/refs -- the SVG overlay intentionally reads measured button geometry. */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";
import type { MeaningConnectionTarget } from "@/lib/adle/meaning-connection-contract";

export type { MeaningConnectionTarget } from "@/lib/adle/meaning-connection-contract";
type Point = { x: number; y: number };
function seededOrder<T>(values: readonly T[], seed: string): T[] {
  let state = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 1);
  const ordered = [...values];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = Math.floor((state / 2 ** 32) * (index + 1));
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  }
  return ordered;
}

export function MeaningConnectionActivity(props: { targets: readonly MeaningConnectionTarget[]; muted?: boolean; initialConnected?: readonly string[]; initialMisses?: Readonly<Record<string, number>>; onProgress?: (progress: { connected: string[]; misses: Record<string, number> }) => void; onComplete: (progress: { connected: string[]; misses: Record<string, number> }) => void }) {
  const markerId = useId().replaceAll(":", "");
  const words = useMemo(() => seededOrder(props.targets, "meaning-match-words"), [props.targets]); const definitions = useMemo(() => seededOrder(props.targets, "meaning-match-definitions"), [props.targets]);
  const board = useRef<HTMLDivElement>(null); const wordButtons = useRef<Record<string, HTMLButtonElement | null>>({}); const definitionButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [selected, setSelected] = useState<string | null>(null); const [cursor, setCursor] = useState<Point | null>(null); const [lines, setLines] = useState<Record<string, Point>>({}); const [connected, setConnected] = useState<string[]>(() => [...(props.initialConnected ?? [])]); const [misses, setMisses] = useState<Record<string, number>>(() => ({ ...(props.initialMisses ?? {}) })); const [feedback, setFeedback] = useState(""); const complete = connected.length === props.targets.length;
  const onProgress = useRef(props.onProgress);
  useEffect(() => { onProgress.current = props.onProgress; }, [props.onProgress]);
  useEffect(() => { onProgress.current?.({ connected, misses }); }, [connected, misses]);
  function startPoint(id: string): Point | null { const container = board.current?.getBoundingClientRect(), button = wordButtons.current[id]?.getBoundingClientRect(); return container && button ? { x: button.right - container.left, y: button.top + button.height / 2 - container.top } : null; }
  function pointer(event: React.PointerEvent<HTMLDivElement>) { const rect = board.current?.getBoundingClientRect(); if (selected && rect) setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top }); }
  function chooseDefinition(target: MeaningConnectionTarget) {
    if (!selected || complete) return;
    const selectedId = selected;
    if (selectedId === target.canonicalWordId) {
      const rect = board.current?.getBoundingClientRect(), button = definitionButtons.current[target.canonicalWordId]?.getBoundingClientRect(); if (rect && button) setLines((current) => ({ ...current, [target.canonicalWordId]: { x: button.left - rect.left, y: button.top + button.height / 2 - rect.top } }));
      const nextConnected = connected.includes(target.canonicalWordId) ? connected : [...connected, target.canonicalWordId]; setConnected(nextConnected); setFeedback(target.componentToWholeRelationship || `${target.word} matches that meaning.`); playInteractionSound("snap", props.muted);
      const next = words.find((word) => !nextConnected.includes(word.canonicalWordId)); if (next) window.requestAnimationFrame(() => wordButtons.current[next.canonicalWordId]?.focus());
    } else { setMisses((value) => ({ ...value, [selectedId]: (value[selectedId] ?? 0) + 1 })); setFeedback("Read the meaning again. Which word parts give you a clue?"); playInteractionSound("resist", props.muted); window.requestAnimationFrame(() => wordButtons.current[selectedId]?.focus()); }
    setSelected(null); setCursor(null);
  }
  return <section className="grid gap-5 text-cyan-50" aria-labelledby="meaning-connection-title" data-testid="meaning-connection"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Meaning workshop</p><h2 id="meaning-connection-title" className="mt-2 text-3xl font-black text-white">Connect each word to its meaning</h2><p className="mt-2 font-semibold text-cyan-100">Choose a word, then choose its definition. The connection works with touch, pointer, or keyboard.</p></div><div ref={board} onPointerMove={pointer} className="relative grid min-h-[360px] gap-12 rounded-3xl border border-cyan-300/30 bg-slate-950/45 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-28"><svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#67e8f9" /></marker></defs>{connected.map((id) => { const start = startPoint(id), rect = board.current?.getBoundingClientRect(), button = definitionButtons.current[id]?.getBoundingClientRect(); const end = rect && button ? { x: button.left - rect.left, y: button.top + button.height / 2 - rect.top } : lines[id]; return start && end ? <line key={id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#67e8f9" strokeWidth="4" markerEnd={`url(#${markerId})`} /> : null; })}{selected && cursor && startPoint(selected) ? <line x1={startPoint(selected)!.x} y1={startPoint(selected)!.y} x2={cursor.x} y2={cursor.y} stroke="#fcd34d" strokeWidth="4" strokeDasharray="7 7" markerEnd={`url(#${markerId})`} /> : null}</svg><div className="relative z-10 grid content-start gap-3"><h3 className="text-sm font-black uppercase tracking-wider text-cyan-200">Words</h3>{words.map((target) => <button key={target.canonicalWordId} ref={(node) => { wordButtons.current[target.canonicalWordId] = node; }} type="button" disabled={connected.includes(target.canonicalWordId)} aria-pressed={selected === target.canonicalWordId} onClick={() => { setSelected(target.canonicalWordId); setFeedback("Now choose its meaning."); }} className={`min-h-14 rounded-2xl border px-4 text-left text-lg font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/70 ${selected === target.canonicalWordId ? "border-amber-300 bg-amber-100 text-slate-950" : "border-cyan-200/45 bg-white/10 text-white"}`}><span>{target.word}{connected.includes(target.canonicalWordId) ? " ✓" : ""}</span>{target.componentMeanings?.length ? <span className="mt-1 block text-xs font-semibold opacity-80">Parts: {target.componentMeanings.join(" + ")}</span> : null}</button>)}</div><div className="relative z-10 grid content-start gap-3"><h3 className="text-sm font-black uppercase tracking-wider text-cyan-200">Meanings</h3>{definitions.map((target) => <button key={target.canonicalWordId} ref={(node) => { definitionButtons.current[target.canonicalWordId] = node; }} type="button" disabled={!selected || complete || connected.includes(target.canonicalWordId)} onClick={() => chooseDefinition(target)} className="min-h-14 rounded-2xl border border-cyan-200/45 bg-white/10 px-4 text-left text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/70 disabled:opacity-70">{target.definition}{connected.includes(target.canonicalWordId) ? " ✓" : ""}</button>)}</div></div>{complete ? <button type="button" onClick={() => props.onComplete({ connected, misses })} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200/70">Remember the words</button> : null}<p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-cyan-100">{feedback}</p></section>;
}
