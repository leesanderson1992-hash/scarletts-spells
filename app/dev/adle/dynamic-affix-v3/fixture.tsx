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

export function DynamicAffixV3InteractionFixture(props: {
  assignmentId: string;
  items: AdleSessionItem[];
  payload: MorphologyLessonPayloadV1;
}) {
  const [complete, setComplete] = useState(false);
  return (
    <main className="mx-auto max-w-6xl p-4" data-testid="dynamic-affix-v3-fixture"
      data-assignment-id={props.assignmentId}
      data-content-version={props.payload.contentVersion}
      data-word-ids={JSON.stringify(props.payload.words.lesson.map((word) => word.canonicalWordId))}
      data-words={JSON.stringify(props.payload.words.lesson.map((word) => word.displayWord))}
      data-split-point={String(props.payload.words.lesson[0]?.splitPoints[0] ?? 1)}
      data-sentences={JSON.stringify(props.payload.activities.find((activity) => activity.type === "sentence_dictation")?.sentences?.map((entry) => entry.sentence) ?? [])}>
      {complete ? (
        <section className="brand-card rounded-3xl p-6" data-testid="dynamic-affix-v3-complete">
          Dynamic Affix V3 preview complete.
        </section>
      ) : (
        <MorphologyGuidedLesson
          assignmentId={props.assignmentId}
          childId="dev-dynamic-affix-v3-child"
          items={props.items}
          payload={props.payload}
          onPreviewComplete={() => {
            clearMorphologyResume(morphologyResumeKey(props.assignmentId, props.payload.contentVersion));
            setComplete(true);
          }}
        />
      )}
    </main>
  );
}
