"use client";

import { useEffect, useState } from "react";

import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { BaseWordCleaver, CoverShutter, SentenceDictation } from "@/components/adle/activities/shared";
import { DefinitionWordBuilder } from "@/components/adle/activities/shared/definition-word-builder";
import { deterministicOrderedBuildOrder } from "@/components/adle/activities/shared/ordered-build-engine";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { extractAuthoredTargetToken } from "@/lib/adle/morphology/payload";
import { finalYRestorationForBasePart, type BaseWordFamilyLessonSnapshotV1, type BaseWordFamilySnapshotWord } from "@/lib/adle/morphology/base-word-family-payload";
import { baseWordFamilyResumeKey, normaliseBaseWordFamilyResume, type BaseWordFamilyResumeState } from "@/lib/adle/morphology/base-word-family-resume";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import {
  lessonReflectionSentenceComparison,
  lessonReflectionPrompt,
  type NormalizedLessonReflectionMistake,
  type NormalizedLessonReflectionSentenceComparison,
} from "@/lib/adle/lesson-reflection";
import { WordLabScene } from "./word-lab-scene";

const INITIAL: BaseWordFamilyResumeState = {
  stage: "intro", familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0,
  controlledIndex: 0, dictationIndex: 0, controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: "",
};

type Part = { id: string; sourceText: string; surfaceText: string; gloss?: string; kind?: string };
function parts(word: BaseWordFamilySnapshotWord): Part[] { return word.parts.filter((part): part is Part => !!part && typeof part === "object" && typeof (part as Part).id === "string" && typeof (part as Part).sourceText === "string" && typeof (part as Part).surfaceText === "string"); }
function guideBeat(stage: BaseWordFamilyResumeState["stage"]): GuideBeatV1 {
  const copy: Record<BaseWordFamilyResumeState["stage"], { say: string; goal: string; waitFor: string }> = {
    intro: { say: "Let’s use a familiar base word to unlock a whole family of words.", goal: "Learn the base-word strategy", waitFor: "your next step" },
    families: { say: "Tap the word from your writing and watch its family appear.", goal: "Meet a word family", waitFor: "a family reveal" },
    cleave: { say: "Use the cleaver to find where the meaningful word parts join.", goal: "Find the base inside the word", waitFor: "the correct split" },
    word_sums: { say: "Build the word that matches the meaning. Each tile is a useful word part.", goal: "Build word sums", waitFor: "a completed word" },
    controlled: { say: "Now the word hides. Use the base word to help you remember its spelling.", goal: "Remember six words", waitFor: "your independent spelling" },
    dictation: { say: "Listen carefully, then write the whole sentence in context.", goal: "Use words in sentences", waitFor: "your dictation" },
    reflect: { say: "Tell me how finding the base word helped you today.", goal: "Reflect on the strategy", waitFor: "your reflection" },
  };
  const current = copy[stage];
  return { id: `base-word-${stage}`, activityId: stage, state: stage === "reflect" ? "reflect" : "focus", say: current.say, narration: current.say, goal: current.goal, waitFor: current.waitFor, onComplete: "Great thinking — keep using the base word as your spelling anchor." };
}

function clueFor(stage: BaseWordFamilyResumeState["stage"]): string {
  return stage === "families" ? "Tap the large word card. Its related words will appear around the base." : stage === "cleave" ? "Look for the edge of a meaningful word part. After two tries, the cleaver will point to it." : stage === "word_sums" ? "Choose the base tile first, then add any beginning or ending tiles in the order you hear them." : stage === "controlled" ? "Picture the word family and its base before you write." : stage === "dictation" ? "Listen more than once if you need to. Write the whole sentence, then check it." : "A base word is a familiar word that stays inside a longer word.";
}

