"use client";

import { useMemo, useState } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { normaliseParentIdentifiedOccurrenceWord } from "@/lib/writing-engine/whole-writing/parent-identified-errors";

export function ParentContextualMissForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  submissionId: string;
  occurrences: ParentIdentifiedOccurrenceCandidate[];
}) {
  const [observed, setObserved] = useState("");
  const matches = useMemo(() => {
    const normalized = normaliseParentIdentifiedOccurrenceWord(observed);
    if (!normalized) return [];
    return props.occurrences.filter((item) =>
      item.provenance === "learner_response" &&
      normaliseParentIdentifiedOccurrenceWord(item.observedText) === normalized);
  }, [observed, props.occurrences]);
  return <form action={props.action}
    className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
    <input type="hidden" name="submission_id" value={props.submissionId} />
    <p className="text-sm font-medium text-[color:var(--ink)]">Add missed contextual word choice</p>
    <p className="text-xs text-[color:var(--mid)]">Choose the exact place the child wrote a homophone or confusable word. Your correction creates a repair request; a new word pair is sent to No matching skill for Admin review.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-sm">Word child wrote
        <input name="observed_word" required value={observed} onChange={(event) => setObserved(event.target.value)}
          className="rounded border border-[var(--border)] px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">Intended word
        <input name="intended_word" required maxLength={60}
          className="rounded border border-[var(--border)] px-3 py-2" />
      </label>
    </div>
    {matches.length === 1 ? <input type="hidden" name="source_writing_occurrence_id" value={matches[0].id} /> : null}
    {matches.length > 1 ? <label className="grid gap-1 text-sm">Where it appeared
      <select name="source_writing_occurrence_id" required defaultValue=""
        className="rounded border border-[var(--border)] px-3 py-2">
        <option value="" disabled>Choose occurrence</option>
        {matches.map((item) => <option key={item.id} value={item.id}>
          {item.fieldPath} · characters {item.startUtf16}–{item.endUtf16}
        </option>)}
      </select>
    </label> : null}
    {observed.trim() && matches.length === 0 ? <p className="text-xs text-[color:var(--mid)]">No exact indexed occurrence is available for this word.</p> : null}
    <button type="submit" disabled={matches.length === 0}
      className="brand-secondary-btn w-fit disabled:opacity-50">Add contextual correction</button>
  </form>;
}
