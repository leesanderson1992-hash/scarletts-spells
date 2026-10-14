export type BulkWord = {
  id: string;
  displayWord: string;
  normalisedWord: string;
  approvable: boolean;
  hasSchwa: boolean | null;
  syllableCount: number | null;
  writtenSyllableBreakdown?: string | null;
  morphemeParts: string[];
  phonemeHint: string | null;
  phonemeSymbols: string[];
};

export type BulkFilters = {
  search: string;
  schwa: "all" | "yes" | "no" | "unknown";
  morpheme: string;
  syllables: string;
  phoneme: string;
};

export type BulkDraftChoice = "apply" | "exclude" | "clear" | "deassign";

/** Saved assignments use one draft slot even when exclusion also de-assigns them. */
export function nextAssignedBulkDraft(current: ReadonlyMap<string, BulkDraftChoice>, id: string,
  choice: "apply" | "exclude" | "deassign", checked = true,
  limit = 100): Map<string, BulkDraftChoice> | null {
  const next = new Map(current);
  if (choice === "apply" && checked) next.delete(id);
  else if (choice === "exclude" && !checked) next.delete(id);
  else if (choice === "apply" && !checked) next.set(id, "deassign");
  else next.set(id, choice);
  return next.size <= limit ? next : null;
}

export function nextBulkReviewDraft(current: ReadonlyMap<string, BulkDraftChoice>, ids: readonly string[],
  choice: "apply" | "exclude", checked: boolean, savedExcluded: ReadonlySet<string>,
  skillKey: string, limit = 100): Map<string, BulkDraftChoice> | null {
  const next = new Map(current);
  for (const id of ids) {
    const wasExcluded = savedExcluded.has(`${skillKey}:${id}`);
    if (checked) {
      if (choice === "exclude" && wasExcluded) next.delete(id);
      else next.set(id, choice);
    } else if (next.get(id) === choice || (!next.has(id) && choice === "exclude" && wasExcluded)) {
      if (wasExcluded) next.set(id, "clear");
      else next.delete(id);
    }
  }
  return next.size <= limit ? next : null;
}

// Keep compound IPA sounds together, as in the dictionary banding runner.
const IPA_COMPOUNDS = ["aʊ", "əʊ", "eɪ", "aɪ", "ɔɪ", "ɪə", "eə", "ʊə", "tʃ", "dʒ", "iː", "uː", "ɑː", "ɔː", "ɜː"];

export function isolatedPhonemeSymbols(hint: string | null | undefined): string[] {
  const ipa = hint?.trim().match(/^\/([^/]+)\//u)?.[1];
  if (!ipa) return [];
  const symbols: string[] = [];
  const characters = Array.from(ipa.normalize("NFC"));
  for (let index = 0; index < characters.length;) {
    const character = characters[index];
    if (/[ˈˌ.\sˑ‿]/u.test(character)) { index += 1; continue; }
    const compound = IPA_COMPOUNDS.find((symbol) => characters.slice(index, index + Array.from(symbol).length).join("") === symbol);
    let token = compound ?? character;
    index += Array.from(token).length;
    while (index < characters.length && /\p{M}/u.test(characters[index])) token += characters[index++];
    if (/\p{M}/u.test(token[0])) {
      if (symbols.length) symbols[symbols.length - 1] += token;
    } else {
      symbols.push(token);
    }
  }
  return [...new Set(symbols)];
}

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
    if (filters.phoneme && !word.phonemeSymbols.includes(filters.phoneme)) return false;
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
