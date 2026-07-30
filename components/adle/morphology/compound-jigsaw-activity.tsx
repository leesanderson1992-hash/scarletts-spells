"use client";
/* eslint-disable react-hooks/refs -- DOM geometry is read only by drag handlers; callback refs populate the lookup map. */

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";

export type CompoundJigsawTarget = { canonicalWordId: string; word: string; firstWord: string; secondWord: string };

function seededOrder<T>(values: readonly T[], seed: string): T[] {
  let state = [...seed].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 1);
  return [...values].sort(() => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 - 0.5; });
}

function Piece(props: { id: string; text: string; side: "first" | "second"; selected: boolean; locked: boolean; offset: { x: number; y: number }; onSelect: () => void; onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void; onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void; onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragOver: (event: DragEvent<HTMLButtonElement>) => void; onDrop: (event: DragEvent<HTMLButtonElement>) => void; buttonRef: (node: HTMLButtonElement | null) => void }) {
  const d = props.side === "first"
    ? "M4 4H104V25c13-8 25-2 25 11s-12 19-25 11v29H4Z"
    : "M128 4H4v21c13-8 25-2 25 11S17 55 4 47v29h124Z";
  return <button ref={props.buttonRef} data-piece-id={props.id} draggable={false} type="button" disabled={props.locked} aria-label={`${props.text}, ${props.side === "first" ? "drag this piece to its matching right-hand piece" : "matching right-hand piece"}`} aria-pressed={props.selected} onClick={props.onSelect} onPointerDown={props.onPointerDown} onPointerMove={props.onPointerMove} onPointerUp={props.onPointerUp} onPointerCancel={props.onPointerUp} onMouseDown={props.onMouseDown} onDragStart={props.onDragStart} onDragOver={props.onDragOver} onDrop={props.onDrop} style={{ transform: `translate3d(${props.offset.x}px,${props.offset.y}px,0)` }} className={`relative h-20 min-w-32 touch-none overflow-visible outline-none transition-transform focus-visible:ring-4 focus-visible:ring-cyan-300/70 disabled:opacity-50 ${props.selected ? "-translate-y-1 scale-[1.03]" : "hover:-translate-y-0.5"}`}>
    <svg viewBox="0 0 132 80" aria-hidden="true" className="absolute inset-0 h-full w-full drop-shadow-[0_8px_12px_rgba(8,47,73,.32)]"><path d={d} fill={props.side === "first" ? "#cffafe" : "#fef3c7"} stroke={props.selected ? "#22d3ee" : "#f59e0b"} strokeWidth="3" /></svg>
    <span className="relative grid h-full place-items-center px-5 text-lg font-black text-slate-950">{props.text}</span>
  </button>;
}

