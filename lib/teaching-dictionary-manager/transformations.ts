/** Shared by the workbook, CSV importer and both word-part editors. */
export const TRANSFORMATION_OPTIONS = [
  { type: "drop_final_e", label: "Drop final e" },
  { type: "double_final_consonant", label: "Double final consonant" },
  { type: "change_final_y_to_i", label: "Change final y to i" },
  { type: "change_final_ie_to_y", label: "Change final ie to y" },
  { type: "change_final_f_to_v", label: "Change final f to v" },
  { type: "change_final_fe_to_v", label: "Change final fe to v" },
  { type: "contraction", label: "Contraction" },
  { type: "other_reviewed_change", label: "Other reviewed change" },
] as const;
export const AUTO_TRANSFORMATION = "Auto (from spelling)";
export type TransformationType = typeof TRANSFORMATION_OPTIONS[number]["type"];
export type Transformation = { type: string; sourcePartId: string; sourceText: string; surfaceText: string; explanation: string };

const contractedForms: Record<string, string> = {
  will: "'ll", shall: "'ll", would: "'d", had: "'d", is: "'s", has: "'s", us: "'s",
  are: "'re", have: "'ve", am: "'m", not: "n't",
};
const straightApostrophe = (value: string) => value.replaceAll("’", "'");

function result(type: string, source: string) {
  switch (type) {
    case "drop_final_e": return source.endsWith("e") ? source.slice(0, -1) : null;
    case "double_final_consonant": return /[bcdfghjklmnpqrstvwxyz]$/i.test(source) ? source + source.slice(-1) : null;
    case "change_final_y_to_i": return source.endsWith("y") ? source.slice(0, -1) + "i" : null;
    case "change_final_ie_to_y": return source.endsWith("ie") ? source.slice(0, -2) + "y" : null;
    case "change_final_f_to_v": return source.endsWith("f") ? source.slice(0, -1) + "v" : null;
    case "change_final_fe_to_v": return source.endsWith("fe") ? source.slice(0, -2) + "v" : null;
    case "contraction": return contractedForms[source.toLowerCase()] ?? null;
    default: return null;
  }
}
export function suggestTransformation(source: string, surface: string): TransformationType | null {
  if (!source || !surface || source === surface) return null;
  return TRANSFORMATION_OPTIONS.find(option => result(option.type, source) ===
    (option.type === "contraction" ? straightApostrophe(surface) : surface))?.type ?? null;
}
const key = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
const generic = new Set(["base_spelling_change", "affix_spelling_change", "remove_letter", "replace_final"]);
export function resolveTransformationType(value: string, source: string, surface: string): TransformationType | null {
  const raw = key(value);
  if (!raw || value === AUTO_TRANSFORMATION || generic.has(raw)) return suggestTransformation(source, surface);
  const option = TRANSFORMATION_OPTIONS.find(option => option.type === raw || key(option.label) === raw);
  if (option) return option.type;
  // Older workbooks sometimes appended the suffix to the name of the rule.
  if (/^(?:drop_final_e|drop_e)(?:_?>_?.*)?$/u.test(raw))
    return "drop_final_e";
  const aliases: Record<string, TransformationType> = { drop_e: "drop_final_e", ie_to_y: "change_final_ie_to_y",
    y_to_i: "change_final_y_to_i", double_consonant: "double_final_consonant" };
  return aliases[raw] ?? null;
}
export function transformationExplanation(type: string, source: string, surface: string) {
  const label = TRANSFORMATION_OPTIONS.find(option => option.type === type)?.label;
  return type !== "other_reviewed_change" && label ? `${label}: ${source} → ${surface}.` : "";
}
export function reviewedTransformation(input: Transformation): Transformation {
  if (!input.sourceText || !input.surfaceText || input.sourceText === input.surfaceText)
    throw new Error("A spelling change needs different underlying and visible forms.");
  const type = resolveTransformationType(input.type, input.sourceText, input.surfaceText);
  if (!type) throw new Error("Choose a listed spelling change, or Other reviewed change with an explanation.");
  if (type !== "other_reviewed_change" && result(type, input.sourceText) !==
    (type === "contraction" ? straightApostrophe(input.surfaceText) : input.surfaceText))
    throw new Error(`${TRANSFORMATION_OPTIONS.find(option => option.type === type)!.label} does not change “${input.sourceText}” to “${input.surfaceText}”.`);
  const explanation = input.explanation.trim() || transformationExplanation(type, input.sourceText, input.surfaceText);
  if (!explanation) throw new Error("Explain the Other reviewed change before approving it.");
  return { ...input, type, explanation };
}
/** Normalise reviewed writes; suggest missing, unambiguous changes only. */
export function standardiseTransformations(parts: readonly unknown[], changes: readonly Transformation[]): Transformation[] {
  const known = parts as { id: string; sourceText: string; surfaceText: string }[];
  const normalised = changes.map(reviewedTransformation);
  for (const part of known) {
    if (!part?.id || !part.sourceText || !part.surfaceText || part.sourceText === part.surfaceText
      || normalised.some(change => change.sourcePartId === part.id)) continue;
    normalised.push(reviewedTransformation({ type: "", sourcePartId: part.id, sourceText: part.sourceText,
      surfaceText: part.surfaceText, explanation: "" }));
  }
  return normalised;
}
/** Display historic generic labels without rewriting an approved record. */
export function transformationForEditor(change: Transformation): Transformation {
  const type = resolveTransformationType(change.type, change.sourceText, change.surfaceText);
  return { ...change, type: type ?? "other_reviewed_change" };
}
