"use client";

/**
 * ADLE Slice 6: functional child session runner — deliberately plain forms
 * (calm-UI polish is Slice 7's mandate). Renders the contract session shape:
 * Part 1 quick sort -> production -> per-misspelling reflection; Part 2
 * intro -> guided -> production of all words (+ dictation or probe).
 *
 * Dictation is audio, not visible text: the review words are shown only in
 * the quick-sort step, then hidden while the child spells, and each spelling
 * prompt plays the word aloud (Web Speech API) instead of showing it — so a
 * dictation tests recall, not copying. A collapsed grown-up reveal remains as
 * a fallback when device audio is unavailable. Controlled spelling ("copy and
 * spell") is a deliberate copy task and keeps the word visible.
 *
 * Correctness is decided server-side from raw attempt text; the local check
 * here only drives which reflection blocks show before submitting. Refreshing
 * mid-part loses in-part answers (part-level resume pin).
 */

import { useMemo, useState } from "react";

import {
  completeAdleLessonPartAction,
  completeAdleReviewPartAction,
} from "@/app/learn/week/adle/actions";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { isAttemptCorrect } from "@/lib/adle/session-correctness";

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

function attemptsJson(attempts: ReadonlyMap<string, string>): string {
  return JSON.stringify(
    [...attempts.entries()].map(([key, attemptText]) => ({ key, attemptText })),
  );
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

/** Audio dictation: play the word aloud with the browser's speech engine.
 * Feature-detected — silently no-ops if the device has no speech synthesis
 * (the grown-up reveal is then the fallback). */
function speakWord(word: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || word.trim() === "") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-GB";
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
}

function HearWordButton(props: { word: string }) {
  return (
    <button
      type="button"
      onClick={() => speakWord(props.word)}
      className="mt-1 inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[color:var(--ink)]"
    >
      🔊 Hear the word
    </button>
  );
}

/** Collapsed fallback so a grown-up can read the word aloud if the device has
 * no audio — parent-gated, so it does not let the child simply copy. */
function GrownUpReveal(props: { word: string }) {
  return (
    <details className="mt-1 text-xs text-[color:var(--mid)]">
      <summary className="cursor-pointer">No sound? Grown-up: tap to read the word aloud</summary>
      <span className="font-semibold">{props.word}</span>
    </details>
  );
}

