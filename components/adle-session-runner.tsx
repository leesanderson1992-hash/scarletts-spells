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
  recordGenericV3CheckpointAction,
} from "@/app/learn/week/adle/actions";
import type {
  CanonicalActivityNormalizationResult,
  CanonicalActivitySpec,
} from "@/lib/adle/canonical-activity-spec";
import { normalizeGenericActivitySequence } from "@/lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import type {
  NormalizedLessonReflectionMistake,
  NormalizedLessonReflectionSentenceComparison,
} from "@/lib/adle/lesson-reflection";
import {
  CanonicalActivityHost,
  CanonicalActivityNormalizationBlockedState,
} from "@/components/adle/activities/canonical-renderer-registry";
import type { BaseWordFamilyLessonSnapshotV1 } from "@/lib/adle/morphology/base-word-family-payload";
import { ClosedCompoundGuidedLesson, CompoundWordGuidedLesson } from "@/components/adle/morphology/closed-compound-guided-lesson";
import type { LessonRouteResolutionResult } from "@/lib/adle/composable-lesson/route-resolution";
import {
  hydrateGenericV3CheckpointState,
  type GenericV3DurableCheckpoint,
} from "@/lib/adle/generic-v3-attempt-checkpoints";
import {
  extractCanonicalSentenceTarget,
  extractSentenceTarget,
  type CanonicalSentenceDictationTargetBinding,
} from "@/lib/adle/sentence-dictation-contract";

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
  snapshotFingerprint: string;
  durableGenericV3Enabled: boolean;
  durableGenericV3Checkpoints: readonly GenericV3DurableCheckpoint[];
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

function dictationTargetBinding(spec: CanonicalActivitySpec): CanonicalSentenceDictationTargetBinding {
  const value = spec.payload.targetBinding;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const binding = value as Record<string, unknown>;
    if (binding.kind === "token" && Number.isInteger(binding.tokenIndex)) {
      return { kind: "token", tokenIndex: Number(binding.tokenIndex) };
    }
    if (binding.kind === "span" && Number.isInteger(binding.startTokenIndex)
      && Number.isInteger(binding.endTokenIndexExclusive) && typeof binding.exactAnswer === "string") {
      return {
        kind: "span",
        startTokenIndex: Number(binding.startTokenIndex),
        endTokenIndexExclusive: Number(binding.endTokenIndexExclusive),
        exactAnswer: binding.exactAnswer,
      };
    }
  }
  return { kind: "token", tokenIndex: typeof spec.payload.targetTokenIndex === "number" ? spec.payload.targetTokenIndex : 0 };
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

