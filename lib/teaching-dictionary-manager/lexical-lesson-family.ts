/** A lesson selects one of this word's current approved, morphology-matching
 * memberships. Other valid component or sense memberships remain intact. */
export function selectLexicalLessonFamily<T extends { family_key: string }>(
  matching: readonly T[], selectedKey: string,
): T | null {
  if (!matching.length) return null;
  if (selectedKey) {
    const selected = matching.find((member) => member.family_key === selectedKey);
    if (!selected) throw new Error("BASE_FAMILY_LEXICAL_SELECTION_STALE");
    return selected;
  }
  if (matching.length > 1) throw new Error("BASE_FAMILY_LEXICAL_SELECTION_REQUIRED");
  return matching[0]!;
}
