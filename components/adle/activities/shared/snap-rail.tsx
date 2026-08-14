"use client";

import { useMemo, useRef, useState } from "react";
import { DraggableTile } from "./draggable-tile";
import { INTERACTION_MOTION } from "./motion";
import {
  orderedBuildTargetIsCorrect,
  useOrderedBuildEngine,
  type OrderedBuildTarget,
} from "./ordered-build-engine";
import { playInteractionSound } from "./sound";

export interface RailTile { id: string; text: string; role?: "prefix" | "base" | "root" | "suffix" | "connector"; gloss?: string }

export type SnapRailJoinKind = "none" | "space" | "hyphen";

export interface SnapRailProgress {
  placedIds: Array<string | null>;
  completed: boolean;
}

function separator(kind: SnapRailJoinKind): string {
  return kind === "space" ? " " : kind === "hyphen" ? "-" : "";
}

export function assembleSnapRailWord(
  components: readonly string[],
  joins: readonly SnapRailJoinKind[] = [],
): string | null {
  if (components.length === 0) return null;
  const governedJoins = joins.length === 0
    ? Array.from({ length: components.length - 1 }, () => "none" as const)
    : joins;
  if (
    governedJoins.length !== components.length - 1
    || governedJoins.some((join) => !["none", "space", "hyphen"].includes(join))
  ) return null;
  return components.reduce((word, component, index) =>
    index === 0 ? component : `${word}${separator(governedJoins[index - 1])}${component}`, "");
}

