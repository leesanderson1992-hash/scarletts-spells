"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

import { IntroActivity } from "@/components/adle/activities/intro-activity";
import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { QuickSortActivity } from "@/components/adle/activities/quick-sort-activity";
import { ReflectionActivity } from "@/components/adle/activities/reflection-activity";
import { BinSort } from "@/components/adle/activities/shared/bin-sort";
import { BaseWordCleaver } from "@/components/adle/activities/shared/base-word-cleaver";
import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { DefinitionWordBuilder } from "@/components/adle/activities/shared/definition-word-builder";
import { HearWordButton, SpellingField } from "@/components/adle/activities/shared/spelling-field";
import { SnapRail } from "@/components/adle/activities/shared/snap-rail";
import { SplitHandle } from "@/components/adle/activities/shared/split-handle";
import { MeaningFlip, MorphemeRail } from "@/components/adle/activities/morphology/shared/morphology-primitives";
import { AssemblySlot } from "@/components/adle/interactions/selectable-item";
import {
  Cleave as BaseCleave,
  Dictation as BaseDictation,
  FamilyReveal,
  Intro as BaseIntro,
  baseWordLessonReflectionMistakes,
} from "@/components/adle/morphology/base-word-family-guided-lesson";
import { CompoundReadingPage } from "@/components/adle/morphology/closed-compound-guided-lesson";
import {
  Controlled as MorphologyControlled,
  Dictation as MorphologyDictation,
  Discovery,
  LearnIntroduction,
  MeaningOverview,
  SplitBuild,
  morphologyLessonReflectionModel,
} from "@/components/adle/morphology/morphology-guided-lesson";
import { WordLabActivityHost } from "@/components/adle/word-lab/activity-registry";
import type { VisualFixtureState } from "@/lib/adle/activity-visual-convergence";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/base-word-family-preview-fixture";
import { compileMorphologyUnPilotPayload } from "@/lib/adle/morphology/payload";
import type { MorphologyLessonResumeState } from "@/lib/adle/morphology/resume";
import type { CompiledWordLabSnapshotV1 } from "@/lib/adle/word-lab/contracts";
import { lessonReflectionPrompt, type NormalizedLessonReflectionMistake } from "@/lib/adle/lesson-reflection";

const noop = () => undefined;

const CompoundJigsawActivity = dynamic(
  () => import("@/components/adle/morphology/compound-jigsaw-activity").then((module) => module.CompoundJigsawActivity),
  { ssr: false, loading: () => <p className="min-h-56 text-center text-sm text-cyan-100">Preparing the real Compound Jigsaw…</p> },
);
const MeaningConnectionActivity = dynamic(
  () => import("@/components/adle/morphology/meaning-connection-activity").then((module) => module.MeaningConnectionActivity),
  { ssr: false, loading: () => <p className="min-h-56 text-center text-sm text-cyan-100">Preparing the real Meaning Connection…</p> },
);

const MORPHOLOGY_PREVIEW_SOURCE = compileMorphologyUnPilotPayload({
  unhappy: "preview-unhappy", unfair: "preview-unfair", unkind: "preview-unkind",
  unlock: "preview-unlock", untidy: "preview-untidy", unnatural: "preview-unnatural",
  unnecessary: "preview-unnecessary",
});
const MORPHOLOGY_PAYLOAD = {
  ...MORPHOLOGY_PREVIEW_SOURCE,
  activities: MORPHOLOGY_PREVIEW_SOURCE.activities.map((activity) => activity.type === "sentence_dictation"
    ? { ...activity, dictationContextPolicyVersion: "dictation_target_context_v1" as const }
    : activity),
};

const COMPOUND_TARGETS = [
  { canonicalWordId: "preview-rainbow", word: "rainbow", components: ["rain", "bow"], joins: ["none" as const] },
  { canonicalWordId: "preview-ice-cream", word: "ice cream", components: ["ice", "cream"], joins: ["space" as const] },
  { canonicalWordId: "preview-well-being", word: "well-being", components: ["well", "being"], joins: ["hyphen" as const] },
  { canonicalWordId: "preview-mother-in-law", word: "mother-in-law", components: ["mother", "in", "law"], joins: ["hyphen" as const, "hyphen" as const] },
];