export function BaseWordFamilyGuidedLesson(props: {
  previewId?: string; assignmentId?: string; payload: BaseWordFamilyLessonSnapshotV1;
  submitting?: boolean;
  onPreviewComplete?: (reflection: string) => void;
  onComplete?: (input: { reflection: string; controlledAttempts: Record<string, string>; sentenceAttempts: Record<string, string> }) => void;
}) {
  const [state, setState] = useState<BaseWordFamilyResumeState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [muted, setMuted] = useState(false);
  const [clueOpen, setClueOpen] = useState(false);
  const key = baseWordFamilyResumeKey(props.assignmentId ?? props.previewId ?? "base-word-family", props.payload.contentVersion);
  const update = (patch: Partial<BaseWordFamilyResumeState>) => { setClueOpen(false); setState((current) => ({ ...current, ...patch })); };
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = window.localStorage.getItem(key);
        const restored = saved
          ? normaliseBaseWordFamilyResume(JSON.parse(saved), props.payload)
          : null;
        if (restored) setState(restored);
      } catch {
        /* Resume is optional. */
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [key, props.payload]);
  useEffect(() => { if (!hydrated) return; try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* Resume is optional. */ } }, [hydrated, key, state]);
  if (!hydrated) return <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div>;
  const guidedWords = props.payload.familySections.flatMap((section) => section.guidedWords);
  const independent = props.payload.independentWords[state.stage === "controlled" ? state.controlledIndex : state.dictationIndex];
  const phase = state.stage === "intro" ? 0 : state.stage === "families" ? 1 : state.stage === "cleave" ? 2 : state.stage === "word_sums" ? 4 : state.stage === "controlled" ? 5 : 5;
  const definitionBuild = baseWordDefinitionBuild(guidedWords, state.buildIndex);
  const reflectionModel = baseWordLessonReflectionModel(props.payload, state.sentenceAttempts);
  return <WordLabScene beat={guideBeat(state.stage)} phase={phase} muted={muted} onMutedChange={setMuted} silent={state.stage === "controlled" || state.stage === "dictation"} help={clueOpen ? clueFor(state.stage) : undefined} onHelp={() => setClueOpen((current) => !current)} guideName="Word Builder">
    {state.stage === "intro" ? <Intro payload={props.payload} onNext={() => update({ stage: "families" })} /> : null}
    {state.stage === "families" ? <FamilyReveal key={props.payload.familySections[state.familyIndex].baseFamilyKey} section={props.payload.familySections[state.familyIndex]} number={state.familyIndex + 1} total={props.payload.familySections.length} onNext={() => update({ stage: "cleave", cleaveIndex: state.familyIndex, cleaveStep: 0 })} /> : null}
    {state.stage === "cleave" ? <Cleave word={guidedWords.find((word) => word.canonicalWordId === props.payload.authenticTargets[state.cleaveIndex].canonicalWordId)} cuts={state.cleaveCuts} misses={state.cleaveMisses} onCutsChange={(wordId, cuts) => update({ cleaveCuts: { ...state.cleaveCuts, [wordId]: cuts }, cleaveStep: cuts.length })} onMiss={(id, misses) => update({ cleaveMisses: { ...state.cleaveMisses, [id]: misses } })} onNext={() => state.cleaveIndex + 1 < props.payload.authenticTargets.length ? update({ stage: "families", familyIndex: state.cleaveIndex + 1, cleaveStep: 0 }) : update({ stage: "word_sums", buildIndex: 0 })} /> : null}
    {state.stage === "word_sums" ? <DefinitionWordBuilder key={definitionBuild.targetId} {...definitionBuild} muted={muted} onContinue={() => state.buildIndex + 1 < guidedWords.length ? update({ buildIndex: state.buildIndex + 1 }) : update({ stage: "controlled" })} /> : null}
    {state.stage === "controlled" ? <CoverShutter key={independent.canonicalWordId} stepLabel={`Word to remember ${state.controlledIndex + 1} of ${props.payload.independentWords.length}`} word={independent.displayWord} splitPoints={[]} initialAttempt={state.controlledAttempts[independent.canonicalWordId] ?? ""} initialState={state.controlledChecked[independent.canonicalWordId] === true ? "check" : state.controlledAttempts[independent.canonicalWordId] ? "write" : "look"} muted={false} onStateChange={(_, attempt) => { if (attempt) update({ controlledAttempts: { ...state.controlledAttempts, [independent.canonicalWordId]: attempt } }); }} onComplete={(attempt) => update({ controlledAttempts: { ...state.controlledAttempts, [independent.canonicalWordId]: attempt }, controlledChecked: { ...state.controlledChecked, [independent.canonicalWordId]: true } })} onContinue={() => state.controlledIndex + 1 < props.payload.independentWords.length ? update({ controlledIndex: state.controlledIndex + 1 }) : update({ stage: "dictation", dictationIndex: 0 })} /> : null}
    {state.stage === "dictation" ? <SentenceDictation key={independent.canonicalWordId} stepLabel={`Sentence ${state.dictationIndex + 1} of ${props.payload.independentWords.length}`} audioText={independent.audioText} correctSentence={independent.dictationSentence} value={state.sentenceAttempts[independent.canonicalWordId] ?? ""} checked={state.sentenceChecked} muted={false} onValueChange={(value) => update({ sentenceAttempts: { ...state.sentenceAttempts, [independent.canonicalWordId]: value } })} onCheck={() => update({ sentenceChecked: true })} continueLabel={state.dictationIndex + 1 < props.payload.independentWords.length ? "Next sentence" : "Reflect"} onContinue={() => state.dictationIndex + 1 < props.payload.independentWords.length ? update({ dictationIndex: state.dictationIndex + 1, sentenceChecked: false }) : update({ stage: "reflect", sentenceChecked: false })} /> : null}
    {state.stage === "reflect" ? <LessonReflection
      mistakes={reflectionModel.mistakes}
      sentenceComparisons={reflectionModel.sentenceComparisons}
      prompt={lessonReflectionPrompt({ kind: "base_word", values: props.payload.familySections.map((section) => section.baseWord.displayWord) })}
      response={state.reflectionText}
      pending={props.submitting === true}
      completionLabel={props.onComplete ? "Finish Word Lab" : "Finish preview"}
      onResponseChange={(reflectionText) => update({ reflectionText })}
      onComplete={() => { if (props.submitting) return; props.onPreviewComplete?.(state.reflectionText); props.onComplete?.({ reflection: state.reflectionText, controlledAttempts: state.controlledAttempts, sentenceAttempts: state.sentenceAttempts }); }}
    /> : null}
  </WordLabScene>;
}

