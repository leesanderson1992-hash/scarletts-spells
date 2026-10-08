"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReviewR6GatewayRequest } from "@/app/learn/week/adle/review-r6-actions";
import { AdlePlanHeader, AdleEmptyPlan, AdleReviewCompleteTransition } from "@/components/adle/adle-plan-presentation";
import { AdleSessionCelebration } from "@/components/adle/adle-session-celebration";
import { BaseWordFamilyGuidedLesson } from "@/components/adle/morphology/base-word-family-guided-lesson";
import { ReviewR6Session } from "@/components/adle/review/review-r6-session";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/base-word-family-preview-fixture";
import { REVIEW_R6_QA_API, REVIEW_R6_QA_ROUTE, REVIEW_R6_QA_SCENARIOS } from "@/lib/adle/review-v3/dev-r6-scenarios";
import type { ReviewR6QaState } from "@/lib/adle/review-v3/dev-r6-store";

/** Preserve the real AppShell visually, but keep its account/navigation controls inert in QA. */
export function ReviewR6QaBoundary(props: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<string | null>(null);
  return <div onClickCapture={(event) => {
    const element = event.target instanceof Element ? event.target : null;
    const link = element?.closest("a");
    const logout = element?.closest("button")?.textContent?.trim() === "Log out";
    if (logout || (link && !new URL(link.href).pathname.startsWith(REVIEW_R6_QA_ROUTE))) {
      event.preventDefault(); event.stopPropagation();
      setNotice("Account and app navigation are disabled in this isolated QA fixture.");
    }
  }} onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="border-b border-cyan-400/30 bg-slate-950 px-4 py-2 text-center text-xs text-cyan-100" role="note">
      LOCAL QA ONLY · Synthetic learner · No Production writes · Gate C remains inactive
      {notice ? <span className="block pt-1" role="status">{notice}</span> : null}
    </div>
    {props.children}
  </div>;
}

export function ReviewR6QaFixture(props: { initialState: ReviewR6QaState }) {
  const [state, setState] = useState(props.initialState);
  const [error, setError] = useState<string | null>(null);
  const [finishingLesson, setFinishingLesson] = useState(false);
  const checkpointQueue = useRef<Promise<unknown>>(Promise.resolve());
  const run = state.run;
  const send = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(REVIEW_R6_QA_API, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, run }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Local fixture request failed");
    return result;
  }, [run]);
  const refreshStage = useCallback(async () => {
    try {
      const response = await fetch(`${REVIEW_R6_QA_API}?run=${encodeURIComponent(run)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not reopen the local fixture");
      setState(await response.json());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Local fixture load failed"); }
  }, [run]);
  const gateway = useMemo(() => (request: ReviewR6GatewayRequest): Promise<unknown> => send({ command: "review", request }), [send]);
  const saveCheckpoint = useCallback((checkpoint: unknown) => {
    checkpointQueue.current = checkpointQueue.current.then(() => send({ command: "specialist_checkpoint", checkpoint }));
    void checkpointQueue.current.catch(() => setError("The local specialist checkpoint could not be saved. Reopen this run before continuing."));
  }, [send]);
  const finishLesson = useCallback(async () => {
    setFinishingLesson(true);
    try {
      await checkpointQueue.current;
      await send({ command: "complete_specialist" });
      await refreshStage();
    } catch { setError("The local specialist completion could not be saved."); }
    finally { setFinishingLesson(false); }
  }, [refreshStage, send]);
  const scenario = REVIEW_R6_QA_SCENARIOS.find((item) => item.id === state.scenario)!;

  return <section className="grid gap-4" data-testid="review-r6-integrated-qa" data-qa-stage={state.stage}>
    <details className="rounded-xl border border-cyan-300 bg-slate-950 p-3 text-cyan-50">
      <summary className="cursor-pointer text-sm font-semibold">QA controls · {scenario.label}</summary>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-2 text-sm">Controlled scenario
          <select className="min-h-11 rounded-lg bg-white p-2 text-slate-950" value={state.scenario}
            onChange={(event) => window.location.assign(`${REVIEW_R6_QA_ROUTE}?scenario=${event.target.value}`)}>
            {REVIEW_R6_QA_SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <p className="text-sm">{scenario.note}</p>
        <p className="text-xs">Reopen this exact URL to resume. Use “New run” to keep this run and start another. Fixture state is saved on this computer, not in Supabase.</p>
        <p className="text-xs">Parent-extension test passphrase: <code>qa-parent</code>. Do not enter any real password.</p>
        <p className="text-xs">Local completion receipts: {state.completionReceipts}. No reward or schedule writes are performed.</p>
        <a className="min-h-11 justify-self-start rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950" href={`${REVIEW_R6_QA_ROUTE}?scenario=${state.scenario}`}>New run of this scenario</a>
      </div>
    </details>
    <AdlePlanHeader planDate="2026-08-26" backPath={REVIEW_R6_QA_ROUTE} />
    {state.stage === "review" ? <ReviewR6Session
      assignmentId={state.snapshot.assignment.assignmentId} reviewSessionId={`dev-r6-session-${run}`} snapshot={state.snapshot}
      gateway={gateway} onStageRefresh={() => void refreshStage()} />
      : state.stage === "specialist_generation" ? <AdleReviewCompleteTransition>
        <button type="button" className="review-primary mt-5"
          onClick={() => void send({ command: "continue_specialist" }).then(refreshStage).catch(() => setError("Local lesson could not open."))}>Continue</button>
      </AdleReviewCompleteTransition>
      : state.stage === "specialist_lesson" ? <BaseWordFamilyGuidedLesson
        assignmentId={`dev-r6-specialist-${run}`} payload={BASE_WORD_FAMILY_PREVIEW_PAYLOAD}
        durableResumeState={state.specialistCheckpoint} onDurableResumeStateChange={saveCheckpoint}
        submitting={finishingLesson} onComplete={() => void finishLesson()} />
      : state.stage === "session_complete" ? <AdleSessionCelebration
        model={{ forgedTodayWords: [], goldenBarsToday: [], hasSomethingToCelebrate: false }} planDate="2026-08-26" backPath={REVIEW_R6_QA_ROUTE} />
      : <AdleEmptyPlan />}
    {error ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">{error}</p> : null}
  </section>;
}
