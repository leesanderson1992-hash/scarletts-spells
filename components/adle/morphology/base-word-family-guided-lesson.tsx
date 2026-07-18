"use client";

import { useEffect, useState } from "react";

import { CoverShutter, DiffReveal, HearWordButton } from "@/components/adle/activities/shared";
import type { BaseWordFamilyLessonSnapshotV1, BaseWordFamilySnapshotWord } from "@/lib/adle/morphology/base-word-family-payload";
import { baseWordFamilyResumeKey, normaliseBaseWordFamilyResume, type BaseWordFamilyResumeState } from "@/lib/adle/morphology/base-word-family-resume";
import { WordLabScene } from "./word-lab-scene";

const INITIAL: BaseWordFamilyResumeState = {
  stage: "intro", familyIndex: 0, controlledIndex: 0, dictationIndex: 0,
  controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "",
};

export function BaseWordFamilyGuidedLesson(props: {
  previewId: string;
  payload: BaseWordFamilyLessonSnapshotV1;
  onPreviewComplete: (reflection: string) => void;
}) {
  const [state, setState] = useState<BaseWordFamilyResumeState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const key = baseWordFamilyResumeKey(props.previewId, props.payload.contentVersion);
  const update = (patch: Partial<BaseWordFamilyResumeState>) => setState((current) => ({ ...current, ...patch }));
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      const restored = saved ? normaliseBaseWordFamilyResume(JSON.parse(saved), props.payload) : null;
      if (restored) setState(restored);
    } catch { /* Local preview must still work without browser storage. */ }
    setHydrated(true);
  }, [key, props.payload]);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* Resume is optional. */ }
  }, [hydrated, key, state]);
  if (!hydrated) return <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div>;
  const word = props.payload.independentWords[state.stage === "controlled" ? state.controlledIndex : state.dictationIndex];
  return <WordLabScene beat={{ id: "base-word-preview", activityId: state.stage, state: "guideSilent", goal: "Find the familiar base word.", waitFor: "the next step", onComplete: "done" }} phase={state.stage === "intro" ? 0 : state.stage === "families" ? 1 : state.stage === "word_sums" ? 2 : state.stage === "controlled" ? 4 : 5} muted={false} onMutedChange={() => undefined} silent={state.stage === "controlled" || state.stage === "dictation"}>
    {state.stage === "intro" ? <Intro payload={props.payload} onNext={() => update({ stage: "families" })} /> : null}
    {state.stage === "families" ? <FamilyMatrix section={props.payload.familySections[state.familyIndex]} number={state.familyIndex + 1} total={props.payload.familySections.length} onNext={() => state.familyIndex + 1 < props.payload.familySections.length ? update({ familyIndex: state.familyIndex + 1 }) : update({ stage: "word_sums" })} /> : null}
    {state.stage === "word_sums" ? <WordSums payload={props.payload} onNext={() => update({ stage: "controlled" })} /> : null}
    {state.stage === "controlled" ? <Controlled word={word} index={state.controlledIndex} total={props.payload.independentWords.length} attempt={state.controlledAttempts[word.canonicalWordId] ?? ""} checked={state.controlledChecked[word.canonicalWordId] === true} onAttempt={(attempt) => update({ controlledAttempts: { ...state.controlledAttempts, [word.canonicalWordId]: attempt } })} onChecked={() => update({ controlledChecked: { ...state.controlledChecked, [word.canonicalWordId]: true } })} onNext={() => state.controlledIndex + 1 < props.payload.independentWords.length ? update({ controlledIndex: state.controlledIndex + 1 }) : update({ stage: "dictation", dictationIndex: 0 })} /> : null}
    {state.stage === "dictation" ? <Dictation word={word} index={state.dictationIndex} total={props.payload.independentWords.length} value={state.sentenceAttempts[word.canonicalWordId] ?? ""} checked={state.sentenceChecked} onValue={(value) => update({ sentenceAttempts: { ...state.sentenceAttempts, [word.canonicalWordId]: value } })} onCheck={() => update({ sentenceChecked: true })} onNext={() => state.dictationIndex + 1 < props.payload.independentWords.length ? update({ dictationIndex: state.dictationIndex + 1, sentenceChecked: false }) : update({ stage: "reflect", sentenceChecked: false })} /> : null}
    {state.stage === "reflect" ? <Reflection prompt={props.payload.reflectionPrompt} value={state.reflectionText} onValue={(reflectionText) => update({ reflectionText })} onComplete={() => props.onPreviewComplete(state.reflectionText)} /> : null}
  </WordLabScene>;
}

