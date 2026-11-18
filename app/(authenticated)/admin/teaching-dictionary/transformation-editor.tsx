"use client";

import { AUTO_TRANSFORMATION, TRANSFORMATION_OPTIONS, reviewedTransformation, suggestTransformation,
  transformationExplanation, transformationForEditor, type Transformation } from "@/lib/teaching-dictionary-manager/transformations";
import { FormatHint } from "./format-hint";
import { asParts } from "./part-sequence-editor";

const field = "w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm";
export function TransformationEditor({ parts: rawParts, value, onChange }: {
  parts: unknown[]; value: Transformation[]; onChange: (changes: Transformation[]) => void;
}) {
  const parts = asParts(rawParts);
  const update = (index: number, next: Partial<Transformation>) => onChange(value.map((row, at) => at === index ? { ...row, ...next } : row));
  return <div className="grid gap-2">
    <h4 className="inline-flex items-center gap-2 font-semibold">Spelling changes <FormatHint label="spelling changes"
      format="Choose a standard rule. The suffix is a separate word part. Clear suggestions are applied when you approve the parts; explain Other reviewed change yourself."
      example="force → forc: Drop final e. Add ible as a separate suffix." /></h4>
    {parts.filter(part => part.sourceText && part.surfaceText && part.sourceText !== part.surfaceText
      && !value.some(change => change.sourcePartId === part.id)).map(part => {
      const type = suggestTransformation(part.sourceText!, part.surfaceText!);
      return <div key={part.id} className="flex flex-wrap items-center gap-2 text-sm">
        <span>{part.sourceText} → {part.surfaceText}: {type
          ? `Suggested: ${TRANSFORMATION_OPTIONS.find(option => option.type === type)!.label}. Applied when approving parts.`
          : "Choose Other reviewed change and explain this spelling change."}</span>
        <button type="button" className="underline" onClick={() => onChange([...value, { type: type ?? "other_reviewed_change",
          sourcePartId: part.id!, sourceText: part.sourceText!, surfaceText: part.surfaceText!,
          explanation: type ? transformationExplanation(type, part.sourceText!, part.surfaceText!) : "" }])}>Review change</button>
      </div>;
    })}
    {value.map((original, index) => {
      const item = transformationForEditor(original);
      let error = "";
      try { reviewedTransformation(item); } catch (problem) { error = problem instanceof Error ? problem.message : "Check this spelling change."; }
      return <div key={index} className="grid gap-2 rounded bg-[var(--paper)] p-2 sm:grid-cols-2">
        <label className="text-sm">Part <select className={field} value={item.sourcePartId} onChange={event => {
          const part = parts.find(part => part.id === event.target.value);
          const sourceText = part?.sourceText ?? "", surfaceText = part?.surfaceText ?? "";
          const type = suggestTransformation(sourceText, surfaceText);
          update(index, { sourcePartId: event.target.value, sourceText, surfaceText, type: type ?? "other_reviewed_change",
            explanation: type ? transformationExplanation(type, sourceText, surfaceText) : "" });
        }}><option value="">Choose part</option>{parts.map(part => <option key={part.id} value={part.id}>{part.sourceText} → {part.surfaceText}</option>)}</select></label>
        <label className="text-sm">Change <select className={field} value={item.type} onChange={event => {
          const type = event.target.value === AUTO_TRANSFORMATION
            ? suggestTransformation(item.sourceText, item.surfaceText) ?? "other_reviewed_change" : event.target.value;
          update(index, { type, explanation: transformationExplanation(type, item.sourceText, item.surfaceText) });
        }}><option value={AUTO_TRANSFORMATION}>{AUTO_TRANSFORMATION}</option>
          {TRANSFORMATION_OPTIONS.map(option => <option key={option.type} value={option.type}>{option.label}</option>)}
        </select></label>
        {(["sourceText", "surfaceText", "explanation"] as const).map(key => <label key={key} className="text-sm">
          {key === "sourceText" ? "Before" : key === "surfaceText" ? "After" : "Explanation"}
          <input className={field} value={item[key]} onChange={event => update(index, { [key]: event.target.value })} />
        </label>)}
        {error && <p role="alert" className="text-sm text-rose-900 sm:col-span-2">{error}</p>}
        <div className="flex gap-3 text-sm">
          {index > 0 && <button type="button" className="underline" onClick={() => {
            const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next);
          }}>Move up</button>}
          <button type="button" className="underline" onClick={() => onChange(value.filter((_, at) => at !== index))}>Remove change</button>
        </div>
      </div>;
    })}
    <button type="button" className="w-fit text-sm underline" onClick={() => onChange([...value,
      { type: "other_reviewed_change", sourcePartId: "", sourceText: "", surfaceText: "", explanation: "" }])}>Add spelling change</button>
  </div>;
}
