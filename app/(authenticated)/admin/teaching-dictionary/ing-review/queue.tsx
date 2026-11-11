"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ING_REVIEW_COLUMNS, type IngInput } from "@/lib/teaching-dictionary-manager/ing-bulk-review";
import { applyIngReviewWord, editIngReview, openIngReview, previewIngReview, type ReviewBatchView } from "./actions";

const button = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = "rounded-lg bg-[var(--scarlett)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const control = "min-w-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm";
const card = "rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5";
type Row = ReviewBatchView["rows"][number];

function EditWord({ row, disabled, onSave }: { row: Row; disabled: boolean; onSave: (input: Partial<IngInput>) => void }) {
  const fields = [
    ["meaning", "Meaning"], ["ipa", "Pronunciation (IPA)"], ["syllables", "Spoken syllables"],
    ["stress", "Stress pattern"], ["sentence", "Dictation sentence"],
  ] as const;
  return <details className="mt-2">
    <summary className="cursor-pointer text-sm font-medium underline">Edit facts</summary>
    <form className="mt-3 grid gap-3 sm:grid-cols-2" action={data => onSave(Object.fromEntries(fields.map(([key]) => [key, data.get(key)])))}>
      {fields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm">
        {label}
        <input className={control} name={key} defaultValue={row.input[key]} maxLength={2000}
          placeholder={key === "sentence" ? row.current?.sentence : key === "meaning" ? row.current?.definition : key === "ipa" ? row.current?.ipa : undefined} />
      </label>)}
      <div className="self-end"><button className={button} disabled={disabled}>Save facts and recheck</button></div>
    </form>
  </details>;
}

