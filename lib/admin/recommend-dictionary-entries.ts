import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const RECOMMENDATION_PAGE_SIZE = 50;
export const RECOMMENDATION_EXPORT_LIMIT = 10_000;

export type DictionaryRecommendation = {
  word_key: string;
  verified_uses: number;
  children_count: number;
  adle_uses: number;
  other_writing_uses: number;
  first_seen_at: string;
  last_seen_at: string;
};

export function recommendationSearch(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/[’ʼ]/g, "'").slice(0, 100)
    .replace(/[^\p{L}' -]/gu, "");
}

function sortedQuery(search: string, withCount = false) {
  let query = createServiceRoleClient().from("admin_recommend_dictionary_entries")
    .select("word_key,verified_uses,children_count,adle_uses,other_writing_uses,first_seen_at,last_seen_at",
      withCount ? { count: "exact" } : undefined);
  if (search) query = query.ilike("word_key", `%${search}%`);
  return query.order("verified_uses", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .order("word_key", { ascending: true });
}

export async function loadRecommendationPage(search: string, requestedPage: number) {
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const start = (page - 1) * RECOMMENDATION_PAGE_SIZE;
  const { data, count, error } = await sortedQuery(recommendationSearch(search), true)
    .range(start, start + RECOMMENDATION_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as DictionaryRecommendation[], total: count ?? 0, page };
}

export async function loadRecommendationsForExport(input: {
  mode: "selected" | "all";
  keys: string[];
  excludedKeys: string[];
  search: string;
}): Promise<DictionaryRecommendation[]> {
  const search = recommendationSearch(input.search);
  const excluded = new Set(input.excludedKeys);
  if (input.mode === "selected") {
    if (!input.keys.length) return [];
    const keys = [...new Set(input.keys)];
    const rows: DictionaryRecommendation[] = [];
    for (let index = 0; index < keys.length; index += 100) {
      const { data, error } = await sortedQuery(search).in("word_key", keys.slice(index, index + 100));
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []) as DictionaryRecommendation[]);
    }
    return rows.sort((a, b) => b.verified_uses - a.verified_uses
      || b.last_seen_at.localeCompare(a.last_seen_at) || a.word_key.localeCompare(b.word_key));
  }
  const rows: DictionaryRecommendation[] = [];
  for (let offset = 0; offset <= RECOMMENDATION_EXPORT_LIMIT; offset += 1000) {
    const { data, error } = await sortedQuery(search).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as DictionaryRecommendation[]);
    if ((data ?? []).length < 1000) break;
  }
  if (rows.length > RECOMMENDATION_EXPORT_LIMIT) throw new Error("EXPORT_ROW_LIMIT");
  return rows.filter((row) => !excluded.has(row.word_key));
}
