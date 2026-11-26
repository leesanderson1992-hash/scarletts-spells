/** Spelling teaching is separate from grammatical regularity. Only reviewed
 * parts retaining the base, or an explicitly recorded f/fe → v change, qualify.
 * Membership, reconstruction and lesson publishing are checked by callers. */
export function hasUsefulSpellingConnection(parts: readonly unknown[], transformations: readonly unknown[]): boolean {
  const records = parts.filter((part): part is Record<string, unknown> => !!part && typeof part === "object");
  const bases = records.filter(part => part.kind === "base");
  if (bases.length !== 1 || !records.some(part => part.kind === "suffix" || part.kind === "prefix")) return false;
  const base = bases[0];
  if (typeof base.sourceText !== "string" || !base.sourceText || typeof base.surfaceText !== "string") return false;
  const source = base.sourceText;
  if (source === base.surfaceText) return true;
  return transformations.some(value => {
    if (!value || typeof value !== "object") return false;
    const change = value as Record<string, unknown>;
    const type = change.type ?? change.kind;
    const expected = type === "change_final_f_to_v" && source.endsWith("f")
      ? source.slice(0, -1) + "v"
      : type === "change_final_fe_to_v" && source.endsWith("fe") ? source.slice(0, -2) + "v" : null;
    return expected !== null && base.surfaceText === expected && change.sourcePartId === base.id
      && change.sourceText === base.sourceText && change.surfaceText === base.surfaceText;
  });
}
