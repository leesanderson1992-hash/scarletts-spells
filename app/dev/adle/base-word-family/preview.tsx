"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { BaseWordFamilyLessonSnapshotV1 } from "@/lib/adle/morphology/base-word-family-payload";
import { baseWordFamilyResumeKey } from "@/lib/adle/morphology/base-word-family-resume";

const PREVIEW_ID = "dev-base-word-family";
const BaseWordFamilyGuidedLesson = dynamic(
  () => import("@/components/adle/morphology/base-word-family-guided-lesson").then((module) => module.BaseWordFamilyGuidedLesson),
  { ssr: false, loading: () => <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div> },
);

export function BaseWordFamilyPreview(props: { payload: BaseWordFamilyLessonSnapshotV1 }) {
  const [run, setRun] = useState(0);
  const [reflection, setReflection] = useState<string | null>(null);
  function restart() {
    try { window.localStorage.removeItem(baseWordFamilyResumeKey(PREVIEW_ID, props.payload.contentVersion)); } catch { /* A fresh client render still works. */ }
    setReflection(null);
    setRun((value) => value + 1);
  }
  if (reflection !== null) return <section className="brand-card mx-auto grid max-w-3xl gap-4 rounded-3xl p-8 text-center"><p className="brand-eyebrow">Development preview complete</p><h1 className="text-3xl font-black text-[color:var(--ink)]">You finished the base-word Word Lab! 🎉</h1><p className="text-[color:var(--mid)]">This local preview did not submit, score, schedule, or save learning evidence.</p><blockquote className="rounded-2xl bg-cyan-50 p-4 text-cyan-950">{reflection}</blockquote><button type="button" className="brand-primary-btn mx-auto" onClick={restart}>Try the preview again</button></section>;
  return <div className="mx-auto grid max-w-4xl gap-4"><div className="flex flex-wrap gap-3"><button type="button" className="brand-secondary-btn" onClick={restart}>Restart preview</button><p className="self-center text-sm text-[color:var(--mid)]">Development-only; reviewed-content-shaped fixture.</p></div><BaseWordFamilyGuidedLesson key={run} previewId={PREVIEW_ID} payload={props.payload} onPreviewComplete={setReflection} /></div>;
}
