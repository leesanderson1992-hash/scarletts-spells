"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { speakAuthoredNarration } from "@/components/adle/activities/shared/narration";
import {
  REVIEW_CHALLENGE_TYPES,
  type CompiledReviewSnapshotV3,
  type ReviewChallengeType,
  type ReviewTargetSnapshotV3,
} from "@/lib/adle/review-v3/contracts";
import type {
  ReviewR3Gateway,
  ReviewR3SessionView,
} from "@/lib/adle/review-v3/r3-contracts";
import { exactReviewTargetIds } from "@/lib/adle/review-v3/target-word-matcher";
import {
  createReviewWritingChallengeDraftEnvelope,
  restoreReviewWritingChallengeDraft,
  reviewWritingChallengeDraftKey,
  type ReviewWritingChallengeDraftStore,
} from "@/lib/adle/review-v3/writing-challenge-draft";
import {
  applyParentReauthenticatedExtension,
  beginCreativeWriting,
  createReviewWritingChallengeSession,
  expireCreativeWritingIfNeeded,
  finishCreativeWriting,
  remainingWritingSeconds,
  revealInitialWheelResult,
  saveWritingChallengeDraft,
  selectReviewChallengePrompt,
  selectedChallengePrompt,
  type ReviewWritingChallengeSessionV1,
} from "@/lib/adle/review-v3/writing-challenge-session";

const CHALLENGE_LABELS: Record<ReviewChallengeType, string> = {
  conundrums: "Conundrums",
  reflection: "Reflection",
  stories: "Stories",
  fortunately_unfortunately: "Fortunately / Unfortunately",
  persuasion: "Persuasion",
};

const WHEEL_SEGMENT_DEGREES = 360 / REVIEW_CHALLENGE_TYPES.length;
const WHEEL_CENTER = 200;
const WHEEL_SEGMENT_RADIUS = 170;

function normaliseDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function wheelPoint(angleFromTop: number, radius = WHEEL_SEGMENT_RADIUS) {
  const radians = ((angleFromTop - 90) * Math.PI) / 180;
  return {
    x: WHEEL_CENTER + (Math.cos(radians) * radius),
    y: WHEEL_CENTER + (Math.sin(radians) * radius),
  };
}

function wheelSegmentPath(index: number): string {
  const start = wheelPoint((index * WHEEL_SEGMENT_DEGREES) - (WHEEL_SEGMENT_DEGREES / 2));
  const end = wheelPoint((index * WHEEL_SEGMENT_DEGREES) + (WHEEL_SEGMENT_DEGREES / 2));
  return `M ${WHEEL_CENTER} ${WHEEL_CENTER} L ${start.x} ${start.y} A ${WHEEL_SEGMENT_RADIUS} ${WHEEL_SEGMENT_RADIUS} 0 0 1 ${end.x} ${end.y} Z`;
}

function radialLabelRotation(index: number): number {
  const radialAngle = (index * WHEEL_SEGMENT_DEGREES) - 90;
  return radialAngle > 90 ? radialAngle - 180 : radialAngle < -90 ? radialAngle + 180 : radialAngle;
}

/** Keeps the frozen snapshot outcome under the fixed top pointer. */
export function reviewWheelSpinRotation(
  currentRotation: number,
  challengeType: ReviewChallengeType,
  completeTurns: number,
): number {
  const index = REVIEW_CHALLENGE_TYPES.indexOf(challengeType);
  if (index < 0) return currentRotation;
  const targetRotation = normaliseDegrees(-(index * WHEEL_SEGMENT_DEGREES));
  const delta = normaliseDegrees(targetRotation - normaliseDegrees(currentRotation));
  return currentRotation + (completeTurns * 360) + delta;
}

export function reviewWheelSelectionRotation(
  currentRotation: number,
  challengeType: ReviewChallengeType,
): number {
  const index = REVIEW_CHALLENGE_TYPES.indexOf(challengeType);
  if (index < 0) return currentRotation;
  const targetRotation = normaliseDegrees(-(index * WHEEL_SEGMENT_DEGREES));
  const clockwiseDelta = normaliseDegrees(targetRotation - normaliseDegrees(currentRotation));
  const shortestDelta = clockwiseDelta > 180 ? clockwiseDelta - 360 : clockwiseDelta;
  return currentRotation + shortestDelta;
}

function formatRemaining(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function currentTimestamp(): number {
  return Date.now();
}

function useWritingClock(session: ReviewWritingChallengeSessionV1): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session.phase !== "creative_writing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session.phase]);
  return now;
}

