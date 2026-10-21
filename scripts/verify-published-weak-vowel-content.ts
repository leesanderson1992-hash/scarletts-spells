#!/usr/bin/env node
/** Independent production readback of exact published route facts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

type Row = { canonical_word_id: string; micro_skill_key: string; display_word: string;
  source_fingerprint: string; word_audio_sha256: string; sentence_audio_sha256: string;
  dictionary_fingerprint: string; current_dictionary_fingerprint: string;
  content_sha256: string; current_content_sha256: string;
  definition: string | null; sentence: string | null;
  content: { wordMeaning: string; content: { weakVowel: unknown } } };

async function main() {
  const index = process.argv.indexOf("--env-file");
  if (index >= 0) process.loadEnvFile(resolve(process.argv[index + 1]));
  const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
  const target = new URL(url);
  if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
    throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
  const pkg = JSON.parse(readFileSync(resolve("content/secret-life-of-vowels/weak-vowel-route-content-candidates.json"), "utf8")) as {
    rows: Array<{ canonicalWordId: string; spelling: string; microSkillKey: string;
      sourceFingerprint: string; routeContent: { content: { weakVowel: {
        wordRecording: { sha256: string }; sentenceRecording: { sha256: string } } } } }> };
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let rows: Row[];
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query<Row>(`
      select p.canonical_word_id,p.micro_skill_key,w.display_word,p.source_fingerprint,
        p.word_audio_sha256,p.sentence_audio_sha256,p.dictionary_fingerprint,
        public.teaching_dictionary_route_dictionary_fingerprint(p.canonical_word_id) current_dictionary_fingerprint,
        p.content_sha256,
        encode(extensions.digest(convert_to(v.content::text,'UTF8'),'sha256'),'hex') current_content_sha256,
        definition.definition,sentence.dictation_sentence sentence,v.content
      from public.adle_weak_vowel_content_publications p
      join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
      join public.canonical_teaching_dictionary_words w on w.id=p.canonical_word_id
      left join lateral (select d.definition from public.teaching_dictionary_definition_versions d
        where d.canonical_word_id=p.canonical_word_id and d.route_id is null
        order by d.published_at desc,d.id desc limit 1) definition on true
      left join lateral (select s.dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences s
        where s.canonical_word_id=p.canonical_word_id and s.row_status='active'
          and s.review_status='approved_for_first_exposure'
        order by s.created_at desc,s.id desc limit 1) sentence on true`);
    rows = result.rows;
    await client.query("ROLLBACK");
  } finally { await client.end(); }
  const expected = new Map(pkg.rows.map((row) => [`${row.canonicalWordId}|${row.microSkillKey}`, row]));
  const failures: string[] = [];
  const skills = new Set<string>();
  for (const row of rows) {
    const pair = `${row.canonical_word_id}|${row.micro_skill_key}`;
    const candidate = expected.get(pair);
    if (!candidate) { failures.push(`${pair}:unexpected_publication`); continue; }
    expected.delete(pair);
    skills.add(row.micro_skill_key);
    if (row.display_word !== candidate.spelling || row.source_fingerprint !== candidate.sourceFingerprint ||
      row.word_audio_sha256 !== candidate.routeContent.content.weakVowel.wordRecording.sha256 ||
      row.sentence_audio_sha256 !== candidate.routeContent.content.weakVowel.sentenceRecording.sha256 ||
      row.dictionary_fingerprint !== row.current_dictionary_fingerprint ||
      row.content_sha256 !== row.current_content_sha256 ||
      row.definition !== row.content.wordMeaning || !row.sentence)
      failures.push(`${pair}:publication_or_shared_source_changed`);
    for (const blocker of weakVowelRouteBlockers(row.content.content.weakVowel, {
      displayWord: row.display_word, definition: row.definition ?? "",
      dictationSentence: row.sentence ?? "", microSkillKey: row.micro_skill_key }))
      failures.push(`${pair}:${blocker}`);
  }
  for (const pair of expected.keys()) failures.push(`${pair}:publication_missing`);
  const status = { target: "production", skills: skills.size, expected: pkg.rows.length, read: rows.length, failures };
  console.log(JSON.stringify(status, null, 2));
  if (failures.length || rows.length !== pkg.rows.length || skills.size !== 8) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
