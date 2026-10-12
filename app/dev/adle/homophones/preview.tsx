"use client";

import { useEffect, useMemo, useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { HomophoneGuidedLesson } from "@/components/adle/homophone/homophone-guided-lesson";
import { HOMOPHONE_LESSONS, compileHomophoneLessonSnapshot } from "@/lib/adle/homophone/lesson";

export function HomophonePreview() {
  const [key, setKey] = useState(HOMOPHONE_LESSONS[0].microSkillKey);
  const [run, setRun] = useState(0);
  const snapshot = useMemo(() => compileHomophoneLessonSnapshot(key), [key]);
  useEffect(() => {
    try { for (const lesson of HOMOPHONE_LESSONS) for (const version of ["d4-hom-v1", "d4-hom-v2", "d4-hom-v3"]) window.localStorage.removeItem(`adle:homophone:preview-${lesson.microSkillKey}:${version}`); } catch { /* Storage may be unavailable in the preview. */ }
  }, []);
  return <div className="grid gap-5">
    <div className="brand-card flex flex-wrap items-end gap-3 rounded-2xl p-4">
      <PreviewThemeControl />
      <label className="grid gap-1 text-sm font-bold">Preview word set
        <select className="brand-select min-h-11 rounded-xl px-3" value={key} onChange={event => { setKey(event.target.value); setRun(previous => previous + 1); }}>
          {HOMOPHONE_LESSONS.map(lesson => <option key={lesson.microSkillKey} value={lesson.microSkillKey}>{lesson.words.map(word => word.word).join(" / ")}</option>)}
        </select>
      </label>
      <button type="button" className="brand-secondary-btn" onClick={() => { try { window.localStorage.removeItem(`adle:homophone:preview-${key}:${snapshot.contentVersion}`); } catch { /* Preview can still remount. */ } setRun(previous => previous + 1); }}>Restart preview</button>
      <p className="text-xs text-[color:var(--mid)]">Inactive {snapshot.contentVersion} development candidate · shuffled Bin Sort and Balloon Pop prompts · Cover Check for every word. This preview saves lesson progress locally; it does not write learner evidence or a balloon record.</p>
    </div>
    <HomophoneGuidedLesson key={`${key}:${run}`} snapshot={snapshot} assignmentId={`preview-${key}`} />
  </div>;
}
