"use client";

import { useEffect, useState } from "react";

import { createCanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import {
  FirstImpressionLesson,
  type FirstImpressionConfiguredActivity,
  type FirstImpressionStageId,
} from "@/components/adle/first-impression/first-impression-lesson";
import { SpellingTransformationReveal } from "@/components/adle/activities/shared/spelling-transformation-reveal";
import { SplitHandle } from "@/components/adle/activities/shared/split-handle";
import { deterministicOrderedBuildOrder } from "@/components/adle/activities/shared/ordered-build-engine";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { extractAuthoredTargetToken } from "@/lib/adle/morphology/payload";
import { finalYRestorationForBasePart, type BaseWordFamilyLessonSnapshotV1, type BaseWordFamilySnapshotWord } from "@/lib/adle/morphology/base-word-family-payload";
import { baseWordFamilyResumeKey, normaliseBaseWordFamilyResume, type BaseWordFamilyResumeState } from "@/lib/adle/morphology/base-word-family-resume";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import {
  lessonReflectionSentenceComparison,
  type NormalizedLessonReflectionMistake,
  type NormalizedLessonReflectionSentenceComparison,
} from "@/lib/adle/lesson-reflection";
import { resolveBaseWordFamilyLessonAuthorityV2 } from "@/lib/adle/morphology/resolved-base-word-family-lesson-v2";

const INITIAL: BaseWordFamilyResumeState = {
  stage: "intro", teachingPageIndex: 0, familyIndex: 0, cleaveIndex: 0, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0,
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
  durableResumeState?: unknown;
  onDurableResumeStateChange?: (state: unknown) => void;
  onPreviewComplete?: (reflection: string) => void;
  onComplete?: (input: { reflection: string; controlledAttempts: Record<string, string>; sentenceAttempts: Record<string, string> }) => void;
}) {
  const onDurableResumeStateChange = props.onDurableResumeStateChange;
  const resolvedLesson = resolveBaseWordFamilyLessonAuthorityV2(props.payload);
  if (!resolvedLesson) throw new Error("BaseWordFamilyGuidedLesson: malformed resolved lesson");
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
        const saved = props.durableResumeState ?? window.localStorage.getItem(key);
        const restored = typeof saved === "string"
          ? normaliseBaseWordFamilyResume(JSON.parse(saved), props.payload)
          : normaliseBaseWordFamilyResume(saved, props.payload);
        if (restored) setState(restored);
      } catch {
        /* Resume is optional. */
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [key, props.durableResumeState, props.payload]);
  useEffect(() => { if (!hydrated) return; try { window.localStorage.setItem(key, JSON.stringify(state)); } catch { /* Resume is optional. */ } onDurableResumeStateChange?.(state); }, [hydrated, key, onDurableResumeStateChange, state]);
  if (!hydrated) return <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div>;
  const guidedWords = props.payload.familySections.flatMap((section) => section.guidedWords);
  const independent = props.payload.independentWords[state.stage === "controlled" ? state.controlledIndex : state.dictationIndex];
  const definitionBuild = baseWordDefinitionBuild(guidedWords, state.buildIndex);
  const reflectionModel = baseWordLessonReflectionModel(props.payload, state.sentenceAttempts);
  const activities: FirstImpressionConfiguredActivity[] = props.payload.familySections.flatMap((section, index) => [
    {
      id: `family-${index}`, type: "WORD_FAMILY_REVEAL", label: `Family ${index + 1}`,
      binding: createCanonicalActivityBinding({
        id: `family-${index}`,
        concept: "WORD_FAMILY_REVEAL",
        mode: "base_led_family",
        contractVersion: 1,
        label: `Family ${index + 1}`,
        renderKey: section.baseFamilyKey,
        createProps: ({ complete }) => ({ section, number: index + 1, total: props.payload.familySections.length, onNext: complete }),
      }),
    },
    {
      id: `cleave-${index}`, type: "SPLIT", label: `Split ${index + 1}`,
      binding: createCanonicalActivityBinding({
        id: `cleave-${index}`,
        concept: "CLEAVER",
        mode: "isolate_component",
        contractVersion: 1,
        label: `Split ${index + 1}`,
        createProps: ({ complete }) => ({
          word: guidedWords.find((word) => word.canonicalWordId === props.payload.authenticTargets[index].canonicalWordId),
          cuts: state.cleaveCuts,
          misses: state.cleaveMisses,
          onCutsChange: (wordId: string, cuts: number[]) => update({ cleaveCuts: { ...state.cleaveCuts, [wordId]: cuts }, cleaveStep: cuts.length }),
          onMiss: (id: string, misses: number) => update({ cleaveMisses: { ...state.cleaveMisses, [id]: misses } }),
          onNext: complete,
        }),
      }),
    },
  ]).concat({
    id: "word-sums", type: "BUILD", label: "Build",
    binding: createCanonicalActivityBinding({
      id: "word-sums",
      concept: "WORD_ASSEMBLY",
      mode: "definition_word_builder",
      contractVersion: 1,
      label: "Build",
      renderKey: definitionBuild.targetId,
      createProps: ({ complete }) => ({ ...definitionBuild, muted, onContinue: () => state.buildIndex + 1 < guidedWords.length ? update({ buildIndex: state.buildIndex + 1 }) : complete() }),
    }),
  });
  return <FirstImpressionLesson
    teaching={resolvedLesson.teaching}
    activities={activities}
    initialStageId={baseWordShellStage(state)}
    initialTeachingPageIndex={state.teachingPageIndex}
    onTeachingPageChange={(teachingPageIndex) => update({ teachingPageIndex })}
    onStageChange={(stageId) => update(baseWordResumeStage(stageId))}
    scene={{ beat: guideBeat(state.stage), muted, onMutedChange: setMuted, silent: state.stage === "controlled" || state.stage === "dictation", help: clueOpen ? clueFor(state.stage) : undefined, onHelp: () => setClueOpen((current) => !current), guideName: "Word Builder" }}
    coverActivity={createCanonicalActivityBinding({
      id: "cover", concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1, label: "Cover", renderKey: independent.canonicalWordId,
      createProps: ({ complete }) => ({ stepLabel: `Word to remember ${state.controlledIndex + 1} of ${props.payload.independentWords.length}`, word: independent.displayWord, splitPoints: [], initialAttempt: state.controlledAttempts[independent.canonicalWordId] ?? "", initialState: state.controlledChecked[independent.canonicalWordId] === true ? "check" : state.controlledAttempts[independent.canonicalWordId] ? "write" : "look", muted: false, onStateChange: (_: unknown, attempt: string) => { if (attempt) update({ controlledAttempts: { ...state.controlledAttempts, [independent.canonicalWordId]: attempt } }); }, onComplete: (attempt: string) => update({ controlledAttempts: { ...state.controlledAttempts, [independent.canonicalWordId]: attempt }, controlledChecked: { ...state.controlledChecked, [independent.canonicalWordId]: true } }), onContinue: () => state.controlledIndex + 1 < props.payload.independentWords.length ? update({ controlledIndex: state.controlledIndex + 1 }) : complete() }),
    })}
    dictationActivity={createCanonicalActivityBinding({
      id: "dictation", concept: "DICTATION", mode: "target_token", contractVersion: 1, label: "Dictation", renderKey: independent.canonicalWordId,
      createProps: ({ complete }) => ({ stepLabel: `Sentence ${state.dictationIndex + 1} of ${props.payload.independentWords.length}`, audioText: independent.audioText, correctSentence: independent.dictationSentence, value: state.sentenceAttempts[independent.canonicalWordId] ?? "", checked: state.sentenceChecked, muted: false, onValueChange: (value: string) => { if (!state.sentenceChecked) update({ sentenceAttempts: { ...state.sentenceAttempts, [independent.canonicalWordId]: value } }); }, onCheck: () => update({ sentenceChecked: true }), continueLabel: state.dictationIndex + 1 < props.payload.independentWords.length ? "Next sentence" : "Reflect", onContinue: () => state.dictationIndex + 1 < props.payload.independentWords.length ? update({ dictationIndex: state.dictationIndex + 1, sentenceChecked: false }) : complete() }),
    })}
    reflectionActivity={createCanonicalActivityBinding({
      id: "reflection", concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1, label: "Reflection",
      createProps: () => ({ mistakes: reflectionModel.mistakes, sentenceComparisons: reflectionModel.sentenceComparisons, prompt: resolvedLesson.reflection.promptText, response: state.reflectionText, pending: props.submitting === true, completionLabel: props.onComplete ? "Finish Word Lab" : "Finish preview", onResponseChange: (reflectionText: string) => update({ reflectionText }), onComplete: () => { if (props.submitting) return; props.onPreviewComplete?.(state.reflectionText); props.onComplete?.({ reflection: state.reflectionText, controlledAttempts: state.controlledAttempts, sentenceAttempts: state.sentenceAttempts }); } }),
    })}
  />;
}

