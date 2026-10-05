"use client";

import { useEffect, useRef, useState } from "react";
import type { DegreeTransformation, DegreeWord, SentenceGap } from "@/lib/adle/inflection/contracts";
import { SnapRail, type SnapRailProgress } from "./snap-rail";
import { DraggableTile } from "./draggable-tile";
import { playInteractionSound } from "./sound";
import { AnimatedSpellingChange } from "./spelling-transformation-reveal";

export interface SentenceSuffixBuilderProps {
  sentence: SentenceGap;
  baseWord: string;
  forms: readonly [DegreeWord, DegreeWord];
  transformations?: readonly [DegreeTransformation, DegreeTransformation];
  initialProgress?: { rail: SnapRailProgress; placed: boolean };
  stepLabel: string;
  muted?: boolean;
  onProgress?: (progress: { rail: SnapRailProgress; placed: boolean }) => void;
  onContinue: () => void;
}
/** WORD_ASSEMBLY.sentence_suffix@1. Rail/drag mechanics remain shared. */
export function SentenceSuffixBuilder(props: SentenceSuffixBuilderProps) {
  const [rail, setRail] = useState<SnapRailProgress>(props.initialProgress?.rail ?? { placedIds: [null], completed: false });
  const [placed, setPlaced] = useState(props.initialProgress?.placed ?? false);
  const [selected, setSelected] = useState(false);
  const [message, setMessage] = useState("");
  const [transformedWord, setTransformedWord] = useState<string | null>(null);
  const dropTarget = useRef<HTMLButtonElement>(null);
  const transformedTile = useRef<HTMLDivElement>(null);
  const degree = rail.placedIds[0] === "er" ? "comparative" : rail.placedIds[0] === "est" ? "superlative" : null;
  const formed = props.forms.find(f => f.degree === degree);
  const transformation = props.transformations?.find(t => t.result === formed?.word);
  const ready = !transformation || transformedWord === formed?.word;
  useEffect(() => {
    if (transformation && ready && !placed) transformedTile.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [transformation, ready, placed]);
  function place() {
    if (!formed || placed || !ready) return;
    if (formed.degree !== props.sentence.degree) {
      playInteractionSound("resist", props.muted);
      setMessage(props.sentence.degree === "comparative" ? "This compares two. Try -er. The word ‘than’ is a useful clue here." : "This compares a group of three or more. Try -est. The word ‘the’ is a useful clue here.");
      return;
    }
    setPlaced(true); setSelected(false); playInteractionSound("snap", props.muted);
    setMessage(props.sentence.degree === "comparative" ? "Correct — -er compares two in this sentence. Notice ‘than’." : "Correct — -est compares a group in this sentence. Notice ‘the’.");
    props.onProgress?.({ rail, placed: true });
  }
  function changeEnding() {
    const next = { placedIds: [null], completed: false };
    setRail(next); setSelected(false); setTransformedWord(null); setMessage("");
    props.onProgress?.({ rail: next, placed: false });
  }
  const draggableWord = formed ? <DraggableTile id="formed-word" text={formed.word} selected={selected} muted={props.muted}
    onSelect={() => setSelected(true)} onDrop={(_, point) => {
      const rect = dropTarget.current?.getBoundingClientRect();
      if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) place();
    }} /> : null;
  return <section className="grid gap-5 text-center" data-sentence-suffix-state={placed ? "complete" : "building"}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p>
    <h2 className="text-2xl font-black text-white">Choose an ending, then place your word</h2>
    {!placed && !transformation ? <SnapRail tiles={[{ id: "er", text: "er", role: "suffix" }, { id: "est", text: "est", role: "suffix" }]}
      fixedTiles={[{ id: "base", text: props.baseWord, role: "base" }]} fixedTilesPosition="before"
      expectedIds={[props.sentence.degree === "comparative" ? "er" : "est"]} checkMode="manual" showCheckControl={false}
      label="Add er or est to the base" muted={props.muted} initialProgress={rail}
      onProgress={next => { if (next.placedIds[0] !== rail.placedIds[0]) setTransformedWord(null); setRail(next); setSelected(false); props.onProgress?.({ rail: next, placed: false }); }} /> : null}
    {transformation && !placed ? <AnimatedSpellingChange key={transformation.result} transformation={transformation} direction="build" onComplete={() => setTransformedWord(transformation.result)} completedContent={<div ref={transformedTile} className="grid justify-center [&>button]:px-5 [&>button]:py-4 [&>button]:text-3xl sm:[&>button]:text-4xl">{draggableWord}</div>} /> : null}
    {formed && !placed && !transformation ? <div className="grid justify-center">{draggableWord}</div> : null}
    {formed && !placed && ready ? <p className="text-sm text-cyan-100">Drag it into the gap, or select it and tap the gap.</p> : null}
    <p className="rounded-3xl bg-white p-5 text-xl font-bold text-slate-950">
      {props.sentence.before}<button ref={dropTarget} type="button" disabled={placed || !selected}
        aria-label={placed ? "Word placed in sentence" : "Place the selected word in the sentence"} onClick={place}
        className="mx-1 inline-block min-h-12 min-w-32 rounded-xl border-2 border-dashed border-cyan-600 px-3 text-cyan-950 focus-visible:ring-4 focus-visible:ring-cyan-300">
        {placed ? formed?.word : "________"}
      </button>{props.sentence.after}
    </p>
    <p aria-live="polite" className="min-h-6 font-semibold text-cyan-100">{message}</p>
    {message && !placed && transformation ? <button type="button" onClick={changeEnding} className="mx-auto min-h-11 rounded-xl border border-cyan-300/50 px-4 font-bold text-cyan-100">Try another ending</button> : null}
    {placed ? <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Continue</button> : null}
  </section>;
}
