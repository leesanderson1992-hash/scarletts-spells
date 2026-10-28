import "server-only";
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { weakVowelRouteBlockers } from "@/lib/teaching-dictionary-manager/weak-vowel-authoring";
import { loadCanonicalWordSkillRelationshipAuthority } from "../word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "../../writing-engine/whole-writing/knowledge-repository";
import { isDeviceSpeechSource } from "./audio-source";

type Environment = "local" | "staging" | "production";
type Review = { content_version_id: string; reviewed_by: string };
type Version = { id: string; canonical_word_id: string; micro_skill_key: string;
  published_at: string; content: Record<string, unknown> };

/** Read-only during page loads; a scheduled service-role caller runs this reconciler. */
export async function reconcileWeakVowelPublications(input: {
  client: SupabaseClient; environment: Environment; limit?: number;
}) {
  const { client, environment } = input;
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200));
  const reviews: Review[] = [];
  for (let page = 0; ; page++) {
    const result = await client.from("teaching_dictionary_route_content_reviews")
      .select("content_version_id,reviewed_by").order("content_version_id")
      .range(page * 500, page * 500 + 499);
    if (result.error) throw new Error(`SCHWA_RECONCILIATION_REVIEWS:${result.error.message}`);
    reviews.push(...result.data);
    if (result.data.length < 500) break;
  }
  const candidates: Array<{ review: Review; version: Version }> = [];
  for (let start = 0; start < reviews.length; start += 100) {
    const batch = reviews.slice(start, start + 100);
    const ids = batch.map((row) => row.content_version_id);
    const [versions, publications] = await Promise.all([
      client.from("teaching_dictionary_route_content_versions")
        .select("id,canonical_word_id,micro_skill_key,published_at,content").in("id", ids)
        .eq("route_id", "weak_vowel_word_lab").eq("route_version", "v1"),
      client.from("adle_weak_vowel_content_publications").select("content_version_id").in("content_version_id", ids),
    ]);
    if (versions.error || publications.error) throw new Error("SCHWA_RECONCILIATION_CANDIDATES_READ_FAILED");
    const published = new Set(publications.data.map((row) => row.content_version_id));
    const byId = new Map((versions.data as Version[]).map((row) => [row.id, row]));
    for (const review of batch) {
      const version = byId.get(review.content_version_id);
      if (version && !published.has(version.id)) candidates.push({ review, version });
    }
  }
  // Only the newest reviewed version of a pair is actionable. A rotating
  // bounded batch prevents an old incomplete pair from starving later pairs.
  const newestByPair = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.version.canonical_word_id}:${candidate.version.micro_skill_key}`;
    const current = newestByPair.get(key);
    if (!current || candidate.version.published_at > current.version.published_at ||
      candidate.version.published_at === current.version.published_at && candidate.version.id > current.version.id)
      newestByPair.set(key, candidate);
  }
  const actionable = [...newestByPair.values()].sort((a, b) =>
    a.version.published_at.localeCompare(b.version.published_at) || a.version.id.localeCompare(b.version.id));
  const pageCount = Math.max(1, Math.ceil(actionable.length / limit));
  const page = Math.floor(Date.now() / 86_400_000) % pageCount;
  const batch = actionable.slice(page * limit, (page + 1) * limit);
  const ids = [...new Set(batch.map((entry) => entry.version.canonical_word_id))];
  const associations = ids.length ? await loadPublishedWritingAssociations(client, environment, ids) : [];
  const authority = ids.length ? await loadCanonicalWordSkillRelationshipAuthority({
    client, environmentKey: environment, canonicalWordIds: ids, explicitReviewedAssociations: associations,
  }) : { relationships: [] };
  const skills = [...new Set(batch.map((entry) => entry.version.micro_skill_key))];
  const catalog = skills.length ? await client.from("micro_skill_catalog")
    .select("micro_skill_key").in("micro_skill_key", skills).eq("is_active", true).eq("is_assignable", true)
    : { data: [], error: null };
  if (catalog.error) throw new Error("SCHWA_RECONCILIATION_CATALOG_READ_FAILED");
  const activeSkills = new Set(catalog.data.map((row) => row.micro_skill_key));
  const results: Array<{ wordId: string; skill: string; status: string; blockers: string[] }> = [];
  for (const { review, version } of batch) {
    const pair = authority.relationships.some((row) => row.canonicalWordId === version.canonical_word_id &&
      row.microSkillKey === version.micro_skill_key);
    const result = { wordId: version.canonical_word_id, skill: version.micro_skill_key,
      status: "pending", blockers: [] as string[] };
    if (!activeSkills.has(version.micro_skill_key)) result.blockers.push("micro_skill_retired_or_inactive");
    if (!pair) result.blockers.push("approved_word_skill_relationship_missing");
    const latest = await client.from("teaching_dictionary_route_content_versions")
      .select("id").eq("canonical_word_id", version.canonical_word_id)
      .eq("micro_skill_key", version.micro_skill_key).eq("route_id", "weak_vowel_word_lab")
      .eq("route_version", "v1").order("published_at", { ascending: false })
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error("SCHWA_RECONCILIATION_VERSION_READ_FAILED");
    if (latest.data?.id !== version.id) result.blockers.push("reviewed_version_superseded");
    const content = version.content as { wordMeaning?: string; content?: { weakVowel?: unknown } };
    const word = await client.from("canonical_teaching_dictionary_words")
      .select("display_word,row_status,review_status,dialect_code").eq("id", version.canonical_word_id).single();
    const sentence = await client.from("canonical_teaching_dictionary_dictation_sentences")
      .select("dictation_sentence").eq("canonical_word_id", version.canonical_word_id)
      .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (word.error || sentence.error) throw new Error("SCHWA_RECONCILIATION_DICTIONARY_READ_FAILED");
    if (!word.data || word.data.row_status !== "active" || word.data.review_status !== "approved_for_first_exposure" ||
      word.data.dialect_code !== "en-GB") result.blockers.push("canonical_word_unapproved");
    if (!sentence.data) result.blockers.push("approved_dictation_sentence_missing");
    if (word.data && sentence.data) result.blockers.push(...weakVowelRouteBlockers(content.content?.weakVowel, {
      displayWord: word.data.display_word, dictationSentence: sentence.data.dictation_sentence,
      definition: content.wordMeaning ?? "", microSkillKey: version.micro_skill_key,
    }));
    if (result.blockers.length) { results.push(result); continue; }
    const facts = content.content!.weakVowel as { sourceFingerprint: string;
      wordRecording: { src: string; sha256: string }; sentenceRecording: { src: string; sha256: string } };
    for (const recording of [facts.wordRecording, facts.sentenceRecording]) {
      if (isDeviceSpeechSource(recording.src) &&
        createHash("sha256").update(recording.src).digest("hex") !== recording.sha256)
        result.blockers.push("device_speech_identity_changed");
    }
    if (result.blockers.length) { results.push(result); continue; }
    const published = await client.rpc("publish_adle_weak_vowel_content_v1", {
      p_content_version: version.id, p_actor: review.reviewed_by,
      p_expected_source_fingerprint: facts.sourceFingerprint,
      p_expected_word_audio_sha256: facts.wordRecording.sha256,
      p_expected_sentence_audio_sha256: facts.sentenceRecording.sha256,
    });
    if (published.error) result.blockers.push(published.error.message.match(/WEAK_VOWEL_[A-Z_]+/)?.[0] ?? "publication_failed");
    else result.status = "published";
    results.push(result);
  }
  return { examined: results.length, backlog: actionable.length, batch: page + 1, batches: pageCount,
    published: results.filter((row) => row.status === "published").length,
    pending: results.filter((row) => row.status !== "published") };
}
