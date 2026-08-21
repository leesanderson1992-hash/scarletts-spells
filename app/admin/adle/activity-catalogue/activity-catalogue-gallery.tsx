"use client";

import { useState, type ReactNode } from "react";

import { IntroActivity } from "@/components/adle/activities/intro-activity";
import { QuickSortActivity } from "@/components/adle/activities/quick-sort-activity";
import { ReflectionActivity } from "@/components/adle/activities/reflection-activity";
import { BinSort, ColdWordRecall, CoverShutter, SentenceDictation, SplitHandle } from "@/components/adle/activities/shared";
import { DefinitionWordBuilder } from "@/components/adle/activities/shared/definition-word-builder";
import { CompoundJigsawActivity } from "@/components/adle/morphology/compound-jigsaw-activity";
import { MeaningConnectionActivity } from "@/components/adle/morphology/meaning-connection-activity";
import { ADLE_ACTIVITY_CATALOGUE } from "@/lib/adle/activity-catalogue";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";

function fixtureItem(input: Partial<AdleSessionItem> & Pick<AdleSessionItem, "templateKey" | "sectionKey">): AdleSessionItem {
  return {
    id: `gallery-${input.templateKey.toLocaleLowerCase("en-GB")}`,
    sourceEntityId: `gallery-${input.templateKey.toLocaleLowerCase("en-GB")}`,
    position: 1,
    status: "ready",
    targetWord: null,
    canonicalWordId: null,
    microSkillKey: "GALLERY_ONLY",
    adleLearningItemRef: null,
    promptData: {},
    ...input,
  };
}

const INTRO_FIXTURE = fixtureItem({
  sectionKey: "lesson_intro",
  templateKey: "MICRO_READ_ONLY_INTRO",
  promptData: {
    teachingObjective: "A prefix changes the meaning of a base word.",
    childFriendlyExplanation: "Today we will look for meaningful word parts.",
    ruleExplanation: "Keep each part visible in your mind as you spell.",
    lessonWordPreviews: [
      { canonicalWordId: "gallery-unhelpful", displayWord: "unhelpful", provenance: "learning_item" },
      { canonicalWordId: "gallery-replay", displayWord: "replay", provenance: "stretch" },
    ],
  },
});

const QUICK_SORT_FIXTURE = fixtureItem({
  sectionKey: "review_quick_sort",
  templateKey: "REVIEW_QUICK_SORT",
  promptData: {
    childFacingCopy: "Sort each word by the prefix meaning.",
    words: [
      { canonicalWordId: "gallery-replay", targetWord: "replay" },
      { canonicalWordId: "gallery-unfair", targetWord: "unfair" },
    ],
    sortBins: {
      dimensionLabel: "prefix meaning",
      bins: [{ key: "again", label: "AGAIN" }, { key: "not", label: "NOT" }],
      correctBinByWordId: { "gallery-replay": "again", "gallery-unfair": "not" },
    },
  },
});

const REPAIR_FIXTURE = fixtureItem({
  sectionKey: "review_reflection",
  templateKey: "ERROR_REFLECTION_CUE",
  targetWord: "necessary",
  canonicalWordId: "gallery-necessary",
  promptData: { misconceptionHint: "One collar and two sleeves: one c, two s letters." },
});

function ExampleFrame(props: { activityKey: string; children: ReactNode; modeSelector?: ReactNode }) {
  const activity = ADLE_ACTIVITY_CATALOGUE.find((entry) => entry.activityKey === props.activityKey);
  if (!activity) return null;
  return (
    <article className="grid gap-4 rounded-3xl border border-[var(--border)] bg-white p-5">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="brand-eyebrow">{activity.status}</p><h2 className="text-2xl font-black text-[color:var(--ink)]">{activity.displayName}</h2></div>
          {props.modeSelector}
        </div>
        <p className="text-sm text-[color:var(--mid)]">{activity.pedagogicalPurpose}</p>
        <code className="break-all text-xs text-[color:var(--mid)]">{activity.canonicalComponentPath}</code>
        <p className="text-xs text-[color:var(--mid)]">Routes: {activity.usedByRoutes.join(', ') || 'not wired'}</p>
      </header>
      <div className="rounded-2xl bg-slate-900 p-4 text-white">{props.children}</div>
    </article>
  );
}

function CleaverExample() {
  const [mode, setMode] = useState<"one" | "two" | "base">("one");
  const [misses, setMisses] = useState(0);
  const [correct, setCorrect] = useState(false);
  const [cuts, setCuts] = useState<number[]>([]);
  const [complete, setComplete] = useState(false);
  function change(next: "one" | "two" | "base") { setMode(next); setMisses(0); setCorrect(false); setCuts([]); setComplete(false); }
  const selector = <label className="text-xs font-semibold">Fixture mode<select className="ml-2 rounded-lg border bg-white px-2 py-1" value={mode} onChange={(event) => change(event.target.value as "one" | "two" | "base")}><option value="one">one boundary</option><option value="two">two boundaries</option><option value="base">isolate governed component</option></select></label>;
  const baseCorrect = [2, 6].every((point) => cuts.includes(point));
  return <ExampleFrame activityKey="CLEAVER" modeSelector={selector}>{mode === "base" ? complete ? <button type="button" className="rounded-full bg-cyan-300 px-5 py-3 font-black text-slate-950" onClick={() => change("base")}>Run again</button> : <SplitHandle word="unhelpful" splitPoints={[2, 6]} components={["un", "help", "ful"]} selectedBoundaries={cuts} isolatedComponentIndex={1} misses={misses} correct={baseCorrect} muted correctHeading="Yes — help is the governed base." onSelectedBoundariesChange={setCuts} onMiss={setMisses} onCorrect={() => undefined} onContinue={() => setComplete(true)} /> : <SplitHandle key={mode} word={mode === "one" ? "unfair" : "unhelpful"} splitPoints={mode === "one" ? [2] : [2, 6]} components={mode === "one" ? ["un", "fair"] : ["un", "help", "ful"]} misses={misses} correct={correct} muted onMiss={setMisses} onCorrect={() => setCorrect(true)} onContinue={() => change(mode)} />}</ExampleFrame>;
}

