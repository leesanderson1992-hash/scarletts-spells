"use client";

import { useState, useTransition } from "react";
import { SearchableAssignmentMenu } from "./searchable-assignment-menu";
import { registerReviewedAffixMeaning } from "./sense-morphology-actions";

export type AffixCatalog = Record<"prefix" | "suffix", Record<string, string[]>>;

const field = "min-h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export function AffixPicker({ kind, form, meaning, catalog, formTitle, meaningTitle, onChange }: {
  kind: "prefix" | "suffix";
  form: string;
  meaning: string;
  catalog: Record<string, string[]>;
  formTitle: React.ReactNode;
  meaningTitle: React.ReactNode;
  onChange: (form: string, meaning: string) => void;
}) {
  const [mode, setMode] = useState<"form" | "meaning" | null>(null);
  const [newForm, setNewForm] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [created, setCreated] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const forms = [...new Set([...Object.keys(catalog), ...Object.keys(created), ...(form ? [form] : [])])].sort();
  const glosses = [...new Set([...(catalog[form] ?? []), ...(created[form] ?? []), ...(meaning ? [meaning] : [])])];
  const display = (text: string) => kind === "prefix" ? `${text}-` : `-${text}`;

  function create(nextMode: "form" | "meaning") {
    setMode(nextMode);
    setNewForm(nextMode === "form" ? "" : form);
    setNewMeaning("");
    setError("");
  }

  return <div className="grid gap-2 md:col-span-4 sm:grid-cols-2">
    <div className="grid content-start gap-1 text-sm font-medium">
      {formTitle}
      <SearchableAssignmentMenu label={kind} value={form} disabled={pending}
        options={forms.map(key => ({ key, label: display(key) }))}
        onChange={key => { if (key !== form) onChange(key, ""); setMode(null); }}
        onCreate={() => create("form")} />
    </div>
    <div className="grid content-start gap-1 text-sm font-medium">
      {meaningTitle}
      <SearchableAssignmentMenu label="affix meaning" value={meaning} disabled={pending || !form}
        options={glosses.map(key => ({ key, label: key }))}
        onChange={key => { onChange(form, key); setMode(null); }}
        onCreate={() => create("meaning")} />
    </div>
    {mode && <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 sm:col-span-2">
      {mode === "form" && <label className="text-sm">New {kind}
        <input className={field} value={newForm} onChange={event => setNewForm(event.target.value)} />
      </label>}
      <label className="text-sm">What does this {kind} add to the word’s meaning?
        <input className={field} value={newMeaning} onChange={event => setNewMeaning(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
      <div className="flex gap-3">
        <button type="button" className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={pending || !newForm.trim() || !newMeaning.trim()} onClick={() => start(async () => {
            setError("");
            const result = await registerReviewedAffixMeaning(kind, newForm, newMeaning);
            if (!result.ok) { setError(result.error); return; }
            setCreated(old => ({ ...old, [result.form]: [...(old[result.form] ?? []), result.meaning] }));
            onChange(result.form, result.meaning);
            setMode(null);
          })}>{pending ? "Saving…" : "Save to affix list"}</button>
        <button type="button" className="text-sm underline" disabled={pending} onClick={() => setMode(null)}>Cancel</button>
      </div>
    </div>}
  </div>;
}
