export function inheritFamilyPartMeanings<T>(parts: readonly T[], links: readonly {
  component_part_id: string; base_meaning?: string | null;
}[]): T[] {
  return parts.map(part => {
    if (!part || typeof part !== "object" || !("id" in part)) return part;
    const meanings = new Set(links.filter(link => link.component_part_id === part.id && link.base_meaning)
      .map(link => link.base_meaning));
    if (meanings.size !== 1) return part;
    return { ...part, gloss: [...meanings][0] };
  });
}
