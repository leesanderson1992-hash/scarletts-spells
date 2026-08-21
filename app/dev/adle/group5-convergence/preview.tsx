"use client";

import { useState } from "react";
import { BinSort } from "@/components/adle/activities/shared/bin-sort";
import { MeaningConnectionActivity } from "@/components/adle/morphology/meaning-connection-activity";
import { Discovery } from "@/components/adle/morphology/morphology-guided-lesson";
import { compileMorphologyUnPilotPayload, type MorphologyLessonPayloadV1 } from "@/lib/adle/morphology/payload";

const PREFIX_PAYLOAD = compileMorphologyUnPilotPayload({ unhappy: "g5-unhappy", unfair: "g5-unfair", unkind: "g5-unkind", unlock: "g5-unlock", untidy: "g5-untidy", unnatural: "g5-unnatural", unnecessary: "g5-unnecessary" });
const SUFFIX_PAYLOAD: MorphologyLessonPayloadV1 = {
  ...PREFIX_PAYLOAD,
  contentVersion: "g5-suffix-discovery-fixture",
  words: { ...PREFIX_PAYLOAD.words, anchor: { ...PREFIX_PAYLOAD.words.anchor, canonicalWordId: "g5-careful", displayWord: "careful", audioText: "careful", baseWord: "care", baseMeaning: "attention and thought", derivedMeaning: "showing care", effect: "not", affixPosition: "after", affixText: "ful", affixLabel: "-ful" } },
  activities: PREFIX_PAYLOAD.activities.map((activity) => activity.type === "discovery" ? { ...activity, prefixLabel: "-ful", affixTerm: "suffix" as const, affixPosition: "after" as const, discoveryCards: [{ word: "careful", baseWord: "care", baseMeaning: "attention and thought", derivedMeaning: "showing care", distractorMeaning: "without care", prefixLabel: "-ful" }, { word: "hopeful", baseWord: "hope", baseMeaning: "a wish for something good", derivedMeaning: "full of hope", distractorMeaning: "without hope", prefixLabel: "-ful" }] } : activity),
};

const MATCH_TARGETS = [
  { canonicalWordId: "g5-rainbow", word: "rainbow", audioText: "rainbow", definition: "a band of colours seen in the sky", componentMeanings: ["rain", "bow"], componentToWholeRelationship: "The colours curve like a bow after rain." },
  { canonicalWordId: "g5-football", word: "football", audioText: "football", definition: "a game played with a ball", componentMeanings: ["foot", "ball"] },
  { canonicalWordId: "g5-bedroom", word: "bedroom", audioText: "bedroom", definition: "a room for sleeping", componentMeanings: ["bed", "room"] },
] as const;
const PREFIX_ITEMS = [{ id: "unfair", text: "unfair", destination: "not" }, { id: "unkind", text: "unkind", destination: "not" }, { id: "unlock", text: "unlock", destination: "reverse" }, { id: "untie", text: "untie", destination: "reverse" }];
const PREFIX_BINS = [{ id: "not", label: "NOT", description: "un- changes the meaning to not" }, { id: "reverse", label: "REVERSE", description: "un- reverses an action" }];
const SUFFIX_ITEMS = [{ id: "hopeful", text: "hopeful", destination: "full" }, { id: "careful", text: "careful", destination: "full" }, { id: "hopeless", text: "hopeless", destination: "without" }, { id: "careless", text: "careless", destination: "without" }];
const SUFFIX_BINS = [{ id: "full", label: "FULL OF" }, { id: "without", label: "WITHOUT" }];

export type Group5Fixture = "prefix-discover" | "suffix-discover" | "meaning-match" | "meaning-match-incorrect" | "compound-match" | "prefix-sort" | "suffix-sort" | "sort-sparkle" | "sort-incorrect" | "sort-overview" | "sort-reduced-motion" | "keyboard" | "narrow";

function DiscoverFixture(props: { suffix: boolean }) {
  const [index, setIndex] = useState(0); const [added, setAdded] = useState(false); const payload = props.suffix ? SUFFIX_PAYLOAD : PREFIX_PAYLOAD;
  return <Discovery key={index} payload={payload} index={index} muted addedPrefix={added} onAddPrefix={() => setAdded(true)} onNext={() => { setIndex((current) => (current + 1) % (payload.activities.find((activity) => activity.type === "discovery")?.discoveryCards?.length ?? 1)); setAdded(false); }} />;
}

function MatchFixture() {
  const [run, setRun] = useState(0);
  return <MeaningConnectionActivity key={run} targets={MATCH_TARGETS} muted onComplete={() => setRun((current) => current + 1)} />;
}

function SortFixture(props: { suffix?: boolean; oneItem?: boolean; overview?: boolean }) {
  const [run, setRun] = useState(0); const allItems = props.suffix ? SUFFIX_ITEMS : PREFIX_ITEMS; const bins = props.suffix ? SUFFIX_BINS : PREFIX_BINS; const items = props.oneItem ? allItems.slice(0, 1) : allItems;
  return <BinSort key={run} items={items} bins={bins} initialComplete={props.overview} showBinDescriptions={!props.suffix} muted instruction={props.suffix ? "Read the word and choose what its suffix means." : "Read the word and choose what un- means."} completionCopy={{ eyebrow: props.suffix ? "Suffix Overview" : "Prefix Overview", title: "Every word is in its meaning group", summary: "This is the completion state of the same Sort activity.", continueLabel: "Run fixture again" }} onContinue={() => setRun((current) => current + 1)} />;
}

export function Group5ConvergencePreview(props: { fixture: Group5Fixture }) {
  const discovery = props.fixture === "prefix-discover" || props.fixture === "suffix-discover";
  const match = props.fixture === "meaning-match" || props.fixture === "meaning-match-incorrect" || props.fixture === "compound-match";
  const instruction = props.fixture === "meaning-match-incorrect" ? "First connect a word to the wrong definition, then complete the matches." : props.fixture === "sort-incorrect" ? "Choose the wrong category once, then complete the sort." : props.fixture === "keyboard" ? "Use Tab and Enter or Space only." : props.fixture === "sort-reduced-motion" ? "Enable reduced motion: success stays clear and static." : "Use the real canonical component below.";
  return <main className="min-h-screen bg-slate-950 p-4 text-white md:p-10"><div className="mx-auto grid max-w-4xl gap-5"><header><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Write-free Group 5 fixture</p><h1 className="mt-2 text-3xl font-black">{props.fixture.replaceAll("-", " ")}</h1><p className="mt-2 text-sm text-slate-300">{instruction} Local React state only; no server action, learner evidence, or persistence.</p></header><section className="rounded-3xl border border-white/15 bg-slate-900 p-4 md:p-7">{discovery ? <DiscoverFixture suffix={props.fixture === "suffix-discover"} /> : match ? <MatchFixture /> : <SortFixture suffix={props.fixture === "suffix-sort" || props.fixture === "narrow"} oneItem={props.fixture === "sort-sparkle" || props.fixture === "sort-reduced-motion"} overview={props.fixture === "sort-overview"} />}</section></div></main>;
}
