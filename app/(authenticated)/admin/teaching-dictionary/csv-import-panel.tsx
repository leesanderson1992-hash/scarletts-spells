"use client";

import { useActionState } from "react";
import { importTeachingDictionaryCsv, type CsvImportState } from "./actions";

const initial: CsvImportState = {};

export function CsvImportPanel() {
  const [state, action, pending] = useActionState(importTeachingDictionaryCsv, initial);
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
    <h2 className="text-lg font-semibold">Import CSV as reviewable drafts</h2>
    <p className="mt-1 text-sm">Accepts dictionary columns such as normalised_word, definition, age_band and dictation_sentence, or the approved ADLE teaching-content CSV. Import never grants approval.</p>
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">CSV file<input type="file" name="dictionary_csv" accept=".csv,text/csv" required className="rounded-lg border border-[var(--border)] px-3 py-2" /></label><button disabled={pending} className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Importing…" : "Import drafts"}</button></form>
    {state.imported !== undefined && <p role="status" className="mt-3 text-sm">Imported {state.imported} drafts for review.</p>}
    {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error.replaceAll("_", " ")}</p>}
    {state.errors?.length ? <details className="mt-3 text-sm"><summary>{state.errors.length} row errors</summary><ul className="mt-2 list-disc pl-5">{state.errors.map((error) => <li key={error}>{error}</li>)}</ul></details> : null}
  </section>;
}
