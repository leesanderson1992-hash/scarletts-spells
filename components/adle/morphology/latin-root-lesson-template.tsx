"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";
import { LatinRootIntroduction } from "./latin-root-introduction";
import { LATIN_ROOT_INTRO_GUIDE } from "@/lib/adle/morphology/latin-root-introduction";
import { LessonReflection } from "@/components/adle/activities/lesson-reflection";
import { latinRootReflectionModel } from "@/lib/adle/morphology/latin-root-reflection";
import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { SentenceDictation } from "@/components/adle/activities/shared/sentence-dictation";
import type { OrderedBuildSnapshot } from "@/components/adle/activities/shared/ordered-build-engine";
import { validateLatinRootLesson, type LatinRootLessonContent } from "@/lib/adle/morphology/latin-root-lesson";
import { WordLabScene } from "./word-lab-scene";
import { LatinRootSpellClass } from "./latin-root-spell-class";
import { LatinRootFamilyTree } from "./latin-root-family-tree";
import styles from "./latin-root-lesson.module.css";

import { initialLatinRootProgress, latinRootProgressValid, type LatinRootProgressV1, type LatinRootStage } from "@/lib/adle/morphology/latin-root-progress";

type Stage = LatinRootStage | "done";
type LatinRootTemplateProps = { content: LatinRootLessonContent; previewStart?: "learn" | "spell";
  initialProgress?: LatinRootProgressV1; onProgress?: (progress: LatinRootProgressV1) => void;
  onCheckpoint?: (progress: LatinRootProgressV1) => Promise<void>;
  onFinish?: (progress: LatinRootProgressV1) => Promise<void> };
const stages = ["Learn", "Grow & build", "Spell class", "Cover & check", "Dictation", "Reflect"];
const stageKeys: Stage[] = ["learn", "tree", "spell", "cover", "dictation", "reflect"];

