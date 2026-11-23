import { loadSchwaSyllableAuthority } from "../../teaching-dictionary-manager/schwa-syllable-authority";
import { projectSchwaSyllables } from "../../teaching-dictionary-manager/schwa-syllables";
import { resolveAdleRouteActivationEnvironment } from "../route-activation-environment";
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
  if (!ids.length || ids.length > 100) return [];
  const db = input.client;
  const [publicationResult, wordResult, sharedResult] = await Promise.all([
    db.from("adle_weak_vowel_content_publications")
      .select("content_version_id,canonical_word_id,micro_skill_key,source_fingerprint,content_sha256,dictionary_fingerprint,word_audio_sha256,sentence_audio_sha256,published_at")
      .eq("micro_skill_key", input.microSkillKey).in("canonical_word_id", ids)
      .order("published_at", { ascending: false }).order("content_version_id", { ascending: false }),
    db.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code")
      .in("id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .eq("dialect_code", "en-GB"),
    db.rpc("teaching_dictionary_schwa_shared_facts", { p_words: ids }),
  ]);
  if (publicationResult.error || wordResult.error || sharedResult.error)
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
  const shared = sharedResult.data as { word_id: string; definition: string | null; sentence: string | null }[];
  const definitionById = new Map(shared.map(row => [row.word_id, row.definition ?? ""]));
  const sentenceById = new Map(shared.map(row => [row.word_id, row.sentence ?? ""]));
  const canonical = await db.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id,sense_set").in("canonical_word_id", ids);
  if (canonical.error) throw new Error("WEAK_VOWEL_CANONICAL_FACTS_READ_FAILED");
  const senseIds = Object.fromEntries([...newest].flatMap(([id, publication]) => {
    const content = versionById.get(String(publication.content_version_id))?.content as PublishedWeakVowelWord["routeContent"] | undefined;
    const sense = content?.content?.weakVowel?.canonicalSenseId;
    return sense ? [[id, sense]] : [];
  }));
  const bindings = Object.keys(senseIds).length ? await db.from("teaching_dictionary_effective_lesson_sense_bindings")
    .select("canonical_word_id,sense_id").eq("environment_key", resolveAdleRouteActivationEnvironment() ?? "production")
    .eq("micro_skill_key", input.microSkillKey).in("canonical_word_id", Object.keys(senseIds)) : { data: [], error: null };
  if (bindings.error) throw new Error("WEAK_VOWEL_LESSON_SENSE_READ_FAILED");
  const fingerprints = await db.rpc("teaching_dictionary_schwa_fingerprints", { p_words: ids, p_senses: senseIds });
  if (fingerprints.error || !Array.isArray(fingerprints.data)) throw new Error("WEAK_VOWEL_DICTIONARY_FINGERPRINT_READ_FAILED");
  const fingerprintById = new Map((fingerprints.data as { word_id: string; dictionary_fingerprint: string; sense_fingerprint: string | null }[]).map(row => [row.word_id, row]));
  const syllables = await loadSchwaSyllableAuthority(db, ids, resolveAdleRouteActivationEnvironment() ?? "production");
  const result: PublishedWeakVowelWord[] = [];
  for (const id of ids) {
    const publication = newest.get(id);
    const version = publication ? versionById.get(String(publication.content_version_id)) : null;
    const word = wordById.get(id);
    const content = version?.content as PublishedWeakVowelWord["routeContent"] | undefined;
    const facts = content?.content?.weakVowel;
    const senseSet = canonical.data.find(row => row.canonical_word_id === id)?.sense_set as import("@/lib/teaching-dictionary-manager/senses").DictionarySenseSet | undefined;
    const sense = facts?.canonicalSenseId ? senseSet?.senses.find(row => row.id === facts.canonicalSenseId) : undefined;
    const definition = facts?.canonicalSenseId ? sense?.definition : definitionById.get(id);
    const sentence = facts?.canonicalSenseId ? sense?.dictationSentence : sentenceById.get(id);
    if (!publication || !version || !word || !definition || !sentence || !facts ||
      version.canonical_word_id !== id || version.micro_skill_key !== input.microSkillKey ||
      !version.content || typeof version.content !== "object" || Array.isArray(version.content)) continue;
    const fingerprint = fingerprintById.get(id);
    if (!fingerprint) throw new Error("WEAK_VOWEL_DICTIONARY_FINGERPRINT_READ_FAILED");
    if (facts?.canonicalSenseId && (!fingerprint.sense_fingerprint || fingerprint.sense_fingerprint !== facts.canonicalSenseFingerprint ||
      !bindings.data.some(binding => binding.canonical_word_id === id && binding.sense_id === facts.canonicalSenseId))) continue;
    const authority = syllables.get(`${id}:${input.microSkillKey}`) ?? syllables.get(`${id}:`)!;
    const projection = projectSchwaSyllables(String(word.display_word), authority.divisions, facts!);
    result.push({
      syllableBlockers: [...projection.errors, ...(authority.pending ? ["Dictionary syllable divisions await bulk review and publication."] : [])],
      contentVersionId: String(publication.content_version_id), canonicalWordId: id,
      microSkillKey: input.microSkillKey, spelling: String(word.display_word),
      sourceFingerprint: String(publication.source_fingerprint),
      contentSha256AtPublication: String(publication.content_sha256),
      dictionaryFingerprintAtReview: String(publication.dictionary_fingerprint),
      currentDictionaryFingerprint: fingerprint.dictionary_fingerprint,
      canonicalFactsVerified: Boolean(facts?.canonicalSenseId),
      wordAudioSha256AtPublication: String(publication.word_audio_sha256),
      sentenceAudioSha256AtPublication: String(publication.sentence_audio_sha256),
      definition, sentence,
      routeContent: { ...content!, content: { ...content!.content, weakVowel: projection.facts } },
    });
  }
  return result;
}
