type SourcePart = { text?: unknown; partType?: unknown; meaning?: unknown };

/** Converts approved editorial word parts into the prefix route's governed shape.
 * It does not approve the result: the editor must review meaning and choice audit. */
export function derivePrefixRouteFacts(input: {
  word: string;
  source: Record<string, unknown>;
  meaningBins: readonly { id: string; prefixText?: string }[];
  choiceForms?: readonly string[];
}) {
  const source = input.source;
  const previous = { ...source };
  if (Array.isArray(previous.teachingSplitParts) && previous.teachingSplitParts.length >= 2) return previous;
  let parsed: unknown;
  try { parsed = typeof source.wordPartsJSON === "string" ? JSON.parse(source.wordPartsJSON) : source.wordPartsJSON; }
  catch { return previous; }
  if (!Array.isArray(parsed) || parsed.length !== 2) return previous;
  const entries = parsed as SourcePart[];
  const prefix = entries[0];
  const base = entries[1];
  if (prefix?.partType !== "prefix" || !["free_base", "base", "root"].includes(String(base?.partType))
    || typeof prefix.text !== "string" || typeof base.text !== "string"
    || `${prefix.text}${base.text}` !== input.word) return previous;
  const prefixText = prefix.text;
  const baseText = base.text;
  const bin = input.meaningBins.find((candidate) => candidate.prefixText === prefixText);
  const choiceForms = [...new Set(input.choiceForms ?? [])];
  const choiceAudit = source.choiceAudit ?? (choiceForms.includes(prefixText) && choiceForms.length >= 2
    ? { word: input.word, choiceVerdicts: Object.fromEntries(choiceForms.map((form) => [form, form === prefixText])) } : undefined);
  return {
    ...previous,
    baseWord: baseText,
    baseMeaning: typeof base.meaning === "string" ? base.meaning : "",
    prefixVariant: prefixText,
    meaningBinKey: bin?.id ?? "",
    ...(choiceAudit ? { choiceAudit } : {}),
    teachingSplitParts: [
      { id: "part_1", kind: "prefix", sourceText: prefixText, surfaceText: prefixText,
        gloss: typeof prefix.meaning === "string" ? prefix.meaning : "", displayRange: { start: 0, end: prefixText.length } },
      { id: "part_2", kind: "base", sourceText: baseText, surfaceText: baseText,
        gloss: typeof base.meaning === "string" ? base.meaning : "", displayRange: { start: prefixText.length, end: input.word.length } },
    ],
    teachingSplitJoins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
  };
}