function Intro(props: { payload: BaseWordFamilyLessonSnapshotV1; onNext: () => void }) { return <section className="grid gap-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Base-word strategy</p><h1 className="text-3xl font-black text-white">A familiar base can help you spell bigger words.</h1><p className="mx-auto max-w-2xl text-lg leading-8 text-cyan-50">Today we will look for a base word that stays inside a longer word. Knowing one spelling can help with many related words.</p><div className="grid gap-3 sm:grid-cols-2">{props.payload.authenticTargets.map((target) => <article key={target.canonicalWordId} className="rounded-2xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">A word from your writing</p><p className="mt-1 text-2xl font-black">{props.payload.familySections.flatMap((section) => section.guidedWords).find((word) => word.canonicalWordId === target.canonicalWordId)?.displayWord}</p></article>)}</div><button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Meet the word families</button></section>; }

function FamilyReveal(props: { section: BaseWordFamilyLessonSnapshotV1["familySections"][number]; number: number; total: number; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const target = props.section.guidedWords.find((word) => props.section.authenticTargetWordIds.includes(word.canonicalWordId))!;
  return <section className="grid gap-5 text-center" aria-labelledby={`family-${props.section.baseFamilyKey}`}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Meet your words · family {props.number} of {props.total}</p>
    <h2 id={`family-${props.section.baseFamilyKey}`} className="text-3xl font-black text-white">This word came from your writing</h2>
    <button type="button" onClick={() => setRevealed(true)} aria-expanded={revealed} className="group mx-auto grid min-h-32 min-w-56 place-items-center rounded-[2rem] border-4 border-amber-200 bg-amber-100 px-7 py-5 text-3xl font-black text-amber-950 shadow-[0_16px_0_rgba(146,64,14,.25)] transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300">
      <span className="text-xs font-black uppercase tracking-[.16em] text-amber-800">Tap to open</span><span>{target.displayWord}</span>
    </button>
    {!revealed ? <p className="text-cyan-50">Tap it and its word family will jump out.</p> : <>
      <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-200/30 bg-cyan-100/10 p-4"><p className="text-sm font-semibold text-cyan-50">Every word in this family keeps the familiar base.</p><div className="mt-3 inline-flex flex-col items-center rounded-2xl bg-amber-100 px-6 py-4 text-amber-950 shadow-lg"><span className="text-xs font-black uppercase tracking-[.15em]">Base word</span><strong className="text-3xl">{props.section.baseWord.displayWord}</strong><span className="mt-1 text-sm font-semibold">{props.section.baseMeaning}</span></div></div>
      <div className="grid gap-3 sm:grid-cols-2">{props.section.guidedWords.map((word, index) => <article key={word.canonicalWordId} className="rounded-2xl border border-white/25 bg-white p-4 text-left text-slate-950 shadow-[0_10px_0_rgba(8,47,73,.2)] motion-safe:animate-[pulse_350ms_ease-out_both]" style={{ animationDelay: `${index * 110}ms` }}><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">{word.canonicalWordId === props.section.baseWord.canonicalWordId ? "The base" : `base + word part${word.parts.length > 2 ? "s" : ""}`}</p><p className="mt-1 text-2xl font-black">{word.displayWord}</p><p className="mt-1 text-sm font-semibold text-slate-600">{word.childFriendlyMeaning}</p></article>)}</div>
      <button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Use the cleaver</button>
    </>}
  </section>;
}

function Cleave(props: { word: BaseWordFamilySnapshotWord | undefined; cuts: Record<string, number[]>; misses: Record<string, number>; onCutsChange: (wordId: string, cuts: number[]) => void; onMiss: (id: string, misses: number) => void; onNext: () => void }) {
  const word = props.word;
  const wordParts = word ? parts(word) : [];
  const baseIndex = wordParts.findIndex((part) => part.kind === "base");
  const valid = !!word && baseIndex >= 0 && wordParts.filter((part) => part.kind === "base").length === 1 && wordParts.length > 1;
  if (!valid) return <section className="grid gap-5 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Find the word parts</p><h2 className="text-3xl font-black text-white">This word needs a different way to explore its parts.</h2><p className="text-cyan-50">Let’s carry on with the rest of the Word Lab.</p><button type="button" onClick={props.onNext} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Build words from meanings</button></section>;
  const key = `${word!.canonicalWordId}:base`;
  const basePart = wordParts[baseIndex];
  const transformation = finalYRestorationForBasePart(basePart, word!.transformations ?? []);
  const finalYRestoration = transformation ? { sourceText: transformation.sourceText, surfaceText: transformation.surfaceText, explanation: transformation.explanation } : undefined;
  return <BaseWordCleaver word={word!.displayWord} segments={wordParts.map((part) => ({ id: part.id, text: part.surfaceText }))} baseIndex={baseIndex} finalYRestoration={finalYRestoration} selectedCuts={props.cuts[word!.canonicalWordId] ?? []} misses={props.misses[key] ?? 0} onCutsChange={(cuts) => props.onCutsChange(word!.canonicalWordId, cuts)} onMiss={(misses) => props.onMiss(key, misses)} onContinue={props.onNext} />;
}

function baseWordDefinitionBuild(words: BaseWordFamilySnapshotWord[], index: number) {
  const word = words[index];
  const allParts = [...new Map(words.flatMap(parts).map((part) => [part.surfaceText, part])).values()];
  const expectedParts = parts(word);
  const distractors = allParts.filter((part) => !expectedParts.some((expected) => expected.surfaceText === part.surfaceText)).slice(0, 3);
  const toTile = (id: string, part: Part) => ({ id, text: part.surfaceText, role: part.kind === "prefix" ? "prefix" as const : part.kind === "suffix" ? "suffix" as const : "base" as const, gloss: part.gloss });
  const expectedIds = expectedParts.map((part) => `${word.canonicalWordId}:required:${part.id}`);
  const sourceTiles = [...expectedParts.map((part) => toTile(`${word.canonicalWordId}:required:${part.id}`, part)), ...distractors.map((part) => toTile(`${word.canonicalWordId}:distractor:${part.id}`, part))];
  const tiles = deterministicOrderedBuildOrder(sourceTiles, `${word.canonicalWordId}:definition-word-builder`);
  if (expectedIds.every((id, expectedIndex) => tiles[expectedIndex]?.id === id)) {
    const first = tiles.shift();
    if (first) tiles.push(first);
  }
  const governedJoins: Array<"none" | "space" | "hyphen"> = word.joins.flatMap((join) => {
    if (!join || typeof join !== "object" || Array.isArray(join)) return [];
    const joinType = (join as { joinType?: unknown }).joinType;
    return joinType === "none" || joinType === "space" || joinType === "hyphen" ? [joinType] : [];
  });
  return {
    targetId: word.canonicalWordId,
    stepLabel: `Build ${index + 1} of ${words.length}`,
    definition: word.childFriendlyMeaning,
    tiles,
    expectedIds,
    joins: governedJoins.length ? governedJoins : undefined,
    label: `Build ${word.displayWord} from word parts`,
    wordSum: word.wordSum,
    resultingMeaning: word.childFriendlyMeaning,
    continueLabel: index + 1 < words.length ? "Build the next word" : "Practise six words",
  };
}

export function baseWordLessonReflectionMistakes(
  payload: BaseWordFamilyLessonSnapshotV1,
  sentenceAttempts: Record<string, string>,
): NormalizedLessonReflectionMistake[] {
  return baseWordLessonReflectionModel(payload, sentenceAttempts).mistakes;
}

export function baseWordLessonReflectionModel(
  payload: BaseWordFamilyLessonSnapshotV1,
  sentenceAttempts: Record<string, string>,
): {
  mistakes: NormalizedLessonReflectionMistake[];
  sentenceComparisons: NormalizedLessonReflectionSentenceComparison[];
} {
  const sentenceComparisons: NormalizedLessonReflectionSentenceComparison[] = [];
  const mistakes = payload.independentWords.flatMap((word) => {
    const sentenceAttempt = sentenceAttempts[word.canonicalWordId] ?? "";
    const comparison = lessonReflectionSentenceComparison({
      id: word.canonicalWordId,
      attempt: sentenceAttempt,
      correct: word.dictationSentence,
    });
    if (comparison) sentenceComparisons.push(comparison);
    const attempt = extractAuthoredTargetToken(
      sentenceAttempt,
      word.dictationTargetTokenIndex,
    );
    return isAttemptCorrect(attempt, word.displayWord) ? [] : [{
      id: word.canonicalWordId,
      attempt,
      correctSpelling: word.displayWord,
    }];
  });
  return { mistakes, sentenceComparisons };
}

// Preview exports expose the real route-local surfaces to the admin-only
// Visual Convergence Lab. They do not alter route dispatch or runtime state.
export { Intro, FamilyReveal, Cleave };
