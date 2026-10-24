"use client";

import { useState } from "react";
import { PreviewThemeControl } from "@/app/dev/adle/preview/preview-theme-control";
import { HomophoneGuidedLesson } from "@/components/adle/homophone/homophone-guided-lesson";
import type { ConvergencePreview } from "@/lib/adle/homophone/convergence-preview";

export function HomophoneConvergenceReview({ preview }: { preview: ConvergencePreview }) {
  const [run, setRun] = useState(0);
  const [showCheck, setShowCheck] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const snapshot = preview.snapshot;
  const correct = preview.questions.filter(question => answers[question.id] === question.word).length;
  function restart() {
    try { window.localStorage.removeItem(`adle:homophone:preview-convergence-${snapshot.microSkillKey}-${preview.rotation}:${snapshot.contentVersion}`); }
    catch { /* Preview can restart without local storage. */ }
    setAnswers({}); setChecked(false); setShowCheck(false); setRun(value => value + 1);
  }
  return <div className="grid gap-4">
    <div className="brand-card flex flex-wrap items-center gap-3 rounded-2xl p-4">
      <PreviewThemeControl />
      <button className="brand-secondary-btn" type="button" onClick={restart}>Restart lesson</button>
      <p className="text-xs text-[color:var(--mid)]">Owner-approved content · local review only · no learner evidence is saved</p>
    </div>
    {!showCheck ? <HomophoneGuidedLesson key={run} snapshot={snapshot}
      assignmentId={`preview-convergence-${snapshot.microSkillKey}-${preview.rotation}`}
      developmentPreview onComplete={() => setShowCheck(true)} /> :
      <section className="brand-card mx-auto grid w-full max-w-3xl gap-5 rounded-3xl p-6" aria-label="Independent context check">
        <div><p className="text-sm font-black uppercase tracking-wide text-cyan-800">Final context check</p>
          <h2 className="mt-1 text-2xl font-black">Choose the word that fits each sentence</h2>
          <p className="mt-2">These choices are independent of the guided activities. Every selected word has its own sentence.</p></div>
        {preview.questions.map((question, index) => <fieldset key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 font-black">{index + 1}. {question.sentenceWithBlank}</legend>
          <div className="mt-3 flex flex-wrap gap-2">{question.options.map(option => <label key={option}
            className={`cursor-pointer rounded-full border px-4 py-2 font-bold ${answers[question.id] === option ? "border-cyan-600 bg-cyan-50" : "border-slate-300"}`}>
            <input type="radio" name={question.id} value={option} checked={answers[question.id] === option}
              onChange={() => { setAnswers(current => ({ ...current, [question.id]: option })); setChecked(false); }} className="mr-2" />{option}</label>)}</div>
          {checked ? <p className={`mt-3 font-bold ${answers[question.id] === question.word ? "text-emerald-800" : "text-rose-800"}`}>
            {answers[question.id] === question.word ? "Correct" : `The sentence needs ${question.word}.`}</p> : null}
        </fieldset>)}
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="brand-primary-btn" disabled={preview.questions.some(question => !answers[question.id])}
          onClick={() => setChecked(true)}>Check my choices</button>
          {checked ? <p role="status" className="font-black">{correct} of {preview.questions.length} correct</p> : null}</div>
      </section>}
  </div>;
}
