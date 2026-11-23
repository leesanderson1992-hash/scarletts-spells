import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseWrittenSyllableBreakdown, parseSyllableBreakdown } from "./authoring";
export async function loadSchwaSyllableAuthority(db: SupabaseClient, ids: string[], environment: string) {
  const result = new Map<string, { divisions: string; resetAt: string | null; pending: boolean }>();
  for (let at = 0; at < ids.length; at += 100) {
    const batch = ids.slice(at, at + 100);
    const [metadata, reviews] = await Promise.all([
      db.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,written_syllable_breakdown")
        .in("canonical_word_id", batch).eq("row_status", "active").eq("review_status", "approved_for_first_exposure").order("created_at", { ascending: false }).order("id", { ascending: false }),
      db.from("teaching_dictionary_schwa_syllable_reviews").select("canonical_word_id,micro_skill_key,reset_at,resolved_at")
        .eq("environment_key", environment).in("canonical_word_id", batch),
    ]);
    if (metadata.error || reviews.error) throw new Error("Could not load the Dictionary syllable review state.");
    for (const id of batch) for (const skill of new Set(["", ...reviews.data.filter(row => row.canonical_word_id === id).map(row => row.micro_skill_key)])) {
      const review = reviews.data.find(row => row.canonical_word_id === id && row.micro_skill_key === skill);
      result.set(`${id}:${skill}`, { divisions: metadata.data.find(row => row.canonical_word_id === id)?.written_syllable_breakdown ?? "",
        resetAt: review?.reset_at ?? null, pending: Boolean(review && !review.resolved_at) });
    }
  }
  return result;
}
export async function saveReviewedSchwaDivisions(db: SupabaseClient, word: string, wordId: string, value: string, actor: string) {
  const normalised = normaliseWrittenSyllableBreakdown(value, word);
  if (!parseSyllableBreakdown(word, normalised)) throw new Error("Spoken syllable divisions must join to the spelling, for example wri·ter.");
  const result = await db.rpc("review_dictionary_written_divisions", { p_word: wordId, p_divisions: normalised, p_actor: actor });
  if (result.error) throw new Error(result.error.message);
  return normalised;
}
