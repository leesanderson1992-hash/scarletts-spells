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
 * assignment_item_id. Quick sort stays local. Correctness is derived
 * server-side; the client submits raw attempt text only.
 */

import { useMemo, useState } from "react";

import {
  completeAdleLessonPartAction,
  completeAdleReviewPartAction,
} from "@/app/learn/week/adle/actions";
import {
  resolveActivityTemplateDefinition,
  type ActivityRendererKind,
} from "@/lib/adle/activity-template-registry";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";
import { IntroActivity } from "@/components/adle/activities/intro-activity";
import { QuickSortActivity } from "@/components/adle/activities/quick-sort-activity";
import { SpellingField } from "@/components/adle/activities/shared";
import { GuidedActivity } from "@/components/adle/activities/guided-activity";
import { ReflectionActivity } from "@/components/adle/activities/reflection-activity";

type AdleSessionRunnerProps = {
  childId: string;
  assignmentId: string;
  planDate: string;
  partOne: { items: AdleSessionItem[]; present: boolean; complete: boolean };
  partTwo: { items: AdleSessionItem[]; present: boolean; complete: boolean };
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

function ReviewPart(props: { childId: string; assignmentId: string; items: AdleSessionItem[] }) {
  const quickSort = itemsForRenderer(props.items, "review_quick_sort", ["quick_sort"])[0] ?? null;
  const production = itemsForRenderer(props.items, "review_production", ["dictation", "must_use_writing"]);
  const reflection = itemsForRenderer(props.items, "review_reflection", ["reflection"]);
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [retries, setRetries] = useState<Map<string, string>>(new Map());
  const [phase, setPhase] = useState<"sort" | "production" | "reflection">(quickSort ? "sort" : "production");

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

      {phase === "sort" && quickSort !== null ? (
        <div className="mt-3">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Quick sort</h2>
          <p className="mt-1 text-sm text-[color:var(--mid)]">
            Warm up by sorting — then start spelling; the words hide and are read to you.
          </p>
          <div className="mt-2">
            <QuickSortActivity item={quickSort} />
          </div>
          <NextButton label="Start spelling →" onClick={() => setPhase("production")} />
        </div>
      ) : null}

      {phase === "production" ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell your review words</h2>
          <p className="mt-1 text-xs text-[color:var(--mid)]">Press play to hear each word, then spell it — no peeking.</p>
          <div className="mt-2 grid gap-3">
            {production.map((item, index) => (
              <SpellingField
                key={item.id}
                word={item.targetWord ?? ""}
                value={attempts.get(item.canonicalWordId ?? "") ?? ""}
                onChange={(value) => setAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value))}
                label={`Word ${index + 1}`}
                sentenceContext={item.promptData.requiresSentenceContext === true}
              />
            ))}
          </div>
          <NextButton label="Check my words →" onClick={() => setPhase("reflection")} />
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
          <div className="mt-4 flex items-center gap-3">
            <button type="button" className="brand-secondary-btn" onClick={() => setPhase("production")}>
              Back
            </button>
            <button type="submit" className="brand-primary-btn flex-1">
              Finish Part 1 →
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function LessonPart(props: { childId: string; assignmentId: string; items: AdleSessionItem[] }) {
  const intro = itemsForRenderer(props.items, "lesson_intro", ["intro"]);
  const guided = itemsForRenderer(props.items, "guided_practice", ["guided_prompt", "dictation", "reflection"]);
  const production = itemsForRenderer(props.items, "lesson_production", ["dictation", "must_use_writing"]);
  const dictation = itemsForRenderer(props.items, "lesson_dictation", ["dictation"]);
  const probe = itemsForRenderer(props.items, "lesson_probe", ["dictation"])[0] ?? null;
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [dictationAttempts, setDictationAttempts] = useState<Map<string, string>>(new Map());
  const [probeAttempts, setProbeAttempts] = useState<Map<string, string>>(new Map());
  const [guidedNotes, setGuidedNotes] = useState<Map<string, string>>(new Map());

  const introItem = intro.find((item) => rendererKindFor(item) === "intro") ?? null;
  const probeWords = useMemo(() => {
    const words = probe?.promptData.words;
    return Array.isArray(words)
      ? (words as { canonicalWordId?: string; targetWord?: string }[]).filter(
          (word) => typeof word.canonicalWordId === "string" && typeof word.targetWord === "string",
        )
      : [];
  }, [probe]);

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

      <form action={completeAdleLessonPartAction} className="mt-4">
        <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
        <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
        <input type="hidden" name="dictationAttempts" value={attemptsJson(dictationAttempts)} />
        <input type="hidden" name="probeAttempts" value={attemptsJson(probeAttempts)} />
        <input type="hidden" name="guidedAttempts" value={attemptsJson(guidedNotes)} />

        <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell all your lesson words</h2>
        <p className="mt-1 text-xs text-[color:var(--mid)]">Copy each word carefully — this one you can see.</p>
        <div className="mt-2 grid gap-3">
          {production.map((item) => (
            <SpellingField
              key={item.id}
              word={item.targetWord ?? ""}
              value={attempts.get(item.canonicalWordId ?? "") ?? ""}
              onChange={(value) => setAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value))}
              label="Copy and spell"
              reveal
            />
          ))}
        </div>

        {dictation.length > 0 ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-[color:var(--ink)]">Dictation — no peeking</h2>
            <p className="mt-1 text-xs text-[color:var(--mid)]">Press play to hear each word, then spell it.</p>
            <div className="mt-2 grid gap-3">
              {dictation.map((item, index) => (
                <SpellingField
                  key={item.id}
                  word={item.targetWord ?? ""}
                  value={dictationAttempts.get(item.canonicalWordId ?? "") ?? ""}
                  onChange={(value) =>
                    setDictationAttempts((current) => mapWith(current, item.canonicalWordId ?? "", value))
                  }
                  label={`Dictation word ${index + 1}`}
                  sentenceContext={item.promptData.requiresSentenceContext === true}
                />
              ))}
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
                <SpellingField
                  key={word.canonicalWordId}
                  word={word.targetWord ?? ""}
                  value={probeAttempts.get(word.canonicalWordId ?? "") ?? ""}
                  onChange={(value) =>
                    setProbeAttempts((current) => mapWith(current, word.canonicalWordId ?? "", value))
                  }
                  label={`Detective word ${index + 1}`}
                />
              ))}
            </div>
          </div>
        ) : null}

        <button type="submit" className="brand-primary-btn mt-4 w-full">
          Finish Part 2 →
        </button>
      </form>
    </section>
  );
}

export function AdleSessionRunner(props: AdleSessionRunnerProps) {
  const { partOne, partTwo } = props;

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
        <LessonPart childId={props.childId} assignmentId={props.assignmentId} items={partTwo.items} />
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
