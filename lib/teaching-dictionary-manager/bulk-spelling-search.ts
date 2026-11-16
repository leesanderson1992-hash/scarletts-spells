import type { BulkWord } from "./bulk-skill-assignment";

export type BulkCandidatePage = {
  words: BulkWord[];
  total: number;
  currentPage: number;
  pageCount: number;
  details?: Record<string, NonNullable<BulkWord["candidateSenseFacts"]>>;
};

type SpellingPage = { search: string; page: number; expiresAt: number; result: BulkCandidatePage };
export type RecentSpellingPages = Map<string, SpellingPage>;
const maxRecentPages = 8;
const searchLifetimeMs = 15_000;
const spellingKey = (search: string, page: number) => JSON.stringify([search, page]);

export function normaliseBulkSpellingSearch(search: string) {
  return search.trim().toLocaleLowerCase("en-GB");
}

export function rememberSpellingPage(pages: RecentSpellingPages, search: string, page: number,
  result: BulkCandidatePage, now: number) {
  const key = spellingKey(search, page);
  pages.delete(key);
  pages.set(key, { search, page, result, expiresAt: now + searchLifetimeMs });
  if (pages.size > maxRecentPages) {
    const oldest = pages.keys().next().value;
    if (oldest !== undefined) pages.delete(oldest);
  }
}

export function reuseSpellingPage(pages: RecentSpellingPages, search: string, page: number, now: number) {
  const key = spellingKey(search, page);
  for (const [storedKey, entry] of pages) {
    if (entry.expiresAt <= now) pages.delete(storedKey);
  }
  const exact = pages.get(key);
  if (exact) return exact.result;
  if (page !== 1) return undefined;

  // A longer substring can only narrow a complete result. A page from a
  // multi-page result cannot tell us which matches are on the other pages.
  for (const { search: previousSearch, page: previousPage, result } of [...pages.values()].reverse()) {
    if (previousPage !== 1 || result.total !== result.words.length || !search.includes(previousSearch)) continue;
    const words = result.words.filter(word => normaliseBulkSpellingSearch(word.normalisedWord).includes(search));
    const details = result.details;
    return {
      words, total: words.length, currentPage: 1, pageCount: 1,
      details: details && Object.fromEntries(words.map(word => [word.id, details[word.id]])),
    };
  }
  return undefined;
}
