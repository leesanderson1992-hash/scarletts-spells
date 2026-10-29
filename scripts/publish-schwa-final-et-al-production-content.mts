#!/usr/bin/env node
/** Governed, bounded publication of the 14 owner-reviewed final Schwa word facts. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw Error("PRODUCTION_TARGET_MISMATCH");
const actor = process.env.ADMIN_USER_IDS?.split(",")[0]?.trim();
if (!actor || !/^[a-f0-9-]{36}$/i.test(actor)) throw Error("PRODUCTION_ADMIN_ACTOR_REQUIRED");
const apply = process.argv.includes("--apply");
const approvedRebind = new Set(["basket", "actual", "factual"]);
const reviewed = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-final-et-al-reviewed-word-facts.json", "utf8")) as {
  rows: Array<{ canonicalWordId: string; word: string; microSkillKey: string; sourceFingerprint: string;
    reviewStatus: string; dictationSentence: string; routeContent: { wordMeaning: string;
      content: { weakVowel: Record<string, unknown> & { wordRecording: { src: string; sha256: string };
        sentenceRecording: { src: string; sha256: string } } } } }>;
};
if (reviewed.rows.length !== 14 || reviewed.rows.some(row => row.reviewStatus !== "owner_approved_word_facts"))
  throw Error("REVIEWED_FACTS_CHANGED");
const inventory = await loadWeakVowelRepairInventory(url, "production");
const sources = new Map(inventory.sources.filter(row => row.assignmentStatus === "assigned")
  .map(row => [`${row.word.id}|${row.microSkillKey}`, row]));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const admin = await db.query<{ id: string }>("select id from auth.users where id=$1::uuid", [actor]);
  if (admin.rowCount !== 1) throw Error("ADMIN_ACTOR_NOT_FOUND");
  const existing = await db.query<{ n: number }>("select count(*)::int n from public.adle_weak_vowel_content_publications where micro_skill_key in ('D4_SCHWA_FINAL_ET','D4_SCHWA_FINAL_AL')");
  if (existing.rows[0].n !== 0) throw Error("NEW_SKILL_PUBLICATIONS_ALREADY_EXIST");
  const rebound: string[] = [];
  for (const row of reviewed.rows) {
    const source = sources.get(`${row.canonicalWordId}|${row.microSkillKey}`);
    if (!source || source.word.display_word !== row.word || source.word.review_status !== "approved_for_first_exposure")
      throw Error(`APPROVED_PAIR_CHANGED:${row.word}`);
    const fingerprint = repairSourceFingerprint(source);
    if (fingerprint !== row.sourceFingerprint) {
      if (!approvedRebind.has(row.word)) throw Error(`UNREVIEWED_SOURCE_CHANGE:${row.word}`);
      rebound.push(row.word);
    }
    const dictionary = await db.query<{ definition: string; sentence: string }>(`
      select (select definition from public.teaching_dictionary_definition_versions where canonical_word_id=$1::uuid and route_id is null order by published_at desc,id desc limit 1) definition,
        (select dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1::uuid and row_status='active' and review_status='approved_for_first_exposure' order by created_at desc,id desc limit 1) sentence`, [row.canonicalWordId]);
    if (dictionary.rows[0]?.definition !== row.routeContent.wordMeaning ||
      dictionary.rows[0]?.sentence !== row.dictationSentence) throw Error(`SHARED_FACT_CHANGED:${row.word}`);
    const content = structuredClone(row.routeContent);
    content.content.weakVowel.sourceFingerprint = fingerprint;
    const facts = content.content.weakVowel;
    const blockers = weakVowelRouteBlockers(facts as never, { displayWord: row.word,
      dictationSentence: row.dictationSentence, definition: content.wordMeaning, microSkillKey: row.microSkillKey });
    if (blockers.length) throw Error(`CONTENT_BLOCKED:${row.word}:${blockers.join(",")}`);
    for (const clip of [facts.wordRecording, facts.sentenceRecording]) {
      if (!/^\/audio\/[a-z0-9/_-]+\.(?:mp3|wav)$/i.test(clip.src) ||
        createHash("sha256").update(readFileSync(`public/.${clip.src}`)).digest("hex") !== clip.sha256)
        throw Error(`AUDIO_HASH_CHANGED:${row.word}`);
    }
    const payload = { displayWord: row.word, definition: content.wordMeaning,
      dictationSentence: row.dictationSentence, skillKeys: [row.microSkillKey], routeContents: [content],
      canonicalMorphology: { parts: [], joins: [], transformations: [] } };
    const draft = await db.query<{ id: string }>(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
      [row.canonicalWordId,row.word,JSON.stringify(payload),`Owner-approved final Schwa facts 2026-10-28; Production source review 2026-10-29`,actor]);
    const staged = await db.query<{ ids: string[] }>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids", [draft.rows[0].id,actor]);
    if (staged.rows[0].ids.length !== 1) throw Error(`ROUTE_STAGE_FAILED:${row.word}`);
    const version = staged.rows[0].ids[0];
    await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)", [version,actor]);
    await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
      [version,actor,fingerprint,facts.wordRecording.sha256,facts.sentenceRecording.sha256]);
  }
  if (rebound.sort().join(",") !== "actual,basket,factual") throw Error("REVIEWED_REBIND_SET_CHANGED");
  const proof = await db.query<{ n: number }>("select count(*)::int n from public.adle_weak_vowel_content_publications where micro_skill_key in ('D4_SCHWA_FINAL_ET','D4_SCHWA_FINAL_AL')");
  if (proof.rows[0].n !== 14) throw Error("PUBLICATION_READBACK_FAILED");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "production", status: apply ? "published" : "rollback_proof",
    reviewedWords: 14, rebound, publications: proof.rows[0].n }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
