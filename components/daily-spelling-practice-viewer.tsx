"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { DailySpellingPracticeReadItem } from "@/lib/writing-practice/daily-spelling-practice-read-model";

export type DailySpellingPracticeViewerItem = Pick<
  DailySpellingPracticeReadItem,
  | "id"
  | "targetWord"
  | "promptData"
  | "expectedAnswer"
  | "groupLabel"
  | "microSkillLabel"
  | "position"
  | "isSupportedForChildSurface"
>;

type DailySpellingPracticeViewerProps = {
  items: DailySpellingPracticeViewerItem[];
  backHref: string;
  dailyAssignmentId: string;
  practiceDate: string;
  childId: string;
  completeAction: (formData: FormData) => void | Promise<void>;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function getItemWord(item: DailySpellingPracticeViewerItem) {
  return (
    readString(item.targetWord) ??
    readString(item.promptData.targetWord) ??
    "Practice word"
  );
}

function getExpectedWord(item: DailySpellingPracticeViewerItem) {
  return (
    readString(item.expectedAnswer?.correctSpelling) ??
    readString(item.expectedAnswer?.targetWord) ??
    readString(item.expectedAnswer?.word) ??
    readString(item.targetWord) ??
    readString(item.promptData.targetWord)
  );
}

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase("en-GB");
}

export function DailySpellingPracticeViewer({
  items,
  backHref,
  dailyAssignmentId,
  practiceDate,
  childId,
  completeAction,
}: DailySpellingPracticeViewerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const supportedItems = useMemo(
    () =>
      [...items]
        .filter((item) => item.isSupportedForChildSurface)
        .sort((left, right) => left.position - right.position),
    [items],
  );
  const item = supportedItems[activeIndex] ?? null;
  const expectedWord = item ? getExpectedWord(item) : null;
  const answerFeedback =
    item && answer.trim() && expectedWord
      ? normalizeAnswer(answer) === normalizeAnswer(expectedWord)
        ? "Looks right here."
        : "Try it once more."
      : null;

  function moveTo(index: number) {
    setActiveIndex(index);
    setAnswer("");
  }

  if (supportedItems.length === 0 || !item) {
    return (
      <section className="brand-card rounded-3xl p-6">
        <p className="brand-eyebrow">Today&apos;s spelling practice</p>
        <h1 className="brand-title mt-2 text-2xl font-semibold">
          This practice item is not ready here yet.
        </h1>
        <Link href={backHref} className="brand-link mt-5 inline-flex text-sm font-medium">
          Back to this week
        </Link>
      </section>
    );
  }

  const practiceWords = readStringList(item.promptData.practiceWords);
  const instruction =
    readString(item.promptData.instruction) ?? "Write the word carefully.";
  const teachingPoint = readString(item.promptData.teachingPoint);
  const supportText = readString(item.promptData.supportText);
  const microSkillLabel =
    readString(item.promptData.microSkillLabel) ?? item.microSkillLabel;
  const isLastItem = activeIndex === supportedItems.length - 1;

  return (
    <section aria-label="Today's spelling practice" className="grid gap-5">
      <div className="brand-card rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="brand-eyebrow">Today&apos;s spelling practice</p>
            <h1 className="brand-title mt-2 text-2xl font-semibold">
              A few words to practise
            </h1>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
            {activeIndex + 1} of {supportedItems.length}
          </span>
        </div>
      </div>

      <article className="brand-card rounded-3xl p-6">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
            {item.groupLabel}
          </span>
          {microSkillLabel ? (
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
              {microSkillLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-6">
          <p className="brand-copy text-sm">{instruction}</p>
          <p className="mt-3 text-5xl font-semibold tracking-normal text-[color:var(--ink)]">
            {getItemWord(item)}
          </p>
        </div>

        {teachingPoint || supportText ? (
          <div className="mt-5 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
            {teachingPoint ? (
              <p className="text-sm text-[color:var(--ink)]">{teachingPoint}</p>
            ) : null}
            {supportText ? (
              <p className="mt-2 text-sm text-[color:var(--mid)]">{supportText}</p>
            ) : null}
          </div>
        ) : null}

        {practiceWords.length > 0 ? (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--mid)]">
              Ready for today
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {practiceWords.map((word) => (
                <span
                  key={word}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm font-medium text-[color:var(--ink)]"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <label className="mt-6 grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Try it here
          <input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="brand-input h-12 rounded-2xl px-4 text-lg"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {answerFeedback ? (
          <p className="mt-2 text-sm text-[color:var(--mid)]">{answerFeedback}</p>
        ) : null}
      </article>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="brand-link text-sm font-medium">
          Back to this week
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={activeIndex === 0}
            onClick={() => moveTo(Math.max(0, activeIndex - 1))}
            className="brand-secondary-btn disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          {isLastItem ? (
            <form action={completeAction}>
              <input type="hidden" name="mode" value="child" />
              <input type="hidden" name="childId" value={childId} />
              <input
                type="hidden"
                name="dailyAssignmentId"
                value={dailyAssignmentId}
              />
              <input type="hidden" name="practiceDate" value={practiceDate} />
              <button type="submit" className="brand-primary-btn">
                Done for today
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => moveTo(Math.min(supportedItems.length - 1, activeIndex + 1))}
              className="brand-primary-btn"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
