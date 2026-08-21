"use client";

import { useState } from "react";

import { AdleSessionCelebration } from "@/components/adle/adle-session-celebration";
import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { CoverShutter, SentenceDictation } from "@/components/adle/activities/shared";
import { DefinitionWordBuilder } from "@/components/adle/activities/shared/definition-word-builder";
import { FirstImpressionLesson, type FirstImpressionStageId } from "@/components/adle/first-impression/first-impression-lesson";
import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";

const BEAT = { id: "first-impression-acceptance", activityId: "teaching", state: "invite" as const, say: "Take one calm step at a time.", goal: "Complete the First Impression lesson", waitFor: "your next step", onComplete: "Continue" };

function teachingConfig(pageCount: 1 | 2 | 3): TeachingPagesConfig {
  const pages = [
    { id: "notice", type: "teaching" as const, eyebrow: "Learn", title: "A prefix changes a word’s meaning.", paragraphs: ["The prefix un- can mean not."], callout: "un + kind → unkind" },
    { id: "model", type: "teaching" as const, eyebrow: "Look closely", title: "Keep the base word steady.", paragraphs: ["The spelling of kind stays visible inside unkind."], model: { first: "un", second: "kind", result: "unkind" } },
    { id: "examples", type: "teaching" as const, eyebrow: "Examples", title: "Read the parts and the whole word.", paragraphs: ["Use the parts to help with spelling and meaning."], examples: [{ text: "un + fair → unfair", explanation: "not fair" }, { text: "un + tidy → untidy", explanation: "not tidy" }] },
  ];
  return {
    pages: pages.slice(0, pageCount),
    meetWords: {
      words: [
        { id: "unkind", word: "unkind", wordParts: ["un", "kind"], detail: "not kind", provenance: "A word from your writing" },
        { id: "unfair", word: "unfair", wordParts: ["un", "fair"], detail: "not fair" },
      ],
    },
  };
}

function stageId(stage: "teaching" | "activity" | "cover" | "dictation" | "reflection"): FirstImpressionStageId {
  return stage === "activity" ? "activity:build" : stage;
}

export function FirstImpressionAcceptanceFixture(props: {
  pageCount: 1 | 2 | 3;
  initialStage: "teaching" | "activity" | "cover" | "dictation" | "reflection";
  initialTeachingPageIndex: number;
  lockedDictation: boolean;
}) {
  const [coverAttempt, setCoverAttempt] = useState("");
  const [coverChecked, setCoverChecked] = useState(false);
  const [sentence, setSentence] = useState(props.lockedDictation ? "The unkind words upset him." : "");
  const [sentenceChecked, setSentenceChecked] = useState(props.lockedDictation);
  const [reflection, setReflection] = useState("");
  const [complete, setComplete] = useState(false);

  if (complete) return <main className="mx-auto max-w-4xl p-4" data-testid="first-impression-celebration"><AdleSessionCelebration model={{ forgedTodayWords: ["unkind"], goldenBarsToday: [], hasSomethingToCelebrate: true }} planDate="2026-08-21" backPath="/dev/adle/first-impression" /></main>;

  return <main className="mx-auto w-full min-w-0 max-w-6xl p-4" data-testid="first-impression-acceptance-fixture" data-page-count={props.pageCount} data-initial-stage={props.initialStage}>
    <FirstImpressionLesson
      teaching={teachingConfig(props.pageCount)}
      initialTeachingPageIndex={props.initialTeachingPageIndex}
      activities={[{
        id: "build", type: "BUILD", label: "Build",
        render: ({ complete: completeActivity }) => <DefinitionWordBuilder targetId="fixture-unkind" stepLabel="Configured activity" definition="not kind" tiles={[{ id: "un", text: "un", role: "prefix" }]} expectedIds={["un"]} fixedTiles={[{ id: "kind", text: "kind", role: "base" }]} fixedTilesPosition="after" label="Build unkind" wordSum="un + kind → unkind" resultingMeaning="not kind" continueLabel="Continue to Cover Check" muted onContinue={completeActivity} />,
      }]}
      initialStageId={stageId(props.initialStage)}
      onStageChange={() => undefined}
      scene={{ beat: BEAT, muted: true, onMutedChange: () => undefined, silent: props.initialStage === "cover" || props.initialStage === "dictation", guideName: "Word Builder" }}
      renderCover={({ complete: completeCover }) => <CoverShutter word="unkind" splitPoints={[2]} stepLabel="Cover Check" muted initialAttempt={coverAttempt} initialState={coverChecked ? "check" : coverAttempt ? "write" : "look"} onStateChange={(_, value) => { if (!coverChecked) setCoverAttempt(value); }} onComplete={(value) => { setCoverAttempt(value); setCoverChecked(true); }} onContinue={completeCover} />}
      renderDictation={({ complete: completeDictation }) => <SentenceDictation stepLabel="Sentence Dictation" audioText="The unkind words upset him." correctSentence="The unkind words upset him." value={sentence} checked={sentenceChecked} muted onValueChange={(value) => { if (!sentenceChecked) setSentence(value); }} onCheck={() => setSentenceChecked(true)} continueLabel="Reflect" onContinue={completeDictation} />}
      renderReflection={() => <LessonReflection mistakes={[]} prompt="How did the prefix help you today?" response={reflection} onResponseChange={setReflection} completionLabel="Finish Word Lab" onComplete={() => setComplete(true)} />}
    />
  </main>;
}
