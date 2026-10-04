"use client";

import { useRef, useState, type PointerEvent } from "react";
import { playInteractionSound } from "./sound";
import { useReducedMotion } from "./motion";
import { ingScrabbleSpelling, initialIngScrabbleBoard, moveIngTile, validIngScrabbleBoard, type IngScrabbleBoard } from "@/lib/adle/ing/scrabble";

export interface IngScrabbleProps {
  word: { canonicalWordId: string; base: string; word: string };
  stepLabel: string;
  muted?: boolean;
  initialBoard?: IngScrabbleBoard;
  initialComplete?: boolean;
  onProgress?: (board: IngScrabbleBoard) => void;
  onComplete: (board: IngScrabbleBoard) => void;
  onContinue: () => void;
}

/** WORD_ASSEMBLY.ing_scrabble@1: one movable tile set for the base and target. */
export function IngScrabble(props: IngScrabbleProps) {
  const [board, setBoard] = useState(() => props.initialBoard && validIngScrabbleBoard(props.initialBoard, props.word) ? props.initialBoard : initialIngScrabbleBoard(props.word));
  const [selected, setSelected] = useState<string | null>(null);
  const [complete, setComplete] = useState(props.initialComplete === true);
  const [feedback, setFeedback] = useState("");
  const gesture = useRef<{ tileId: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const reducedMotion = useReducedMotion();
  const tiles = new Map(board.tiles.map(tile => [tile.id, tile]));

  function move(tileId: string, destination: { kind: "slot"; index: number } | { kind: "bank" }) {
    if (complete) return;
    const next = moveIngTile(board, tileId, destination);
    if (next === board) return;
    setBoard(next); props.onProgress?.(next); setSelected(null); setFeedback("");
    playInteractionSound("snap", props.muted);
  }
  function start(event: PointerEvent<HTMLButtonElement>, tileId: string) {
    if (complete) return;
    gesture.current = { tileId, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Some synthetic pointer events have no active capture. */ }
    playInteractionSound("lift", props.muted);
  }
  function release(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    gesture.current = null;
    if (!active || Math.hypot(event.clientX - active.x, event.clientY - active.y) < 8) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-ing-slot], [data-ing-bank]");
    if (!target) return;
    suppressClick.current = true;
    if (target.dataset.ingSlot !== undefined) move(active.tileId, { kind: "slot", index: Number(target.dataset.ingSlot) });
    else move(active.tileId, { kind: "bank" });
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }
  function choose(tileId: string) {
    if (suppressClick.current || complete) return;
    setSelected(current => current === tileId ? null : tileId);
    playInteractionSound("select", props.muted);
  }
  function slotClick(index: number) {
    if (suppressClick.current || complete) return;
    if (selected) move(selected, { kind: "slot", index });
    else if (board.slots[index]) choose(board.slots[index]);
  }
  function check() {
    if (complete || board.slots.some(id => id === null)) return;
    if (ingScrabbleSpelling(board) === props.word.word) {
      setComplete(true); setFeedback(`Yes — ${props.word.base} becomes ${props.word.word}.`); props.onComplete(board); playInteractionSound("complete", props.muted);
    } else { setFeedback("That is not the -ing spelling yet. Move the tiles and try again."); playInteractionSound("resist", props.muted); }
  }
  const tileClass = `relative inline-grid min-h-14 min-w-12 place-items-center rounded-lg border-2 border-amber-900/50 bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 px-2 text-2xl font-black text-amber-950 shadow-[0_7px_0_#92400e,0_11px_12px_rgba(0,0,0,.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 ${reducedMotion ? "" : "transition-transform hover:-translate-y-1"}`;
  return <section className="grid gap-5 text-center" data-ing-scrabble-state={complete ? "complete" : "building"}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p>
    <h2 className="text-2xl font-black text-white">Build the action happening now</h2>
    <p className="text-cyan-100">Move, remove, and replace the base-word tiles. Add letters from the box to make the -ing word.</p>
    <div className="flex flex-wrap justify-center gap-2 rounded-3xl border border-cyan-300/30 bg-slate-950/40 p-5" aria-label="Word building slots">
      {board.slots.map((id, index) => <button key={index} type="button" data-ing-slot={index} data-ing-tile-id={id ?? undefined} disabled={complete} aria-label={`Slot ${index + 1}${id ? `: ${tiles.get(id)?.letter}` : ": empty"}`} aria-pressed={!!id && selected === id}
        onPointerDown={event => { if (id) start(event, id); }} onPointerUp={release} onClick={() => slotClick(index)}
        className={`${tileClass} ${id ? "" : "border-dashed border-cyan-300 bg-none bg-slate-800 text-cyan-100 shadow-none"} ${id && selected === id ? "ring-4 ring-cyan-300" : ""}`}>{id ? tiles.get(id)?.letter : "·"}</button>)}
    </div>
    <div data-ing-bank="true" className="grid gap-3 rounded-3xl border border-amber-300/40 bg-slate-950/45 p-5">
      <div className="flex flex-wrap items-center justify-center gap-3"><h3 className="font-black text-amber-100">Letter box</h3><button type="button" disabled={!selected || complete} onClick={() => selected && move(selected, { kind: "bank" })} className="rounded-full border border-cyan-200 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Move selected tile here</button></div>
      <div className="flex min-h-20 flex-wrap justify-center gap-3" aria-label="Available letters">{board.bank.map(id => <button key={id} type="button" data-ing-bank="true" data-ing-tile-id={id} aria-label={`Letter ${tiles.get(id)?.letter}`} aria-pressed={selected === id} disabled={complete} onPointerDown={event => start(event, id)} onPointerUp={release} onClick={() => choose(id)} className={`${tileClass} ${selected === id ? "ring-4 ring-cyan-300" : ""}`}>{tiles.get(id)?.letter}</button>)}</div>
    </div>
    <p role="status" aria-live="polite" className="min-h-6 font-semibold text-cyan-100">{feedback || (selected ? `Letter ${tiles.get(selected)?.letter} selected. Choose a slot or return it to the box.` : "Select a tile, then choose where it goes. You can also drag it.")}</p>
    {complete ? <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Continue</button> : <button type="button" disabled={board.slots.some(id => id === null)} onClick={check} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950 disabled:opacity-40">Check word</button>}
  </section>;
}
