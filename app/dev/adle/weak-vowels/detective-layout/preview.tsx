"use client";

import { useMemo, useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { WeakVowelGuidedLesson } from "@/components/adle/weak-vowel/weak-vowel-guided-lesson";
import { WEAK_VOWEL_PREVIEW_SKILLS, weakVowelPreviewLesson } from "@/lib/adle/weak-vowel/preview-fixture";
import { initialWeakVowelProgress } from "@/lib/adle/weak-vowel/progress";
import type { WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";

export function DetectiveLayoutPreview() {
  const [skill, setSkill] = useState<WeakVowelMicroSkill>("D4_SCHWA_FINAL_ER_FINAL");
  const [wordIndex, setWordIndex] = useState(4);
  const [revision, setRevision] = useState(1);
  const lesson = useMemo(() => weakVowelPreviewLesson(skill, revision), [skill, revision]);
  const initialProgress = useMemo(() => ({ ...initialWeakVowelProgress(lesson), stageId: "activity:detective" as const,
    detectiveState: { index: wordIndex, words: {} } }), [lesson, wordIndex]);

  return <main className="adle-preview-config brand-page min-h-screen px-2 py-2">
    <section className="adle-preview-settings brand-card mx-auto mb-2 flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-3 py-2" aria-label="Vowel Detective lesson preview settings">
      <div className="mr-auto"><h1 className="text-lg font-black">Vowel Detective · ADLE lesson preview</h1><p className="text-xs">Option 3 in light and dark · candidate content · no learner evidence written</p></div>
      <label className="grid gap-1 text-xs font-bold">Micro-skill<select aria-label="Micro-skill" className="brand-input min-h-11 rounded-xl p-2" value={skill} onChange={(event) => { setSkill(event.target.value as WeakVowelMicroSkill); setWordIndex(0); }}>
        {WEAK_VOWEL_PREVIEW_SKILLS.map((key) => <option key={key} value={key}>{key.replace("D4_SCHWA_", "").replaceAll("_", " ")}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs font-bold">Preview word<select aria-label="Preview word" className="brand-input min-h-11 rounded-xl p-2" value={wordIndex} onChange={(event) => { setWordIndex(Number(event.target.value)); setRevision((value) => value + 1); }}>
        {lesson.words.map((word, index) => <option key={word.canonicalWordId} value={index}>{word.spelling}{word.detective.family ? " · family" : ""}</option>)}
      </select></label>
      <button type="button" className="brand-button min-h-11 rounded-xl px-3" onClick={() => setRevision((value) => value + 1)}>Restart Detective</button>
      <PreviewThemeControl />
    </section>
    <WeakVowelGuidedLesson key={lesson.assignmentKey} lesson={lesson} initialProgress={initialProgress} fixtureMode onFinish={async () => undefined} />
  </main>;
}
