"use client";

import { useEffect, useMemo, useState } from "react";
import { completeAdleLessonPartAction } from "@/app/learn/week/adle/actions";
import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { CoverShutter, SentenceDictation } from "@/components/adle/activities/shared";
import {
  FirstImpressionLesson,
  type FirstImpressionConfiguredActivity,
  type FirstImpressionStageId,
} from "@/components/adle/first-impression/first-impression-lesson";
import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import {
  lessonReflectionSentenceComparison,
  lessonReflectionPrompt,
  type NormalizedLessonReflectionMistake,
  type NormalizedLessonReflectionSentenceComparison,
} from "@/lib/adle/lesson-reflection";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { EXACT_GOVERNED_FORM_ANSWER_POLICY, isAnswerCorrectUnderPolicy } from "@/lib/adle/answer-policy";
import type { ClosedCompoundLessonPayloadV1 } from "@/lib/adle/morphology/closed-compound-word-lab";
import { adaptClosedCompoundJigsawTargets } from "@/lib/adle/morphology/closed-compound-jigsaw-compatibility";
import type {
  CompoundWordLessonIntroductionV2,
  CompoundWordLessonPayloadV2,
  CompoundWordLessonReadingPageV2,
} from "@/lib/adle/morphology/compound-word-lesson-v2";
import type { CompoundWordJoinKind } from "@/lib/adle/morphology/compound-word-structure-v2";
import {
  dictationTargetSpanFromToken,
  extractAuthoredTargetSpan,
  type DictationTargetSpanV2,
} from "@/lib/adle/morphology/dictation-target-span";
import {
  closedCompoundResumeKey,
  normaliseClosedCompoundResume,
  type ClosedCompoundResumeState,
} from "@/lib/adle/morphology/closed-compound-resume";
import { readMorphologyResume, writeMorphologyResume } from "@/lib/adle/morphology/resume";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { CompoundJigsawActivity } from "./compound-jigsaw-activity";
import { MeaningConnectionActivity } from "./meaning-connection-activity";

const INITIAL: ClosedCompoundResumeState = {
  stage: "intro",
  teachingPageIndex: 0,
  index: 0,
  muted: false,
  attempts: {},
  sentences: {},
  sentenceChecked: false,
  reflection: "",
  jigsawLocked: [],
  jigsawMisses: {},
  jigsawPlacements: {},
  meaningConnected: [],
  meaningMisses: {},
};

type RuntimeWord = {
  canonicalWordId: string;
  displayWord: string;
  components: readonly string[];
  joins: readonly CompoundWordJoinKind[];
  componentMeanings?: readonly string[];
  childFriendlyDefinition: string;
  componentToWholeRelationship: string;
  audioText: string;
  dictationSentence: string;
  dictationTargetSpan: DictationTargetSpanV2;
  splitPoints: readonly number[];
};

type RuntimePayload = {
  contentVersion: string;
  words: { lesson: readonly RuntimeWord[] };
  activities: {
    introduction: CompoundWordLessonIntroductionV2;
    reflection: { promptKey: string; promptText: string };
  };
};

type RuntimeProps = { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: RuntimePayload; resumeNamespace: "closed-compound" | "compound-word-v2"; onPreviewComplete?: (reflection: string) => void };

