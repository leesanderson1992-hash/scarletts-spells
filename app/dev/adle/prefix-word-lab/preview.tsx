"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import type { MorphologyLessonPayloadV1 } from "@/lib/adle/morphology/payload";
import { clearMorphologyResume, morphologyResumeKey } from "@/lib/adle/morphology/resume";

const MorphologyGuidedLesson = dynamic(
  () => import("@/components/adle/morphology/morphology-guided-lesson").then((module) => module.MorphologyGuidedLesson),
  { ssr: false },
);

export function PrefixWordLabPreview(props: {
  assignmentId: string;
  familyLabel: string;
  items: AdleSessionItem[];
  payload: MorphologyLessonPayloadV1;
}) {
  const [run, setRun] = useState(0);
  const [complete, setComplete] = useState(false);
  function restart() {
    clearMorphologyResume(morphologyResumeKey(props.assignmentId, props.payload.contentVersion));
    setComplete(false);
    setRun((value) => value + 1);
  }
  return <div className="grid gap-2" data-testid="full-prefix-preview" data-micro-skill={props.payload.microSkillId}>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="brand-secondary-btn" onClick={restart}>Restart preview</button>
      <p className="text-sm text-[color:var(--mid)]">Four reviewed sample words · No learner work is saved</p>
    </div>
    {complete ? <section className="brand-card rounded-3xl p-8 text-center" role="status">
      <h1 className="text-3xl font-black">{props.familyLabel} Word Lab complete</h1>
      <p className="mt-2 text-[color:var(--mid)]">This was a local preview. No lesson result was submitted.</p>
      <button type="button" className="brand-primary-btn mt-5" onClick={restart}>Try this family again</button>
    </section> : <MorphologyGuidedLesson key={run} assignmentId={props.assignmentId} childId="dev-prefix-child" items={props.items} payload={props.payload} onPreviewComplete={() => {
      clearMorphologyResume(morphologyResumeKey(props.assignmentId, props.payload.contentVersion));
      setComplete(true);
    }} />}
  </div>;
}
