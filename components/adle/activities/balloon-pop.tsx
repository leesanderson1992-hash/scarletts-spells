"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/components/adle/activities/shared/motion";
import { shuffledIndices } from "@/lib/adle/homophone/random-order";

export interface BalloonWord {
  word: string;
  feedbackReason: string;
}

export interface BalloonPrompt {
  sentence: string;
  answer: string;
  choices?: readonly string[];
}

export interface BalloonPopProps {
  words: readonly BalloonWord[];
  prompts: readonly BalloonPrompt[];
  initialBest: number;
  onMistake?: (mistake: { answer: string; selected: string | null; sentence: string }) => void;
  onFinish: (score: number) => number | Promise<number>;
  onContinue: () => void;
}

type Feedback = { answer: string; selected: string | null; until: number };
type State = {
  phase: "ready" | "active" | "feedback" | "done";
  roundEnd: number;
  promptStart: number;
  promptNumber: number;
  promptOrder: number[];
  score: number;
  feedback: Feedback | null;
};

const ROUND_MS = 45_000;
const FLIGHT_MS = 10_000;
const FEEDBACK_MS = 5_000;
const START: State = { phase: "ready", roundEnd: 0, promptStart: 0, promptNumber: 0, promptOrder: [], score: 0, feedback: null };

export function BalloonPop(props: BalloonPopProps) {
  const [state, setState] = useState<State>(START);
  const [now, setNow] = useState(0);
  const [best, setBest] = useState(props.initialBest);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitted = useRef(false);
  const reportedFeedback = useRef(-1);
  const reducedMotion = useReducedMotion();
  const prompt = props.prompts[state.promptOrder[state.promptNumber % state.promptOrder.length] ?? (state.promptNumber % props.prompts.length)];
  const activeWords = prompt?.choices ? props.words.filter(entry => prompt.choices?.includes(entry.word)) : props.words;

  useEffect(() => {
    if (state.phase !== "feedback" || !state.feedback || reportedFeedback.current === state.promptNumber) return;
    reportedFeedback.current = state.promptNumber;
    const missed = props.prompts[state.promptOrder[state.promptNumber % state.promptOrder.length] ?? (state.promptNumber % props.prompts.length)];
    props.onMistake?.({ answer: state.feedback.answer, selected: state.feedback.selected, sentence: missed.sentence });
  }, [state.phase, state.feedback, state.promptNumber, props]);

  useEffect(() => {
    setBest(previous => Math.max(previous, props.initialBest));
  }, [props.initialBest]);

  useEffect(() => {
    if (state.phase !== "active" && state.phase !== "feedback") return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      setState(previous => {
        if (previous.phase === "active") {
          if (current >= previous.roundEnd) return { ...previous, phase: "done" };
          if (current - previous.promptStart >= FLIGHT_MS) {
            const missed = props.prompts[previous.promptOrder[previous.promptNumber % previous.promptOrder.length] ?? (previous.promptNumber % props.prompts.length)];
            return { ...previous, phase: "feedback", feedback: { answer: missed.answer, selected: null, until: current + FEEDBACK_MS } };
          }
        }
        if (previous.phase === "feedback" && previous.feedback && current >= previous.feedback.until) {
          return current >= previous.roundEnd
            ? { ...previous, phase: "done", feedback: null }
            : { ...previous, phase: "active", promptStart: current, promptNumber: previous.promptNumber + 1, feedback: null };
        }
        return previous;
      });
    };
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [state.phase, props.prompts]);

  const saveScore = useCallback(() => {
    setSaving(true);
    setSaveError(false);
    Promise.resolve(props.onFinish(state.score))
      .then(saved => setBest(current => Math.max(current, saved)))
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false));
  }, [props.onFinish, state.score]);

  useEffect(() => {
    if (state.phase !== "done" || submitted.current) return;
    submitted.current = true;
    saveScore();
  }, [state.phase, saveScore]);

  const choose = useCallback((selected: string) => {
    const current = Date.now();
    setNow(current);
    setState(previous => {
      if (previous.phase !== "active") return previous;
      if (current >= previous.roundEnd) return { ...previous, phase: "done" };
      const activePrompt = props.prompts[previous.promptOrder[previous.promptNumber % previous.promptOrder.length] ?? (previous.promptNumber % props.prompts.length)];
      if (current - previous.promptStart >= FLIGHT_MS) {
        return { ...previous, phase: "feedback", feedback: { answer: activePrompt.answer, selected: null, until: current + FEEDBACK_MS } };
      }
      if (selected === activePrompt.answer) {
        return { ...previous, score: previous.score + 1, promptNumber: previous.promptNumber + 1, promptStart: current };
      }
      return { ...previous, phase: "feedback", feedback: { answer: activePrompt.answer, selected, until: current + FEEDBACK_MS } };
    });
  }, [props.prompts]);

  const seconds = state.phase === "ready" ? 45 : Math.max(0, Math.ceil((state.roundEnd - now) / 1000));
  const feedback = state.feedback;
  const correct = props.words.find(item => item.word === feedback?.answer);
  const renderWords = state.phase === "active" || state.phase === "feedback";

  return <section className="balloon-pop-game grid gap-4 text-cyan-50" data-balloon-phase={state.phase} aria-label="Balloon Pop">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-black">Balloon Pop</h2>
      <div className="flex gap-3 text-sm font-bold"><span role="timer">Time: {seconds}s</span><span>Score: {state.score}</span><span>Best: {best}</span></div>
    </header>
    {state.phase === "ready" ? <div className="balloon-pop-starter grid gap-5 rounded-3xl p-6 text-center sm:p-10"><Image src="/adie/adie-head.png" width={92} height={92} alt="Adie" className="mx-auto h-20 w-20 object-contain" /><p>Pop the word that completes each sentence. Each set of balloons takes ten seconds to float away.</p><button type="button" className="balloon-pop-start-button mx-auto min-h-12 rounded-full px-8 font-black" onClick={() => { const current = Date.now(); submitted.current = false; setSaveError(false); setNow(current); setState({ ...START, phase: "active", roundEnd: current + ROUND_MS, promptStart: current, promptOrder: shuffledIndices(props.prompts.length) }); }}>Start 45-second round</button></div> : null}
    {renderWords ? <>
      <p className="min-h-16 rounded-2xl bg-white px-5 py-4 text-center text-2xl font-black text-slate-950" aria-live="polite">{prompt?.sentence}</p>
      <div className="balloon-pop-sky relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-sky-200 via-cyan-100 to-emerald-100" aria-label="Choose a balloon" style={{ "--balloon-count": activeWords.length } as CSSProperties}>
        {activeWords.map((entry, index) => {
          const status = feedback?.answer === entry.word ? "correct" : feedback?.selected === entry.word ? "incorrect" : "neutral";
          return <button key={`${state.promptNumber}-${entry.word}`} type="button" disabled={state.phase !== "active"} onClick={() => choose(entry.word)} aria-label={`Pop ${entry.word}`} data-balloon-status={status} className={`balloon-pop-choice absolute bottom-0 grid place-items-center rounded-full border-4 px-2 text-lg font-black shadow-lg focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-slate-900 ${status === "correct" ? "border-green-900 bg-green-400 text-green-950" : status === "incorrect" ? "border-red-900 bg-red-400 text-red-950" : "border-white bg-pink-400 text-slate-950"} ${reducedMotion ? "" : "balloon-pop-rise"}`}
            style={{ left: `${((index + 0.5) / activeWords.length) * 100}%`, transform: "translateX(-50%)", animationPlayState: state.phase === "feedback" ? "paused" : "running" }}>
            <span>{entry.word}</span><span aria-hidden="true" className="absolute -bottom-8 h-8 w-px bg-slate-700" />
          </button>;
        })}
      </div>
      {feedback ? <div role="status" aria-live="assertive" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950"><Image src="/adie/adie-head.png" width={64} height={64} alt="Adie" className="h-16 w-16 shrink-0 object-contain" /><div className="relative rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm"><span aria-hidden="true" className="absolute left-[-5px] top-6 h-3 w-3 rotate-45 bg-white" />{feedback.selected ? `${feedback.selected} is not the word for this sentence. ` : "That balloon floated away. "}Remember, we use <strong>{feedback.answer}</strong> because {correct?.feedbackReason}.</div></div> : null}
    </> : null}
    {state.phase === "done" ? <div className="grid gap-4 rounded-3xl bg-white/10 p-6 text-center"><p className="text-2xl font-black">You popped {state.score} correct {state.score === 1 ? "balloon" : "balloons"}!</p><p>Personal best for these words: {best}</p>{saving ? <p role="status">Saving your best score…</p> : null}{saveError ? <p role="alert">Your best score could not be saved. <button type="button" className="underline" onClick={saveScore}>Try saving again</button>.</p> : null}<div className="flex justify-center gap-3"><button type="button" disabled={saving} className="min-h-12 rounded-full bg-cyan-300 px-6 font-black text-slate-950 disabled:opacity-40" onClick={props.onContinue}>Continue lesson</button></div></div> : null}
  </section>;
}
