"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importTeachingDictionaryCsv, type CsvImportState } from "./actions";

const initial: CsvImportState = {};

export function CsvImportPanel({ overviewBatchCount }: { overviewBatchCount: number }) {
  const [state, action, pending] = useActionState(importTeachingDictionaryCsv, initial);
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
    <h2 className="text-lg font-semibold">Bulk review with CSV</h2>
    <p className="mt-2 text-sm">Download one Overview row per active word. The sheet has columns for word parts, joins, spelling changes, family choice and shared facts, with no JSON to write. Historical parts are suggestions marked for review.</p>
    <p className="mt-1 text-sm">The missing facts column shows what needs checking. Keep the word ID, source hashes, source family revision and export version unchanged.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Link prefetch={false} className="inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold" href="/admin/teaching-dictionary/export/overview">Export full Overview sheet</Link>
      {Array.from({ length: overviewBatchCount }, (_, index) => <Link key={index} prefetch={false}
        className="inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold"
        href={`/admin/teaching-dictionary/export/overview?batch=${index + 1}`}>
        Batch {index + 1}
      </Link>)}
    </div>
    <p className="mt-2 text-sm">Use the numbered batches for reimport. Each holds up to 500 words, leaving room under the upload limit as meanings and notes are completed.</p>
    <p className="mt-3 text-sm">Edit the CSV and reimport it below. Each changed word becomes a recoverable draft. Any row error stops the whole import so the batch can be reviewed together. Import does not grant evidence approval or publish lessons; review the drafts before publication.</p>
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">CSV file (up to 4 MB)<input type="file" name="dictionary_csv" accept=".csv,text/csv" required className="rounded-lg border border-[var(--border)] px-3 py-2" /></label><button disabled={pending} className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Importing…" : "Import drafts"}</button></form>
    {state.imported !== undefined && <p role="status" className="mt-3 text-sm">Imported {state.imported} changed words as drafts.
      {state.batchId && <> <Link className="font-semibold underline" href={`/admin/teaching-dictionary/imports/${state.batchId}`}>Review this import</Link></>}
    </p>}
    {state.error && <p role="alert" className="mt-3 text-sm text-rose-700">{state.error.replaceAll("_", " ")}</p>}
    {state.errors?.length ? <details className="mt-3 text-sm"><summary>{state.errorCount} row errors {state.errorCount! > state.errors.length ? `(first ${state.errors.length} shown)` : ""}</summary><ul className="mt-2 list-disc pl-5">{state.errors.map((error) => <li key={error}>{error}</li>)}</ul></details> : null}
  </section>;
}