function LessonPart(props: {
  childId: string;
  assignmentId: string;
  snapshotFingerprint: string;
  durableGenericV3Enabled: boolean;
  durableGenericV3Checkpoints: readonly GenericV3DurableCheckpoint[];
  items: AdleSessionItem[];
}) {
  const normalized = useMemo(() => normalizeGenericActivitySequence(props.items), [props.items]);
  const intro = specsFor(normalized, "lesson_intro", "INTRODUCTION")[0] ?? null;
  const memoryCues = specsFor(normalized, "guided_practice", "MEMORY_CUE", ["child_authored_cue"]);
  const meaningMatch = specsFor(normalized, "guided_practice", "MEANING_MATCH", ["component_clues", "word_to_definition"]);
  const historicalMeaning = specsFor(normalized, "guided_practice", "MEANING_MATCH", ["historical_free_response"]);
  const guidedCover = specsFor(normalized, "guided_practice", "COVER_CHECK", ["whole_word"]);
  const production = specsFor(normalized, "lesson_production", "COVER_CHECK", ["whole_word"]);
  const mustUseWriting = specsFor(normalized, "lesson_production", "FREE_WRITING", ["first_impression_transfer"]);
  const dictation = specsFor(normalized, "lesson_dictation", "DICTATION", ["whole_sentence"]);
  const probeWords = specsFor(normalized, "lesson_probe", "COLD_WORD_RECALL", ["diagnostic_probe"]);
  const lessonReflection = specsFor(normalized, "lesson_reflection", "LESSON_REFLECTION", ["standard_lesson_reflection"])[0] ?? null;
  const blockers = blockersFor(normalized, ["lesson_intro", "guided_practice", "lesson_production", "lesson_probe", "lesson_dictation", "lesson_reflection"]);
  const durableCover = useMemo(() => props.durableGenericV3Checkpoints.filter((entry) => entry.kind === "cover_check"), [props.durableGenericV3Checkpoints]);
  const durableDictation = useMemo(() => props.durableGenericV3Checkpoints.filter((entry) => entry.kind === "dictation"), [props.durableGenericV3Checkpoints]);
  const durableState = useMemo(() => hydrateGenericV3CheckpointState(props.durableGenericV3Checkpoints), [props.durableGenericV3Checkpoints]);
  const [attempts, setAttempts] = useState<Map<string, string>>(() => durableState.coverAttempts);
  const [dictationAttempts, setDictationAttempts] = useState<Map<string, string>>(() => durableState.dictationTargetAttempts);
  const [dictationSentenceAttempts, setDictationSentenceAttempts] = useState<Map<string, string>>(() => durableState.dictationSentenceAttempts);
  const [probeAttempts, setProbeAttempts] = useState<Map<string, string>>(new Map());
  const [guidedNotes, setGuidedNotes] = useState<Map<string, string>>(new Map());
  const [covered, setCovered] = useState<Set<string>>(() => durableState.coveredItemIds);
  const [guidedCovered, setGuidedCovered] = useState<Set<string>>(new Set());
  const [checkedSentences, setCheckedSentences] = useState<Set<string>>(() => durableState.checkedDictationItemIds);
  const [lockedProbes, setLockedProbes] = useState<Set<string>>(new Set());
  const [teachingComplete, setTeachingComplete] = useState(intro?.mode !== "teaching_page");
  const [teachingPageIndex, setTeachingPageIndex] = useState(0);
  const [reflectionResponse, setReflectionResponse] = useState("");
  const probeResumeKey = `adle:cold-word-recall:${props.assignmentId}:diagnostic-probe`;
  const firstImpressionResumeKey = `adle:generic-v3:${props.assignmentId}:${props.snapshotFingerprint}:first-impression`;

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
  useEffect(() => {
    if (intro?.mode !== "teaching_page" && lessonReflection === null) return;
    try {
      const raw = window.sessionStorage.getItem(firstImpressionResumeKey);
      if (!raw) return;
      const restored = JSON.parse(raw) as {
        teachingComplete?: unknown; teachingPageIndex?: unknown; reflectionResponse?: unknown;
        attempts?: unknown; dictationAttempts?: unknown; dictationSentenceAttempts?: unknown;
        guidedNotes?: unknown; covered?: unknown; guidedCovered?: unknown; checkedSentences?: unknown;
      };
      const stringMap = (value: unknown) => new Map(Array.isArray(value)
        ? value.filter((entry): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string")
        : []);
      const stringSet = (value: unknown) => new Set(Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : []);
      queueMicrotask(() => {
        if (typeof restored.teachingComplete === "boolean") setTeachingComplete(restored.teachingComplete);
        if (Number.isInteger(restored.teachingPageIndex) && Number(restored.teachingPageIndex) >= 0) setTeachingPageIndex(Number(restored.teachingPageIndex));
        if (typeof restored.reflectionResponse === "string") setReflectionResponse(restored.reflectionResponse);
        const restoredAttempts = stringMap(restored.attempts);
        const restoredDictationAttempts = stringMap(restored.dictationAttempts);
        const restoredSentenceAttempts = stringMap(restored.dictationSentenceAttempts);
        for (const entry of durableCover) restoredAttempts.set(entry.canonicalWordId, entry.attemptText);
        for (const entry of durableDictation) {
          restoredDictationAttempts.set(entry.canonicalWordId, entry.targetAttempt);
          restoredSentenceAttempts.set(entry.canonicalWordId, entry.attemptText);
        }
        setAttempts(restoredAttempts);
        setDictationAttempts(restoredDictationAttempts);
        setDictationSentenceAttempts(restoredSentenceAttempts);
        setGuidedNotes(stringMap(restored.guidedNotes));
        setCovered(new Set([...stringSet(restored.covered), ...durableCover.map((entry) => entry.assignmentItemId)]));
        setGuidedCovered(stringSet(restored.guidedCovered));
        setCheckedSentences(new Set([...stringSet(restored.checkedSentences), ...durableDictation.map((entry) => entry.assignmentItemId)]));
      });
    } catch {
      // Malformed ephemeral resume state is ignored; the governed snapshot remains authoritative.
    }
  }, [durableCover, durableDictation, firstImpressionResumeKey, intro?.mode, lessonReflection]);
  useEffect(() => {
    if (intro?.mode !== "teaching_page" && lessonReflection === null) return;
    window.sessionStorage.setItem(firstImpressionResumeKey, JSON.stringify({
      teachingComplete, teachingPageIndex, reflectionResponse,
      attempts: [...attempts], dictationAttempts: [...dictationAttempts],
      dictationSentenceAttempts: [...dictationSentenceAttempts], guidedNotes: [...guidedNotes],
      covered: [...covered], guidedCovered: [...guidedCovered], checkedSentences: [...checkedSentences],
    }));
  }, [attempts, checkedSentences, covered, dictationAttempts, dictationSentenceAttempts,
    firstImpressionResumeKey, guidedCovered, guidedNotes, intro?.mode, lessonReflection,
    reflectionResponse, teachingComplete, teachingPageIndex]);

  const meaningTargets = meaningMatch.flatMap((item) => Array.isArray(item.payload.targets) ? item.payload.targets : []);
  const readyToSubmit =
    blockers.length === 0 &&
    production.every((item) => covered.has(item.id)) &&
    guidedCover.every((item) => guidedCovered.has(item.id)) &&
    dictation.every((item) => checkedSentences.has(item.id)) &&
    probeWords.every((word) => lockedProbes.has(payloadString(word, "canonicalWordId")));

  const reflectionMistakes: NormalizedLessonReflectionMistake[] = production.flatMap((item) => {
    const wordId = payloadString(item, "canonicalWordId");
    const target = payloadString(item, "word") || payloadString(item, "targetWord");
    const sentenceActivity = dictation.find((candidate) => payloadString(candidate, "canonicalWordId") === wordId);
    const attempt = sentenceActivity ? dictationAttempts.get(wordId) ?? "" : attempts.get(wordId) ?? "";
    return isAttemptCorrect(attempt, target) ? [] : [{ id: wordId, attempt, correctSpelling: target }];
  });
  const reflectionSentenceComparisons: NormalizedLessonReflectionSentenceComparison[] = dictation.flatMap((item) => {
    const wordId = payloadString(item, "canonicalWordId");
    const attempt = dictationSentenceAttempts.get(wordId) ?? "";
    const correct = payloadString(item, "correctSentence");
    return attempt.trim() === correct.trim() ? [] : [{ id: item.id, attempt, correct }];
  });

  if (intro?.mode === "teaching_page" && !teachingComplete) {
    return (
      <section className="brand-card mt-4 rounded-3xl p-4 md:p-5">
        <p className="brand-eyebrow">Part 2 · Today&apos;s lesson</p>
        <div className="mt-3">
          <CanonicalActivityHost
            spec={intro}
            runtimeProps={{
              initialPageIndex: teachingPageIndex,
              onPageChange: setTeachingPageIndex,
              onComplete: () => setTeachingComplete(true),
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="brand-card mt-4 rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 2 · Today&apos;s lesson</p>

      {intro !== null && intro.mode !== "teaching_page" ? (
        <div className="mt-3">
          <CanonicalActivityHost spec={intro} />
        </div>
      ) : null}

      {intro?.mode === "teaching_page" ? (
        <button type="button" onClick={() => setTeachingComplete(false)} className="mt-3 min-h-11 rounded-full border border-cyan-700/30 px-4 text-sm font-bold text-cyan-950">
          Reread lesson pages
        </button>
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
              key={`${item.id}:${guidedCovered.has(item.id) ? "checked" : "active"}`}
              spec={item}
              runtimeProps={{
                stepLabel: `Cover check ${index + 1} of ${guidedCover.length}`,
                muted: true,
                initialState: guidedCovered.has(item.id) ? "check" : undefined,
                initialAttempt: guidedNotes.get(item.id) ?? "",
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
        <input type="hidden" name="learningReflection" value={reflectionResponse} />

        <h2 className="text-sm font-semibold text-[color:var(--ink)]">Cover check</h2>
        <p className="mt-1 text-xs text-[color:var(--mid)]">Study each word, deliberately cover it, then spell it from memory.</p>
        <div className="mt-2 grid gap-3">
          {production.map((item, index) => (
            <CanonicalActivityHost
              key={`${item.id}:${covered.has(item.id) ? "checked" : "active"}`}
              spec={item}
              runtimeProps={{
                stepLabel: `Word ${index + 1} of ${production.length}`,
                muted: true,
                initialState: covered.has(item.id) ? "check" : undefined,
                initialAttempt: attempts.get(payloadString(item, "canonicalWordId")) ?? "",
                onContinue: () => undefined,
                onStateChange: (_: unknown, value: string) => setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value)),
                onComplete: async (value: string) => {
                  if (!props.durableGenericV3Enabled) {
                    setAttempts((current) => mapWith(current, payloadString(item, "canonicalWordId"), value));
                    setCovered((current) => setWith(current, item.id));
                    return;
                  }
                  const result = await recordGenericV3CheckpointAction({
                    childId: props.childId,
                    assignmentId: props.assignmentId,
                    itemId: item.id,
                    snapshotFingerprint: props.snapshotFingerprint,
                    kind: "cover_check",
                    attemptText: value,
                  });
                  if (!result.ok) throw new Error("That checked response is already frozen.");
                  setAttempts((current) => mapWith(current, result.checkpoint.canonicalWordId, result.checkpoint.attemptText));
                  setCovered((current) => setWith(current, result.checkpoint.assignmentItemId));
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
                const targetBinding = dictationTargetBinding(item);
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
                      onCheck: async () => {
                        const raw = dictationSentenceAttempts.get(wordId) ?? "";
                        if (!props.durableGenericV3Enabled) {
                          setDictationAttempts((current) => mapWith(current, wordId,
                            item.payload.targetBinding === undefined
                              ? extractSentenceTarget(raw, targetBinding.kind === "token" ? targetBinding.tokenIndex : 0)
                              : extractCanonicalSentenceTarget(raw, targetBinding)));
                          setCheckedSentences((current) => setWith(current, item.id));
                          return;
                        }
                        const result = await recordGenericV3CheckpointAction({
                          childId: props.childId,
                          assignmentId: props.assignmentId,
                          itemId: item.id,
                          snapshotFingerprint: props.snapshotFingerprint,
                          kind: "dictation",
                          attemptText: raw,
                        });
                        if (!result.ok) throw new Error("That checked response is already frozen.");
                        setDictationSentenceAttempts((current) => mapWith(current, result.checkpoint.canonicalWordId, result.checkpoint.attemptText));
                        setDictationAttempts((current) => mapWith(current, result.checkpoint.canonicalWordId, result.checkpoint.targetAttempt));
                        setCheckedSentences((current) => setWith(current, result.checkpoint.assignmentItemId));
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

        {lessonReflection && readyToSubmit ? (
          <div className="mt-4">
            <CanonicalActivityHost
              spec={lessonReflection}
              runtimeProps={{
                mistakes: reflectionMistakes,
                sentenceComparisons: lessonReflection.payload.sentenceComparison
                  && typeof lessonReflection.payload.sentenceComparison === "object"
                  && !Array.isArray(lessonReflection.payload.sentenceComparison)
                  && (lessonReflection.payload.sentenceComparison as Record<string, unknown>).enabled === true
                  ? reflectionSentenceComparisons
                  : undefined,
                response: reflectionResponse,
                onResponseChange: setReflectionResponse,
                completionType: "submit",
                completionLabel: "Finish Word Lab",
              }}
            />
          </div>
        ) : lessonReflection === null ? (
          <button type={blockers.length === 0 ? "submit" : "button"} disabled={!readyToSubmit} className="brand-primary-btn mt-4 w-full disabled:opacity-40">
            Finish Part 2 →
          </button>
        ) : (
          <p className="mt-4 text-center text-xs text-[color:var(--mid)]">Complete the lesson activities to unlock reflection.</p>
        )}
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
    return <CompoundWordGuidedLesson childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} resolvedLesson={runtime.resolvedLesson} />;
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
          <LessonPart childId={props.childId} assignmentId={props.assignmentId} snapshotFingerprint={props.snapshotFingerprint} durableGenericV3Enabled={props.durableGenericV3Enabled} durableGenericV3Checkpoints={props.durableGenericV3Checkpoints} items={partTwo.items} />
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
