"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DiffReveal } from "./diff-reveal";
import { playInteractionSound } from "./sound";
import { useReducedMotion } from "./motion";
import { splitHandleDisplayParts } from "./split-handle";

export type ShutterState = "look" | "cover" | "write" | "check";
export type CoverClosePolicy = { kind: "track_ratio"; threshold: number };

export interface CoverShutterProps {
  word: string;
  splitPoints: number[];
  components?: readonly string[];
  initialState?: ShutterState;
  initialAttempt?: string;
  muted?: boolean;
  closePolicy?: CoverClosePolicy;
  stepLabel?: string;
  continueLabel?: string;
  onStateChange?: (state: ShutterState, attempt: string) => void;
  onComplete?: (attempt: string) => void | Promise<void>;
  onContinue?: () => void;
}

export function coverTrackProgress(distance: number, shutterWidth: number, handleWidth = 64): number {
  const trackLength = Math.max(shutterWidth - handleWidth, 1);
  return Math.min(1, Math.max(0, distance / trackLength));
}

export function shouldSnapCoverClosed(distance: number, shutterWidth: number, policy?: CoverClosePolicy): boolean {
  return policy?.kind === "track_ratio"
    ? coverTrackProgress(distance, shutterWidth) >= policy.threshold
    : distance >= 80;
}

