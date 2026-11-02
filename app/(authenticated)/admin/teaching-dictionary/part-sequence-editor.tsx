"use client";

const fieldClass = "min-h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";
const labelClass = "grid gap-1 text-sm font-medium";
type EditablePart = { id?: string; kind?: string; sourceText?: string; surfaceText?: string; gloss?: string; displayRange?: { start: number; end: number }; [key: string]: unknown };
type EditableJoin = { afterPartId?: string; beforePartId?: string; joinType?: string; [key: string]: unknown };

const FIELD_GUIDANCE: Record<string, { format: string; example: string }> = {
  "Visible letters": { format: "Enter the letters the learner sees in this part.", example: "scroll" },
  "Underlying form": { format: "Enter the base, root or affix before any spelling change.", example: "scroll" },
  Role: { format: "Choose whether the part is a prefix, base, root, suffix or connector.", example: "base" },
  "Meaning of this part": { format: "Choose the reviewed affix meaning or use the selected family meaning for a base or root.", example: "move across a surface" },
  "Join before this part": { format: "Choose no space, a space or a hyphen in the printed word.", example: "No space" },
};

function FieldTitle({ label, helpKey = label }: { label: string; helpKey?: string }) {
  const guidance = FIELD_GUIDANCE[helpKey] ?? {
    format: "Enter the reviewed teaching fact in plain language.",
    example: "Use the wording or option that should be shown in the lesson.",
  };
  return <span className="inline-flex max-w-full items-center gap-2">
    <span>{label}</span>
    <span className="group relative inline-block font-normal" tabIndex={0} aria-label={`How to fill ${label}: ${guidance.format} Example: ${guidance.example}`}>
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-xs font-bold text-[color:var(--scarlett)]">i</span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 hidden w-64 rounded-lg bg-[var(--paper)] p-2 text-xs font-normal text-[color:var(--ink)] shadow group-hover:block group-focus:block">
        <strong>Format:</strong> {guidance.format}<br /><strong>Example:</strong> {guidance.example}
      </span>
    </span>
  </span>;
}

