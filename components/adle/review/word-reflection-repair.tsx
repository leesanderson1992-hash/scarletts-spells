"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CompiledReviewSnapshotV3,
  ReviewTargetSnapshotV3,
} from "@/lib/adle/review-v3/contracts";
import { segmentReviewGraphemes } from "@/lib/adle/review-v3/graphemes";
import type { ReviewR3SessionView } from "@/lib/adle/review-v3/r3-contracts";
import type {
  ReviewR4Gateway,
  ReviewR4GatewayResult,
  ReviewR4SessionView,
} from "@/lib/adle/review-v3/r4-contracts";
import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { TargetAudioButton } from "./target-audio-button";

function idempotencyKey(
  fingerprint: string,
  encounterId: string,
  transition: string,
) {
  return `review-r4:${transition}:${fingerprint}:${encounterId}`;
}

function HighlightedSpelling(props: {
  spelling: string;
  start: number;
  end: number;
  onDark?: boolean;
}) {
  return (
    <p className={`flex flex-wrap text-3xl font-semibold tracking-normal ${props.onDark ? "justify-center text-white" : "text-[color:var(--ink)]"}`}>
      {segmentReviewGraphemes(props.spelling).map((grapheme) => (
        <span
          key={grapheme.index}
          className={grapheme.index >= props.start && grapheme.index < props.end
            ? "rounded bg-[#ffe394] px-0.5 text-[#6b3f00]"
            : "px-0.5"}
        >
          {grapheme.text}
        </span>
      ))}
    </p>
  );
}

function CueIdeas() {
  return (
    <details open className="rounded-lg border border-[var(--border)] bg-[var(--mist)] p-4">
      <summary className="cursor-pointer font-semibold text-[color:var(--ink)]">Need an idea?</summary>
      <div className="mt-4 grid gap-4 text-sm leading-6 text-[color:var(--mid)]">
        <p className="font-semibold text-[color:var(--ink)]">For example:</p>
        <p><strong>Initial-letter mnemonic — because:</strong><br />Big Elephants Can Always Understand Small Elephants.</p>
        <p><strong>Pattern cue — necessary:</strong><br />One Collar, Two Sleeves — one <strong>c</strong>, two <strong>s</strong>.</p>
        <p><strong>Exaggerated spelling pronunciation — Wednesday:</strong><br />Wed-nes-day.</p>
        <p><strong>Tricky-bit spotlight — piece:</strong><br />A <strong>PIE</strong>ce of pie.</p>
        <p><strong>Morphology / word-family cue — heal → health:</strong><br />Use the preserved word family even when the pronunciation changes.</p>
        <p><strong>Crazy picture cue — business:</strong><br />Imagine a <strong>BUS</strong> wearing an <strong>INESS</strong> name badge.</p>
      </div>
    </details>
  );
}

