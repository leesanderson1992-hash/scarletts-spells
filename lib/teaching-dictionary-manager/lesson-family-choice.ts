import type { MultiSenseCsvBundle } from "./multi-sense-csv";

/** A lesson choice never removes any canonical component memberships. */
export function chooseLessonFamily(analysis: MultiSenseCsvBundle["analyses"][number], selected?: string, previous?: string) {
  const links = analysis.familyLinks ?? (analysis.familyKey ? [{ familyKey: analysis.familyKey,
    componentPartId: analysis.componentPartId, relationshipKind: analysis.relationshipKind }] : []);
  const keys = [...new Set(links.map(link => link.familyKey))];
  if (selected) return keys.includes(selected) ? selected : null;
  if (previous && keys.includes(previous)) return previous;
  return keys.length === 1 ? keys[0] : null;
}
