"use client";

import { useActionState, useOptimistic, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importReviewedMultiSenseCsv, type MultiSenseImportState } from "../multi-sense-actions";


type Option = { key: string; label: string };
type Cluster = Option & { family: string };
type Skill = Option & { cluster: string; family: string };
const steps = ["Export workbook", "Edit and upload", "Resolve word families", "Preview and publish"];
const actionClass = "inline-flex rounded-lg bg-[color:var(--scarlett)] px-4 py-2 font-semibold text-[color:var(--ink)] disabled:opacity-50";

function SearchMenu({ label, value, options, disabled, emptyLabel, onChange }: {
  label: string; value: string; options: Option[]; disabled: boolean; emptyLabel?: string; onChange: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const plural = label === "Micro-skill family" ? "micro-skill families" : `${label.toLowerCase()}s`;
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className="font-semibold">{label}</legend>
    <input type="search" aria-label={`Search ${plural}`} placeholder={`Search ${plural}`}
      value={search} onChange={event => setSearch(event.target.value)}
      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2" />
    <select aria-label={label} value={matches.some(item => item.key === value) ? value : ""}
      onChange={event => { setSearch(""); onChange(event.target.value); }}
      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2">
      <option value="">{emptyLabel ?? (matches.length ? `Choose a ${label.toLowerCase()}` : "No matches")}</option>
      {matches.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
    </select>
  </fieldset>;
}

export function BulkReviewFlow({ families, clusters, skills, selected, initialFamily, initialCluster, supported, batches, fullPoolSize, blankWorkbookHref, view, review, savedReviews, familyRequired = true, familyGuidance, children }: {
  families: Option[]; clusters: Cluster[]; skills: Skill[]; selected: string; initialFamily: string; initialCluster: string; supported: boolean; batches: number | null;
  fullPoolSize: number | null; blankWorkbookHref?: string; familyRequired?: boolean; familyGuidance?: string;
  view: "export" | "workbook" | "families" | "preview"; review?: ReactNode; savedReviews?: ReactNode; children: ReactNode;
}) {
  const router = useRouter();
  const selectedSkill = skills.find(skill => skill.key === selected);
  const selectedCluster = clusters.find(cluster => cluster.key === (selectedSkill?.cluster ?? initialCluster));
  const [family, setFamily] = useOptimistic(selectedSkill?.family ?? selectedCluster?.family ?? initialFamily);
  const [cluster, setCluster] = useOptimistic(selectedSkill?.cluster ?? initialCluster);
  const [uploadedSkill, setUploadedSkill] = useState<string | null>(null);
  const uploaded = uploadedSkill === selected;
  const [workbookStep, setWorkbookStep] = useState(1);
  const [navigating, navigate] = useTransition();
  const [visibleSkill, setVisibleSkill] = useOptimistic(selected);
  const switchingLesson = visibleSkill !== selected;
  const nextLesson = skills.find(skill => skill.key === visibleSkill);
  const step = view === "export" ? 0 : view === "preview" ? 3 : view === "families" ? 2 : workbookStep;
  const [result, upload, pending] = useActionState(async (previous: MultiSenseImportState, form: FormData) => {
    const response = await importReviewedMultiSenseCsv(previous, form);
    setUploadedSkill(response.uploadComplete ? selected : null);
    if (response.familyTasks?.length) {
      setWorkbookStep(2);
      navigate(() => router.push(`?${new URLSearchParams({ family, cluster, skill: selected, view: "families" })}`, { scroll: false }));
    } else if (response.words) router.refresh();
    return response;
  }, {});
  function openStep(index: number) {
    const nextView = index === 0 ? "export" : index === 3 ? "preview" : index === 2 ? "families" : "workbook";
    if (nextView === "workbook") setWorkbookStep(index);
    if (nextView !== view) {
      const query = new URLSearchParams({ family, cluster, skill: selected, view: nextView });
      navigate(() => router.push(`?${query}`, { scroll: false }));
    }
  }
  const results = result.words !== undefined && <div role="status" className="space-y-2">
    <p>{result.words} saved · {result.approved} newly approved · {result.alreadyApproved} already approved</p>
    {Boolean(result.conflicts?.length) && <details className="rounded-lg border border-amber-300 bg-amber-50 p-3" open>
      <summary className="font-semibold">Conflicts resolved using your workbook</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{result.conflicts?.map(item => <li key={item.wordId}>
        <strong>{item.word}</strong> · Rows {item.rows.join(", ")} · {item.reason}
      </li>)}</ul>
    </details>}
    {result.lessons?.map(row => <p key={`${row.wordId}:${row.meaning}`}>
      <strong>{row.word}</strong> · {row.meaning} · {row.approval} · {row.release}
      {row.draftId && <> · <Link className="font-semibold underline"
        href={`/admin/teaching-dictionary/${row.wordId}?draft=${row.draftId}#td-route-${row.skillKey}`}>Open lesson draft</Link></>}
    </p>)}
  </div>;

  return <>
    <section aria-label="Lesson filters" className="grid gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 sm:grid-cols-3">
      <SearchMenu label="Micro-skill family" value={family} options={families} disabled={navigating || pending} onChange={key => {
        setUploadedSkill(null);
        setWorkbookStep(1);
        navigate(() => {
          setFamily(key);
          setCluster("");
          setVisibleSkill("");
          router.push(`?${new URLSearchParams({ family: key })}`, { scroll: false });
        });
      }} />
      <SearchMenu key={`cluster-${family}`} label="Cluster" value={cluster}
        options={clusters.filter(cluster => cluster.family === family)} disabled={!family || navigating || pending}
        emptyLabel={!family ? "Choose a family first" : undefined} onChange={key => {
          setUploadedSkill(null);
          setWorkbookStep(1);
          navigate(() => {
            setCluster(key);
            setVisibleSkill("");
            router.push(`?${new URLSearchParams({ family, cluster: key })}`, { scroll: false });
          });
        }} />
      <SearchMenu key={`skill-${family}:${cluster}`} label="Micro-skill" value={visibleSkill} disabled={!family || !cluster || navigating || pending}
        emptyLabel={!cluster ? "Choose a cluster first" : undefined}
        options={skills.filter(skill => skill.family === family && skill.cluster === cluster)} onChange={key => {
          setUploadedSkill(null);
          setWorkbookStep(1);
          navigate(() => {
            setVisibleSkill(key);
            router.push(`?${new URLSearchParams({ family, cluster, skill: key })}`, { scroll: false });
          });
        }} />
    </section>
    {switchingLesson ? <p role="status" className="rounded-xl bg-[color:var(--mist)] p-4">
      {nextLesson ? `Opening ${nextLesson.label}…` : "Loading lesson filters…"}
    </p> : !selected ? <p className="rounded-xl bg-[color:var(--mist)] p-4">Choose a micro-skill family, cluster and micro-skill to start reviewing words.</p>
      : !supported ? <p className="rounded-xl bg-[color:var(--mist)] p-4">
        Workbook review is unavailable for this micro-skill.</p> : <>
      <nav aria-label="Bulk review steps" className="grid gap-2 sm:grid-cols-4">
        {steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined}
          disabled={pending || navigating} onClick={() => openStep(index)}
          className={`rounded-xl border p-3 text-left font-semibold ${step === index
            ? "border-[var(--scarlett)] bg-[color:var(--mist)]" : "border-[var(--border)] bg-white"}`}>
          {index + 1} · {label}
        </button>)}
      </nav>
      {navigating && <p role="status">Loading lesson review…</p>}
      {step === 0 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Export words needing review</h2>
        <p>The workbook shows existing facts and what needs checking. Choose the lesson meaning in the workbook. {familyGuidance ?? (familyRequired ? "You can resolve missing families after uploading." : "This lesson uses contrast sets; no family assignment is required.")}</p>
        {batches ? <div className="flex flex-wrap gap-2">{Array.from({ length: batches }, (_, index) =>
          <a key={index} className={actionClass} download
            href={`/admin/teaching-dictionary/export/review-workbook?skill=${selected}&batch=${index + 1}`}>
            {batches === 1 ? "Download review workbook" : `Download workbook ${index + 1}`}
          </a>)}</div> : batches === 0 ? <>
          <p>No words need review for this lesson.</p>
        </> : null}
        {blankWorkbookHref && <a className={actionClass} download href={blankWorkbookHref}>Download blank workbook</a>}
        {fullPoolSize !== null && <div className="space-y-1 border-t border-[var(--border)] pt-3">
          <a className="font-semibold underline" download
            href={`/admin/teaching-dictionary/export/review-workbook?skill=${selected}&scope=pool`}>
            Export full lesson pool
          </a>
          <p className="text-sm">{fullPoolSize} active words. Use this snapshot to see what the lesson currently teaches.</p>
        </div>}
      </section>}
      {step === 0 && review}
      {step === 1 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Edit and upload the workbook</h2>
        <p>Choose Yes on the meaning you want to teach and fix the flagged fields. {familyRequired ? "Leave any family you need to look up blank." : "Existing meanings and approved lesson examples are prefilled for review."}</p>
        <form action={upload} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="workbook_skill" value={selected} />
          <label className="grid gap-1 font-medium">Corrected workbook
            <input type="file" name="review_workbook" accept=".xlsx" required disabled={pending} onChange={() => setUploadedSkill(null)} className="rounded-lg border border-[var(--border)] p-2" />
          </label>
          <button disabled={pending || uploaded} className={actionClass}>{pending ? "Checking workbook…" : uploaded ? "Uploaded" : "Check workbook"}</button>
        </form>
        {result.error && <p role="alert" className="text-rose-800">{result.error}</p>}
        {results}
        {Boolean(result.issues?.length) && <ul className="list-disc space-y-1 pl-5 text-rose-900">
          {result.issues?.map((issue, index) => <li key={index}><strong>{issue.word}</strong> · {issue.reason}</li>)}
        </ul>}
        {Boolean(result.words || result.approved || result.alreadyApproved) && <button type="button" className={actionClass}
          disabled={navigating || pending} onClick={() => openStep(3)}>Preview lesson update</button>}
      </section>}
      {step === 2 && <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-xl font-semibold">Resolve word families</h2>
        {result.error && <p role="alert" className="text-rose-800">{result.error}</p>}
        {result.issues?.map((issue, index) => <p key={index} className="text-rose-800">{issue.word} · {issue.reason}</p>)}
        {savedReviews}
        {results}
        <button type="button" className={actionClass} disabled={pending || navigating} onClick={() => openStep(3)}>Preview lesson update</button>
      </section>}
      {step === 3 && children}
    </>}
  </>;
}
