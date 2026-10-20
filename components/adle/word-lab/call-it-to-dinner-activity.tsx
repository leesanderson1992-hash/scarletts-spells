"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SplitHandle } from "@/components/adle/activities/shared/split-handle";
import { isDinnerCutPrefix, scoreDinnerCuts, scoreDinnerTarget, type DinnerActivityConfigV1 } from "@/lib/adle/word-lab/call-it-to-dinner";

type WordState = {
  cuts: number[];
  phase: "cut" | "target" | "done";
  start: number | null;
  end: number | null;
  cutMisses: number;
  targetMisses: number;
  clueUsed: boolean;
  answerRevealed: boolean;
};
type DinnerState = { index: number; words: Record<string, WordState> };
const emptyWord = (): WordState => ({ cuts: [], phase: "cut", start: null, end: null, cutMisses: 0, targetMisses: 0, clueUsed: false, answerRevealed: false });

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
  onStateChange?: (state: DinnerState) => void;
  onComplete?: (response: Record<string, unknown>) => void;
}) {
  const [state, setState] = useState(() => restore(props.initialState, props.config));
  const [feedback, setFeedback] = useState("");
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const replayButton = useRef<HTMLButtonElement | null>(null);
  const firstLetter = useRef<HTMLButtonElement | null>(null);
  const nextButton = useRef<HTMLButtonElement | null>(null);
  const completed = useRef(false);
  const round = props.config.rounds[state.index];
  const current = state.words[round.canonicalWordId] ?? emptyWord();

  useEffect(() => {
    if (current.phase === "target") firstLetter.current?.focus();
    else if (current.phase === "done") nextButton.current?.focus();
    else replayButton.current?.focus();
  }, [state.index, current.phase]);

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
      setFeedback("You found the whole spelling of the quiet vowel sound.");
      change({ ...current, phase: "done" });
    } else {
      setFeedback("× Not quite. Listen again and highlight every letter that spells the unstressed sound.");
      change({ ...current, targetMisses: current.targetMisses + 1 });
    }
  }

  function reveal() {
    setFeedback("Here is the reviewed answer. This is a guided repair.");
    change({ ...current, cuts: [...round.acceptedCutSets[0]], phase: "done", start: round.target.start, end: round.target.end, answerRevealed: true });
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

  return <section className="grid gap-6 text-[color:var(--ink)]" aria-labelledby="dinner-title">
    <audio key={round.recording.src} ref={audio} src={round.recording.src} preload="none" onError={() => setAudioError(true)} />
    <header className="adie-inline">
      <Image src="/adie/adie-head.png" width={86} height={86} alt="ADIE, your robot guide" />
      <div className="adie-inline-bubble"><strong>Adie says</strong><h2 id="dinner-title" className="text-xl font-black">Call It to Dinner</h2><p>Listen to the word. Chop it into the syllables you hear. Then find the quiet vowel spelling.</p></div>
    </header>
    {props.previewCandidate && <p role="status" className="rounded-xl border border-amber-300 bg-amber-100 p-3 font-bold text-amber-950">Review preview: these cut and target annotations are candidates, not approved Dinner lesson content.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
      <p className="font-bold">Word {state.index + 1} of {props.config.rounds.length}</p>
      <button ref={replayButton} type="button" className="brand-secondary-btn min-h-12" disabled={props.muted} onClick={replay}>▶ Hear the word again</button>
    </div>
    {audioError && <p role="alert" className="rounded-xl bg-rose-100 p-3 font-bold text-rose-950">The word recording could not play. Please try replay. This round cannot be checked without its recording.</p>}
    <div className="grid gap-5"><SplitHandle
      mode="syllables" word={round.spelling} selectedBoundaries={current.cuts} muted={props.muted}
      onBoundaryAttempt={(cuts) => { if (isDinnerCutPrefix(round, cuts)) return true; change({ ...current, cutMisses: current.cutMisses + 1 }); return false; }}
      onSelectedBoundariesChange={(cuts) => { const complete = scoreDinnerCuts(round, cuts) === "correct"; setFeedback(complete ? "✓ Cuts complete." : ""); change({ ...current, cuts, phase: complete ? "target" : "cut", start: complete ? current.start : null, end: complete ? current.end : null }); }}
      feedback={current.phase === "done" ? "✓ Syllables complete." : feedback}
      disabled={audioError || current.phase === "done"}
    />{current.phase === "cut" && current.cutMisses >= 2 && <button type="button" className="brand-secondary-btn mx-auto min-h-12" onClick={() => {
      setFeedback("Here are the reviewed cuts. This is a guided repair.");
      change({ ...current, cuts: [...round.acceptedCutSets[0]], phase: "target", answerRevealed: true });
    }}>Show where to cut</button>}
    {current.phase !== "cut" && <div className="grid gap-4 border-t border-cyan-200 pt-5">
      <p className="text-center text-lg font-black">{current.phase === "done" ? "The complete quiet spelling is highlighted." : "Now select the unstressed sound"}</p>
      <p className="text-center text-[color:var(--mid)]">Tap one letter, then its neighbours to highlight the whole spelling. Tap a selected letter to remove it.</p>
      <div role="group" aria-label={`Select quiet-vowel spelling in ${round.spelling}`} className="flex flex-wrap justify-center gap-1.5">
        {Array.from(round.spelling).map((letter, index) => <button key={`${index}-${letter}`} ref={index === 0 ? firstLetter : undefined} type="button" disabled={current.phase === "done" || audioError}
          aria-pressed={current.start !== null && current.end !== null && index >= current.start && index < current.end}
          aria-label={`Letter ${letter}, position ${index + 1}`}
          onClick={() => selectLetter(index)}
          className={`min-h-16 min-w-12 rounded-xl border-2 p-2 text-3xl font-black focus-visible:ring-4 focus-visible:ring-amber-300 disabled:cursor-default ${current.start !== null && current.end !== null && index >= current.start && index < current.end ? "border-amber-400 bg-amber-200 text-amber-950" : "border-cyan-200 bg-white text-[color:var(--ink)]"}`}>{letter}</button>)}
      </div>
      {current.phase === "target" && <div className="flex flex-wrap justify-center gap-3"><button type="button" className="brand-primary-btn min-h-12" onClick={checkTarget} disabled={audioError || current.start === null}>Submit</button>
        {current.targetMisses + current.cutMisses >= 1 && <button type="button" className="brand-secondary-btn min-h-12" onClick={() => { setFeedback(`The quiet sound is in syllable ${round.target.syllableIndex}.`); change({ ...current, clueUsed: true }); }}>Show a clue</button>}
        {current.targetMisses + current.cutMisses >= 2 && <button type="button" className="brand-secondary-btn min-h-12" onClick={reveal}>Show the answer</button>}</div>}
      <p role="status" aria-live="polite" className="min-h-6 text-center font-semibold text-[color:var(--mid)]">{feedback}</p>
      {current.phase === "done" && <button ref={nextButton} type="button" className="brand-primary-btn mx-auto min-h-12" onClick={next}>{state.index + 1 === props.config.rounds.length ? "Finish Dinner" : "Next word"}</button>}
    </div>}</div>
  </section>;
}
