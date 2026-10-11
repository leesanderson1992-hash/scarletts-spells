export type BulkWord = {
  id: string;
  displayWord: string;
  normalisedWord: string;
  approvable: boolean;
  hasSchwa: boolean | null;
  syllableCount: number | null;
  morphemeParts: string[];
};

export type BulkFilters = {
  search: string;
  schwa: "all" | "yes" | "no" | "unknown";
  morpheme: string;
  syllables: string;
};

export function syllableCount(value: string | null | undefined): number | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (/^[1-9]\d?$/.test(raw)) return Number(raw);
  if (!/^[\p{L}]+(?:[-·‧][\p{L}]+)+$/u.test(raw)) return null;
  return raw.split(/[-·‧]/u).length;
}

export function morphemeParts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const parts = value.flatMap((part: unknown) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return [];
    const row = part as Record<string, unknown>;
    const source = String(row.sourceText || row.surfaceText || row.text || "").trim();
    if (!source) return [];
    const kind = String(row.kind ?? row.role ?? row.type ?? row.partType ?? "");
    const label = kind === "prefix" ? `${source.replace(/-+$/u, "")}-`
      : kind === "suffix" ? `-${source.replace(/^-+/u, "")}` : source;
    return [label.toLocaleLowerCase("en-GB")];
  });
  return [...new Set(parts)];
}

export function filterBulkWords(words: readonly BulkWord[], filters: BulkFilters): BulkWord[] {
  const query = filters.search.trim().toLocaleLowerCase("en-GB");
  return words.filter((word) => {
    if (query && !word.normalisedWord.toLocaleLowerCase("en-GB").includes(query)) return false;
    if (filters.schwa === "yes" && word.hasSchwa !== true) return false;
    if (filters.schwa === "no" && word.hasSchwa !== false) return false;
    if (filters.schwa === "unknown" && word.hasSchwa !== null) return false;
    if (filters.morpheme && !word.morphemeParts.includes(filters.morpheme)) return false;
    if (filters.syllables === "unknown" && word.syllableCount !== null) return false;
    if (filters.syllables && filters.syllables !== "unknown"
      && word.syllableCount !== Number(filters.syllables)) return false;
    return true;
  });
}

export function nextBulkSelection(current: ReadonlySet<string>, ids: readonly string[], checked: boolean, limit = 100): Set<string> | null {
  const next = new Set(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next.size <= limit ? next : null;
}