function CompoundWordLessonRuntime(props: RuntimeProps) {
  const [state, setState] = useState<ClosedCompoundResumeState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const words = props.payload.words.lesson;
  const wordIds = useMemo(() => words.map((entry) => entry.canonicalWordId), [words]);
  const resumeKey = props.resumeNamespace === "closed-compound"
    ? closedCompoundResumeKey(props.assignmentId, props.payload.contentVersion)
    : `${closedCompoundResumeKey(props.assignmentId, props.payload.contentVersion)}:v2`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = normaliseClosedCompoundResume(
        readMorphologyResume<unknown>(resumeKey, props.payload.contentVersion),
        wordIds,
      );
      if (restored) setState(restored);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [props.payload.contentVersion, resumeKey, wordIds]);
  useEffect(() => {
    if (hydrated) writeMorphologyResume(resumeKey, props.payload.contentVersion, state);
  }, [hydrated, props.payload.contentVersion, resumeKey, state]);
  const word = words[state.index];
  const beat = useMemo<GuideBeatV1>(() => ({ id: `closed-${state.stage}`, activityId: state.stage, state: state.stage === "controlled" || state.stage === "dictation" ? "guideSilent" : state.stage === "reflect" ? "reflect" : "invite", say: "", goal: "Build, connect, remember, and spell compound words.", waitFor: "the next step", onComplete: "continue" }), [state.stage]);
  if (!hydrated) return <div className="min-h-[28rem]" aria-label="Restoring Word Lab" />;
  const isV1 = props.resumeNamespace === "closed-compound";
  const readingPages = isV1 ? undefined : props.payload.activities.introduction.readingPages;
  const teaching = compoundTeachingPages(props.payload, words, readingPages);
  const activities: FirstImpressionConfiguredActivity[] = [
    {
      id: "jigsaw", type: "COMPOUND_JIGSAW", label: "Jigsaw",
      render: ({ complete }) => <CompoundJigsawActivity targets={words.map((entry) => ({ canonicalWordId: entry.canonicalWordId, word: entry.displayWord, components: entry.components, joins: entry.joins }))} muted={state.muted} initialLocked={state.jigsawLocked} initialMisses={state.jigsawMisses} initialPlacements={state.jigsawPlacements} onProgress={({ locked, misses, placements }) => setState((current) => ({ ...current, jigsawLocked: locked, jigsawMisses: misses, jigsawPlacements: placements }))} onComplete={({ locked, misses, placements }) => { setState((current) => ({ ...current, jigsawLocked: locked, jigsawMisses: misses, jigsawPlacements: placements })); complete(); }} />,
    },
    {
      id: "meaning", type: "MEANING_MATCH", label: "Meaning",
      render: ({ complete }) => <MeaningConnectionActivity targets={words.map((entry) => ({ canonicalWordId: entry.canonicalWordId, word: entry.displayWord, audioText: entry.audioText, definition: entry.childFriendlyDefinition, componentMeanings: entry.componentMeanings, componentToWholeRelationship: entry.componentToWholeRelationship }))} muted={state.muted} initialConnected={state.meaningConnected} initialMisses={state.meaningMisses} onProgress={({ connected, misses }) => setState((current) => ({ ...current, meaningConnected: connected, meaningMisses: misses }))} onComplete={({ connected, misses }) => { setState((current) => ({ ...current, index: 0, meaningConnected: connected, meaningMisses: misses })); complete(); }} />,
    },
  ];
  return <FirstImpressionLesson
    teaching={teaching}
    activities={activities}
    initialStageId={compoundShellStage(state.stage)}
    initialTeachingPageIndex={state.teachingPageIndex}
    onTeachingPageChange={(teachingPageIndex) => setState((current) => current.teachingPageIndex === teachingPageIndex ? current : ({ ...current, teachingPageIndex }))}
    onStageChange={(stageId) => setState((current) => ({ ...current, stage: compoundResumeStage(stageId), index: stageId === "cover" || stageId === "dictation" ? 0 : current.index }))}
    scene={{ beat, muted: state.muted, onMutedChange: (muted) => setState((current) => ({ ...current, muted })), silent: state.stage === "controlled" || state.stage === "dictation", guideName: "Word Builder" }}
    renderCover={({ complete }) => <CoverShutter key={word.canonicalWordId} stepLabel={`Remember word ${state.index + 1} of ${words.length}`} word={word.displayWord} splitPoints={[...word.splitPoints]} components={word.components} initialAttempt={state.attempts[word.canonicalWordId] ?? ""} initialState={state.attempts[word.canonicalWordId] !== undefined ? "check" : "look"} muted={state.muted} onComplete={(value) => setState((current) => ({ ...current, attempts: { ...current.attempts, [word.canonicalWordId]: value } }))} onContinue={() => state.index + 1 < words.length ? setState((current) => ({ ...current, index: current.index + 1 })) : complete()} />}
    renderDictation={({ complete }) => <SentenceDictation key={word.canonicalWordId} stepLabel={`Sentence ${state.index + 1} of ${words.length}`} audioText={word.audioText} correctSentence={word.dictationSentence} value={state.sentences[word.canonicalWordId] ?? ""} checked={state.sentenceChecked} muted={state.muted} onValueChange={(value) => { if (!state.sentenceChecked) setState((current) => ({ ...current, sentences: { ...current.sentences, [word.canonicalWordId]: value } })); }} onCheck={() => setState((current) => ({ ...current, sentenceChecked: true }))} continueLabel={state.index + 1 < words.length ? "Next sentence" : "Reflect"} onContinue={() => state.index + 1 < words.length ? setState((current) => ({ ...current, index: current.index + 1, sentenceChecked: false })) : complete()} />}
    renderReflection={() => <CompoundLessonReflectionAdapter childId={props.childId} assignmentId={props.assignmentId} items={props.items} payload={props.payload} state={state} closedV1={isV1} onReflectionChange={(reflection) => setState((current) => ({ ...current, reflection }))} onPreviewComplete={props.onPreviewComplete} />}
  />;
}