export function CoverShutter(props: CoverShutterProps) {
  const [state, setState] = useState<ShutterState>(props.initialState ?? "look");
  const [attempt, setAttempt] = useState(props.initialAttempt ?? "");
  const [slideDistance, setSlideDistance] = useState(0);
  const [showCoverFallback, setShowCoverFallback] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slideStartX = useRef<number | null>(null);
  const slideDistanceRef = useRef(0);
  const checkRequested = useRef(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (state !== "look") return;
    const timer = window.setTimeout(() => setShowCoverFallback(true), 3000);
    return () => window.clearTimeout(timer);
  }, [state]);
  function change(next: ShutterState) {
    if (next !== "look") setShowCoverFallback(false);
    setState(next);
    props.onStateChange?.(next, attempt);
  }
  function closeShutter() { slideStartX.current = null; slideDistanceRef.current = 0; setSlideDistance(0); change("cover"); playInteractionSound("shutter", props.muted); window.setTimeout(() => change("write"), reducedMotion ? 0 : 300); }
  function beginSlide(event: PointerEvent<HTMLButtonElement>) { if (state !== "look") return; slideStartX.current = event.clientX; slideDistanceRef.current = 0; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic accessibility tests may not create a native active pointer. */ } }
  function moveSlide(event: PointerEvent<HTMLButtonElement>) { if (slideStartX.current === null) return; const rawDistance = Math.max(0, event.clientX - slideStartX.current); const width = event.currentTarget.getBoundingClientRect().width; const distance = props.closePolicy ? Math.min(rawDistance, Math.max(width - 64, 1)) : rawDistance; slideDistanceRef.current = distance; setSlideDistance(distance); if (shouldSnapCoverClosed(distance, width, props.closePolicy)) closeShutter(); }
  function endSlide(event: PointerEvent<HTMLButtonElement>) { if (slideStartX.current === null) return; const distance = Math.max(slideDistanceRef.current, Math.max(0, event.clientX - slideStartX.current)); const width = event.currentTarget.getBoundingClientRect().width; slideStartX.current = null; slideDistanceRef.current = 0; setSlideDistance(0); if (shouldSnapCoverClosed(distance, width, props.closePolicy)) closeShutter(); }
  async function checkAttempt() {
    if (state !== "write" || !attempt.trim() || checkRequested.current) return;
    checkRequested.current = true;
    setSaving(true);
    setCheckpointError(null);
    try {
      await props.onComplete?.(attempt);
      change("check");
      playInteractionSound("reveal", props.muted);
    } catch {
      checkRequested.current = false;
      setCheckpointError("We couldn't freeze that check yet. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  const coverTransform = state === "look" ? `translateX(calc(-100% + ${64 + slideDistance}px))` : state === "check" ? "translateX(-100%)" : "translateX(0)";
  const parts = splitHandleDisplayParts(props.word, props.splitPoints, props.components);
  const displayWord = props.splitPoints.length === 0 ? props.word : <>{parts.map((part, index) => <span key={`${part}-${index}`}>{index > 0 ? <span className="mx-1 text-cyan-300">|</span> : null}{part}</span>)}</>;
  return <section data-cover-state={state} className="grid gap-4">
    {props.stepLabel ? <p className="text-center text-sm font-black uppercase tracking-[.2em] text-cyan-200">{props.stepLabel}</p> : null}
    <div className="grid gap-4 rounded-3xl border border-white/15 bg-slate-950/50 p-5"><div className="relative min-h-28 overflow-hidden rounded-2xl bg-white/5 p-6 text-center">{state === "look" || state === "check" ? <p className="text-4xl font-black tracking-wide text-white">{displayWord}</p> : null}<button type="button" disabled={state !== "look"} aria-hidden={state !== "look"} aria-label="Slide the cover from left to right to hide the word. Press Enter, Space, or Right Arrow to hide it with the keyboard." onPointerDown={beginSlide} onPointerMove={moveSlide} onPointerUp={endSlide} onPointerCancel={() => { slideStartX.current = null; slideDistanceRef.current = 0; setSlideDistance(0); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") { event.preventDefault(); closeShutter(); } }} className={`absolute inset-y-0 left-0 grid w-full touch-none select-none place-items-center bg-gradient-to-r from-slate-700 to-slate-900 text-sm font-bold uppercase tracking-[0.3em] text-cyan-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 disabled:opacity-100 ${reducedMotion ? "" : "transition-transform duration-300"}`} style={{ transform: coverTransform }}><span aria-hidden="true">word covered</span><span aria-hidden="true" className="absolute inset-y-0 right-0 flex w-16 flex-col items-center justify-center gap-1 rounded-r-2xl bg-cyan-300 px-1 text-[10px] font-black tracking-normal text-cyan-950"><span className="text-lg leading-none">→</span><span>SLIDE</span></span></button></div>{state === "look" ? <><p className="text-center text-sm font-semibold text-cyan-100">Drag the bright <strong>SLIDE →</strong> handle across the word, then let go.</p>{showCoverFallback ? <button type="button" onClick={closeShutter} className="min-h-12 rounded-full bg-cyan-300 px-5 font-black text-slate-950">Cover the word</button> : null}</> : null}{state === "write" ? <div><label className="text-sm font-semibold text-cyan-50">Type the whole word<input autoFocus autoComplete="off" spellCheck={false} disabled={saving} value={attempt} onChange={(event) => { setAttempt(event.target.value); props.onStateChange?.("write", event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void checkAttempt(); } }} className="mt-2 w-full rounded-2xl border border-cyan-300/40 bg-white p-4 text-xl text-slate-950 focus:outline-none focus:ring-4 focus-visible:ring-cyan-300/30 disabled:bg-slate-100" /></label><button type="button" disabled={!attempt.trim() || saving} onClick={() => void checkAttempt()} className="mt-3 min-h-12 w-full rounded-full bg-cyan-300 font-black text-slate-950 disabled:opacity-40">Check</button></div> : null}{state === "check" ? <DiffReveal attempt={attempt} expected={props.word} splitPoints={props.splitPoints} /> : null}</div>
    {checkpointError ? <p role="alert" className="text-sm font-semibold text-rose-200">{checkpointError}</p> : null}
    {saving ? <p role="status" className="text-sm text-cyan-100">Freezing your check…</p> : null}
    {state === "check" && props.onContinue ? <button type="button" onClick={props.onContinue} className="min-h-12 rounded-full bg-cyan-300 font-black text-slate-950">{props.continueLabel ?? "Continue"}</button> : null}
  </section>;
}
