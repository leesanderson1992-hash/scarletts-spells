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

/** A reviewed family-specific stem variation must retain almost all of the
 * written stem. This does not admit unrelated grammatical forms such as be/are. */
export function isCloseFamilySpellingVariant(source: string, surface: string): boolean {
  if (!/^[a-z]+$/i.test(source) || !/^[a-z]+$/i.test(surface) || source === surface) return false;
  if (source.endsWith('le') && surface === source.slice(0, -2) + 'il') return true;
  let common = 0;
  while (common < Math.min(source.length, surface.length) && source[common] === surface[common]) common++;
  return common >= 3 && common >= Math.min(source.length, surface.length) - 1;
}

export function hasReviewedFamilyVariation(parts: readonly unknown[], transformations: readonly unknown[]): boolean {
  const records = parts.filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  const bases = records.filter(p => p.kind === "base");
  if (bases.length !== 1 || !records.some(p => p.kind === "prefix" || p.kind === "suffix")) return false;
  const base = bases[0];
  return typeof base.sourceText === "string" && typeof base.surfaceText === "string"
    && (!(base.sourceText.endsWith('le') && base.surfaceText === base.sourceText.slice(0, -2) + 'il')
      || records.some(part => part.kind === 'suffix' && part.sourceText === 'ity'))
    && isCloseFamilySpellingVariant(base.sourceText, base.surfaceText)
    && transformations.some(raw => {
      if (!raw || typeof raw !== "object") return false;
      const change = raw as Record<string, unknown>;
      return (change.type ?? change.kind) === "other_reviewed_change" && change.sourcePartId === base.id
        && change.sourceText === base.sourceText && change.surfaceText === base.surfaceText
        && typeof change.explanation === "string" && !!change.explanation.trim();
    });
}
