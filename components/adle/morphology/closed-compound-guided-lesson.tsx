"use client";

import { useEffect, useMemo, useState } from "react";
import { completeAdleLessonPartAction } from "@/app/learn/week/adle/actions";
import { CoverShutter, DiffReveal, HearWordButton } from "@/components/adle/activities/shared";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { EXACT_GOVERNED_FORM_ANSWER_POLICY, isAnswerCorrectUnderPolicy } from "@/lib/adle/answer-policy";
import type { ClosedCompoundLessonPayloadV1 } from "@/lib/adle/morphology/closed-compound-word-lab";
import type {
  CompoundWordLessonIntroductionV2,
  CompoundWordLessonPayloadV2,
  CompoundWordLessonReadingPageV2,
} from "@/lib/adle/morphology/compound-word-lesson-v2";
import type { CompoundWordJoinKind } from "@/lib/adle/morphology/compound-word-structure-v2";
import {
  closedCompoundResumeKey,
  normaliseClosedCompoundResume,
  type ClosedCompoundResumeState,
} from "@/lib/adle/morphology/closed-compound-resume";
import { readMorphologyResume, writeMorphologyResume } from "@/lib/adle/morphology/resume";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";
import { CompoundJigsawActivity } from "./compound-jigsaw-activity";
import { MeaningConnectionActivity } from "./meaning-connection-activity";
import { WordLabScene } from "./word-lab-scene";