function Intro(props: { payload: BaseWordFamilyLessonSnapshotV1; onNext: () => void }) {
  return <section className="grid gap-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Base-word strategy</p><h1 className="text-3xl font-black text-white">A familiar base can help you spell bigger words.</h1><p className="mx-auto max-w-2xl text-lg leading-8 text-cyan-50">Today we will look for a base word that stays inside a longer word. Knowing one spelling can help with many related words.</p><div className="grid gap-3 sm:grid-cols-2">{props.payload.authenticTargets.map((target) => <article key={target.canonicalWordId} className="rounded-2xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">A word from your writing</p><p className="mt-1 text-2xl font-black">{props.payload.familySections.flatMap((section) => section.guidedWords).find((word) => word.canonicalWordId === target.canonicalWordId)?.displayWord}</p></article>)}</div><button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Meet the word families</button></section>;
}

function FamilyMatrix(props: { section: BaseWordFamilyLessonSnapshotV1["familySections"][number]; number: number; total: number; onNext: () => void }) {
  return <section className="grid gap-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Family {props.number} of {props.total}</p><h2 className="text-3xl font-black text-white">Find <span className="rounded-xl bg-amber-100 px-2 text-amber-950">{props.section.baseWord.displayWord}</span> in these words</h2><p className="text-lg text-cyan-50">{props.section.baseMeaning}</p><div className="grid gap-3 sm:grid-cols-2">{props.section.guidedWords.map((word) => <article key={word.canonicalWordId} className="rounded-2xl bg-white p-4 text-left text-slate-950"><p className="text-xl font-black">{word.displayWord}</p><p className="mt-1 text-sm font-semibold text-slate-600">{word.wordSum}</p></article>)}</div><button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">{props.number < props.total ? "See the next family" : "Build the word sums"}</button></section>;
}

function WordSums(props: { payload: BaseWordFamilyLessonSnapshotV1; onNext: () => void }) {
  return <section className="grid gap-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Build the words</p><h2 className="text-3xl font-black text-white">The base spelling is still there.</h2><div className="grid gap-3">{props.payload.authenticTargets.map((target) => { const word = props.payload.familySections.flatMap((section) => section.guidedWords).find((candidate) => candidate.canonicalWordId === target.canonicalWordId)!; return <article key={word.canonicalWordId} className="rounded-2xl bg-white p-4 text-slate-950"><p className="text-2xl font-black">{word.wordSum}</p><p className="mt-2 text-sm font-semibold text-slate-600">{word.transformationNotes}</p></article>; })}</div><button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Practise five words</button></section>;
}

function Controlled(props: { word: BaseWordFamilySnapshotWord; index: number; total: number; attempt: string; checked: boolean; onAttempt: (value: string) => void; onChecked: () => void; onNext: () => void }) {
  return <section className="grid gap-4"><p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">Word to remember {props.index + 1} of {props.total}</p><CoverShutter key={props.word.canonicalWordId} word={props.word.displayWord} splitPoints={[]} initialAttempt={props.attempt} initialState={props.checked ? "check" : props.attempt ? "write" : "look"} muted={false} onStateChange={(_, attempt) => attempt && props.onAttempt(attempt)} onComplete={(attempt) => { props.onAttempt(attempt); props.onChecked(); }} />{props.checked ? <button type="button" onClick={props.onNext} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950">Continue</button> : null}</section>;
}

function Dictation(props: { word: BaseWordFamilySnapshotWord; index: number; total: number; value: string; checked: boolean; onValue: (value: string) => void; onCheck: () => void; onNext: () => void }) {
  return <section className="grid gap-4"><p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">Sentence {props.index + 1} of {props.total}</p><div className="flex justify-center"><HearWordButton word={props.word.audioText} label="Play sentence" muted={false} kind="dictation" /></div><label className="text-sm font-semibold text-cyan-50">Write the whole sentence<textarea autoFocus spellCheck={false} autoComplete="off" autoCapitalize="sentences" value={props.value} onChange={(event) => props.onValue(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl bg-white p-4 text-lg text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30" /></label>{!props.checked ? <button type="button" disabled={!props.value.trim()} onClick={props.onCheck} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40">Check sentence</button> : <><DiffReveal attempt={props.value} expected={props.word.dictationSentence} mode="sentence" /><button type="button" onClick={props.onNext} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950">{props.index + 1 < props.total ? "Next sentence" : "Reflect"}</button></>}</section>;
}

function Reflection(props: { prompt: string; value: string; onValue: (value: string) => void; onComplete: () => void }) {
  return <section className="grid gap-5"><h2 className="text-center text-3xl font-black text-white">What did you notice?</h2><label className="text-base font-black text-white">{props.prompt}<textarea autoFocus required maxLength={2000} value={props.value} onChange={(event) => props.onValue(event.target.value)} className="mt-2 min-h-32 w-full rounded-2xl bg-white p-4 text-lg font-normal text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30" /></label><button type="button" disabled={!props.value.trim()} onClick={props.onComplete} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40">Finish preview</button></section>;
}
