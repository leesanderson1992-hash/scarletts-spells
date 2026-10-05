"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ComparativeGuidedLesson } from "@/components/adle/morphology/comparative-guided-lesson";
import { COMPARATIVE_MICRO_SKILLS, type ComparativeLessonV1, type ComparativeMicroSkill } from "@/lib/adle/inflection/contracts";
import { comparativePreviewFixture } from "@/lib/adle/inflection/preview-fixture";
import { validateComparativeLesson } from "@/lib/adle/inflection/lesson";
import { comparativeProgressValid, initialComparativeProgress, type ComparativeProgressV1 } from "@/lib/adle/inflection/resume";

const STORAGE_KEY = "adle:comparative:preview:v1";
interface PreviewState { lesson: ComparativeLessonV1; progress: ComparativeProgressV1; finishWrites: number }
const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function fresh(skill: ComparativeMicroSkill, count: 2 | 3 | 4): PreviewState {
  const lesson = comparativePreviewFixture(skill, count, `fixture:${skill}:${count}:${crypto.randomUUID()}`);
  return { lesson, progress: initialComparativeProgress(lesson), finishWrites: 0 };
}
export function ComparativePreview() {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [state, setState] = useState<PreviewState | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PreviewState | null;
      if (parsed && validateComparativeLesson(parsed.lesson, true) && parsed.lesson.authority === "dev_fixture"
        && comparativeProgressValid(parsed.progress, parsed.lesson) && (parsed.finishWrites === 0 || parsed.finishWrites === 1)) return parsed;
    } catch { /* The next critical save reports unavailable preview storage. */ }
    return fresh(COMPARATIVE_MICRO_SKILLS[0], 3);
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  function save(next: PreviewState) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setState(next); } catch { setStorageError("Preview storage is unavailable. Reload/resume cannot be verified."); throw new Error("preview_storage_unavailable"); } }
  if (!mounted || !state) return <p role="status">Preparing the synthetic lesson preview…</p>;
  return <main className="brand-page min-h-screen px-4 py-6"><div className="mx-auto grid max-w-5xl gap-5">
    <header className="brand-card grid gap-3 rounded-3xl p-5">
      <h1 className="text-2xl font-bold">Comparative and superlative ADLE preview</h1>
      <p>Development fixture only. Candidate content is unapproved; no assignments, learner evidence, scheduling or rewards are written.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Micro-skill<select className="brand-input rounded-xl p-2" value={state.lesson.microSkillKey} onChange={e => save(fresh(e.target.value as ComparativeMicroSkill, state.lesson.queuedTargets.length as 2 | 3 | 4))}>
          {COMPARATIVE_MICRO_SKILLS.map(skill => <option key={skill} value={skill}>{skill.replace("D4_INF_COMPARATIVE_SUPERLATIVE_", "").replaceAll("_", " ")}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Queued targets<select className="brand-input rounded-xl p-2" value={state.lesson.queuedTargets.length} onChange={e => save(fresh(state.lesson.microSkillKey, Number(e.target.value) as 2 | 3 | 4))}>
          {[2, 3, 4].map(count => <option key={count} value={count}>{count} targets · 2 families · 6 forms</option>)}
        </select></label>
        <button type="button" onClick={() => save(fresh(state.lesson.microSkillKey, state.lesson.queuedTargets.length as 2 | 3 | 4))} className="brand-button rounded-xl px-4 py-2">Restart fixture</button>
        <Link href="/dev/adle/template-menu" className="underline">Task template menu</Link>
      </div>
      <p className="text-xs" data-preview-finish-writes={state.finishWrites}>Fixture Finish writes: {state.finishWrites}. Reload retains this frozen lesson and its progress.</p>
      {storageError ? <p role="alert">{storageError}</p> : null}
    </header>
    <ComparativeGuidedLesson key={state.lesson.assignmentKey} lesson={state.lesson} fixtureMode initialProgress={state.progress}
      onProgress={progress => setState(current => {
        if (!current) return current;
        const next = { ...current, progress };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Critical checkpoint and Finish report storage failures. */ }
        return next;
      })}
      onCheckpoint={async progress => { const next = { ...state, progress }; localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }}
      onFinish={async progress => {
        const stored = localStorage.getItem(STORAGE_KEY);
        const previous = stored ? JSON.parse(stored) as PreviewState : state;
        save({ lesson: state.lesson, progress, finishWrites: previous.progress.finished ? previous.finishWrites : previous.finishWrites + 1 });
      }} />
  </div></main>;
}
