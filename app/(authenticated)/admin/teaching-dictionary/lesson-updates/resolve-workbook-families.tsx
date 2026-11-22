"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { getWorkbookFamilyChoices } from "../multi-sense-actions";
import type { WorkbookFamilyDecision, WorkbookFamilyTask } from "@/lib/teaching-dictionary-manager/review-workbook";

type Choices = Awaited<ReturnType<typeof getWorkbookFamilyChoices>>;
const control = "rounded-lg border border-[var(--border)] bg-white px-3 py-2";
const primary = "rounded-lg bg-[color:var(--scarlett)] px-4 py-2 font-semibold text-[color:var(--ink)] disabled:opacity-50";

function FamilyDecision({ task, skill, saving, onResolve, savedWordId }: {
  task: WorkbookFamilyTask; skill: string; saving: boolean; onResolve: (decision: WorkbookFamilyDecision) => void; savedWordId?: string;
}) {
  const [choices, setChoices] = useState<Choices>();
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();
  const [mode, setMode] = useState<"assign" | "create">("assign");
  const [search, setSearch] = useState("");
  const [familyKey, setFamilyKey] = useState("");
  const [baseSense, setBaseSense] = useState("");
  function load() {
    setError("");
    startLoading(async () => {
      try { setChoices(await getWorkbookFamilyChoices(skill, task.base)); }
      catch { setError("Could not load word families. Try again."); }
    });
  }
  const family = choices?.families.find(row => row.key === familyKey);
  const base = choices?.bases.find(row => row.senseId === baseSense);
  const matches = choices?.families.filter(row =>
    row.kind === (task.baseKind ?? "free_base") && `${row.base} ${row.meaning}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  return <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
    <h3 className="text-lg font-semibold">{savedWordId ? <Link className="underline" href={`/admin/teaching-dictionary/${savedWordId}`} target="_blank">{task.word} · Open word page</Link> : task.word}</h3>
    <p>{task.meaning}</p>
    {task.sentence && <p className="text-sm text-[color:var(--mid)]">{task.sentence}</p>}
    <p className="rounded-lg bg-[color:var(--mist)] p-2 text-sm">{savedWordId ? "Saved dictionary review" : `Workbook row ${task.row}`} · {task.baseKind === "bound_root" ? "Root" : "Base"} <strong>{task.base || "needs review"}</strong></p>
    {!task.base ? <p>Approve the underlying base/root in Word parts on the word page. This review will update automatically.</p>
      : !choices ? <button type="button" className={control} disabled={loading || saving} onClick={load}>
        {loading ? "Loading families…" : "Find word families"}
      </button> : <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={control} aria-pressed={mode === "assign"} onClick={() => setMode("assign")}>Assign to existing family</button>
        <button type="button" className={control} aria-pressed={mode === "create"} onClick={() => setMode("create")}>Create family</button>
      </div>
      {task.baseKind === "bound_root" && <p className="text-sm">This is a bound root. New root families need dedicated root-entry review, including origin language. <Link className="underline" href={`/admin/recommend-dictionary-entries?q=${encodeURIComponent(task.base)}`}>Open root recommendation</Link></p>}
      {mode === "assign" ? <div className="grid gap-2">
        <label className="grid gap-1">Search by base or meaning
          <input type="search" className={control} value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <label className="grid gap-1">Word family
          <select className={control} value={familyKey} onChange={event => setFamilyKey(event.target.value)}>
            <option value="">{matches.length ? "Choose an approved family" : "No approved family matches"}</option>
            {matches.map(row => <option key={row.key} value={row.key}>{row.base} · {row.meaning}</option>)}
          </select>
        </label>
      </div> : <div className="grid gap-2">
        <label className="grid gap-1">Reviewed base meaning
          <select className={control} value={baseSense} onChange={event => setBaseSense(event.target.value)}>
            <option value="">{choices.bases.length ? "Choose a reviewed meaning" : `No reviewed ${choices.basePartOfSpeech ? choices.basePartOfSpeech + " " : ""}base is available`}</option>
            {choices.bases.map(row => <option key={row.senseId} value={row.senseId}>{task.base} · {row.meaning}</option>)}
          </select>
        </label>
        {!choices.bases.length && <p>Review the base word and its {choices.basePartOfSpeech ? choices.basePartOfSpeech + " " : ""}meaning first. {choices.baseWordId &&
          <Link className="underline" target="_blank" href={`/admin/teaching-dictionary/${choices.baseWordId}`}>Open base word</Link>}</p>}
        {!choices.bases.length && <button type="button" className={control} disabled={loading} onClick={load}>Refresh reviewed base</button>}
      </div>}
      <label className="grid gap-1">Base meaning
        <input className={control} readOnly value={mode === "assign" ? family?.meaning ?? "" : base?.meaning ?? ""} />
      </label>
      {mode === "create" && base && task.baseKind !== "bound_root" && <p className="text-sm">This approves the selected meaning as one whole base, creates its family and links this word. Waiting words with this reviewed meaning are rechecked automatically.</p>}
      <button type="button" className={primary} disabled={saving || (mode === "assign" ? !family : !base || task.baseKind === "bound_root")}
        onClick={() => onResolve(mode === "assign" ? { row: task.row, familyKey } : { row: task.row, createSenseId: baseSense })}>
        {saving ? "Rechecking…" : mode === "assign" ? "Assign and recheck" : "Create, assign and recheck"}
      </button>
    </>}
    {error && <p role="alert" className="text-rose-800">{error}</p>}
  </section>;
}

export function ResolveWorkbookFamilies({ tasks, skill, saving, onResolve, savedWordIds }: {
  tasks: WorkbookFamilyTask[]; skill: string; saving: boolean; onResolve: (decision: WorkbookFamilyDecision) => void; savedWordIds?: Record<number, string>;
}) {
  const [row, setRow] = useState<number>();
  const task = tasks.find(item => item.row === row) ?? tasks[0];
  if (!task) return <p>No unresolved family assignments. Open Preview and publish to check lesson readiness.</p>;
  return <div className="grid gap-3 md:grid-cols-[minmax(10rem,1fr)_3fr]">
    <div className="space-y-2" aria-label="Words needing a family">
      {tasks.map(item => <button key={item.row} type="button" aria-pressed={task.row === item.row}
        className={`w-full rounded-lg border p-2 text-left ${task.row === item.row ? "border-[var(--scarlett)] bg-[color:var(--mist)]" : "border-[var(--border)]"}`}
        onClick={() => setRow(item.row)}><strong>{item.word} · {item.base}</strong><br /><span className="text-sm">{item.meaning}</span></button>)}
    </div>
    <FamilyDecision key={`${task.row}:${task.base}:${task.baseKind}`} task={task} skill={skill} saving={saving} onResolve={onResolve} savedWordId={savedWordIds?.[task.row]} />
  </div>;
}