/** The preview and assigned route share one presentation and assessment flow. */
export function LatinRootLessonTemplate(props: LatinRootTemplateProps) {
  validateLatinRootLesson(props.content);
  return <LatinRootLessonRun key={`${props.content.id}:${props.previewStart ?? "learn"}`} {...props} />;
}
function LatinRootLessonRun(props: LatinRootTemplateProps) {
  const { content } = props;
  const words = content.families.flatMap(family => family.words);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState<LatinRootProgressV1>(() => props.initialProgress && latinRootProgressValid(props.initialProgress, content)
    ? props.initialProgress : { ...initialLatinRootProgress(content), stage: props.previewStart ?? "learn" });
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const onProgress = useRef(props.onProgress);
  useEffect(() => { onProgress.current = props.onProgress; }, [props.onProgress]);
  useEffect(() => { if (!progress.finished) onProgress.current?.(progress); }, [progress]);
  function update<K extends keyof LatinRootProgressV1>(key: K, value: SetStateAction<LatinRootProgressV1[K]>) {
    setProgress(previous => ({ ...previous, [key]: typeof value === "function" ? (value as (old: LatinRootProgressV1[K]) => LatinRootProgressV1[K])(previous[key]) : value }));
  }
  const { introSlide, familyIndex, familyProgress, index, coverAttempts, sentenceAttempts, reflection } = progress;
  const stage: Stage = progress.finished ? "done" : progress.stage;
  const sentence = progress.sentenceValues[words[index].id] ?? "";
  const checked = Object.hasOwn(sentenceAttempts, words[index].id);
  const setIntroSlide = (value: number) => update("introSlide", value);
  const setFamilyIndex = (value: SetStateAction<number>) => update("familyIndex", value);
  const setFamilyProgress = (value: SetStateAction<Record<string, OrderedBuildSnapshot>>) => update("familyProgress", value);
  const setIndex = (value: SetStateAction<number>) => update("index", value);
  const setSentence = (value: string) => update("sentenceValues", previous => ({ ...previous, [words[index].id]: value }));
  const setReflection = (value: string) => update("reflection", value);
  async function checkpoint(next: LatinRootProgressV1) {
    await props.onCheckpoint?.(next);
    setProgress(next);
  }
  async function finish() {
    if (finishing) return;
    setFinishing(true); setFinishError("");
    try { const next = { ...progress, finished: true }; await props.onFinish?.(next); setProgress(next); }
    catch { setFinishError("Your lesson could not be saved. Your answers are still here. Please try Finish again."); }
    finally { setFinishing(false); }
  }
  const current = words[index];
  const reflectionModel = latinRootReflectionModel(words, coverAttempts, sentenceAttempts);
  const go = (next: LatinRootStage) => update("stage", next);
  const independent = stage === "cover" || stage === "dictation";
  return <article className={styles.lesson} aria-label="Common Latin roots lesson">
    <WordLabScene
      className={`${styles.scene} ${stage === "tree" ? styles.treeScene : stage === "spell" ? styles.spellScene : ""}`}
      beat={{ id: `latin-root-${stage}`, activityId: stage, state: stage === "reflect" ? "reflect" : "focus", say: stage === "tree" ? "Match each branch’s meaning. Drag a word part into a space, or select it and tap the space. The word checks itself when the spaces are full." : stage === "learn" ? LATIN_ROOT_INTRO_GUIDE[introSlide] : stage === "spell" ? "Choose what your spell will do. Match its meaning to a root, then add a fun ending. You can even combine two roots!" : stage === "reflect" ? "Think about how the root helped you today." : "Take your time. Listen, remember, and write.", goal: "Understand and spell Latin root families", waitFor: "your next step", onComplete: "Keep using the root to help you." }}
      phase={Math.max(0, stageKeys.indexOf(stage === "done" ? "reflect" : stage))}
      phases={stages}
      phaseCues={stages}
      muted={muted}
      onMutedChange={setMuted}
      silent={independent}
      guidePortrait={independent ? undefined : { src: "/adle/latin-roots/adie-wizard.webp", alt: "ADIE wearing a wizard hat" }}
    >
    {stage === "learn" && <LatinRootIntroduction canonicalContentOnly={Boolean(props.onFinish)} initialSlide={introSlide} content={content} muted={muted} onPageChange={setIntroSlide} onComplete={() => go("tree")} />}
    {stage === "tree" && <LatinRootFamilyTree
      key={content.families[familyIndex].id}
      family={content.families[familyIndex]}
      muted={muted}
      familyIndex={familyIndex}
      familyCount={content.families.length}
      initialSnapshot={familyProgress[content.families[familyIndex].id]}
      onProgress={snapshot => setFamilyProgress(previous => ({ ...previous, [content.families[familyIndex].id]: snapshot }))}
      onBack={familyIndex > 0 ? () => setFamilyIndex(previous => previous - 1) : undefined}
      onNext={() => familyIndex + 1 < content.families.length ? setFamilyIndex(previous => previous + 1) : go("spell")}
    />}
    {stage === "spell" && <LatinRootSpellClass initialDraft={progress.spellDraft} onDraftChange={draft => update("spellDraft", draft)} families={content.families} muted={muted} onMutedChange={setMuted} onContinue={() => setProgress(previous => ({ ...previous, index: 0, spellComplete: true, stage: "cover" }))} />}
    {stage === "cover" && <section className={styles.assessment} data-cover-appearance="theme" aria-label="Cover and check"><h2>Cover & check</h2><CoverShutter key={current.id} muted={muted} word={current.word} splitPoints={[]} initialState={progress.coverStates[current.id]?.state} initialAttempt={progress.coverStates[current.id]?.attempt}
      onStateChange={(state, attempt) => update("coverStates", previous => ({ ...previous, [current.id]: { state, attempt } }))}
      onCovered={() => checkpoint({ ...progress, coverStates: { ...progress.coverStates, [current.id]: { state: "write", attempt: "" } } })}
      onComplete={attempt => checkpoint({ ...progress, coverAttempts: { ...coverAttempts, [current.id]: Object.hasOwn(coverAttempts, current.id) ? coverAttempts[current.id] : attempt }, coverStates: { ...progress.coverStates, [current.id]: { state: "check", attempt } } })} stepLabel={`Word ${index + 1} of ${words.length}`} onContinue={() => { if (index + 1 < words.length) setIndex(previous => previous + 1); else { setIndex(0); go("dictation"); } }} /></section>}
    {stage === "dictation" && <section className={styles.assessment} data-dictation-appearance="theme" aria-label="Full sentence dictation"><SentenceDictation key={current.id} muted={muted} audioText={current.sentence} recordingSrc={current.recordingSrc} correctSentence={current.sentence} value={sentence} checked={checked} stepLabel={`Sentence ${index + 1} of ${words.length}`} onValueChange={setSentence} onCheck={() => checkpoint({ ...progress, sentenceAttempts: { ...sentenceAttempts, [current.id]: Object.hasOwn(sentenceAttempts, current.id) ? sentenceAttempts[current.id] : sentence } })} onContinue={() => { if (index + 1 < words.length) setIndex(previous => previous + 1); else go("reflect"); }} /></section>}
    {stage === "reflect" && <section className={`${styles.assessment} ${styles.reflectionSurface}`} aria-label="Lesson reflection"><LessonReflection
      mistakes={reflectionModel.mistakes}
      sentenceComparisons={reflectionModel.sentenceComparisons}
      highlightDifferences
      autoFocus={false}
      prompt="How did finding the Latin root help you understand or spell a word?"
      response={reflection}
      onResponseChange={setReflection}
      onComplete={finish}
      pending={finishing}
      completionLabel={props.onFinish ? "Finish lesson" : "Finish preview"}
    />{finishError ? <p role="alert">{finishError}</p> : null}</section>}
    {stage === "done" && <section className={styles.panel}><h2>Your word trees have grown!</h2><p>You explored {words.length} words and their Latin roots.</p><p>{props.onFinish ? "Your lesson has been saved." : "This preview has not saved learning evidence or changed progress."}</p></section>}
    </WordLabScene>
  </article>;
}
