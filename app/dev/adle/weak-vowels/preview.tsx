"use client";

import { useState, useSyncExternalStore } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { WeakVowelGuidedLesson } from "@/components/adle/weak-vowel/weak-vowel-guided-lesson";
import { WEAK_VOWEL_PREVIEW_SKILLS, weakVowelPreviewLesson } from "@/lib/adle/weak-vowel/preview-fixture";
import { initialWeakVowelProgress, weakVowelProgressValid, type WeakVowelProgressV1 } from "@/lib/adle/weak-vowel/progress";
import { validateWeakVowelLesson, type WeakVowelLessonV1, type WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";

const STORAGE_KEY = "adle:weak-vowel-lesson-preview:v1";
interface PreviewState { lesson: WeakVowelLessonV1; progress: WeakVowelProgressV1; finishWrites: number; scenario: "ready" | "blocked" }
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function fresh(skill: WeakVowelMicroSkill, revision = 1, scenario: PreviewState["scenario"] = "ready"): PreviewState {
  const lesson = weakVowelPreviewLesson(skill, revision);
  return { lesson, progress: initialWeakVowelProgress(lesson), finishWrites: 0, scenario };
}

function restored(): PreviewState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PreviewState | null;
    if (saved && validateWeakVowelLesson(saved.lesson, true) && WEAK_VOWEL_PREVIEW_SKILLS.includes(saved.lesson.microSkillKey) &&
      saved.lesson.contentVersion === weakVowelPreviewLesson(saved.lesson.microSkillKey, 1).contentVersion &&
      saved.lesson.authority === "dev_fixture" && saved.scenario &&
      weakVowelProgressValid(saved.progress, saved.lesson) && Number.isInteger(saved.finishWrites)) return saved;
  } catch { /* An invalid preview starts from a new frozen fixture. */ }
  return fresh(WEAK_VOWEL_PREVIEW_SKILLS[0]);
}

export function WeakVowelLessonsPreview() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [state, setState] = useState<PreviewState | null>(() => typeof window === "undefined" ? null : restored());
  const [storageError, setStorageError] = useState<string | null>(null);
  function save(next: PreviewState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setState(next); }
    catch { setStorageError("Preview storage is unavailable; reload and resume cannot be checked."); throw new Error("weak_vowel_preview_storage_unavailable"); }
  }
  if (!mounted || !state) return <p role="status">Preparing the weak-vowel lesson preview…</p>;
  const { lesson, progress, scenario } = state;
  return <main className="adle-preview-config brand-page min-h-screen px-2 py-2">
    <section className="adle-preview-settings brand-card mx-auto mb-2 max-w-7xl rounded-2xl px-3 py-2" aria-label="Weak-vowel lesson preview settings">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><h1 className="text-lg font-black">The Secret Life of Vowels</h1><p className="text-xs">Local preview · candidate content · no learner evidence written</p></div>
        <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-bold">Micro-skill
          <select aria-label="Micro-skill" className="brand-input min-h-12 rounded-xl p-2" value={lesson.microSkillKey} onChange={(event) => save(fresh(event.target.value as WeakVowelMicroSkill, Date.now(), scenario))}>
            {WEAK_VOWEL_PREVIEW_SKILLS.map((skill) => <option key={skill} value={skill}>{skill.replace("D4_SCHWA_", "").replaceAll("_", " ")}</option>)}
          </select></label>
          <label className="grid gap-1 text-sm font-bold">Scenario<select aria-label="Preview scenario" className="brand-input min-h-12 rounded-xl p-2" value={scenario} onChange={(event) => save(fresh(lesson.microSkillKey, Date.now(), event.target.value as PreviewState["scenario"]))}>
            <option value="ready">Ready candidate lesson</option><option value="blocked">Missing demanded-word content</option>
          </select></label>
          <button type="button" className="brand-button min-h-11 rounded-xl px-3" onClick={() => save(fresh(lesson.microSkillKey, Date.now(), scenario))}>Restart</button>
          <PreviewThemeControl />
        </div>
        <p className="text-xs font-semibold" data-preview-finish-writes={state.finishWrites}>Preview Finish writes: {state.finishWrites} · Reload resumes this snapshot.</p>
        {lesson.words.length < 5 ? <p role="status" className="rounded-xl border border-amber-300 px-3 py-1 text-xs font-bold text-[color:var(--ink)]" style={{ backgroundColor: "var(--adie-surface)" }}>Only {lesson.words.length} assigned review candidates; production still needs five.</p> : null}
        {storageError ? <p role="alert">{storageError}</p> : null}
      </div>
    </section>
    {scenario === "blocked" ? <section className="brand-card mx-auto max-w-4xl rounded-3xl p-8" role="alert" data-content-blocker="true"><h2 className="text-2xl font-black">Lesson content needs repair</h2><p className="mt-3">The demanded word <strong>{lesson.words[0].spelling}</strong> has no approved Dinner annotation in this scenario. It stays selected and queued; another word is not substituted.</p><p className="mt-3 text-sm">The reviewer must publish its recording-bound syllable cuts and complete target span before this new assignment can be offered.</p></section>
      : <WeakVowelGuidedLesson key={lesson.assignmentKey} lesson={lesson} fixtureMode initialProgress={progress}
          onProgress={(nextProgress) => setState((current) => {
            if (!current) return current;
            const next = { ...current, progress: nextProgress };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* A critical checkpoint reports the failure. */ }
            return next;
          })}
          onCheckpoint={async (nextProgress) => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, progress: nextProgress })); }}
          onFinish={async (nextProgress) => {
            const stored = localStorage.getItem(STORAGE_KEY);
            const previous = stored ? JSON.parse(stored) as PreviewState : state;
            save({ ...state, progress: nextProgress, finishWrites: previous.progress.finished ? previous.finishWrites : previous.finishWrites + 1 });
          }} />}
  </main>;
}
