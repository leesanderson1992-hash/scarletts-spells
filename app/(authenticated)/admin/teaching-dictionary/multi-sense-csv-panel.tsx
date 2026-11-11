"use client";

import { useActionState } from "react";
import { importReviewedMultiSenseCsv, type MultiSenseImportState } from "./multi-sense-actions";

export function MultiSenseCsvPanel({ wordId, batchCount = 0 }: { wordId?: string; batchCount?: number }) {
  const [state, action, pending] = useActionState(importReviewedMultiSenseCsv, {} as MultiSenseImportState);
  return <details className="mb-4 rounded-lg border border-[var(--border)] p-3 text-sm">
    <summary className="cursor-pointer font-semibold">{wordId ? "Export or import all meanings for this word" : "Bulk review word meanings"}</summary>
    <p className="mt-2">The sheet has one row per meaning, with its pronunciation, word parts, family relationship and requested micro-skills. Keep every existing meaning row when reimporting. A combined sheet may contain up to 100 complete words.</p>
    {wordId ? <a className="mt-2 inline-block rounded border border-[var(--border)] px-3 py-2 font-semibold"
      href={`/admin/teaching-dictionary/export/multi-sense?word_id=${wordId}`}>
      Download reviewed meanings sheet
    </a> : <div className="mt-2 flex flex-wrap gap-2">{Array.from({ length: batchCount }, (_, index) =>
      <a key={index} className="rounded border border-[var(--border)] px-3 py-2 font-semibold"
        href={`/admin/teaching-dictionary/export/multi-sense?batch=${index + 1}`}>
        Meanings batch {index + 1}
      </a>)}</div>}
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grid gap-1">Reviewed meanings CSV
        <input type="file" name="multi_sense_csv" accept=".csv,text/csv" required
          className="rounded border border-[var(--border)] px-3 py-2" />
      </label>
      <button disabled={pending} className="rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white disabled:opacity-50">
        {pending ? "Reviewing…" : "Import and review meanings"}
      </button>
    </form>
    {state.error && <p role="alert" className="mt-2 text-rose-800">{state.error}</p>}
    {state.reviewed !== undefined && <p role="status" className="mt-2">
      Reviewed {state.reviewed} meanings across {state.words} word{state.words === 1 ? "" : "s"}. {state.approved} requested micro-skill candidates approved.
      {state.pending?.length ? ` ${state.pending.length} requests need review.` : ""}
    </p>}
    {state.pending?.length ? <ul className="mt-1 list-disc pl-5">{state.pending.map(item => <li key={item}>{item}</li>)}</ul> : null}
  </details>;
}
