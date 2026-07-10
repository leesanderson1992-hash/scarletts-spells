"use client";

/**
 * ADLE Slice 7a (7a-A): the per-misspelling repair block — non-punitive and
 * never shaming (blueprint). The true word is shown for teaching, then must be
 * hidden before the retry input appears so reflection evidence is recall, not
 * copy-from-screen.
 */

import { useState } from "react";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";

export function ReflectionActivity(props: {
  item: AdleSessionItem;
  priorAttempt: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { item } = props;
  const [isAnswerHidden, setIsAnswerHidden] = useState(false);
  const hint = item.promptData.misconceptionHint;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
      <p>
        You wrote <span className="font-semibold">{props.priorAttempt || "(nothing)"}</span> — the word is{" "}
        {isAnswerHidden ? (
          <span className="font-semibold text-[color:var(--mid)]">hidden for retry</span>
        ) : (
          <span className="font-semibold">{item.targetWord}</span>
        )}
      </p>
      {typeof hint === "string" && hint.trim() !== "" ? (
        <p className="mt-1 text-[color:var(--mid)]">💡 Memory cue: {hint}</p>
      ) : null}
      {isAnswerHidden ? (
        <>
          <label className="mt-2 block text-xs text-[color:var(--mid)]">
            Try it again — you&apos;ve got this.
          </label>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-xl border border-amber-200 px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
        </>
      ) : (
        <label
          className="mt-3 inline-flex cursor-pointer items-center gap-3 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-[color:var(--text)] shadow-sm"
        >
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-amber-100"
          >
            <span className="ml-1 h-4 w-4 rounded-full bg-[color:var(--scarlett)]" />
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={isAnswerHidden}
            onChange={(event) => setIsAnswerHidden(event.target.checked)}
            aria-label="Hide Word"
          />
          Hide Word
        </label>
      )}
    </div>
  );
}
