"use client";

import { useState } from "react";

import { CommonWordLabShell } from "@/components/adle/word-lab/common-word-lab-shell";
import type { CompiledWordLabSnapshotV1, WordLabCompletionEnvelopeV1 } from "@/lib/adle/word-lab/contracts";
import { wordLabResumeKey } from "@/lib/adle/word-lab/resume";

export function CommonWordLabPreview(props: { snapshot: CompiledWordLabSnapshotV1 }) {
  const [run, setRun] = useState(0);
  const [completion, setCompletion] = useState<WordLabCompletionEnvelopeV1 | null>(null);

  function restart() {
    try { window.localStorage.removeItem(wordLabResumeKey(props.snapshot.assignmentId)); } catch { /* Fresh render still works. */ }
    setCompletion(null);
    setRun((value) => value + 1);
  }

  if (completion) {
    return (
      <section className="brand-card mx-auto grid max-w-3xl gap-4 rounded-3xl p-8 text-center">
        <p className="brand-eyebrow">Development preview complete</p>
        <h1 className="text-3xl font-black text-[color:var(--ink)]">Common Word Lab finished 🎉</h1>
        <p className="text-[color:var(--mid)]">This fixture did not score, submit, schedule, reward, or save learning evidence.</p>
        <p className="rounded-2xl bg-cyan-50 p-4 text-cyan-950">{completion.activityResults.length} typed activity results were collected for server validation.</p>
        <button type="button" className="brand-primary-btn mx-auto" onClick={restart}>Try the preview again</button>
      </section>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="brand-secondary-btn" onClick={restart}>Restart preview</button>
        <p className="text-sm text-[color:var(--mid)]">Development-only; immutable fixture; no remote writes.</p>
      </div>
      <CommonWordLabShell key={run} snapshot={props.snapshot} onComplete={setCompletion} />
    </div>
  );
}