export function asParts(value: unknown): EditablePart[] {
  return Array.isArray(value) ? value.filter((item): item is EditablePart => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((part) => {
    const legacyKind = String(part.kind ?? part.role ?? part.type ?? part.partType ?? "base");
    return {
      ...part,
      surfaceText: String(part.surfaceText ?? part.text ?? ""),
      sourceText: String(part.sourceText ?? part.surfaceText ?? part.text ?? ""),
      kind: legacyKind === "free_base" ? "base" : ["bound_base", "bound_root"].includes(legacyKind) ? "root" : legacyKind,
      gloss: String(part.gloss ?? part.meaning ?? ""),
    };
  }) : [];
}

function asJoins(value: unknown): EditableJoin[] {
  return Array.isArray(value) ? value.filter((item): item is EditableJoin => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function normaliseParts(parts: EditablePart[], joins: EditableJoin[]): EditablePart[] {
  let start = 0;
  return parts.map((part, index) => {
    const surfaceText = String(part.surfaceText ?? "");
    const next = { id: part.id || crypto.randomUUID(), surfaceText,
      sourceText: String(part.sourceText ?? surfaceText),
      kind: part.kind ?? "base", gloss: String(part.gloss ?? ""),
      displayRange: { start, end: start + surfaceText.length } };
    start += surfaceText.length + (["space", "hyphen"].includes(String(joins[index]?.joinType)) ? 1 : 0);
    return next;
  });
}

function normaliseJoins(parts: EditablePart[], joins: EditableJoin[]): EditableJoin[] {
  return parts.slice(1).map((part, index) => ({
    ...joins[index], afterPartId: String(parts[index].id),
    beforePartId: String(part.id ?? `part_${index + 2}`),
    joinType: joins[index]?.joinType ?? "none",
  }));
}

export function PartSequenceEditor(props: {
  id?: string;
  label: string;
  word: string;
  parts: unknown;
  joins: unknown;
  onChange: (parts: EditablePart[], joins: EditableJoin[]) => void;
  affixMeanings?: Record<string, string[]>;
  familyBase?: { lemma: string; kind: "base" | "root"; meaning: string };
}) {
  const parts = asParts(props.parts);
  const joins = asJoins(props.joins);
  function save(nextParts: EditablePart[], nextJoins: EditableJoin[] = joins) {
    const normalised = normaliseParts(nextParts, nextJoins);
    props.onChange(normalised, normaliseJoins(normalised, nextJoins));
  }
  return <div id={props.id} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 scroll-mt-6">
    <div><strong className="text-sm">{props.label}</strong><p className="text-xs">Enter the parts the learner should see. Their visible spelling must join to make <strong>{props.word || "the word"}</strong>.</p></div>
    {parts.map((part, index) => <div key={index} className="grid gap-2 rounded-lg bg-[var(--paper)] p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
      <label className={labelClass}><FieldTitle label="Visible letters" /><input className={fieldClass} value={String(part.surfaceText ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, surfaceText: event.target.value } : item))} /></label>
      <label className={labelClass}><FieldTitle label="Underlying form" /><input className={fieldClass} value={String(part.sourceText ?? "")} readOnly={Boolean(props.familyBase && String(part.sourceText) === props.familyBase.lemma && part.kind === props.familyBase.kind)} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, sourceText: event.target.value } : item))} /></label>
      <label className={labelClass}><FieldTitle label="Role" /><select className={fieldClass} value={String(part.kind ?? "base")} disabled={Boolean(props.familyBase && String(part.sourceText) === props.familyBase.lemma && part.kind === props.familyBase.kind)} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, kind: event.target.value } : item))}>
        {["prefix", "base", "root", "suffix", "connector"].map((role) => <option key={role} value={role}>{role}</option>)}
      </select></label>
      <button type="button" className="self-end rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50" aria-label={`Remove part ${index + 1}`} disabled={Boolean(props.familyBase && String(part.sourceText) === props.familyBase.lemma && part.kind === props.familyBase.kind)} onClick={() => save(parts.filter((_, at) => at !== index))}>Remove</button>
      <label className={`${labelClass} md:col-span-3`}><FieldTitle label="Meaning of this part" />{["prefix", "suffix"].includes(String(part.kind)) && props.affixMeanings?.[String(part.sourceText || part.surfaceText)]?.length ? <select className={fieldClass} value={String(part.gloss ?? "")} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, gloss: event.target.value } : item))}><option value="">Select reviewed meaning</option>{part.gloss && !props.affixMeanings[String(part.sourceText || part.surfaceText)].includes(String(part.gloss)) && <option value={String(part.gloss)} disabled>Current meaning needs review: {String(part.gloss)}</option>}{[...new Set(props.affixMeanings[String(part.sourceText || part.surfaceText)])].filter(Boolean).map(meaning => <option key={meaning}>{meaning}</option>)}</select> : <input className={fieldClass} value={String(part.gloss ?? "")} readOnly={Boolean(props.familyBase && String(part.sourceText) === props.familyBase.lemma && part.kind === props.familyBase.kind)} onChange={(event) => save(parts.map((item, at) => at === index ? { ...item, gloss: event.target.value } : item))} />}</label>
      {index > 0 && <label className={labelClass}><FieldTitle label="Join before this part" /><select className={fieldClass} value={String(joins[index - 1]?.joinType ?? "none")} onChange={(event) => save(parts, Array.from({ length: parts.length - 1 }, (_, at) => at === index - 1 ? { ...(joins[at] ?? {}), joinType: event.target.value } : joins[at] ?? {}))}><option value="none">No space</option><option value="space">Space</option><option value="hyphen">Hyphen</option></select></label>}
    </div>)}
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" onClick={() => save([...parts, { surfaceText: "", sourceText: "", kind: "base", gloss: "" }])}>Add part</button><button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50" disabled={!parts.length} onClick={() => save(parts, joins)}>Apply reviewed parts</button><span className="text-xs">Preview: {parts.map((part) => String(part.surfaceText ?? "")).join(" | ") || "No parts yet"}</span></div>
  </div>;
}

