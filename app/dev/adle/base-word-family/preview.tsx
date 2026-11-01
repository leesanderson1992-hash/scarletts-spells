"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { BaseWordFamilyLessonSnapshotV1 } from "@/lib/adle/morphology/base-word-family-payload";
import { baseWordFamilyResumeKey } from "@/lib/adle/morphology/base-word-family-resume";
import { candidateBaseWordTeachingPages } from "@/lib/adle/morphology/base-word-teaching-pages";

const PREVIEW_ID = "dev-base-word-family-g7-teaching-pages";
const SKILLS = [
  { key: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", title: "Identify the base word", example: "re + play → replay", focus: "Find the complete word play inside replay.", status: "Word Lab lesson" },
  { key: "D4_MOR_BASE_WORDS_PRESERVE_BASE", title: "Preserve the base spelling", example: "play + ing → playing", focus: "Keep every letter of play when adding -ing.", status: "Word Lab lesson" },
  { key: "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", title: "Base word after a prefix", example: "re + play → replay", focus: "Put re- before play; the base spelling stays visible.", status: "Later phase transfer example" },
  { key: "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX", title: "Base word before a suffix", example: "help + ful → helpful", focus: "Find help, then add -ful after it.", status: "Later phase transfer example" },
] as const;
const BaseWordFamilyGuidedLesson = dynamic(
  () => import("@/components/adle/morphology/base-word-family-guided-lesson").then((module) => module.BaseWordFamilyGuidedLesson),
  { ssr: false, loading: () => <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div> },
);

export function BaseWordFamilyPreview(props: { payload: BaseWordFamilyLessonSnapshotV1 }) {
  const [selectedKey, setSelectedKey] = useState<string>("D4_MOR_BASE_WORDS_IDENTIFY_BASE");
  const [run, setRun] = useState(0);
  const [reflection, setReflection] = useState<string | null>(null);
  const selected = SKILLS.find((skill) => skill.key === selectedKey) ?? SKILLS[0];
  const lessonPayload = { ...props.payload, microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", contentVersion: `${props.payload.contentVersion}:${selectedKey}:three-teaching-pages-v1` };
  const previewId = `${PREVIEW_ID}:${selectedKey}`;
  function restart() {
    try { window.localStorage.removeItem(baseWordFamilyResumeKey(previewId, lessonPayload.contentVersion)); } catch { /* A fresh client render still works. */ }
    setReflection(null);
    setRun((value) => value + 1);
  }
  return <div className="adle-preview-stack grid w-full gap-4">
    <header className="brand-card rounded-3xl p-5">
      <p className="brand-eyebrow">ADLE local preview · Identify the base word</p>
      <h1 className="text-2xl font-black text-[color:var(--ink)]">One micro skill, four examples</h1>
      <p className="mt-2 text-sm text-[color:var(--mid)]">These examples show the four teaching focuses being brought into Identify the base word. The first two open the existing Word Lab; prefix and suffix examples show transfer within the same skill.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SKILLS.map((skill) => <button key={skill.key} type="button" aria-pressed={selectedKey === skill.key} onClick={() => { setSelectedKey(skill.key); setReflection(null); setRun((value) => value + 1); }} className={`rounded-2xl border p-4 text-left ${selectedKey === skill.key ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white"}`}>
          <span className="block text-xs font-bold text-[color:var(--mid)]">{skill.status}</span>
          <strong className="mt-1 block text-sm text-[color:var(--ink)]">{skill.title}</strong>
          <span className="mt-2 block text-sm">{skill.example}</span>
        </button>)}
      </div>
    </header>
    <section className="brand-card rounded-3xl p-5" aria-label={`${selected.title} example`}>
      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--mid)]">{selected.status}</p>
      <h2 className="mt-1 text-xl font-black text-[color:var(--ink)]">{selected.title}</h2>
      <p className="mt-2 text-sm">{selected.focus}</p>
      <p className="mt-2 rounded-xl bg-cyan-50 p-3 text-lg font-bold text-cyan-950">{selected.example}</p>
      {selected.status === "Later phase transfer example" && <p className="mt-3 text-sm text-[color:var(--mid)]">This is a transfer example within Identify the base word, not a separate lesson.</p>}
    </section>
    {selected.status === "Word Lab lesson" && (reflection !== null
      ? <section className="brand-card mx-auto grid max-w-3xl gap-4 rounded-3xl p-8 text-center"><p className="brand-eyebrow">Development preview complete</p><h2 className="text-3xl font-black text-[color:var(--ink)]">You finished the base-word Word Lab! 🎉</h2><p className="text-[color:var(--mid)]">This local preview did not submit, score, schedule, or save learning evidence.</p><blockquote className="rounded-2xl bg-cyan-50 p-4 text-cyan-950">{reflection}</blockquote><button type="button" className="brand-primary-btn mx-auto" onClick={restart}>Try the preview again</button></section>
      : <><div className="flex flex-wrap gap-3"><button type="button" className="brand-secondary-btn" onClick={restart}>Restart preview</button><p className="self-center text-sm text-[color:var(--mid)]">Development-only; reviewed-content-shaped fixture.</p></div><BaseWordFamilyGuidedLesson key={`${selectedKey}:${run}`} previewId={previewId} payload={lessonPayload} teachingOverride={candidateBaseWordTeachingPages(lessonPayload)} onPreviewComplete={setReflection} /></>)}
  </div>;
}
