"use client";

import { useState } from "react";
import Link from "next/link";
import { CanonicalActivityRenderer, createCanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import { comparativePreviewFixture } from "@/lib/adle/inflection/preview-fixture";
import { COMPARATIVE_MICRO_SKILLS, type ComparativeMicroSkill } from "@/lib/adle/inflection/contracts";

export function ComparativeModePreviews() {
  const [skill, setSkill] = useState<ComparativeMicroSkill>(COMPARATIVE_MICRO_SKILLS[0]);
  const [mode, setMode] = useState<"sentence_suffix" | "transform_target" | "paired_word_gaps">("sentence_suffix");
  return <section className="brand-card grid gap-4 rounded-3xl p-5">
    <div><h2 className="text-2xl font-semibold">Comparative and superlative — scoped template modes</h2><p className="mt-2 text-sm">Actual task renderers with synthetic content. No learner data is saved.</p></div>
    <label className="grid max-w-md gap-1 text-sm">Preview rule<select aria-label="Preview rule" className="brand-input rounded-xl p-2" value={skill} onChange={e => setSkill(e.target.value as ComparativeMicroSkill)}>{COMPARATIVE_MICRO_SKILLS.map(s => <option key={s} value={s}>{s.replace("D4_INF_COMPARATIVE_SUPERLATIVE_", "").replaceAll("_", " ")}</option>)}</select></label>
    <div className="flex flex-wrap gap-2">{(["sentence_suffix", "transform_target", "paired_word_gaps"] as const).map((m, i) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-11 rounded-xl border px-4 ${mode === m ? "bg-cyan-100" : "bg-white"}`}>Task {[1, 3, 5][i]} · {m.replaceAll("_", " ")}</button>)}</div>
    <ModeFixture key={`${skill}:${mode}`} skill={skill} mode={mode} />
    <Link href="/dev/adle/comparative-superlative" className="text-sm underline">Open the full six-task lesson preview</Link>
  </section>;
}
function ModeFixture(props: { skill: ComparativeMicroSkill; mode: "sentence_suffix" | "transform_target" | "paired_word_gaps" }) {
  const lesson = comparativePreviewFixture(props.skill);
  const [values, setValues] = useState<[string, string]>(["", ""]);
  const [checked, setChecked] = useState(false);
  const [complete, setComplete] = useState(false);
  const concept = props.mode === "sentence_suffix" ? "WORD_ASSEMBLY" : props.mode === "transform_target" ? "CLEAVER" : "DICTATION";
  const binding = createCanonicalActivityBinding({ id: "degree-mode-fixture", label: props.mode, concept, mode: props.mode, contractVersion: 1,
    createProps: () => ({ stepLabel: "Interactive fixture", onContinue: () => setComplete(true),
      ...(props.mode === "sentence_suffix" ? { sentence: lesson.sentenceTasks[0], baseWord: lesson.families[0].words[0].word, forms: lesson.families[0].words.slice(1), transformations: lesson.families[0].transformations }
        : props.mode === "transform_target" ? { transformation: lesson.cleaverTasks[0].transformation, question: lesson.cleaverTasks[0].question }
          : { mode: "paired_word_gaps", sentence: lesson.dictationTasks[0], audioOrder: lesson.dictationTasks[0].audioOrder, values, checked, onValuesChange: setValues, onCheck: () => setChecked(true) }),
    }) });
  return <div className="rounded-3xl bg-slate-900 p-5 text-white">{complete ? <p role="status">Fixture complete. Choose another mode or rule to try it.</p> : <CanonicalActivityRenderer binding={binding} navigation={{ complete: () => setComplete(true), rereadTeaching: () => undefined }} />}</div>;
}