function AssemblyExample() {
  const [run, setRun] = useState(0);
  return <ExampleFrame activityKey="WORD_ASSEMBLY"><DefinitionWordBuilder key={run} targetId="gallery-unhelpful" definition="not helpful" tiles={[{ id: "un", text: "un", role: "prefix" }, { id: "re", text: "re", role: "prefix" }]} expectedIds={["un"]} fixedTiles={[{ id: "helpful", text: "helpful", role: "base" }]} fixedTilesPosition="after" label="Build unhelpful" wordSum="un + helpful → unhelpful" resultingMeaning="not helpful" continueLabel="Reset fixture" muted onContinue={() => setRun((value) => value + 1)} /></ExampleFrame>;
}

function SortExample() {
  const [run, setRun] = useState(0);
  return <ExampleFrame activityKey="MEANING_SORT"><BinSort key={run} muted items={[{ id: "unfair", text: "unfair", destination: "not" }, { id: "untie", text: "untie", destination: "reverse" }]} bins={[{ id: "not", label: "NOT" }, { id: "reverse", label: "REVERSE" }]} onComplete={() => setRun((value) => value + 1)} /></ExampleFrame>;
}

function CoverExample() {
  const [run, setRun] = useState(0);
  return <ExampleFrame activityKey="COVER_CHECK"><CoverShutter key={run} word="unhelpful" splitPoints={[2, 6]} components={["un", "help", "ful"]} muted onComplete={() => undefined} /><button type="button" className="mx-auto mt-4 block rounded-full border border-cyan-200 px-5 py-2 font-bold" onClick={() => setRun((value) => value + 1)}>Reset fixture</button></ExampleFrame>;
}

function SpellExamples() {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [recall, setRecall] = useState("");
  const [locked, setLocked] = useState(false);
  return <><ExampleFrame activityKey="DICTATION"><SentenceDictation stepLabel="Sentence 1 of 1" audioText="It is necessary to check the sentence." correctSentence="It is necessary to check the sentence." value={value} checked={checked} muted onValueChange={setValue} onCheck={() => setChecked(true)} continueLabel="Reset fixture" onContinue={() => { setValue(""); setChecked(false); }} /></ExampleFrame><ExampleFrame activityKey="COLD_WORD_RECALL"><ColdWordRecall mode="scheduled_review" targetWord="necessary" value={recall} locked={locked} label="Review word" muted onValueChange={setRecall} onLock={() => setLocked(true)} /></ExampleFrame></>;
}

function RepairExample() {
  const [value, setValue] = useState("");
  return <ExampleFrame activityKey="ERROR_REPAIR"><ReflectionActivity item={REPAIR_FIXTURE} priorAttempt="neccessary" value={value} onChange={setValue} /></ExampleFrame>;
}

function CompoundExamples() {
  const [jigsawRun, setJigsawRun] = useState(0);
  const [meaningRun, setMeaningRun] = useState(0);
  return <><ExampleFrame activityKey="COMPOUND_JIGSAW"><CompoundJigsawActivity key={jigsawRun} muted targets={[{ canonicalWordId: "gallery-sunflower", word: "sunflower", components: ["sun", "flower"], joins: ["none"] }, { canonicalWordId: "gallery-ice-cream", word: "ice cream", components: ["ice", "cream"], joins: ["space"] }]} onComplete={() => setJigsawRun((value) => value + 1)} /></ExampleFrame><ExampleFrame activityKey="MEANING_MATCH"><MeaningConnectionActivity key={meaningRun} muted targets={[{ canonicalWordId: "gallery-sunflower", word: "sunflower", definition: "a tall flower with a large round head", componentMeanings: ["sun", "flower"] }, { canonicalWordId: "gallery-raincoat", word: "raincoat", definition: "a coat worn to keep rain off", componentMeanings: ["rain", "coat"] }]} onComplete={() => setMeaningRun((value) => value + 1)} /></ExampleFrame></>;
}

export function ActivityCatalogueGallery() {
  return (
    <section className="grid gap-5" aria-labelledby="interactive-gallery-title">
      <div><p className="brand-eyebrow">Safe deterministic fixtures</p><h2 id="interactive-gallery-title" className="mt-2 text-3xl font-black">Interactive gallery</h2><p className="mt-2 text-sm text-[color:var(--mid)]">All state stays in this browser component and resets locally.</p></div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ExampleFrame activityKey="INTRODUCTION"><div className="text-slate-950"><IntroActivity item={INTRO_FIXTURE} /></div></ExampleFrame>
        <ExampleFrame activityKey="REVIEW_SORT"><div className="text-slate-950"><QuickSortActivity item={QUICK_SORT_FIXTURE} /></div></ExampleFrame>
        <CleaverExample />
        <AssemblyExample />
        <SortExample />
        <CoverExample />
        <SpellExamples />
        <RepairExample />
        <CompoundExamples />
      </div>
    </section>
  );
}
