import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isKnownWordLike } from "@/lib/spelling/lexicon";
import { isKnownWord } from "@/lib/spelling/suggestCorrection";

export type NoSkillRow = {
  queue_id: string;
  misspelling: string;
  correction: string;
  source_type: "resolver_intake" | "parent_catalog" | "parent_context";
  case_status: string;
  updated_at: string;
  parent_note: string | null;
  source_evidence: Array<{ type: string; id: string }>;
  observed_is_valid_word?: boolean;
  intended_dictionary_word_id?: string;
};

export function normaliseCaseWord(word: string): string {
  return word.normalize("NFC").trim().toLocaleLowerCase("en-GB").replace(/[’ʼ]/g, "'");
}

export function caseTargetsDictionaryWord(correction: string, word: {
  normalised_word: string;
  row_status: string;
  dialect_code: string;
}): boolean {
  return word.row_status === "active" && word.dialect_code === "en-GB" &&
    normaliseCaseWord(correction) === normaliseCaseWord(word.normalised_word);
}

/** One bounded identity read for the displayed cases. Dictionary presence and
 * spelling-to-skill resolution remain distinct decisions. */
export async function annotateNoSkillCases(client: SupabaseClient, rows: NoSkillRow[]): Promise<NoSkillRow[]> {
  const words = [...new Set(rows.flatMap((row) => [row.misspelling, row.correction]).map(normaliseCaseWord))];
  if (!words.length) return rows;
  const { data, error } = await client.from("canonical_teaching_dictionary_words")
    .select("id,normalised_word").in("normalised_word", words).eq("row_status", "active")
    .eq("dialect_code", "en-GB");
  if (error) throw new Error(`NO_MATCHING_SKILL_DICTIONARY_READ_FAILED:${error.code}`);
  const wordByText = new Map((data ?? []).map((word) => [normaliseCaseWord(word.normalised_word), word.id]));
  return rows.map((row) => {
    const observed = normaliseCaseWord(row.misspelling);
    return { ...row,
      observed_is_valid_word: wordByText.has(observed) || isKnownWordLike(observed) || isKnownWord(observed),
      intended_dictionary_word_id: wordByText.get(normaliseCaseWord(row.correction)),
    };
  });
}

export async function openNoSkillCasesForWord(client: SupabaseClient, wordId: string, normalisedWord: string): Promise<NoSkillRow[]> {
  const { data, error } = await client.from("spelling_no_matching_skill_queue")
    .select("queue_id,misspelling,correction,source_type,case_status,updated_at,parent_note,source_evidence")
    .eq("correction", normaliseCaseWord(normalisedWord)).eq("dialect_code", "en-GB")
    .order("updated_at", { ascending: false }).limit(25);
  if (error) throw new Error(`TEACHING_SPELLING_CASE_READ_FAILED:${error.code}`);
  const rows = await annotateNoSkillCases(client, (data ?? []) as NoSkillRow[]);
  return rows.filter((row) => row.intended_dictionary_word_id === wordId);
}