export function WordReflectionRepair(props: {
  snapshot: CompiledReviewSnapshotV3;
  reviewSession: ReviewR3SessionView;
  gateway: ReviewR4Gateway;
  onPlayTargetAudio?: (target: ReviewTargetSnapshotV3, index: number) => void;
}) {
  const [session, setSession] = useState<ReviewR4SessionView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [cueText, setCueText] = useState("");
  const [coveredRepairCycle, setCoveredRepairCycle] = useState<string | null>(null);
  const trickySaveInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void props.gateway.hydrate(props.reviewSession)
      .then((restored) => { if (active) setSession(restored); })
      .catch(() => { if (active) setMessage("Repair state could not be loaded. Please refresh."); });
    return () => { active = false; };
  }, [props.gateway, props.reviewSession]);

  async function transition(action: () => Promise<ReviewR4GatewayResult>, reset?: () => void) {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) {
        reset?.();
        setSession(result.session);
      } else {
        setMessage(result.code === "invalid_grapheme_span"
          ? "Choose one or more complete parts of the word."
          : result.code === "invalid_memory_cue"
            ? "Write a short memory cue before continuing."
            : "That repair step is already locked. Please refresh to continue.");
      }
    } catch {
      setMessage("That repair step could not be saved. Please refresh and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (session === null) {
    return <section className="brand-card mx-auto max-w-3xl rounded-lg p-6" aria-busy="true" />;
  }
  const repair = session.activeRepair;
  if (repair === null) {
    if (!session.allRequiredRepairsTerminal) {
      const nextEncounterId = session.nextRepairEncounterId;
      const lastTerminalRepair = session.terminalRepairs.at(-1);
      if (session.terminalRepairs.length > 0 && nextEncounterId) {
        return (
          <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6 sm:px-6">
            <section className="brand-card grid gap-4 rounded-lg p-6" role="status">
              <p className="brand-eyebrow">Word Reflection &amp; Repair</p>
              <h1 className="brand-lesson-title text-3xl font-semibold">Word repair saved</h1>
              <p className="text-base leading-7 text-[color:var(--mid)]">
                {lastTerminalRepair?.terminalOutcome === "repair_attempted_not_secured"
                  ? "That word will come back again soon. Let’s move to the next word."
                  : "That repair is saved. Let’s move to the next word."}
              </p>
              <button type="button" className="brand-primary-btn justify-self-start" disabled={submitting}
                onClick={() => void transition(() => props.gateway.beginRepair({
                  encounterId: nextEncounterId,
                  idempotencyKey: idempotencyKey(
                    session.reviewSession.snapshotFingerprint,
                    nextEncounterId,
                    "begin",
                  ),
                }))}>
                Next word
              </button>
            </section>
          </main>
        );
      }
      const repairCount = props.reviewSession.encounters.filter((encounter) => encounter.repairRequired).length;
      const failedAudioEncounters = props.reviewSession.encounters.filter((encounter) =>
        encounter.repairRequired && encounter.resultSource === "review_audio_check",
      );
      return (
        <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6">
          <header className="border-b border-[var(--border)] pb-5">
            <p className="brand-eyebrow">Writing Challenge</p>
            <h1 className="brand-lesson-title mt-1 text-3xl font-semibold">Target Word checks</h1>
          </header>
          {failedAudioEncounters.map((encounter) => {
            const failedTarget = props.snapshot.targets.find((candidate) =>
              candidate.encounterId === encounter.encounterId,
            );
            if (!failedTarget) return null;
            return (
              <section key={encounter.encounterId} className="brand-card grid gap-4 rounded-lg p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[color:var(--ink)]">Target Word {encounter.targetOrder}</p>
                  <TargetAudioButton
                    index={encounter.targetOrder - 1}
                    target={failedTarget}
                    onPlay={props.onPlayTargetAudio}
                  />
                </div>
                <label className="grid gap-2 text-sm font-semibold text-[color:var(--mid)]">
                  Spell this Target Word
                  <input
                    value={encounter.submittedAudioResponse ?? ""}
                    disabled
                    readOnly
                    spellCheck={false}
                    className="brand-input min-h-12 rounded-lg px-3 text-lg disabled:bg-[var(--mist)]"
                  />
                </label>
                <p className="font-semibold text-[color:var(--scarlett)]" role="status">This word needs Reflection &amp; Repair.</p>
                {encounter.governedCorrectSpellingReveal !== null ? (
                  <p className="text-sm text-[color:var(--ink)]">The word was: {encounter.governedCorrectSpellingReveal}</p>
                ) : null}
              </section>
            );
          })}
          <section className="rounded-lg border border-[var(--border)] bg-[var(--mist)] p-5" role="status">
            <p className="font-semibold text-[color:var(--ink)]">All original retrieval checks are locked.</p>
            <p className="mt-1 text-sm text-[color:var(--mid)]">
              {`${repairCount} ${repairCount === 1 ? "word is" : "words are"} ready for Reflection & Repair.`}
            </p>
          </section>
          {nextEncounterId ? (
            <button type="button" className="brand-primary-btn justify-self-start" disabled={submitting}
              onClick={() => void transition(() => props.gateway.beginRepair({
                encounterId: nextEncounterId,
                idempotencyKey: idempotencyKey(
                  session.reviewSession.snapshotFingerprint,
                  nextEncounterId,
                  "begin",
                ),
              }))}>
              {session.terminalRepairs.length > 0 ? "Continue to next word" : "Begin Word Reflection & Repair"}
            </button>
          ) : null}
          {message !== null ? <p className="text-sm text-[color:var(--scarlett)]" role="alert">{message}</p> : null}
        </main>
      );
    }
    const finalRepair = session.terminalRepairs.at(-1);
    return (
      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-6 sm:px-6">
        <section className="brand-card grid gap-3 rounded-lg p-6" role="status">
          <p className="brand-eyebrow">Word Reflection &amp; Repair</p>
          <h1 className="brand-lesson-title text-3xl font-semibold">Repairs saved</h1>
          <p className="text-base leading-7 text-[color:var(--mid)]">
            {finalRepair?.terminalOutcome === "repair_attempted_not_secured"
              ? "That word will come back again soon. Your work here is saved."
              : "Your repair work is saved and ready for the next Review step."}
          </p>
          <p className="text-sm text-[color:var(--mid)]">Review completion will be connected in R5.</p>
        </section>
      </main>
    );
  }
  const target = props.snapshot.targets.find((candidate) => candidate.encounterId === repair.encounterId);
  if (!target) return null;
  const targetSpelling = target.canonicalSpelling;
  const key = (transitionName: string) => idempotencyKey(
    session.reviewSession.snapshotFingerprint,
    repair.encounterId,
    transitionName,
  );
  const storedSelection = repair.trickyGraphemeStart !== null && repair.trickyGraphemeEnd !== null
    ? { start: repair.trickyGraphemeStart, end: repair.trickyGraphemeEnd }
    : null;
  const activeSelection = selection ?? storedSelection;
  const selectedText = activeSelection === null
    ? ""
    : segmentReviewGraphemes(targetSpelling)
      .slice(activeSelection.start, activeSelection.end)
      .map((grapheme) => grapheme.text)
      .join("");
  const reflectionRepair = repair;

  async function saveReflectionTrickyPart(nextSelection: { start: number; end: number }) {
    if (trickySaveInFlight.current || submitting || !["compare", "tricky_part"].includes(reflectionRepair.stage)) return;
    trickySaveInFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      if (reflectionRepair.stage === "compare") {
        const opened = await props.gateway.moveToTrickyPart({
          encounterId: reflectionRepair.encounterId,
          idempotencyKey: key("tricky"),
        });
        if (!opened.ok) throw new Error("repair_transition_conflict");
        setSession(opened.session);
      }
      const saved = await props.gateway.saveTrickySpan({
        encounterId: reflectionRepair.encounterId,
        graphemeStart: nextSelection.start,
        graphemeEnd: nextSelection.end,
        selectedText: segmentReviewGraphemes(targetSpelling)
          .slice(nextSelection.start, nextSelection.end)
          .map((grapheme) => grapheme.text)
          .join(""),
        idempotencyKey: key("span"),
      });
      if (!saved.ok) throw new Error(saved.code);
      setSession(saved.session);
    } catch {
      setMessage("That tricky part could not be saved. Please refresh and try again.");
    } finally {
      trickySaveInFlight.current = false;
      setSubmitting(false);
    }
  }

  function selectTrickyGrapheme(graphemeIndex: number) {
    setSelection((current) => {
      return current === null
        ? { start: graphemeIndex, end: graphemeIndex + 1 }
        : { start: Math.min(current.start, graphemeIndex), end: Math.max(current.end, graphemeIndex + 1) };
    });
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="brand-eyebrow">Word Reflection &amp; Repair</p>
        <h1 className="brand-lesson-title mt-1 text-3xl font-semibold">Target Word {repair.targetOrder}</h1>
        {session.terminalRepairs.length > 0 ? (
          <p className="mt-2 text-sm text-emerald-800" role="status">Previous repair saved.</p>
        ) : null}
      </header>

      {["compare", "tricky_part", "memory_cue"].includes(repair.stage) && repair.correctSpellingReveal !== null ? (
        <section className="brand-card grid gap-5 rounded-lg p-5 sm:p-6">
          <div className="grid gap-4 border-b border-[var(--border)] pb-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-[color:var(--mid)]">You wrote:</p>
              <p className="mt-1 text-2xl text-[color:var(--ink)]">{repair.attemptedForm}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--mid)]">The word was:</p>
              <p className="mt-1 text-3xl font-semibold text-[color:var(--ink)]">{repair.correctSpellingReveal}</p>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--ink)]">Highlight the tricky part</h2>
            <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">Highlight the part of the correct word that you found tricky.</p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Choose a continuous tricky part"
            onBlur={(event) => {
              if (selection && !event.currentTarget.contains(event.relatedTarget)) {
                void saveReflectionTrickyPart(selection);
              }
            }}>
            {segmentReviewGraphemes(repair.correctSpellingReveal).map((grapheme) => {
              const selected = activeSelection !== null && grapheme.index >= activeSelection.start && grapheme.index < activeSelection.end;
              return (
                <button key={grapheme.index} type="button"
                  aria-pressed={selected}
                  aria-label={`Letter part ${grapheme.index + 1}`}
                  disabled={repair.stage === "memory_cue"}
                  className={`min-h-12 min-w-10 rounded border px-2 text-2xl font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.2)] ${selected ? "border-[#c17d00] bg-[#ffe394] text-[#6b3f00]" : "border-[var(--border)] bg-white text-[color:var(--ink)]"}`}
                  onClick={() => selectTrickyGrapheme(grapheme.index)}>
                  {grapheme.text}
                </button>
              );
            })}
          </div>
          {repair.availableExistingCue ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-950">Your previous Memory Cue</p>
              <p className="mt-1 text-base text-emerald-950">{repair.availableExistingCue.cueText}</p>
              <p className="mt-2 text-sm text-emerald-900">
                It belongs to the tricky part <strong>{repair.availableExistingCue.selectedText}</strong>. Choose that same part to keep this cue, or choose a new part and write a new cue.
              </p>
            </div>
          ) : null}
          {activeSelection ? <p className="text-sm text-[color:var(--mid)]">Selected: <strong>{selectedText}</strong></p> : null}
          {repair.stage !== "memory_cue" && selection ? (
            <p className="text-sm font-semibold text-[color:var(--mid)]" role="status">
              {submitting ? "Saving tricky part..." : "Tricky part selected."}
            </p>
          ) : null}
          <div className="border-t border-[var(--border)] pt-5">
            <h2 className="text-xl font-semibold text-[color:var(--ink)]">Create a personal Memory Cue</h2>
            <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">Find a fun way to remember this tricky part. Write a short memory cue for yourself below.</p>
          </div>
          {repair.stage === "memory_cue" && repair.availableExistingCue &&
            repair.availableExistingCue.graphemeStart === repair.trickyGraphemeStart &&
            repair.availableExistingCue.graphemeEnd === repair.trickyGraphemeEnd ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-950">Your existing Memory Cue</p>
                <p className="mt-1 text-base text-emerald-950">{repair.availableExistingCue.cueText}</p>
                <button type="button" className="brand-secondary-btn mt-3" disabled={submitting}
                  onClick={() => void transition(() => props.gateway.saveMemoryCue({
                    encounterId: repair.encounterId,
                    cueText: repair.availableExistingCue!.cueText,
                    retainCueVersionId: repair.availableExistingCue!.cueVersionId,
                    idempotencyKey: key("retain-cue"),
                  }))}>
                  Keep this cue
                </button>
              </div>
            ) : null}
          <label className="grid gap-2 text-sm font-semibold text-[color:var(--mid)]">
            My Memory Cue
            <textarea value={cueText} maxLength={240} spellCheck={false}
              onChange={(event) => setCueText(event.target.value)}
              onFocus={() => {
                if (selection && repair.stage !== "memory_cue") void saveReflectionTrickyPart(selection);
              }}
              className="brand-textarea min-h-28 resize-y rounded-lg p-3 text-base leading-7"
              placeholder="Write your own idea..." />
          </label>
          <CueIdeas />
          {repair.stage === "memory_cue" ? (
            <button type="button" className="brand-primary-btn justify-self-start"
              disabled={cueText.trim().length === 0 || submitting}
              onClick={() => void transition(() => props.gateway.saveMemoryCue({
                encounterId: repair.encounterId,
                cueText,
                idempotencyKey: key("save-cue"),
              }), () => setCueText(""))}>
              Save Memory Cue and continue
            </button>
          ) : null}
        </section>
      ) : null}

      {repair.stage === "look" && repair.correctSpellingReveal !== null && repair.cueVersionUsed &&
        repair.trickyGraphemeStart !== null && repair.trickyGraphemeEnd !== null ? (
          <section className="brand-card grid gap-5 rounded-lg p-5 sm:p-6">
            <div>
              <p className="brand-eyebrow">Look</p>
              <h2 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">
                {repair.attempts.length === 1 ? "Have another careful look." : "Study the word and your cue."}
              </h2>
            </div>
            {coveredRepairCycle !== `${repair.encounterId}:${repair.attempts.length}` ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--mist)] p-4">
                <p className="text-sm font-semibold text-[color:var(--mid)]">My Memory Cue</p>
                <p className="mt-1 text-lg text-[color:var(--ink)]">{repair.cueVersionUsed.cueText}</p>
              </div>
            ) : null}
            <TargetAudioButton index={repair.targetOrder - 1} target={target} onPlay={props.onPlayTargetAudio} />
            <CoverShutter
              key={`review-repair-cover-${repair.encounterId}-${repair.attempts.length}`}
              word={repair.correctSpellingReveal}
              splitPoints={[]}
              muted
              studyDisplay={(
                <HighlightedSpelling
                  spelling={repair.correctSpellingReveal}
                  start={repair.trickyGraphemeStart}
                  end={repair.trickyGraphemeEnd}
                  onDark
                />
              )}
              onStateChange={(state) => {
                if (state === "cover" || state === "write" || state === "check") {
                  setCoveredRepairCycle(`${repair.encounterId}:${repair.attempts.length}`);
                }
              }}
              onCovered={async () => {
                const covered = await props.gateway.moveToCover({
                  encounterId: repair.encounterId,
                  idempotencyKey: key(`cover-${repair.attempts.length + 1}`),
                });
                if (!covered.ok) throw new Error(covered.code);
                const ready = await props.gateway.moveToTryAgain({
                  encounterId: repair.encounterId,
                  idempotencyKey: key(`try-${repair.attempts.length + 1}`),
                });
                if (!ready.ok) {
                  setSession(covered.session);
                  throw new Error(ready.code);
                }
              }}
              onComplete={async (response) => {
                const result = await props.gateway.submitRepairRetry({
                  encounterId: repair.encounterId,
                  response,
                  idempotencyKey: key(`retry-${repair.attempts.length + 1}`),
                });
                if (!result.ok) throw new Error(result.code);
                setSession(result.session);
              }}
            />
          </section>
        ) : null}

      {repair.stage === "cover" && repair.cueVersionUsed ? (
        <section className="brand-card grid gap-5 rounded-lg p-5 sm:p-6">
          <div>
            <p className="brand-eyebrow">Cover</p>
            <h2 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">The spelling is hidden.</h2>
            <p className="mt-2 text-base leading-7 text-[color:var(--mid)]">Say your memory cue to yourself — or picture it in your head.</p>
          </div>
          <button type="button" className="brand-primary-btn justify-self-start" disabled={submitting}
            onClick={() => void transition(() => props.gateway.moveToTryAgain({
              encounterId: repair.encounterId,
              idempotencyKey: key(`try-${repair.attempts.length + 1}`),
            }))}>
            Continue to type
          </button>
        </section>
      ) : null}

      {repair.stage === "try_again" ? (
        <section className="brand-card grid gap-5 rounded-lg p-5 sm:p-6">
          <div>
            <p className="brand-eyebrow">Try Again</p>
            <h2 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">Spell this Target Word</h2>
          </div>
          <TargetAudioButton index={repair.targetOrder - 1} target={target} onPlay={props.onPlayTargetAudio} />
          <CoverShutter
            key={`review-repair-resume-${repair.encounterId}-${repair.attempts.length}`}
            word={target.canonicalSpelling}
            splitPoints={[]}
            initialState="write"
            muted
            onComplete={async (response) => {
              const result = await props.gateway.submitRepairRetry({
                encounterId: repair.encounterId,
                response,
                idempotencyKey: key(`retry-${repair.attempts.length + 1}`),
              });
              if (!result.ok) throw new Error(result.code);
              setSession(result.session);
            }}
          />
        </section>
      ) : null}

      {message ? <p className="text-sm text-[color:var(--scarlett)]" role="alert">{message}</p> : null}
    </main>
  );
}
