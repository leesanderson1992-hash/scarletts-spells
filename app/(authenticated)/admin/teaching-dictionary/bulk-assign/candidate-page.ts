import "server-only";

import { gzipSync, gunzipSync } from "node:zlib";
import { unstable_cache } from "next/cache";
import { normaliseBulkSpellingSearch } from "@/lib/teaching-dictionary-manager/bulk-spelling-search";
import { normaliseWrittenSyllableBreakdown } from "@/lib/teaching-dictionary-manager/authoring";
import { filterBulkWords, isolatedPhonemeSymbols, morphemeParts, syllableCount,
  type BulkFilterWord, type BulkFilters, type BulkWord } from "@/lib/teaching-dictionary-manager/bulk-skill-assignment";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
import type { DictionaryPronunciation, DictionarySense } from "@/lib/teaching-dictionary-manager/senses";
import { hasCandidateRule } from "@/lib/teaching-dictionary-manager/lesson-candidate";
import { buildBulkCandidateDetails, readBulkPageFacts } from "./candidate-details-read";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type DictionaryWord = { id: string; normalised_word: string; display_word: string; review_status: string };
export const loadBulkWordDirectory = unstable_cache(async () => {
  const db = createServiceRoleClient();
  const rows: DictionaryWord[] = [];
  let total: number | null = null;
  do {
    const { data, error, count } = await db.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word,display_word,review_status", rows.length ? undefined : { count: "exact" })
      .eq("row_status", "active").order("id").range(rows.length, rows.length + 999);
    if (error) throw new Error("TEACHING_BULK_DIRECTORY_READ_FAILED");
    total ??= count;
    rows.push(...data);
    if (!data.length) break;
  } while (total === null || rows.length < total);
  return rows.sort((left, right) => left.normalised_word.localeCompare(right.normalised_word));
}, ["teaching-dictionary-bulk-word-directory-v1"], {
  revalidate: 60,
  tags: [TEACHING_DICTIONARY_EVIDENCE_TAG],
});

async function hydrateCandidatePage(rows: DictionaryWord[], skill: string) {
  if (!rows.length) return { words: [], details: undefined };
  const ids = rows.map(row => row.id);
  const candidateRule = hasCandidateRule(skill);
  const facts = await readBulkPageFacts(ids, candidateRule);
  const metadataByWord = new Map(facts.metadata.map(row => [row.canonical_word_id, row]));
  const morphologyByWord = new Map(facts.morphology.map(row => [row.canonical_word_id, row]));
  const sensesByWord = new Map(facts.senses.map(row => [row.canonical_word_id, row.sense_set]));
  const words = rows.map((row): BulkWord => {
    const metadata = metadataByWord.get(row.id);
    return {
      id: row.id, normalisedWord: row.normalised_word, displayWord: row.display_word,
      approvable: row.review_status === "approved_for_first_exposure",
      hasSchwa: metadata?.has_schwa ?? null, syllableCount: syllableCount(metadata?.syllables),
      writtenSyllableBreakdown: metadata?.written_syllable_breakdown
        ? normaliseWrittenSyllableBreakdown(metadata.written_syllable_breakdown, row.display_word) : null,
      morphemeParts: morphemeParts(morphologyByWord.get(row.id)?.morphology_parts),
      phonemeHint: metadata?.phoneme_hint ?? null,
      phonemeSymbols: isolatedPhonemeSymbols(metadata?.phoneme_hint),
      senseSet: sensesByWord.get(row.id) ?? null,
    };
  });
  return { words, details: candidateRule ? buildBulkCandidateDetails(ids, facts) : undefined };
}

function paginate<T>(rows: T[], requestedPage: number) {
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  return { rows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), total: rows.length, currentPage, pageCount };
}

export async function readSpellingCandidatePage(directory: DictionaryWord[], search: string, requestedPage: number, skill: string) {
  const query = normaliseBulkSpellingSearch(search);
  const { rows, ...page } = paginate(query ? directory.filter(row => normaliseBulkSpellingSearch(row.normalised_word).includes(query)) : directory, requestedPage);
  return { ...page, ...await hydrateCandidatePage(rows, skill) };
}

type FilterInput = DictionaryWord & {
  has_schwa: boolean | null;
  syllables: string | null;
  phoneme_hint: string | null;
  morphology_parts: unknown;
  senses: Pick<DictionarySense, "id" | "pronunciationId">[];
  pronunciations: Pick<DictionaryPronunciation, "id" | "ipa" | "spokenSyllableCount">[];
};

