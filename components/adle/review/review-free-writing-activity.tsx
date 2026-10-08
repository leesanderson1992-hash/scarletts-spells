"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { participatesInReviewRepair } from "@/lib/adle/review-v3/r3-contracts";
import type { ReviewR4Gateway } from "@/lib/adle/review-v3/r4-contracts";
import { WordReflectionRepair } from "./word-reflection-repair";
import { TargetAudioButton } from "./target-audio-button";
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

function TargetWordRetrievalChecks(props: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  gateway: ReviewR3Gateway;
  repairGateway?: ReviewR4Gateway;
  onSession: (session: ReviewR3SessionView) => void;
  onPlayTargetAudio?: (target: ReviewTargetSnapshotV3, index: number) => void;
  onReadyToComplete?: () => Promise<void>;
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
  const repairCount = props.reviewSession.encounters.filter(participatesInReviewRepair).length;
  const pendingAttribution = props.reviewSession.encounters.find((encounter) =>
    encounter.writingAttributionPrompt !== null,
  ) ?? null;
  const pendingAttributionTarget = pendingAttribution === null
    ? null
    : props.snapshot.targets.find((target) => target.encounterId === pendingAttribution.encounterId) ?? null;

  if (pendingAttribution === null && remainingChecks === 0 && repairCount > 0 && props.repairGateway) {
    return (
      <WordReflectionRepair
        snapshot={props.snapshot}
        reviewSession={props.reviewSession}
        gateway={props.repairGateway}
        onPlayTargetAudio={props.onPlayTargetAudio}
        onReadyToComplete={props.onReadyToComplete}
      />
    );
  }

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
    <main className="adle-presentation review-page mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6">
      <header className="border-b border-[var(--review-border)] pb-5">
        <p className="review-eyebrow">Writing Challenge</p>
        <h1 className="review-title mt-1 text-3xl font-semibold">Target Word checks</h1>
        <p className="mt-2 text-base leading-7 text-[color:var(--review-muted)]">
          Listen and spell each Target Word that is still waiting for a check.
        </p>
      </header>

      {pendingAttribution && pendingAttributionTarget ? (
        <section className="review-surface grid gap-5 rounded-lg p-5" aria-label="Target Word writing check">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[color:var(--review-text)]">Target Word {pendingAttribution.targetOrder}</p>
          </div>
          {pendingAttribution.writingAttributionPrompt?.kind === "confirm_suggestion" ? (
            <div className="grid gap-4">
              <p className="text-lg leading-7 text-[color:var(--review-text)]">
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
                <button type="button" className="review-primary" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("suggestion", "yes")}>Yes</button>
                <button type="button" className="review-secondary" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("suggestion", "no")}>No</button>
              </div>
            </div>
          ) : pendingAttribution.writingAttributionPrompt?.kind === "ask_attempt" ? (
            <div className="grid gap-4">
              <p className="text-lg leading-7 text-[color:var(--review-text)]">
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
                <button type="button" className="review-primary" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("attempt", "yes")}>Yes</button>
                <button type="button" className="review-secondary" disabled={attributionSubmitting}
                  onClick={() => void submitAttributionDecision("attempt", "no")}>No</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <p className="text-lg font-semibold leading-7 text-[color:var(--review-text)]">
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
                <p className="mt-1 text-sm leading-6 text-[color:var(--review-muted)]">Highlight one word or a continuous group of words in your submitted writing.</p>
              </div>
              <textarea
                value={props.reviewSession.submittedWritingText ?? ""}
                readOnly
                spellCheck={false}
                aria-label="Select your attempted Target Word from the submitted writing"
                className="review-input min-h-48 resize-y rounded-lg p-4 text-lg leading-8"
                onSelect={(event) => captureSelectedSpan(event.currentTarget)}
                onKeyUp={(event) => captureSelectedSpan(event.currentTarget)}
                onPointerUp={(event) => captureSelectedSpan(event.currentTarget)}
              />
              {selectedSpan ? <p className="text-sm text-[color:var(--review-muted)]">Selected: <strong>{selectedSpan.text}</strong></p> : null}
              <button type="button" className="review-primary justify-self-start"
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
          <section key={target.encounterId} className="review-surface grid gap-4 rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-[color:var(--review-text)]">Target Word {target.order}</p>
              <TargetAudioButton
                index={target.order - 1}
                target={target}
                onPlay={props.onPlayTargetAudio}
              />
            </div>
            <label className="grid gap-2 text-sm font-semibold text-[color:var(--review-muted)]">
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
                className="review-input min-h-12 rounded-lg px-3 text-lg disabled:bg-[var(--review-inset)]"
              />
            </label>
            {!locked ? (
              <button
                type="button"
                className="review-primary justify-self-start"
                disabled={submittingEncounterId !== null || (responses[target.encounterId] ?? "").trim().length === 0}
                onClick={() => void submitAudioCheck(target.encounterId)}
              >
                {submittingEncounterId === target.encounterId ? "Checking..." : "Check"}
              </button>
            ) : encounter.originalOutcome === "success" ? (
              <p className="font-semibold text-emerald-200" role="status">Correct. This response is saved.</p>
            ) : (
              <div className="grid gap-1" role="status">
                <p className="font-semibold text-[color:var(--review-accent)]">This word needs Reflection &amp; Repair.</p>
                {encounter.governedCorrectSpellingReveal !== null ? (
                  <p className="text-sm text-[color:var(--review-text)]">The word was: <strong>{encounter.governedCorrectSpellingReveal}</strong></p>
                ) : null}
              </div>
            )}
          </section>
        );
      }) : null}

      {pendingAttribution === null && remainingChecks === 0 ? (
        <section className="review-callout" role="status">
          <p className="font-semibold text-[color:var(--review-text)]">All original retrieval checks are locked.</p>
          <p className="mt-1 text-sm text-[color:var(--review-muted)]">
            {repairCount > 0
              ? `${repairCount} ${repairCount === 1 ? "word is" : "words are"} ready for Reflection & Repair.`
              : "No words need repair. Review is ready to finish."}
          </p>
          {repairCount === 0 && props.onReadyToComplete ? (
            <button type="button" className="review-primary mt-4" onClick={() => void props.onReadyToComplete?.()}>
              Finish Review
            </button>
          ) : null}
        </section>
      ) : null}
      {message !== null ? <p className="text-sm text-[color:var(--review-accent)]" role="alert">{message}</p> : null}
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
      <div className="mx-auto grid w-full min-w-0 max-w-md place-items-center review-wheel-stage">
        <div className="relative aspect-square w-full max-w-[30rem] pt-4">
          <svg
            aria-hidden="true"
            className={`absolute left-1/2 -top-1 z-30 h-12 w-12 -translate-x-1/2 drop-shadow-[0_8px_8px_rgba(34,211,238,0.3)] sm:top-0 sm:h-18 sm:w-18 ${props.spinning ? "review-wheel-pointer-ticking" : ""}`}
            viewBox="0 0 80 94"
          >
            <defs>
              <linearGradient id="review-wheel-pointer-cyan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#cffafe" />
                <stop offset="0.42" stopColor="#67e8f9" />
                <stop offset="1" stopColor="#0891b2" />
              </linearGradient>
            </defs>
            <path d="M18 18 Q40 4 62 18 L56 36 L40 47 L24 36 Z" fill="url(#review-wheel-pointer-cyan)" stroke="#22d3ee" strokeWidth="2.5" />
            <path d="M30 22 Q40 16 50 22" fill="none" stroke="#ecfeff" strokeLinecap="round" strokeWidth="3" opacity="0.8" />
            <circle cx="40" cy="33" r="6" fill="#ecfeff" opacity="0.82" />
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
              className="block h-auto w-full overflow-visible drop-shadow-[0_24px_28px_rgba(2,6,23,0.5)]"
              role="img"
              aria-label="Writing Challenge wheel with five choices"
              viewBox="0 0 400 400"
            >
              <defs>
                <linearGradient id="review-wheel-rim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#a5f3fc" />
                  <stop offset="0.23" stopColor="#155e75" />
                  <stop offset="0.57" stopColor="#071a2d" />
                  <stop offset="0.78" stopColor="#0e7490" />
                  <stop offset="1" stopColor="#67e8f9" />
                </linearGradient>
                <linearGradient id="review-wheel-conundrums" x1="0.12" y1="0" x2="0.88" y2="1">
                  <stop offset="0" stopColor="#0e7490" />
                  <stop offset="1" stopColor="#164e63" />
                </linearGradient>
                <linearGradient id="review-wheel-reflection" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6d4acb" />
                  <stop offset="1" stopColor="#312e81" />
                </linearGradient>
                <linearGradient id="review-wheel-stories" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#2563eb" />
                  <stop offset="1" stopColor="#1e3a8a" />
                </linearGradient>
                <linearGradient id="review-wheel-fortunately" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#047857" />
                  <stop offset="1" stopColor="#064e3b" />
                </linearGradient>
                <linearGradient id="review-wheel-persuasion" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#b45309" />
                  <stop offset="1" stopColor="#78350f" />
                </linearGradient>
                <radialGradient id="review-wheel-hub" cx="32%" cy="25%" r="78%">
                  <stop offset="0" stopColor="#164e63" />
                  <stop offset="0.44" stopColor="#0c304a" />
                  <stop offset="1" stopColor="#07111f" />
                </radialGradient>
                <filter id="review-wheel-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <circle cx="200" cy="200" r="196" fill="url(#review-wheel-rim)" />
              <circle cx="200" cy="200" r="187" fill="#07111f" stroke="#67e8f9" strokeWidth="2" />
              <circle cx="200" cy="200" r="191" fill="none" stroke="#a5f3fc" strokeWidth="2" strokeDasharray="2 12" opacity="0.65" />
              <circle cx="200" cy="200" r="179" fill="#0c304a" stroke="#22d3ee" strokeWidth="2" />
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
                      <path d={segmentPath} fill="rgba(103,232,249,0.05)" stroke="#cffafe" strokeWidth="5" filter="url(#review-wheel-glow)" />
                    ) : null}
                    <text
                      x={labelPosition.x}
                      y={challengeType === "fortunately_unfortunately" ? labelPosition.y - 7 : labelPosition.y + 5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontFamily="DM Sans, Avenir Next, Segoe UI, sans-serif"
                      fontSize={challengeType === "fortunately_unfortunately" ? 14 : 16}
                      fontWeight="700"
                      transform={`rotate(${labelAngle} ${labelPosition.x} ${labelPosition.y})`}
                      style={{ paintOrder: "stroke", stroke: "rgba(2, 6, 23, 0.65)", strokeWidth: 3 }}
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
              <circle cx="200" cy="200" r="47" fill="#071a2d" stroke="#22d3ee" strokeWidth="3" />
              <circle cx="200" cy="200" r="38" fill="url(#review-wheel-hub)" stroke="#67e8f9" strokeWidth="3" />
              <path d="M203 178 L185 203 H198 L193 222 L215 195 H201 Z" fill="#a5f3fc" />
              <circle cx="200" cy="200" r="174" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            </svg>
          </div>
        </div>
          {props.revealed && props.selected !== null ? (
            <p className="mt-3 w-full text-center text-base font-bold text-[color:var(--review-muted)]" aria-live="polite">
              Selected: {CHALLENGE_LABELS[props.selected]}
            </p>
          ) : null}
        <p className="sr-only">Wheel choices: {challengeTypes.map((challengeType) => CHALLENGE_LABELS[challengeType]).join(", ")}.</p>
      </div>

      {!props.revealed ? (
        <button
          type="button"
          className="review-primary review-spin mx-auto mt-3"
          disabled={props.spinning}
          onClick={props.onSpin}
          aria-describedby={props.spinning ? "wheel-spin-status" : undefined}
        >
          {props.spinning ? "SPINNING..." : "SPIN"}
        </button>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-center text-sm font-semibold text-[color:var(--review-muted)]">Choose a different challenge if you prefer.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Choose a Writing Challenge">
            {challengeTypes.map((challengeType) => (
              <button
                key={challengeType}
                type="button"
                role="tab"
                aria-selected={props.selected === challengeType}
                className="review-choice min-w-0 break-words"
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
  reviewR4Gateway?: ReviewR4Gateway;
  onReadyToComplete?: () => Promise<void>;
  durableWritingGateway?: ReviewR2DurableWritingGateway;
  initialServerStateVersion?: number;
}

export interface ReviewR2DurableWritingGateway {
  selectPrompt(input: {
    challengeType: ReviewChallengeType;
    expectedStateVersion: number;
  }): Promise<{ session: ReviewWritingChallengeSessionV1; stateVersion: number }>;
  startWriting(input: {
    challengeType: ReviewChallengeType;
    expectedStateVersion: number;
  }): Promise<{ session: ReviewWritingChallengeSessionV1; stateVersion: number }>;
  saveDraft(input: {
    draftText: string;
    expectedStateVersion: number;
  }): Promise<{ stateVersion: number }>;
  extendWriting(input: {
    extensionSeconds: 300 | 600 | 900;
    expectedStateVersion: number;
  }): Promise<{ session: ReviewWritingChallengeSessionV1; stateVersion: number }>;
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
  const [serverStateVersion, setServerStateVersion] = useState(props.initialServerStateVersion ?? 0);
  const [durableWritingBusy, setDurableWritingBusy] = useState(false);
  const lastDurableDraft = useRef(session.draftText);
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
    if (!props.durableWritingGateway || session.phase !== "creative_writing") return;
    if (session.draftText === lastDurableDraft.current || durableWritingBusy) return;
    const draftText = session.draftText;
    const timer = window.setTimeout(() => {
      setDurableWritingBusy(true);
      void props.durableWritingGateway!.saveDraft({
        draftText,
        expectedStateVersion: serverStateVersion,
      }).then((result) => {
        lastDurableDraft.current = draftText;
        setServerStateVersion(result.stateVersion);
      }).catch(() => {
        setReviewR3Message("Your latest draft could not be saved. Please pause and try again.");
      }).finally(() => setDurableWritingBusy(false));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [durableWritingBusy, props.durableWritingGateway, serverStateVersion, session.draftText, session.phase]);

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

  function persistPromptSelection(challengeType: ReviewChallengeType, nextSession: ReviewWritingChallengeSessionV1) {
    if (!props.durableWritingGateway) {
      updateSession(nextSession);
      return;
    }
    setDurableWritingBusy(true);
    void props.durableWritingGateway.selectPrompt({
      challengeType,
      expectedStateVersion: serverStateVersion,
    }).then((result) => {
      setServerStateVersion(result.stateVersion);
      updateSession(result.session);
    }).catch(() => setReviewR3Message("That Writing Challenge choice could not be saved. Please try again."))
      .finally(() => setDurableWritingBusy(false));
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
      if (result.ok) persistPromptSelection(session.wheelResult, result.session);
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
    persistPromptSelection(challengeType, result.session);
  }

  async function requestExtension(seconds: 300 | 600 | 900) {
    if (!props.requestParentReauthenticatedExtension || !canExtendExpiredWriting) return;
    setExtensionMessage("Checking with your grown-up...");
    const accepted = await props.requestParentReauthenticatedExtension(seconds);
    if (!accepted) {
      setExtensionMessage("Your grown-up has not added extra time.");
      return;
    }
    if (props.durableWritingGateway) {
      try {
        const durable = await props.durableWritingGateway.extendWriting({
          extensionSeconds: seconds,
          expectedStateVersion: serverStateVersion,
        });
        setServerStateVersion(durable.stateVersion);
        updateSession(durable.session);
        setExtensionMessage("Extra writing time added.");
      } catch {
        setExtensionMessage("Extra time could not be added. Please try again.");
      }
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
    return <section className="review-surface mx-auto max-w-3xl rounded-lg p-6" aria-busy="true" />;
  }

  if (reviewR3Session?.submittedWritingFrozen && props.reviewR3Gateway) {
    return (
      <TargetWordRetrievalChecks
        snapshot={snapshot}
        reviewSession={reviewR3Session}
        gateway={props.reviewR3Gateway}
        repairGateway={props.reviewR4Gateway}
        onSession={setReviewR3Session}
        onPlayTargetAudio={props.onPlayTargetAudio}
        onReadyToComplete={props.onReadyToComplete}
      />
    );
  }

  if (session.phase === "challenge_selection") {
    return (
      <main className="adle-presentation review-page mx-auto grid w-full max-w-4xl gap-6 px-4 py-6 sm:px-6">
        <header className="text-center">
          <p className="review-eyebrow">Review</p>
          <h1 className="review-title mt-2 text-3xl font-semibold">Writing Challenge</h1>
          <p className="mt-2 text-sm text-[color:var(--review-muted)]">Let the wheel choose, then make it your own.</p>
        </header>
        <section className="review-surface review-wheel-surface min-w-0 p-5 sm:p-7">
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
              className="review-primary relative z-10 mx-auto mt-7"
              disabled={durableWritingBusy}
              onClick={() => {
                const result = beginCreativeWriting(props.snapshot, session, Date.now());
                if (!result.ok) return;
                if (!props.durableWritingGateway || result.session.selectedChallengeType === null) {
                  updateSession(result.session);
                  return;
                }
                setDurableWritingBusy(true);
                void props.durableWritingGateway.startWriting({
                  challengeType: result.session.selectedChallengeType,
                  expectedStateVersion: serverStateVersion,
                }).then((durable) => {
                  setServerStateVersion(durable.stateVersion);
                  updateSession(durable.session);
                }).catch(() => setReviewR3Message("Writing time could not start. Please try again."))
                  .finally(() => setDurableWritingBusy(false));
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

  const promptTitle = typeof prompt.configuration.title === "string" ? prompt.configuration.title : null;
  const topTip = typeof prompt.configuration.top_tip === "string" ? prompt.configuration.top_tip : null;

  return (
    <main className="adle-presentation review-page mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6">
      <header className="grid gap-4 border-b border-[var(--review-border)] pb-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="review-eyebrow">Writing Challenge</p>
          <h1 className="review-title mt-1 text-3xl font-semibold">{CHALLENGE_LABELS[prompt.challengeType]}</h1>
          {promptTitle ? <p className="mt-2 text-lg text-[color:var(--review-muted)]">{promptTitle}</p> : null}
        </div>
        <div className="review-timer text-right" data-warning={remainingSeconds <= 60}>
          <p className="text-xs font-semibold uppercase text-[color:var(--review-muted)]">Writing time</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[color:var(--review-accent)]" aria-live="polite">{formatRemaining(remainingSeconds)}</p>
        </div>
      </header>

      <section className="review-callout grid gap-3" aria-label="Challenge prompt">
        <p className="review-eyebrow">Your challenge</p>
        <p className="max-w-3xl whitespace-pre-line text-xl font-semibold leading-8">{prompt.promptText}</p>
        <p className="max-w-3xl whitespace-pre-line text-sm leading-6 text-[color:var(--review-muted)]">{prompt.instructionText}</p>
      </section>
      {topTip ? (
        <aside className="review-callout review-tip grid gap-2" aria-label="Top Tip">
          <p className="review-eyebrow">Top Tip</p>
          <p className="max-w-3xl whitespace-pre-line text-sm leading-6">{topTip}</p>
        </aside>
      ) : null}

      <section className="review-surface review-targets grid gap-4">
        <p className="text-lg font-semibold text-[color:var(--review-text)]" aria-live="polite">
          Target Words: {progressCount} / {props.snapshot.targets.length}
          {progressCount === props.snapshot.targets.length ? <span aria-label="challenge achievement"> ✨</span> : null}
        </p>
        <div className="review-audio-grid" aria-label={`${props.snapshot.targets.length} Target Word audio controls`}>
          {props.snapshot.targets.map((target, index) => (
            <TargetAudioButton key={target.encounterId} target={target} index={index} onPlay={props.onPlayTargetAudio} />
          ))}
        </div>
        <p className="text-sm text-[color:var(--review-muted)]">Finding every Target Word is an achievement, not the end of Review.</p>
      </section>

      {session.phase === "writing_time_finished" ? (
        <>
          <section className="grid gap-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5" role="status">
            <div>
              <p className="font-semibold text-amber-100">Writing time is finished.</p>
              <p className="mt-1 text-sm text-amber-100">Your writing is safely preserved below and ready for the next Review step.</p>
            </div>
            {canExtendExpiredWriting ? (
              <div className="grid gap-2 border-t border-amber-300/30 pt-4">
                <p className="text-sm font-semibold text-amber-100">Need a little more time?</p>
                <p className="text-sm text-amber-100">Ask a grown-up to reauthenticate and add one extension.</p>
                <div className="flex flex-wrap gap-2">
                  {([300, 600, 900] as const).map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      disabled={!props.requestParentReauthenticatedExtension}
                      title="Ask a grown-up to reauthenticate before adding time"
                      className="review-secondary"
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
              className="review-primary justify-self-start"
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
            className="review-input min-h-[20rem] resize-y rounded-lg p-4 text-lg leading-8"
          />
          {extensionMessage !== null ? <p className="text-sm text-[color:var(--review-muted)]" role="status">{extensionMessage}</p> : null}
          {reviewR3Message !== null ? <p className="text-sm text-[color:var(--review-accent)]" role="alert">{reviewR3Message}</p> : null}
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
            className="review-input min-h-[20rem] resize-y rounded-lg p-4 text-lg leading-8"
          />
          <div className="flex flex-col gap-3 border-t border-[var(--review-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[color:var(--review-muted)]">You can ask for one time extension if the timer runs out.</p>
            <button type="button" className="review-primary" disabled={reviewR3Submitting} onClick={endWriting}>
              {reviewR3Submitting ? "Saving..." : "Finish writing"}
            </button>
          </div>
          {extensionMessage !== null ? <p className="text-sm text-[color:var(--review-muted)]" role="status">{extensionMessage}</p> : null}
          {reviewR3Message !== null ? <p className="text-sm text-[color:var(--review-accent)]" role="alert">{reviewR3Message}</p> : null}
        </>
      )}
    </main>
  );
}
