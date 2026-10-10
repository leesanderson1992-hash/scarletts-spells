"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importTeachingDictionaryCsv, type CsvImportState } from "./actions";

const initial: CsvImportState = {};

export function CsvImportPanel() {
  const [state, action, pending] = useActionState(importTeachingDictionaryCsv, initial);
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
    <h2 className="text-lg font-semibold">Bulk review with CSV</h2>
    <p className="mt-1 text-sm">Download every active word and its selected specialist routes. The missing facts column shows what to fill in. Keep the word ID and source hash columns unchanged.</p>
    <Link prefetch={false} className="mt-3 inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold" href="/admin/teaching-dictionary/export">Export all words and route facts</Link>
    <p className="mt-3 text-sm">Edit the CSV and reimport it below. Each word becomes one recoverable draft, even when it has several route rows. Import does not grant evidence approval or publish lessons; open a draft to review and publish it.</p>
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">CSV file (up to 4 MB)<input type="file" name="dictionary_csv" accept=".csv,text/csv" required className="rounded-lg border border-[var(--border)] px-3 py-2" /></label><button disabled={pending} className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Importing…" : "Import drafts"}</button></form>
    {state.imported !== undefined && <p role="status" className="mt-3 text-sm">Imported {state.imported} changed words as drafts.
      {state.batchId && <> <Link className="font-semibold underline" href={`/admin/teaching-dictionary/imports/${state.batchId}`}>Review this import</Link></>}
    </p>}
    {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error.replaceAll("_", " ")}</p>}
    {state.errors?.length ? <details className="mt-3 text-sm"><summary>{state.errorCount} row errors {state.errorCount! > state.errors.length ? `(first ${state.errors.length} shown)` : ""}</summary><ul className="mt-2 list-disc pl-5">{state.errors.map((error) => <li key={error}>{error}</li>)}</ul></details> : null}
  </section>;
}
