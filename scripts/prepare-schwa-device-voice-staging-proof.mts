#!/usr/bin/env node
/** Review one owner-approved ET word with a temporary device voice in staging. */
import { createHash } from "node:crypto";
import pg from "pg";
import { deviceSpeechSource } from "../lib/adle/weak-vowel/audio-source";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com") || !/^[a-f0-9-]{36}$/i.test(actor ?? ""))
  throw Error("SCHWA_STAGING_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const source = await db.query<{ id: string; canonical_word_id: string; content: Record<string, any>;
    display_word: string; normalised_word: string; dictation_sentence: string }>(`
    select v.id,v.canonical_word_id,v.content,w.display_word,w.normalised_word,
      (select s.dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences s
        where s.canonical_word_id=w.id and s.row_status='active' and s.review_status='approved_for_first_exposure'
        order by s.created_at desc,s.id desc limit 1) dictation_sentence
    from public.adle_weak_vowel_content_publications p
    join public.teaching_dictionary_route_content_versions v on v.id=p.content_version_id
    join public.canonical_teaching_dictionary_words w on w.id=v.canonical_word_id
    where w.normalised_word='basket' and v.micro_skill_key='D4_SCHWA_FINAL_ET'
    order by p.published_at desc,p.content_version_id desc limit 1`);
  if (source.rowCount !== 1 || !source.rows[0].dictation_sentence) throw Error("STAGING_BASKET_REVIEWED_SOURCE_MISSING");
  const row = source.rows[0];
  const content = structuredClone(row.content);
  const facts = content.content?.weakVowel;
  if (!facts) throw Error("STAGING_BASKET_FACTS_MISSING");
  const sha = (src: string) => createHash("sha256").update(src).digest("hex");
  const wordSrc = deviceSpeechSource(row.display_word);
  const sentenceSrc = deviceSpeechSource(row.dictation_sentence);
  facts.wordRecording = { src: wordSrc, sha256: sha(wordSrc) };
  facts.sentenceRecording = { src: sentenceSrc, sha256: sha(sentenceSrc) };
  facts.pronunciationId = `device-voice:${row.normalised_word}`;
  facts.reviewSourceReference = "Owner-approved ET word facts and device-voice fallback; staging proof 2026-10-28";
  const blockers = weakVowelRouteBlockers(facts, { displayWord: row.display_word,
    dictationSentence: row.dictation_sentence, definition: content.wordMeaning,
    microSkillKey: "D4_SCHWA_FINAL_ET" });
  if (blockers.length) throw Error(`STAGING_DEVICE_VOICE_FACTS_BLOCKED:${blockers.join(";")}`);
  const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
    [row.canonical_word_id,row.normalised_word,JSON.stringify({ displayWord: row.display_word,
      definition: content.wordMeaning, dictationSentence: row.dictation_sentence,
      skillKeys: ["D4_SCHWA_FINAL_ET"], routeContents: [content],
      canonicalMorphology: { parts: [], joins: [], transformations: [] } }),
    "Disposable staging device-voice lesson proof",actor]);
  const staged = await db.query<{ ids: string[] }>(
    "select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
  if (staged.rows[0].ids.length !== 1) throw Error("STAGING_DEVICE_VOICE_STAGE_FAILED");
  const versionId = staged.rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [versionId,actor]);
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", status: apply ? "reviewed_pending_reconciliation" : "rollback_proof",
    word: row.normalised_word, contentVersionId: versionId, previousContentVersionId: row.id }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
