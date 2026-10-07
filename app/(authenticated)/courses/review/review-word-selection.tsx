"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";

type Selection = ParentIdentifiedOccurrenceCandidate;
export type ReviewWritingHighlight = {
  fieldPath: string; start: number; end: number; observed: string; intended: string;
  kind: "spelling" | "context"; origin: "resolver" | "parent";
};
const ReviewSelection = createContext<{
  selected: Selection | null; setSelected: (value: Selection | null) => void;
  selectedText: string | null; setSelectedText: (value: string | null) => void;
} | null>(null);

export function ReviewWordSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  return <ReviewSelection.Provider value={{ selected, setSelected, selectedText, setSelectedText }}>{children}</ReviewSelection.Provider>;
}

export function useReviewWordSelection() {
  const value = useContext(ReviewSelection);
  if (!value) throw new Error("Review word selection is unavailable.");
  return value;
}

export function SelectableOriginalWriting({ text, fieldPath, occurrences, highlights, className }: {
  text: string; fieldPath: string; highlights: ReviewWritingHighlight[];
  occurrences: ParentIdentifiedOccurrenceCandidate[]; className: string;
}) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [added, setAdded] = useState<ReviewWritingHighlight[]>([]);
  const { setSelected, setSelectedText } = useReviewWordSelection();
  useEffect(() => {
    const onAdded = (event: Event) => {
      const highlight = (event as CustomEvent<{ highlight?: ReviewWritingHighlight }>).detail?.highlight;
      if (highlight?.fieldPath === fieldPath) setAdded((current) => [...current, highlight]);
    };
    window.addEventListener("review-word-added", onAdded);
    return () => window.removeEventListener("review-word-added", onAdded);
  }, [fieldPath]);
  function captureSelection() {
    const container = paragraph.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const chosen = selection.toString().trim();
    if (!chosen || /\s/u.test(chosen)) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(container);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length + selection.toString().length - selection.toString().trimStart().length;
    const exact = occurrences.find((item) => item.fieldPath === fieldPath && item.startUtf16 === start &&
      item.endUtf16 === start + chosen.length && item.observedText === chosen &&
      item.provenance === "learner_response" && text.slice(start, start + chosen.length) === chosen);
    setSelected(exact ?? null);
    setSelectedText(chosen);
  }
  const valid = [...highlights, ...added].filter((item) => item.fieldPath === fieldPath &&
    item.start >= 0 && item.end > item.start && item.end <= text.length &&
    text.slice(item.start, item.end) === item.observed);
  const boundaries = [...new Set([0, text.length, ...valid.flatMap((item) => [item.start, item.end])])]
    .sort((a, b) => a - b);
  const parts: ReactNode[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index], end = boundaries[index + 1];
    const matching = valid.filter((item) => item.start <= start && item.end >= end);
    if (!matching.length) { parts.push(text.slice(start, end)); continue; }
    const kind = matching.some((item) => item.kind === "context") ? "context" : "spelling";
    const parentAdded = matching.some((item) => item.origin === "parent");
    const label = matching.map((item) => `${item.kind === "context" ? "Context" : "Spelling"}: ${item.observed} → ${item.intended}${item.origin === "parent" ? " (added by parent)" : ""}`).join("; ");
    parts.push(<mark key={`${start}-${end}`} title={label} aria-label={label}
      className={`rounded px-0.5 text-[var(--ink)] ring-1 ${kind === "context"
        ? "bg-sky-200 ring-sky-500" : "bg-amber-100 ring-amber-400"}${parentAdded ? " underline decoration-2 underline-offset-2" : ""}`}>
      {text.slice(start, end)}
    </mark>);
  }
  return <p ref={paragraph} tabIndex={0} aria-label="Original writing. Select one word to fill Add Word."
    onMouseUp={captureSelection} onKeyUp={captureSelection} className={className}>
    {parts.length ? parts : text || "No written response on this submission."}
  </p>;
}
