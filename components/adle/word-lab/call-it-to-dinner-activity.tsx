"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/adle/activities/shared/motion";
import { SplitHandle } from "@/components/adle/activities/shared/split-handle";
import { dinnerAnswerTarget, isDinnerCutPrefix, scoreDinnerCuts, scoreDinnerTarget, type DinnerActivityConfigV1 } from "@/lib/adle/word-lab/call-it-to-dinner";

type WordState = {
  cuts: number[];
  phase: "cut" | "target" | "done";
  start: number | null;
  end: number | null;
  cutMisses: number;
  targetMisses: number;
  clueUsed: boolean;
  answerRevealed: boolean;
  targetSolved: boolean;
};
type DinnerState = { index: number; words: Record<string, WordState> };
const emptyWord = (): WordState => ({ cuts: [], phase: "cut", start: null, end: null, cutMisses: 0, targetMisses: 0, clueUsed: false, answerRevealed: false, targetSolved: false });

function restore(value: unknown, config: DinnerActivityConfigV1): DinnerState {
  if (!value || typeof value !== "object") return { index: 0, words: {} };
  const saved = value as Partial<DinnerState>;
  const index = Number.isInteger(saved.index) && saved.index! >= 0 && saved.index! < config.rounds.length ? saved.index! : 0;
  const words: Record<string, WordState> = {};
  for (const round of config.rounds) {
    const candidate = saved.words?.[round.canonicalWordId];
    if (!candidate || !Array.isArray(candidate.cuts) || !["cut", "target", "done"].includes(candidate.phase)) continue;
    const cuts = candidate.cuts.filter((cut) => Number.isInteger(cut) && cut > 0 && cut < round.spelling.length);
    if (cuts.length !== candidate.cuts.length || new Set(cuts).size !== cuts.length) continue;
    const validSelection = candidate.start === null && candidate.end === null ||
      Number.isInteger(candidate.start) && Number.isInteger(candidate.end) && candidate.start! >= 0 && candidate.end! <= round.spelling.length && candidate.start! < candidate.end!;
    if (!validSelection || ((candidate.phase === "target" || candidate.phase === "done") && scoreDinnerCuts(round, cuts) !== "correct") ||
      (candidate.phase === "done" && !scoreDinnerTarget(round, candidate.start, candidate.end) && !candidate.answerRevealed)) continue;
    words[round.canonicalWordId] = {
      cuts: cuts.sort((a, b) => a - b), phase: candidate.phase, start: candidate.start, end: candidate.end,
      cutMisses: Number.isInteger(candidate.cutMisses) && candidate.cutMisses >= 0 ? candidate.cutMisses : 0,
      targetMisses: Number.isInteger(candidate.targetMisses) && candidate.targetMisses >= 0 ? candidate.targetMisses : 0,
      clueUsed: candidate.clueUsed === true, answerRevealed: candidate.answerRevealed === true,
      targetSolved: candidate.targetSolved === true,
    };
  }
  return { index, words };
}