function TargetAudioButton(props: {
  index: number;
  target: ReviewTargetSnapshotV3;
  onPlay?: (target: ReviewTargetSnapshotV3, index: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (props.onPlay) {
          props.onPlay(props.target, props.index);
          return;
        }
        if (props.target.audioAuthority.kind === "speech_text") {
          speakAuthoredNarration(props.target.audioAuthority.speechText ?? "", "word");
        }
      }}
      className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-white text-lg text-[color:var(--scarlett)] shadow-sm transition hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.2)]"
      aria-label={`Play target word ${props.index + 1}`}
      title={`Play target word ${props.index + 1}`}
    >
      <span aria-hidden="true">🔊</span>
    </button>
  );
}

function TargetWordRetrievalChecks(props: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  gateway: ReviewR3Gateway;
  onSession: (session: ReviewR3SessionView) => void;
  onPlayTargetAudio?: (target: ReviewTargetSnapshotV3, index: number) => void;
}) {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submittingEncounterId, setSubmittingEncounterId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attributionSubmitting, setAttributionSubmitting] = useState(false);
  const [selectedSpan, setSelectedSpan] = useState<{
    startOffset: number;
    endOffset: number;
    text: string;
  } | null>(null);
  const encounterById = new Map(props.reviewSession.encounters.map((encounter) => [
    encounter.encounterId,
    encounter,
  ]));
  const unresolvedTargets = [...props.snapshot.targets]
    .sort((left, right) => left.order - right.order)
    .filter((target) => {
      const encounter = encounterById.get(target.encounterId);
      return encounter?.audioCheckEligible || encounter?.resultSource === "review_audio_check";
    });
  const remainingChecks = props.reviewSession.encounters.filter((encounter) =>
    encounter.audioCheckEligible,
  ).length;
  const repairCount = props.reviewSession.encounters.filter((encounter) =>
    encounter.repairRequired,
  ).length;
  const pendingAttribution = props.reviewSession.encounters.find((encounter) =>
    encounter.writingAttributionPrompt !== null,
  ) ?? null;
  const pendingAttributionTarget = pendingAttribution === null
    ? null
    : props.snapshot.targets.find((target) => target.encounterId === pendingAttribution.encounterId) ?? null;

  function captureSelectedSpan(element: HTMLTextAreaElement) {
    const startOffset = element.selectionStart;
    const endOffset = element.selectionEnd;
    setSelectedSpan(endOffset > startOffset ? {
      startOffset,
      endOffset,
      text: element.value.slice(startOffset, endOffset),
    } : null);
  }

  async function submitAttributionDecision(
    kind: "suggestion" | "attempt",
    decision: "yes" | "no",
  ) {
    if (!pendingAttribution || attributionSubmitting) return;
    setAttributionSubmitting(true);
    setMessage(null);
    try {
      const input = {
        encounterId: pendingAttribution.encounterId,
        decision,
        idempotencyKey: `review-r31:${kind}:${props.reviewSession.snapshotFingerprint}:${pendingAttribution.encounterId}`,
      };
      const result = kind === "suggestion"
        ? await props.gateway.confirmSuggestion(input)
        : await props.gateway.answerAttemptQuestion(input);
      if (result.ok) {
        setSelectedSpan(null);
        props.onSession(result.session);
      }
      else setMessage(result.code === "attribution_confirmation_conflict"
        ? "That answer is already locked."
        : "That answer could not be saved. Please reload and try again.");
    } catch {
      setMessage("That answer could not be saved. Please reload and try again.");
    } finally {
      setAttributionSubmitting(false);
    }
  }

  async function submitSelectedSpan() {
    if (!pendingAttribution || !selectedSpan || attributionSubmitting) return;
    setAttributionSubmitting(true);
    setMessage(null);
    try {
      const result = await props.gateway.confirmWritingSpan({
        encounterId: pendingAttribution.encounterId,
        startOffset: selectedSpan.startOffset,
        endOffset: selectedSpan.endOffset,
        idempotencyKey: `review-r31:span:${props.reviewSession.snapshotFingerprint}:${pendingAttribution.encounterId}`,
      });
      if (result.ok) {
        setSelectedSpan(null);
        props.onSession(result.session);
      }
      else setMessage(result.code === "writing_span_already_consumed"
        ? "That part of the writing is already linked to another Target Word."
        : "Select one word or a continuous group of words from your writing.");
    } catch {
      setMessage("That selection could not be saved. Please reload and try again.");
    } finally {
      setAttributionSubmitting(false);
    }
  }

  async function submitAudioCheck(encounterId: string) {
    const response = responses[encounterId] ?? "";
    if (response.trim().length === 0 || submittingEncounterId !== null) return;
    setSubmittingEncounterId(encounterId);
    setMessage(null);
    try {
      const result = await props.gateway.submitAudioCheck({
        encounterId,
        response,
        idempotencyKey: `review-audio-check:${props.reviewSession.snapshotFingerprint}:${encounterId}`,
      });
      if (result.ok) {
        props.onSession(result.session);
      } else {
        setMessage(result.code === "audio_response_conflict"
          ? "This Target Word response is already locked."
          : "That check could not be saved. Please reload and try again.");
      }
    } catch {
      setMessage("That check could not be saved. Please reload and try again.");
    } finally {
      setSubmittingEncounterId(null);
    }
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="brand-eyebrow">Writing Challenge</p>
        <h1 className="brand-lesson-title mt-1 text-3xl font-semibold">Target Word checks</h1>
        <p className="mt-2 text-base leading-7 text-[color:var(--mid)]">
          Listen and spell each Target Word that is still waiting for a check.
        </p>
      </header>

      {pendingAttribution && pendingAttributionTarget ? (
        <section className="brand-card grid gap-5 rounded-lg p-5" aria-label="Target Word writing check">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[color:var(--ink)]">Target Word {pendingAttribution.targetOrder}</p>
          </div>
          {pendingAttribution.writingAttributionPrompt?.kind === "confirm_suggestion" ? (
            <div className="grid gap-4">
              <p className="text-lg leading-7 text-[color:var(--ink)]">
                Did you mean{" "}
                <span className="mx-1 inline-flex align-middle">
                  <TargetAudioButton
                    index={pendingAttribution.targetOrder - 1}
                    target={pendingAttributionTarget}
                    onPlay={props.onPlayTargetAudio}
                  />
                </span>
                {" "}when you wrote <strong>&ldquo;{pendingAttribution.writingAttributionPrompt.observedText}&rdquo;</strong>?
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="brand-primary-btn" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("suggestion", "yes")}>Yes</button>
                <button type="button" className="brand-secondary-btn" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("suggestion", "no")}>No</button>
              </div>
            </div>
          ) : pendingAttribution.writingAttributionPrompt?.kind === "ask_attempt" ? (
            <div className="grid gap-4">
              <p className="text-lg leading-7 text-[color:var(--ink)]">
                Did you try to use{" "}
                <span className="mx-1 inline-flex align-middle">
                  <TargetAudioButton
                    index={pendingAttribution.targetOrder - 1}
                    target={pendingAttributionTarget}
                    onPlay={props.onPlayTargetAudio}
                  />
                </span>
                {" "}in your writing?
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="brand-primary-btn" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("attempt", "yes")}>Yes</button>
                <button type="button" className="brand-secondary-btn" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("attempt", "no")}>No</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <p className="text-lg font-semibold leading-7 text-[color:var(--ink)]">
                  Select the word you meant for{" "}
                  <span className="mx-1 inline-flex align-middle">
                    <TargetAudioButton
                      index={pendingAttribution.targetOrder - 1}
                      target={pendingAttributionTarget}
                      onPlay={props.onPlayTargetAudio}
                    />
                  </span>
                  .
                </p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">Highlight one word or a continuous group of words in your submitted writing.</p>
              </div>
              <textarea
                value={props.reviewSession.submittedWritingText ?? ""}
                readOnly
                spellCheck={false}
                aria-label="Select your attempted Target Word from the submitted writing"
                className="brand-textarea min-h-48 resize-y rounded-lg p-4 text-lg leading-8"
                onSelect={(event) => captureSelectedSpan(event.currentTarget)}
                onKeyUp={(event) => captureSelectedSpan(event.currentTarget)}
                onPointerUp={(event) => captureSelectedSpan(event.currentTarget)}
              />
              {selectedSpan ? <p className="text-sm text-[color:var(--mid)]">Selected: <strong>{selectedSpan.text}</strong></p> : null}
              <button type="button" className="brand-primary-btn justify-self-start"
                disabled={!selectedSpan || attributionSubmitting} onClick={() => void submitSelectedSpan()}>
                Confirm selection
              </button>
            </div>
          )}
        </section>
      ) : null}

      {pendingAttribution === null ? unresolvedTargets.map((target) => {
        const encounter = encounterById.get(target.encounterId);
        if (!encounter) return null;
        const locked = encounter.audioCheckLocked;
        return (
          <section key={target.encounterId} className="brand-card grid gap-4 rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-[color:var(--ink)]">Target Word {target.order}</p>
              <TargetAudioButton
                index={target.order - 1}
                target={target}
                onPlay={props.onPlayTargetAudio}
              />
            </div>
            <label className="grid gap-2 text-sm font-semibold text-[color:var(--mid)]">
              Spell this Target Word
              <input
                value={locked ? encounter.submittedAudioResponse ?? "" : responses[target.encounterId] ?? ""}
                onChange={(event) => setResponses((current) => ({
                  ...current,
                  [target.encounterId]: event.target.value,
                }))}
                disabled={locked}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                autoComplete="off"
                className="brand-input min-h-12 rounded-lg px-3 text-lg disabled:bg-[var(--mist)]"
              />
            </label>
            {!locked ? (
              <button
                type="button"
                className="brand-primary-btn justify-self-start"
                disabled={submittingEncounterId !== null || (responses[target.encounterId] ?? "").trim().length === 0}
                onClick={() => void submitAudioCheck(target.encounterId)}
              >
                {submittingEncounterId === target.encounterId ? "Checking..." : "Check"}
              </button>
            ) : encounter.originalOutcome === "success" ? (
              <p className="font-semibold text-emerald-800" role="status">Correct. This response is saved.</p>
            ) : (
              <div className="grid gap-1" role="status">
                <p className="font-semibold text-[color:var(--scarlett)]">This word needs Reflection &amp; Repair.</p>
                {encounter.governedCorrectSpellingReveal !== null ? (
                  <p className="text-sm text-[color:var(--ink)]">The word was: <strong>{encounter.governedCorrectSpellingReveal}</strong></p>
                ) : null}
              </div>
            )}
          </section>
        );
      }) : null}

      {pendingAttribution === null && remainingChecks === 0 ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--mist)] p-5" role="status">
          <p className="font-semibold text-[color:var(--ink)]">All original retrieval checks are locked.</p>
          <p className="mt-1 text-sm text-[color:var(--mid)]">
            {repairCount > 0
              ? `${repairCount} ${repairCount === 1 ? "word is" : "words are"} ready for Reflection & Repair.`
              : "No words need repair. Review completion will be connected in a later stage."}
          </p>
        </section>
      ) : null}
      {message !== null ? <p className="text-sm text-[color:var(--scarlett)]" role="alert">{message}</p> : null}
    </main>
  );
}