async function readBulkFilterIndex() {
  const db = createServiceRoleClient();
  const rows: FilterInput[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await db.rpc("teaching_dictionary_bulk_filter_inputs", { p_after: after });
    if (error) throw new Error("Could not load specialist filter inputs.");
    const batch = data as FilterInput[];
    rows.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].id;
  }
  return gzipSync(JSON.stringify(buildBulkFilterIndex(rows))).toString("base64");
}

function buildBulkFilterIndex(rows: FilterInput[]) {
  const index = rows.sort((left, right) => left.normalised_word.localeCompare(right.normalised_word))
    .map(({ senses, pronunciations, has_schwa, syllables, phoneme_hint, morphology_parts, ...word }) => ({
      word, senses, hasSchwa: has_schwa, legacyCount: syllableCount(syllables),
      legacySymbols: isolatedPhonemeSymbols(phoneme_hint), morphemeParts: morphemeParts(morphology_parts),
      pronunciations: pronunciations.map(({ id, ipa, spokenSyllableCount }) => ({ id, spokenSyllableCount,
        hasSchwa: ipa.trim() ? ipa.includes("ə") : null, symbols: isolatedPhonemeSymbols(ipa) })),
    }));
  const options = {
    parts: [...new Set(index.flatMap(row => row.morphemeParts))].sort((a, b) => a.localeCompare(b)),
    counts: [...new Set(index.flatMap(row => row.senses.length
      ? row.pronunciations.map(pronunciation => pronunciation.spokenSyllableCount) : [row.legacyCount])
      .filter((count): count is number => count !== null))].sort((a, b) => a - b),
    phonemes: [...new Set(index.flatMap(row => row.pronunciations.length
      ? row.pronunciations.flatMap(pronunciation => pronunciation.symbols) : row.legacySymbols))]
      .sort((a, b) => a.localeCompare(b)),
  };
  return { index, options };
}

const cachedBulkFilterIndex = unstable_cache(readBulkFilterIndex, ["teaching-dictionary-bulk-filter-index-v1"], {
  revalidate: 60,
  tags: [TEACHING_DICTIONARY_EVIDENCE_TAG],
});

type FilterIndex = ReturnType<typeof buildBulkFilterIndex>;

async function loadBulkFilterIndex(): Promise<FilterIndex> {
  const compressed = await cachedBulkFilterIndex();
  return JSON.parse(gunzipSync(Buffer.from(compressed, "base64")).toString("utf8")) as FilterIndex;
}

export async function loadBulkWordFilterOptions() {
  return (await loadBulkFilterIndex()).options;
}

export async function readBulkCandidatePage(skill: string, filters: BulkFilters, page: number,
  selectedSenses: Record<string, string>) {
  if (filters.schwa === "all" && !filters.morpheme && !filters.syllables && !filters.phoneme) {
    return readSpellingCandidatePage(await loadBulkWordDirectory(), filters.search, page, skill);
  }
  const { index } = await loadBulkFilterIndex();
  const filterRows = index.map(row => {
    const selectedId = selectedSenses[`${skill}:${row.word.id}`] ?? (row.senses.length === 1 ? row.senses[0].id : "");
    const selected = row.senses.find(sense => sense.id === selectedId);
    const pronunciations = selected
      ? row.pronunciations.filter(pronunciation => pronunciation.id === selected.pronunciationId) : row.pronunciations;
    const first = pronunciations[0];
    return {
      word: row.word, normalisedWord: row.word.normalised_word, morphemeParts: row.morphemeParts,
      hasSchwa: selected ? first?.hasSchwa ?? null : row.senses.length ? null : row.hasSchwa,
      phonemeSymbols: pronunciations.length ? [...new Set(pronunciations.flatMap(item => item.symbols))] : row.legacySymbols,
      syllableCount: selected || pronunciations.length === 1 ? first?.spokenSyllableCount ?? null
        : pronunciations.length ? null : row.legacyCount,
      possibleSyllableCounts: pronunciations.flatMap(item => item.spokenSyllableCount === null ? [] : [item.spokenSyllableCount]),
    } satisfies BulkFilterWord & { word: DictionaryWord };
  });
  const { rows, ...paging } = paginate(filterBulkWords(filterRows, filters), page);
  return { ...paging, ...await hydrateCandidatePage(rows.map(row => row.word), skill) };
}
