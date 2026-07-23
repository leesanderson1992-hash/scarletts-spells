"use client";

import { useEffect, useState } from "react";
import type { DynamicPrefixLessonPayloadV2 } from "@/lib/adle/morphology/dynamic-prefix-word-lab";

/** Staging-only, client-local proof renderer. It never submits or schedules. */
export function DynamicPrefixStagingLab(props: { payload: DynamicPrefixLessonPayloadV2 }) {
  const key = `adle:dynamic-prefix-proof:${props.payload.contentVersion}:${props.payload.authenticCanonicalWordIds.join(",")}`;
  const [index, setIndex] = useState(0);
  const [sentence, setSentence] = useState("");
  const [reflection, setReflection] = useState("");
  const word = props.payload.words.lesson[index];
  const dictation = props.payload.activities.dictation[index];
  useEffect(() => {
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try { const state = JSON.parse(saved) as { index?: number; reflection?: string }; setIndex(Math.max(0, Math.min(3, state.index ?? 0))); setReflection(state.reflection ?? ""); } catch { /* corrupt proof state is disposable */ }
    }
  }, [key]);
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify({ index, reflection })); }, [index, key, reflection]);
  return <section className="brand-card grid gap-5 rounded-3xl p-5 md:p-7">
    <div><p className="brand-eyebrow">Staging proof · Dynamic Prefix Word Lab</p><h1 className="mt-1 text-2xl font-semibold text-[color:var(--ink)]">Explore {word.prefixLabel}</h1><p className="mt-2 text-sm text-[color:var(--mid)]">This staging-only route does not replace the fixed un- Word Lab or write learning evidence.</p></div>
    <div className="rounded-3xl bg-cyan-50 p-5 text-center text-cyan-950"><p className="text-sm font-bold">Word {index + 1} of 4</p><p className="mt-2 text-4xl font-black">{word.displayWord}</p><p className="mt-3 text-lg"><span className="font-black text-cyan-700">{word.prefixText}</span> + <span className="font-black text-amber-700">{word.baseWord}</span></p><p className="mt-2 text-sm">{word.derivedMeaning}</p></div>
    <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">Dictation: {dictation.sentence}<textarea value={sentence} onChange={(event) => setSentence(event.target.value)} className="min-h-24 rounded-2xl border border-[var(--border)] p-3" /></label>
    <div className="flex gap-3"><button type="button" className="brand-secondary-btn flex-1" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>Previous</button><button type="button" className="brand-primary-btn flex-1" onClick={() => { setSentence(""); setIndex((current) => Math.min(3, current + 1)); }}>{index === 3 ? "Review words" : "Next word"}</button></div>
    {index === 3 ? <label className="grid gap-2 text-sm font-semibold text-[color:var(--ink)]">How did the prefixes change the meanings?<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} className="min-h-24 rounded-2xl border border-[var(--border)] p-3" /></label> : null}
  </section>;
}