export function IngReviewQueue({ recent }: { recent: { id: string; filename: string; updated_at: string }[] }) {
  const [batch, setBatch] = useState<ReviewBatchView>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, start] = useTransition();
  const ready = batch?.rows.filter(row => !row.outcome && row.group === "Ready to apply") ?? [];
  const toApply = ready.filter(row => selected.has(row.number));
  const approved = batch?.rows.filter(row => row.outcome?.status === "approved" || row.outcome?.status === "already approved").length ?? 0;
  const newWords = batch?.rows.filter(row => row.match === "New").length ?? 0;
  const needsReview = (batch?.rows.length ?? 0) - ready.length - approved;
  const groups = new Map<string, Row[]>();
  for (const row of batch?.rows ?? []) {
    const group = row.outcome?.status === "approved" || row.outcome?.status === "already approved" ? "Approved"
      : row.outcome?.status === "saved" ? "Saved · check lesson approval"
        : row.outcome?.status === "needs attention" ? "Check failed changes" : row.group;
    if (filter === "All" || filter === group || filter === "Needs review" && group !== "Ready to apply" && group !== "Approved")
      groups.set(group, [...(groups.get(group) ?? []), row]);
  }

  function run(operation: () => Promise<void>) {
    setError("");
    start(async () => {
      try { await operation(); }
      catch { setError("The action could not finish. Reopen the saved batch to continue."); }
      finally { setProgress(""); }
    });
  }

  function show(next: ReviewBatchView) {
    setBatch(next);
    setSelected(new Set(next.rows.filter(row => row.group === "Ready to apply" && !row.outcome).map(row => row.number)));
    setFilter("All");
  }

  function edit(edits: Parameters<typeof editIngReview>[2]) {
    if (!batch) return;
    run(async () => {
      const next = await editIngReview(batch.id, batch.version, edits);
      setBatch(next);
      setSelected(previous => new Set([...previous, ...edits.map(item => item.number)]));
    });
  }

  function apply(rows: Row[]) {
    if (!batch || !rows.length) return;
    run(async () => {
      let next = batch;
      for (const [index, row] of rows.entries()) {
        setProgress(`Checking ${index + 1} of ${rows.length} · ${row.input.word}`);
        next = await applyIngReviewWord(next.id, next.version, row.number);
        setBatch(next);
      }
      setSelected(previous => new Set([...previous].filter(number => !rows.some(row => row.number === number))));
      setFilter("All");
    });
  }

  return <div className="space-y-5">
    <section aria-labelledby="ing-upload-heading" className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="ing-upload-heading" className="text-lg font-semibold">Upload a word list</h2>
          <p className="mt-1 text-sm">Use one CSV for up to 100 new and existing words. Preview the matches before applying any changes.</p></div>
        <a className={button} download="regular-ing-word-review.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(ING_REVIEW_COLUMNS.join(",") + "\r\n")}`}>Download CSV template</a>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-3" action={form => run(async () => {
        const result = await previewIngReview(form);
        if (result.batch) show(result.batch);
        else setError(result.error);
      })}>
        <label className="grid min-w-0 gap-1 text-sm font-medium">Choose CSV
          <input name="csv" type="file" accept=".csv,text/csv" required className={control} disabled={busy} />
        </label>
        <button className={primary} disabled={busy}>Preview matches</button>
      </form>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">What to put in the sheet</summary>
        <p className="mt-2">Use one row per spelling. For an existing word, blank cells carry forward its reviewed facts. Add its exact meaning if the spelling has more than one.</p>
        <p className="mt-2">For a new word, enter the meaning, IPA, spoken syllable count, stress and a sentence using the word once. Write stress as <code>primary-unstressed</code> for a two-syllable word with first syllable stress. The base is optional when adding <em>ing</em> leaves it unchanged.</p>
      </details>
      {recent.length ? <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Open a saved review</summary>
        <ul className="mt-2 space-y-1">{recent.map(item => <li key={item.id}>
          <button type="button" className="underline" disabled={busy} onClick={() => run(async () => show(await openIngReview(item.id)))}>
            {item.filename} · {new Date(item.updated_at).toISOString().slice(0, 10)}
          </button>
        </li>)}</ul>
      </details> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p> : null}
    </section>

    {batch ? <>
      <section aria-label="Batch summary" className={`${card} flex flex-wrap items-end justify-between gap-4`}>
        <div>
          <h2 className="break-all text-lg font-semibold">{batch.filename}</h2>
          <p className="mt-1 text-sm">{newWords} new · {batch.rows.length - newWords} existing · {ready.length} ready · {needsReview} to review · {approved} approved</p>
          <p role="status" className="mt-1 text-sm">{progress || (busy ? "Checking the batch…" : "")}</p>
        </div>
        <button type="button" className={primary} disabled={busy || !toApply.length} onClick={() => apply(toApply)}>
          Apply {toApply.length} ready {toApply.length === 1 ? "word" : "words"}
        </button>
      </section>
      <nav aria-label="Filter review rows" className="flex flex-wrap gap-2">
        {["All", "Needs review", "Ready to apply", "Approved"].map(option => <button key={option} type="button"
          className={`${button} ${filter === option ? "bg-[var(--scarlett)] text-white" : "bg-white"}`}
          aria-pressed={filter === option} onClick={() => setFilter(option)}>{option}</button>)}
      </nav>
      {!groups.size ? <p className="text-sm">No words in this view.</p> : null}
      {[...groups.entries()].map(([name, rows]) => {
        const suggestions = name === "Confirm base families"
          ? rows.filter(row => row.families.length === 1).map(row => ({ number: row.number, familyKey: row.families[0].key })) : [];
        return <section key={name} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{name} <span className="ml-1 text-sm font-normal">({rows.length})</span></h3>
            {suggestions.length ? <button className={button} type="button" disabled={busy} onClick={() => edit(suggestions)}>
              Confirm {suggestions.length} suggested {suggestions.length === 1 ? "family" : "families"}
            </button> : null}
            {name === "Ready to apply" ? <button className={button} type="button" disabled={busy} onClick={() => {
              setSelected(new Set(rows.every(row => selected.has(row.number)) ? [] : rows.map(row => row.number)));
            }}>{rows.every(row => selected.has(row.number)) ? "Deselect all" : "Select all ready"}</button> : null}
          </div>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {rows.map(row => <li key={row.number} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  {name === "Ready to apply" ? <input type="checkbox" className="mt-1.5" checked={selected.has(row.number)}
                    aria-label={`Select ${row.input.word}`} disabled={busy}
                    onChange={event => setSelected(previous => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(row.number); else next.delete(row.number);
                      return next;
                    })} /> : null}
                  <div>
                    <p className="font-semibold">{row.input.word || "Missing spelling"} <span className="ml-2 text-xs font-normal">{row.match} · row {row.number}</span></p>
                    {row.input.meaning || row.current?.definition ? <p className="text-sm">{row.input.meaning || row.current?.definition}</p> : null}
                    {row.current && row.input.meaning && row.input.meaning !== row.current.definition
                      ? <p className="text-sm">Current meaning: {row.current.definition}</p> : null}
                    {row.input.ipa || row.current?.ipa ? <p className="text-xs">{row.input.ipa || row.current?.ipa}</p> : null}
                    {row.input.sentence || row.current?.sentence ? <p className="mt-1 text-sm italic">{row.input.sentence || row.current?.sentence}</p> : null}
                    {row.current?.sentence && row.input.sentence && row.input.sentence !== row.current.sentence
                      ? <p className="text-xs">Current sentence: {row.current.sentence}</p> : null}
                    <p className="mt-1 text-sm">{row.outcome?.message || (name === "Approved" ? "Approved for regular -ing" : row.message)}</p>
                  </div>
                </div>
                {row.outcome?.wordId || row.wordId ? <Link className="text-sm underline"
                  href={`/admin/teaching-dictionary/${row.outcome?.wordId ?? row.wordId}`}>Open word</Link> : null}
              </div>
              {!row.outcome && row.meanings.length > 1 ? <label className="mt-2 grid gap-1 text-sm sm:max-w-xl">
                Match to a meaning for {row.input.word}
                <select className={control} value={row.senseId ?? ""} disabled={busy} onChange={event => edit([{ number: row.number, senseId: event.target.value }])}>
                  <option value="" disabled>Choose a reviewed meaning</option>
                  {row.meanings.map(sense => <option key={sense.id} value={sense.id}>
                    {sense.definition} · {sense.partOfSpeech}{sense.ipa ? ` · ${sense.ipa}` : ""}{sense.sentence ? ` · ${sense.sentence}` : ""}
                  </option>)}
                </select>
              </label> : null}
              {!row.outcome && (name === "Confirm base families" || row.familyKey) && row.families.length ? <label className="mt-2 grid gap-1 text-sm sm:max-w-xl">
                Base family for {row.input.word}
                <select className={control} value={row.familyKey ?? ""} disabled={busy} onChange={event => edit([{ number: row.number, familyKey: event.target.value }])}>
                  <option value="" disabled>Choose the meaning of {row.base}</option>
                  {row.families.map(family => <option key={family.key} value={family.key}>{row.base} · {family.meaning}</option>)}
                </select>
                {row.families.length === 1 ? <span>Suggested family: {row.base} · {row.families[0].meaning}</span> : null}
              </label> : null}
              {!row.outcome ? <EditWord key={`${row.number}:${batch.version}`} row={row} disabled={busy}
                onSave={input => edit([{ number: row.number, input }])} /> : null}
              {row.outcome?.status === "saved" ? <button className={`${button} mt-2`} type="button" disabled={busy} onClick={() => apply([row])}>
                Retry lesson check
              </button> : null}
            </li>)}
          </ul>
        </section>;
      })}
    </> : null}
  </div>;
}
