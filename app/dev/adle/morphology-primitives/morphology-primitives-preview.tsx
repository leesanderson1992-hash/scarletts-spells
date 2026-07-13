"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { ActivityFrame, ActivityHeader, FeedbackPanel, InstructionPanel } from "@/components/adle/experience/activity-frame";
import {
  MeaningFlip,
  MorphemeGlossCard,
  MorphemeRail,
  MorphemeSequence,
  MorphologyDiff,
  RootArtifactCard,
  TransformationView,
  WordFamilyView,
  WordSplitView,
  useReducedMotionPreference,
} from "@/components/adle/activities/morphology/shared/morphology-primitives";
import type {
  MeaningFlipViewModel,
  MorphemeGlossCardViewModel,
  MorphemeSequenceViewModel,
  MorphologyDiffViewModel,
  RootArtifactCardViewModel,
  WordFamilyViewModel,
  WordSplitViewModel,
} from "@/lib/adle/ui/morphology-primitives";

export function MorphologyPrimitivesPreview(props: {
  pilotSequence: MorphemeSequenceViewModel;
  sequences: MorphemeSequenceViewModel[];
  splits: WordSplitViewModel[];
  meaningFlip: MeaningFlipViewModel;
  glossCards: MorphemeGlossCardViewModel[];
  rootArtifact: RootArtifactCardViewModel;
  family: WordFamilyViewModel;
  diff: MorphologyDiffViewModel;
}) {
  const [splitRevealed, setSplitRevealed] = useState(true);
  const reducedMotion = useReducedMotionPreference();
  const famous = props.sequences.find((sequence) => sequence.displayWord === "famous");
  const longWord = props.sequences.find((sequence) => sequence.displayWord === "unnecessary");

  return (
    <ActivityFrame
      header={
        <ActivityHeader
          title="Morphology primitive preview"
          instruction="Development-only proof that approved D4_MOR source records can become accessible primitive view models."
          modeLabel="ADLE 7-UI-F"
          progressLabel="No runtime wiring"
        />
      }
    >
      <div className="grid gap-5">
        <InstructionPanel
          instruction="These examples use approved D4_MOR v1 records and the approved un- pilot fixture."
          teachingCue="The preview composes primitives only; it does not submit, score, assign, or activate anything."
          watchForCue="Recall-neutral mode hides semantic colours, kind labels, glosses, and answer-supporting structure."
        />

        <PreviewPanel title="Pilot fixture: simple prefix" caption={props.pilotSequence.sourceExpression}>
          <MorphemeSequence sequence={props.pilotSequence} mode="teaching" />
          <div className="mt-3">
            <MeaningFlip flip={props.meaningFlip} reduceMotion={reducedMotion} />
          </div>
        </PreviewPanel>

        <PreviewPanel title="Tap and keyboard assembly rail" caption="No correctness policy; this only proves selection and placement mechanics.">
          <MorphemeRail tiles={props.pilotSequence.parts} mode="guided" label="Build the approved un- example" />
        </PreviewPanel>

        <PreviewPanel title="Recall-neutral tile variant" caption="The same data rendered without semantic colour, labels, glosses, or hidden answer text.">
          <MorphemeSequence sequence={props.pilotSequence} mode="recall_neutral" />
        </PreviewPanel>

        <PreviewPanel title="Boundary and separator cases" caption="Approved joins are shown; no boundary guessing happens in the component.">
          <div className="grid gap-3">
            {props.sequences
              .filter((sequence) =>
                ["misspell", "ice cream", "mother-in-law", "thermometer", "telephone"].includes(sequence.displayWord),
              )
              .map((sequence) => (
                <div key={sequence.id} className="rounded-2xl border border-[var(--border)] bg-[#fff8fc] p-3">
                  <p className="mb-2 text-sm font-semibold text-[color:var(--text)]">{sequence.displayWord}</p>
                  <MorphemeSequence sequence={sequence} mode="teaching" />
                </div>
              ))}
          </div>
        </PreviewPanel>

        {famous ? (
          <PreviewPanel title="Source-to-surface transformation" caption={famous.sourceExpression}>
            <MorphemeSequence sequence={famous} mode="teaching" />
            <div className="mt-3">
              <TransformationView transformations={famous.transformations} />
            </div>
          </PreviewPanel>
        ) : null}

        <PreviewPanel title="Word split view" caption="The reveal affordance belongs to the preview, not to a production template.">
          <WordSplitView
            split={props.splits[0]}
            revealed={splitRevealed}
            onToggleReveal={() => setSplitRevealed((current) => !current)}
          />
        </PreviewPanel>

        <PreviewPanel title="Glosses, root artifact, and family cards" caption="Root origin and experience profile stay separate from runtime evidence.">
          <div className="grid gap-3 lg:grid-cols-2">
            {props.glossCards.map((gloss) => (
              <MorphemeGlossCard key={gloss.id} gloss={gloss} />
            ))}
            <RootArtifactCard artifact={props.rootArtifact} />
            <WordFamilyView family={props.family} />
          </div>
        </PreviewPanel>

        <PreviewPanel title="Post-submit diff primitive" caption="Static preview only; it does not classify attempts or create evidence.">
          <MorphologyDiff diff={props.diff} />
        </PreviewPanel>

        {longWord ? (
          <PreviewPanel title="Long-word wrapping" caption={longWord.displayWord}>
            <MorphemeSequence sequence={longWord} mode="teaching" />
          </PreviewPanel>
        ) : null}

        <FeedbackPanel
          tone="complete"
          message="Primitive proof is isolated from composer, Supabase, assignment generation, attempts, and the live ADLE child session."
          detail="This route is guarded outside development."
        />
      </div>
    </ActivityFrame>
  );
}

function PreviewPanel(props: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-[color:var(--text)]">{props.title}</h2>
        <p className="mt-1 text-sm text-[color:var(--mid)]">{props.caption}</p>
      </div>
      {props.children}
    </section>
  );
}
