"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { DiffReveal } from "./diff-reveal";
import { HearWordButton } from "./authored-audio";
import { gradePairedDegreeAttempt, type PairedDegreeSentence } from "@/lib/adle/inflection/contracts";

export interface SentenceDictationProps {
  audioText: string;
  correctSentence: string;
  value: string;
  checked: boolean;
  stepLabel: string;
  continueLabel?: string;
  muted?: boolean;
  onValueChange: (value: string) => void;
  onCheck: () => void | Promise<void>;
  onContinue?: () => void;
}

export interface PairedWordGapsProps {
  mode: "paired_word_gaps";
  sentence: PairedDegreeSentence;
  audioOrder: readonly [0 | 1, 0 | 1];
  values: readonly [string, string];
  checked: boolean;
  stepLabel: string;
  muted?: boolean;
  onValuesChange: (values: [string, string]) => void;
  onCheck: () => void | Promise<void>;
  onContinue: () => void;
}
export function SentenceDictation(props: SentenceDictationProps | PairedWordGapsProps) {
  return "mode" in props ? <PairedWordGaps {...props} /> : <WholeSentenceDictation {...props} />;
}
function WholeSentenceDictation(props: SentenceDictationProps) {
  const inputId = useId();
  const comparisonId = useId();
  const checkRequested = useRef(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.checked) checkRequested.current = false;
  }, [props.checked]);

  async function checkSentence() {
    if (props.checked || !props.value.trim() || checkRequested.current) return;
    checkRequested.current = true;
    setSaving(true);
    setCheckpointError(null);
    try {
      await props.onCheck();
    } catch {
      checkRequested.current = false;
      setCheckpointError("We couldn't freeze that sentence yet. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="grid gap-4"
      data-sentence-dictation-state={props.checked ? "checked" : "writing"}
    >
      <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">
        {props.stepLabel}
      </p>
      <div className="flex justify-center">
        <HearWordButton
          word={props.audioText}
          label="Play sentence"
          muted={props.muted}
          kind="dictation"
        />
      </div>
      <label htmlFor={inputId} className="text-sm font-semibold text-cyan-50">
        Write the whole sentence
      </label>
      <textarea
        id={inputId}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="sentences"
        readOnly={props.checked || saving}
        aria-describedby={props.checked ? comparisonId : undefined}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void checkSentence();
          }
        }}
        className="min-h-28 w-full rounded-2xl bg-white p-4 text-lg text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 read-only:bg-slate-100"
      />
      {!props.checked ? (
        <button
          type="button"
          disabled={!props.value.trim() || saving}
          onClick={() => void checkSentence()}
          className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40"
        >
          Check sentence
        </button>
      ) : (
        <>
          <div id={comparisonId} aria-live="polite">
            <DiffReveal
              attempt={props.value}
              expected={props.correctSentence}
              mode="sentence"
            />
          </div>
          {props.onContinue ? (
            <button
              type="button"
              onClick={props.onContinue}
              className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950"
            >
              {props.continueLabel ?? "Continue"}
            </button>
          ) : null}
        </>
      )}
      {checkpointError ? <p role="alert" className="text-sm font-semibold text-rose-200">{checkpointError}</p> : null}
      {saving ? <p role="status" className="text-sm text-cyan-100">Freezing your sentence…</p> : null}
    </section>
  );
}

/** DICTATION.paired_word_gaps@1. Both answers freeze before any reveal. */
const subscribeAudioCapability = () => () => undefined;
const browserAudioAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const serverAudioAvailable = () => false;
function PairedWordGaps(props: PairedWordGapsProps) {
  const audioAvailable = useSyncExternalStore(subscribeAudioCapability, browserAudioAvailable, serverAudioAvailable);
  const id = useId();
  const requested = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!props.checked) requested.current = false; }, [props.checked]);
  async function check() {
    if (props.checked || saving || requested.current || props.muted || !audioAvailable || props.values.some(v => !v.trim())) return;
    requested.current = true; setSaving(true); setError(null);
    try { await props.onCheck(); }
    catch { requested.current = false; setError("We couldn't freeze both answers. Please try again."); }
    finally { setSaving(false); }
  }
  const outcomes = props.checked ? gradePairedDegreeAttempt(props.sentence, props.values) : [];
  return <section className="grid gap-5" data-paired-dictation-state={props.checked ? "checked" : "writing"}>
    <p className="text-center text-xs font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p>
    <h2 className="text-center text-2xl font-black text-white">Listen to two words. Decide where each belongs.</h2>
    <div className="flex flex-wrap justify-center gap-3 text-slate-950">{props.audioOrder.map((target, index) => <HearWordButton key={target} word={props.sentence.targets[target].audioText} label={`Hear word ${index + 1}`} kind="dictation" muted={props.muted} />)}</div>
    {props.muted ? <p role="status" className="text-center text-amber-100">Sound is off. Turn on sound to hear the words.</p> : null}
    {!audioAvailable ? <p role="alert" className="text-center text-amber-100">Word audio is unavailable in this browser. Dictation cannot be checked without audio.</p> : null}
    <div className="rounded-3xl bg-white p-5 text-xl font-bold leading-loose text-slate-950" aria-label="Sentence with two word gaps">
      {props.sentence.segments.map((segment, index) => <span key={index}>{segment}{index < 2 ? <>
        <label className="sr-only" htmlFor={`${id}-${index}`}>Gap {index + 1}</label>
        <input id={`${id}-${index}`} aria-label={`Gap ${index + 1}`} autoFocus={index === 0} spellCheck={false} autoComplete="off" autoCapitalize="none"
          readOnly={props.checked || saving} value={props.values[index]} maxLength={80}
          onChange={event => { const next: [string, string] = [...props.values]; next[index] = event.target.value; props.onValuesChange(next); }}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void check(); } }}
          className="mx-1 inline-block min-h-12 w-36 max-w-full rounded-xl border-2 border-cyan-600 bg-slate-50 px-2 text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300" />
      </> : null}</span>)}
    </div>
    {!props.checked ? <button type="button" disabled={saving || props.muted || !audioAvailable || props.values.some(v => !v.trim())} onClick={() => void check()} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40">{saving ? "Freezing both answers…" : "Check both words"}</button> : <>
      <div aria-live="polite" className="grid gap-3">{outcomes.map(outcome => {
        const target = props.sentence.targets[outcome.expectedSlot];
        return <div key={outcome.expectedSlot} className="rounded-2xl bg-slate-950/30 p-4 text-cyan-100">
          <p className="font-bold">{outcome.spellingCorrect ? "Spelling correct." : "Check this spelling."} {outcome.placementCorrect ? "Right gap." : `It belongs in gap ${outcome.expectedSlot + 1}.`}</p>
          <DiffReveal attempt={outcome.attemptText} expected={target.word} mode="word" />
        </div>;
      })}</div>
      <p className="rounded-2xl bg-emerald-100 p-4 font-semibold text-emerald-950">{props.sentence.segments[0]}{props.sentence.targets[0].word}{props.sentence.segments[1]}{props.sentence.targets[1].word}{props.sentence.segments[2]}</p>
      <button type="button" autoFocus onClick={props.onContinue} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950">Continue</button>
    </>}
    {error ? <p role="alert" className="text-rose-200">{error}</p> : null}
  </section>;
}
