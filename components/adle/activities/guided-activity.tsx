"use client";

/**
 * ADLE Slice 7a (7a-A): the guided-practice step — where Slice 6 flattened ~19
 * template types into one naked "jot your answer" box. This renders each guided
 * item as a warm, template-specific prompt shell driven by the registry kind
 * and the composer-plumbed copy (childFacingCopy + purpose + teachingObjective).
 *
 * Data-honest Tier map: the content-dependent guided templates (PG/HOM/MOR/PAT/
 * INF/IRRE/SYL/SCHWA) are warm prompt shells until the structured content is
 * authored — a real teaching question + the word + audio + a free response,
 * never a bare box. HIDE_WRITE gets a show-then-hide affordance; MEMORY_CUE a
 * cue framing. The response stays local (guided practice carries no submitted
 * evidence — the frozen Slice 6 contract), so the shell upgrades to a richer
 * interaction without touching the server actions.
 */

import { useState } from "react";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { resolveActivityKind } from "./registry";
import { HearWordButton, GrownUpReveal } from "./shared/spelling-field";

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
  value: string;
  onChange: (value: string) => void;
}) {
  const { item } = props;
  const kind = resolveActivityKind({ templateKey: item.templateKey, sectionKey: item.sectionKey });
  const word = item.targetWord ?? "";
  const instruction = copyOf(item, "Talk this one through, then write your answer.");
  const purpose = purposeOf(item);
  const isHideWrite = item.templateKey === "HIDE_WRITE";
  const isMemoryCue = kind === "reflection";
  const [hidden, setHidden] = useState(false);

  const responsePlaceholder = isMemoryCue
    ? "Write a cue to help you remember it"
    : isHideWrite
      ? "Now spell it from memory"
      : "Say it out loud, then write your answer";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
      <p className="text-sm font-medium text-[color:var(--ink)]">{instruction}</p>

      {word !== "" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isHideWrite && hidden ? (
            <span className="rounded-lg bg-[color:var(--wash,#faf5f8)] px-3 py-1 text-sm italic text-[color:var(--mid)]">
              hidden — spell from memory
            </span>
          ) : (
            <span className="text-lg font-semibold tracking-wide text-[color:var(--scarlett)]">{word}</span>
          )}
          <HearWordButton word={word} label="Hear it" />
          {isHideWrite ? (
            <button
              type="button"
              onClick={() => setHidden((current) => !current)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)] transition hover:border-[color:var(--scarlett)]"
            >
              {hidden ? "Peek again" : "Hide it"}
            </button>
          ) : null}
        </div>
      ) : null}

      {purpose !== null ? <p className="mt-1 text-xs text-[color:var(--mid)]">{purpose}</p> : null}
      {isHideWrite && word !== "" ? <GrownUpReveal word={word} /> : null}

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
