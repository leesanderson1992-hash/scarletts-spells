"use client";

import { useRef, useState } from "react";
import { FirstImpressionLesson, type FirstImpressionStageId } from "@/components/adle/first-impression/first-impression-lesson";
import { createCanonicalActivityBinding, type CanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import { ING_RULE_COPY, ingTransformation, validateIngLesson } from "@/lib/adle/ing/lesson";
import { ingProgressValid, initialIngProgress, type IngProgressV1 } from "@/lib/adle/ing/progress";
import { initialIngScrabbleBoard } from "@/lib/adle/ing/scrabble";
import type { IngLessonV1 } from "@/lib/adle/ing/contracts";
import { ingDictationAudioText } from "@/lib/adle/ing/pronunciation";
import type { NormalizedLessonReflectionMistake } from "@/lib/adle/lesson-reflection";

export interface IngGuidedLessonProps {
  lesson: IngLessonV1;
  initialProgress?: IngProgressV1;
  fixtureMode?: boolean;
  onProgress?: (progress: IngProgressV1) => void;
  onCheckpoint?: (progress: IngProgressV1) => Promise<void>;
  onFinish: (progress: IngProgressV1) => Promise<void>;
}
export function IngGuidedLesson(props: IngGuidedLessonProps) {
  const lesson = props.lesson;
  const [progress, setProgress] = useState(() => props.initialProgress && ingProgressValid(props.initialProgress, lesson) ? props.initialProgress : initialIngProgress(lesson));
  const current = useRef(progress);
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  function change(update: Partial<IngProgressV1>) {
    const next = { ...current.current, ...update };
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    current.current = next; setProgress(next); props.onProgress?.(next);
  }
  async function checkpoint(update: Partial<IngProgressV1>) {
    const next = { ...current.current, ...update };
    await props.onCheckpoint?.(next);
    change(update);
  }
  const binding = (id: string, concept: string, mode: string, createProps: CanonicalActivityBinding["createProps"], renderKey?: string) => createCanonicalActivityBinding({ id, concept, mode, label: id, contractVersion: 1, createProps, renderKey });
  if (!validateIngLesson(lesson, props.fixtureMode === true)) return <p role="alert">This -ing lesson needs approved words and content.</p>;
  if (progress.finished) return <section className="brand-card grid gap-3 rounded-3xl p-8 text-center" data-ing-finished="true"><h1 className="text-3xl font-bold">Lesson complete</h1><p>You practised six -ing words.</p><p>{props.fixtureMode ? "Preview complete. No learner data was written." : "Your lesson has been saved."}</p></section>;
  const meaningWords = [lesson.words[0], lesson.words[2], lesson.words[4]];
  const scrabbleWords = [lesson.words[1], lesson.words[3], lesson.words[5]];
  const scrabble = scrabbleWords[progress.scrabbleIndex];
  const cleaverWord = lesson.words.find(word => word.canonicalWordId === lesson.queuedTargets[progress.cleaverIndex].canonicalWordId)!;
  const cover = lesson.words[progress.coverIndex];
  const dictation = lesson.words[progress.dictationIndex];
  const question = { id: `ing:${cleaverWord.canonicalWordId}:rule`, kind: "why" as const,
    prompt: `What changed when ${cleaverWord.base} became ${cleaverWord.word}?`, options: [
      { id: "0", text: ING_RULE_COPY[lesson.rule].explanation },
      { id: "1", text: "Every verb doubles its final letter before -ing." },
      { id: "2", text: "Every verb loses its last letter before -ing." },
    ], correctOptionId: "0", explanation: ING_RULE_COPY[lesson.rule].explanation };
  const mistakes: NormalizedLessonReflectionMistake[] = lesson.words.flatMap(word => {
    const entries: NormalizedLessonReflectionMistake[] = [];
    for (const [kind, attempt] of [["cover", progress.coverAttempts[word.canonicalWordId]], ["dictation", progress.dictationChecked.includes(word.canonicalWordId) ? progress.dictationValues[word.canonicalWordId] : undefined]] as const) {
      if (attempt !== undefined && attempt.trim().toLocaleLowerCase("en-GB") !== word.word) entries.push({ id: `${kind}:${word.canonicalWordId}`, attempt, correctSpelling: word.word });
    }
    return entries;
  });
  async function finish() {
    if (finishing.current) return;
    const next = { ...current.current, stageId: "reflection" as FirstImpressionStageId, finished: true };
    if (!ingProgressValid(next, lesson)) { setError("Please complete every task before finishing."); return; }
    finishing.current = true; setPending(true); setError(null);
    try { await props.onFinish(next); change({ finished: true }); }
    catch { finishing.current = false; setError("We couldn't finish the lesson yet. Your answers are kept; please try again."); }
    finally { setPending(false); }
  }
  return <>
    <FirstImpressionLesson teaching={lesson.teaching} initialStageId={progress.stageId} initialTeachingPageIndex={progress.teachingPageIndex}
      onTeachingPageChange={teachingPageIndex => change({ teachingPageIndex })} onStageChange={stageId => change({ stageId })}
      activities={[
        { id: "meaning-match", type: "meaning_match", label: "Meaning Match", binding: binding("meaning-match", "MEANING_MATCH", "word_to_definition", navigation => ({
          targets: meaningWords.map(word => ({ canonicalWordId: word.canonicalWordId, word: word.word, definition: word.meaning })), muted,
          initialConnected: progress.meaningConnected, initialMisses: progress.meaningMisses,
          onProgress: (value: { connected: string[]; misses: Record<string, number> }) => change({ meaningConnected: value.connected, meaningMisses: value.misses }),
          onComplete: () => navigation.complete(),
        })) },
        { id: "ing-scrabble", type: "word_build", label: "Scrabble", binding: binding("ing-scrabble", "SCRABBLE", "ing_tiles", navigation => ({
          word: scrabble, stepLabel: `Word ${progress.scrabbleIndex + 1} of 3`, muted,
          initialBoard: progress.scrabbleBoards[scrabble.canonicalWordId] ?? initialIngScrabbleBoard(scrabble),
          initialComplete: progress.scrabbleComplete.includes(scrabble.canonicalWordId),
          onProgress: (board: IngProgressV1["scrabbleBoards"][string]) => change({ scrabbleBoards: { ...current.current.scrabbleBoards, [scrabble.canonicalWordId]: board } }),
          onComplete: (board: IngProgressV1["scrabbleBoards"][string]) => change({ scrabbleBoards: { ...current.current.scrabbleBoards, [scrabble.canonicalWordId]: board }, scrabbleComplete: [...new Set([...current.current.scrabbleComplete, scrabble.canonicalWordId])] }),
          onContinue: () => progress.scrabbleIndex < 2 ? change({ scrabbleIndex: progress.scrabbleIndex + 1 }) : navigation.complete(),
        }), scrabble.canonicalWordId) },
        { id: "cleaver", type: "cleaver", label: "Cleaver", binding: binding("cleaver", "CLEAVER", "ing_transform_target", navigation => ({
          transformation: ingTransformation(cleaverWord), question, stepLabel: `Queued word ${progress.cleaverIndex + 1} of ${lesson.queuedTargets.length}`, muted,
          initialProgress: progress.cleaverProgress[cleaverWord.canonicalWordId],
          onProgress: (value: IngProgressV1["cleaverProgress"][string]) => change({ cleaverProgress: { ...current.current.cleaverProgress, [cleaverWord.canonicalWordId]: value } }),
          onContinue: () => progress.cleaverIndex + 1 < lesson.queuedTargets.length ? change({ cleaverIndex: progress.cleaverIndex + 1 }) : navigation.complete(),
        }), cleaverWord.canonicalWordId) },
      ]}
      coverActivity={binding("cover", "COVER_CHECK", "whole_word", navigation => ({
        word: cover.word, splitPoints: [], stepLabel: `Cover Check ${progress.coverIndex + 1} of 6`, muted,
        initialState: progress.coverProgress[cover.canonicalWordId]?.state === "cover" ? "write" : progress.coverProgress[cover.canonicalWordId]?.state,
        initialAttempt: progress.coverProgress[cover.canonicalWordId]?.attempt,
        onCovered: () => checkpoint({ coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state: "write", attempt: "" } } }),
        onStateChange: (state: "look" | "cover" | "write" | "check", attempt: string) => change({ coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state, attempt } } }),
        onComplete: (attempt: string) => checkpoint({ coverAttempts: { ...current.current.coverAttempts, [cover.canonicalWordId]: attempt }, coverProgress: { ...current.current.coverProgress, [cover.canonicalWordId]: { state: "check", attempt } } }),
        onContinue: () => progress.coverIndex < 5 ? change({ coverIndex: progress.coverIndex + 1 }) : navigation.complete(),
      }), cover.canonicalWordId)}
      dictationActivity={binding("dictation", "DICTATION", "single_word_gap", navigation => ({
        mode: "single_word_gap", word: dictation.word, sentence: dictation.dictationSentence, audioText: ingDictationAudioText(dictation), value: progress.dictationValues[dictation.canonicalWordId] ?? "",
        checked: progress.dictationChecked.includes(dictation.canonicalWordId), stepLabel: `Dictation ${progress.dictationIndex + 1} of 6`, muted,
        onValueChange: (value: string) => change({ dictationValues: { ...current.current.dictationValues, [dictation.canonicalWordId]: value } }),
        onCheck: () => checkpoint({ dictationChecked: [...new Set([...current.current.dictationChecked, dictation.canonicalWordId])] }),
        onContinue: () => progress.dictationIndex < 5 ? change({ dictationIndex: progress.dictationIndex + 1 }) : navigation.complete(),
      }), dictation.canonicalWordId)}
      reflectionActivity={binding("reflection", "LESSON_REFLECTION", "standard_lesson_reflection", () => ({
        mistakes, prompt: lesson.reflectionPrompt, responseHelpText: null, responsePlaceholder: "I will remember…", response: progress.reflection, autoFocus: false,
        onResponseChange: (reflection: string) => change({ reflection }), onComplete: () => void finish(), pending,
        completionLabel: "Finish", pendingLabel: "Saving your lesson…",
      }))}
      scene={{ guideName: "Word Scout", beat: { id: "ing-guide", activityId: progress.stageId, state: "focus", say: "Look at the base verb, then notice the -ing spelling rule.", goal: "Understand and spell six -ing words", waitFor: "activity_complete", onComplete: "Ready for the next task." }, muted, onMutedChange: setMuted }}
    />
    {error ? <p role="alert" className="mt-4 rounded-2xl bg-rose-100 p-4 text-rose-950">{error}</p> : null}
  </>;
}
