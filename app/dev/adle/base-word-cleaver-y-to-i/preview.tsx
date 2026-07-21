"use client";

import { useState } from "react";

import { BaseWordCleaver } from "@/components/adle/activities/shared";

const EXAMPLES = [
  { id: "happiness", word: "happiness", base: "happi", suffix: "ness", sourceBase: "happy" },
  { id: "tried", word: "tried", base: "tri", suffix: "ed", sourceBase: "try" },
  { id: "babies", word: "babies", base: "babi", suffix: "es", sourceBase: "baby" },
] as const;

/** Development-only probe using the exact approved y-to-i base/surface pairs. */
export function BaseWordCleaverYToIPreview() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [cuts, setCuts] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [finished, setFinished] = useState(false);
  const example = EXAMPLES[exampleIndex];
  function choose(index: number) {
    setExampleIndex(index); setRun((value) => value + 1); setCuts([]); setMisses(0); setFinished(false);
  }
  return <section className="mx-auto grid max-w-4xl gap-5"><header className="brand-card rounded-3xl p-6"><p className="brand-eyebrow">Development-only Cleaver check</p><h1 className="mt-2 text-3xl font-black text-[color:var(--ink)]">Restore the y after chopping</h1><p className="mt-2 text-[color:var(--mid)]">These are the approved staging pairs for happiness, tried, and babies. Nothing here assigns, scores, or saves a lesson.</p><div className="mt-4 flex flex-wrap gap-2">{EXAMPLES.map((candidate, index) => <button key={candidate.id} type="button" onClick={() => choose(index)} className={`min-h-11 rounded-full px-5 font-black ${index === exampleIndex ? "bg-cyan-700 text-white" : "bg-cyan-100 text-cyan-950"}`}>{candidate.word}</button>)}</div></header>{finished ? <section className="brand-card rounded-3xl p-8 text-center"><p className="text-2xl font-black text-[color:var(--ink)]">{example.sourceBase} restored correctly.</p><button type="button" className="brand-primary-btn mt-4" onClick={() => choose(exampleIndex)}>Try again</button></section> : <BaseWordCleaver key={`${example.id}:${run}`} word={example.word} segments={[{ id: "base", text: example.base }, { id: "suffix", text: example.suffix }]} baseIndex={0} finalYRestoration={{ sourceText: example.sourceBase, surfaceText: example.base, explanation: "Change the final i back to y before you add the ending." }} selectedCuts={cuts} misses={misses} onCutsChange={setCuts} onMiss={setMisses} onContinue={() => setFinished(true)} />}</section>;
}
