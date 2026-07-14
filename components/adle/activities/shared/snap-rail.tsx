"use client";

import { useRef, useState } from "react";
import { DraggableTile } from "./draggable-tile";
import { INTERACTION_MOTION } from "./motion";
import { playInteractionSound } from "./sound";

export interface RailTile { id: string; text: string; role?: "prefix" | "base" | "root" | "suffix" | "connector"; gloss?: string }

export function SnapRail(props: { tiles: RailTile[]; expectedIds: string[]; fixedTiles?: RailTile[]; fixedTilesPosition?: "before" | "after"; label: string; recallNeutral?: boolean; muted?: boolean; onComplete?: (word: string) => void; onInvalid?: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const rail = useRef<HTMLDivElement>(null);
  const available = props.tiles.filter((tile) => !placed.includes(tile.id));
  function place(id: string) {
    const next = [...placed, id];
    if (next.length === props.expectedIds.length) {
      if (next.every((value, index) => value === props.expectedIds[index])) {
        const placedText = next.map((value) => props.tiles.find((tile) => tile.id === value)?.text ?? "");
        const fixedText = (props.fixedTiles ?? []).map((tile) => tile.text);
        setPlaced(next); setAnnouncement("Word parts joined successfully"); playInteractionSound("fusion", props.muted); props.onComplete?.((props.fixedTilesPosition === "before" ? [...fixedText, ...placedText] : [...placedText, ...fixedText]).join(""));
      } else { setAnnouncement("Those parts make a different combination"); props.onInvalid?.(next); setPlaced([]); }
    } else { setPlaced(next); setAnnouncement(`${id} placed in position ${next.length}`); playInteractionSound("snap", props.muted); }
    setSelected(null);
  }
  function pointerDrop(id: string, point: { x: number; y: number }) {
    const rect = rail.current?.getBoundingClientRect();
    if (rect && point.x >= rect.left - INTERACTION_MOTION.snapDistancePx && point.x <= rect.right + INTERACTION_MOTION.snapDistancePx && point.y >= rect.top - INTERACTION_MOTION.snapDistancePx && point.y <= rect.bottom + INTERACTION_MOTION.snapDistancePx) place(id);
  }
  const placedTiles = <>{placed.map((id) => <span key={id} className="rounded-xl bg-cyan-100 px-4 py-3 font-black text-cyan-950">{props.tiles.find((tile) => tile.id === id)?.text}</span>)}{selected && placed.length < props.expectedIds.length ? <button type="button" className="min-h-11 rounded-full bg-cyan-300 px-4 font-bold text-slate-950" onClick={() => place(selected)}>{props.fixedTiles?.length ? "Place prefix here" : "Place here"}</button> : null}</>;
  const fixedTiles = <>{(props.fixedTiles ?? []).map((tile) => <span key={tile.id} className="rounded-xl bg-amber-100 px-4 py-3 font-black text-amber-950">{tile.text}</span>)}</>;
  return <div className="grid gap-4"><div className="flex flex-wrap justify-center gap-3">{available.map((tile) => <DraggableTile key={tile.id} {...tile} selected={selected === tile.id} recallNeutral={props.recallNeutral} muted={props.muted} onSelect={(id) => setSelected(id)} onDrop={pointerDrop} />)}</div><div ref={rail} aria-label={props.label} className="flex min-h-24 flex-wrap items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-cyan-300 bg-slate-950/40 p-4 text-white">{props.fixedTilesPosition === "before" ? <>{fixedTiles}{placedTiles}</> : <>{placedTiles}{fixedTiles}</>}</div><p className="sr-only" aria-live="polite">{announcement}</p></div>;
}
