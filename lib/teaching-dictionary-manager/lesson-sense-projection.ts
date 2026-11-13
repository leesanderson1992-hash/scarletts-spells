import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import type { DictionaryPronunciation, DictionarySenseSet } from "./senses";

export type LessonSenseProjection =
  | { status: "current"; senseId: string; meaning: string; pronunciation: DictionaryPronunciation | null;
      dictationSentence: string | null; dictationTargetTokenIndex: number | null;
      dictationAuthorityId: string | null; dictationSourceHash: string | null }
  | { status: "stale" };

/** A binding only applies while both its reviewed meaning and pronunciation
 * still match the current approved Overview. Historical pairs have no binding. */
export async function loadCurrentLessonSenses(
  db: SupabaseClient, wordIds: readonly string[], skillKeys: readonly string[],
  perSense = false,
): Promise<Map<string, LessonSenseProjection>> {
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment || !wordIds.length || !skillKeys.length) return new Map();
  const { data: bindings, error } = await db.from("teaching_dictionary_effective_lesson_sense_bindings")
    .select("canonical_word_id,micro_skill_key,sense_id,sense_snapshot,pronunciation_snapshot")
    .eq("environment_key", environment).in("canonical_word_id", [...new Set(wordIds)])
    .in("micro_skill_key", [...new Set(skillKeys)]);
  if (error) throw new Error("TEACHING_LESSON_SENSE_BINDINGS_READ_FAILED");
  const ids = [...new Set((bindings ?? []).map(row => String(row.canonical_word_id)))];
  if (!ids.length) return new Map();
  const { data: sets, error: setsError } = await db.from("teaching_dictionary_reviewed_sense_sets")
    .select("canonical_word_id,sense_set").in("canonical_word_id", ids);
  if (setsError) throw new Error("TEACHING_LESSON_SENSE_SETS_READ_FAILED");
  const byWord = new Map((sets ?? []).map(row => [String(row.canonical_word_id), row.sense_set as DictionarySenseSet]));
  const { data: sentences, error: sentenceError } = await db.from("teaching_dictionary_reviewed_sense_sentences")
    .select("id,canonical_word_id,sense_id,sentence,target_token_index,source_row_hash")
    .in("canonical_word_id", ids);
  if (sentenceError) throw new Error("TEACHING_LESSON_SENSE_SENTENCES_READ_FAILED");
  const result = new Map<string, LessonSenseProjection>();
  for (const binding of bindings ?? []) {
    const pair = `${binding.canonical_word_id}:${binding.micro_skill_key}`;
    const key = perSense ? `${pair}:${binding.sense_id}` : pair;
    if (result.has(key)) {
      // Word-level legacy routes cannot choose between two approved meanings.
      // Their compiler must carry an explicit sense before it can use either.
      result.set(key, { status: "stale" });
      continue;
    }
    const set = byWord.get(String(binding.canonical_word_id));
    const sense = set?.senses.find(item => item.id === binding.sense_id);
    const pronunciation = set?.pronunciations.find(item => item.id === sense?.pronunciationId) ?? null;
    const sentence = sense?.dictationSentence?.trim() || null;
    const sentenceVersion = sentence ? (sentences ?? []).find(row =>
      row.canonical_word_id === binding.canonical_word_id && row.sense_id === sense?.id &&
      row.sentence === sentence && row.target_token_index === sense?.dictationTargetTokenIndex) : null;
    if (!sense || fingerprintSnapshotValue(sense) !== fingerprintSnapshotValue(binding.sense_snapshot) ||
      fingerprintSnapshotValue(pronunciation) !== fingerprintSnapshotValue(binding.pronunciation_snapshot ?? null) ||
      sentence && !sentenceVersion) {
      result.set(key, { status: "stale" });
      continue;
    }
    result.set(key, {
      status: "current", senseId: sense.id, meaning: sense.definition, pronunciation,
      dictationSentence: sentence,
      dictationTargetTokenIndex: sense.dictationTargetTokenIndex ?? null,
      dictationAuthorityId: sentenceVersion?.id ?? null,
      dictationSourceHash: sentenceVersion?.source_row_hash ?? null,
    });
  }
  return result;
}
