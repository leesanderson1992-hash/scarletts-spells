"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  findAdleWritingOccurrences,
  type AdleWritingOccurrence,
} from "@/lib/adle/review-work/additional-spelling";

import { addAdleReviewParentSpellingCandidate } from "./actions";

export type AdleWritingHighlight = {
  start: number;
  end: number;
  label: string;
  tone: "success" | "repaired" | "not_secured";
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
  } as const;

  safeHighlights.forEach((highlight) => {
    if (highlight.start > cursor) parts.push(text.slice(cursor, highlight.start));
    parts.push(
      <mark
        key={`${highlight.start}-${highlight.end}`}
        title={highlight.label}
        className={`rounded px-0.5 text-inherit underline decoration-2 underline-offset-2 ${tones[highlight.tone]}`}
      >
        {text.slice(highlight.start, highlight.end)}
        <span className="sr-only"> ({highlight.label})</span>
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

  async function handlePreviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!props.onPreviewAdd) return;
    event.preventDefault();
    if (!effectiveSelected || !correct.trim()) return;

    setSubmitting(true);
    try {
      const result = await props.onPreviewAdd({
        observedSpelling: observed,
        correctSpelling: correct,
        positionStart: effectiveSelected.start,
        positionEnd: effectiveSelected.end,
      });
      setNotice(result);
      if (result.ok) {
        setObserved("");
        setCorrect("");
        setSelectedOccurrence(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="brand-card rounded-3xl p-4 md:p-5">
        <p className="brand-eyebrow">Learner response</p>
        <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
          Immutable submitted writing
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
          Select a misspelled word to prefill the form. Green marks an originally correct Target Word, amber a repaired Target Word, and rose a Target Word not secured.
        </p>
        <p
          ref={responseRef}
          onMouseUp={props.readOnly ? undefined : captureSelection}
          className="mt-4 whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-white px-4 py-4 text-sm leading-7 text-[color:var(--ink)] selection:bg-sky-200"
        >
          {renderHighlightedWriting(props.submittedWritingText, props.highlights)}
        </p>
      </section>

      {!props.readOnly ? (
        <section className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Check the rest of the writing</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
            Add a missed spelling
          </h2>
          <form
            action={props.onPreviewAdd ? undefined : addAdleReviewParentSpellingCandidate}
            onSubmit={props.onPreviewAdd ? handlePreviewSubmit : undefined}
            className="mt-4 grid gap-3"
          >
            <input type="hidden" name="source_id" value={props.sourceId} />
            <input type="hidden" name="child_id" value={props.childId} />
            <input type="hidden" name="redirect_path" value={props.redirectPath} />
            <input type="hidden" name="position_start" value={effectiveSelected?.start ?? ""} />
            <input type="hidden" name="position_end" value={effectiveSelected?.end ?? ""} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                <span className="font-medium">Word child wrote</span>
                <input
                  name="observed_spelling"
                  value={observed}
                  onChange={(event) => {
                    setObserved(event.target.value);
                    setSelectedOccurrence(null);
                    setNotice(null);
                  }}
                  className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                <span className="font-medium">Correct spelling</span>
                <input
                  name="correct_spelling"
                  value={correct}
                  onChange={(event) => setCorrect(event.target.value)}
                  className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2"
                  autoComplete="off"
                />
              </label>
            </div>
            {occurrences.length > 1 ? (
              <fieldset className="grid gap-2 rounded-2xl border border-[var(--border)] bg-white p-3">
                <legend className="px-1 text-sm font-medium text-[color:var(--ink)]">
                  Choose the exact occurrence
                </legend>
                {occurrences.map((occurrence) => (
                  <label key={`${occurrence.start}-${occurrence.end}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="occurrence_choice"
                      checked={
                        effectiveSelected?.start === occurrence.start &&
                        effectiveSelected.end === occurrence.end
                      }
                      onChange={() => setSelectedOccurrence(occurrence)}
                      className="mt-1"
                    />
                    <span>…{occurrence.context}…</span>
                  </label>
                ))}
              </fieldset>
            ) : observed.trim() && occurrences.length === 0 ? (
              <p className="text-sm text-rose-700">
                That exact spelling does not occur in the submitted response.
              </p>
            ) : null}
            <p className="text-sm leading-6 text-[color:var(--mid)]">
              This adds a separate parent observation to the spelling table. It does not change the completed Review.
            </p>
            {notice ? (
              <p
                role={notice.ok ? "status" : "alert"}
                className={`rounded-2xl border px-3 py-2 text-sm ${
                  notice.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {notice.message ?? "Misspelling added to the review table."}
              </p>
            ) : null}
            <div>
              <button
                type="submit"
                className="brand-secondary-btn"
                disabled={!effectiveSelected || !correct.trim() || submitting}
              >
                {submitting ? "Adding…" : "Add misspelling"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
