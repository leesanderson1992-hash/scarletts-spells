"use client";

import { useEffect, useState } from "react";

import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { ColdWordRecall } from "@/components/adle/activities/shared/cold-word-recall";
import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { SentenceDictation } from "@/components/adle/activities/shared/sentence-dictation";

const FIXTURES = {
  "prefix-cover": { kind: "cover", label: "Prefix Cover Check", word: "unhelpful", splitPoints: [2, 6], components: ["un", "help", "ful"] },
  "suffix-cover": { kind: "cover", label: "Suffix Cover Check", word: "kindness", splitPoints: [4], components: ["kind", "ness"] },
  "base-word-cover": { kind: "cover", label: "Base Word Cover Check", word: "replayed", splitPoints: [2, 6], components: ["re", "play", "ed"] },
  "compound-cover": { kind: "cover", label: "Compound Cover Check", word: "rainbow", splitPoints: [4], components: ["rain", "bow"] },
  "prefix-sentence": { kind: "sentence", label: "Prefix Sentence Dictation", sentence: "It was unfair to change the rules." },
  "suffix-sentence": { kind: "sentence", label: "Suffix Sentence Dictation", sentence: "Her kindness made the new pupil smile." },
  "base-word-sentence": { kind: "sentence", label: "Base Word Sentence Dictation", sentence: "We replayed the song after lunch." },
  "compound-sentence": { kind: "sentence", label: "Compound Sentence Dictation", sentence: "A rainbow appeared after the rain." },
  "scheduled-review": { kind: "recall", label: "ColdWordRecall · scheduled review", word: "necessary", mode: "scheduled_review" },
  "diagnostic-probe": { kind: "recall", label: "ColdWordRecall · diagnostic probe", word: "mischievous", mode: "diagnostic_probe" },
  "prefix-reflection-capital": { kind: "reflection", label: "Prefix Reflection · missing capital", attempt: "it was unfair to change the rules.", correct: "It was unfair to change the rules.", subject: "prefix un-" },
  "prefix-reflection-punctuation": { kind: "reflection", label: "Prefix Reflection · missing punctuation", attempt: "It was unfair to change the rules", correct: "It was unfair to change the rules.", subject: "prefix un-" },
  "suffix-reflection": { kind: "reflection", label: "Suffix Reflection · sentence feedback", attempt: "her kindness made the new pupil smile", correct: "Her kindness made the new pupil smile.", subject: "suffix -ness" },
  "base-word-reflection": { kind: "reflection", label: "Base Word Reflection · sentence feedback", attempt: "we replayed the song after lunch", correct: "We replayed the song after lunch.", subject: "base word play" },
  "compound-reflection": { kind: "reflection", label: "Compound Reflection · accepted baseline", attempt: "a rainbow appeared after the rain", correct: "A rainbow appeared after the rain.", subject: "compound words" },
} as const;

export type Group3Fixture = keyof typeof FIXTURES;

export function Group3ConvergencePreview(props: { fixture: Group3Fixture }) {
  const fixture = FIXTURES[props.fixture];
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [run, setRun] = useState(0);
  const recallResumeKey = `adle:group3-convergence:${props.fixture}`;

  useEffect(() => {
    if (fixture.kind !== "recall") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(recallResumeKey) ?? "null") as { value?: unknown; locked?: unknown } | null;
        if (typeof saved?.value === "string" && typeof saved.locked === "boolean") {
          setValue(saved.value);
          setChecked(saved.locked);
        }
      } catch { /* A fresh fixture remains safe if browser storage is unavailable. */ }
    });
    return () => { active = false; };
  }, [fixture.kind, recallResumeKey]);

  useEffect(() => {
    if (fixture.kind !== "recall") return;
    try { window.sessionStorage.setItem(recallResumeKey, JSON.stringify({ value, locked: checked })); } catch { /* Fixture stays write-free. */ }
  }, [checked, fixture.kind, recallResumeKey, value]);

  function resetRecallFixture() {
    try { window.sessionStorage.removeItem(recallResumeKey); } catch { /* Local reset still works. */ }
    setValue("");
    setChecked(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white md:p-10">
      <div className="mx-auto grid max-w-2xl gap-5">
        <header>
          <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Write-free Group 3 fixture</p>
          <h1 className="mt-2 text-3xl font-black">{fixture.label}</h1>
          <p className="mt-2 text-sm text-slate-300">Local component state only. This page has no server action and writes no learner evidence.</p>
        </header>
        <section className="rounded-3xl border border-white/15 bg-slate-900 p-5 md:p-7">
          {fixture.kind === "cover" ? (
            <CoverShutter
              key={run}
              word={fixture.word}
              splitPoints={[...fixture.splitPoints]}
              components={[...fixture.components]}
              stepLabel={fixture.label}
              onComplete={() => undefined}
              continueLabel="Reset fixture"
              onContinue={() => setRun((current) => current + 1)}
            />
          ) : null}
          {fixture.kind === "sentence" ? (
            <SentenceDictation
              stepLabel={fixture.label}
              audioText={fixture.sentence}
              correctSentence={fixture.sentence}
              value={value}
              checked={checked}
              onValueChange={setValue}
              onCheck={() => setChecked(true)}
              continueLabel="Reset fixture"
              onContinue={() => { setValue(""); setChecked(false); }}
            />
          ) : null}
          {fixture.kind === "recall" ? (
            <>
              <ColdWordRecall
                mode={fixture.mode}
                targetWord={fixture.word}
                value={value}
                locked={checked}
                label={fixture.mode === "scheduled_review" ? "Scheduled review word" : "Detective word"}
                onValueChange={setValue}
                onLock={() => setChecked(true)}
              />
              <button type="button" onClick={resetRecallFixture} className="brand-secondary-btn justify-self-center">Reset fixture state</button>
            </>
          ) : null}
          {fixture.kind === "reflection" ? (
            <LessonReflection
              mistakes={[]}
              sentenceComparisons={[{ id: props.fixture, attempt: fixture.attempt, correct: fixture.correct }]}
              prompt={`What did you learn about spelling with the ${fixture.subject}?`}
              response={value}
              onResponseChange={setValue}
              onComplete={() => setChecked(true)}
              completionLabel={checked ? "Reflection complete" : "Finish fixture"}
              disabled={checked}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}
