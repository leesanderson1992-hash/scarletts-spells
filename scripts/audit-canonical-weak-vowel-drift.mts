/** Read-only batch classification of current weak-vowel publications. */
import assert from "node:assert/strict";
import pg from "pg";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

const environment = process.argv[2];
assert(environment === "production" || environment === "staging",
  "Usage: tsx scripts/audit-canonical-weak-vowel-drift.mts production|staging");
const key = environment === "production" ? "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED" : "SUPABASE_STAGING_DB_URL";
delete process.env[key];
process.loadEnvFile(environment === "production" ? ".env.local" : ".env.staging.local");
const url = process.env[key];
assert(url, "Database URL required");
assert.equal(new URL(url).username.split(".").at(-1),
  environment === "production" ? "wwohrqtunajrbwxyssjf" : "qkpjbajicacbrphthibk");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin read only");
  const result = await db.query(`with current_publication as (
      select distinct on (p.canonical_word_id,p.micro_skill_key) p.*
      from public.adle_weak_vowel_content_publications p
      order by p.canonical_word_id,p.micro_skill_key,p.published_at desc,p.content_version_id desc
    )
    select w.display_word,w.row_status,w.review_status,p.canonical_word_id,p.micro_skill_key,
      p.source_fingerprint,p.content_sha256,p.dictionary_fingerprint,p.word_audio_sha256,
      p.sentence_audio_sha256,
      public.teaching_dictionary_route_dictionary_fingerprint(p.canonical_word_id) current_fingerprint,
      v.route_id,v.route_version,v.content,
      d.definition,s.dictation_sentence
    from current_publication p
    join public.canonical_teaching_dictionary_words w on w.id=p.canonical_word_id
    join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
    left join lateral (select definition from public.teaching_dictionary_definition_versions
      where canonical_word_id=w.id and route_id is null order by published_at desc,id desc limit 1) d on true
    left join lateral (select dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences
      where canonical_word_id=w.id and row_status='active' and review_status='approved_for_first_exposure'
      order by created_at desc,id desc limit 1) s on true
    order by w.display_word,p.micro_skill_key`);
  const categories = new Map<string, { count: number; examples: string[] }>();
  const add = (category: string, word: string) => {
    const item = categories.get(category) ?? { count: 0, examples: [] };
    item.count++;
    if (item.examples.length < 8) item.examples.push(word);
    categories.set(category, item);
  };
  for (const row of result.rows) {
    const word = `${row.display_word}:${row.micro_skill_key}`;
    const route = row.content;
    const facts = route?.content?.weakVowel;
    const blockers = facts && row.definition && row.dictation_sentence
      ? weakVowelRouteBlockers(facts, { displayWord: row.display_word,
        dictationSentence: row.dictation_sentence, definition: row.definition,
        microSkillKey: row.micro_skill_key }) : ["missing_route_or_dictionary_facts"];
    const mismatches = [
      row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" ? "word_unapproved" : null,
      row.dictionary_fingerprint !== row.current_fingerprint ? "dictionary_fingerprint_changed" : null,
      route?.wordMeaning !== row.definition ? "meaning_changed" : null,
      row.source_fingerprint !== facts?.sourceFingerprint ? "source_fingerprint_changed" : null,
      row.word_audio_sha256 !== facts?.wordRecording?.sha256 ||
        row.sentence_audio_sha256 !== facts?.sentenceRecording?.sha256 ? "audio_identity_changed" : null,
      row.route_id !== "weak_vowel_word_lab" || row.route_version !== "v1" ? "route_version_changed" : null,
      ...blockers,
    ].filter(Boolean) as string[];
    if (!mismatches.length) add("current", word);
    else if (mismatches.length === 1 && mismatches[0] === "dictionary_fingerprint_changed")
      add("fingerprint_only_drift", word);
    else for (const mismatch of new Set(mismatches)) add(`review:${mismatch}`, word);
  }
  console.log(JSON.stringify({ environment, currentPublicationPairs: result.rows.length,
    categories: Object.fromEntries([...categories].sort(([a], [b]) => a.localeCompare(b))) }, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