export function CompoundJigsawActivity(props: {
  targets: readonly CompoundJigsawTarget[];
  muted?: boolean;
  initialLocked?: readonly string[];
  initialMisses?: Readonly<Record<string, number>>;
  onProgress?: (progress: { locked: string[]; misses: Record<string, number> }) => void;
  onComplete: (progress: { locked: string[]; misses: Record<string, number> }) => void;
}) {
  const pieces = useMemo(() => seededOrder(props.targets.flatMap((target) => [{ id: `${target.canonicalWordId}:first`, target, side: "first" as const, text: target.firstWord }, { id: `${target.canonicalWordId}:second`, target, side: "second" as const, text: target.secondWord }]), props.targets.map((target) => target.canonicalWordId).join(":")), [props.targets]);
  const [selected, setSelected] = useState<string | null>(null); const [locked, setLocked] = useState<string[]>(() => [...(props.initialLocked ?? [])]); const [misses, setMisses] = useState<Record<string, number>>(() => ({ ...(props.initialMisses ?? {}) })); const [feedback, setFeedback] = useState(""); const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({}); const pieceRefs = useRef<Record<string, HTMLButtonElement | null>>({}); const dragging = useRef<string | null>(null); const dragStart = useRef<{ x: number; y: number } | null>(null); const dragged = useRef(false); const suppressClick = useRef(false);
  const complete = locked.length === props.targets.length;
  const onProgress = useRef(props.onProgress);
  useEffect(() => { onProgress.current = props.onProgress; }, [props.onProgress]);
  useEffect(() => { onProgress.current?.({ locked, misses }); }, [locked, misses]);
  function lockPair(target: CompoundJigsawTarget) { setLocked((current) => current.includes(target.canonicalWordId) ? current : [...current, target.canonicalWordId]); setSelected(null); setFeedback(`${target.word} clicks together.`); playInteractionSound("snap", props.muted); }
  function reject(message: string, canonicalWordId: string) { setMisses((value) => ({ ...value, [canonicalWordId]: (value[canonicalWordId] ?? 0) + 1 })); setSelected(null); setFeedback(message); playInteractionSound("resist", props.muted); }
  function choose(piece: typeof pieces[number]) {
    if (suppressClick.current) return;
    if (complete || locked.includes(piece.target.canonicalWordId)) return;
    if (!selected) { setSelected(piece.id); setFeedback("Choose the matching piece."); return; }
    const first = pieces.find((candidate) => candidate.id === selected); if (!first || first.id === piece.id) { setSelected(null); return; }
    if (first.target.canonicalWordId === piece.target.canonicalWordId && first.side === "first" && piece.side === "second") { lockPair(piece.target); return; }
    reject("Those pieces do not make one of our compound words. Try another pair.", first.target.canonicalWordId);
  }
  function moveDragAt(clientX: number, clientY: number, piece: typeof pieces[number]) { if (dragging.current !== piece.id || !dragStart.current) return; const offset = { x: clientX - dragStart.current.x, y: clientY - dragStart.current.y }; if (Math.abs(offset.x) > 4 || Math.abs(offset.y) > 4) dragged.current = true; setOffsets((current) => ({ ...current, [piece.id]: offset })); }
  function endDragAt(clientX: number, clientY: number, piece: typeof pieces[number]) { if (dragging.current !== piece.id) return; const didDrag = dragged.current; dragging.current = null; dragStart.current = null; if (!didDrag) return; suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0); const match = pieces.find((candidate) => candidate.target.canonicalWordId === piece.target.canonicalWordId && candidate.side === "second"); const underPointer = document.elementFromPoint(clientX, clientY)?.closest<HTMLButtonElement>("[data-piece-id]")?.dataset.pieceId; const source = pieceRefs.current[piece.id]?.getBoundingClientRect(); const destination = match ? pieceRefs.current[match.id]?.getBoundingClientRect() : null; setOffsets((current) => ({ ...current, [piece.id]: { x: 0, y: 0 } })); if (match && (underPointer === match.id || (source && destination && Math.hypot((source.left + source.width / 2) - (destination.left + destination.width / 2), (source.top + source.height / 2) - (destination.top + destination.height / 2)) < 135))) lockPair(piece.target); else reject("Drag the first piece onto its matching second piece.", piece.target.canonicalWordId); }
  function beginDrag(event: PointerEvent<HTMLButtonElement>, piece: typeof pieces[number]) { if (piece.side !== "first" || locked.includes(piece.target.canonicalWordId)) return; event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { x: event.clientX, y: event.clientY }; dragged.current = false; dragging.current = piece.id; }
  function moveDrag(event: PointerEvent<HTMLButtonElement>, piece: typeof pieces[number]) { moveDragAt(event.clientX, event.clientY, piece); }
  function endDrag(event: PointerEvent<HTMLButtonElement>, piece: typeof pieces[number]) { if (dragging.current === piece.id) event.preventDefault(); endDragAt(event.clientX, event.clientY, piece); }
  function beginMouseDrag(event: ReactMouseEvent<HTMLButtonElement>, piece: typeof pieces[number]) {
    if (piece.side !== "first" || locked.includes(piece.target.canonicalWordId)) return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
    dragging.current = piece.id;
    const move = (nativeEvent: globalThis.MouseEvent) => moveDragAt(nativeEvent.clientX, nativeEvent.clientY, piece);
    const up = (nativeEvent: globalThis.MouseEvent) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      endDragAt(nativeEvent.clientX, nativeEvent.clientY, piece);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
  function dragStartNative(event: DragEvent<HTMLButtonElement>, piece: typeof pieces[number]) { if (piece.side !== "first") return; event.dataTransfer.setData("text/plain", piece.id); event.dataTransfer.effectAllowed = "move"; }
  function dragOverNative(event: DragEvent<HTMLButtonElement>, piece: typeof pieces[number]) { if (piece.side === "second") event.preventDefault(); }
  function dropNative(event: DragEvent<HTMLButtonElement>, piece: typeof pieces[number]) { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain"); const source = pieces.find((candidate) => candidate.id === sourceId); if (source && source.target.canonicalWordId === piece.target.canonicalWordId && source.side === "first" && piece.side === "second") lockPair(piece.target); else reject("Those pieces do not make one of our compound words. Try another pair.", source?.target.canonicalWordId ?? piece.target.canonicalWordId); }
  return <section className="grid gap-5 text-cyan-50" aria-labelledby="compound-jigsaw-title"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Compound workshop</p><h2 id="compound-jigsaw-title" className="mt-2 text-3xl font-black text-white">Build all the compound words</h2><p className="mt-2 font-semibold text-cyan-100">The pieces are muddled. Drag a blue first-piece onto its matching gold second-piece. You can also select the two pieces with the keyboard.</p></div><div className="rounded-3xl border border-cyan-300/30 bg-slate-950/45 p-5"><div className="flex flex-wrap justify-center gap-x-5 gap-y-6" aria-label="Muddled draggable jigsaw word pieces">{pieces.map((piece) => <Piece key={piece.id} id={piece.id} text={piece.text} side={piece.side} selected={selected === piece.id} locked={locked.includes(piece.target.canonicalWordId)} offset={offsets[piece.id] ?? { x: 0, y: 0 }} buttonRef={(node) => { pieceRefs.current[piece.id] = node; }} onSelect={() => choose(piece)} onPointerDown={(event) => beginDrag(event, piece)} onPointerMove={(event) => moveDrag(event, piece)} onPointerUp={(event) => endDrag(event, piece)} onMouseDown={(event) => beginMouseDrag(event, piece)} onDragStart={(event) => dragStartNative(event, piece)} onDragOver={(event) => dragOverNative(event, piece)} onDrop={(event) => dropNative(event, piece)} />)}</div></div>{locked.length ? <div className="rounded-3xl border border-emerald-300/30 bg-emerald-100/10 p-4"><p className="text-sm font-black uppercase tracking-wide text-emerald-200">Words you have built</p><div className="mt-3 flex flex-wrap gap-3">{props.targets.filter((target) => locked.includes(target.canonicalWordId)).map((target) => <span key={target.canonicalWordId} className="rounded-2xl bg-white px-4 py-2 text-lg font-black text-slate-950"><span className="underline decoration-amber-400 decoration-4 underline-offset-4">{target.firstWord}</span>{target.secondWord}</span>)}</div></div> : null}{complete ? <button type="button" onClick={() => props.onComplete({ locked, misses })} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Connect the meanings</button> : null}<p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-cyan-100">{feedback}</p></section>;
}
