import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type BritishRecordingKind = "word" | "sentence";
export type BritishRecording = { src: string; sha256: string; source: "dictionary" | "schwa_route" };

/** A changed word or sentence cannot silently inherit approval for old audio. */
export async function approvedBritishRecording(input: {
  client: SupabaseClient; wordId: string; kind: BritishRecordingKind; text: string;
}): Promise<BritishRecording | null> {
  const { client, wordId, kind, text } = input;
  const global = await client.from("teaching_dictionary_british_recording_versions")
    .select("recording_src,sha256").eq("canonical_word_id", wordId).eq("kind", kind)
    .eq("spoken_text", text).order("approved_at", { ascending: false })
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (global.error) throw new Error("DICTIONARY_RECORDING_READ_FAILED");
  if (global.data) return { src: global.data.recording_src, sha256: global.data.sha256, source: "dictionary" };

  // Existing Schwa clips were reviewed for a particular route. Reuse one only
  // when its dictionary fingerprint is current and all matching route clips
  // agree. A route using device voice does not become a British clip here.
  const fingerprint = await client.rpc("teaching_dictionary_route_dictionary_fingerprint", { p_word: wordId });
  if (fingerprint.error || typeof fingerprint.data !== "string") return null;
  const publications = await client.from("adle_weak_vowel_content_publications")
    .select("content_version_id,micro_skill_key,published_at,dictionary_fingerprint")
    .eq("canonical_word_id", wordId).eq("dictionary_fingerprint", fingerprint.data)
    .order("published_at", { ascending: false }).order("content_version_id", { ascending: false }).limit(100);
  if (publications.error) throw new Error("DICTIONARY_SCHWA_RECORDING_READ_FAILED");
  const keys = [...new Set(publications.data.map(row => row.micro_skill_key))];
  if (!keys.length) return null;
  const skills = await client.from("micro_skill_catalog").select("micro_skill_key")
    .in("micro_skill_key", keys).eq("is_active", true).eq("is_assignable", true);
  if (skills.error) throw new Error("DICTIONARY_SCHWA_SKILL_READ_FAILED");
  const activeKeys = new Set(skills.data.map(row => row.micro_skill_key));
  const latest = new Map<string, string>();
  for (const row of publications.data) if (activeKeys.has(row.micro_skill_key) && !latest.has(row.micro_skill_key))
    latest.set(row.micro_skill_key, row.content_version_id);
  if (!latest.size) return null;
  const versions = await client.from("teaching_dictionary_route_content_versions")
    .select("id,content").in("id", [...latest.values()]);
  if (versions.error) throw new Error("DICTIONARY_SCHWA_RECORDING_CONTENT_FAILED");
  const clips = versions.data.map((row) => {
    const content = row.content as { content?: { weakVowel?: {
      wordRecording?: { src?: string; sha256?: string };
      sentenceRecording?: { src?: string; sha256?: string };
    } } };
    return kind === "word" ? content.content?.weakVowel?.wordRecording : content.content?.weakVowel?.sentenceRecording;
  }).filter((clip): clip is { src: string; sha256: string } => Boolean(clip?.src?.startsWith("/audio/") && clip.sha256));
  const identities = new Set(clips.map((clip) => `${clip.src}:${clip.sha256}`));
  return identities.size === 1 ? { ...clips[0], source: "schwa_route" } : null;
}

/** Resolve an exact approved dictionary text; ambiguous words keep device speech. */
export async function britishRecordingForText(input: {
  client: SupabaseClient; text: string; kind: BritishRecordingKind;
}): Promise<BritishRecording | null> {
  const { client, text, kind } = input;
  if (!text.trim() || text.length > 500) return null;
  if (kind === "word") {
    const words = await client.from("canonical_teaching_dictionary_words")
      .select("id,display_word").eq("normalised_word", text.trim().toLocaleLowerCase("en-GB"))
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .eq("dialect_code", "en-GB").limit(2);
    if (words.error) throw new Error("DICTIONARY_AUDIO_WORD_LOOKUP_FAILED");
    if (words.data.length !== 1 || words.data[0].display_word.toLocaleLowerCase("en-GB") !== text.trim().toLocaleLowerCase("en-GB")) return null;
    return approvedBritishRecording({ client, wordId: words.data[0].id, kind, text: words.data[0].display_word });
  }
  const sentences = await client.from("canonical_teaching_dictionary_dictation_sentences")
    .select("canonical_word_id,dictation_sentence").eq("dictation_sentence", text.trim())
    .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").limit(2);
  if (sentences.error) throw new Error("DICTIONARY_AUDIO_SENTENCE_LOOKUP_FAILED");
  if (sentences.data.length !== 1) return null;
  const word = await client.from("canonical_teaching_dictionary_words").select("id")
    .eq("id", sentences.data[0].canonical_word_id).eq("row_status", "active")
    .eq("review_status", "approved_for_first_exposure").eq("dialect_code", "en-GB").maybeSingle();
  if (word.error) throw new Error("DICTIONARY_AUDIO_SENTENCE_WORD_LOOKUP_FAILED");
  if (!word.data) return null;
  return approvedBritishRecording({ client, wordId: sentences.data[0].canonical_word_id, kind,
    text: sentences.data[0].dictation_sentence });
}
