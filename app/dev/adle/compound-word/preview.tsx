"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { CompoundWordLessonPayloadV2 } from "@/lib/adle/morphology/compound-word-lesson-v2";
import { closedCompoundResumeKey } from "@/lib/adle/morphology/closed-compound-resume";

const PREVIEW_ID = "dev-closed-compound-word-introduction";
const CompoundWordGuidedLesson = dynamic(
  () => import("@/components/adle/morphology/closed-compound-guided-lesson").then((module) => module.CompoundWordGuidedLesson),
  { ssr: false, loading: () => <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the compound-word Word Lab…</div> },
);

export function CompoundWordPreview(props: { payload: CompoundWordLessonPayloadV2 }) {
  const [run, setRun] = useState(0);
  const [reflection, setReflection] = useState<string | null>(null);
  function restart() {
    try { window.localStorage.removeItem(`${closedCompoundResumeKey(PREVIEW_ID, props.payload.contentVersion)}:v2`); } catch { /* A fresh client render still works. */ }
    setReflection(null);
    setRun((value) => value + 1);
  }
  if (reflection !== null) return <section className="brand-card mx-auto grid max-w-3xl gap-4 rounded-3xl p-8 text-center"><p className="brand-eyebrow">Development preview complete</p><h1 className="text-3xl font-black text-[color:var(--ink)]">You finished the compound-word Word Lab! 🎉</h1><p className="text-[color:var(--mid)]">This local preview did not submit, score, schedule, or save learning evidence.</p><button type="button" className="brand-primary-btn mx-auto" onClick={restart}>Try the preview again</button></section>;
  return <div className="mx-auto grid max-w-4xl gap-4"><div className="flex flex-wrap gap-3"><button type="button" className="brand-secondary-btn" onClick={restart}>Restart preview</button><p className="self-center text-sm text-[color:var(--mid)]">Development-only; uses the compound-word lesson renderer.</p></div><CompoundWordGuidedLesson key={run} childId="preview-child" assignmentId={PREVIEW_ID} items={[]} payload={props.payload} onPreviewComplete={setReflection} /></div>;
}
