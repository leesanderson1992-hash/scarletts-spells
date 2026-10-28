"use client";

import { useRef, useState } from "react";
import { FirstImpressionLesson, type FirstImpressionStageId } from "@/components/adle/first-impression/first-impression-lesson";
import { createCanonicalActivityBinding, type CanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import { DINNER_ACTIVITY_VERSION } from "@/lib/adle/word-lab/call-it-to-dinner";
import { DETECTIVE_ACTIVITY_VERSION } from "@/lib/adle/word-lab/family-tree-detective";
import { validateWeakVowelLesson, type WeakVowelLessonV1 } from "@/lib/adle/weak-vowel/lesson";
import { initialWeakVowelProgress, weakVowelProgressValid, weakVowelReadyToFinish, type WeakVowelProgressV1, type WeakVowelStage } from "@/lib/adle/weak-vowel/progress";
import { weakVowelReflectionReview } from "@/lib/adle/weak-vowel/reflection-review";

export interface WeakVowelGuidedLessonProps {
  lesson: WeakVowelLessonV1;
  initialProgress?: WeakVowelProgressV1;
  fixtureMode?: boolean;
  onProgress?: (progress: WeakVowelProgressV1) => void;
  /** Freeze original production before revealing an answer. */
  onCheckpoint?: (progress: WeakVowelProgressV1) => Promise<void>;
  onFinish: (progress: WeakVowelProgressV1) => Promise<void>;
}

export function WeakVowelGuidedLesson(props: WeakVowelGuidedLessonProps) {
  const lesson = props.lesson;
  const [progress, setProgress] = useState(() => props.initialProgress && weakVowelProgressValid(props.initialProgress, lesson)
    ? props.initialProgress : initialWeakVowelProgress(lesson));
  const current = useRef(progress);
  const finishing = useRef(false);
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(update: Partial<WeakVowelProgressV1>) {
    const next = { ...current.current, ...update };
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next;
    setProgress(next);
    props.onProgress?.(next);
  }
  async function checkpoint(update: Partial<WeakVowelProgressV1>) {
    const next = { ...current.current, ...update };
    await props.onCheckpoint?.(next);
    change(update);
  }
  async function finish() {
    if (finishing.current || current.current.finished) return;
    const next = { ...current.current, finished: true };
    if (!weakVowelReadyToFinish(next, lesson)) { setError("Finish each word and your reflection first."); return; }
    finishing.current = true;
    setPending(true);
    setError(null);
    try { await props.onFinish(next); change({ finished: true }); }
    catch { finishing.current = false; setError("Your lesson could not be saved yet. Your answers are kept; please try again."); }
    finally { setPending(false); }
  }

  if (!validateWeakVowelLesson(lesson, props.fixtureMode === true)) return <p role="alert">This vowel lesson needs four to six selected words with approved, matching content.</p>;
  if (progress.finished) return <section className="brand-card mx-auto grid max-w-3xl gap-4 rounded-3xl p-8 text-center" data-weak-vowel-finished="true"><h1 className="text-3xl font-black">Mission complete</h1><p>You investigated, remembered and wrote today&apos;s words.</p><p>{props.fixtureMode ? "Local preview complete. No learner evidence was written." : "Your lesson has been saved."}</p></section>;

  const coverWord = lesson.words[progress.coverIndex];
  const dictationWord = lesson.words[progress.dictationIndex];
  const review = weakVowelReflectionReview(lesson, progress);
  const binding = (id: string, concept: string, mode: string, createProps: CanonicalActivityBinding["createProps"], renderKey?: string) =>
    createCanonicalActivityBinding({ id, concept, mode, label: id, contractVersion: 1, createProps, renderKey });

  return <>
    <FirstImpressionLesson
      sceneClassName={`weak-vowel-lesson${progress.stageId === "reflection" ? " weak-vowel-reflection-layout" : ""}`}
      teaching={lesson.teaching}
      initialStageId={progress.stageId}
      initialTeachingPageIndex={progress.teachingPageIndex}
      onTeachingPageChange={(teachingPageIndex) => change({ teachingPageIndex })}
      onStageChange={(stageId) => change({ stageId: stageId as WeakVowelStage })}
      activities={[
        { id: "dinner", type: "call_it_to_dinner", label: "Call It to Dinner", sceneClassName: "weak-vowel-dinner-layout", binding: binding("dinner", "CALL_IT_TO_DINNER", "reviewed_syllable_and_span", (navigation) => ({
          config: { schemaVersion: DINNER_ACTIVITY_VERSION, rounds: lesson.words.map((word) => word.dinner) },
          initialState: progress.dinnerState, previewCandidate: props.fixtureMode === true, muted, showInlineGuide: false, lessonLayout: true,
          onStateChange: (dinnerState: unknown) => change({ dinnerState }),
          onComplete: (dinnerResponse: Record<string, unknown>) => { change({ dinnerResponse }); navigation.complete(); },
        })) },
        { id: "detective", type: "vowel_detective", label: "Vowel Detective", sceneClassName: "weak-vowel-detective-layout", binding: binding("detective", "VOWEL_DETECTIVE", "missing_vowel_and_family", (navigation) => ({
          config: { schemaVersion: DETECTIVE_ACTIVITY_VERSION, rounds: lesson.words.map((word) => word.detective) },
          initialState: progress.detectiveState, previewCandidate: props.fixtureMode === true, muted, showInlineGuide: false, lessonLayout: true,
          onStateChange: (detectiveState: unknown) => change({ detectiveState }),
          onComplete: (detectiveResponse: Record<string, unknown>) => { change({ detectiveResponse }); navigation.complete(); },
        })) },
      ]}
      coverActivity={binding("cover", "COVER_CHECK", "whole_word", (navigation) => ({
        word: coverWord.spelling, splitPoints: [], stepLabel: `Memory Lock · word ${progress.coverIndex + 1} of ${lesson.words.length}`, muted,
        initialState: progress.coverStates[coverWord.canonicalWordId]?.state ?? "look",
        initialAttempt: progress.coverStates[coverWord.canonicalWordId]?.attempt ?? "",
        onStateChange: (state: "look" | "cover" | "write" | "check", attempt: string) => change({ coverStates: { ...current.current.coverStates, [coverWord.canonicalWordId]: { state, attempt } } }),
        onCovered: () => checkpoint({ coverStates: { ...current.current.coverStates, [coverWord.canonicalWordId]: { state: "cover", attempt: current.current.coverStates[coverWord.canonicalWordId]?.attempt ?? "" } } }),
        onComplete: (attempt: string) => checkpoint({ coverAttempts: { ...current.current.coverAttempts, [coverWord.canonicalWordId]: current.current.coverAttempts[coverWord.canonicalWordId] ?? attempt } }),
        onContinue: () => progress.coverIndex + 1 < lesson.words.length ? change({ coverIndex: progress.coverIndex + 1 }) : navigation.complete(),
      }), coverWord.canonicalWordId)}
      dictationActivity={binding("dictation", "DICTATION", "whole_sentence", (navigation) => ({
        audioText: dictationWord.dictation.sentence,
        recordingSrc: dictationWord.dictation.recording.src.startsWith("device-speech:") ? undefined : dictationWord.dictation.recording.src,
        deviceSpeechRequired: dictationWord.dictation.recording.src.startsWith("device-speech:"),
        correctSentence: dictationWord.dictation.sentence, value: progress.dictationValues[dictationWord.canonicalWordId] ?? "",
        checked: progress.dictationChecked.includes(dictationWord.canonicalWordId), stepLabel: `Dictation · sentence ${progress.dictationIndex + 1} of ${lesson.words.length}`, muted,
        onValueChange: (value: string) => change({ dictationValues: { ...current.current.dictationValues, [dictationWord.canonicalWordId]: value } }),
        onCheck: () => checkpoint({
          dictationAttempts: { ...current.current.dictationAttempts,
            [dictationWord.canonicalWordId]: current.current.dictationAttempts[dictationWord.canonicalWordId] ??
              (current.current.dictationValues[dictationWord.canonicalWordId] ?? "") },
          dictationChecked: [...new Set([...current.current.dictationChecked, dictationWord.canonicalWordId])],
        }),
        onContinue: () => progress.dictationIndex + 1 < lesson.words.length ? change({ dictationIndex: progress.dictationIndex + 1 }) : navigation.complete(),
      }), dictationWord.canonicalWordId)}
      reflectionActivity={binding("reflection", "LESSON_REFLECTION", "standard_lesson_reflection", () => ({
        mistakes: review.mistakes, sentenceComparisons: review.sentenceComparisons, contextRecap: review.contextRecap,
        contextEyebrow: "Guided review", appearance: "weak-vowel-neon",
        successMessage: review.sentenceComparisons.length || review.contextRecap
          ? "No Memory Lock spellings need another look. Check the other review cards, then write what helped you."
          : "You checked each spelling carefully. Write what helped you remember them.",
        prompt: lesson.reflectionPrompt, response: progress.reflection, responseHelpText: null, autoFocus: false,
        responsePlaceholder: "I will remember…", onResponseChange: (reflection: string) => change({ reflection }),
        onComplete: () => void finish(), pending, completionLabel: "Finish", pendingLabel: "Saving your lesson…",
      }))}
      scene={{ guideName: "ADIE", beat: { id: "weak-vowel-guide-v1", activityId: progress.stageId as FirstImpressionStageId,
        state: "focus", say: "Listen for the quiet vowel, then look carefully at its spelling.",
        goal: "Investigate and spell your selected words", waitFor: "activity_complete", onComplete: "Ready for the next task." },
        muted, onMutedChange: setMuted }}
    />
    {error ? <p role="alert" className="mx-auto mt-4 max-w-3xl rounded-2xl bg-rose-100 p-4 font-bold text-rose-950">{error}</p> : null}
  </>;
}
