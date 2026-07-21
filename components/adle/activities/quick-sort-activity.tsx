"use client";

/**
 * ADLE Slice 7a (7a-A): the quick-sort activation step.
 *
 * Data-honest Tier map: when the composer emits concrete `sortBins`
 * (single-family D4_SYL by syllable count, or D4_SCHWA by has_schwa) this is a
 * real tap-to-sort with gentle, non-punitive feedback. Otherwise it degrades to
 * a warm sort prompt (say each word's group aloud) — never a broken screen.
 *
 * Quick sort is activation only and carries no evidence: nothing here is
 * submitted, so it stays local and calm.
 */

import { useMemo, useState } from "react";

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { HearWordButton } from "./shared/spelling-field";

interface SortWord {
  canonicalWordId?: string;
  targetWord?: string;
  sortDimension?: string;
}
interface SortBins {
  dimensionLabel: string;
  bins: { key: string; label: string }[];
  correctBinByWordId: Record<string, string>;
}

function readWords(item: AdleSessionItem): SortWord[] {
  const words = item.promptData.words;
  return Array.isArray(words) ? (words as SortWord[]) : [];
}
function readBins(item: AdleSessionItem): SortBins | null {
  const bins = item.promptData.sortBins;
  if (bins && typeof bins === "object" && Array.isArray((bins as SortBins).bins)) {
    return bins as SortBins;
  }
  return null;
}

export function QuickSortActivity(props: { item: AdleSessionItem }) {
  const words = useMemo(() => readWords(props.item), [props.item]);
  const bins = useMemo(() => readBins(props.item), [props.item]);
  const instruction =
    typeof props.item.promptData.childFacingCopy === "string"
      ? props.item.promptData.childFacingCopy
      : "Sort these words before you spell them.";
  const [placed, setPlaced] = useState<Map<string, string>>(new Map());

  if (words.length === 0) {
    return null;
  }

  // Warm prompt fallback: no concrete scheme for this session's mix.
  if (bins === null) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
        <p className="text-sm font-medium text-[color:var(--ink)]">{instruction}</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {words.map((word, index) => (
            <li key={index} className="rounded-xl bg-[color:var(--wash,#faf5f8)] px-3 py-2">
              <span className="font-semibold">{word.targetWord}</span>
              {word.sortDimension ? (
                <span className="text-[color:var(--mid)]"> — say its group: {word.sortDimension}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const place = (wordId: string, binKey: string) => {
    setPlaced((current) => new Map(current).set(wordId, binKey));
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
      <p className="text-sm font-medium text-[color:var(--ink)]">{instruction}</p>
      <p className="mt-0.5 text-xs text-[color:var(--mid)]">Sort by {bins.dimensionLabel}. Tap a group for each word.</p>
      <div className="mt-3 grid gap-2">
        {words.map((word, index) => {
          const wordId = word.canonicalWordId ?? String(index);
          const chosen = placed.get(wordId) ?? null;
          const correct = bins.correctBinByWordId[wordId] ?? null;
          const isRight = chosen !== null && correct !== null && chosen === correct;
          return (
            <div key={wordId} className="rounded-xl bg-[color:var(--wash,#faf5f8)] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{word.targetWord}</span>
                <HearWordButton word={word.targetWord ?? ""} label="Hear it" />
                {chosen !== null ? (
                  <span className={`text-xs ${isRight ? "text-emerald-700" : "text-[color:var(--mid)]"}`}>
                    {isRight ? "nice sorting!" : "good thinking — have another look"}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bins.bins.map((bin) => {
                  const active = chosen === bin.key;
                  return (
                    <button
                      key={bin.key}
                      type="button"
                      onClick={() => place(wordId, bin.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-[color:var(--scarlett)] bg-[color:var(--scarlett)] text-white"
                          : "border-[var(--border)] bg-white text-[color:var(--ink)] hover:border-[color:var(--scarlett)]"
                      }`}
                    >
                      {bin.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
