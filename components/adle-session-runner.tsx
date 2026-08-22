"use client";

/**
 * ADLE Slice 7a (7a-A): the child session runner is now an orchestrator. It
 * owns the part/phase flow, the attempt maps, and submission — all byte-identical
 * to Slice 6 (same hidden fields, same server actions, correctness still decided
 * server-side) — and delegates generic/historical rendering to the canonical
 * activity host. Supported historical keys normalize to versioned contracts;
 * missing rich pedagogy fails closed instead of degrading to a typed prompt.
 *
 * ADLE 7R evidence contract: production/dictation/probe attempts are keyed by
 * canonical_word_id; guided practice and reflection retries are keyed by
 * assignment_item_id. Historical QuickSort items are compatibility-only and
 * are deliberately ignored. Correctness is derived
 * server-side; the client submits raw attempt text only.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  completeAdleLessonPartAction,
  completeAdleReviewPartAction,
  completeBaseWordFamilyLessonAction,
} from "@/app/learn/week/adle/actions";
import type {
  CanonicalActivityNormalizationResult,
  CanonicalActivitySpec,
} from "@/lib/adle/canonical-activity-spec";
import { normalizeGenericActivitySequence } from "@/lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import {
  CanonicalActivityHost,
  CanonicalActivityNormalizationBlockedState,
} from "@/components/adle/activities/canonical-renderer-registry";
import type { BaseWordFamilyLessonSnapshotV1 } from "@/lib/adle/morphology/base-word-family-payload";
import { ClosedCompoundGuidedLesson, CompoundWordGuidedLesson } from "@/components/adle/morphology/closed-compound-guided-lesson";
import type { LessonRouteResolutionResult } from "@/lib/adle/composable-lesson/route-resolution";
import { extractSentenceTarget } from "@/lib/adle/sentence-dictation-contract";

const MorphologyGuidedLesson = dynamic(
  () =>
    import("@/components/adle/morphology/morphology-guided-lesson").then(
      (module) => module.MorphologyGuidedLesson,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]"
      >
        Preparing the Word Lab…
      </div>
    ),
  },
);

const BaseWordFamilyGuidedLesson = dynamic(
  () => import("@/components/adle/morphology/base-word-family-guided-lesson").then((module) => module.BaseWordFamilyGuidedLesson),
  { ssr: false, loading: () => <div role="status" aria-live="polite" className="brand-card rounded-3xl p-8 text-center text-sm text-[color:var(--mid)]">Preparing the base-word Word Lab…</div> },
);

type AdleSessionRunnerProps = {
  childId: string;
  assignmentId: string;
  planDate: string;
  partOne: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  partTwo: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  routeResolution: Extract<
    LessonRouteResolutionResult,
    { status: "resolved_explicit" | "resolved_legacy" }
  >;
};

type NormalizedActivity = Extract<CanonicalActivityNormalizationResult, { status: "normalized" | "compatibility" }>;

function normalizedActivities(results: readonly CanonicalActivityNormalizationResult[]): NormalizedActivity[] {
  return results.filter((result): result is NormalizedActivity => result.status !== "blocked");
}

function specsFor(
  results: readonly CanonicalActivityNormalizationResult[],
  sectionKey: string,
  concept: string,
  modes?: readonly string[],
): CanonicalActivitySpec[] {
  return normalizedActivities(results)
    .map((result) => result.spec)
    .filter((spec) => spec.source.sectionKey === sectionKey && spec.concept === concept && (!modes || modes.includes(spec.mode)));
}

function blockersFor(results: readonly CanonicalActivityNormalizationResult[], sectionKeys: readonly string[]) {
  return results.flatMap((result) => result.status === "blocked" && sectionKeys.includes(result.blocker.sectionKey) ? [result.blocker] : []);
}

function payloadString(spec: CanonicalActivitySpec, key: string): string {
  const value = spec.payload[key];
  return typeof value === "string" ? value : "";
}

function attemptsJson(attempts: ReadonlyMap<string, string>): string {
  return JSON.stringify([...attempts.entries()].map(([key, attemptText]) => ({ key, attemptText })));
}

function HiddenSessionFields(props: { childId: string; assignmentId: string }) {
  return (
    <>
      <input type="hidden" name="mode" value="child" />
      <input type="hidden" name="childId" value={props.childId} />
      <input type="hidden" name="assignmentId" value={props.assignmentId} />
    </>
  );
}

function NextButton(props: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="brand-primary-btn mt-4 w-full" onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function mapWith(current: Map<string, string>, key: string, value: string): Map<string, string> {
  return new Map(current).set(key, value);
}

function setWith(current: Set<string>, key: string): Set<string> {
  return new Set(current).add(key);
}

function parseColdRecallResume(value: string | null): { attempts: Map<string, string>; locked: Set<string> } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { attempts?: Array<[string, string]>; locked?: string[] };
    if (!Array.isArray(parsed.attempts) || !Array.isArray(parsed.locked)) return null;
    return {
      attempts: new Map(parsed.attempts.filter((entry) => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string")),
      locked: new Set(parsed.locked.filter((entry) => typeof entry === "string")),
    };
  } catch {
    return null;
  }
}

function BaseWordFamilyPart(props: { childId: string; assignmentId: string; payload: BaseWordFamilyLessonSnapshotV1 }) {
  const formRef = useRef<HTMLFormElement>(null);
  const controlledRef = useRef<HTMLInputElement>(null);
  const sentenceRef = useRef<HTMLInputElement>(null);
  const reflectionRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  return <form ref={formRef} action={completeBaseWordFamilyLessonAction}>
    <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
    <input ref={controlledRef} type="hidden" name="baseWordControlledAttempts" />
    <input ref={sentenceRef} type="hidden" name="baseWordSentenceAttempts" />
    <input ref={reflectionRef} type="hidden" name="baseWordReflection" />
    {submitting ? <p role="status" aria-live="polite" className="brand-card rounded-2xl p-4 text-center">Saving your Word Lab…</p> : null}
    <BaseWordFamilyGuidedLesson assignmentId={props.assignmentId} payload={props.payload} submitting={submitting} onComplete={(input) => {
      if (!controlledRef.current || !sentenceRef.current || !reflectionRef.current) return;
      controlledRef.current.value = JSON.stringify(Object.entries(input.controlledAttempts).map(([key, attemptText]) => ({ key, attemptText })));
      sentenceRef.current.value = JSON.stringify(Object.entries(input.sentenceAttempts).map(([key, attemptText]) => ({ key, attemptText })));
      reflectionRef.current.value = input.reflection;
      setSubmitting(true);
      requestAnimationFrame(() => formRef.current?.requestSubmit());
    }} />
  </form>;
}

function ReviewPart(props: { childId: string; assignmentId: string; items: AdleSessionItem[] }) {
  const normalized = useMemo(() => normalizeGenericActivitySequence(props.items), [props.items]);
  const production = specsFor(normalized, "review_production", "COLD_WORD_RECALL", ["scheduled_review"]);
  const writing = specsFor(normalized, "review_production", "FREE_WRITING", ["review_transfer"]);
  const reflection = specsFor(normalized, "review_reflection", "ERROR_REPAIR", ["reveal_hide_retry"]);
  const historicalNoops = specsFor(normalized, "review_quick_sort", "REVIEW_SORT", ["compatibility_noop"]);
  const blockers = blockersFor(normalized, ["review_quick_sort", "review_production", "review_reflection"]);
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [retries, setRetries] = useState<Map<string, string>>(new Map());
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"production" | "reflection">("production");
  const reviewResumeKey = `adle:cold-word-recall:${props.assignmentId}:scheduled-review`;

  useEffect(() => {
    const restored = parseColdRecallResume(window.sessionStorage.getItem(reviewResumeKey));
    if (!restored) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAttempts(restored.attempts);
      setLocked(restored.locked);
    });
    return () => { active = false; };
  }, [reviewResumeKey]);
  useEffect(() => {
    window.sessionStorage.setItem(reviewResumeKey, JSON.stringify({ attempts: [...attempts], locked: [...locked] }));
  }, [attempts, locked, reviewResumeKey]);

  const missed = [...production, ...writing].filter((item) => {
    const wordId = payloadString(item, "canonicalWordId");
    return !isAttemptCorrect(attempts.get(wordId) ?? "", payloadString(item, "targetWord"));
  });
  const reflectionForMissed = reflection.filter((item) =>
    missed.some((miss) => payloadString(miss, "canonicalWordId") === payloadString(item, "canonicalWordId")),
  );
  const reviewReady = blockers.length === 0
    && production.length + writing.length > 0
    && production.every((item) => locked.has(payloadString(item, "canonicalWordId")))
    && writing.every((item) => (attempts.get(payloadString(item, "canonicalWordId")) ?? "").trim().length > 0);

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 1 · Review first</p>
      {historicalNoops.map((item) => <CanonicalActivityHost key={item.id} spec={item} />)}

      {phase === "production" ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell your review words</h2>
          <p className="mt-1 text-xs text-[color:var(--mid)]">Press play to hear each word, then spell it — no peeking.</p>
          <div className="mt-2 grid gap-3">
            {production.map((item, index) => {
              const wordId = payloadString(item, "canonicalWordId");
              return (
              <CanonicalActivityHost
                key={item.id}
                spec={item}
                runtimeProps={{
                  mode: "scheduled_review",
                  value: attempts.get(wordId) ?? "",
                  locked: locked.has(wordId),
                  onValueChange: (value: string) => {
                    if (!locked.has(wordId)) setAttempts((current) => mapWith(current, wordId, value));
                  },
                  onLock: () => setLocked((current) => setWith(current, wordId)),
                  label: `Word ${index + 1}`,
                }}
              />
              );
            })}
            {writing.map((item) => (
              <CanonicalActivityHost
                key={item.id}
                spec={item}
                runtimeProps={{
                  value: attempts.get(payloadString(item, "canonicalWordId")) ?? "",
                  onChange: (value: string) => setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value)),
                }}
              />
            ))}
            {blockers.map((blocker) => <CanonicalActivityNormalizationBlockedState key={blocker.activityId} blocker={blocker} />)}
          </div>
          {reviewReady ? (
            <NextButton label="Continue to review results →" onClick={() => setPhase("reflection")} />
          ) : (
            <p className="mt-3 text-center text-xs text-[color:var(--mid)]">Lock each answer before continuing.</p>
          )}
        </div>
      ) : null}

      {phase === "reflection" ? (
        blockers.length === 0 ? <form action={completeAdleReviewPartAction} className="mt-4">
          <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
          <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
          <input type="hidden" name="reflectionAttempts" value={attemptsJson(retries)} />
          {reflectionForMissed.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ink)]">Let&apos;s fix the tricky ones together</h2>
              <div className="mt-2 grid gap-3">
                {reflectionForMissed.map((item) => (
                  <CanonicalActivityHost
                    key={item.id}
                    spec={item}
                    runtimeProps={{
                      priorAttempt: attempts.get(payloadString(item, "canonicalWordId")) ?? "",
                      value: retries.get(item.id) ?? "",
                      onChange: (value: string) => setRetries((current) => mapWith(current, item.id, value)),
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">All words correct — brilliant.</p>
          )}
          <div className="mt-4">
            <button type="submit" className="brand-primary-btn w-full">
              Finish Part 1 →
            </button>
          </div>
        </form> : <div className="mt-4 grid gap-3">{blockers.map((blocker) => <CanonicalActivityNormalizationBlockedState key={blocker.activityId} blocker={blocker} />)}</div>
      ) : null}
    </section>
  );
}

function LessonPart(props: { childId: string; assignmentId: string; items: AdleSessionItem[] }) {
  const normalized = useMemo(() => normalizeGenericActivitySequence(props.items), [props.items]);
  const intro = specsFor(normalized, "lesson_intro", "INTRODUCTION")[0] ?? null;
  const memoryCues = specsFor(normalized, "guided_practice", "MEMORY_CUE", ["child_authored_cue"]);
  const meaningMatch = specsFor(normalized, "guided_practice", "MEANING_MATCH", ["component_clues"]);
  const historicalMeaning = specsFor(normalized, "guided_practice", "MEANING_MATCH", ["historical_free_response"]);
  const guidedCover = specsFor(normalized, "guided_practice", "COVER_CHECK", ["whole_word"]);
  const production = specsFor(normalized, "lesson_production", "COVER_CHECK", ["whole_word"]);
  const mustUseWriting = specsFor(normalized, "lesson_production", "FREE_WRITING", ["first_impression_transfer"]);
  const dictation = specsFor(normalized, "lesson_dictation", "DICTATION", ["whole_sentence"]);
  const probeWords = specsFor(normalized, "lesson_probe", "COLD_WORD_RECALL", ["diagnostic_probe"]);
  const blockers = blockersFor(normalized, ["lesson_intro", "guided_practice", "lesson_production", "lesson_probe", "lesson_dictation"]);
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [dictationAttempts, setDictationAttempts] = useState<Map<string, string>>(new Map());
  const [dictationSentenceAttempts, setDictationSentenceAttempts] = useState<Map<string, string>>(new Map());
  const [probeAttempts, setProbeAttempts] = useState<Map<string, string>>(new Map());
  const [guidedNotes, setGuidedNotes] = useState<Map<string, string>>(new Map());
  const [covered, setCovered] = useState<Set<string>>(new Set());
  const [guidedCovered, setGuidedCovered] = useState<Set<string>>(new Set());
  const [checkedSentences, setCheckedSentences] = useState<Set<string>>(new Set());
  const [lockedProbes, setLockedProbes] = useState<Set<string>>(new Set());
  const probeResumeKey = `adle:cold-word-recall:${props.assignmentId}:diagnostic-probe`;

  useEffect(() => {
    const restored = parseColdRecallResume(window.sessionStorage.getItem(probeResumeKey));
    if (!restored) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setProbeAttempts(restored.attempts);
      setLockedProbes(restored.locked);
    });
    return () => { active = false; };
  }, [probeResumeKey]);
  useEffect(() => {
    window.sessionStorage.setItem(probeResumeKey, JSON.stringify({ attempts: [...probeAttempts], locked: [...lockedProbes] }));
  }, [lockedProbes, probeAttempts, probeResumeKey]);

  const meaningTargets = meaningMatch.flatMap((item) => Array.isArray(item.payload.targets) ? item.payload.targets : []);
  const readyToSubmit =
    blockers.length === 0 &&
    production.every((item) => covered.has(item.id)) &&
    guidedCover.every((item) => guidedCovered.has(item.id)) &&
    dictation.every((item) => checkedSentences.has(item.id)) &&
    probeWords.every((word) => lockedProbes.has(payloadString(word, "canonicalWordId")));

  return (
    <section className="brand-card mt-4 rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 2 · Today&apos;s lesson</p>

      {intro !== null ? (
        <div className="mt-3">
          <CanonicalActivityHost spec={intro} />
        </div>
      ) : null}

      {memoryCues.length > 0 ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Guided practice</h2>
          <div className="mt-2 grid gap-2">
            {memoryCues.map((item) => (
              <CanonicalActivityHost
                key={item.id}
                spec={item}
                runtimeProps={{
                  value: guidedNotes.get(item.id) ?? "",
                  onChange: (value: string) => setGuidedNotes((current) => mapWith(current, item.id, value)),
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {meaningMatch.length > 0 ? (
        <div className="mt-4">
          <CanonicalActivityHost
              spec={{ ...meaningMatch[0], id: `${meaningMatch[0].id}:group`, payload: { targets: meaningTargets } }}
              runtimeProps={{
                muted: true,
                onComplete: ({ connected }: { connected: string[] }) => {
                setGuidedNotes((current) => {
                  const next = new Map(current);
                  for (const item of meaningMatch) next.set(item.id, connected.includes(payloadString(item, "canonicalWordId")) ? "connected" : "");
                  return next;
                });
              }}}
            />
        </div>
      ) : null}

      {historicalMeaning.length > 0 ? (
        <section aria-label="Historical meaning activity compatibility" className="mt-4 grid gap-2">
          {historicalMeaning.map((item) => (
            <CanonicalActivityHost key={item.id} spec={item} runtimeProps={{ value: guidedNotes.get(item.id) ?? "", onChange: (value: string) => setGuidedNotes((current) => mapWith(current, item.id, value)) }} />
          ))}
        </section>
      ) : null}

      {guidedCover.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {guidedCover.map((item, index) => (
            <CanonicalActivityHost
              key={item.id}
              spec={item}
              runtimeProps={{
                stepLabel: `Cover check ${index + 1} of ${guidedCover.length}`,
                muted: true,
                onContinue: () => undefined,
                onStateChange: (_: unknown, value: string) => setGuidedNotes((current) => mapWith(current, item.id, value)),
                onComplete: (value: string) => {
                  setGuidedNotes((current) => mapWith(current, item.id, value));
                  setGuidedCovered((current) => setWith(current, item.id));
                },
              }}
            />
          ))}
        </div>
      ) : null}

      <form action={blockers.length === 0 ? completeAdleLessonPartAction : undefined} className="mt-4">
        <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
        <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
        <input type="hidden" name="dictationAttempts" value={attemptsJson(dictationAttempts)} />
        <input type="hidden" name="dictationSentenceAttempts" value={attemptsJson(dictationSentenceAttempts)} />
        <input type="hidden" name="probeAttempts" value={attemptsJson(probeAttempts)} />
        <input type="hidden" name="guidedAttempts" value={attemptsJson(guidedNotes)} />

        <h2 className="text-sm font-semibold text-[color:var(--ink)]">Cover check</h2>
        <p className="mt-1 text-xs text-[color:var(--mid)]">Study each word, deliberately cover it, then spell it from memory.</p>
        <div className="mt-2 grid gap-3">
          {production.map((item, index) => (
            <CanonicalActivityHost
              key={item.id}
              spec={item}
              runtimeProps={{
                stepLabel: `Word ${index + 1} of ${production.length}`,
                muted: true,
                onContinue: () => undefined,
                onStateChange: (_: unknown, value: string) => setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value)),
                onComplete: (value: string) => {
                  setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value));
                  setCovered((current) => setWith(current, item.id));
                },
              }}
            />
          ))}
        </div>

        {mustUseWriting.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {mustUseWriting.map((item) => (
              <CanonicalActivityHost
                key={item.id}
                spec={item}
                runtimeProps={{
                  value: attempts.get(payloadString(item, "canonicalWordId")) ?? "",
                  onChange: (value: string) => setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value)),
                }}
              />
            ))}
          </div>
        ) : null}

        {dictation.length > 0 ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-[color:var(--ink)]">Sentence dictation</h2>
            <p className="mt-1 text-xs text-[color:var(--mid)]">Hear the authored sentence, write the whole sentence, then lock and compare.</p>
            <div className="mt-2 grid gap-3">
              {dictation.map((item, index) => {
                const wordId = payloadString(item, "canonicalWordId");
                const targetTokenIndex = item.payload.targetTokenIndex;
                return (
                  <CanonicalActivityHost
                    key={item.id}
                    spec={item}
                    runtimeProps={{
                      stepLabel: `Sentence ${index + 1} of ${dictation.length}`,
                      value: dictationSentenceAttempts.get(wordId) ?? "",
                      checked: checkedSentences.has(item.id),
                      onContinue: () => undefined,
                      onValueChange: (value: string) => {
                        if (!checkedSentences.has(item.id)) setDictationSentenceAttempts((current) => mapWith(current, wordId, value));
                      },
                      onCheck: () => {
                        const raw = dictationSentenceAttempts.get(wordId) ?? "";
                        setDictationAttempts((current) => mapWith(current, wordId, extractSentenceTarget(raw, typeof targetTokenIndex === "number" ? targetTokenIndex : 0)));
                        setCheckedSentences((current) => setWith(current, item.id));
                      },
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {probeWords.length > 0 ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-[color:var(--ink)]">Detective words (probe)</h2>
            <p className="mt-1 text-sm text-[color:var(--mid)]">
              These are brand new — press play, have a go, it&apos;s fine not to know them yet.
            </p>
            <div className="mt-2 grid gap-3">
              {probeWords.map((word, index) => (
                <CanonicalActivityHost
                  key={word.id}
                  spec={word}
                  runtimeProps={{
                    mode: "diagnostic_probe",
                    value: probeAttempts.get(payloadString(word, "canonicalWordId")) ?? "",
                    locked: lockedProbes.has(payloadString(word, "canonicalWordId")),
                    onValueChange: (value: string) => {
                      const wordId = payloadString(word, "canonicalWordId");
                      if (!lockedProbes.has(wordId)) setProbeAttempts((current) => mapWith(current, wordId, value));
                    },
                    onLock: () => setLockedProbes((current) => setWith(current, payloadString(word, "canonicalWordId"))),
                    label: `Detective word ${index + 1}`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {blockers.length > 0 ? <div className="mt-4 grid gap-3">{blockers.map((blocker) => <CanonicalActivityNormalizationBlockedState key={blocker.activityId} blocker={blocker} />)}</div> : null}

        <button type={blockers.length === 0 ? "submit" : "button"} disabled={!readyToSubmit} className="brand-primary-btn mt-4 w-full disabled:opacity-40">
          Finish Part 2 →
        </button>
      </form>
    </section>
  );
}

export function AdleSessionRunner(props: AdleSessionRunnerProps) {
  const { partOne, partTwo } = props;
  const { runtime } = props.routeResolution;

  // A profile-declared closed-compound lesson is its own complete Word Lab.
  // It must not be hidden behind the generic daily review panel.
  if (runtime.adapterKey === "closed_compound_v1" && props.assignmentId && partTwo.present && !partTwo.complete) {
    return <ClosedCompoundGuidedLesson childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} payload={runtime.payload} />;
  }

  if (runtime.adapterKey === "compound_word_v2" && props.assignmentId && partTwo.present && !partTwo.complete) {
    return <CompoundWordGuidedLesson childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} payload={runtime.payload} />;
  }

  if (runtime.adapterKey === "base_word_family_v1" && props.assignmentId) {
    return <BaseWordFamilyPart childId={props.childId} assignmentId={props.assignmentId} payload={runtime.payload} />;
  }

  return (
    <div className="grid gap-4">
      {partOne.present && !partOne.complete ? (
        <ReviewPart childId={props.childId} assignmentId={props.assignmentId} items={partOne.items} />
      ) : null}

      {partOne.present && partOne.complete ? (
        <section className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Part 1 · Review first</p>
          <p className="mt-2 text-sm text-emerald-700">Review is done for today.</p>
        </section>
      ) : null}

      {partTwo.present && (partOne.complete || !partOne.present) && !partTwo.complete ? (
        runtime.rendererKey === "morphology_guided" ? (
          <MorphologyGuidedLesson childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} payload={runtime.payload} />
        ) : (
          <LessonPart childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} />
        )
      ) : null}

      {partTwo.present && !partOne.complete && partOne.present ? (
        <p className="text-sm text-[color:var(--mid)]">
          Today&apos;s lesson unlocks after the review — review always comes first.
        </p>
      ) : null}

      {partTwo.present && partTwo.complete ? (
        <section className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Part 2 · Today&apos;s lesson</p>
          <p className="mt-2 text-sm text-emerald-700">Lesson is done for today.</p>
        </section>
      ) : null}

      {!partTwo.present ? (
        <p className="text-sm text-[color:var(--mid)]">
          No new lesson today — review-only days are exactly how the plan is meant to work.
        </p>
      ) : null}
    </div>
  );
}
