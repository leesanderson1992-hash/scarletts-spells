"use client";

import { useState } from "react";
import { VisualConvergenceCandidatePreview } from "@/app/admin/adle/activity-catalogue/visual-convergence-candidates";
import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { lessonReflectionPrompt } from "@/lib/adle/lesson-reflection";
import { COMPARATIVE_MICRO_SKILLS } from "@/lib/adle/inflection/contracts";
import { comparativePreviewFixture } from "@/lib/adle/inflection/preview-fixture";
import { initialComparativeProgress } from "@/lib/adle/inflection/resume";
import { comparativeReflectionModel } from "@/lib/adle/inflection/reflection";

const EXAMPLES = [
  { id: "comparative", label: "Comparative / superlative" },
  { id: "suffix", label: "Suffix -ous" },
  { id: "morphology-reflection", label: "Prefix" },
  { id: "base-reflection", label: "Base words" },
  { id: "compound-reflection", label: "Compound words" },
] as const;

export function ReflectionLessonPreviews() {
  const [selected, setSelected] = useState<string>("comparative");
  return <section id="reflection-examples" className="brand-card grid scroll-mt-5 gap-4 rounded-3xl p-5" aria-labelledby="reflection-examples-heading">
    <div><h2 id="reflection-examples-heading" className="text-2xl font-semibold">Compare lesson reflections</h2><p className="mt-2 text-sm">The existing reflection template, with example mistakes. Select a lesson to see its spelling review and prompt. Nothing is saved.</p></div>
    <div className="flex flex-wrap gap-2">{EXAMPLES.map(example => <button key={example.id} type="button" aria-pressed={selected === example.id} onClick={() => setSelected(example.id)} className={`min-h-11 rounded-xl border px-4 ${selected === example.id ? "bg-cyan-100" : "bg-white"}`}>{example.label}</button>)}</div>
    <div className="rounded-3xl bg-slate-900 p-5 text-white">
      {selected === "comparative" || selected === "suffix" ? <ReflectionFixture key={selected} kind={selected} /> : <VisualConvergenceCandidatePreview key={selected} groupId="reflection" candidateId={selected} state="incorrect" />}
    </div>
  </section>;
}

function ReflectionFixture({ kind }: { kind: "comparative" | "suffix" }) {
  const [response, setResponse] = useState("");
  const lesson = comparativePreviewFixture(COMPARATIVE_MICRO_SKILLS[2]);
  const progress = initialComparativeProgress(lesson);
  progress.coverAttempts[lesson.families[0].words[1].canonicalWordId] = "happyer";
  progress.coverAttempts[lesson.families[0].words[2].canonicalWordId] = "happyest";
  const sentence = lesson.dictationTasks[0];
  progress.dictationValues[sentence.id] = [sentence.targets[1].word, sentence.targets[0].word];
  progress.dictationChecked[sentence.id] = true;
  const model = kind === "comparative" ? comparativeReflectionModel(lesson, progress) : { mistakes: [
    { id: "suffix-dangerous", attempt: "dangerus", correctSpelling: "dangerous" },
    { id: "suffix-famous", attempt: "famus", correctSpelling: "famous" },
  ] };
  return <LessonReflection {...model} prompt={kind === "comparative" ? lesson.reflectionPrompt : lessonReflectionPrompt({ kind: "suffix", values: ["-ous"] })} responseHelpText={kind === "comparative" ? null : undefined} responsePlaceholder={kind === "comparative" ? "I will remember…" : undefined} response={response} onResponseChange={setResponse} autoFocus={false} completionLabel="Finish preview" />;
}
