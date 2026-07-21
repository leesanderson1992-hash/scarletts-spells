"use client";

import { useRef, useState } from "react";
import { DraggableTile } from "./draggable-tile";
import { INTERACTION_MOTION } from "./motion";
import { playInteractionSound } from "./sound";

export interface RailTile { id: string; text: string; role?: "prefix" | "base" | "root" | "suffix" | "connector"; gloss?: string }

export function SnapRail(props: { tiles: RailTile[]; expectedIds: string[]; fixedTiles?: RailTile[]; fixedTilesPosition?: "before" | "after"; label: string; recallNeutral?: boolean; muted?: boolean; checkMode?: "automatic" | "manual"; onComplete?: (word: string) => void; onInvalid?: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Array<string | null>>(() => Array.from({ length: props.expectedIds.length }, () => null));
  const [completed, setCompleted] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const available = completed ? [] : props.tiles.filter((tile) => !placed.includes(tile.id));
  const full = placed.every((id) => id !== null);
  const manual = props.checkMode === "manual";

  function wordFrom(ids: string[]) {
    const placedText = ids.map((id) => props.tiles.find((tile) => tile.id === id)?.text ?? "");
    const fixedText = (props.fixedTiles ?? []).map((tile) => tile.text);
    return (props.fixedTilesPosition === "before" ? [...fixedText, ...placedText] : [...placedText, ...fixedText]).join("");
  }
  function check(ids: string[]) {
    if (ids.every((value, index) => value === props.expectedIds[index])) {
      setCompleted(true);
      setAnnouncement("Word parts joined successfully");
      playInteractionSound("fusion", props.muted);
      props.onComplete?.(wordFrom(ids));
      return true;
    }
    setAnnouncement(manual ? "That word is not ready yet. Move the blocks and try again." : "Those parts make a different combination");
    playInteractionSound("resist", props.muted);
    props.onInvalid?.(ids);
    return false;
  }
  function place(id: string, slot: number) {
    if (completed || placed[slot] !== null || !available.some((tile) => tile.id === id)) return;
    const next = placed.map((value, index) => index === slot ? id : value);
    setPlaced(next);
    setSelected(null);
    const tileLabel = props.tiles.find((tile) => tile.id === id)?.text ?? "Word part";
    if (next.every((value) => value !== null)) {
      const ids = next as string[];
      if (manual) setAnnouncement("All blocks are in place. Check your word when you are ready.");
      else if (!check(ids)) setPlaced(Array.from({ length: props.expectedIds.length }, () => null));
    } else {
      setAnnouncement(`${tileLabel} placed in position ${slot + 1}`);
      playInteractionSound("snap", props.muted);
    }
  }
  function remove(slot: number) {
    const id = placed[slot];
    if (completed || !id) return;
    setPlaced((current) => current.map((value, index) => index === slot ? null : value));
    setSelected(null);
    setAnnouncement(`${props.tiles.find((tile) => tile.id === id)?.text ?? "Word part"} returned to the bank`);
    playInteractionSound("select", props.muted);
  }
  function pointerDrop(id: string, point: { x: number; y: number }) {
    const slot = slotRefs.current.findIndex((node, index) => {
      if (!node || placed[index] !== null) return false;
      const rect = node.getBoundingClientRect();
      return point.x >= rect.left - INTERACTION_MOTION.snapDistancePx && point.x <= rect.right + INTERACTION_MOTION.snapDistancePx && point.y >= rect.top - INTERACTION_MOTION.snapDistancePx && point.y <= rect.bottom + INTERACTION_MOTION.snapDistancePx;
    });
    if (slot >= 0) place(id, slot);
  }
  const fixedTiles = <>{(props.fixedTiles ?? []).map((tile) => <span key={tile.id} className="rounded-xl bg-amber-100 px-4 py-3 font-black text-amber-950">{tile.text}</span>)}</>;
  const placedTiles = <>{placed.map((id, index) => id ? <button key={`placed-${index}`} type="button" onClick={() => remove(index)} aria-label={`Remove ${props.tiles.find((tile) => tile.id === id)?.text ?? "word part"} from block ${index + 1}`} className="min-h-14 rounded-2xl bg-cyan-100 px-4 py-3 text-lg font-black text-cyan-950 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80">{props.tiles.find((tile) => tile.id === id)?.text}</button> : <button key={`slot-${index}`} ref={(node) => { slotRefs.current[index] = node; }} type="button" onClick={() => selected ? place(selected, index) : setAnnouncement("Choose a word-part block from the bank first.")} aria-label={selected ? `Place ${props.tiles.find((tile) => tile.id === selected)?.text ?? "selected word part"} in block ${index + 1}` : `Empty word-part block ${index + 1}`} className={`grid min-h-14 min-w-24 place-items-center rounded-2xl border-2 border-dashed px-4 py-3 text-sm font-black ${selected ? "border-amber-300 bg-amber-100/20 text-amber-100" : "border-cyan-300/70 bg-slate-950/40 text-cyan-100"}`}>{selected ? "Place here" : `Block ${index + 1}`}</button>)}</>;

  return <div className="grid gap-4">
    <div className="flex flex-wrap justify-center gap-3">{available.map((tile) => <DraggableTile key={tile.id} {...tile} selected={selected === tile.id} recallNeutral={props.recallNeutral} muted={props.muted} onSelect={(id) => { playInteractionSound("select", props.muted); setSelected(id); }} onDrop={pointerDrop} />)}</div>
    <div aria-label={props.label} className="flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-cyan-300/60 bg-slate-950/40 p-4 text-white">
      {props.fixedTilesPosition === "before" ? <>{fixedTiles}{placedTiles}</> : <>{placedTiles}{fixedTiles}</>}
    </div>
    {manual && full && !completed ? <button type="button" onClick={() => check(placed as string[])} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Check my word</button> : null}
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </div>;
}
