"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getHomophoneBalloonBest, recordHomophoneBalloonBest } from "@/app/(authenticated)/learn/week/adle/homophone-actions";
import { createCanonicalActivityBinding } from "@/components/adle/activities/canonical-renderer-registry";
import { FirstImpressionLesson } from "@/components/adle/first-impression/first-impression-lesson";
import type { TeachingPagesConfig } from "@/components/adle/first-impression/teaching-pages";
import { readMorphologyResume, writeMorphologyResume } from "@/lib/adle/morphology/resume";
import { fullHomophonePassage, validateHomophoneLessonSnapshot, type HomophoneLesson, type HomophoneLessonSnapshotV1 } from "@/lib/adle/homophone/lesson";
import { validateConvergencePreview } from "@/lib/adle/homophone/convergence-preview-validation";
import { convergenceTeachingConfig } from "@/lib/adle/homophone/convergence-teaching";
import { shuffledIndices } from "@/lib/adle/homophone/random-order";
import { retainedBinDefinitions } from "@/lib/adle/homophone/retained-bin-definitions";
import { homophoneProgressComplete, homophoneProgressValid, initialHomophoneProgress, type HomophoneProgressV1 } from "@/lib/adle/homophone/progress";
import type { GuideBeatV1 } from "@/lib/adle/morphology/payload";

function teachingConfig(snapshot: HomophoneLessonSnapshotV1): TeachingPagesConfig {
  const lesson = snapshot.lesson;
  const supplementalArt: Record<string, string> = {
    "you're": "/adle/homophones/convergence-v1/word-art/you-re.jpg",
    "they're": "/adle/homophones/convergence-v1/word-art/they-re.jpg",
  };
  const supplementalAlt: Record<string, string> = {
    "you're": "A giant letter A transforming into an apostrophe between YOU and RE.",
    "they're": "Three smiling friends holding a large apostrophe between THEY and RE.",
  };
  return { pages: [{ id: "homophone-intro", type: "teaching", title: lesson.teachingIntro.title, paragraphs: lesson.teachingIntro.paragraphs,
    homophoneStandardIntro: true, homophoneFocus: lesson.teachingIntro.focus,
    highlightFocusWords: lesson.words.map(entry => entry.word), callout: lesson.teachingIntro.category }],
    meetWords: { title: "Cheat Codes to Remember", presentation: "one_word_per_page", introduction: "Look at this word, its meaning clue and its spelling pattern.", homophoneStyle: true, words: lesson.words.map(entry => ({ id: entry.word, word: entry.word, detail: entry.memoryCue, imageSrc: entry.imageSrc ?? supplementalArt[entry.word], imageAlt: supplementalAlt[entry.word], highlightStart: entry.highlightStart ?? undefined, highlightLength: entry.highlightLength ?? undefined })) } };
}
function sameWord(attempt: string, expected: string): boolean {
  return attempt.trim().toLocaleLowerCase("en-GB").replace(/’/g, "'") === expected.toLocaleLowerCase("en-GB");
}
function reflectionRecap(lesson: HomophoneLesson, state: HomophoneProgressV1) {
  const entries = lesson.words.map(word => {
    const choices = state.choiceMistakes.filter(mistake => mistake.word === word.word);
    const spellings: { attempt: string; context: string; source: string }[] = [];
    const coverAttempt = state.coverAttempts[word.word];
    if (coverAttempt !== undefined && !sameWord(coverAttempt, word.word)) spellings.push({ attempt: coverAttempt, context: (lesson.binSort.find(prompt => prompt.answer === word.word) ?? lesson.balloonPrompts.find(prompt => prompt.answer === word.word))?.sentence.replace("____", word.word) ?? word.word, source: "Cover Check example" });
    lesson.dictationPassages.forEach((passage, passageIndex) => {
      if (!state.dictationChecked[String(passageIndex)]) return;
      passage.targets.forEach((target, slot) => {
        if (target !== word.word) return;
        const attempt = state.dictationValues[String(passageIndex)]?.[slot] ?? "";
        if (!sameWord(attempt, target)) spellings.push({ attempt, context: fullHomophonePassage(passage), source: `Dictation passage ${passageIndex + 1}` });
      });
    });
    return { word, choices, spellings };
  }).filter(entry => entry.choices.length || entry.spellings.length);
  if (!entries.length) return <p role="status" className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 font-semibold text-emerald-950">You chose and spelled the lesson words carefully. Which clue helped you most?</p>;
  return <div className="grid gap-4">{entries.map(({ word, choices, spellings }) => <article key={word.word} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-slate-950"><h3 className="text-xl font-black">{word.word}</h3><p className="mt-1 font-semibold"><strong>Clue:</strong> {word.memoryCue}</p>
    {choices.length ? <div className="mt-3"><h4 className="font-black">Choices</h4><ul className="mt-1 grid gap-2">{choices.map((mistake, index) => <li key={index} className="rounded-xl bg-white p-3"><p>“{mistake.sentence}”</p><p>{mistake.selected ? `You chose ${mistake.selected}.` : "The balloons floated away."} The correct word is <strong>{word.word}</strong>.</p></li>)}</ul></div> : null}
    {spellings.length ? <div className="mt-3"><h4 className="font-black">Written spellings</h4><ul className="mt-1 grid gap-2">{spellings.map((mistake, index) => <li key={index} className="rounded-xl bg-white p-3"><p className="text-sm font-bold">{mistake.source}: “{mistake.context}”</p><p>You wrote <strong>{mistake.attempt || "nothing"}</strong>. The spelling is <strong>{word.word}</strong>.</p></li>)}</ul></div> : null}
  </article>)}</div>;
}

