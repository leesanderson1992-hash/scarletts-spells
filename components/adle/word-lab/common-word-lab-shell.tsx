"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  CompiledWordLabSnapshotV1,
  WordLabActivityResultV1,
  WordLabCompletionEnvelopeV1,
  WordLabResumeEnvelopeV1,
} from "@/lib/adle/word-lab/contracts";
import { WORD_LAB_RESUME_SCHEMA_VERSION } from "@/lib/adle/word-lab/contracts";
import { validateWordLabResumeEnvelope, wordLabResumeKey } from "@/lib/adle/word-lab/resume";
import {
  COMMON_WORD_LAB_ACTIVITY_CONTRACTS,
  WordLabActivityHost,
} from "./activity-registry";

export function WordLabBlockedState(props: { message?: string }) {
  return (
    <section role="alert" className="brand-card mx-auto grid max-w-2xl gap-3 rounded-3xl p-8 text-center">
      <p className="brand-eyebrow">Word Lab paused</p>
      <h1 className="text-3xl font-black text-[color:var(--ink)]">This lesson needs a quick grown-up check.</h1>
      <p className="text-[color:var(--mid)]">
        {props.message ?? "Nothing has been scored or changed. Please ask your grown-up to try again later."}
      </p>
    </section>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function CommonWordLabShell(props: {
  snapshot: CompiledWordLabSnapshotV1;
  onComplete: (completion: WordLabCompletionEnvelopeV1) => void | Promise<void>;
}) {
  const activities = useMemo(() => [...props.snapshot.activities].sort((left, right) => left.order - right.order), [props.snapshot]);
  const unsupported = activities.find((activity) =>
    !COMMON_WORD_LAB_ACTIVITY_CONTRACTS.has(`${activity.kind}:v${activity.contractVersion}`),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<Record<string, WordLabActivityResultV1>>({});
  const [activityState, setActivityState] = useState<Record<string, unknown>>({});
  const [reflection, setReflection] = useState("");
  const [muted, setMuted] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reducedMotion = useReducedMotion();
  const current = activities[currentIndex];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(wordLabResumeKey(props.snapshot.assignmentId));
        if (saved) {
          const result = validateWordLabResumeEnvelope(JSON.parse(saved), props.snapshot);
          if (result.ok) {
            const index = activities.findIndex((activity) => activity.activityId === result.resume.currentActivityId);
            if (index >= 0) setCurrentIndex(index);
            setActivityState({ ...result.resume.activityState });
            setReflection(result.resume.reflection);
            setMuted(result.resume.muted);
            setCompleted(Object.fromEntries(result.resume.activityResults.map((activityResult) => [activityResult.activityId, activityResult])));
          } else {
            window.localStorage.removeItem(wordLabResumeKey(props.snapshot.assignmentId));
          }
        }
      } catch {
        // A corrupt or unavailable local store must never block a fresh lesson.
      } finally {
        setResumeLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activities, props.snapshot]);

  useEffect(() => {
    if (!resumeLoaded || !current) return;
    const resume: WordLabResumeEnvelopeV1 = {
      schemaVersion: WORD_LAB_RESUME_SCHEMA_VERSION,
      assignmentId: props.snapshot.assignmentId,
      snapshotFingerprint: props.snapshot.fingerprint,
      currentActivityId: current.activityId,
      completedActivityIds: Object.keys(completed).sort(),
      activityResults: Object.values(completed).sort((left, right) => left.activityId.localeCompare(right.activityId)),
      activityState,
      reflection,
      muted,
    };
    try {
      window.localStorage.setItem(wordLabResumeKey(props.snapshot.assignmentId), JSON.stringify(resume));
    } catch {
      // Resume is progressive enhancement; the active lesson remains usable.
    }
  }, [activityState, completed, current, muted, props.snapshot, reflection, resumeLoaded]);

  if (
    props.snapshot.schemaVersion !== "word_lab_snapshot_v1" ||
    props.snapshot.route.rendererKey !== "common_word_lab" ||
    activities.length === 0 || unsupported
  ) return <WordLabBlockedState />;

  const currentWords = current.wordSlotIds.map((slotId) => props.snapshot.words.find((word) => word.slotId === slotId)).filter((word): word is CompiledWordLabSnapshotV1["words"][number] => word !== undefined);
  const allRequiredComplete = activities.filter((activity) => activity.requiredForCompletion).every((activity) => completed[activity.activityId]?.completed);
  const reflectionReady = !props.snapshot.completion.requireReflection || reflection.trim().length > 0;

  async function finish() {
    if (!allRequiredComplete || !reflectionReady || submitting) return;
    setSubmitting(true);
    try {
      await props.onComplete({
        assignmentId: props.snapshot.assignmentId,
        snapshotFingerprint: props.snapshot.fingerprint,
        activityResults: activities.map((activity) => completed[activity.activityId]).filter((result): result is WordLabActivityResultV1 => result !== undefined),
        reflection,
      });
      try { window.localStorage.removeItem(wordLabResumeKey(props.snapshot.assignmentId)); } catch { /* Completion remains valid. */ }
    } finally {
      setSubmitting(false);
    }
  }

  const atFinishedStage = currentIndex === activities.length - 1 && Boolean(completed[current.activityId]);
  return (
    <main className="mx-auto grid max-w-4xl gap-5">
      <header className="brand-card grid gap-4 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="brand-eyebrow">Common Word Lab</p>
            <p className="font-black text-[color:var(--ink)]">Activity {Math.min(currentIndex + 1, activities.length)} of {activities.length}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="brand-secondary-btn" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button type="button" className="brand-secondary-btn" aria-expanded={helpVisible} onClick={() => setHelpVisible((value) => !value)}>
              Need a clue?
            </button>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-cyan-100" aria-label={`${Object.keys(completed).length} of ${activities.length} activities complete`}>
          <div className="h-full rounded-full bg-cyan-500 transition-[width] motion-reduce:transition-none" style={{ width: `${(Object.keys(completed).length / activities.length) * 100}%` }} />
        </div>
        {helpVisible ? <p className="rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-950">Take your time. Say the word, notice the important part, and try one small step.</p> : null}
      </header>

      <section className="brand-card rounded-3xl p-6 sm:p-8">
        {atFinishedStage ? (
          <div className="grid gap-5 text-center">
            <p className="brand-eyebrow">Ready to finish</p>
            <h2 className="text-3xl font-black text-[color:var(--ink)]">Your Word Lab is complete.</h2>
            <p className="text-[color:var(--mid)]">The server will check the lesson bindings before anything is saved.</p>
            <button type="button" className="brand-primary-btn mx-auto" disabled={!allRequiredComplete || !reflectionReady || submitting} onClick={finish}>
              {submitting ? "Checking…" : "Finish Word Lab"}
            </button>
          </div>
        ) : (
          <WordLabActivityHost
            key={current.activityId}
            activity={current}
            words={currentWords}
            initialState={activityState[current.activityId]}
            muted={muted}
            reducedMotion={reducedMotion}
            onStateChange={(state) => setActivityState((existing) => ({ ...existing, [current.activityId]: state }))}
            onReflectionChange={setReflection}
            onComplete={(result) => {
              setCompleted((existing) => ({ ...existing, [current.activityId]: result }));
              setCurrentIndex((index) => Math.min(index + 1, activities.length - 1));
            }}
          />
        )}
      </section>
    </main>
  );
}
