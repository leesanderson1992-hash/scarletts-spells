"use client";

import { useState, type ReactNode } from "react";

import {
  SnapRail,
  type RailTile,
  type SnapRailJoinKind,
  type SnapRailProgress,
} from "./snap-rail";

export interface DefinitionWordBuilderProps {
  targetId: string;
  stepLabel?: string;
  definition: string;
  tiles: RailTile[];
  expectedIds: string[];
  joins?: readonly SnapRailJoinKind[];
  fixedTiles?: RailTile[];
  fixedTilesPosition?: "before" | "after";
  label: string;
  wordSum: string;
  resultingMeaning: string;
  continueLabel: string;
  muted?: boolean;
  initialProgress?: SnapRailProgress;
  renderIncorrectFeedback?: (ids: string[], missCount: number) => ReactNode;
  onProgress?: (progress: SnapRailProgress) => void;
  onBuilt?: (word: string) => void;
  onContinue: () => void;
}

export function DefinitionWordBuilder(props: DefinitionWordBuilderProps) {
  const [completedWord, setCompletedWord] = useState<string | null>(() => props.initialProgress?.completed ? "restored" : null);
  const [missCount, setMissCount] = useState(0);
  const [feedback, setFeedback] = useState<ReactNode>(null);
  return <section className="grid gap-5 text-center" data-definition-word-builder={props.targetId}>
    {props.stepLabel ? <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p> : null}
    <div>
      <p className="text-sm font-black uppercase tracking-[.16em] text-cyan-200">Build from the meaning</p>
      <h2 className="mt-2 text-3xl font-black text-white">Which word means “{props.definition}”?</h2>
    </div>
    <SnapRail
      tiles={props.tiles}
      expectedIds={props.expectedIds}
      joins={props.joins}
      fixedTiles={props.fixedTiles}
      fixedTilesPosition={props.fixedTilesPosition}
      checkMode="manual"
      label={props.label}
      muted={props.muted}
      initialProgress={props.initialProgress}
      onProgress={props.onProgress}
      onComplete={(word) => {
        setCompletedWord(word);
        setFeedback(null);
        props.onBuilt?.(word);
      }}
      onInvalid={(ids) => {
        const nextMissCount = missCount + 1;
        setMissCount(nextMissCount);
        setFeedback(props.renderIncorrectFeedback?.(ids, nextMissCount) ?? "That word is not ready yet. Move the parts and check again.");
      }}
    />
    <div aria-live="polite" className="min-h-6 text-center font-semibold text-cyan-100">{feedback}</div>
    {completedWord ? <section className="grid gap-3 rounded-3xl border border-emerald-300/40 bg-emerald-100/10 p-5 text-left" aria-label="Completed word and meaning">
      <div>
        <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">Completed word sum</p>
        <p className="mt-1 text-xl font-black text-white">{props.wordSum}</p>
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">Meaning</p>
        <p className="mt-1 text-lg font-semibold text-emerald-50">{props.resultingMeaning}</p>
      </div>
      <button type="button" onClick={props.onContinue} className="mt-1 min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">{props.continueLabel}</button>
    </section> : null}
  </section>;
}
