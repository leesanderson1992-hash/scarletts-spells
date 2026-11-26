/** A reviewed whole-word exception can retain its complete base without
 * inventing a productive suffix: child → children is the canonical example. */
export function hasReviewedBaseExtension(parts: readonly unknown[], transformations: readonly unknown[]): boolean {
  if (parts.length !== 1 || !parts[0] || typeof parts[0] !== "object") return false;
  const part = parts[0] as Record<string, unknown>;
  const source = part.sourceText, surface = part.surfaceText;
  if (part.kind !== "base" || typeof source !== "string" || !source || typeof surface !== "string"
    || surface.length <= source.length || !surface.startsWith(source)) return false;
  return transformations.length === 1 && transformations.some(raw => {
    if (!raw || typeof raw !== "object") return false;
    const change = raw as Record<string, unknown>;
    return (change.type ?? change.kind) === "other_reviewed_change" && change.sourcePartId === part.id
      && change.sourceText === source && change.surfaceText === surface
      && typeof change.explanation === "string" && !!change.explanation.trim();
  });
}

/** Spelling teaching is separate from grammatical regularity. Only reviewed
 * parts retaining the base, or an explicitly recorded f/fe → v change, qualify.
 * Membership, reconstruction and lesson publishing are checked by callers. */
export function hasUsefulSpellingConnection(parts: readonly unknown[], transformations: readonly unknown[]): boolean {
  if (hasReviewedBaseExtension(parts, transformations)) return true;
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
