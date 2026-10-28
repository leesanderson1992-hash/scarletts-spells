#!/usr/bin/env node
/** Copy only the 14 owner-reviewed canonical word facts into the disposable staging dictionary. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
const expectedStagingRef = process.env.SUPABASE_STAGING_PROJECT_REF;
const productionUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stagingUrl = process.env.SUPABASE_STAGING_DB_URL;
if (!expectedStagingRef || !new URL(stagingUrl).username.endsWith(expectedStagingRef) ||
  !new URL(stagingUrl).hostname.endsWith("pooler.supabase.com") ||
  !new URL(productionUrl).username.includes("wwohrqtunajrbwxyssjf")) throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!/^[a-f0-9-]{36}$/i.test(actor ?? "")) throw Error("STAGING_ADMIN_ACTOR_REQUIRED");
const reviewed = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-final-et-al-reviewed-word-facts.json", "utf8"));
const rows = reviewed.rows;
if (rows.length !== 14 || new Set(rows.map(row => row.canonicalWordId)).size !== 14 ||
  rows.some(row => row.reviewStatus !== "owner_approved_word_facts")) throw Error("REVIEW_SET_CHANGED");
const ids = rows.map(row => row.canonicalWordId);
const prod = new pg.Client({ connectionString: productionUrl, ssl: { rejectUnauthorized: false } });
const stage = new pg.Client({ connectionString: stagingUrl, ssl: { rejectUnauthorized: false } });

async function byWord(client, table, where = "") {
  const result = await client.query(`select * from public.${table} where canonical_word_id=any($1::uuid[]) ${where}`, [ids]);
  return result.rows;
}
async function insertRow(table, row) {
  const columns = Object.keys(row);
  const quoted = columns.map(column => `"${column}"`).join(",");
  const values = columns.map((_, index) => `$${index + 1}`).join(",");
  await stage.query(`insert into public.${table} (${quoted}) values (${values})`, columns.map(column => row[column]));
}
await prod.connect();
await stage.connect();
try {
  await prod.query("begin read only");
  const words = (await prod.query("select * from public.canonical_teaching_dictionary_words where id=any($1::uuid[]) and row_status='active' and review_status='approved_for_first_exposure'", [ids])).rows;
  const metadata = await byWord(prod, "canonical_teaching_dictionary_word_metadata", "and row_status='active'");
  const sentences = await byWord(prod, "canonical_teaching_dictionary_dictation_sentences", "and row_status='active' and review_status='approved_for_first_exposure'");
  const batches = (await prod.query("select * from public.canonical_teaching_dictionary_import_batches where id=any($1::uuid[])", [[...new Set([...words, ...metadata, ...sentences].map(row => row.import_batch_id))]])).rows;
  if (words.length !== 14 || metadata.length !== 14 || sentences.length !== 14 || batches.length < 1) throw Error("PRODUCTION_CANONICAL_SOURCE_INCOMPLETE");
  for (const row of rows) {
    const word = words.find(item => item.id === row.canonicalWordId);
    const sentence = sentences.find(item => item.canonical_word_id === row.canonicalWordId);
    if (word?.display_word !== row.word || sentence?.dictation_sentence !== row.dictationSentence) throw Error(`REVIEW_SOURCE_CHANGED:${row.word}`);
  }
  await prod.query("rollback");
  await stage.query("begin");
  await stage.query("set local lock_timeout='5s'");
  await stage.query("set local statement_timeout='90s'");
  const stageWords = (await stage.query("select id,display_word from public.canonical_teaching_dictionary_words where id=any($1::uuid[])", [ids])).rows;
  for (const item of stageWords) if (rows.find(row => row.canonicalWordId === item.id)?.word !== item.display_word) throw Error("STAGING_CANONICAL_ID_CONFLICT");
  const existing = new Set(stageWords.map(row => row.id));
  const missing = words.filter(row => !existing.has(row.id));
  for (const batch of batches) {
    const found = await stage.query("select id from public.canonical_teaching_dictionary_import_batches where id=$1", [batch.id]);
    if (!found.rowCount) await insertRow("canonical_teaching_dictionary_import_batches", batch);
  }
  for (const word of missing) await insertRow("canonical_teaching_dictionary_words", word);
  for (const row of metadata.filter(row => !existing.has(row.canonical_word_id))) await insertRow("canonical_teaching_dictionary_word_metadata", row);
  for (const row of sentences.filter(row => !existing.has(row.canonical_word_id))) await insertRow("canonical_teaching_dictionary_dictation_sentences", row);
  for (const row of rows) {
    const existingDefinition = await stage.query("select definition from public.teaching_dictionary_definition_versions where canonical_word_id=$1 and route_id is null order by published_at desc,id desc limit 1", [row.canonicalWordId]);
    if (existingDefinition.rowCount && existingDefinition.rows[0].definition !== row.routeContent.wordMeaning) throw Error(`STAGING_DEFINITION_CONFLICT:${row.word}`);
    if (existingDefinition.rowCount) continue;
    const draft = await stage.query("insert into public.teaching_dictionary_manager_drafts(canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by) values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id", [row.canonicalWordId,row.word,JSON.stringify({displayWord:row.word,definition:row.routeContent.wordMeaning,dictationSentence:row.dictationSentence}),`Staging fixture for owner-reviewed ${row.microSkillKey} 2026-10-28`,actor]);
    await stage.query("insert into public.teaching_dictionary_definition_versions(canonical_word_id,route_id,micro_skill_key,definition,draft_id) values($1,null,null,$2,$3)",[row.canonicalWordId,row.routeContent.wordMeaning,draft.rows[0].id]);
  }
  const proof = await stage.query("select count(*)::int n from public.canonical_teaching_dictionary_words where id=any($1::uuid[]) and row_status='active' and review_status='approved_for_first_exposure'", [ids]);
  if (proof.rows[0].n !== 14) throw Error("STAGING_WORD_READBACK_FAILED");
  if (apply) await stage.query("commit"); else await stage.query("rollback");
  console.log(JSON.stringify({environment:"staging",mode:apply?"applied":"rollback_proof",canonicalWords:14,insertedWords:missing.length,definitions:14,durableWrites:apply?"bounded_staging_fixture":0}));
} catch (error) {
  await prod.query("rollback").catch(() => undefined);
  await stage.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await prod.end();
  await stage.end();
}
