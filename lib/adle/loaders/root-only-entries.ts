import type { SupabaseClient } from "@supabase/supabase-js";

/** Classify support entries by reviewed meanings, never by the root spelling.
 * A mixed root/word entry keeps its separately reviewed whole-word uses. */
export async function loadRootOnlyWordIds(client: SupabaseClient): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  let after: string | null = null;
  for (;;) {
    let query = client.from("teaching_dictionary_root_only_entries")
      .select("canonical_word_id").order("canonical_word_id").limit(500);
    if (after) query = query.gt("canonical_word_id", after);
    const { data, error } = await query;
    if (error) throw new Error("ROOT_TARGET_CLASSIFICATION_UNAVAILABLE");
    for (const row of data ?? []) ids.add(String(row.canonical_word_id));
    if (!data || data.length < 500) return ids;
    after = String(data[data.length - 1].canonical_word_id);
  }
}
