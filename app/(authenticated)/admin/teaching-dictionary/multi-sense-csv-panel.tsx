"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import type { DictionarySense } from "@/lib/teaching-dictionary-manager/senses";
import { saveBulkSkillApprovals } from "./bulk-assign/actions";
import { importReviewedMultiSenseCsv, type MultiSenseImportState } from "./multi-sense-actions";

const exportUrl = "/admin/teaching-dictionary/export/multi-sense";

export function MultiSenseCsvPanel({ wordId, batchCount = 0, skills, requests = [], senses = [] }: {
  wordId?: string;
  batchCount?: number;
  skills?: { micro_skill_key: string; display_name: string }[];
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
  const form = <>
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 gap-1 font-medium">Choose your completed CSV
        <input type="file" name="multi_sense_csv" accept=".csv,text/csv" required
          className="rounded border border-[var(--border)] px-3 py-2" />
      </label>
      <button disabled={pending} className="rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white disabled:opacity-50">
        {pending ? "Checking words and lessons…" : "Upload and check lessons"}
      </button>
    </form>
    {state.error && <p role="alert" className="mt-2 text-rose-800">{state.error}</p>}
    {state.words !== undefined && <p role="status" className="mt-3 rounded-md border border-[var(--border)] p-3">
      Saved {state.words} {state.words === 1 ? "word" : "words"}. {state.approved} new lesson {state.approved === 1 ? "approval" : "approvals"}.
      {state.alreadyApproved ? ` ${state.alreadyApproved} already approved.` : ""}
    </p>}
    {state.lessons?.length ? <div className="mt-4 space-y-4">
      <h4 className="font-semibold">Results by lesson</h4>
      {[...new Set(state.lessons.map(row => row.skillKey))].map(skillKey => {
        const rows = state.lessons!.filter(row => row.skillKey === skillKey);
        const routeId = rows[0].routeId;
        return <section key={skillKey} className="rounded-lg border border-[var(--border)] p-3">
          <h5 className="font-semibold">{skills?.find(skill => skill.micro_skill_key === skillKey)?.display_name ?? skillKey}</h5>
          <ul className="my-2 space-y-1">{rows.map((row, index) => <li key={index}>
            <Link className="underline" href={`/admin/teaching-dictionary/${row.wordId}`}>{row.word}</Link>
            { ` · ${row.meaning} · ${row.approval} · ${row.release}` }
          </li>)}</ul>
          {rows.some(row => row.release === "Ready to publish") && <Link className="mr-4 font-semibold underline"
            href={`/admin/teaching-dictionary/lesson-updates?skill=${encodeURIComponent(skillKey)}`}>Preview and publish the update</Link>}
          {routeId && <Link className="underline" href={`/admin/adle-lesson-readiness?${new URLSearchParams({ route: routeId, skill: skillKey })}`}>
            View current lesson status</Link>}
        </section>;
      })}
    </div> : null}
    {state.issues?.length ? <div className="mt-3">
      <h4 className="font-semibold">What needs fixing</h4>
      <ul className="mt-2 space-y-2">
      {state.issues.map((issue, index) => <li key={index}>
        <strong>{issue.word || "Missing spelling"} · CSV {issue.rows.length === 1 ? "row" : "rows"} {issue.rows.join(", ")}</strong>
        <p>{issue.reason}</p>
        {issue.wordId ? <p className="mt-1 flex flex-wrap gap-3">
          <Link className="underline" href={`/admin/teaching-dictionary/${issue.wordId}`}>Open saved word</Link>
          <a className="underline" href={`${exportUrl}?word_id=${issue.wordId}`}>Download fresh CSV</a>
        </p> : null}
      </li>)}
      </ul>
    </div> : null}
  </>;

  if (!wordId) return <section aria-labelledby="word-csv-heading"
    className="scroll-mt-4 rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6">
    <h2 id="word-csv-heading" className="text-xl font-semibold">Import words for ADLE</h2>
    <p className="mt-1 text-sm">Add new words and update existing words in the same CSV.</p>

    <div className="mt-5 grid gap-5 text-sm md:grid-cols-2">
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h3 className="font-semibold">Add new words</h3>
        <p className="mt-1">Start with the blank template. Add one row per meaning and leave <code>canonical_word_id</code> and <code>source_sense_reviewed_at</code> blank.</p>
        <Link className="mt-3 inline-block rounded-lg border border-[var(--border)] px-3 py-2 font-semibold"
          prefetch={false} href={`${exportUrl}?template=1`}>Download blank CSV template</Link>
      </div>
      <div className="rounded-xl border border-[var(--border)] p-4">
        <h3 className="font-semibold">Update existing words</h3>
        <p className="mt-1">Find the spelling below and choose <strong>Download word CSV</strong> beside it. Copy all its meaning rows into your file and keep the IDs and source revision.</p>
        <a className="mt-3 inline-block rounded-lg border border-[var(--border)] px-3 py-2 font-semibold"
          href="#dictionary-word-search">Find an existing word</a>
        {batchCount > 0 ? <details className="mt-3">
          <summary className="cursor-pointer">Download multiple existing words</summary>
          <div className="mt-2 flex flex-wrap gap-3">{Array.from({ length: batchCount }, (_, index) =>
            <a key={index} className="underline" href={`${exportUrl}?batch=${index + 1}`}>
              Download reviewed words, batch {index + 1}
            </a>)}</div>
        </details> : null}
      </div>
    </div>

    <div className="mt-5 border-t border-[var(--border)] pt-4 text-sm">
      <h3 className="font-semibold">Request lesson approval</h3>
      <p className="mt-1">Copy the micro-skill key into <code>requested_micro_skills</code> on the row for the meaning you want to teach. For a dictionary update only, leave it blank.</p>
      {skills?.length ? <details className="mt-2">
        <summary className="cursor-pointer font-medium">Find a micro-skill key for automatic approval</summary>
        <ul className="mt-2 space-y-1">{skills.map(skill => <li key={skill.micro_skill_key}>
          {skill.display_name} <code className="break-all">{skill.micro_skill_key}</code>
        </li>)}</ul>
      </details> : null}
      <details className="mt-2">
        <summary className="cursor-pointer font-medium">What to fill in for a new word</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Give each meaning a distinct <code>sense_id</code>, such as <code>boxing-packing</code>, and fill in its definition and part of speech.</li>
          <li>Fill in the pronunciation ID, IPA, syllable count and stress. Reuse a pronunciation ID if two meanings sound the same.</li>
          <li>Fill in the word parts in order. For a family link, use the reviewed <code>family_key</code> and the ID of the matching base or root part.</li>
          <li>For final-e dropping, enter the full base as the underlying form and the base without its final e as the visible letters. For <em>making</em>, enter <code>make</code>, <code>mak</code>, and a spelling-change explanation such as “Drop the final e before adding -ing.”</li>
          <li>For dictation, add a sentence and the target word’s position. Count from zero, so <em>We are boxing the books</em> gives <code>2</code>.</li>
        </ul>
      </details>
    </div>

    <div className="mt-5 border-t border-[var(--border)] pt-4 text-sm">
      <h3 className="font-semibold">Upload and check your words</h3>
      <p className="mt-1">Upload up to 100 words. You’ll see what saved, which lessons were approved, and the row numbers for any fixes.</p>
      {form}
    </div>
  </section>;

  return <details className="mb-4 rounded-lg border border-[var(--border)] p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Export or import all meanings for this word</summary>
    <p className="mt-2">Keep the word ID, source revision and every meaning row from this export when you make edits.</p>
    <a className="mt-2 inline-block rounded border border-[var(--border)] px-3 py-2 font-semibold"
      href={`${exportUrl}?word_id=${wordId}`}>Download word CSV</a>
    {form}
    {requests.length ? <div className="mt-3 border-t border-[var(--border)] pt-3">
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
