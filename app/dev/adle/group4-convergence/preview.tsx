"use client";

import { useState } from "react";

import { SpellingTransformationReveal } from "@/components/adle/activities/shared/spelling-transformation-reveal";
import { SplitHandle } from "@/components/adle/activities/shared/split-handle";

const FIXTURES = {
  "prefix-standard": { label: "Prefix Split", word: "unkind", splitPoints: [2], components: ["un", "kind"] },
  "suffix-standard": { label: "Suffix Split", word: "kindness", splitPoints: [4], components: ["kind", "ness"] },
  "base-single": { label: "Base Word · one boundary", word: "played", splitPoints: [4], components: ["play", "ed"], isolatedComponentIndex: 0 },
  "base-multi": { label: "Base Word · two boundaries", word: "replayed", splitPoints: [2, 6], components: ["re", "play", "ed"], isolatedComponentIndex: 1 },
  "base-multi-restored": { label: "Base Word · restored first boundary", word: "replayed", splitPoints: [2, 6], components: ["re", "play", "ed"], isolatedComponentIndex: 1, selectedBoundaries: [2] },
  "base-final-y": { label: "Base Word · post-split final-y reveal", word: "happiness", splitPoints: [5], components: ["happi", "ness"], isolatedComponentIndex: 0, transformation: { surfaceText: "happi", sourceText: "happy", explanation: "Change the final i back to y before you add the ending." } },
  scaffold: { label: "Split · two-miss scaffold", word: "unkind", splitPoints: [2], components: ["un", "kind"], misses: 2 },
} as const;

export type Group4Fixture = keyof typeof FIXTURES;

export function Group4ConvergencePreview(props: { fixture: Group4Fixture }) {
  const fixture = FIXTURES[props.fixture];
  const [selectedBoundaries, setSelectedBoundaries] = useState<number[]>("selectedBoundaries" in fixture ? [...fixture.selectedBoundaries] : []);
  const [misses, setMisses] = useState("misses" in fixture ? fixture.misses : 0);
  const [finished, setFinished] = useState(false);
  const splitComplete = fixture.splitPoints.every((point) => selectedBoundaries.includes(point));
  const transformation = "transformation" in fixture ? fixture.transformation : undefined;
  const isolatedComponentIndex = "isolatedComponentIndex" in fixture ? fixture.isolatedComponentIndex : undefined;

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white md:p-10">
      <div className="mx-auto grid max-w-2xl gap-5">
        <header>
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Write-free Group 4 fixture</p>
          <h1 className="mt-2 text-3xl font-black">{fixture.label}</h1>
          <p className="mt-2 text-sm text-slate-300">Actual production components with local React state only. No server action, learner evidence, or browser persistence.</p>
          <output className="sr-only" data-fixture-boundaries={selectedBoundaries.join(",")}>Selected boundaries: {selectedBoundaries.join(",") || "none"}</output>
        </header>
        <section className="rounded-3xl border border-white/15 bg-slate-900 p-5 md:p-7">
          {finished ? (
            <section className="grid gap-4 text-center" data-fixture-state="finished">
              <p className="text-2xl font-black">Fixture complete.</p>
              <button type="button" className="brand-primary-btn mx-auto" onClick={() => { setSelectedBoundaries("selectedBoundaries" in fixture ? [...fixture.selectedBoundaries] : []); setMisses("misses" in fixture ? fixture.misses : 0); setFinished(false); }}>Run again</button>
            </section>
          ) : splitComplete && transformation ? (
            <SpellingTransformationReveal {...transformation} actionLabel="Change i to y" continueLabel="Complete fixture" muted onContinue={() => setFinished(true)} />
          ) : (
            <SplitHandle
              word={fixture.word}
              splitPoints={[...fixture.splitPoints]}
              components={[...fixture.components]}
              selectedBoundaries={selectedBoundaries}
              isolatedComponentIndex={isolatedComponentIndex}
              misses={misses}
              correct={splitComplete}
              muted
              prompt={isolatedComponentIndex === undefined ? undefined : "Chop beside the governed base word."}
              repeatedMissMessage={isolatedComponentIndex === undefined ? undefined : "Choose one of the glowing gaps beside the base word."}
              correctHeading={isolatedComponentIndex === undefined ? undefined : `Yes — ${fixture.components[isolatedComponentIndex]} is the base word.`}
              continueLabel="Complete fixture"
              onSelectedBoundariesChange={setSelectedBoundaries}
              onMiss={setMisses}
              onCorrect={() => undefined}
              onContinue={() => setFinished(true)}
            />
          )}
        </section>
      </div>
    </main>
  );
}
