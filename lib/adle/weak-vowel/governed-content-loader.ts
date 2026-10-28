import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeakVowelMicroSkill } from "./lesson";
import type { PublishedWeakVowelWord } from "./governed-content";

type Row = Record<string, unknown>;

/** Load only immutable, reviewed publications for the exact selected words.
 * A missing publication stays missing; this loader never fills with another
 * word or falls back to an unreviewed route draft. */
export async function loadPublishedWeakVowelWords(input: {
  client: SupabaseClient;
  microSkillKey: WeakVowelMicroSkill;
  canonicalWordIds: readonly string[];
}): Promise<PublishedWeakVowelWord[]> {
  const ids = [...new Set(input.canonicalWordIds)];
  if (!ids.length || ids.length > 6) return [];
  const db = input.client;
  const [publicationResult, wordResult, definitionResult, sentenceResult] = await Promise.all([
    db.from("adle_weak_vowel_content_publications")
      .select("content_version_id,canonical_word_id,micro_skill_key,source_fingerprint,content_sha256,dictionary_fingerprint,word_audio_sha256,sentence_audio_sha256,published_at")
      .eq("micro_skill_key", input.microSkillKey).in("canonical_word_id", ids)
      .order("published_at", { ascending: false }).order("content_version_id", { ascending: false }),
    db.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code")
      .in("id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .eq("dialect_code", "en-GB"),
    db.from("teaching_dictionary_definition_versions").select("id,canonical_word_id,definition,published_at")
      .in("canonical_word_id", ids).is("route_id", null).order("published_at", { ascending: false }),
    db.from("canonical_teaching_dictionary_dictation_sentences")
      .select("id,canonical_word_id,dictation_sentence,row_status,review_status,created_at")
      .in("canonical_word_id", ids).eq("row_status", "active")
      .order("created_at", { ascending: false }),
  ]);
  if (publicationResult.error || wordResult.error || definitionResult.error || sentenceResult.error)
    throw new Error("WEAK_VOWEL_PUBLISHED_CONTENT_READ_FAILED");
  const newest = new Map<string, Row>();
  for (const row of (publicationResult.data ?? []) as Row[]) {
    const id = String(row.canonical_word_id);
    if (!newest.has(id)) newest.set(id, row);
  }
  if (!newest.size) return [];
  const versionIds = [...newest.values()].map((row) => String(row.content_version_id));
  const versions = await db.from("teaching_dictionary_route_content_versions")
    .select("id,canonical_word_id,route_id,route_version,micro_skill_key,content")
    .in("id", versionIds).eq("route_id", "weak_vowel_word_lab").eq("route_version", "v1");
  if (versions.error) throw new Error("WEAK_VOWEL_PUBLISHED_VERSION_READ_FAILED");
  const versionById = new Map(((versions.data ?? []) as Row[]).map((row) => [String(row.id), row]));
  const wordById = new Map(((wordResult.data ?? []) as Row[]).map((row) => [String(row.id), row]));
  const definitionById = new Map<string, string>();
  for (const row of (definitionResult.data ?? []) as Row[]) {
    const id = String(row.canonical_word_id);
    if (!definitionById.has(id)) definitionById.set(id, String(row.definition));
  }
  const sentenceById = new Map<string, string>();
  for (const row of (sentenceResult.data ?? []) as Row[]) {
    const id = String(row.canonical_word_id);
    if (!sentenceById.has(id) && row.review_status === "approved_for_first_exposure")
      sentenceById.set(id, String(row.dictation_sentence));
  }
  const result: PublishedWeakVowelWord[] = [];
  for (const id of ids) {
    const publication = newest.get(id);
    const version = publication ? versionById.get(String(publication.content_version_id)) : null;
    const word = wordById.get(id);
    const definition = definitionById.get(id);
    const sentence = sentenceById.get(id);
    if (!publication || !version || !word || !definition || !sentence ||
      version.canonical_word_id !== id || version.micro_skill_key !== input.microSkillKey ||
      !version.content || typeof version.content !== "object" || Array.isArray(version.content)) continue;
    const fingerprint = await db.rpc("teaching_dictionary_route_dictionary_fingerprint", { p_word: id });
    if (fingerprint.error || typeof fingerprint.data !== "string")
      throw new Error("WEAK_VOWEL_DICTIONARY_FINGERPRINT_READ_FAILED");
    result.push({
      contentVersionId: String(publication.content_version_id), canonicalWordId: id,
      microSkillKey: input.microSkillKey, spelling: String(word.display_word),
      sourceFingerprint: String(publication.source_fingerprint),
      contentSha256AtPublication: String(publication.content_sha256),
      dictionaryFingerprintAtReview: String(publication.dictionary_fingerprint),
      currentDictionaryFingerprint: fingerprint.data,
      wordAudioSha256AtPublication: String(publication.word_audio_sha256),
      sentenceAudioSha256AtPublication: String(publication.sentence_audio_sha256),
      definition, sentence,
      routeContent: version.content as PublishedWeakVowelWord["routeContent"],
    });
  }
  return result;
}
