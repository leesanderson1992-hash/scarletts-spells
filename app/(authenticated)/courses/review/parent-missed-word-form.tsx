"use client";

import { useMemo, useState } from "react";

import type { ParentIdentifiedOccurrenceCandidate } from "@/lib/writing-engine/whole-writing/parent-identified-errors";
import { normaliseParentIdentifiedOccurrenceWord } from "@/lib/writing-engine/whole-writing/parent-identified-errors";

export function ParentMissedWordForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  submissionId: string;
  redirectPath: string;
  occurrences: ParentIdentifiedOccurrenceCandidate[];
}) {
  const [observedSpelling, setObservedSpelling] = useState("");
  const matches = useMemo(() => {
    const normalized =
      normaliseParentIdentifiedOccurrenceWord(observedSpelling);
    if (!normalized) return [];
    return props.occurrences.filter(
      (occurrence) =>
        occurrence.provenance === "learner_response" &&
        normaliseParentIdentifiedOccurrenceWord(occurrence.observedText) ===
          normalized,
    );
  }, [observedSpelling, props.occurrences]);

  return (
    <form
      action={props.action}
      className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
    >
      <input type="hidden" name="submission_id" value={props.submissionId} />
      <input type="hidden" name="redirect_path" value={props.redirectPath} />
      {matches.length === 1 ? (
        <input
          type="hidden"
          name="source_writing_occurrence_id"
          value={matches[0].id}
        />
      ) : null}
      <div>
        <p className="text-sm font-medium text-[color:var(--ink)]">
          Add missed word
        </p>
        <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
          Add the spelling the child used and the word they intended. Repeated
          spellings can be linked to the exact place in the submitted work.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Word child wrote</span>
          <input
            name="misspelled_word"
            type="text"
            value={observedSpelling}
            onChange={(event) => setObservedSpelling(event.target.value)}
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="eg becos"
            required
          />
        </label>
        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Intended word</span>
          <input
            name="corrected_word"
            type="text"
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            placeholder="eg because"
            required
          />
        </label>
      </div>
      {matches.length > 1 ? (
        <label className="grid gap-1 text-sm text-[color:var(--ink)]">
          <span className="font-medium">Where it appeared</span>
          <select
            name="source_writing_occurrence_id"
            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose the occurrence
            </option>
            {matches.map((occurrence, index) => (
              <option key={occurrence.id} value={occurrence.id}>
                Occurrence {index + 1} · {occurrence.fieldPath} · characters{" "}
                {occurrence.startUtf16}–{occurrence.endUtf16}
              </option>
            ))}
          </select>
          <span className="text-xs leading-5 text-[color:var(--mid)]">
            Each occurrence keeps its own correction and retry history.
          </span>
        </label>
      ) : null}
      {observedSpelling.trim() && matches.length === 0 ? (
        <p className="text-xs leading-5 text-[color:var(--mid)]">
          No exact indexed occurrence is available yet. The spelling can still
          be reviewed and retained for later enrichment.
        </p>
      ) : null}
      <div>
        <button className="brand-secondary-btn justify-center" type="submit">
          Add missed word
        </button>
      </div>
    </form>
  );
}