export function HomophoneGuidedLesson(props: {
  snapshot: HomophoneLessonSnapshotV1;
  assignmentId: string;
  childId?: string;
  initialProgress?: HomophoneProgressV1;
  onProgress?: (progress: HomophoneProgressV1) => void;
  onCheckpoint?: (progress: HomophoneProgressV1) => Promise<void>;
  onFinish?: (progress: HomophoneProgressV1) => Promise<void>;
  onComplete?: (progress: HomophoneProgressV1) => void;
  developmentPreview?: boolean;
}) {
  const lesson = props.snapshot.lesson;
  const pairScopedChoices = ["D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS", "D4_HOM_CONFUSABLE_WORDS_SE_SY_CE_CY", "D4_HOM_CONTENT_WORD_HOMOPHONES_ED_FOR_T"].includes(lesson.microSkillKey);
  const choicesBySet = useMemo(() => pairScopedChoices ? new Map(lesson.contrastSets?.map(set => [set.setKey, set.members])) : null, [lesson, pairScopedChoices]);
  const issues = props.developmentPreview ? validateConvergencePreview(props.snapshot) : validateHomophoneLessonSnapshot(props.snapshot);
  const [state, setState] = useState<HomophoneProgressV1>(() => props.initialProgress && homophoneProgressValid(props.initialProgress, lesson) ? props.initialProgress : initialHomophoneProgress());
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [best, setBest] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const resumeKey = `adle:homophone:${props.assignmentId}:${props.snapshot.contentVersion}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!props.onFinish) {
        const restored = readMorphologyResume<unknown>(resumeKey, props.snapshot.contentVersion);
        if (homophoneProgressValid(restored, lesson)) { current.current = restored; setState(restored); }
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [resumeKey, props.snapshot.contentVersion, lesson, props.onFinish]);
  useEffect(() => { if (ready && !props.onFinish) writeMorphologyResume(resumeKey, props.snapshot.contentVersion, state); }, [ready, resumeKey, props.snapshot.contentVersion, state, props.onFinish]);
  function change(update: Partial<HomophoneProgressV1>) {
    const next = { ...current.current, ...update };
    current.current = next;
    setState(next);
    props.onProgress?.(next);
  }
  async function checkpoint(update: Partial<HomophoneProgressV1>) {
    const next = { ...current.current, ...update };
    await props.onCheckpoint?.(next);
    change(update);
  }
  async function finish() {
    if (finishing.current) return;
    const next = { ...current.current, stage: "reflection" as const, completed: true };
    if (!homophoneProgressValid(next, lesson) || !homophoneProgressComplete(next, lesson)) { setError("Please finish each word and write one clue before ending the lesson."); return; }
    finishing.current = true; setPending(true); setError(null);
    try { await props.onFinish?.(next); change({ completed: true }); props.onComplete?.(next); }
    catch { finishing.current = false; setError("We couldn't finish the lesson yet. Your answers are kept; please try again."); }
    finally { setPending(false); }
  }
  useEffect(() => { if (!props.childId) return; let active = true; getHomophoneBalloonBest(props.childId, props.assignmentId, lesson.microSkillKey).then(score => { if (active) setBest(score); }).catch(() => undefined); return () => { active = false; }; }, [props.childId, props.assignmentId, lesson.microSkillKey]);
  const teaching = useMemo(() => props.developmentPreview ? convergenceTeachingConfig(lesson) : teachingConfig(props.snapshot), [props.developmentPreview, lesson, props.snapshot]);
  const binItems = useMemo(() => shuffledIndices(lesson.binSort.length).map(index => ({ id: String(index), text: lesson.binSort[index].sentence, destination: lesson.binSort[index].answer, choiceIds: choicesBySet?.get(lesson.binSort[index].setKey ?? "") })), [lesson, choicesBySet]);
  const binChoices = useMemo(() => {
    const reviewedDefinitions = new Map(lesson.teachingGroups?.flatMap(group => group.words.map(entry => [entry.word, entry.definition] as const)));
    return shuffledIndices(lesson.words.length).map(index => {
      const word = lesson.words[index].word;
      return { id: word, label: word, description: reviewedDefinitions.get(word) ?? retainedBinDefinitions[lesson.microSkillKey]?.[word] };
    });
  }, [lesson]);
  const balloonPrompts = useMemo(() => lesson.balloonPrompts.map(prompt => ({ ...prompt, choices: choicesBySet?.get(prompt.setKey ?? "") })), [lesson, choicesBySet]);
  const beat = useMemo<GuideBeatV1>(() => ({ id: `homophone-${state.stage}`, activityId: state.stage, state: state.stage === "cover" || state.stage === "dictation" ? "guideSilent" : "invite", say: "Choose the spelling that matches the meaning.", goal: "Use meaning to choose and spell each word.", waitFor: "the next step", onComplete: "continue" }), [state.stage]);
  if (issues.length) return <p role="alert">This homophone lesson is not ready: {issues.join(", ")}.</p>;
  if (!ready) return <p role="status">Restoring the homophone lesson…</p>;
  if (state.completed) return <section className="mx-auto grid max-w-2xl gap-3 rounded-3xl bg-emerald-100 p-8 text-center text-emerald-950"><h2 className="text-2xl font-black">Homophone lesson complete</h2><p>You practised every word in this set.</p></section>;
  const coverWord = lesson.coverCheck[state.coverIndex];
  const passage = lesson.dictationPassages[state.dictationIndex];
  const passageKey = String(state.dictationIndex);
  return <><FirstImpressionLesson teaching={teaching} activities={[
    { id: "bin-sort", type: "MEANING_SORT", label: "Bin Sort", binding: createCanonicalActivityBinding({ id: "bin-sort", concept: "MEANING_SORT", mode: "meaning", contractVersion: 1, label: "Bin Sort", createProps: ({ complete }) => ({ items: binItems, bins: binChoices, instruction: "Read the sentence and choose the word that fits its gap.", showOverview: true, showBinDescriptions: false, overviewDescriptionLayout: "inline", onIncorrect: ({ item, selectedBinId }: { item: { text: string; destination: string }; selectedBinId: string }) => change({ choiceMistakes: [...current.current.choiceMistakes, { activity: "bin-sort", word: item.destination, selected: selectedBinId, sentence: item.text }] }), onContinue: () => { change({ binSortCompleted: true }); complete(); } }) }) },
    { id: "balloon-pop", type: "BALLOON_POP", label: "Balloon Pop", layout: "immersive", binding: createCanonicalActivityBinding({ id: "balloon-pop", concept: "BALLOON_POP", mode: "timed_sentence_choice", contractVersion: 1, label: "Balloon Pop", createProps: ({ complete }) => ({ words: lesson.words.map(entry => ({ word: entry.word, feedbackReason: entry.feedbackReason })), prompts: balloonPrompts, initialBest: best, onMistake: (mistake: { answer: string; selected: string | null; sentence: string }) => change({ choiceMistakes: [...current.current.choiceMistakes, { activity: "balloon-pop", word: mistake.answer, selected: mistake.selected, sentence: mistake.sentence }] }), onFinish: async (score: number) => { const saved = props.childId ? await recordHomophoneBalloonBest(props.childId, props.assignmentId, lesson.microSkillKey, score) : Math.max(best, score); setBest(saved); return saved; }, onContinue: () => { change({ balloonCompleted: true }); complete(); } }) }) },
  ]} initialStageId={state.stage} initialTeachingPageIndex={state.teachingPage}
    onTeachingPageChange={teachingPage => change({ teachingPage })}
    onStageChange={stage => change({ stage, coverIndex: stage === "cover" ? 0 : current.current.coverIndex, dictationIndex: stage === "dictation" ? 0 : current.current.dictationIndex })}
    onComplete={() => void finish()}
    scene={{ beat, muted: state.muted, onMutedChange: muted => change({ muted }), silent: state.stage === "cover" || state.stage === "dictation" }}
    coverActivity={createCanonicalActivityBinding({ id: "cover", concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1, label: "Cover Check", renderKey: `${state.coverIndex}:${coverWord}`, createProps: ({ complete }) => ({ word: coverWord, splitPoints: [], initialAttempt: state.coverAttempts[coverWord] ?? "", initialState: state.coverAttempts[coverWord] !== undefined ? "check" : "look", muted: state.muted, onComplete: (attempt: string) => checkpoint({ coverAttempts: { ...current.current.coverAttempts, [coverWord]: attempt } }), onContinue: () => state.coverIndex + 1 < lesson.coverCheck.length ? change({ coverIndex: state.coverIndex + 1 }) : complete() }) })}
    dictationActivity={createCanonicalActivityBinding({ id: "dictation", concept: "DICTATION", mode: "two_word_gaps", contractVersion: 1, label: "Dictation", renderKey: passageKey, createProps: ({ complete }) => ({ mode: "two_word_gaps", segments: passage.segments, targets: passage.targets, values: state.dictationValues[passageKey] ?? ["", ""], checked: state.dictationChecked[passageKey] === true, stepLabel: `Passage ${state.dictationIndex + 1} of ${lesson.dictationPassages.length}`, muted: state.muted, onValuesChange: (values: [string, string]) => change({ dictationValues: { ...current.current.dictationValues, [passageKey]: values } }), onCheck: () => checkpoint({ dictationChecked: { ...current.current.dictationChecked, [passageKey]: true } }), onContinue: () => state.dictationIndex + 1 < lesson.dictationPassages.length ? change({ dictationIndex: state.dictationIndex + 1 }) : complete() }) })}
    reflectionActivity={createCanonicalActivityBinding({ id: "reflection", concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1, label: "Reflection", createProps: () => ({ mistakes: [], showMistakeSection: false, specialistRecaps: [{ id: "homophone-review", heading: "Look back at these words", content: reflectionRecap(lesson, state) }], prompt: "Which clue will help you choose these words next time?", responseHelpText: "Write one short thought about a meaning or spelling clue.", response: state.reflectionResponse, onResponseChange: (response: string) => change({ reflectionResponse: response }), onComplete: () => void finish(), pending, completionLabel: "Finish lesson", pendingLabel: "Saving your lesson…" }) })}
  />{error ? <p role="alert" className="mx-auto mt-4 max-w-2xl rounded-2xl bg-rose-100 p-4 text-rose-950">{error}</p> : null}</>;
}
