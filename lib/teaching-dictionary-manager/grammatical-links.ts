import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export type GrammaticalLink = { family_key: string; canonical_word_id: string; display_word: string;
  canonical_base_word_id: string | null; base_lemma: string; base_part_of_speech: string; relation_kind: string };
/** One scoped read; spelling-family consumers never use these links as clues. */
export async function loadWordGrammaticalLinks(db: SupabaseClient, wordId: string): Promise<GrammaticalLink[]> {
  const result = await db.from("teaching_dictionary_grammatical_relationships")
    .select("family_key,canonical_word_id,display_word,canonical_base_word_id,base_lemma,base_part_of_speech,relation_kind")
    .or(`canonical_word_id.eq.${wordId},canonical_base_word_id.eq.${wordId}`);
  if (result.error) throw new Error("Could not load grammatical relationships.");
  return result.data ?? [];
}
