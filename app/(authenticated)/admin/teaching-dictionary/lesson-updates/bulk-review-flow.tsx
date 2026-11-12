"use client";

import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { importReviewedMultiSenseCsv, type MultiSenseImportState } from "../multi-sense-actions";

import { ResolveWorkbookFamilies } from "./resolve-workbook-families";
import type { WorkbookFamilyDecision } from "@/lib/teaching-dictionary-manager/review-workbook";

type Option = { key: string; label: string };
type Skill = Option & { cluster: string };
const steps = ["Export workbook", "Edit and upload", "Resolve word families", "Preview and publish"];
const actionClass = "inline-flex rounded-lg bg-[color:var(--scarlett)] px-4 py-2 font-semibold text-[color:var(--ink)] disabled:opacity-50";

function SearchMenu({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <fieldset className="min-w-0 space-y-2">
    <legend className="font-semibold">{label}</legend>
    <input type="search" aria-label={`Search ${label.toLowerCase()}s`} placeholder={`Search ${label.toLowerCase()}s`}
      value={search} onChange={event => setSearch(event.target.value)}
      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2" />
    <select aria-label={label} value={matches.some(item => item.key === value) ? value : ""}
      onChange={event => { setSearch(""); onChange(event.target.value); }}
      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2">
      <option value="">{matches.length ? `Choose a ${label.toLowerCase()}` : "No matches"}</option>
      {matches.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
    </select>
  </fieldset>;
}

export function BulkReviewFlow({ clusters, skills, selected, initialCluster, supported, batches, published, children }: {
  clusters: Option[]; skills: Skill[]; selected: string; initialCluster: string; supported: boolean; batches: number;
  published: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const [cluster, setCluster] = useState(skills.find(skill => skill.key === selected)?.cluster ?? initialCluster);
  const [step, setStep] = useState(published ? 3 : 0);
  const workbook = useRef<File | null>(null);
  const decisions = useRef(new Map<string, WorkbookFamilyDecision[]>());
  const [result, upload, pending] = useActionState(async (previous: MultiSenseImportState, form: FormData) => {
    const target = Number(form.get("family_target_row") ?? 0);
    if (!target) {
      const file = form.get("review_workbook");
      workbook.current = file instanceof File ? file : null;
      decisions.current.clear();
    }
    const response = await importReviewedMultiSenseCsv(previous, form);
    if (response.words) router.refresh();
    if (!target) {
      if (response.familyTasks?.length) setStep(2);
      return response;
    }
    const task = previous.familyTasks?.find(item => item.row === target);
    if (!task) return previous;
    if (response.error || (!response.words && response.issues?.length))
      return { ...previous, error: response.error ?? response.issues?.[0].reason };
    const pending = response.familyTasks ?? [];
    const familyTasks = [...(previous.familyTasks ?? []).filter(item => item.word !== task.word), ...pending];
    const issues = [...(previous.issues ?? []).filter(issue => issue.word !== task.word), ...(response.issues ?? [])];
    if (!familyTasks.length && !issues.length && (response.approved || response.alreadyApproved)) setStep(3);
    return { words: (previous.words ?? 0) + (response.words ?? 0),
      approved: (previous.approved ?? 0) + (response.approved ?? 0),
      alreadyApproved: (previous.alreadyApproved ?? 0) + (response.alreadyApproved ?? 0),
      lessons: [...(previous.lessons ?? []), ...(response.lessons ?? [])], familyTasks, issues };
  }, {});
  function resolve(decision: WorkbookFamilyDecision) {
    if (!workbook.current) return;
    const task = result.familyTasks?.find(item => item.row === decision.row);
    if (!task) return;
    const previousChoices = decisions.current.get(task.word) ?? [];
    const choices = [...previousChoices.filter(item => item.row !== decision.row), decision];
    decisions.current.set(task.word, choices);
    const form = new FormData();
    form.set("review_workbook", workbook.current);
    form.set("workbook_skill", selected);
    form.set("family_target_row", String(decision.row));
    form.set("family_decisions", JSON.stringify(choices));
    startTransition(() => upload(form));
  }
  return <>
    <section aria-label="Lesson filters" className="grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 sm:grid-cols-2">
      <SearchMenu label="Cluster" value={cluster} options={clusters} onChange={key => {
        setCluster(key);
        setStep(0);
        if (selected) router.push(`?cluster=${encodeURIComponent(key)}`, { scroll: false });
      }} />
      {cluster && <SearchMenu key={cluster} label="Micro-skill" value={selected}
        options={skills.filter(skill => skill.cluster === cluster)} onChange={key => {
          setStep(0);
          router.push(`?cluster=${encodeURIComponent(cluster)}&skill=${encodeURIComponent(key)}`, { scroll: false });
        }} />}
    </section>
    {!selected ? <p className="rounded-xl bg-[color:var(--mist)] p-4">Choose a cluster and micro-skill to start reviewing words.</p>
      : !supported ? <p className="rounded-xl bg-[color:var(--mist)] p-4">
        Workbook review is available in staging for regular -ing and final-e dropping.</p> : <>
      <nav aria-label="Bulk review steps" className="grid gap-2 sm:grid-cols-4">
        {steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined}
          onClick={() => setStep(index)}
          className={`rounded-xl border p-3 text-left font-semibold ${step === index
            ? "border-[var(--scarlett)] bg-[color:var(--mist)]" : "border-[var(--border)] bg-white"}`}>
          {index + 1} · {label}
        </button>)}
      </nav>
      {step === 0 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Export words needing review</h2>
        <p>The workbook shows existing facts and what needs checking. Choose the lesson meaning in the workbook. You can resolve missing families after uploading.</p>
        {batches ? <div className="flex flex-wrap gap-2">{Array.from({ length: batches }, (_, index) =>
          <a key={index} className={actionClass}
            href={`/admin/teaching-dictionary/export/review-workbook?skill=${selected}&batch=${index + 1}`}>
            {batches === 1 ? "Download review workbook" : `Download workbook ${index + 1}`}
          </a>)}</div> : <p>All associated words have current reviewed facts.</p>}
      </section>}
      {step === 1 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Edit and upload the workbook</h2>
        <p>Choose Yes on the meaning you want to teach and fix the flagged fields. Leave any family you need to look up blank.</p>
        <form action={upload} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="workbook_skill" value={selected} />
          <label className="grid gap-1 font-medium">Corrected workbook
            <input type="file" name="review_workbook" accept=".xlsx" required className="rounded-lg border border-[var(--border)] p-2" />
          </label>
          <button disabled={pending} className={actionClass}>{pending ? "Checking workbook…" : "Check workbook"}</button>
        </form>
        {result.error && <p role="alert" className="text-rose-800">{result.error}</p>}
        {result.words !== undefined && <div role="status" className="space-y-2">
          <p>{result.words} saved · {result.approved} newly approved · {result.alreadyApproved} already approved</p>
          {result.lessons?.map(row => <p key={`${row.wordId}:${row.meaning}`}>
            <strong>{row.word}</strong> · {row.meaning} · {row.approval} · {row.release}
          </p>)}
        </div>}
        {Boolean(result.issues?.length) && <ul className="list-disc space-y-1 pl-5 text-rose-900">
          {result.issues?.map((issue, index) => <li key={index}><strong>{issue.word}</strong> · {issue.reason}</li>)}
        </ul>}
        {Boolean(result.approved || result.alreadyApproved) && <button type="button" className={actionClass}
          onClick={() => setStep(3)}>Preview lesson update</button>}
      </section>}
      {step === 2 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Resolve word families</h2>
        {result.error && <p role="alert" className="text-rose-800">{result.error}</p>}
        {result.issues?.map((issue, index) => <p key={index} className="text-rose-800">{issue.word} · {issue.reason}</p>)}
        <ResolveWorkbookFamilies tasks={result.familyTasks ?? []} skill={selected} saving={pending} onResolve={resolve} />
        <button type="button" className={actionClass} disabled={pending} onClick={() => setStep(3)}>Preview lesson update</button>
      </section>}
      {step === 3 && children}
    </>}
  </>;
}
