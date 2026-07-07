"use client";

/**
 * ADLE Slice 7a (7a-A): the per-misspelling repair block — non-punitive and
 * never shaming (blueprint). Shows what the child wrote, the true word, the
 * memory cue from the skill's common_misconceptions, and a gentle "try again".
 * The retry stays local (Slice 6 contract: reflection is not submitted).
 */

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";

export function ReflectionActivity(props: {
  item: AdleSessionItem;
  priorAttempt: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { item } = props;
  const hint = item.promptData.misconceptionHint;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
      <p>
        You wrote <span className="font-semibold">{props.priorAttempt || "(nothing)"}</span> — the word is{" "}
        <span className="font-semibold">{item.targetWord}</span>.
      </p>
      {typeof hint === "string" && hint.trim() !== "" ? (
        <p className="mt-1 text-[color:var(--mid)]">💡 Memory cue: {hint}</p>
      ) : null}
      <label className="mt-2 block text-xs text-[color:var(--mid)]">Try it again — you&apos;ve got this.</label>
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-xl border border-amber-200 px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
