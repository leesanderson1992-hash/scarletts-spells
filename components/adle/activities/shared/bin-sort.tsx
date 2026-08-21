"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DraggableTile } from "./draggable-tile";
import { useReducedMotion } from "./motion";
import { playInteractionSound } from "./sound";

export interface SortItem { id: string; text: string; destination: string }
export interface SortBin { id: string; label: string; description?: string; prefixText?: string }
type CompletionCopy = { eyebrow?: string; title?: string; summary?: string; continueLabel?: string };
const SUCCESS_SPARKLES = [
  { glyph: "✦", left: "12%", top: "22%", delay: "0ms" },
  { glyph: "✧", left: "27%", top: "64%", delay: "70ms" },
  { glyph: "✦", left: "72%", top: "18%", delay: "110ms" },
  { glyph: "✧", left: "84%", top: "62%", delay: "40ms" },
  { glyph: "✦", left: "50%", top: "8%", delay: "150ms" },
] as const;

function canonicalPlacements(items: readonly SortItem[]): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.id, item.destination]));
}

export function BinSortOverview(props: { items: readonly SortItem[]; bins: readonly SortBin[]; placements?: Readonly<Record<string, string>>; copy?: CompletionCopy; showBinDescriptions?: boolean; onContinue?: () => void }) {
  const placements = props.placements ?? canonicalPlacements(props.items);
  const headingId = useId();
  return <section className="grid gap-5 text-center" aria-labelledby={headingId} data-testid="bin-sort-overview">
    <div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">{props.copy?.eyebrow ?? "Overview"}</p><h2 id={headingId} className="mt-1 text-3xl font-black text-white">{props.copy?.title ?? "You sorted every word"}</h2><p className="mt-2 font-semibold text-cyan-100">{props.copy?.summary ?? "Here is where each word belongs."}</p></div>
    <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="Completed word groups">
      {props.bins.map((bin, index) => { const words = props.items.filter((item) => placements[item.id] === bin.id); return <section key={bin.id} role="listitem" aria-labelledby={`bin-sort-overview-${bin.id}`} className={`rounded-2xl p-4 text-left ${index % 2 ? "bg-amber-100 text-amber-950" : "bg-cyan-100 text-cyan-950"}`}><h3 id={`bin-sort-overview-${bin.id}`} className="text-lg font-black">{bin.label}</h3>{props.showBinDescriptions !== false && bin.description ? <p className="mt-1 text-sm font-semibold opacity-80">{bin.description}</p> : null}<ul className="mt-3 flex flex-wrap gap-2" aria-label={`Words in ${bin.label}`}>{words.map((item) => <li key={item.id} className="rounded-full bg-white/70 px-3 py-1 font-black">{item.text}</li>)}</ul></section>; })}
    </div>
    {props.onContinue ? <button type="button" autoFocus onClick={props.onContinue} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200/70">{props.copy?.continueLabel ?? "Continue"}</button> : null}
  </section>;
}

export function BinSort(props: { items: SortItem[]; bins: SortBin[]; instruction?: string; feedbackPolicy?: "immediate" | "end_of_round"; muted?: boolean; incorrectMessage?: string; repeatedIncorrectMessage?: string; renderIncorrectFeedback?: (selected: SortBin) => ReactNode; initialComplete?: boolean; showOverview?: boolean; showBinDescriptions?: boolean; completionCopy?: CompletionCopy; onComplete?: (placements: Record<string, string>) => void; onContinue?: (placements: Record<string, string>) => void }) {
  const initiallyComplete = props.initialComplete === true;
  const [index, setIndex] = useState(initiallyComplete ? props.items.length : 0);
  const [placements, setPlacements] = useState<Record<string, string>>(initiallyComplete ? canonicalPlacements(props.items) : {});
  const [message, setMessage] = useState<ReactNode>("");
  const [misses, setMisses] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [complete, setComplete] = useState(initiallyComplete);
  const reducedMotion = useReducedMotion();
  const item = props.items[index];
  const binElements = useRef<Record<string, HTMLButtonElement | null>>({});
  const celebration = useRef<{ itemId: string; final: boolean; placements: Record<string, string> } | null>(null);
  const onComplete = useRef(props.onComplete);
  useEffect(() => { onComplete.current = props.onComplete; }, [props.onComplete]);
  useEffect(() => {
    if (!celebrating || !celebration.current) return;
    const result = celebration.current;
    const timer = window.setTimeout(() => {
      if (celebration.current?.itemId !== result.itemId) return;
      celebration.current = null;
      setCelebrating(false);
      if (result.final) { setComplete(true); onComplete.current?.(result.placements); }
      else { setIndex((current) => current + 1); setMessage(""); window.requestAnimationFrame(() => { const firstBin = props.bins[0]; if (firstBin) binElements.current[firstBin.id]?.focus(); }); }
    }, reducedMotion ? 220 : 520);
    return () => window.clearTimeout(timer);
  }, [celebrating, props.bins, reducedMotion]);

  function place(binId: string) {
    if (!item || celebrating || complete) return;
    playInteractionSound("select", props.muted);
    if (binId !== item.destination) {
      const nextMisses = misses + 1; setMisses(nextMisses); playInteractionSound("resist", props.muted);
      const selected = props.bins.find((candidate) => candidate.id === binId);
      setMessage(selected && props.renderIncorrectFeedback ? props.renderIncorrectFeedback(selected) : nextMisses > 1 ? props.repeatedIncorrectMessage ?? props.incorrectMessage ?? "That choice shows a different job. Try again." : props.incorrectMessage ?? "That choice shows a different job. Look at the word's meaning and try again.");
      return;
    }
    const next = { ...placements, [item.id]: binId }; const final = index + 1 === props.items.length;
    setPlacements(next); setMisses(0); setMessage(props.feedbackPolicy === "end_of_round" ? "Correct" : `${item.text} belongs with ${props.bins.find((candidate) => candidate.id === binId)?.label}.`); playInteractionSound(final ? "complete" : "snap", props.muted);
    celebration.current = { itemId: item.id, final, placements: next }; setCelebrating(true);
  }

  if (complete && props.showOverview !== false) return <BinSortOverview items={props.items} bins={props.bins} placements={placements} copy={props.completionCopy} showBinDescriptions={props.showBinDescriptions} onContinue={props.onContinue ? () => props.onContinue?.(placements) : undefined} />;
  if (!item) return <p className="text-center font-semibold text-cyan-50">All words placed.</p>;
  return <div className="grid gap-5" aria-busy={celebrating} data-testid="bin-sort-active">
    <p className="mx-auto max-w-xl text-center text-base font-semibold text-cyan-50">{props.instruction ?? "Read the word. Think about what the prefix means. Then choose the meaning label that fits."}</p>
    <p className="text-center text-xs font-black uppercase tracking-[.18em] text-cyan-200">Word {index + 1} of {props.items.length}</p>
    <div className="relative flex min-h-24 items-center justify-center overflow-hidden rounded-3xl"><DraggableTile id={item.id} text={item.text} role="base" onDrop={(_, point) => { const destination = props.bins.find((bin) => { const rect = binElements.current[bin.id]?.getBoundingClientRect(); return rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom; }); if (destination) place(destination.id); }} />{celebrating ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-live="polite" data-testid="bin-sort-success" data-reduced-motion={reducedMotion ? "true" : "false"}><span className="sr-only">Correct</span>{!reducedMotion ? <span aria-hidden="true" className="absolute inset-0">{SUCCESS_SPARKLES.map((sparkle, sparkleIndex) => <span key={sparkleIndex} className="absolute text-3xl text-amber-200 motion-safe:animate-[binSortSparkle_520ms_ease-out_both]" style={{ left: sparkle.left, top: sparkle.top, animationDelay: sparkle.delay }}>{sparkle.glyph}</span>)}</span> : null}<span aria-hidden="true" className={`relative text-7xl font-black leading-none text-emerald-300 drop-shadow-[0_0_14px_rgba(110,231,183,.85)] ${reducedMotion ? "" : "motion-safe:animate-[binSortTickZoom_420ms_cubic-bezier(.2,.9,.25,1.25)_both]"}`}>✓</span></div> : null}</div>
    <div role="group" aria-label={`Choose the meaning pattern for ${item.text}`} className="grid gap-3 sm:grid-cols-2">{props.bins.map((bin) => <button ref={(element) => { binElements.current[bin.id] = element; }} type="button" key={bin.id} disabled={celebrating} onClick={() => place(bin.id)} className="min-h-24 rounded-3xl border border-cyan-300/40 bg-cyan-300/10 p-4 text-left text-white hover:bg-cyan-300/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/40 disabled:cursor-default disabled:opacity-70"><span className="block text-lg font-black">{bin.label}</span>{props.showBinDescriptions !== false && bin.description ? <span className="mt-1 block text-sm font-semibold text-cyan-100">{bin.description}</span> : null}</button>)}</div>
    <p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-cyan-100">{message}</p>
  </div>;
}