const MEANING_TARGETS = [
  { canonicalWordId: "preview-rainbow", word: "rainbow", definition: "a band of colours seen after rain", componentMeanings: ["water from clouds", "a curved shape"], componentToWholeRelationship: "Rain and a bow-shaped arc help explain rainbow." },
  { canonicalWordId: "preview-playground", word: "playground", definition: "a place for games and play", componentMeanings: ["have fun", "an area of land"], componentToWholeRelationship: "A ground where people play is a playground." },
];

const MORPHEME_TILES = [
  { id: "un", text: "un", kind: "prefix" as const, label: "prefix", gloss: "not", surfaceText: "un", transformationState: "none" as const },
  { id: "kind", text: "kind", kind: "base" as const, label: "base", gloss: "caring", surfaceText: "kind", transformationState: "none" as const },
  { id: "ness", text: "ness", kind: "suffix" as const, label: "suffix", gloss: "state of", surfaceText: "ness", transformationState: "none" as const },
];

function sessionItem(id: string, templateKey: string, targetWord: string | null, promptData: Record<string, unknown>): AdleSessionItem {
  return { id, sourceEntityId: `preview:${id}`, sectionKey: "visual_preview", templateKey, position: 0, status: "preview", targetWord, canonicalWordId: targetWord ? `preview-${targetWord}` : null, microSkillKey: null, adleLearningItemRef: null, promptData };
}

const INTRO_ITEM = sessionItem("intro", "MICRO_READ_ONLY_INTRO", null, {
  teachingObjective: "Notice how meaningful parts build a word.",
  childFriendlyExplanation: "A word can be made from smaller parts that each do a job.",
  ruleExplanation: "Keep each reviewed part in its governed order.",
  lessonWordPreviews: [
    { canonicalWordId: "preview-unkind", displayWord: "unkind", provenance: "learning_item" },
    { canonicalWordId: "preview-rainbow", displayWord: "rainbow", provenance: "stretch" },
  ],
});

const SORT_ITEM = sessionItem("sort", "REVIEW_QUICK_SORT", null, {
  childFacingCopy: "Sort each word by the job of its first part.",
  words: [
    { canonicalWordId: "preview-unkind", targetWord: "unkind" },
    { canonicalWordId: "preview-replay", targetWord: "replay" },
  ],
  sortBins: { dimensionLabel: "prefix meaning", bins: [{ key: "not", label: "not" }, { key: "again", label: "again" }], correctBinByWordId: { "preview-unkind": "not", "preview-replay": "again" } },
});

const REPAIR_ITEM = sessionItem("repair", "ERROR_REFLECTION_CUE", "unkind", { misconceptionHint: "Think of un- plus kind." });

function stateValue(state: VisualFixtureState, correct: string, incorrect: string): string {
  return state === "restored" || state === "active" ? incorrect.slice(0, Math.max(1, incorrect.length - 1)) : state === "incorrect" ? incorrect : state === "success" || state === "completed" ? correct : "";
}

function LocalField(props: { word: string; label: string; state: VisualFixtureState; reveal?: boolean; sentenceContext?: boolean }) {
  const [value, setValue] = useState(() => stateValue(props.state, props.word, props.word === "unkind" ? "unkined" : "rain bo"));
  return <SpellingField word={props.word} value={value} onChange={setValue} label={props.label} reveal={props.reveal} sentenceContext={props.sentenceContext} />;
}

function AssemblySlotPreview(props: { state: VisualFixtureState }) {
  const [placed, setPlaced] = useState(props.state === "active" || props.state === "completed");
  return <AssemblySlot label={placed ? "Remove un from position 1" : "Place selected tile in position 1"} active={!placed} onPlace={() => setPlaced((value) => !value)}>{placed ? "1. un · remove" : "Position 1"}</AssemblySlot>;
}

function BuildCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  const restored = props.state === "restored";
  if (props.candidateId === "snap-rail") return <SnapRail key={props.state} tiles={[{ id: "rain", text: "rain", role: "base" }, { id: "bow", text: "bow", role: "base" }]} expectedIds={["rain", "bow"]} joins={["space"]} checkMode="manual" label="Build rain bow" muted />;
  if (props.candidateId === "compound-generalized") return <CompoundJigsawActivity key={props.state} targets={COMPOUND_TARGETS} muted initialLocked={restored ? ["preview-ice-cream", "preview-well-being"] : props.state === "success" ? ["preview-ice-cream"] : []} initialPlacements={restored ? { "preview-ice-cream": ["preview-well-being:0", "preview-mother-in-law:join:0", "preview-well-being:1"], "preview-well-being": ["preview-ice-cream:0", "preview-ice-cream:join:0", "preview-ice-cream:1"] } : props.state === "incorrect" ? { "preview-rainbow": ["preview-rainbow:1", "preview-rainbow:0"] } : {}} initialMisses={props.state === "incorrect" ? { "preview-rainbow": 1 } : {}} onComplete={noop} />;
  if (props.candidateId === "prefix-build") {
    return <DefinitionWordBuilder key={props.state} targetId="preview-unkind" stepLabel="Prefix build" definition="not kind" tiles={[{ id: "un", text: "un-", role: "prefix", gloss: "not" }, { id: "dis", text: "dis-", role: "prefix", gloss: "opposite or apart" }, { id: "mis", text: "mis-", role: "prefix", gloss: "wrongly" }]} expectedIds={["un"]} fixedTiles={[{ id: "kind", text: "kind", role: "base" }]} fixedTilesPosition="after" label="Build the word that means not kind" wordSum="un + kind → unkind" resultingMeaning="not kind" continueLabel="Remember the lesson words" muted initialProgress={restored ? { placedIds: ["un"], completed: true } : undefined} onContinue={noop} />;
  }
  if (props.candidateId === "base-word-builder") return <DefinitionWordBuilder key={props.state} targetId="preview-replayed" stepLabel="Base Word build" definition="played again" tiles={[{ id: "re", text: "re", role: "prefix", gloss: "again" }, { id: "play", text: "play", role: "base" }, { id: "ed", text: "ed", role: "suffix" }, { id: "un", text: "un", role: "prefix", gloss: "not" }]} expectedIds={["re", "play", "ed"]} label="Build replayed from word parts" wordSum="re + play + ed → replayed" resultingMeaning="played again" continueLabel="Build the next word" muted initialProgress={restored ? { placedIds: ["re", "play", "ed"], completed: true } : undefined} onContinue={noop} />;
  if (props.candidateId === "morpheme-rail") return <MorphemeRail key={props.state} tiles={MORPHEME_TILES} slots={3} mode="teaching" label="Build unkindness" />;
  if (props.candidateId === "assembly-slot") return <AssemblySlotPreview key={props.state} state={props.state} />;
  return null;
}

function reflectionState(state: VisualFixtureState): MorphologyLessonResumeState {
  const completed = state === "completed" || state === "restored";
  const controlledAttempts = Object.fromEntries(MORPHOLOGY_PAYLOAD.words.lesson.map((word) => [word.canonicalWordId, word.displayWord]));
  const sentenceActivity = MORPHOLOGY_PAYLOAD.activities.find((activity) => activity.type === "sentence_dictation")!;
  const sentenceAttempts = Object.fromEntries((sentenceActivity.sentences ?? []).map((sentence) => [sentence.canonicalWordId, sentence.sentence]));
  if (state === "incorrect") {
    controlledAttempts["preview-unfair"] = "unfare";
    sentenceAttempts["preview-unfair"] = "It was unfare to change rule.";
  } else if (state === "active") {
    sentenceAttempts["preview-unfair"] = "It was unfair to change rule.";
  }
  return {
    stage: "reflect", introIndex: 0, discoverIndex: 0, discoverAddedPrefix: false,
    splitMisses: 0, splitCorrect: false, splitIndex: 0, matchComplete: true, buildIndex: 0,
    controlledIndex: 0, dictationIndex: 0,
    controlledAttempts,
    controlledChecked: { "preview-unfair": true },
    sentenceAttempts,
    checkedSentence: true, guidedBindings: [], muted: true, helpLevel: 0,
    reflectionText: completed ? "I will keep the prefix and base in their reviewed order." : "",
  };
}

function ReflectionCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  const [value, setValue] = useState(() => props.state === "completed" || props.state === "restored" ? "I will look for the meaningful word parts." : "");
  if (props.candidateId === "morphology-reflection") {
    const model = morphologyLessonReflectionModel(MORPHOLOGY_PAYLOAD, reflectionState(props.state));
    return <LessonReflection key={props.state} mistakes={model.mistakes} prompt={model.prompt} response={value} onResponseChange={setValue} onComplete={noop} completionLabel="Finish preview" contextRecap={model.contextRecap} />;
  }
  if (props.candidateId === "base-reflection") {
    const attempts = Object.fromEntries(BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords.map((word) => [word.canonicalWordId, word.dictationSentence]));
    if (props.state === "incorrect" || props.state === "active") attempts[BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords[0]!.canonicalWordId] = "We replay the song.";
    return <LessonReflection key={props.state} mistakes={baseWordLessonReflectionMistakes(BASE_WORD_FAMILY_PREVIEW_PAYLOAD, attempts)} prompt={lessonReflectionPrompt({ kind: "base_word", values: BASE_WORD_FAMILY_PREVIEW_PAYLOAD.familySections.map((section) => section.baseWord.displayWord) })} response={value} onResponseChange={setValue} onComplete={noop} completionLabel="Finish preview" />;
  }
  if (props.candidateId === "compound-reflection") return <LessonReflection key={props.state} mistakes={lessonReflectionFixtureMistakes(props.state)} prompt={lessonReflectionPrompt({ kind: "compound" })} response={value} onResponseChange={setValue} onComplete={noop} completionLabel="Finish preview" successMessage="You checked each compound word carefully and kept its governed written form." />;
  if (props.candidateId === "common-reflection") {
    const activity = { activityId: "visual-reflection", activityKey: "LESSON_REFLECTION", kind: "reflection", contractVersion: 1, order: 1, wordSlotIds: ["word-1"], assignmentItemIds: [], config: { title: "Look back", prompt: "What one rule did you learn today?" }, answerVisibility: "post_submit_only", evidenceMode: "none", requiredForCompletion: true } as CompiledWordLabSnapshotV1["activities"][number];
    const words = [{ slotId: "word-1", canonicalWordId: "preview-unkind", displayWord: "unkind", roles: ["practice"], learningItemId: null, complexityBand: null, contentRef: { sourceKey: "visual", sourceVersion: "1" }, coverage: {}, schedulingRole: "none", rewardRole: "ineligible" }] as CompiledWordLabSnapshotV1["words"];
    return <WordLabActivityHost key={props.state} activity={activity} words={words} initialState={{ response: value }} muted reducedMotion onStateChange={noop} onReflectionChange={setValue} onComplete={noop} />;
  }
  return null;
}

function lessonReflectionFixtureMistakes(state: VisualFixtureState): readonly NormalizedLessonReflectionMistake[] {
  const mistakes: readonly NormalizedLessonReflectionMistake[] = [
    { id: "rainbow", correctSpelling: "rainbow", attempt: "rain bow", sentenceComparison: { attempt: "A rain bow appeared.", correct: "A rainbow appeared." } },
    { id: "ice-cream", correctSpelling: "ice cream", attempt: "icecream", sentenceComparison: { attempt: "I ate icecream.", correct: "We shared ice cream." } },
    { id: "well-being", correctSpelling: "well-being", attempt: "wellbeing", sentenceComparison: { attempt: "Wellbeing matters.", correct: "Sleep supports well-being." } },
  ];
  if (state === "initial" || state === "completed" || state === "success") return [];
  if (state === "active" || state === "restored") return mistakes.slice(0, 1);
  return mistakes;
}

function SpellCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  const morphWord = MORPHOLOGY_PAYLOAD.words.lesson[0]!;
  const baseWord = BASE_WORD_FAMILY_PREVIEW_PAYLOAD.independentWords[0]!;
  const checked = props.state === "success" || props.state === "completed";
  const [attempt, setAttempt] = useState(() => stateValue(props.state, morphWord.displayWord, "unfare"));
  const [repair, setRepair] = useState(() => props.state === "restored" ? "unki" : "");
  if (props.candidateId === "cover-check") return <CoverShutter key={props.state} word="unkind" splitPoints={[2]} components={["un", "kind"]} initialState={checked ? "check" : attempt ? "write" : "look"} initialAttempt={attempt} muted onComplete={noop} />;
  if (props.candidateId === "generic-controlled") return <LocalField key={props.state} word="unkind" label="Copy and spell" state={props.state} reveal />;
  if (props.candidateId === "specialist-controlled") return <MorphologyControlled key={props.state} index={0} total={4} word={morphWord} attempt={attempt} checked={checked} muted closePolicy={{ kind: "track_ratio", threshold: 0.8 }} onAttempt={setAttempt} onChecked={noop} onNext={noop} />;
  if (props.candidateId === "generic-dictation") return <div className="grid gap-3"><div className="flex justify-center"><HearWordButton word="unkind" label="Play word" muted kind="dictation" /></div><LocalField key={props.state} word="unkind" label="Dictation word 1" state={props.state} /></div>;
  if (props.candidateId === "morphology-dictation") return <MorphologyDictation key={props.state} payload={MORPHOLOGY_PAYLOAD} index={0} value={attempt} checked={checked} muted onValue={setAttempt} onCheck={noop} onNext={noop} />;
  if (props.candidateId === "base-dictation") return <BaseDictation key={props.state} word={baseWord} index={0} total={6} value={attempt} checked={checked} onValue={setAttempt} onCheck={noop} onNext={noop} />;
  if (props.candidateId === "error-repair") return <ReflectionActivity key={props.state} item={REPAIR_ITEM} priorAttempt="unkined" value={repair} onChange={setRepair} />;
  return null;
}

function SplitCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  const success = props.state === "success" || props.state === "completed";
  const misses = props.state === "scaffold" ? 2 : props.state === "incorrect" || props.state === "restored" ? 1 : 0;
  const morphWord = MORPHOLOGY_PAYLOAD.words.anchor;
  const baseWord = BASE_WORD_FAMILY_PREVIEW_PAYLOAD.familySections[0].guidedWords.find((word) => word.displayWord === "replayed")!;
  const [cuts, setCuts] = useState<Record<string, number[]>>(() => ({ [baseWord.canonicalWordId]: success ? [2, 6] : props.state === "restored" ? [2] : [] }));
  const [baseMisses, setBaseMisses] = useState<Record<string, number>>(() => ({ [`${baseWord.canonicalWordId}:base`]: misses }));
  if (props.candidateId === "split-handle") return <SplitHandle key={props.state} word="unkind" splitPoints={[2]} components={["un", "kind"]} misses={misses} correct={success} muted onMiss={noop} onCorrect={noop} onContinue={noop} />;
  if (props.candidateId === "base-word-cleaver") return <BaseWordCleaver key={props.state} word="replayed" segments={[{ id: "re", text: "re" }, { id: "play", text: "play" }, { id: "ed", text: "ed" }]} baseIndex={1} selectedCuts={success ? [2, 6] : props.state === "restored" ? [2] : []} misses={misses} muted onCutsChange={noop} onMiss={noop} onContinue={noop} />;
  if (props.candidateId === "split-build") return <SplitBuild key={props.state} word={morphWord} misses={misses} correct={success} muted feedbackPolicy={MORPHOLOGY_PAYLOAD.activities.find((entry) => entry.type === "strip_build")?.cleaverFeedbackPolicy} continueLabel="Continue" onMiss={noop} onCorrect={noop} onComplete={noop} />;
  if (props.candidateId === "base-cleave") return <BaseCleave key={props.state} word={baseWord} cuts={cuts} misses={baseMisses} onCutsChange={(id, next) => setCuts((current) => ({ ...current, [id]: next }))} onMiss={(id, next) => setBaseMisses((current) => ({ ...current, [id]: next }))} onNext={noop} />;
  return null;
}

const SORT_ITEMS = [{ id: "unkind", text: "unkind", destination: "not" }, { id: "replay", text: "replay", destination: "again" }];
const SORT_BINS = [{ id: "not", label: "not", description: "changes the meaning to not" }, { id: "again", label: "again", description: "means do it again" }];

function SortCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  if (props.candidateId === "quick-sort") return <QuickSortActivity key={props.state} item={SORT_ITEM} />;
  if (props.candidateId === "bin-sort") return <BinSort key={props.state} items={SORT_ITEMS} bins={SORT_BINS} instruction="Sort each word by meaning." muted />;
  if (props.candidateId === "prefix-form-sort") return <BinSort key={props.state} items={SORT_ITEMS} bins={SORT_BINS} instruction="Which meaning does the prefix add?" muted />;
  return null;
}

function MeaningCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  const restored = props.state === "restored" || props.state === "success";
  if (props.candidateId === "discovery") return <Discovery key={props.state} payload={MORPHOLOGY_PAYLOAD} index={0} muted addedPrefix={props.state !== "initial"} onAddPrefix={noop} onNext={noop} />;
  if (props.candidateId === "meaning-connection") return <MeaningConnectionActivity key={props.state} targets={MEANING_TARGETS} muted initialConnected={restored ? ["preview-rainbow"] : []} initialMisses={props.state === "incorrect" ? { "preview-rainbow": 1 } : {}} onComplete={noop} />;
  if (props.candidateId === "meaning-bin-sort") return <BinSort key={props.state} items={SORT_ITEMS} bins={SORT_BINS} instruction="Sort by what the first part means." muted />;
  if (props.candidateId === "meaning-flip") return <MeaningFlip flip={{ id: "preview-kind-to-unkind", beforeText: "kind", beforeCaption: "caring and helpful", afterText: "unkind", afterCaption: "not kind" }} reduceMotion />;
  if (props.candidateId === "meaning-overview") return <MeaningOverview payload={MORPHOLOGY_PAYLOAD} onNext={noop} />;
  return null;
}

const READING_PAGE = {
  key: "parts-build-meaning", title: "Two words can work together",
  introduction: ["Read the parts, then notice the meaning of the whole word."],
  sections: [{ key: "example", heading: "Look closely", paragraphs: ["rain + bow can form rainbow."], examples: [{ text: "rain + bow → rainbow", explanation: "The whole word names a bow-shaped band of colours seen after rain." }] }],
};

const READING_WORDS = [{ canonicalWordId: "preview-rainbow", displayWord: "rainbow", components: ["rain", "bow"], joins: ["none" as const], componentMeanings: ["water from clouds", "a curved shape"], childFriendlyDefinition: "a band of colours", componentToWholeRelationship: "rain plus a bow-shaped arc", audioText: "rainbow", dictationSentence: "A rainbow appeared.", dictationTargetSpan: { schemaVersion: 2 as const, startTokenIndex: 1, endTokenIndexExclusive: 2, exactAnswer: "rainbow" }, splitPoints: [4] }];

function TeachingCandidates(props: { candidateId: string; state: VisualFixtureState }): ReactNode {
  if (props.candidateId === "intro-activity") return <IntroActivity item={INTRO_ITEM} />;
  if (props.candidateId === "learn-introduction") return <LearnIntroduction payload={MORPHOLOGY_PAYLOAD} index={props.state === "restored" || props.state === "active" ? 1 : 0} onNext={noop} />;
  if (props.candidateId === "base-intro") return <BaseIntro payload={BASE_WORD_FAMILY_PREVIEW_PAYLOAD} onNext={noop} />;
  if (props.candidateId === "compound-reading") return <CompoundReadingPage page={READING_PAGE} pageNumber={props.state === "restored" || props.state === "active" ? 2 : 1} pageCount={3} showLessonWords={props.state === "completed"} words={READING_WORDS} />;
  if (props.candidateId === "family-reveal") return <FamilyReveal key={props.state} section={BASE_WORD_FAMILY_PREVIEW_PAYLOAD.familySections[0]} number={1} total={2} onNext={noop} />;
  return null;
}

export function VisualConvergenceCandidatePreview(props: { groupId: string; candidateId: string; state: VisualFixtureState }): ReactNode {
  if (props.groupId === "build") return <BuildCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "reflection") return <ReflectionCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "spell") return <SpellCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "split") return <SplitCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "sort") return <SortCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "meaning") return <MeaningCandidates candidateId={props.candidateId} state={props.state} />;
  if (props.groupId === "teaching") return <TeachingCandidates candidateId={props.candidateId} state={props.state} />;
  return null;
}
