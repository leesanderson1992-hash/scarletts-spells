"use client";

import { useState } from "react";
import { LatinRootLessonTemplate } from "@/components/adle/morphology/latin-root-lesson-template";
import { latinRootPreviewContent } from "@/lib/adle/morphology/latin-root-preview-fixture";
import { PreviewThemeControl } from "../preview/preview-theme-control";

export function LatinRootsPreview({ initialStage = "learn" }: { initialStage?: "learn" | "spell" }) {
  const [start, setStart] = useState(initialStage);
  const [families, setFamilies] = useState<1 | 2>(2);
  const [count, setCount] = useState<5 | 6>(6);
  const [run, setRun] = useState(0);
  return <main className="brand-shell min-h-screen p-2"><div className="mx-auto grid max-w-[1500px] gap-2">
    <details className="brand-card rounded-xl px-3 py-1"><summary className="text-sm font-bold">Latin Roots · preview settings</summary><div className="grid gap-3 py-3"><p>Illustrative sample content awaiting dictionary review. This preview does not assign, save or score learner evidence.</p><div className="flex flex-wrap items-center gap-4"><label>Families <select className="brand-input" value={families} onChange={event => setFamilies(Number(event.target.value) as 1 | 2)}><option value={1}>One · PORT</option><option value={2}>Two · PORT + STRUCT</option></select></label><label>Words <select className="brand-input" value={count} onChange={event => setCount(Number(event.target.value) as 5 | 6)}><option value={5}>5</option><option value={6}>6</option></select></label><button type="button" className="brand-secondary-btn" onClick={() => { setStart("learn"); setRun(previous => previous + 1); }}>Restart preview</button><button type="button" className="brand-secondary-btn" onClick={event => { setStart("spell"); setRun(previous => previous + 1); const settings = event.currentTarget.closest("details"); if (settings) settings.open = false; }}>Open Spell Class</button></div><PreviewThemeControl /></div></details>
    <LatinRootLessonTemplate key={`${families}-${count}-${run}`} previewStart={start} content={latinRootPreviewContent(families, count)} />
  </div></main>;
}
