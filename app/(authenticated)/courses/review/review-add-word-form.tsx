"use client";

import { useMemo, useState } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { normaliseParentIdentifiedOccurrenceWord } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { useReviewWordSelection } from "./review-word-selection";

export function ReviewAddWordForm(props: {
  spellingAction: (formData: FormData) => void | Promise<void>;
  contextAction: (formData: FormData) => void | Promise<void>;
  submissionId: string; redirectPath: string;
  occurrences: ParentIdentifiedOccurrenceCandidate[];
}) {
  const [mode, setMode] = useState<"spelling" | "context">("spelling");
  const [typed, setTyped] = useState("");
  const { selected, setSelected } = useReviewWordSelection();
  const observed = selected?.observedText ?? typed;
  const matches = useMemo(() => {
    const normalized = normaliseParentIdentifiedOccurrenceWord(observed);
    return normalized ? props.occurrences.filter((item) => item.provenance === "learner_response" &&
      normaliseParentIdentifiedOccurrenceWord(item.observedText) === normalized) : [];
  }, [observed, props.occurrences]);
  const chosen = selected && matches.some((item) => item.id === selected.id) ? selected
    : matches.length === 1 ? matches[0] : null;
  return <section className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
    <p className="text-sm font-medium text-[color:var(--ink)]">Add word</p>
    <p className="text-xs text-[color:var(--mid)]">Select one word in the original writing, or enter it and choose its exact occurrence.</p>
    <div className="flex gap-4 text-sm">
      <label><input type="radio" name="add_word_mode" checked={mode === "spelling"}
        onChange={() => setMode("spelling")} /> Spelling</label>
      <label><input type="radio" name="add_word_mode" checked={mode === "context"}
        onChange={() => setMode("context")} /> Context</label>
    </div>
    <form action={mode === "spelling" ? props.spellingAction : props.contextAction} className="grid gap-3">
      <input type="hidden" name="submission_id" value={props.submissionId} />
      <input type="hidden" name="redirect_path" value={props.redirectPath} />
      {chosen ? <input type="hidden" name="source_writing_occurrence_id" value={chosen.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Word in writing
          <input required name={mode === "spelling" ? "misspelled_word" : "observed_word"}
            value={observed} onChange={(event) => { setSelected(null); setTyped(event.target.value); }}
            className="rounded border border-[var(--border)] px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">Correction
          <input required name={mode === "spelling" ? "corrected_word" : "intended_word"}
            maxLength={60} className="rounded border border-[var(--border)] px-3 py-2" />
        </label>
      </div>
      {matches.length > 1 && !chosen ? <label className="grid gap-1 text-sm">Where it appeared
        <select required name="source_writing_occurrence_id" defaultValue="" key={observed}
          className="rounded border border-[var(--border)] px-3 py-2">
          <option value="" disabled>Choose occurrence</option>
          {matches.map((item, index) => <option key={item.id} value={item.id}>
            Occurrence {index + 1} · characters {item.startUtf16}–{item.endUtf16}
          </option>)}
        </select>
      </label> : null}
      {observed.trim() && matches.length === 0 ? <p className="text-xs text-[color:var(--mid)]">
        {mode === "spelling" ? "No indexed occurrence is available; spelling can still be reviewed."
          : "Choose an exact indexed occurrence for a contextual correction."}
      </p> : null}
      <button type="submit" disabled={mode === "context" && !chosen && matches.length === 0}
        className="brand-secondary-btn w-fit disabled:opacity-50">Add word</button>
    </form>
  </section>;
}