function compoundShellStage(stage: ClosedCompoundResumeState["stage"]): FirstImpressionStageId {
  return stage === "intro" ? "teaching" : stage === "jigsaw" || stage === "meaning" ? `activity:${stage}` : stage === "controlled" ? "cover" : stage === "dictation" ? "dictation" : "reflection";
}

function compoundResumeStage(stageId: FirstImpressionStageId): ClosedCompoundResumeState["stage"] {
  return stageId === "teaching" ? "intro" : stageId === "activity:jigsaw" ? "jigsaw" : stageId === "activity:meaning" ? "meaning" : stageId === "cover" ? "controlled" : stageId === "dictation" ? "dictation" : "reflect";
}

function compoundTeachingPages(payload: RuntimePayload, words: readonly RuntimeWord[], readingPages: readonly CompoundWordLessonReadingPageV2[] | undefined): TeachingPagesConfig {
  const pages = readingPages?.map((page) => ({
    id: page.key,
    type: "teaching" as const,
    eyebrow: "Reading",
    title: page.title,
    paragraphs: page.introduction,
    sections: page.sections.map((section) => ({ heading: section.heading, paragraphs: section.paragraphs, examples: section.examples })),
  })) ?? [{
    id: "compound-introduction",
    type: "teaching" as const,
    eyebrow: "Compound words",
    title: payload.activities.introduction.title,
    paragraphs: [payload.activities.introduction.childFriendlyExplanation],
    callout: payload.activities.introduction.summary,
  }];
  return {
    pages,
    meetWords: {
      title: "Today’s compound words",
      words: words.map((word) => ({ id: word.canonicalWordId, word: word.displayWord, wordParts: word.components, detail: word.componentToWholeRelationship || word.childFriendlyDefinition })),
    },
  };
}

function compoundLessonReflectionModel(payload: RuntimePayload, state: ClosedCompoundResumeState): {
  mistakes: NormalizedLessonReflectionMistake[];
  sentenceComparisons: NormalizedLessonReflectionSentenceComparison[];
} {
  const sentenceComparisons: NormalizedLessonReflectionSentenceComparison[] = [];
  const mistakes = payload.words.lesson.flatMap((entry) => {
    const spellingAttempt = state.attempts[entry.canonicalWordId] ?? "";
    const sentenceAttempt = state.sentences[entry.canonicalWordId] ?? "";
    const comparison = lessonReflectionSentenceComparison({ id: entry.canonicalWordId, attempt: sentenceAttempt, correct: entry.dictationSentence });
    if (comparison) sentenceComparisons.push(comparison);
    const spellingMissed = !isAnswerCorrectUnderPolicy(spellingAttempt, entry.displayWord, EXACT_GOVERNED_FORM_ANSWER_POLICY);
    const sentenceTargetAttempt = extractAuthoredTargetSpan(sentenceAttempt, entry.dictationTargetSpan);
    const sentenceTargetMissed = !isAnswerCorrectUnderPolicy(sentenceTargetAttempt, entry.displayWord, EXACT_GOVERNED_FORM_ANSWER_POLICY);
    return spellingMissed || sentenceTargetMissed ? [{
      id: entry.canonicalWordId,
      attempt: sentenceTargetMissed ? sentenceTargetAttempt : spellingAttempt,
      correctSpelling: entry.displayWord,
    }] : [];
  });
  return { mistakes, sentenceComparisons };
}

