"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";

type Selection = ParentIdentifiedOccurrenceCandidate;
const ReviewSelection = createContext<{
  selected: Selection | null; setSelected: (value: Selection | null) => void;
} | null>(null);

export function ReviewWordSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Selection | null>(null);
  return <ReviewSelection.Provider value={{ selected, setSelected }}>{children}</ReviewSelection.Provider>;
}

export function useReviewWordSelection() {
  const value = useContext(ReviewSelection);
  if (!value) throw new Error("Review word selection is unavailable.");
  return value;
}

export function SelectableOriginalWriting({ children, text, fieldPath, occurrences, className }: {
  children: ReactNode; text: string; fieldPath: string;
  occurrences: ParentIdentifiedOccurrenceCandidate[]; className: string;
}) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const { setSelected } = useReviewWordSelection();
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
    if (exact) setSelected(exact);
  }
  return <p ref={paragraph} onMouseUp={captureSelection} onKeyUp={captureSelection} className={className}>
    {children}
  </p>;
}