export function CallItToDinnerActivity(props: {
  config: DinnerActivityConfigV1;
  initialState?: unknown;
  muted?: boolean;
  reducedMotion?: boolean;
  previewCandidate?: boolean;
  showInlineGuide?: boolean;
  lessonLayout?: boolean;
  onStateChange?: (state: DinnerState) => void;
  onComplete?: (response: Record<string, unknown>) => void;
}) {
  const [state, setState] = useState(() => restore(props.initialState, props.config));
  const [feedback, setFeedback] = useState("");
  const [audioError, setAudioError] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const audio = useRef<HTMLAudioElement | null>(null);
  const replayButton = useRef<HTMLButtonElement | null>(null);
  const nextButton = useRef<HTMLButtonElement | null>(null);
  const completed = useRef(false);
  const round = props.config.rounds[state.index];
  const current = state.words[round.canonicalWordId] ?? emptyWord();
  const finalVowelOnly = round.selectionTarget !== undefined;

  useEffect(() => {
    if (current.phase === "done") nextButton.current?.focus({ preventScroll: true });
    else if (current.phase === "cut") replayButton.current?.focus({ preventScroll: true });
  }, [state.index, current.phase]);

  useEffect(() => {
    if (current.phase !== "done" || !current.targetSolved) return;
    const timer = window.setTimeout(() => nextButton.current?.click(), 4500);
    return () => window.clearTimeout(timer);
  }, [state.index, current.phase, current.targetSolved]);

  function change(nextWord: WordState, nextIndex = state.index) {
    const next = { index: nextIndex, words: { ...state.words, [round.canonicalWordId]: nextWord } };
    setState(next);
    props.onStateChange?.(next);
  }

  async function replay() {
    if (props.muted || !audio.current) return;
    setAudioError(false);
    try {
      audio.current.currentTime = 0;
      await audio.current.play();
    } catch {
      setAudioError(true);
    }
  }

  function selectLetter(index: number) {
    if (current.phase !== "target") return;
    let start = current.start, end = current.end;
    if (start === null || end === null) { start = index; end = index + 1; }
    else if (index === start - 1) start = index;
    else if (index === end) end = index + 1;
    else if (index >= start && index < end) {
      if (start === end - 1) { start = null; end = null; }
      else if (index === start) start += 1;
      else if (index === end - 1) end -= 1;
      else { start = null; end = null; }
    } else { start = index; end = index + 1; }
    setFeedback("");
    change({ ...current, start, end });
  }

  function checkTarget() {
    if (current.start === null || current.end === null) { setFeedback("Choose one letter or a joined group of letters first."); return; }
    if (scoreDinnerTarget(round, current.start, current.end)) {
      setFeedback("Well done! You found the lazy sound.");
      change({ ...current, phase: "done", targetSolved: true });
    } else {
      setFeedback(finalVowelOnly ? "× Not quite. Listen again and select only the vowel letter in the unstressed syllable." :
        "× Not quite. Listen again and highlight every letter that spells the unstressed sound.");
      change({ ...current, targetMisses: current.targetMisses + 1 });
    }
  }

  function reveal() {
    setFeedback("Here is the reviewed answer. This is a guided repair.");
    const answer = dinnerAnswerTarget(round);
    change({ ...current, cuts: [...round.acceptedCutSets[0]], phase: "done", start: answer.start, end: answer.end, answerRevealed: true, targetSolved: false });
  }

  function next() {
    if (current.phase !== "done") return;
    audio.current?.pause();
    setFeedback(""); setAudioError(false);
    if (state.index + 1 < props.config.rounds.length) { change(current, state.index + 1); return; }
    if (completed.current) return;
    completed.current = true;
    const words = { ...state.words, [round.canonicalWordId]: current };
    props.onComplete?.({ guided: true, words: props.config.rounds.map((item) => ({
      canonicalWordId: item.canonicalWordId,
      cutMisses: words[item.canonicalWordId]?.cutMisses ?? 0,
      targetMisses: words[item.canonicalWordId]?.targetMisses ?? 0,
      clueUsed: words[item.canonicalWordId]?.clueUsed ?? false,
      answerRevealed: words[item.canonicalWordId]?.answerRevealed ?? false,
    })) });
  }

  function showCuts() {
    setFeedback("Here are the reviewed cuts. This is a guided repair.");
    change({ ...current, cuts: [...round.acceptedCutSets[0]], phase: "target", answerRevealed: true });
  }

  function showClue() {
    setFeedback(`The quiet sound is in syllable ${round.target.syllableIndex}.`);
    change({ ...current, clueUsed: true });
  }

  const splitHandle = <SplitHandle
    mode="syllables" word={round.spelling} selectedBoundaries={current.cuts} muted={props.muted}
    showInstructions={!props.lessonLayout}
    showJoinAll={false} showPieceCount={false}
    boundariesLocked={current.phase !== "cut"}
    lettersSelectable={current.phase !== "cut"} selectedLetterStart={current.start} selectedLetterEnd={current.end} onLetterSelect={selectLetter}
    onBoundaryAttempt={(cuts) => { if (current.phase !== "cut") return false; if (isDinnerCutPrefix(round, cuts)) return true; change({ ...current, cutMisses: current.cutMisses + 1 }); return false; }}
    onSelectedBoundariesChange={(cuts) => { if (current.phase !== "cut") return; const complete = scoreDinnerCuts(round, cuts) === "correct"; setFeedback(complete ? "✓ Cuts complete." : ""); change({ ...current, cuts, phase: complete ? "target" : "cut", start: complete ? current.start : null, end: complete ? current.end : null }); }}
    feedback={current.phase === "done" ? "✓ Syllables complete." : feedback}
    disabled={audioError || current.phase === "done"}
  />;

  if (props.lessonLayout) return <section className="dinner-option-two" aria-labelledby="dinner-title" data-dinner-phase={current.phase} data-reduced-motion={props.reducedMotion || prefersReducedMotion ? "true" : "false"}>
    <audio key={round.recording.src} ref={audio} src={round.recording.src} preload="none" onError={() => setAudioError(true)} />
    <h2 id="dinner-title" className="dinner-option-two-title">Call It To Dinner</h2>
    <div className="dinner-option-two-cards">
      <section className="dinner-option-two-card" aria-labelledby="dinner-game-title">
        <h3 id="dinner-game-title">The Game</h3>
        <p><strong>The goal is to identify the stressed and unstressed syllables of the word.</strong> It is a fun game called “Call It To Dinner”. Call each word as if you were shouting its name to come downstairs for dinner. This shows which syllable gets the most stress: <strong>SCAR-lett!</strong></p>
        <p>We cannot find an unstressed vowel in a stressed syllable. Once we know the unstressed syllables, we can listen for the weak “uh” or “ih” sound.</p>
        <p><strong>Remember:</strong> There can be more than two syllables in a word.</p>
      </section>
      <section className="dinner-option-two-card dinner-option-two-how" aria-labelledby="dinner-how-title">
        <h3 id="dinner-how-title">How to do the task</h3>
        {current.phase === "cut" ? <><strong>First, CALL IT TO DINNER!</strong><p>Look at the word below. Listen to its recording, then chop it into the syllables you hear. The listen button is underneath.</p></>
          : current.phase === "target" ? <><strong>Great! Well done.</strong><p>Now select the <strong>LAZY</strong> vowel sound. {finalVowelOnly ? "Select only its vowel letter." : "Highlight every letter that spells it."}</p></>
            : current.targetSolved ? <><strong>Well done!</strong><p>You found the lazy sound.</p></>
              : <><strong>Here is the reviewed spelling.</strong><p>Look closely before moving to the next word.</p></>}
        <p className="dinner-option-two-count">Word {state.index + 1} of {props.config.rounds.length}</p>
      </section>
    </div>
    {audioError ? <p role="alert" className="dinner-option-two-error">The word recording could not play. Please try replay. This round cannot be checked without its recording.</p> : null}
    <div className="dinner-option-two-board">
      {splitHandle}
      <button ref={replayButton} type="button" className="dinner-option-two-listen" disabled={props.muted} onClick={replay}>▶ Listen to the word</button>
      <div className="dinner-option-two-actions">
        <div className="dinner-option-two-assists">
          {current.phase === "cut" && current.cutMisses >= 2 ? <button type="button" onClick={showCuts}>Show where to cut</button> : null}
          {current.phase === "target" && current.targetMisses + current.cutMisses >= 1 ? <button type="button" onClick={showClue}>Show a clue</button> : null}
          {current.phase === "target" && current.targetMisses + current.cutMisses >= 2 ? <button type="button" onClick={reveal}>Show the answer</button> : null}
        </div>
        {current.phase === "done" && !current.targetSolved ? <button ref={nextButton} type="button" className="dinner-option-two-confirm" onClick={next}>{state.index + 1 === props.config.rounds.length ? "Finish Dinner" : "Next word"}</button>
          : <button type="button" className="dinner-option-two-confirm" disabled={current.phase !== "target" || audioError || current.start === null} onClick={checkTarget}>Confirm answer</button>}
      </div>
      {current.phase === "done" && current.targetSolved ? <div className="dinner-success-popup" role="dialog" aria-modal="false" aria-labelledby="dinner-success-title" aria-describedby="dinner-success-detail" data-reduced-motion={props.reducedMotion || prefersReducedMotion ? "true" : "false"}>
        <span className="dinner-success-sparkle sparkle-one" aria-hidden="true">✦</span><span className="dinner-success-sparkle sparkle-two" aria-hidden="true">✧</span><span className="dinner-success-sparkle sparkle-three" aria-hidden="true">✦</span>
        <h3 id="dinner-success-title">Well done!</h3><p id="dinner-success-detail">You found the lazy sound.</p>
        <button ref={nextButton} type="button" onClick={next}>{state.index + 1 === props.config.rounds.length ? "Finish Dinner" : "Next word"}</button>
      </div> : null}
    </div>
  </section>;

  return <section className="grid gap-3 text-[color:var(--ink)]" aria-labelledby="dinner-title" data-dinner-phase={current.phase}>
    <audio key={round.recording.src} ref={audio} src={round.recording.src} preload="none" onError={() => setAudioError(true)} />
    {props.showInlineGuide === false ? <header className="grid gap-1"><h2 id="dinner-title" className="text-2xl font-black">Call It To Dinner</h2><p className="text-sm">Call each word as if you were shouting its name downstairs for dinner: <strong>SCAR-lett!</strong> The louder syllable is stressed. The quieter syllables can hide an <strong>“uh”</strong> or <strong>“ih”</strong> sound. Find the weak vowel in an unstressed syllable. Words can have more than two syllables.</p></header> : <header className="adie-inline">
      <Image src="/adie/adie-head.png" width={86} height={86} alt="ADIE, your robot guide" />
      <div className="adie-inline-bubble"><strong>Adie says</strong><h2 id="dinner-title" className="text-xl font-black">Call It To Dinner</h2><p>Shout the word as if calling it downstairs for dinner: <strong>SCAR-lett!</strong> Hear the strong syllable? The other syllables can hide a quiet “uh” or “ih”. Words can have more than two syllables.</p></div>
    </header>}
    {props.previewCandidate && <p role="status" className="rounded-xl border border-amber-300 bg-amber-100 p-3 font-bold text-amber-950">Review preview: these cut and target annotations are candidates, not approved Dinner lesson content.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400 bg-amber-100 px-4 py-3 text-amber-950" role="status" aria-live="polite">
      <p className="font-bold">{current.phase === "cut" ? <>First, <strong>CALL IT TO DINNER!</strong> Chop the word into the syllables you hear. Which syllable sounds strongest?</> : current.phase === "target" ? <>Great! Well done. Now select the <strong>LAZY</strong> vowel sound {finalVowelOnly ? "by highlighting only its vowel letter." : "by highlighting every letter that spells it."}</> : current.answerRevealed ? <>Here is the reviewed spelling. Look carefully before moving on.</> : <><strong>Well done! You found the lazy sound.</strong> The next word will appear shortly.</>}</p>
      <span className="shrink-0 text-sm font-black">Word {state.index + 1} of {props.config.rounds.length}</span>
    </div>
    {audioError && <p role="alert" className="rounded-xl bg-rose-100 p-3 font-bold text-rose-950">The word recording could not play. Please try replay. This round cannot be checked without its recording.</p>}
    <div className="grid gap-3">{splitHandle}<button ref={replayButton} type="button" className="brand-secondary-btn mx-auto min-h-12" disabled={props.muted} onClick={replay}>▶ Listen to the word</button>
    {current.phase === "cut" && current.cutMisses >= 2 && <button type="button" className="brand-secondary-btn mx-auto min-h-12" onClick={showCuts}>Show where to cut</button>}
    {current.phase !== "cut" && <div className="grid gap-3 border-t border-cyan-200 pt-3">
      {current.phase === "target" && <div className="flex flex-wrap justify-center gap-3"><button type="button" className="brand-primary-btn min-h-12" onClick={checkTarget} disabled={audioError || current.start === null}>Submit</button>
        {current.targetMisses + current.cutMisses >= 1 && <button type="button" className="brand-secondary-btn min-h-12" onClick={showClue}>Show a clue</button>}
        {current.targetMisses + current.cutMisses >= 2 && <button type="button" className="brand-secondary-btn min-h-12" onClick={reveal}>Show the answer</button>}</div>}
      <p role="status" aria-live="polite" className="min-h-6 text-center font-semibold text-[color:var(--mid)]">{feedback}</p>
      {current.phase === "done" && <button ref={nextButton} type="button" className="brand-primary-btn mx-auto min-h-12" onClick={next}>{state.index + 1 === props.config.rounds.length ? "Finish Dinner" : "Next word"}</button>}
    </div>}</div>
  </section>;
}