function CompoundLessonReflectionAdapter(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: RuntimePayload; state: ClosedCompoundResumeState; closedV1: boolean; onReflectionChange: (value: string) => void; onPreviewComplete?: (reflection: string) => void }) {
  const reflectionModel = compoundLessonReflectionModel(props.payload, props.state);
  const guidedAttempts = props.items.flatMap((item) => {
    if (item.sectionKey === "lesson_intro") return [{ key: item.id, attemptText: "viewed" }];
    if (item.sectionKey !== "guided_practice" || !item.canonicalWordId) return [];
    const activityId = item.promptData.closedCompoundActivityId ?? item.promptData.compoundWordActivityId;
    const isJigsaw = activityId === `jigsaw-${item.canonicalWordId}`;
    const completed = isJigsaw ? props.state.jigsawLocked.includes(item.canonicalWordId) : props.state.meaningConnected.includes(item.canonicalWordId);
    const incorrectAttempts = isJigsaw ? props.state.jigsawMisses[item.canonicalWordId] ?? 0 : props.state.meaningMisses[item.canonicalWordId] ?? 0;
    return [{ key: item.id, attemptText: JSON.stringify({ completed, incorrectAttempts, assistanceUsed: false }) }];
  });
  return <form action={props.onPreviewComplete ? undefined : completeAdleLessonPartAction} onSubmit={props.onPreviewComplete ? (event) => { event.preventDefault(); props.onPreviewComplete?.(props.state.reflection); } : undefined} className="grid gap-5 text-cyan-50"><input type="hidden" name="mode" value="child" /><input type="hidden" name="childId" value={props.childId} /><input type="hidden" name="assignmentId" value={props.assignmentId} /><input type="hidden" name="attempts" value={JSON.stringify(Object.entries(props.state.attempts).map(([key, attemptText]) => ({ key, attemptText })))} /><input type="hidden" name="dictationSentenceAttempts" value={JSON.stringify(Object.entries(props.state.sentences).map(([key, attemptText]) => ({ key, attemptText })))} /><input type="hidden" name="dictationAttempts" value="[]" /><input type="hidden" name="probeAttempts" value="[]" /><input type="hidden" name="guidedAttempts" value={JSON.stringify(guidedAttempts)} /><input type="hidden" name="learningReflection" value={props.state.reflection} />
    <LessonReflection
      mistakes={reflectionModel.mistakes}
      sentenceComparisons={reflectionModel.sentenceComparisons}
      prompt={lessonReflectionPrompt({ kind: "compound" })}
      response={props.state.reflection}
      onResponseChange={props.onReflectionChange}
      completionType="submit"
      completionLabel="Finish Word Lab"
      successMessage={props.closedV1 ? "You checked each compound word carefully. Remember: the two words join with no space." : "You checked each compound word carefully and kept its governed written form."}
    />
  </form>;
}

export function ClosedCompoundGuidedLesson(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: ClosedCompoundLessonPayloadV1; onPreviewComplete?: (reflection: string) => void }) {
  const jigsawTargets = adaptClosedCompoundJigsawTargets(props.payload);
  const jigsawById = new Map(jigsawTargets.map((target) => [target.canonicalWordId, target]));
  const payload: RuntimePayload = {
    contentVersion: props.payload.contentVersion,
    activities: props.payload.activities,
    words: { lesson: props.payload.words.lesson.map((word) => ({
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      components: jigsawById.get(word.canonicalWordId)?.components ?? [],
      joins: jigsawById.get(word.canonicalWordId)?.joins ?? [],
      childFriendlyDefinition: word.childFriendlyDefinition,
      componentToWholeRelationship: "",
      audioText: word.audioText,
      dictationSentence: word.dictationSentence,
      dictationTargetSpan: dictationTargetSpanFromToken(word.dictationSentence, word.dictationTargetTokenIndex)!,
      splitPoints: [word.firstWord.length],
    })) },
  };
  return <CompoundWordLessonRuntime {...props} payload={payload} resumeNamespace="closed-compound" />;
}

export function CompoundWordGuidedLesson(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: CompoundWordLessonPayloadV2; onPreviewComplete?: (reflection: string) => void }) {
  const payload: RuntimePayload = {
    contentVersion: props.payload.contentVersion,
    activities: props.payload.activities,
    words: { lesson: props.payload.words.lesson.map((word) => ({
      canonicalWordId: word.structure.wholeCanonicalWordId,
      displayWord: word.structure.wholeWord,
      components: word.tasks.split.components,
      joins: word.tasks.split.joins,
      componentMeanings: word.structure.components.map((component) => component.meaning),
      childFriendlyDefinition: word.structure.childFriendlyMeaning,
      componentToWholeRelationship: word.structure.componentToWholeRelationship,
      audioText: word.dictation.audioText,
      dictationSentence: word.dictation.sentence,
      dictationTargetSpan: word.dictation.targetSpan,
      splitPoints: word.tasks.split.splitPoints,
    })) },
  };
  return <CompoundWordLessonRuntime {...props} payload={payload} resumeNamespace="compound-word-v2" />;
}
