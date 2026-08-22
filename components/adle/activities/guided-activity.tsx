"use client";

/**
 * Explicit compatibility renderer for the two typed-response contracts whose
 * historical learner semantics cannot be replaced by a rich interaction:
 * child-authored memory cues and already-persisted free-response activities.
 * Template keys never select this component; the compatibility normalizer must
 * provide the explicit variant through CanonicalActivityHost.
 */

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { HearWordButton } from "./shared/authored-audio";

function copyOf(item: AdleSessionItem, fallback: string): string {
  const copy = item.promptData.childFacingCopy;
  return typeof copy === "string" && copy.trim() !== "" ? copy : fallback;
}
function purposeOf(item: AdleSessionItem): string | null {
  const purpose = item.promptData.purpose;
  return typeof purpose === "string" && purpose.trim() !== "" ? purpose : null;
}

export function GuidedActivity(props: {
  item: AdleSessionItem;
  variant: "memory_cue" | "historical_free_response";
  value: string;
  onChange: (value: string) => void;
}) {
  const { item } = props;
  const word = item.targetWord ?? "";
  const instruction = copyOf(item, "Talk this one through, then write your answer.");
  const purpose = purposeOf(item);
  const isMemoryCue = props.variant === "memory_cue";

  const responsePlaceholder = isMemoryCue
    ? "Write a cue to help you remember it"
    : "Say it out loud, then write your answer";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
      <p className="text-sm font-medium text-[color:var(--ink)]">{instruction}</p>

      {word !== "" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tracking-wide text-[color:var(--scarlett)]">{word}</span>
          <HearWordButton word={word} label="Hear it" />
        </div>
      ) : null}

      {purpose !== null ? <p className="mt-1 text-xs text-[color:var(--mid)]">{purpose}</p> : null}
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={responsePlaceholder}
        className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-base focus:border-[color:var(--scarlett)] focus:outline-none"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
