"use client";

import { useEffect, useState } from "react";
import { CallItToDinnerActivity } from "@/components/adle/word-lab/call-it-to-dinner-activity";
import type { DinnerActivityConfigV1 } from "@/lib/adle/word-lab/call-it-to-dinner";

const STORAGE_KEY = "adle:call-it-to-dinner:preview-v1";

export function DinnerPreview({ config }: { config: DinnerActivityConfigV1 }) {
  const [ready, setReady] = useState(false);
  const [initialState, setInitialState] = useState<unknown>(null);
  const [muted, setMuted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setInitialState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); } catch { setInitialState(null); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="mx-auto grid max-w-6xl gap-5 px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow">
      <div><p className="text-xs font-black uppercase tracking-widest text-cyan-800">ADLE activity preview</p><h1 className="text-2xl font-black text-slate-900">Call It to Dinner</h1></div>
      <div className="flex gap-2"><button type="button" className="brand-secondary-btn" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? "Sound off" : "Sound on"}</button>
      <button type="button" className="brand-secondary-btn" onClick={() => { localStorage.removeItem(STORAGE_KEY); setInitialState(null); setComplete(false); setRevision((n) => n + 1); }}>Start again</button></div>
    </div>
    {complete ? <div role="status" className="rounded-2xl bg-emerald-100 p-6 font-bold text-emerald-950">Preview finished. The answers were guided; no spelling result, schedule or reward was saved.</div>
      : ready && <CallItToDinnerActivity key={revision} config={config} initialState={initialState} previewCandidate muted={muted}
        onStateChange={(state) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Preview still works. */ } }}
        onComplete={() => { setComplete(true); localStorage.removeItem(STORAGE_KEY); }} />}
    <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
      <strong>Editorial gate:</strong> word recordings are owner-approved, but the Dinner syllable cuts, complete target spans, and pronunciation IDs are still candidates. The live activity accepts only approved annotations. This preview includes <em>sofa</em>, <em>dinner</em>, <em>player</em>, and <em>different</em>; <em>brochure</em> remains excluded.
    </aside>
  </main>;
}