function baseWordShellStage(state: BaseWordFamilyResumeState): FirstImpressionStageId {
  return state.stage === "intro" ? "teaching"
    : state.stage === "families" ? `activity:family-${state.familyIndex}`
      : state.stage === "cleave" ? `activity:cleave-${state.cleaveIndex}`
        : state.stage === "word_sums" ? "activity:word-sums"
          : state.stage === "controlled" ? "cover"
            : state.stage === "dictation" ? "dictation"
              : "reflection";
}

function baseWordResumeStage(stageId: FirstImpressionStageId): Partial<BaseWordFamilyResumeState> {
  if (stageId === "teaching") return { stage: "intro" };
  if (stageId === "activity:word-sums") return { stage: "word_sums", buildIndex: 0 };
  if (stageId === "cover") return { stage: "controlled", controlledIndex: 0 };
  if (stageId === "dictation") return { stage: "dictation", dictationIndex: 0, sentenceChecked: false };
  if (stageId === "reflection") return { stage: "reflect", sentenceChecked: false };
  const match = /^activity:(family|cleave)-(\d+)$/.exec(stageId);
  const index = match ? Number(match[2]) : 0;
  return match?.[1] === "cleave" ? { stage: "cleave", cleaveIndex: index, cleaveStep: 0 } : { stage: "families", familyIndex: index };
}

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
  const boundaries = wordParts.slice(0, -1).map((_, index) => wordParts.slice(0, index + 1).reduce((total, part) => total + part.surfaceText.length, 0));
  const requiredBoundaries = [baseIndex > 0 ? boundaries[baseIndex - 1] : null, baseIndex < wordParts.length - 1 ? boundaries[baseIndex] : null].filter((point): point is number => point !== null);
  const selectedBoundaries = [...new Set(props.cuts[word!.canonicalWordId] ?? [])].filter((point) => requiredBoundaries.includes(point)).sort((left, right) => left - right);
  const splitComplete = requiredBoundaries.every((point) => selectedBoundaries.includes(point));

  if (splitComplete && transformation) {
    return <SpellingTransformationReveal surfaceText={transformation.surfaceText} sourceText={transformation.sourceText} explanation={transformation.explanation} actionLabel="Change i to y" continueLabel="Build words from meanings" onContinue={props.onNext} />;
  }

  return <SplitHandle
    word={word!.displayWord}
    splitPoints={requiredBoundaries}
    components={wordParts.map((part) => part.surfaceText)}
    selectedBoundaries={selectedBoundaries}
    isolatedComponentIndex={baseIndex}
    misses={props.misses[key] ?? 0}
    correct={splitComplete}
    prompt="Choose where to chop the word."
    missMessage="Try again. Look for the edge of a meaningful word part."
    repeatedMissMessage="Choose one of the glowing gaps beside the base word."
    correctHeading={`Yes — ${basePart.sourceText} is the base word.`}
    correctExplanation="The extra word parts have moved aside, leaving the governed base."
    continueLabel="Build words from meanings"
    onSelectedBoundariesChange={(cuts) => props.onCutsChange(word!.canonicalWordId, cuts)}
    onMiss={(misses) => props.onMiss(key, misses)}
    onCorrect={() => undefined}
    onContinue={props.onNext}
  />;
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
export { FamilyReveal, Cleave };
