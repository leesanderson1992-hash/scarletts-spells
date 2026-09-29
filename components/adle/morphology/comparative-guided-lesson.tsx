"use client";

import { useRef, useState } from "react";
import { FirstImpressionLesson, type FirstImpressionStageId } from "@/components/adle/first-impression/first-impression-lesson";
import { createCanonicalActivityBinding, type CanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import { BinSort } from "@/components/adle/activities/shared/bin-sort";
import { validateComparativeLesson } from "@/lib/adle/inflection/lesson";
import { comparativeProgressValid, initialComparativeProgress, type ComparativeProgressV1 } from "@/lib/adle/inflection/resume";
import type { ComparativeLessonV1 } from "@/lib/adle/inflection/contracts";
import { comparativeReflectionModel } from "@/lib/adle/inflection/reflection";

export interface ComparativeGuidedLessonProps {
  lesson: ComparativeLessonV1;
  initialProgress?: ComparativeProgressV1;
  fixtureMode?: boolean;
  onProgress?: (progress: ComparativeProgressV1) => void;
  onCheckpoint?: (progress: ComparativeProgressV1) => Promise<void>;
  onFinish: (progress: ComparativeProgressV1) => Promise<void>;
}
/** One adapter, existing shell, seven configured canonical template selections. */
export function ComparativeGuidedLesson(props: ComparativeGuidedLessonProps) {
  const [progress, setProgress] = useState(() => props.initialProgress && comparativeProgressValid(props.initialProgress, props.lesson) ? props.initialProgress : initialComparativeProgress(props.lesson));
  const current = useRef(progress);
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const lesson = props.lesson;
  function change(update: Partial<ComparativeProgressV1>) {
    const next = { ...current.current, ...update };
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next; setProgress(next); props.onProgress?.(next);
  }
  async function checkpoint(update: Partial<ComparativeProgressV1>) {
    const next = { ...current.current, ...update };
    await props.onCheckpoint?.(next);
    change(update);
  }
  const binding = (id: string, concept: string, mode: string, createProps: CanonicalActivityBinding["createProps"], renderKey?: string) => createCanonicalActivityBinding({ id, concept, mode, label: id, contractVersion: 1, createProps, renderKey });
  if (!validateComparativeLesson(lesson, props.fixtureMode === true)) return <p role="alert">This lesson is not ready. Approved word families and content are required.</p>;
  if (progress.finished) return <section className="brand-card grid gap-3 rounded-3xl p-8 text-center" data-comparative-finished="true"><h1 className="text-3xl font-bold">Lesson complete</h1><p>You practised two word families and six spellings.</p><p>{props.fixtureMode ? "Preview complete. No learner data, evidence or rewards were written." : "Your lesson has been saved."}</p></section>;
  const sentence = lesson.sentenceTasks[progress.sentenceIndex];
  const sentenceFamily = lesson.families.find(f => f.familyKey === sentence.familyKey)!;
  const cleaver = lesson.cleaverTasks[progress.cleaverIndex];
  const cover = lesson.words[progress.coverIndex];
  const dictation = lesson.dictationTasks[progress.dictationIndex];
  const coverSaved = progress.coverProgress[cover.canonicalWordId];
  const reflection = comparativeReflectionModel(lesson, progress);
  async function finish() {
    if (finishing.current) return;
    const next = { ...current.current, stageId: "reflection" as FirstImpressionStageId, finished: true };
    if (!comparativeProgressValid(next, lesson)) { setError("Please complete every task before finishing."); return; }
    finishing.current = true; setPending(true); setError(null);
    try { await props.onFinish(next); change({ finished: true }); }
    catch { finishing.current = false; setError("We couldn't finish the lesson yet. Your answers are kept; please try again."); }
    finally { setPending(false); }
  }
  return <>
    <FirstImpressionLesson teaching={lesson.teaching} initialStageId={progress.stageId}
      initialTeachingPageIndex={progress.teachingPageIndex} onTeachingPageChange={index => change({ teachingPageIndex: index })}
      onStageChange={stageId => change({ stageId })}
      activities={[
        { id: "sentence-build", type: "word_build", label: "Compare", binding: binding("sentence-build", "WORD_ASSEMBLY", "sentence_suffix", navigation => ({
          sentence, baseWord: sentenceFamily.words[0].word, forms: sentenceFamily.words.slice(1), transformations: sentenceFamily.transformations, stepLabel: `Sentence ${progress.sentenceIndex + 1} of 6`,
          muted, initialProgress: progress.sentenceProgress[sentence.id], onProgress: (value: ComparativeProgressV1["sentenceProgress"][string]) => change({ sentenceProgress: { ...current.current.sentenceProgress, [sentence.id]: value } }),
          onContinue: () => progress.sentenceIndex < 5 ? change({ sentenceIndex: progress.sentenceIndex + 1 }) : navigation.complete(),
        }), sentence.id) },
        { id: "degree-sort", type: "meaning_sort", label: "Sort", render: navigation => progress.sortPreludeComplete ? <BinSort
          items={lesson.words.filter(w => w.degree !== "base").map(w => ({ id: w.canonicalWordId, text: w.word, destination: w.degree }))}
          bins={[{ id: "comparative", label: "Comparative", description: "Compare two — -er" }, { id: "superlative", label: "Superlative", description: "Compare a group — -est" }]}
          instruction="Put each word into the right comparison bucket." muted={muted} initialComplete={progress.sortComplete}
          onComplete={() => change({ sortComplete: true })} onContinue={() => navigation.complete()} /> : <section className="grid gap-5 text-center text-cyan-50">
          <h2 className="text-2xl font-black">Two comparison buckets</h2><p>Comparative compares two things or people: -er.</p><p>Superlative compares a group of three or more: -est.</p>
          <button type="button" autoFocus onClick={() => change({ sortPreludeComplete: true })} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Let&apos;s go</button>
        </section> },
        { id: "cleaver", type: "cleaver", label: "Cleaver", binding: binding("cleaver", "CLEAVER", "transform_target", navigation => ({
          transformation: cleaver.transformation, question: cleaver.question, stepLabel: `Word ${progress.cleaverIndex + 1} of ${lesson.cleaverTasks.length}`, muted,
          initialProgress: progress.cleaverProgress[cleaver.target.canonicalWordId], onProgress: (value: ComparativeProgressV1["cleaverProgress"][string]) => change({ cleaverProgress: { ...current.current.cleaverProgress, [cleaver.target.canonicalWordId]: value } }),
          onContinue: () => progress.cleaverIndex + 1 < lesson.cleaverTasks.length ? change({ cleaverIndex: progress.cleaverIndex + 1 }) : navigation.complete(),
        }), cleaver.target.canonicalWordId) },
      ]}
      coverActivity={binding("cover", "COVER_CHECK", "whole_word", navigation => ({
        word: cover.word, splitPoints: [], initialState: coverSaved?.state === "cover" ? "write" : coverSaved?.state, initialAttempt: coverSaved?.attempt,
        stepLabel: `Cover Check ${progress.coverIndex + 1} of 6`, muted, continueLabel: "Continue",
        onCovered: () => checkpoint({ coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state: "write", attempt: "" } } }),
        onStateChange: (state: "look" | "cover" | "write" | "check", attempt: string) => change({ coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state, attempt } } }),
        onComplete: (attempt: string) => checkpoint({ coverAttempts: { ...current.current.coverAttempts, [cover.canonicalWordId]: attempt }, coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state: "check", attempt } } }),
        onContinue: () => progress.coverIndex < 5 ? change({ coverIndex: progress.coverIndex + 1 }) : navigation.complete(),
      }), cover.canonicalWordId)}
      dictationActivity={binding("dictation", "DICTATION", "paired_word_gaps", navigation => ({
        mode: "paired_word_gaps", sentence: dictation, audioOrder: dictation.audioOrder, values: progress.dictationValues[dictation.id] ?? ["", ""], checked: progress.dictationChecked[dictation.id] ?? false,
        stepLabel: `Paired dictation ${progress.dictationIndex + 1} of 2`, muted,
        onValuesChange: (values: [string, string]) => change({ dictationValues: { ...current.current.dictationValues, [dictation.id]: values } }),
        onCheck: () => checkpoint({ dictationChecked: { ...current.current.dictationChecked, [dictation.id]: true } }),
        onContinue: () => progress.dictationIndex < 1 ? change({ dictationIndex: progress.dictationIndex + 1 }) : navigation.complete(),
      }), dictation.id)}
      reflectionActivity={binding("reflection", "LESSON_REFLECTION", "standard_lesson_reflection", () => ({
        ...reflection, prompt: lesson.reflectionPrompt, responseHelpText: null, responsePlaceholder: "I will remember…", response: progress.reflection, autoFocus: false,
        onResponseChange: (reflection: string) => change({ reflection }), onComplete: () => void finish(), pending, completionLabel: "Finish", pendingLabel: "Saving your lesson…",
      }))}
      scene={{ guideName: "Word Scout", beat: { id: "comparative-guide", activityId: progress.stageId, state: "focus", say: "Look at the comparison, then notice the spelling rule.", goal: "Compare and spell six words", waitFor: "activity_complete", onComplete: "Ready for the next task." }, muted, onMutedChange: setMuted }}
    />
    {error ? <p role="alert" className="mt-4 rounded-2xl bg-rose-100 p-4 text-rose-950">{error}</p> : null}
  </>;
}
