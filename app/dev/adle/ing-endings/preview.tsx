"use client";

import { useState, useSyncExternalStore } from "react";
import { IngGuidedLesson } from "@/components/adle/morphology/ing-guided-lesson";
import { ING_MICRO_SKILLS, type IngLessonV1, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { ingPreviewFixture } from "@/lib/adle/ing/preview-fixture";
import { validateIngLesson } from "@/lib/adle/ing/lesson";
import { ingProgressValid, initialIngProgress, type IngProgressV1 } from "@/lib/adle/ing/progress";

const STORAGE_KEY = "adle:ing:preview:v1";
interface PreviewState { lesson: IngLessonV1; progress: IngProgressV1; finishWrites: number }
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function fresh(skill: IngMicroSkill, count: number): PreviewState {
  const lesson = ingPreviewFixture(skill, count, `fixture:${skill}:${count}:${crypto.randomUUID()}`);
  return { lesson, progress: initialIngProgress(lesson), finishWrites: 0 };
}
function scrabblePreviewState(): PreviewState {
  const state = fresh(ING_MICRO_SKILLS[0], 1);
  return { ...state, progress: { ...state.progress, stageId: "activity:ing-scrabble", teachingPageIndex: 2 } };
}
export function IngPreview() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [state, setState] = useState<PreviewState | null>(() => {
    if (typeof window === "undefined") return null;
    if (new URLSearchParams(window.location.search).get("task") === "scrabble") return scrabblePreviewState();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PreviewState | null;
      if (parsed && validateIngLesson(parsed.lesson, true) && parsed.lesson.authority === "dev_fixture" && ingProgressValid(parsed.progress, parsed.lesson) && [0, 1].includes(parsed.finishWrites)) return parsed;
    } catch { /* Invalid or unavailable storage starts a new synthetic fixture. */ }
    return fresh(ING_MICRO_SKILLS[0], 1);
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  function save(next: PreviewState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setState(next); }
    catch { setStorageError("Preview storage is unavailable. Reload and resume cannot be verified."); throw new Error("ing_preview_storage_unavailable"); }
  }
  if (!mounted || !state) return <p role="status">Preparing the synthetic -ing lesson preview…</p>;
  return <main className="brand-page min-h-screen px-4 py-6"><div className="mx-auto grid max-w-5xl gap-5">
    <header className="brand-card grid gap-3 rounded-3xl p-5">
      <h1 className="text-2xl font-bold">-ing endings ADLE preview</h1>
      <p>Development fixture only. The words and sentences here are unapproved examples; no learner data, schedules or rewards are written.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Micro skill<select aria-label="Micro skill" className="brand-input rounded-xl p-2" value={state.lesson.microSkillKey} onChange={event => save(fresh(event.target.value as IngMicroSkill, state.lesson.queuedTargets.length))}>
          {ING_MICRO_SKILLS.map(skill => <option key={skill} value={skill}>{skill.replace("D4_INF_ING_ENDINGS_", "").replaceAll("_", " ")}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Queued targets<select aria-label="Queued targets" className="brand-input rounded-xl p-2" value={state.lesson.queuedTargets.length} onChange={event => save(fresh(state.lesson.microSkillKey, Number(event.target.value)))}>
          {[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count} queued · 6 words</option>)}
        </select></label>
        <button type="button" onClick={() => save(fresh(state.lesson.microSkillKey, state.lesson.queuedTargets.length))} className="brand-button rounded-xl px-4 py-2">Restart fixture</button>
      </div>
      <p className="text-xs" data-ing-preview-finish-writes={state.finishWrites}>Fixture Finish writes: {state.finishWrites}. Reload retains this frozen lesson and progress.</p>
      {storageError ? <p role="alert">{storageError}</p> : null}
    </header>
    <IngGuidedLesson key={state.lesson.assignmentKey} lesson={state.lesson} fixtureMode initialProgress={state.progress}
      onProgress={progress => setState(current => {
        if (!current) return current;
        const next = { ...current, progress };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Critical checkpoints report failures. */ }
        return next;
      })}
      onCheckpoint={async progress => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, progress })); }}
      onFinish={async progress => {
        const stored = localStorage.getItem(STORAGE_KEY);
        const previous = stored ? JSON.parse(stored) as PreviewState : state;
        save({ lesson: state.lesson, progress, finishWrites: previous.progress.finished ? previous.finishWrites : previous.finishWrites + 1 });
      }} />
  </div></main>;
}
