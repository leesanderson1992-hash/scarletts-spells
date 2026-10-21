"use client";

import { useMemo, useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { WeakVowelGuidedLesson } from "@/components/adle/weak-vowel/weak-vowel-guided-lesson";
import { weakVowelPreviewLesson } from "@/lib/adle/weak-vowel/preview-fixture";
import { initialWeakVowelProgress } from "@/lib/adle/weak-vowel/progress";

export function FinalErTeachingPreview() {
  const [page, setPage] = useState<2 | 3>(2);
  const [revision, setRevision] = useState(1);
  const lesson = useMemo(() => weakVowelPreviewLesson("D4_SCHWA_FINAL_ER_FINAL", revision), [revision]);
  const progress = useMemo(() => ({ ...initialWeakVowelProgress(lesson), teachingPageIndex: page - 1 }), [lesson, page]);
  function selectPage(next: 2 | 3) { setPage(next); setRevision((value) => value + 1); }
  return <main className="adle-preview-config brand-page min-h-screen px-2 py-2">
    <section className="adle-preview-settings brand-card mx-auto mb-2 flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-3 py-2" aria-label="Final er teaching preview settings">
      <div className="mr-auto"><h1 className="text-lg font-black">Final -er teaching pages · ADLE lesson</h1><p className="text-xs">Pages 2 and 3 in light and dark · local preview · no learner evidence written</p></div>
      <div className="flex gap-1" role="group" aria-label="Teaching page">
        <button type="button" className="brand-button min-h-11 rounded-xl px-3" aria-pressed={page === 2} onClick={() => selectPage(2)}>Page 2</button>
        <button type="button" className="brand-button min-h-11 rounded-xl px-3" aria-pressed={page === 3} onClick={() => selectPage(3)}>Page 3</button>
      </div>
      <PreviewThemeControl />
    </section>
    <WeakVowelGuidedLesson key={lesson.assignmentKey} lesson={lesson} initialProgress={progress} fixtureMode onFinish={async () => undefined} />
  </main>;
}
