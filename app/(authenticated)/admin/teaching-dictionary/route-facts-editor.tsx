"use client";

import { useState } from "react";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type FieldChoices = Record<string, readonly string[]>;
const fieldClass = "w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm";
const labelClass = "grid gap-1 text-sm";

const fieldHelp: Record<string, { format: string; example: string }> = {
  prefixVariant: { format: "Choose the reviewed prefix form used by this word.", example: "re" },
  suffixVariant: { format: "Choose the reviewed suffix form used by this word.", example: "ing" },
  meaningBinKey: { format: "Choose the reviewed meaning group for this affix use.", example: "again_back" },
  choiceAudit: { format: "Record one yes or no decision for every available affix form.", example: "re: yes; un: no" },
  teachingSplitParts: { format: "Use the visual activity cut editor to show the learner's word parts.", example: "scroll | ing" },
  sourceRefs: { format: "Add a source reference for each reviewed teaching fact.", example: "Oxford Learner's Dictionary" },
  transformationNotes: { format: "Explain the spelling change in a short sentence.", example: "Double the final l before adding -ing." },
  trueMorphologyProvenance: { format: "Record the review source and its editorial decision.", example: "Reviewed canonical morphology" },
  familyKey: { format: "Choose an approved family in Overview first.", example: "scroll_family" },
  doublingPattern: { format: "Choose the spelling rule used before -ing.", example: "short_cvc" },
  semanticBaseKind: { format: "Choose whether the underlying part is a free base or bound root.", example: "base" },
  "new fact name": { format: "Use the route's named fact key when a required field is missing.", example: "pairedSentence" },
  "fact format": { format: "Choose the control shape for the new lesson-only fact.", example: "Text" },
};

function Help({ name, value }: { name: string; value?: JsonValue }) {
  const guide = fieldHelp[name] ?? (Array.isArray(value)
    ? { format: "Add each reviewed item separately.", example: "One item per row" }
    : value && typeof value === "object"
      ? { format: "Fill the named fields in this group.", example: "One value for each field" }
      : typeof value === "boolean"
        ? { format: "Choose yes or no from the review evidence.", example: "Yes" }
        : typeof value === "number"
          ? { format: "Enter a whole number.", example: "2" }
          : { format: "Enter a short reviewed teaching phrase in plain text.", example: "Move down the page" });
  const help = `Format: ${guide.format} Example: ${guide.example}`;
  return <span className="group relative inline-flex" tabIndex={0} aria-label={`How to fill ${name}. ${help}`}>
    <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full border text-xs">i</span>
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 hidden w-64 rounded bg-white p-2 text-xs shadow group-hover:block group-focus:block"><strong>Format:</strong> {guide.format}<br /><strong>Example:</strong> {guide.example}</span>
  </span>;
}

function FieldHeading({ title, name, value }: { title: string; name: string; value?: JsonValue }) {
  return <span className="inline-flex max-w-full items-center gap-1">
    <span>{title}</span><Help name={name} value={value} />
  </span>;
}

function ValueField({ name, value, onChange, choices, depth = 0 }: {
  name: string; value: JsonValue; onChange: (value: JsonValue) => void;
  choices: FieldChoices; depth?: number;
}) {
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<"text" | "number" | "yes_no" | "list" | "group">("text");
  const title = name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
  if (depth > 8) return <p className="text-xs text-amber-900">This fact is too deeply nested to edit here.</p>;
  if (Array.isArray(value)) return <fieldset className="grid gap-2 rounded border p-2">
    <legend className="text-sm font-semibold"><FieldHeading title={title} name={name} value={value} /></legend>
    {value.map((item, index) => <div key={index} className="grid gap-1 border-b pb-2">
      <ValueField name={`${title} ${index + 1}`} value={item} choices={choices} depth={depth + 1}
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
    <legend className="text-sm font-semibold"><FieldHeading title={title} name={name} value={value} /></legend>
    {Object.entries(value).map(([key, item]) => <div key={key} className="grid gap-1">
      <ValueField name={key} value={item} choices={choices} depth={depth + 1} onChange={(next) => onChange({ ...value, [key]: next })} />
      <button type="button" className="w-fit text-xs underline" onClick={() => { const next = { ...value }; delete next[key]; onChange(next); }}>Remove {key}</button>
    </div>)}
    <div className="flex flex-wrap items-end gap-2">
      <label className={labelClass}><FieldHeading title="New fact name" name="new fact name" value="" /><input className={fieldClass} value={newKey} onChange={(event) => setNewKey(event.target.value)} /></label>
      <label className={labelClass}><FieldHeading title="Format" name="fact format" value="" /><select className={fieldClass} value={newType}
        onChange={(event) => setNewType(event.target.value as typeof newType)}>
        <option value="text">Text</option><option value="number">Number</option><option value="yes_no">Yes or no</option>
        <option value="list">List</option><option value="group">Group of fields</option></select></label>
      <button type="button" className="rounded border px-2 py-1 text-sm" disabled={!newKey.trim() || newKey in value}
        onClick={() => { onChange({ ...value, [newKey.trim()]: newType === "number" ? 0 : newType === "yes_no" ? false :
          newType === "list" ? [] : newType === "group" ? {} : "" }); setNewKey(""); }}>Add fact</button>
    </div>
  </fieldset>;
  if (typeof value === "boolean") return <label className={labelClass}><FieldHeading title={title} name={name} value={value} />
    <select className={fieldClass} value={value ? "yes" : "no"} onChange={(event) => onChange(event.target.value === "yes")}
      ><option value="yes">Yes</option><option value="no">No</option></select></label>;
  if (typeof value === "number") return <label className={labelClass}><FieldHeading title={title} name={name} value={value} />
    <input className={fieldClass} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
  const options = choices[name];
  if (options?.length) return <label className={labelClass}><FieldHeading title={title} name={name} value={value} />
    <select className={fieldClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select reviewed choice</option>
      {[...new Set([String(value ?? ""), ...options])].filter(Boolean).map((option) =>
        <option key={option} value={option}>{option}</option>)}
    </select></label>;
  return <label className={labelClass}><FieldHeading title={title} name={name} value={value} />
    <input className={fieldClass} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RouteFactsEditor({ name, content, sharedKeys = [], choices = {}, onChange }: {
  name: string; content: Record<string, unknown>; sharedKeys?: readonly string[];
  choices?: FieldChoices;
  onChange: (content: Record<string, unknown>) => void;
}) {
  const shared = new Set(["trueMorphologyParts", "trueMorphologyJoins", "trueMorphologyTransformations", "morphologyParts", ...sharedKeys]);
  const sharedFacts = Object.fromEntries(Object.entries(content).filter(([key]) => shared.has(key)));
  const facts = Object.fromEntries(Object.entries(content).filter(([key]) => !shared.has(key))) as { [key: string]: JsonValue };
  return <div className="grid gap-2"><p className="text-sm font-semibold">{name} · additional lesson facts</p>
    <p className="text-xs">Shared word meaning, word sum and true morphology come from Overview. Edit only lesson-specific facts here.</p>
    <ValueField name="Lesson facts" value={facts} choices={choices} onChange={(value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) onChange({ ...sharedFacts, ...value });
    }} />
  </div>;
}