function ChallengeWheel(props: {
  selected: ReviewChallengeType | null;
  spinning: boolean;
  revealed: boolean;
  rotation: number;
  animationDurationMs: number;
  onSpin: () => void;
  onSelect: (challengeType: ReviewChallengeType) => void;
}) {
  const challengeTypes = REVIEW_CHALLENGE_TYPES;

  return (
    <section className="grid min-w-0 gap-5" aria-label="Writing Challenge selector">
      <div className="mx-auto grid w-full min-w-0 max-w-md place-items-center">
        <div className="relative aspect-square w-full max-w-[30rem] pt-4">
          <svg
            aria-hidden="true"
            className={`absolute left-1/2 top-0 z-30 h-20 w-20 -translate-x-1/2 drop-shadow-[0_8px_8px_rgba(36,10,37,0.25)] ${props.spinning ? "review-wheel-pointer-ticking" : ""}`}
            viewBox="0 0 80 94"
          >
            <defs>
              <linearGradient id="review-wheel-pointer-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff3bd" />
                <stop offset="0.42" stopColor="#f9c94e" />
                <stop offset="1" stopColor="#bf7208" />
              </linearGradient>
            </defs>
            <path d="M18 18 Q40 4 62 18 L56 36 L40 47 L24 36 Z" fill="url(#review-wheel-pointer-gold)" stroke="#8d4b00" strokeWidth="2.5" />
            <path d="M30 22 Q40 16 50 22" fill="none" stroke="#fff9df" strokeLinecap="round" strokeWidth="3" opacity="0.8" />
            <circle cx="40" cy="33" r="6" fill="#fff8dd" opacity="0.82" />
          </svg>
          <div
            className="absolute inset-x-0 bottom-0 origin-center"
            style={{
              transform: `rotate(${props.rotation}deg)`,
              transitionDuration: `${props.animationDurationMs}ms`,
              transitionProperty: "transform",
              transitionTimingFunction: "cubic-bezier(0.16, 0, 0.14, 1)",
            }}
          >
            <svg
              className="block h-auto w-full overflow-visible drop-shadow-[0_24px_28px_rgba(74,23,69,0.22)]"
              role="img"
              aria-label="Writing Challenge wheel with five choices"
              viewBox="0 0 400 400"
            >
              <defs>
                <linearGradient id="review-wheel-rim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ffde79" />
                  <stop offset="0.23" stopColor="#963363" />
                  <stop offset="0.57" stopColor="#3b193f" />
                  <stop offset="0.78" stopColor="#b54478" />
                  <stop offset="1" stopColor="#ffe49b" />
                </linearGradient>
                <linearGradient id="review-wheel-conundrums" x1="0.12" y1="0" x2="0.88" y2="1">
                  <stop offset="0" stopColor="#ed70ad" />
                  <stop offset="1" stopColor="#a61a61" />
                </linearGradient>
                <linearGradient id="review-wheel-reflection" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#b98bea" />
                  <stop offset="1" stopColor="#51419b" />
                </linearGradient>
                <linearGradient id="review-wheel-stories" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#73d8e5" />
                  <stop offset="1" stopColor="#147f9f" />
                </linearGradient>
                <linearGradient id="review-wheel-fortunately" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#91d49c" />
                  <stop offset="1" stopColor="#237864" />
                </linearGradient>
                <linearGradient id="review-wheel-persuasion" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ffd876" />
                  <stop offset="1" stopColor="#b87314" />
                </linearGradient>
                <radialGradient id="review-wheel-hub" cx="32%" cy="25%" r="78%">
                  <stop offset="0" stopColor="#fff5bf" />
                  <stop offset="0.44" stopColor="#f7bf37" />
                  <stop offset="1" stopColor="#965006" />
                </radialGradient>
                <filter id="review-wheel-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <circle cx="200" cy="200" r="196" fill="url(#review-wheel-rim)" />
              <circle cx="200" cy="200" r="187" fill="#29132f" stroke="#ffd970" strokeWidth="2" />
              <circle cx="200" cy="200" r="179" fill="#fff8fd" stroke="#fff2c7" strokeWidth="2" />
              {challengeTypes.map((challengeType, index) => {
                const segmentPath = wheelSegmentPath(index);
                const isSelected = props.selected === challengeType;
                const labelAngle = radialLabelRotation(index);
                const labelPosition = wheelPoint(index * WHEEL_SEGMENT_DEGREES, 112);
                const gradientId = `review-wheel-${challengeType === "fortunately_unfortunately" ? "fortunately" : challengeType}`;
                return (
                  <g key={challengeType} data-wheel-segment={challengeType}>
                    <path d={segmentPath} fill={`url(#${gradientId})`} stroke="rgba(255,255,255,0.72)" strokeWidth="2.5" />
                    <path d={segmentPath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="7" />
                    {isSelected ? (
                      <path d={segmentPath} fill="rgba(255,255,255,0.12)" stroke="#fff7c9" strokeWidth="5" filter="url(#review-wheel-glow)" />
                    ) : null}
                    <text
                      x={labelPosition.x}
                      y={challengeType === "fortunately_unfortunately" ? labelPosition.y - 7 : labelPosition.y + 5}
                      textAnchor="middle"
                      fill="#fffdf8"
                      fontFamily="DM Sans, Avenir Next, Segoe UI, sans-serif"
                      fontSize={challengeType === "fortunately_unfortunately" ? 12 : 14}
                      fontWeight="700"
                      transform={`rotate(${labelAngle} ${labelPosition.x} ${labelPosition.y})`}
                      style={{ paintOrder: "stroke", stroke: "rgba(32, 12, 33, 0.38)", strokeWidth: 3 }}
                    >
                      {challengeType === "fortunately_unfortunately" ? (
                        <>
                          <tspan x={labelPosition.x} dy="0">Fortunately /</tspan>
                          <tspan x={labelPosition.x} dy="15">Unfortunately</tspan>
                        </>
                      ) : CHALLENGE_LABELS[challengeType]}
                    </text>
                  </g>
                );
              })}
              <circle cx="200" cy="200" r="47" fill="#2c1330" stroke="#f6d16b" strokeWidth="3" />
              <circle cx="200" cy="200" r="38" fill="url(#review-wheel-hub)" stroke="#fff4c2" strokeWidth="3" />
              <circle cx="187" cy="185" r="9" fill="#fff9df" opacity="0.82" />
              <path d="M182 217 Q200 228 218 217" fill="none" stroke="rgba(101,53,4,0.5)" strokeLinecap="round" strokeWidth="3" />
              <circle cx="200" cy="200" r="174" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            </svg>
          </div>
          {props.revealed && props.selected !== null ? (
            <p className="absolute -bottom-8 left-1/2 w-full -translate-x-1/2 text-center text-base font-bold text-[color:var(--mid)]" aria-live="polite">
              Selected: {CHALLENGE_LABELS[props.selected]}
            </p>
          ) : null}
        </div>
        <p className="sr-only">Wheel choices: {challengeTypes.map((challengeType) => CHALLENGE_LABELS[challengeType]).join(", ")}.</p>
      </div>

      {!props.revealed ? (
        <button
          type="button"
          className="mx-auto mt-3 min-h-14 min-w-48 rounded-lg border border-[#f5cf65] bg-[linear-gradient(135deg,#8d1d55,#d53d81_52%,#8f1d58)] px-8 py-3 text-base font-bold text-white shadow-[0_7px_0_#65123c,0_16px_28px_rgba(111,22,67,0.26)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_9px_0_#65123c,0_20px_32px_rgba(111,22,67,0.28)] active:translate-y-0.5 active:shadow-[0_4px_0_#65123c,0_10px_20px_rgba(111,22,67,0.22)] disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(232,145,200,0.42)]"
          disabled={props.spinning}
          onClick={props.onSpin}
          aria-describedby={props.spinning ? "wheel-spin-status" : undefined}
        >
          {props.spinning ? "SPINNING..." : "SPIN"}
        </button>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-center text-sm font-semibold text-[color:var(--mid)]">Choose a different challenge if you prefer.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Choose a Writing Challenge">
            {challengeTypes.map((challengeType) => (
              <button
                key={challengeType}
                type="button"
                role="tab"
                aria-selected={props.selected === challengeType}
                className={`min-h-12 min-w-0 break-words rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.2)] ${props.selected === challengeType ? "border-[color:var(--scarlett)] bg-[#fff0f7] text-[color:var(--scarlett)]" : "border-[var(--border)] bg-white text-[color:var(--mid)] hover:border-[color:var(--scarlett)]"}`}
                onClick={() => props.onSelect(challengeType)}
              >
                {CHALLENGE_LABELS[challengeType]}
              </button>
            ))}
          </div>
        </div>
      )}
      <p id="wheel-spin-status" className="sr-only" aria-live="polite">
        {props.spinning ? "The Writing Challenge wheel is spinning." : ""}
      </p>
    </section>
  );
}

export interface ReviewFreeWritingActivityProps {
  snapshot: CompiledReviewSnapshotV3;
  initialSession?: ReviewWritingChallengeSessionV1;
  draftStore?: ReviewWritingChallengeDraftStore;
  onPlayTargetAudio?: (target: ReviewTargetSnapshotV3, index: number) => void;
  requestParentReauthenticatedExtension?: (extensionSeconds: 300 | 600 | 900) => Promise<boolean>;
  onWritingTimeFinished?: (session: ReviewWritingChallengeSessionV1) => void;
  reviewR3Gateway?: ReviewR3Gateway;
}

/**
 * R2's only Review activity shell. It owns selection, writing time and draft
 * convenience, while R3+ own every retrieval, repair and completion transition.
 */
export function ReviewFreeWritingActivity(props: ReviewFreeWritingActivityProps) {
  const { onWritingTimeFinished, snapshot } = props;
  const draftStore = props.draftStore;
  const draftKey = useMemo(() => reviewWritingChallengeDraftKey(snapshot), [snapshot]);
  const [session, setSession] = useState(() =>
    props.initialSession ?? createReviewWritingChallengeSession(snapshot),
  );
  const [resumeLoaded, setResumeLoaded] = useState(() =>
    props.initialSession !== undefined || draftStore === undefined,
  );
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRevealed, setWheelRevealed] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(() =>
    session.selectedChallengeType === null
      ? 0
      : reviewWheelSelectionRotation(0, session.selectedChallengeType),
  );
  const [wheelAnimationDurationMs, setWheelAnimationDurationMs] = useState(0);
  const [extensionMessage, setExtensionMessage] = useState<string | null>(null);
  const [reviewR3Session, setReviewR3Session] = useState<ReviewR3SessionView | null>(null);
  const [reviewR3Hydrated, setReviewR3Hydrated] = useState(() => props.reviewR3Gateway === undefined);
  const [reviewR3Submitting, setReviewR3Submitting] = useState(false);
  const [reviewR3Message, setReviewR3Message] = useState<string | null>(null);
  const now = useWritingClock(session);
  const priorPhase = useRef(session.phase);
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!draftStore) return;
    const restoreTimer = window.setTimeout(() => {
      const restored = restoreReviewWritingChallengeDraft(draftStore.load(draftKey), snapshot);
      if (restored !== null) {
        setSession(expireCreativeWritingIfNeeded(restored, Date.now()));
        setWheelRevealed(restored.selectedChallengeType !== null);
        setWheelAnimationDurationMs(0);
        setWheelRotation(restored.selectedChallengeType === null
          ? 0
          : reviewWheelSelectionRotation(0, restored.selectedChallengeType));
      }
      setResumeLoaded(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [draftKey, draftStore, snapshot]);

  useEffect(() => {
    if (!props.reviewR3Gateway) return;
    let active = true;
    void props.reviewR3Gateway.hydrate()
      .then((restored) => {
        if (active) setReviewR3Session(restored);
      })
      .catch(() => {
        if (active) setReviewR3Message("Review state could not be loaded. Please refresh.");
      })
      .finally(() => {
        if (active) setReviewR3Hydrated(true);
      });
    return () => { active = false; };
  }, [props.reviewR3Gateway]);

  useEffect(() => () => {
    if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
  }, []);

  useEffect(() => {
    if (!resumeLoaded || !draftStore) return;
    draftStore.save(
      draftKey,
      createReviewWritingChallengeDraftEnvelope(snapshot, session),
    );
  }, [draftKey, draftStore, resumeLoaded, session, snapshot]);

  useEffect(() => {
    if (session.phase !== "creative_writing") return;
    const expiryTimer = window.setInterval(() => {
      setSession((current) => expireCreativeWritingIfNeeded(current, Date.now()));
    }, 1_000);
    return () => window.clearInterval(expiryTimer);
  }, [session.phase]);

  useEffect(() => {
    const shouldNotify = priorPhase.current === "creative_writing" &&
      session.phase === "writing_time_finished";
    priorPhase.current = session.phase;
    if (shouldNotify) onWritingTimeFinished?.(session);
  }, [onWritingTimeFinished, session]);

  const prompt = selectedChallengePrompt(snapshot, session);
  const remainingSeconds = remainingWritingSeconds(session, now);
  const progressCount = exactReviewTargetIds(session.draftText, snapshot.targets).size;
  const canExtendExpiredWriting = session.phase === "writing_time_finished" &&
    session.extensionSeconds === null &&
    session.writingDeadlineAtMs !== null &&
    session.writingFinishedAtMs !== null &&
    session.writingFinishedAtMs >= session.writingDeadlineAtMs;

  function updateSession(next: ReviewWritingChallengeSessionV1) {
    setSession(next);
  }

  function spinWheel() {
    if (wheelSpinning) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 120 : 3_200;
    setWheelSpinning(true);
    setWheelAnimationDurationMs(duration);
    setWheelRotation((currentRotation) => reviewWheelSpinRotation(
      currentRotation,
      session.wheelResult,
      reducedMotion ? 0 : 5,
    ));
    spinTimer.current = window.setTimeout(() => {
      const result = revealInitialWheelResult(props.snapshot, session);
      if (result.ok) updateSession(result.session);
      setWheelSpinning(false);
      setWheelRevealed(true);
      spinTimer.current = null;
    }, duration);
  }

  function selectChallenge(challengeType: ReviewChallengeType) {
    const result = selectReviewChallengePrompt(props.snapshot, session, challengeType);
    if (!result.ok) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setWheelAnimationDurationMs(reducedMotion ? 120 : 620);
    setWheelRotation((currentRotation) => reviewWheelSelectionRotation(currentRotation, challengeType));
    updateSession(result.session);
  }

  async function requestExtension(seconds: 300 | 600 | 900) {
    if (!props.requestParentReauthenticatedExtension || !canExtendExpiredWriting) return;
    setExtensionMessage("Checking with your grown-up...");
    const accepted = await props.requestParentReauthenticatedExtension(seconds);
    if (!accepted) {
      setExtensionMessage("Your grown-up has not added extra time.");
      return;
    }
    const result = applyParentReauthenticatedExtension(session, seconds, currentTimestamp());
    if (result.ok) {
      updateSession(result.session);
      setExtensionMessage("Extra writing time added.");
    }
  }

  async function submitWritingForRetrieval(nextSession: ReviewWritingChallengeSessionV1) {
    if (!props.reviewR3Gateway) return;
    setReviewR3Submitting(true);
    setReviewR3Message(null);
    try {
      const result = await props.reviewR3Gateway.submitWriting({
        finalWriting: nextSession.draftText,
        idempotencyKey: `review-writing:${snapshot.provenance.sourceFingerprint}`,
      });
      if (result.ok) {
        setReviewR3Session(result.session);
      } else {
        setReviewR3Message(result.code === "writing_submission_conflict"
          ? "This writing has already been submitted and cannot be replaced."
          : "Your writing could not be submitted. Please reload and try again.");
      }
    } catch {
      setReviewR3Message("Your writing could not be submitted. Please reload and try again.");
    } finally {
      setReviewR3Submitting(false);
    }
  }

  function endWriting() {
    const result = finishCreativeWriting(session, Date.now());
    if (!result.ok) return;
    updateSession(result.session);
    void submitWritingForRetrieval(result.session);
  }

  if (!resumeLoaded || !reviewR3Hydrated) {
    return <section className="brand-card mx-auto max-w-3xl rounded-lg p-6" aria-busy="true" />;
  }

  if (reviewR3Session?.submittedWritingFrozen && props.reviewR3Gateway) {
    return (
      <TargetWordRetrievalChecks
        snapshot={snapshot}
        reviewSession={reviewR3Session}
        gateway={props.reviewR3Gateway}
        onSession={setReviewR3Session}
        onPlayTargetAudio={props.onPlayTargetAudio}
      />
    );
  }

  if (session.phase === "challenge_selection") {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6">
        <header className="text-center">
          <p className="brand-eyebrow">Review</p>
          <h1 className="brand-lesson-title mt-2 text-3xl font-semibold">Writing Challenge</h1>
          <p className="mt-2 text-sm text-[color:var(--mid)]">Let the wheel choose, then make it your own.</p>
        </header>
        <section className="brand-card min-w-0 rounded-lg p-5 sm:p-7">
          <ChallengeWheel
            selected={session.selectedChallengeType}
            spinning={wheelSpinning}
            revealed={wheelRevealed}
            rotation={wheelRotation}
            animationDurationMs={wheelAnimationDurationMs}
            onSpin={spinWheel}
            onSelect={selectChallenge}
          />
          {prompt !== null && wheelRevealed ? (
            <button
              type="button"
              className="brand-primary-btn relative z-10 mx-auto mt-7"
              onClick={() => {
                const result = beginCreativeWriting(props.snapshot, session, Date.now());
                if (result.ok) updateSession(result.session);
              }}
            >
              Start writing
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (prompt === null) return null;

  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6">
      <header className="grid gap-4 border-b border-[var(--border)] pb-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="brand-eyebrow">Writing Challenge</p>
          <h1 className="brand-lesson-title mt-1 text-3xl font-semibold">{CHALLENGE_LABELS[prompt.challengeType]}</h1>
          <p className="mt-2 max-w-3xl text-base leading-7 text-[color:var(--ink)]">{prompt.promptText}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">{prompt.instructionText}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase text-[color:var(--mid)]">Writing time</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[color:var(--scarlett)]" aria-live="polite">{formatRemaining(remainingSeconds)}</p>
        </div>
      </header>

      <section className="grid gap-3 border-b border-[var(--border)] pb-5">
        <p className="text-lg font-semibold text-[color:var(--ink)]" aria-live="polite">
          Target Words: {progressCount} / {props.snapshot.targets.length}
          {progressCount === props.snapshot.targets.length ? <span aria-label="challenge achievement"> ✨</span> : null}
        </p>
        <div className="flex flex-wrap gap-2" aria-label={`${props.snapshot.targets.length} Target Word audio controls`}>
          {props.snapshot.targets.map((target, index) => (
            <TargetAudioButton key={target.encounterId} target={target} index={index} onPlay={props.onPlayTargetAudio} />
          ))}
        </div>
        <p className="text-sm text-[color:var(--mid)]">Finding every Target Word is an achievement, not the end of Review.</p>
      </section>

      {session.phase === "writing_time_finished" ? (
        <>
          <section className="grid gap-4 rounded-lg border border-amber-200 bg-amber-50 p-5" role="status">
            <div>
              <p className="font-semibold text-amber-950">Writing time is finished.</p>
              <p className="mt-1 text-sm text-amber-900">Your writing is safely preserved below and ready for the next Review step.</p>
            </div>
            {canExtendExpiredWriting ? (
              <div className="grid gap-2 border-t border-amber-200 pt-4">
                <p className="text-sm font-semibold text-amber-950">Need a little more time?</p>
                <p className="text-sm text-amber-900">Ask a grown-up to reauthenticate and add one extension.</p>
                <div className="flex flex-wrap gap-2">
                  {([300, 600, 900] as const).map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      disabled={!props.requestParentReauthenticatedExtension}
                      title="Ask a grown-up to reauthenticate before adding time"
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
                      onClick={() => void requestExtension(seconds)}
                    >
                      +{seconds / 60} min
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="brand-primary-btn justify-self-start"
              disabled={reviewR3Submitting}
              onClick={() => void submitWritingForRetrieval(session)}
            >
              {reviewR3Submitting ? "Saving..." : "Continue to word checks"}
            </button>
          </section>
          <textarea
            value={session.draftText}
            readOnly
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            aria-label="Your saved Writing Challenge"
            className="brand-textarea min-h-[20rem] resize-y rounded-lg p-4 text-lg leading-8"
          />
          {extensionMessage !== null ? <p className="text-sm text-[color:var(--mid)]" role="status">{extensionMessage}</p> : null}
          {reviewR3Message !== null ? <p className="text-sm text-[color:var(--scarlett)]" role="alert">{reviewR3Message}</p> : null}
        </>
      ) : (
        <>
          <textarea
            value={session.draftText}
            onChange={(event) => updateSession(saveWritingChallengeDraft(session, event.target.value))}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            autoComplete="off"
            aria-label="Your Writing Challenge"
            placeholder="Write your ideas here..."
            className="brand-textarea min-h-[20rem] resize-y rounded-lg p-4 text-lg leading-8"
          />
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[color:var(--mid)]">You can ask for one time extension if the timer runs out.</p>
            <button type="button" className="brand-primary-btn" disabled={reviewR3Submitting} onClick={endWriting}>
              {reviewR3Submitting ? "Saving..." : "Finish writing"}
            </button>
          </div>
          {extensionMessage !== null ? <p className="text-sm text-[color:var(--mid)]" role="status">{extensionMessage}</p> : null}
          {reviewR3Message !== null ? <p className="text-sm text-[color:var(--scarlett)]" role="alert">{reviewR3Message}</p> : null}
        </>
      )}
    </main>
  );
}
