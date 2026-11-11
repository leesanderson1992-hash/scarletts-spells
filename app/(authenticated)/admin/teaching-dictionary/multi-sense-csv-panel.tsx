"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import type { DictionarySense } from "@/lib/teaching-dictionary-manager/senses";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";
import { importReviewedMultiSenseCsv, type MultiSenseImportState } from "./multi-sense-actions";

export function MultiSenseCsvPanel({ wordId, batchCount = 0, requests = [], senses = [] }: {
  wordId?: string; batchCount?: number;
  requests?: { sense_id: string; micro_skill_key: string }[];
  senses?: DictionarySense[];
}) {
  const [state, action, pending] = useActionState(importReviewedMultiSenseCsv, {} as MultiSenseImportState);
  const [recheck, setRecheck] = useState<string | null>(null);
  const [recheckMessage, setRecheckMessage] = useState("");
  async function retry(skillKey: string, senseId: string) {
    if (!wordId) return;
    setRecheck(`${skillKey}:${senseId}`);
    setRecheckMessage("");
    try {
      const result = await saveBulkSkillApprovals({ microSkillKey: skillKey,
        applyWordIds: [wordId], excludeWordIds: [], clearWordIds: [], deassignWordIds: [],
        senseIds: { [wordId]: senseId }, requestId: crypto.randomUUID(),
        sourceKind: "teaching_dictionary_import" });
      setRecheckMessage(result.ok ? `${skillKey}: Candidate check saved. See Micro-skills and readiness for its current status.`
        : `${skillKey}: ${result.blocked[0]?.reason ?? result.error ?? "Review this candidate."}`);
    } catch { setRecheckMessage(`${skillKey}: Recheck could not complete. Try again.`); }
    finally { setRecheck(null); }
  }
  return <details open={wordId ? undefined : true} className="mb-4 rounded-lg border border-[var(--border)] p-3 text-sm">
    <summary className="cursor-pointer font-semibold">{wordId ? "Export or import all meanings for this word" : "Upload reviewed words for lessons"}</summary>
    <p className="mt-2">Use one row per meaning. Leave the word ID and source revision blank for a new word. Keep the IDs and every meaning from an existing word’s export. Add the lesson’s micro-skill key to the meaning you want to teach. You can upload up to 100 words at once.</p>
    {wordId ? <a className="mt-2 inline-block rounded border border-[var(--border)] px-3 py-2 font-semibold"
      href={`/admin/teaching-dictionary/export/multi-sense?word_id=${wordId}`}>
      Download reviewed meanings sheet
    </a> : <div className="mt-2 flex flex-wrap gap-2"><Link className="rounded border border-[var(--border)] px-3 py-2 font-semibold" prefetch={false} href="/admin/teaching-dictionary/export/multi-sense?template=1">Download CSV template</Link>{Array.from({ length: batchCount }, (_, index) =>
      <a key={index} className="rounded border border-[var(--border)] px-3 py-2 font-semibold"
        href={`/admin/teaching-dictionary/export/multi-sense?batch=${index + 1}`}>
        Meanings batch {index + 1}
      </a>)}</div>}
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grid gap-1">Reviewed words CSV
        <input type="file" name="multi_sense_csv" accept=".csv,text/csv" required
          className="rounded border border-[var(--border)] px-3 py-2" />
      </label>
      <button disabled={pending} className="rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white disabled:opacity-50">
        {pending ? "Checking words and lessons…" : "Upload and check lessons"}
      </button>
    </form>
    {state.error && <p role="alert" className="mt-2 text-rose-800">{state.error}</p>}
    {state.words !== undefined && <p role="status" className="mt-2">
      Saved {state.words} dictionary words. {state.approved} new lesson approvals.
      {state.alreadyApproved ? ` ${state.alreadyApproved} already approved.` : ""}
    </p>}
    {state.issues?.length ? <ul className="mt-2 space-y-2">
      {state.issues.map((issue, index) => <li key={index}>
        <strong>{issue.word || "Missing spelling"} · CSV {issue.rows.length === 1 ? "row" : "rows"} {issue.rows.join(", ")}</strong>
        <p>{issue.reason} {issue.wordId && <Link className="underline" href={`/admin/teaching-dictionary/${issue.wordId}`}>Open word</Link>}</p>
      </li>)}
    </ul> : null}
    {wordId && requests.length ? <div className="mt-3 border-t border-[var(--border)] pt-3">
      <p className="font-semibold">Requested micro-skills from the latest meanings import</p>
      <ul className="mt-1 space-y-2">{requests.map(row => <li key={`${row.sense_id}:${row.micro_skill_key}`}
        className="flex flex-wrap items-center gap-2">
        <span>{row.micro_skill_key} · {senses.find(sense => sense.id === row.sense_id)?.definition ?? row.sense_id}</span>
        {hasCandidateRule(row.micro_skill_key) ? <button type="button" className="underline disabled:opacity-50"
          disabled={recheck !== null} onClick={() => retry(row.micro_skill_key, row.sense_id)}>
          {recheck === `${row.micro_skill_key}:${row.sense_id}` ? "Rechecking…" : "Recheck candidate"}
        </button> : <Link className="underline" href="/admin/teaching-dictionary/bulk-assign">Review in bulk assigner</Link>}
      </li>)}</ul>
      {recheckMessage && <p role="status" className="mt-2">{recheckMessage}</p>}
    </div> : null}
  </details>;
}
