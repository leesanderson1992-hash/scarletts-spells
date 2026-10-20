"use client";

import { useEffect, useState } from "react";
import { FamilyTreeDetectiveActivity } from "@/components/adle/word-lab/family-tree-detective-activity";
import type { DetectiveActivityConfigV1 } from "@/lib/adle/word-lab/family-tree-detective";

const STORAGE_KEY = "adle:family-tree-detective:preview-v1";

export function DetectivePreview({ config }: { config: DetectiveActivityConfigV1 }) {
  const [ready, setReady] = useState(false);
  const [initialState, setInitialState] = useState<unknown>(null);
  const [muted, setMuted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        setInitialState(saved);
        setProgress(Number.isInteger(saved?.index) ? saved.index : 0);
      } catch { setInitialState(null); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="adle-presentation generic-word-lab mx-auto grid w-full max-w-4xl gap-5">
    <header className="brand-card grid gap-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="brand-eyebrow">ADLE activity preview</p><h1 className="text-2xl font-black text-[color:var(--ink)]">Family Tree Detective</h1></div>
        <div className="flex gap-2">
          <button type="button" className="brand-secondary-btn" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? "Sound off" : "Sound on"}</button>
          <button type="button" className="brand-secondary-btn" onClick={() => { localStorage.removeItem(STORAGE_KEY); setInitialState(null); setComplete(false); setProgress(0); setRevision((n) => n + 1); }}>Start again</button>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-cyan-100" aria-label={`${complete ? config.rounds.length : progress} of ${config.rounds.length} words complete`}>
        <div className="h-full bg-cyan-500 transition-[width] motion-reduce:transition-none" style={{ width: `${((complete ? config.rounds.length : progress) / config.rounds.length) * 100}%` }} />
      </div>
    </header>
    {complete ? <div role="status" className="rounded-2xl bg-emerald-100 p-6 font-bold text-emerald-950">Preview finished. These guided answers created no proficiency, schedule or reward.</div>
      : ready && <section className="brand-card rounded-3xl p-6 sm:p-8"><FamilyTreeDetectiveActivity key={revision} config={config} initialState={initialState} previewCandidate muted={muted}
        onStateChange={(state) => { setProgress(state.index); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Preview remains usable. */ } }}
        onComplete={() => { setComplete(true); localStorage.removeItem(STORAGE_KEY); }} /></section>}
    <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><strong>Editorial gate:</strong> these words reuse owner-approved British word clips, but target bindings and family links are candidates. Relatives without reviewed clips are marked unavailable. Live lessons require the separate sheet decisions and governed family authority.</aside>
  </main>;
}
