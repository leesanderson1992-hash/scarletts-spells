/** Search approved family lemmas, not the common `_base_family` key suffix. */
export type FamilySearchRow = {
  family_key: string;
  revision: number;
  base_lemma: string;
  base_meaning: string;
  base_kind: "free_base" | "bound_root";
};

export function familySearchTerm(raw: string): string {
  return raw.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ")
    .replace(/[^a-z0-9 -]/g, "").slice(0, 60).trim();
}

export function familySearchResults(rows: readonly FamilySearchRow[], term: string) {
  const latest = new Map<string, FamilySearchRow>();
  for (const row of rows) {
    if (!row.base_lemma.toLocaleLowerCase("en-GB").includes(term)) continue;
    const previous = latest.get(row.family_key);
    if (!previous || row.revision > previous.revision) latest.set(row.family_key, row);
  }
  return [...latest.values()].map((row) => ({
    kind: "lexical" as const, id: row.family_key, name: row.family_key,
    meaning: row.base_meaning, baseLemma: row.base_lemma, baseKind: row.base_kind,
  })).sort((a, b) =>
    Number(b.baseLemma.toLocaleLowerCase("en-GB") === term) -
      Number(a.baseLemma.toLocaleLowerCase("en-GB") === term) ||
    Number(b.baseLemma.toLocaleLowerCase("en-GB").startsWith(term)) -
      Number(a.baseLemma.toLocaleLowerCase("en-GB").startsWith(term)) ||
    a.baseLemma.localeCompare(b.baseLemma) || a.name.localeCompare(b.name));
}
