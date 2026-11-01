"use client";

import { useState } from "react";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const fieldClass = "w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
const labelClass = "grid gap-1 text-sm";

function Help({ name }: { name: string }) {
  const help = `Review ${name.replaceAll("_", " ")} for this lesson. Keep the same meaning as the dictionary Overview when it describes a shared word fact.`;
  return <span className="group relative inline-flex" tabIndex={0} aria-label={help}>
    <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border text-xs">i</span>
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 hidden w-64 rounded bg-white p-2 text-xs shadow group-hover:block group-focus:block">{help}</span>
  </span>;
}

function ValueField({ name, value, onChange, depth = 0 }: {
  name: string; value: JsonValue; onChange: (value: JsonValue) => void; depth?: number;
}) {
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<"text" | "number" | "yes_no" | "list" | "group">("text");
  const title = name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
  if (depth > 8) return <p className="text-xs text-amber-900">This fact is too deeply nested to edit here.</p>;
  if (Array.isArray(value)) return <fieldset className="grid gap-2 rounded border p-2">
    <legend className="text-sm font-semibold">{title} <Help name={title} /></legend>
    {value.map((item, index) => <div key={index} className="grid gap-1 border-b pb-2">
      <ValueField name={`${title} ${index + 1}`} value={item} depth={depth + 1}
        onChange={(next) => onChange(value.map((old, at) => at === index ? next : old))} />
      <button type="button" className="w-fit text-xs underline" onClick={() => onChange(value.filter((_, at) => at !== index))}>Remove item {index + 1}</button>
    </div>)}
    <div className="flex flex-wrap gap-2 text-xs">
      <button type="button" className="rounded border px-2 py-1" onClick={() => onChange([...value, ""])}>Add text</button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => onChange([...value, 0])}>Add number</button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => onChange([...value, {}])}>Add item with fields</button>
    </div>
  </fieldset>;
  if (value && typeof value === "object") return <fieldset className="grid gap-2 rounded border p-2">
    <legend className="text-sm font-semibold">{title} <Help name={title} /></legend>
    {Object.entries(value).map(([key, item]) => <div key={key} className="grid gap-1">
      <ValueField name={key} value={item} depth={depth + 1} onChange={(next) => onChange({ ...value, [key]: next })} />
      <button type="button" className="w-fit text-xs underline" onClick={() => { const next = { ...value }; delete next[key]; onChange(next); }}>Remove {key}</button>
    </div>)}
    <div className="flex flex-wrap items-end gap-2">
      <label className={labelClass}>New fact name <Help name="new fact name" /><input className={fieldClass} value={newKey} onChange={(event) => setNewKey(event.target.value)} /></label>
      <label className={labelClass}>Format <Help name="fact format" /><select className={fieldClass} value={newType}
        onChange={(event) => setNewType(event.target.value as typeof newType)}>
        <option value="text">Text</option><option value="number">Number</option><option value="yes_no">Yes or no</option>
        <option value="list">List</option><option value="group">Group of fields</option></select></label>
      <button type="button" className="rounded border px-2 py-1 text-sm" disabled={!newKey.trim() || newKey in value}
        onClick={() => { onChange({ ...value, [newKey.trim()]: newType === "number" ? 0 : newType === "yes_no" ? false :
          newType === "list" ? [] : newType === "group" ? {} : "" }); setNewKey(""); }}>Add fact</button>
    </div>
  </fieldset>;
  if (typeof value === "boolean") return <label className={labelClass}>{title} <Help name={title} />
    <select className={fieldClass} value={value ? "yes" : "no"} onChange={(event) => onChange(event.target.value === "yes")}
      ><option value="yes">Yes</option><option value="no">No</option></select></label>;
  if (typeof value === "number") return <label className={labelClass}>{title} <Help name={title} />
    <input className={fieldClass} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
  return <label className={labelClass}>{title} <Help name={title} />
    <input className={fieldClass} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RouteFactsEditor({ name, content, sharedKeys = [], onChange }: {
  name: string; content: Record<string, unknown>; sharedKeys?: readonly string[];
  onChange: (content: Record<string, unknown>) => void;
}) {
  const shared = new Set(["trueMorphologyParts", "trueMorphologyJoins", "trueMorphologyTransformations", "morphologyParts", ...sharedKeys]);
  const sharedFacts = Object.fromEntries(Object.entries(content).filter(([key]) => shared.has(key)));
  const facts = Object.fromEntries(Object.entries(content).filter(([key]) => !shared.has(key))) as { [key: string]: JsonValue };
  return <div className="grid gap-2"><p className="text-sm font-semibold">{name} · additional lesson facts</p>
    <p className="text-xs">Shared word meaning, word sum and true morphology come from Overview. Edit only lesson-specific facts here.</p>
    <ValueField name="Lesson facts" value={facts} onChange={(value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) onChange({ ...sharedFacts, ...value });
    }} />
  </div>;
}