function NextButton(props: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="brand-primary-btn mt-4 w-full" onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function ReviewPart(props: {
  childId: string;
  assignmentId: string;
  items: AdleSessionItem[];
}) {
  const quickSort = itemsIn(props.items, "review_quick_sort")[0] ?? null;
  const production = itemsIn(props.items, "review_production");
  const reflection = itemsIn(props.items, "review_reflection");
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [retries, setRetries] = useState<Map<string, string>>(new Map());
  const [phase, setPhase] = useState<"sort" | "production" | "reflection">(
    quickSort ? "sort" : "production",
  );

  const quickSortWords = useMemo(() => {
    const words = quickSort?.promptData.words;
    return Array.isArray(words)
      ? (words as { targetWord?: string; sortDimension?: string }[])
      : [];
  }, [quickSort]);

  const missed = production.filter((item) => {
    const attempt = attempts.get(item.canonicalWordId ?? "") ?? "";
    return !isAttemptCorrect(attempt, item.targetWord);
  });
  const reflectionForMissed = reflection.filter((item) =>
    missed.some((miss) => miss.canonicalWordId === item.canonicalWordId),
  );

  const setAttempt = (wordId: string, value: string) => {
    setAttempts((current) => new Map(current).set(wordId, value));
  };

  return (
    <section className="brand-card rounded-3xl p-4 md:p-5">
      <p className="brand-eyebrow">Part 1 · Review first</p>

      {phase === "sort" && quickSort !== null && quickSortWords.length > 0 ? (
        <div className="mt-3">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Quick sort</h2>
          <p className="mt-1 text-sm text-[color:var(--mid)]">
            Say each word&apos;s group out loud. When you&apos;re ready, start spelling — the
            words will be hidden and read to you.
          </p>
          <ul className="mt-2 grid gap-1 text-sm">
            {quickSortWords.map((word, index) => (
              <li key={index} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                <span className="font-medium">{word.targetWord}</span>
                <span className="text-[color:var(--mid)]"> — sort by {word.sortDimension}</span>
              </li>
            ))}
          </ul>
          <NextButton label="Start spelling →" onClick={() => setPhase("production")} />
        </div>
      ) : null}

      {phase === "production" ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell your review words</h2>
          <p className="mt-1 text-xs text-[color:var(--mid)]">
            Press play to hear each word, then spell it — no peeking.
          </p>
          <div className="mt-2 grid gap-3">
            {production.map((item, index) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                <label className="text-sm font-medium text-[color:var(--ink)]">
                  Word {index + 1}
                  {item.promptData.requiresSentenceContext === true
                    ? " — write it inside a sentence that shows what it means"
                    : ""}
                </label>
                <div>
                  <HearWordButton word={item.targetWord ?? ""} />
                </div>
                <GrownUpReveal word={item.targetWord ?? ""} />
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  value={attempts.get(item.canonicalWordId ?? "") ?? ""}
                  onChange={(event) => setAttempt(item.canonicalWordId ?? "", event.target.value)}
                />
              </div>
            ))}
          </div>
          <NextButton label="Check my words →" onClick={() => setPhase("reflection")} />
        </div>
      ) : null}

      {phase === "reflection" ? (
        <form action={completeAdleReviewPartAction} className="mt-4">
          <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
          <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
          {reflectionForMissed.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ink)]">
                Let&apos;s fix the tricky ones together
              </h2>
              <div className="mt-2 grid gap-3">
                {reflectionForMissed.map((item) => {
                  const attempt = attempts.get(item.canonicalWordId ?? "") ?? "";
                  const hint = item.promptData.misconceptionHint;
                  return (
                    <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                      <p>
                        You wrote <span className="font-semibold">{attempt || "(nothing)"}</span> — the word is{" "}
                        <span className="font-semibold">{item.targetWord}</span>.
                      </p>
                      {typeof hint === "string" && hint.trim() !== "" ? (
                        <p className="mt-1 text-[color:var(--mid)]">Memory cue: {hint}</p>
                      ) : null}
                      <label className="mt-2 block text-xs text-[color:var(--mid)]">
                        Try it again — what did you miss?
                      </label>
                      <input
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                        value={retries.get(item.canonicalWordId ?? "") ?? ""}
                        onChange={(event) =>
                          setRetries((current) =>
                            new Map(current).set(item.canonicalWordId ?? "", event.target.value),
                          )
                        }
                      />
                    </div>
                  );
                })}
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

function LessonPart(props: {
  childId: string;
  assignmentId: string;
  items: AdleSessionItem[];
}) {
  const intro = itemsIn(props.items, "lesson_intro");
  const guided = itemsIn(props.items, "guided_practice");
  const production = itemsIn(props.items, "lesson_production");
  const dictation = itemsIn(props.items, "lesson_dictation");
  const probe = itemsIn(props.items, "lesson_probe")[0] ?? null;
  const [attempts, setAttempts] = useState<Map<string, string>>(new Map());
  const [dictationAttempts, setDictationAttempts] = useState<Map<string, string>>(new Map());
  const [probeAttempts, setProbeAttempts] = useState<Map<string, string>>(new Map());
  const [guidedNotes, setGuidedNotes] = useState<Map<string, string>>(new Map());

  const introItem = intro.find((item) => item.templateKey === "MICRO_READ_ONLY_INTRO") ?? null;
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
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
          {typeof introItem.promptData.childFriendlyExplanation === "string" ? (
            <p>{introItem.promptData.childFriendlyExplanation}</p>
          ) : null}
          {typeof introItem.promptData.ruleExplanation === "string" ? (
            <p className="mt-1 text-[color:var(--mid)]">{introItem.promptData.ruleExplanation}</p>
          ) : null}
        </div>
      ) : null}

      {guided.length > 0 ? (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Guided practice</h2>
          <div className="mt-2 grid gap-2">
            {guided.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">{item.targetWord}</span>
                  <span className="text-[color:var(--mid)]"> — {item.templateKey.replaceAll("_", " ").toLowerCase()}</span>
                </p>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Talk it through, then jot your answer"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  value={guidedNotes.get(item.id) ?? ""}
                  onChange={(event) =>
                    setGuidedNotes((current) => new Map(current).set(item.id, event.target.value))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form action={completeAdleLessonPartAction} className="mt-4">
        <HiddenSessionFields childId={props.childId} assignmentId={props.assignmentId} />
        <input type="hidden" name="attempts" value={attemptsJson(attempts)} />
        <input type="hidden" name="dictationAttempts" value={attemptsJson(dictationAttempts)} />
        <input type="hidden" name="probeAttempts" value={attemptsJson(probeAttempts)} />

        <h2 className="text-sm font-semibold text-[color:var(--ink)]">Spell all your lesson words</h2>
        <p className="mt-1 text-xs text-[color:var(--mid)]">Copy each word carefully — this one you can see.</p>
        <div className="mt-2 grid gap-3">
          {production.map((item) => (
            <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
              <label className="text-sm font-medium text-[color:var(--ink)]">
                Copy and spell: <span className="font-semibold">{item.targetWord}</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                value={attempts.get(item.canonicalWordId ?? "") ?? ""}
                onChange={(event) =>
                  setAttempts((current) => new Map(current).set(item.canonicalWordId ?? "", event.target.value))
                }
              />
            </div>
          ))}
        </div>

        {dictation.length > 0 ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-[color:var(--ink)]">Dictation — no peeking</h2>
            <p className="mt-1 text-xs text-[color:var(--mid)]">Press play to hear each word, then spell it.</p>
            <div className="mt-2 grid gap-3">
              {dictation.map((item, index) => (
                <div key={item.id} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                  <label className="text-sm font-medium text-[color:var(--ink)]">
                    Dictation word {index + 1}
                    {item.promptData.requiresSentenceContext === true
                      ? " — write it inside a sentence"
                      : ""}
                  </label>
                  <div>
                    <HearWordButton word={item.targetWord ?? ""} />
                  </div>
                  <GrownUpReveal word={item.targetWord ?? ""} />
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    value={dictationAttempts.get(item.canonicalWordId ?? "") ?? ""}
                    onChange={(event) =>
                      setDictationAttempts((current) =>
                        new Map(current).set(item.canonicalWordId ?? "", event.target.value),
                      )
                    }
                  />
                </div>
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
                <div key={word.canonicalWordId} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                  <label className="text-sm font-medium text-[color:var(--ink)]">Detective word {index + 1}</label>
                  <div>
                    <HearWordButton word={word.targetWord ?? ""} />
                  </div>
                  <GrownUpReveal word={word.targetWord ?? ""} />
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    value={probeAttempts.get(word.canonicalWordId ?? "") ?? ""}
                    onChange={(event) =>
                      setProbeAttempts((current) =>
                        new Map(current).set(word.canonicalWordId ?? "", event.target.value),
                      )
                    }
                  />
                </div>
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
