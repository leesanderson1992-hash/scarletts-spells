"use client";

import { useMemo, useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { WeakVowelGuidedLesson } from "@/components/adle/weak-vowel/weak-vowel-guided-lesson";
import { WEAK_VOWEL_PREVIEW_SKILLS, weakVowelPreviewLesson } from "@/lib/adle/weak-vowel/preview-fixture";
import { initialWeakVowelProgress } from "@/lib/adle/weak-vowel/progress";
import type { WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";
import { correctVowelTile } from "@/lib/adle/word-lab/family-tree-detective";

export function ReflectionLayoutPreview() {
  const [skill, setSkill] = useState<WeakVowelMicroSkill>("D4_SCHWA_FINAL_ER_FINAL");
  const [revision, setRevision] = useState(1);
  const [scenario, setScenario] = useState<"mistakes" | "all-correct">("mistakes");
  const lesson = useMemo(() => weakVowelPreviewLesson(skill, revision), [skill, revision]);
  const initialProgress = useMemo(() => {
    const first = lesson.words[0];
    const second = lesson.words[1];
    const third = lesson.words[2];
    return {
      ...initialWeakVowelProgress(lesson), stageId: "reflection" as const,
      coverAttempts: Object.fromEntries(lesson.words.map((word) => [word.canonicalWordId, scenario === "mistakes" && word === first ? word.spelling.slice(0, -1) : word.spelling])),
      dictationAttempts: Object.fromEntries(lesson.words.map((word) => [word.canonicalWordId, scenario === "mistakes" && word === second
        ? `${word.dictation.sentence.slice(0, word.dictation.targetStart)}${word.spelling.slice(0, -1)}${word.dictation.sentence.slice(word.dictation.targetEnd)}`
        : word.dictation.sentence])),
      dictationChecked: lesson.words.map((word) => word.canonicalWordId),
      dinnerResponse: { guided: true, words: lesson.words.map((word) => ({ canonicalWordId: word.canonicalWordId, cutMisses: scenario === "mistakes" && word === third ? 1 : 0, targetMisses: scenario === "mistakes" && word === third ? 1 : 0, answerRevealed: false })) },
      detectiveResponse: { guided: true, words: lesson.words.map((word) => ({ canonicalWordId: word.canonicalWordId,
        initialChoice: scenario === "mistakes" && word === first ? correctVowelTile(word.detective) === "A" ? "E" : "A" : correctVowelTile(word.detective),
        initialCorrect: !(scenario === "mistakes" && word === first), finalChoice: null, finalCorrect: null })) },
    };
  }, [lesson, scenario]);

  return <main className="adle-preview-config brand-page min-h-screen px-2 py-2">
    <section className="adle-preview-settings brand-card mx-auto mb-2 flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-3 py-2" aria-label="Reflection lesson preview settings">
      <div className="mr-auto"><h1 className="text-lg font-black">Reflection · ADLE lesson preview</h1><p className="text-xs">Frozen example attempts · no learner evidence written</p></div>
      <label className="grid gap-1 text-xs font-bold">Micro-skill<select aria-label="Micro-skill" className="brand-input min-h-11 rounded-xl p-2" value={skill} onChange={(event) => { setSkill(event.target.value as WeakVowelMicroSkill); setRevision((value) => value + 1); }}>
        {WEAK_VOWEL_PREVIEW_SKILLS.map((key) => <option key={key} value={key}>{key.replace("D4_SCHWA_", "").replaceAll("_", " ")}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs font-bold">Review state<select aria-label="Review state" className="brand-input min-h-11 rounded-xl p-2" value={scenario} onChange={(event) => { setScenario(event.target.value as "mistakes" | "all-correct"); setRevision((value) => value + 1); }}>
        <option value="mistakes">Incorrect attempts</option><option value="all-correct">All correct</option>
      </select></label>
      <PreviewThemeControl />
    </section>
    <WeakVowelGuidedLesson key={lesson.assignmentKey} lesson={lesson} initialProgress={initialProgress} fixtureMode onFinish={async () => undefined} />
  </main>;
}