export function SnapRail(props: {
  tiles: RailTile[];
  expectedIds: string[];
  joins?: readonly SnapRailJoinKind[];
  fixedTiles?: RailTile[];
  fixedTilesPosition?: "before" | "after";
  label: string;
  recallNeutral?: boolean;
  muted?: boolean;
  checkMode?: "automatic" | "manual";
  initialProgress?: SnapRailProgress;
  onProgress?: (progress: SnapRailProgress) => void;
  onComplete?: (word: string) => void;
  onInvalid?: (ids: string[]) => void;
}) {
  const target = useMemo<OrderedBuildTarget>(() => ({ id: "snap-rail", expectedPieceIds: props.expectedIds }), [props.expectedIds]);
  const initialSnapshot = useMemo(() => props.initialProgress ? {
    placements: { [target.id]: props.initialProgress.placedIds },
    completedTargetIds: props.initialProgress.completed ? [target.id] : [],
  } : undefined, [props.initialProgress, target.id]);
  const engine = useOrderedBuildEngine({
    targets: [target],
    pieceIds: props.tiles.map((tile) => tile.id),
    initialSnapshot,
    onProgress: props.onProgress ? (snapshot) => props.onProgress?.({
      placedIds: snapshot.placements[target.id],
      completed: snapshot.completedTargetIds.includes(target.id),
    }) : undefined,
  });
  const [announcement, setAnnouncement] = useState("");
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const placed = engine.snapshot.placements[target.id];
  const completed = engine.snapshot.completedTargetIds.includes(target.id);
  const available = completed ? [] : props.tiles.filter((tile) => engine.availablePieceIds.includes(tile.id));
  const full = placed.every((id) => id !== null);
  const manual = props.checkMode === "manual";

  function wordFrom(ids: string[]) {
    const placedText = ids.map((id) => props.tiles.find((tile) => tile.id === id)?.text ?? "");
    const fixedText = (props.fixedTiles ?? []).map((tile) => tile.text);
    return assembleSnapRailWord(
      props.fixedTilesPosition === "before" ? [...fixedText, ...placedText] : [...placedText, ...fixedText],
      props.joins,
    );
  }
  function check(ids: string[]) {
    if (orderedBuildTargetIsCorrect(target, ids)) {
      const word = wordFrom(ids);
      if (word === null) {
        setAnnouncement("This word-part configuration is incomplete.");
        props.onInvalid?.(ids);
        return false;
      }
      engine.completeTarget(target.id);
      setAnnouncement("Word parts joined successfully");
      playInteractionSound("fusion", props.muted);
      props.onComplete?.(word);
      return true;
    }
    setAnnouncement(manual ? "That word is not ready yet. Move the blocks and try again." : "Those parts make a different combination");
    playInteractionSound("resist", props.muted);
    props.onInvalid?.(ids);
    return false;
  }
  function place(id: string, slot: number) {
    if (completed || placed[slot] !== null || !engine.availablePieceIds.includes(id)) return;
    const next = placed.map((value, index) => index === slot ? id : value);
    engine.placePiece(id, target.id, slot);
    const tileLabel = props.tiles.find((tile) => tile.id === id)?.text ?? "Word part";
    if (next.every((value) => value !== null)) {
      const ids = next as string[];
      if (manual) setAnnouncement("All blocks are in place. Check your word when you are ready.");
      else if (!check(ids)) engine.resetTarget(target.id);
    } else {
      setAnnouncement(`${tileLabel} placed in position ${slot + 1}`);
      playInteractionSound("snap", props.muted);
    }
  }
  function remove(slot: number) {
    const id = placed[slot];
    if (completed || !id) return;
    engine.liftPiece(target.id, slot);
    setAnnouncement(`${props.tiles.find((tile) => tile.id === id)?.text ?? "Word part"} ready to move`);
    playInteractionSound("select", props.muted);
  }
  function pointerDrop(id: string, point: { x: number; y: number }) {
    const slot = slotRefs.current.findIndex((node, index) => {
      if (!node || placed[index] !== null) return false;
      const rect = node.getBoundingClientRect();
      return point.x >= rect.left - INTERACTION_MOTION.snapDistancePx
        && point.x <= rect.right + INTERACTION_MOTION.snapDistancePx
        && point.y >= rect.top - INTERACTION_MOTION.snapDistancePx
        && point.y <= rect.bottom + INTERACTION_MOTION.snapDistancePx;
    });
    if (slot >= 0) place(id, slot);
  }
  const fixedTiles = <>{(props.fixedTiles ?? []).map((tile) => <span key={tile.id} className="rounded-xl bg-amber-100 px-4 py-3 font-black text-amber-950">{tile.text}</span>)}</>;
  const placedTiles = <>{placed.map((id, index) => <span key={`rail-${index}`} className="contents">{index > 0 && props.joins ? <span aria-hidden="true" className="text-2xl font-black text-amber-200">{separator(props.joins[index - 1]) || <span className="sr-only">joined</span>}</span> : null}{id ? <button type="button" onClick={() => remove(index)} aria-label={`Move ${props.tiles.find((tile) => tile.id === id)?.text ?? "word part"} from block ${index + 1}`} className="min-h-14 rounded-2xl bg-cyan-100 px-4 py-3 text-lg font-black text-cyan-950 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80">{props.tiles.find((tile) => tile.id === id)?.text}</button> : <button ref={(node) => { slotRefs.current[index] = node; }} type="button" onClick={() => engine.selectedPieceId ? place(engine.selectedPieceId, index) : setAnnouncement("Choose a word-part block from the bank first.")} aria-label={engine.selectedPieceId ? `Place ${props.tiles.find((tile) => tile.id === engine.selectedPieceId)?.text ?? "selected word part"} in block ${index + 1}` : `Empty word-part block ${index + 1}`} className={`grid min-h-14 min-w-24 place-items-center rounded-2xl border-2 border-dashed px-4 py-3 text-sm font-black ${engine.selectedPieceId ? "border-amber-300 bg-amber-100/20 text-amber-100" : "border-cyan-300/70 bg-slate-950/40 text-cyan-100"}`}>{engine.selectedPieceId ? "Place here" : `Block ${index + 1}`}</button>}</span>)}</>;

  return <div className="grid gap-4">
    <div className="flex flex-wrap justify-center gap-3">{available.map((tile) => <DraggableTile key={tile.id} {...tile} selected={engine.selectedPieceId === tile.id} recallNeutral={props.recallNeutral} muted={props.muted} onSelect={(id) => { playInteractionSound("select", props.muted); engine.selectPiece(id); }} onDrop={pointerDrop} />)}</div>
    <div aria-label={props.label} className="flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-cyan-300/60 bg-slate-950/40 p-4 text-white">
      {props.fixedTilesPosition === "before" ? <>{fixedTiles}{placedTiles}</> : <>{placedTiles}{fixedTiles}</>}
    </div>
    {manual && full && !completed ? <button type="button" onClick={() => check(placed as string[])} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Check my word</button> : null}
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </div>;
}
