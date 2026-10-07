"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  findAdleWritingOccurrences,
  type AdleWritingOccurrence,
} from "@/lib/adle/review-work/additional-spelling";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";

import { addAdleReviewParentSpellingCandidate } from "./actions";
import { addAdleReviewParentContextChoice } from "./actions/adle-review-work-actions";

export type AdleWritingHighlight = {
  start: number;
  end: number;
  label: string;
  tone: "success" | "repaired" | "not_secured" | "context";
};

export type AdleWritingIssuePickerAddInput = {
  observedSpelling: string;
  correctSpelling: string;
  positionStart: number;
  positionEnd: number;
};

export type AdleWritingIssuePickerAddResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

function renderHighlightedWriting(text: string, highlights: AdleWritingHighlight[]) {
  const sorted = [...highlights]
    .filter(
      (highlight) =>
        highlight.start >= 0 &&
        highlight.end > highlight.start &&
        highlight.end <= text.length,
    )
    .sort((left, right) => left.start - right.start);
  const safeHighlights = sorted.filter(
    (highlight, index) => index === 0 || highlight.start >= sorted[index - 1].end,
  );
  const parts: ReactNode[] = [];
  let cursor = 0;
  const tones = {
    success: "bg-emerald-100 decoration-emerald-500",
    repaired: "bg-amber-100 decoration-amber-500",
    not_secured: "bg-rose-100 decoration-rose-500",
    context: "bg-blue-100 decoration-blue-600",
  } as const;

  safeHighlights.forEach((highlight) => {
    if (highlight.start > cursor) parts.push(text.slice(cursor, highlight.start));
    parts.push(
      <mark
        key={`${highlight.start}-${highlight.end}`}
        title={highlight.label}
        aria-label={highlight.label}
        className={`rounded px-0.5 text-inherit underline decoration-2 underline-offset-2 ${tones[highlight.tone]}`}
      >
        {text.slice(highlight.start, highlight.end)}
      </mark>,
    );
    cursor = highlight.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function AdleWritingIssuePicker(props: {
  submittedWritingText: string;
  highlights: AdleWritingHighlight[];
  sourceId: string;
  childId: string;
  redirectPath: string;
  readOnly: boolean;
  onPreviewAdd?: (
    input: AdleWritingIssuePickerAddInput,
  ) => AdleWritingIssuePickerAddResult | Promise<AdleWritingIssuePickerAddResult>;
}) {
  const responseRef = useRef<HTMLParagraphElement>(null);
  const [observed, setObserved] = useState("");
  const [mode, setMode] = useState<"spelling" | "context">("spelling");
  const [correct, setCorrect] = useState("");
  const [selectedOccurrence, setSelectedOccurrence] = useState<AdleWritingOccurrence | null>(null);
  const [notice, setNotice] = useState<AdleWritingIssuePickerAddResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const occurrences = useMemo(
    () => findAdleWritingOccurrences(props.submittedWritingText, observed),
    [observed, props.submittedWritingText],
  );
  const effectiveSelected =
    selectedOccurrence &&
    occurrences.some(
      (occurrence) =>
        occurrence.start === selectedOccurrence.start &&
        occurrence.end === selectedOccurrence.end,
    )
      ? selectedOccurrence
      : occurrences.length === 1
        ? occurrences[0]
        : null;

  function captureSelection() {
    const container = responseRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const rawText = selection.toString();
    const selectedText = rawText.trim();
    if (!selectedText || /\s/.test(selectedText)) return;
    const leadingSpaceCount = rawText.length - rawText.trimStart().length;
    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(container);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    const start = prefixRange.toString().length + leadingSpaceCount;
    const occurrence = {
      start,
      end: start + selectedText.length,
      context: props.submittedWritingText.slice(
        Math.max(0, start - 28),
        Math.min(props.submittedWritingText.length, start + selectedText.length + 28),
      ),
    };
    setObserved(selectedText);
    setSelectedOccurrence(occurrence);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveSelected || !correct.trim() || submitting) return;

    const data = new FormData(event.currentTarget);
    data.set("__inline_add", "true");
    setSubmitting(true);
    try {
      const result = props.onPreviewAdd ? await props.onPreviewAdd({
        observedSpelling: observed,
        correctSpelling: correct,
        positionStart: effectiveSelected.start,
        positionEnd: effectiveSelected.end,
      }) : await (mode === "spelling" ? addAdleReviewParentSpellingCandidate(data)
        : addAdleReviewParentContextChoice(data));
      if (!result) return;
      setNotice(result);
      if (result.ok) {
        if ("added" in result && result.added) {
          window.dispatchEvent(new CustomEvent("review-word-added", { detail: { section: result.section } }));
        }
        setObserved("");
        setCorrect("");
        setSelectedOccurrence(null);
      }
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : "Could not add this word. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="min-w-0">
        <p className="text-sm leading-6 text-[var(--mid)]">
          Select one word in the immutable submitted writing. Target and context marks remain visible.
        </p>
        <p ref={responseRef} tabIndex={props.readOnly ? undefined : 0}
          aria-label="Original writing. Select one word to fill Add Word."
          onMouseUp={props.readOnly ? undefined : captureSelection}
          onKeyUp={props.readOnly ? undefined : captureSelection}
          className="mt-3 whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-white p-4 text-sm leading-7 text-[var(--ink)] selection:bg-pink-200">
          {renderHighlightedWriting(props.submittedWritingText, props.highlights)}
        </p>
      </div>
      {!props.readOnly ? <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <h3 className="font-semibold text-[var(--ink)]">Add Word</h3>
        <p className="mt-1 text-xs text-[var(--mid)]">Select a word, then enter the correction.</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--ink)]">
          <label><input type="radio" name="adle_add_word_mode" checked={mode === "spelling"} onChange={() => setMode("spelling")} /> Misspelling</label>
          <label><input type="radio" name="adle_add_word_mode" checked={mode === "context"} onChange={() => setMode("context")} /> Context</label>
        </div>
        <form onSubmit={handleSubmit}
          className="mt-4 grid gap-3">
          <input type="hidden" name="source_id" value={props.sourceId} />
          <input type="hidden" name="child_id" value={props.childId} />
          <input type="hidden" name="redirect_path" value={props.redirectPath} />
          <input type="hidden" name="position_start" value={effectiveSelected?.start ?? ""} />
          <input type="hidden" name="position_end" value={effectiveSelected?.end ?? ""} />
          <label className="grid gap-1 text-sm text-[var(--ink)]">Word in writing
            <input name="observed_spelling" value={observed} onChange={(event) => {
              setObserved(event.target.value); setSelectedOccurrence(null); setNotice(null);
            }} className="rounded-xl border border-[var(--border)] px-3 py-2" autoComplete="off" />
          </label>
          <label className="grid gap-1 text-sm text-[var(--ink)]">
            {mode === "context" ? "Intended word" : "Correct spelling"}
            <input name="correct_spelling" value={correct} onChange={(event) => setCorrect(event.target.value)}
              className="rounded-xl border border-[var(--border)] px-3 py-2" autoComplete="off" />
          </label>
          {occurrences.length > 1 ? <fieldset className="grid gap-2 rounded-xl border border-[var(--border)] p-3">
            <legend className="px-1 text-sm font-medium">Choose the exact occurrence</legend>
            {occurrences.map((occurrence) => <label key={`${occurrence.start}-${occurrence.end}`} className="flex gap-2 text-sm">
              <input type="radio" name="occurrence_choice"
                checked={effectiveSelected?.start === occurrence.start && effectiveSelected.end === occurrence.end}
                onChange={() => setSelectedOccurrence(occurrence)} />
              <span>…{occurrence.context}…</span>
            </label>)}
          </fieldset> : null}
          {mode === "context" && effectiveSelected ? <p className="rounded-xl bg-[var(--mist)] p-3 text-sm text-[var(--ink)]">
            <span className="font-medium">Sentence context: </span>
            {sentenceContext(props.submittedWritingText, effectiveSelected.start, effectiveSelected.end)?.text}
          </p> : null}
          {observed.trim() && !occurrences.length ? <p className="text-sm text-[var(--danger)]">
            That exact word does not occur in the submitted response.
          </p> : null}
          {notice ? <p role={notice.ok ? "status" : "alert"} className="text-sm text-[var(--ink)]">
            {notice.message ?? "Word added to review."}
          </p> : null}
          <button type="submit" className="brand-secondary-btn w-fit disabled:opacity-50"
            disabled={!effectiveSelected || !correct.trim() || submitting}>
            {submitting ? "Adding…" : "Add Word"}
          </button>
        </form>
      </div> : null}
    </div>
  );
}
