"use client";

import { useEffect, useRef, useState } from "react";
import { HomophoneGuidedLesson } from "./homophone-guided-lesson";
import { persistAdleSpecialistCheckpointR6Action } from "@/app/learn/week/adle/review-r6-actions";
import { completeContextualHomophoneLessonAction } from "@/app/learn/week/adle/homophone-contextual-actions";
import type { FrozenConvergenceAssignment } from "@/lib/adle/homophone/convergence-assignment";
import { contextualProgressValid, initialContextualProgress, type ContextualProgressV1 } from "@/lib/adle/homophone/contextual-progress";

export function ContextualChoiceLesson(props: { assignmentId: string; childId: string;
  snapshot: FrozenConvergenceAssignment; snapshotFingerprint: string;
  checkpoint?: { checkpointPayload: { state?: unknown }; stateVersion: number } | null }) {
  const restored = props.checkpoint?.checkpointPayload.state;
  const validRestored = restored === undefined || contextualProgressValid(restored, props.snapshot);
  const [progress, setProgress] = useState<ContextualProgressV1>(validRestored && restored
    ? restored as ContextualProgressV1 : initialContextualProgress());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(validRestored ? null : "Your saved lesson needs a grown-up check.");
  const stateVersion = useRef(props.checkpoint?.stateVersion ?? 0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  function save(next: ContextualProgressV1): Promise<void> {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    const pending = chain.current.catch(() => undefined).then(async () => {
      const result = await persistAdleSpecialistCheckpointR6Action({ assignmentId: props.assignmentId,
        adapterKey: "homophone_contextual_v1", checkpointSchemaVersion: "homophone_contextual_progress_v1",
        lessonSnapshotFingerprint: props.snapshotFingerprint, checkpointPayload: { state: next },
        expectedStateVersion: stateVersion.current });
      stateVersion.current = result.stateVersion;
    });
    chain.current = pending;
    return pending;
  }
  if (error) return <div className="brand-card rounded-3xl p-8" role="alert">{error}</div>;
  if (progress.stage === "guided") return <HomophoneGuidedLesson
    snapshot={props.snapshot.guidedLesson} assignmentId={props.assignmentId} childId={props.childId}
    initialProgress={progress.guided}
    onProgress={guided => {
      if (guided.completed) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void save({ ...progress, guided }).catch(() => setError("Your lesson could not be saved. Please reload and try again."));
      }, 350);
    }}
    onCheckpoint={guided => save({ ...progress, guided })}
    onFinish={async guided => {
      setBusy(true);
      try {
        await save({ ...progress, guided: { ...guided, completed: false } });
        const next: ContextualProgressV1 = { ...progress, stage: "context_check", guided };
        await save(next);
        setProgress(next);
      } catch {
        setError("Your lesson could not be saved. Please reload and try again.");
        throw new Error("contextual_homophone_handoff_failed");
      } finally { setBusy(false); }
    }} />;

  const question = props.snapshot.contextCheck.questions[progress.responses.length];
  const selectedSet = props.snapshot.contextCheck.selectedSets.find(set => set.setId === question?.setId);
  const allAnswered = progress.responses.length === props.snapshot.contextCheck.questions.length;
  return <section className="brand-card mx-auto w-full max-w-4xl rounded-3xl p-5 text-center md:p-8" aria-label="Choose words in sentences">
    <p className="brand-eyebrow">Sentence check · {Math.min(progress.responses.length + 1, props.snapshot.contextCheck.questions.length)} of {props.snapshot.contextCheck.questions.length}</p>
    <h2 className="mt-2 text-2xl font-bold text-[color:var(--ink)]">Choose the word that fits the meaning</h2>
    <p className="mx-auto mt-3 max-w-2xl text-base text-[color:var(--mid)]">Read the whole sentence before you choose. Your first choice is saved.</p>
    {question && selectedSet ? <>
      <p className="mx-auto my-8 max-w-2xl rounded-3xl bg-amber-50 p-6 text-xl font-semibold leading-relaxed text-amber-950 md:text-2xl">{question.sentenceWithBlank}</p>
      <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-2">
        {question.optionWordIds.map(wordId => {
          const word = selectedSet.members.find(member => member.canonicalWordId === wordId)?.word;
          return <button key={wordId} type="button" disabled={busy || !word}
            className="rounded-2xl border-2 border-cyan-400 bg-cyan-50 px-5 py-4 text-xl font-bold text-cyan-950 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                const next = { ...progress, responses: [...progress.responses,
                  { questionId: question.questionId, selectedWordId: wordId }] };
                await save(next);
                setProgress(next);
              } catch { setError("Your choice could not be saved. Please reload and try again."); }
              finally { setBusy(false); }
            }}>{word}</button>;
        })}
      </div>
    </> : null}
    {allAnswered ? <button type="button" disabled={busy}
      className="brand-primary-btn mt-8 disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          const locked = { ...progress, responsesLocked: true };
          if (!progress.responsesLocked) await save(locked);
          await completeContextualHomophoneLessonAction({ assignmentId: props.assignmentId,
            snapshotFingerprint: props.snapshotFingerprint, progress: locked });
          window.location.reload();
        } catch { setError("Finish could not save yet. Please reload and try again."); }
        finally { setBusy(false); }
      }}>Finish lesson</button> : null}
  </section>;
}
