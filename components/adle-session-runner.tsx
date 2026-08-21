"use client";

/**
 * ADLE Slice 7a (7a-A): the child session runner is now an orchestrator. It
 * owns the part/phase flow, the attempt maps, and submission — all byte-identical
 * to Slice 6 (same hidden fields, same server actions, correctness still decided
 * server-side) — and delegates every activity's rendering to a registry-driven
 * archetype component in components/adle/activities/. Slice 6 flattened almost
 * every template to a text box; the registry restores tailored, warm interactions
 * (and warm prompt shells where the structured content isn't authored yet).
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
import {
  resolveActivityTemplateDefinition,
  type ActivityRendererKind,
} from "@/lib/adle/activity-template-registry";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import { IntroActivity } from "@/components/adle/activities/intro-activity";
import { ColdWordRecall } from "@/components/adle/activities/shared/cold-word-recall";
import { CoverShutter } from "@/components/adle/activities/shared/cover-shutter";
import { SentenceDictation } from "@/components/adle/activities/shared/sentence-dictation";
import { GuidedActivity } from "@/components/adle/activities/guided-activity";
import { ReflectionActivity } from "@/components/adle/activities/reflection-activity";
import type { BaseWordFamilyLessonSnapshotV1 } from "@/lib/adle/morphology/base-word-family-payload";
import { ClosedCompoundGuidedLesson, CompoundWordGuidedLesson } from "@/components/adle/morphology/closed-compound-guided-lesson";
import {
  MeaningConnectionActivity,
  type MeaningConnectionTarget,
} from "@/components/adle/morphology/meaning-connection-activity";
import type { LessonRouteResolutionResult } from "@/lib/adle/composable-lesson/route-resolution";
import {
  extractSentenceTarget,
  resolveSentenceDictationContract,
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
  partOne: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  partTwo: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  routeResolution: Extract<
    LessonRouteResolutionResult,
    { status: "resolved_explicit" | "resolved_legacy" }
  >;
};

function itemsIn(items: readonly AdleSessionItem[], sectionKey: string): AdleSessionItem[] {
  return items.filter((item) => item.sectionKey === sectionKey);
}

function rendererKindFor(item: AdleSessionItem): ActivityRendererKind {
  return resolveActivityTemplateDefinition({
    templateKey: item.templateKey,
    sectionKey: item.sectionKey,
  }).rendererKind;
}

function itemsForRenderer(
  items: readonly AdleSessionItem[],
  sectionKey: string,
  rendererKinds: readonly ActivityRendererKind[],
): AdleSessionItem[] {
  return itemsIn(items, sectionKey).filter((item) => rendererKinds.includes(rendererKindFor(item)));
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
  const production = itemsForRenderer(props.items, "review_production", ["cold_word_recall", "must_use_writing"]);
  const reflection = itemsForRenderer(props.items, "review_reflection", ["reflection"]);
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

  const missed = production.filter((item) => {
    const attempt = attempts.get(item.canonicalWordId ?? "") ?? "";
    return !isAttemptCorrect(attempt, item.targetWord);
  });
  const reflectionForMissed = reflection.filter((item) =>
    missed.some((miss) => miss.canonicalWordId === item.canonicalWordId),
  );

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 1 · Review first</p>

      {phase === "production" ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell your review words</h2>
          <p className="mt-1 text-xs text-[color:var(--mid)]">Press play to hear each word, then spell it — no peeking.</p>
          <div className="mt-2 grid gap-3">
            {production.map((item, index) => {
              const wordId = item.canonicalWordId ?? "";
              return (
              <ColdWordRecall
                key={item.id}
                mode="scheduled_review"
                targetWord={item.targetWord ?? ""}
                audioText={typeof item.promptData.audioText === "string" ? item.promptData.audioText : undefined}
                value={attempts.get(wordId) ?? ""}
                locked={locked.has(wordId)}
                onValueChange={(value) => {
                  if (!locked.has(wordId)) setAttempts((current) => mapWith(current, wordId, value));
                }}
                onLock={() => setLocked((current) => setWith(current, wordId))}
                label={`Word ${index + 1}`}
              />
              );
            })}
          </div>
          {production.length > 0 && production.every((item) => locked.has(item.canonicalWordId ?? "")) ? (
            <NextButton label="Continue to review results →" onClick={() => setPhase("reflection")} />
          ) : (
            <p className="mt-3 text-center text-xs text-[color:var(--mid)]">Lock each answer before continuing.</p>
          )}
        </div>
      ) : null}

      {phase === "reflection" ? (
        <form action={completeAdleReviewPartAction} className="mt-4">
          <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
          <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
          <input type="hidden" name="reflectionAttempts" value={attemptsJson(retries)} />
          {reflectionForMissed.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ink)]">Let&apos;s fix the tricky ones together</h2>
              <div className="mt-2 grid gap-3">
                {reflectionForMissed.map((item) => (
                  <ReflectionActivity
                    key={item.id}
                    item={item}
                    priorAttempt={attempts.get(item.canonicalWordId ?? "") ?? ""}
                    value={retries.get(item.id) ?? ""}
                    onChange={(value) => setRetries((current) => mapWith(current, item.id, value))}
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
        </form>
      ) : null}
    </section>
  );
}

function meaningConnectionTarget(item: AdleSessionItem): MeaningConnectionTarget | null {
  const data = item.promptData;
  const nested = typeof data.meaningConnection === "object" && data.meaningConnection !== null
    ? data.meaningConnection as Record<string, unknown>
    : data;
  const definition = [nested.definition, nested.childFriendlyDefinition, nested.wholeWordMeaning]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!item.canonicalWordId || !item.targetWord || !definition) return null;
  const rawComponentMeanings = nested.componentMeanings;
  return {
    canonicalWordId: item.canonicalWordId,
    word: item.targetWord,
    ...(typeof nested.audioText === "string" ? { audioText: nested.audioText } : {}),
    definition,
    ...(Array.isArray(rawComponentMeanings)
      ? { componentMeanings: rawComponentMeanings.filter((value): value is string => typeof value === "string") }
      : {}),
    ...(typeof nested.componentToWholeRelationship === "string"
      ? { componentToWholeRelationship: nested.componentToWholeRelationship }
      : {}),
  };
}

function LessonPart(props: { childId: string; assignmentId: string; items: AdleSessionItem[] }) {
  const intro = itemsForRenderer(props.items, "lesson_intro", ["intro"]);
  const guided = itemsForRenderer(props.items, "guided_practice", ["guided_prompt", "reflection"]);
  const meaningMatch = itemsForRenderer(props.items, "guided_practice", ["meaning_match"]);
  const guidedCover = itemsForRenderer(props.items, "guided_practice", ["cover_check"]);
  const production = itemsForRenderer(props.items, "lesson_production", ["cover_check"]);
  const mustUseWriting = itemsForRenderer(props.items, "lesson_production", ["must_use_writing"]);
  const dictation = itemsForRenderer(props.items, "lesson_dictation", ["sentence_dictation"]);
  const probe = itemsForRenderer(props.items, "lesson_probe", ["cold_word_recall"])[0] ?? null;
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

  const introItem = intro.find((item) => rendererKindFor(item) === "intro") ?? null;
  const probeWords = useMemo(() => {
    const words = probe?.promptData.words;
    return Array.isArray(words)
      ? (words as { canonicalWordId?: string; targetWord?: string }[]).filter(
          (word) => typeof word.canonicalWordId === "string" && typeof word.targetWord === "string",
        )
      : [];
  }, [probe]);
  const dictationContracts = useMemo(
    () => new Map(dictation.map((item) => [
      item.id,
      resolveSentenceDictationContract(item.promptData, item.targetWord),
    ])),
    [dictation],
  );
  const meaningTargets = useMemo(
    () => meaningMatch.map(meaningConnectionTarget),
    [meaningMatch],
  );
  const hasGovernedMeaningTargets = meaningTargets.length > 0 && meaningTargets.every((target) => target !== null);
  const missingSentenceContracts = dictation.filter((item) => dictationContracts.get(item.id) === null);
  const readyToSubmit =
    production.every((item) => covered.has(item.id)) &&
    guidedCover.every((item) => guidedCovered.has(item.id)) &&
    dictation.every((item) => checkedSentences.has(item.id)) &&
    probeWords.every((word) => lockedProbes.has(word.canonicalWordId ?? "")) &&
    missingSentenceContracts.length === 0;

  return (
    <section className="brand-card mt-4 rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 2 · Today&apos;s lesson</p>

      {introItem !== null ? (
        <div className="mt-3">
          <IntroActivity item={introItem} />
        </div>
      ) : null}

      {guided.length > 0 ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Guided practice</h2>
          <div className="mt-2 grid gap-2">
            {guided.map((item) => (
              <GuidedActivity
                key={item.id}
                item={item}
                value={guidedNotes.get(item.id) ?? ""}
                onChange={(value) => setGuidedNotes((current) => mapWith(current, item.id, value))}
              />
            ))}
          </div>
        </div>
      ) : null}

      {meaningMatch.length > 0 ? (
        <div className="mt-4">
          {hasGovernedMeaningTargets ? (
            <MeaningConnectionActivity
              targets={meaningTargets as MeaningConnectionTarget[]}
              muted
              onComplete={({ connected }) => {
                setGuidedNotes((current) => {
                  const next = new Map(current);
                  for (const item of meaningMatch) next.set(item.id, connected.includes(item.canonicalWordId ?? "") ? "connected" : "");
                  return next;
                });
              }}
            />
          ) : (
            <section aria-label="Historical meaning activity compatibility" className="grid gap-2">
              {meaningMatch.map((item) => (
                <GuidedActivity key={item.id} item={item} value={guidedNotes.get(item.id) ?? ""} onChange={(value) => setGuidedNotes((current) => mapWith(current, item.id, value))} />
              ))}
            </section>
          )}
        </div>
      ) : null}

      {guidedCover.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {guidedCover.map((item, index) => (
            <CoverShutter
              key={item.id}
              word={item.targetWord ?? ""}
              splitPoints={[]}
              stepLabel={`Cover check ${index + 1} of ${guidedCover.length}`}
              muted
              onStateChange={(_, value) => setGuidedNotes((current) => mapWith(current, item.id, value))}
              onComplete={(value) => {
                setGuidedNotes((current) => mapWith(current, item.id, value));
                setGuidedCovered((current) => setWith(current, item.id));
              }}
            />
          ))}
        </div>
      ) : null}

      <form action={completeAdleLessonPartAction} className="mt-4">
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
            <CoverShutter
              key={item.id}
              word={item.targetWord ?? ""}
              splitPoints={[]}
              stepLabel={`Word ${index + 1} of ${production.length}`}
              muted
              onStateChange={(_, value) => setAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value))}
              onComplete={(value) => {
                setAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value));
                setCovered((current) => setWith(current, item.id));
              }}
            />
          ))}
        </div>

        {mustUseWriting.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {mustUseWriting.map((item) => (
              <GuidedActivity
                key={item.id}
                item={item}
                value={attempts.get(item.canonicalWordId ?? "") ?? ""}
                onChange={(value) => setAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value))}
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
                const contract = dictationContracts.get(item.id);
                if (!contract) return (
                  <p key={item.id} role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    This historical activity has no governed authored sentence and cannot be attempted safely. Ask a grown-up to refresh this lesson.
                  </p>
                );
                const wordId = item.canonicalWordId ?? "";
                return (
                  <SentenceDictation
                    key={item.id}
                    stepLabel={`Sentence ${index + 1} of ${dictation.length}`}
                    audioText={contract.audioText}
                    correctSentence={contract.sentence}
                    value={dictationSentenceAttempts.get(wordId) ?? ""}
                    checked={checkedSentences.has(item.id)}
                    onValueChange={(value) => {
                      if (!checkedSentences.has(item.id)) {
                        setDictationSentenceAttempts((current) => mapWith(current, wordId, value));
                      }
                    }}
                    onCheck={() => {
                      const raw = dictationSentenceAttempts.get(wordId) ?? "";
                      setDictationAttempts((current) => mapWith(current, wordId, extractSentenceTarget(raw, contract.targetTokenIndex)));
                      setCheckedSentences((current) => setWith(current, item.id));
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
                <ColdWordRecall
                  key={word.canonicalWordId}
                  mode="diagnostic_probe"
                  targetWord={word.targetWord ?? ""}
                  value={probeAttempts.get(word.canonicalWordId ?? "") ?? ""}
                  locked={lockedProbes.has(word.canonicalWordId ?? "")}
                  onValueChange={(value) => {
                    if (!lockedProbes.has(word.canonicalWordId ?? "")) {
                      setProbeAttempts((current) => mapWith(current, word.canonicalWordId ?? "", value));
                    }
                  }}
                  onLock={() => setLockedProbes((current) => setWith(current, word.canonicalWordId ?? ""))}
                  label={`Detective word ${index + 1}`}
                />
              ))}
            </div>
          </div>
        ) : null}

        <button type="submit" disabled={!readyToSubmit} className="brand-primary-btn mt-4 w-full disabled:opacity-40">
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