const INITIAL: ClosedCompoundResumeState = {
  stage: "intro",
  index: 0,
  muted: false,
  attempts: {},
  sentences: {},
  sentenceChecked: false,
  reflection: "",
  jigsawLocked: [],
  jigsawMisses: {},
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

type RuntimeProps = { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: RuntimePayload; resumeNamespace: "closed-compound" | "compound-word-v2" };

function CompoundReadingPage(props: {
  page: CompoundWordLessonReadingPageV2;
  pageNumber: number;
  pageCount: number;
  showLessonWords: boolean;
  words: readonly RuntimeWord[];
}) {
  return <section className="grid gap-5 text-left text-cyan-50" aria-labelledby={`compound-reading-${props.page.key}`}>
    <header className="text-center">
      <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Reading · Page {props.pageNumber} of {props.pageCount}</p>
      <h1 id={`compound-reading-${props.page.key}`} className="mt-2 text-3xl font-black text-white md:text-4xl">{props.page.title}</h1>
    </header>
    {props.page.introduction.length ? <div className="grid gap-2 rounded-3xl border border-cyan-300/30 bg-slate-950/35 p-5 text-base leading-relaxed md:text-lg">{props.page.introduction.map((paragraph) => <p key={paragraph} className={paragraph.endsWith("?") ? "font-black text-amber-100" : undefined}>{paragraph}</p>)}</div> : null}
    {props.page.sections.map((section) => <section key={section.key} className="grid gap-3 rounded-3xl border border-cyan-300/30 bg-slate-950/35 p-5">
      {section.heading ? <h2 className="text-xl font-black text-white">{section.heading}</h2> : null}
      {section.paragraphs.map((paragraph) => <p key={paragraph} className="leading-relaxed text-cyan-50">{paragraph}</p>)}
      {section.examples?.length ? <ul className="grid gap-2" aria-label={section.heading ? `${section.heading} examples` : "Examples"}>{section.examples.map((example) => <li key={`${example.explanation ?? ""}:${example.text}`} className="rounded-2xl bg-white/10 px-4 py-3"><span className="font-black text-white">{example.text}</span>{example.explanation ? <span className="mt-1 block text-sm font-semibold text-amber-100">{example.explanation}</span> : null}</li>)}</ul> : null}
    </section>)}
    {props.showLessonWords ? <section className="grid gap-3" aria-labelledby="compound-reading-todays-words">
      <h2 id="compound-reading-todays-words" className="text-center text-xl font-black text-white">Today&apos;s compound words</h2>
      {props.words.map((entry) => <article key={entry.canonicalWordId} className="rounded-2xl border border-cyan-300/30 bg-slate-950/35 p-3"><p className="font-black text-white">{entry.components.join(" + ")} → {entry.displayWord}</p><p className="text-sm text-cyan-100">{entry.componentMeanings?.join(" + ")}</p>{entry.componentToWholeRelationship ? <p className="mt-1 text-sm font-semibold text-amber-100">{entry.componentToWholeRelationship}</p> : null}</article>)}
    </section> : null}
  </section>;
}

function CompoundWordLessonRuntime(props: RuntimeProps) {
  const [state, setState] = useState<ClosedCompoundResumeState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [introPageIndex, setIntroPageIndex] = useState(0);
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
  const phase = state.stage === "intro" ? 0 : state.stage === "jigsaw" ? 1 : state.stage === "meaning" ? 2 : state.stage === "controlled" ? 3 : state.stage === "dictation" ? 4 : 5;
  const beat = useMemo<GuideBeatV1>(() => ({ id: `closed-${state.stage}`, activityId: state.stage, state: state.stage === "controlled" || state.stage === "dictation" ? "guideSilent" : state.stage === "reflect" ? "reflect" : "invite", say: "", goal: "Build, connect, remember, and spell compound words.", waitFor: "the next step", onComplete: "continue" }), [state.stage]);
  if (!hydrated) return <div className="min-h-[28rem]" aria-label="Restoring Word Lab" />;
  const isV1 = props.resumeNamespace === "closed-compound";
  const readingPages = isV1 ? undefined : props.payload.activities.introduction.readingPages;
  const activeReadingPage = readingPages?.[Math.min(introPageIndex, readingPages.length - 1)];
  const content = state.stage === "intro" ? activeReadingPage ? <section className="grid gap-5">
      <CompoundReadingPage page={activeReadingPage} pageNumber={introPageIndex + 1} pageCount={readingPages.length} showLessonWords={introPageIndex === readingPages.length - 1} words={words} />
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Compound word reading pages">
        <button type="button" disabled={introPageIndex === 0} className="min-h-12 rounded-full border border-cyan-200/60 px-6 font-black text-white disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setIntroPageIndex((current) => Math.max(0, current - 1))}>Back</button>
        {introPageIndex + 1 < readingPages.length ? <button type="button" className="min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950" onClick={() => setIntroPageIndex((current) => Math.min(readingPages.length - 1, current + 1))}>Next page</button> : <button type="button" className="min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950" onClick={() => setState((current) => ({ ...current, stage: "jigsaw" }))}>Open the compound workshop</button>}
      </nav>
    </section> : <section className="grid gap-4 text-center text-cyan-50"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">{isV1 ? "Closed compounds" : "Compound words"}</p><h1 className="text-4xl font-black text-white">{props.payload.activities.introduction.title}</h1><p className="mx-auto max-w-xl text-lg leading-relaxed">{props.payload.activities.introduction.childFriendlyExplanation}</p><p className="font-black text-amber-100">{props.payload.activities.introduction.summary}</p>{!isV1 ? <div className="grid gap-2 text-left">{words.map((entry) => <article key={entry.canonicalWordId} className="rounded-2xl border border-cyan-300/30 bg-slate-950/35 p-3"><p className="font-black text-white">{entry.components.join(" + ")} → {entry.displayWord}</p><p className="text-sm text-cyan-100">{entry.componentMeanings?.join(" + ")}</p>{entry.componentToWholeRelationship ? <p className="mt-1 text-sm font-semibold text-amber-100">{entry.componentToWholeRelationship}</p> : null}</article>)}</div> : null}<button type="button" className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950" onClick={() => setState((current) => ({ ...current, stage: "jigsaw" }))}>Open the compound workshop</button></section>
    : state.stage === "jigsaw" ? <CompoundJigsawActivity copyMode={isV1 ? "closed_v1" : "generalized"} targets={words.map((entry) => ({ canonicalWordId: entry.canonicalWordId, word: entry.displayWord, components: entry.components, joins: entry.joins }))} muted={state.muted} initialLocked={state.jigsawLocked} initialMisses={state.jigsawMisses} onProgress={({ locked, misses }) => setState((current) => ({ ...current, jigsawLocked: locked, jigsawMisses: misses }))} onComplete={({ locked, misses }) => setState((current) => ({ ...current, stage: "meaning", jigsawLocked: locked, jigsawMisses: misses }))} />
    : state.stage === "meaning" ? <MeaningConnectionActivity targets={words.map((entry) => ({ canonicalWordId: entry.canonicalWordId, word: entry.displayWord, definition: entry.childFriendlyDefinition, componentMeanings: entry.componentMeanings, componentToWholeRelationship: entry.componentToWholeRelationship }))} muted={state.muted} initialConnected={state.meaningConnected} initialMisses={state.meaningMisses} onProgress={({ connected, misses }) => setState((current) => ({ ...current, meaningConnected: connected, meaningMisses: misses }))} onComplete={({ connected, misses }) => setState((current) => ({ ...current, index: 0, stage: "controlled", meaningConnected: connected, meaningMisses: misses }))} />
    : state.stage === "controlled" ? <section className="grid gap-4 text-cyan-50"><p className="font-black">Remember word {state.index + 1} of {words.length}</p><CoverShutter key={word.canonicalWordId} word={word.displayWord} splitPoints={[...word.splitPoints]} components={word.components} muted={state.muted} onComplete={(value) => setState((current) => ({ ...current, attempts: { ...current.attempts, [word.canonicalWordId]: value } }))} />{state.attempts[word.canonicalWordId] !== undefined ? <button type="button" className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950" onClick={() => setState((current) => state.index + 1 < words.length ? ({ ...current, index: state.index + 1 }) : ({ ...current, index: 0, stage: "dictation" }))}>Continue</button> : null}</section>
    : state.stage === "dictation" ? <section className="grid gap-4 text-cyan-50"><p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">Sentence {state.index + 1} of {words.length}</p><div className="flex justify-center"><HearWordButton word={word.audioText} label="Play sentence" muted={state.muted} kind="dictation" /></div><label className="text-sm font-semibold text-cyan-50">Write the whole sentence<textarea autoFocus spellCheck={false} autoComplete="off" autoCapitalize="sentences" value={state.sentences[word.canonicalWordId] ?? ""} onChange={(event) => setState((current) => ({ ...current, sentences: { ...current.sentences, [word.canonicalWordId]: event.target.value } }))} className="mt-2 min-h-28 w-full rounded-2xl bg-white p-4 text-lg text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30" /></label>{!state.sentenceChecked ? <button type="button" disabled={!state.sentences[word.canonicalWordId]?.trim()} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40" onClick={() => setState((current) => ({ ...current, sentenceChecked: true }))}>Check sentence</button> : <><DiffReveal attempt={state.sentences[word.canonicalWordId] ?? ""} expected={word.dictationSentence} mode="sentence" /><button type="button" className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950" onClick={() => setState((current) => state.index + 1 < words.length ? ({ ...current, index: state.index + 1, sentenceChecked: false }) : ({ ...current, stage: "reflect", sentenceChecked: false }))}>{state.index + 1 < words.length ? "Next sentence" : "Reflect"}</button></>}</section>
    : <ClosedCompoundReflection childId={props.childId} assignmentId={props.assignmentId} items={props.items} payload={props.payload} state={state} closedV1={isV1} onReflectionChange={(reflection) => setState((current) => ({ ...current, reflection }))} />;
  return <WordLabScene beat={beat} phase={phase} muted={state.muted} onMutedChange={(muted) => setState((current) => ({ ...current, muted }))} silent={state.stage === "controlled" || state.stage === "dictation"} guideName="Word Builder">{content}</WordLabScene>;
}

function ClosedCompoundReflection(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: RuntimePayload; state: ClosedCompoundResumeState; closedV1: boolean; onReflectionChange: (value: string) => void }) {
  const misses = props.payload.words.lesson.flatMap((entry) => {
    const spellingAttempt = props.state.attempts[entry.canonicalWordId] ?? "";
    const sentenceAttempt = props.state.sentences[entry.canonicalWordId] ?? "";
    const spellingMissed = !isAnswerCorrectUnderPolicy(spellingAttempt, entry.displayWord, EXACT_GOVERNED_FORM_ANSWER_POLICY);
    const sentenceMissed = sentenceAttempt.trim() !== entry.dictationSentence.trim();
    return spellingMissed || sentenceMissed ? [{ entry, spellingAttempt, sentenceAttempt, spellingMissed, sentenceMissed }] : [];
  });
  const guidedAttempts = props.items.flatMap((item) => {
    if (item.sectionKey === "lesson_intro") return [{ key: item.id, attemptText: "viewed" }];
    if (item.sectionKey !== "guided_practice" || !item.canonicalWordId) return [];
    const activityId = item.promptData.closedCompoundActivityId ?? item.promptData.compoundWordActivityId;
    const isJigsaw = activityId === `jigsaw-${item.canonicalWordId}`;
    const completed = isJigsaw ? props.state.jigsawLocked.includes(item.canonicalWordId) : props.state.meaningConnected.includes(item.canonicalWordId);
    const incorrectAttempts = isJigsaw ? props.state.jigsawMisses[item.canonicalWordId] ?? 0 : props.state.meaningMisses[item.canonicalWordId] ?? 0;
    return [{ key: item.id, attemptText: JSON.stringify({ completed, incorrectAttempts, assistanceUsed: false }) }];
  });
  return <form action={completeAdleLessonPartAction} className="grid gap-5 text-cyan-50"><input type="hidden" name="mode" value="child" /><input type="hidden" name="childId" value={props.childId} /><input type="hidden" name="assignmentId" value={props.assignmentId} /><input type="hidden" name="attempts" value={JSON.stringify(Object.entries(props.state.attempts).map(([key, attemptText]) => ({ key, attemptText })))} /><input type="hidden" name="dictationSentenceAttempts" value={JSON.stringify(Object.entries(props.state.sentences).map(([key, attemptText]) => ({ key, attemptText })))} /><input type="hidden" name="dictationAttempts" value="[]" /><input type="hidden" name="probeAttempts" value="[]" /><input type="hidden" name="guidedAttempts" value={JSON.stringify(guidedAttempts)} />
    <section className="rounded-3xl border border-cyan-300/40 bg-slate-950/45 p-5" aria-labelledby="closed-compound-reflection-title"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Look back</p><h2 id="closed-compound-reflection-title" className="mt-2 text-3xl font-black text-white">Think about your compound words</h2>{misses.length ? <><p className="mt-2 text-cyan-100">Let&apos;s look at the words that need another careful check.</p><div className="mt-4 grid gap-3">{misses.map(({ entry, spellingAttempt, sentenceAttempt, spellingMissed, sentenceMissed }) => <article key={entry.canonicalWordId} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-slate-950"><h3 className="text-xl font-black">{entry.displayWord}</h3>{spellingMissed ? <p className="mt-2">You wrote <span className="font-bold">“{spellingAttempt || "nothing yet"}”</span>. The word is <span className="font-black text-emerald-800">{entry.displayWord}</span>.</p> : null}{sentenceMissed ? <p className="mt-2">Check it in the sentence: <span className="font-semibold">“{entry.dictationSentence}”</span>{sentenceAttempt ? ` You wrote “${sentenceAttempt}”.` : ""}</p> : null}</article>)}</div></> : <p className="mt-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-950">{props.closedV1 ? "You checked each compound word carefully. Remember: the two words join with no space." : "You checked each compound word carefully and kept its governed written form."}</p>}</section>
    <label className="grid gap-2 rounded-3xl border border-cyan-300/40 bg-slate-950/45 p-5 text-lg font-black text-white">{props.payload.activities.reflection.promptText}<span className="text-sm font-semibold text-cyan-100">Write about what you learned{misses.length ? " or what you will remember next time" : "."}</span><textarea required autoFocus value={props.state.reflection} onChange={(event) => props.onReflectionChange(event.target.value)} placeholder="I learned that..." className="min-h-32 w-full rounded-2xl border-4 border-cyan-300 bg-white p-4 text-lg font-semibold text-slate-950 placeholder:text-slate-500 shadow-inner outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-200" /></label><input type="hidden" name="learningReflection" value={props.state.reflection} /><button disabled={!props.state.reflection.trim()} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Finish Word Lab</button></form>;
}

export function ClosedCompoundGuidedLesson(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: ClosedCompoundLessonPayloadV1 }) {
  const payload: RuntimePayload = {
    contentVersion: props.payload.contentVersion,
    activities: props.payload.activities,
    words: { lesson: props.payload.words.lesson.map((word) => ({
      canonicalWordId: word.canonicalWordId,
      displayWord: word.displayWord,
      components: [word.firstWord, word.secondWord],
      joins: ["none"],
      childFriendlyDefinition: word.childFriendlyDefinition,
      componentToWholeRelationship: "",
      audioText: word.audioText,
      dictationSentence: word.dictationSentence,
      splitPoints: [word.firstWord.length],
    })) },
  };
  return <CompoundWordLessonRuntime {...props} payload={payload} resumeNamespace="closed-compound" />;
}

export function CompoundWordGuidedLesson(props: { childId: string; assignmentId: string; items: AdleSessionItem[]; payload: CompoundWordLessonPayloadV2 }) {
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
      splitPoints: word.tasks.split.splitPoints,
    })) },
  };
  return <CompoundWordLessonRuntime {...props} payload={payload} resumeNamespace="compound-word-v2" />;
}
