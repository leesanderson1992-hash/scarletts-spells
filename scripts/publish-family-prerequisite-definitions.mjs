#!/usr/bin/env node
/** Governed, idempotent definition publication for approved family prerequisites. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const sourcePath = resolve(ROOT, "data/adle/homophone/convergence-v1/family-prerequisite-definitions.csv");
const source = readFileSync(sourcePath, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const rows = source.trim().split(/\r?\n/).slice(1).map(line => {
  const [word_key, expected_previous_definition, approved_definition, approval_reference] = line.split(",");
  return { word_key, expected_previous_definition, approved_definition, approval_reference };
});
if (rows.length !== 5 || new Set(rows.map(row => row.word_key)).size !== 5 ||
    rows.some(row => !row.approved_definition || !row.approval_reference)) throw new Error("DEFINITION_SOURCE_INVALID");
const envLine = readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!envLine) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
let connectionString = envLine.slice(envLine.indexOf("=") + 1).trim();
if ((connectionString.startsWith("'") && connectionString.endsWith("'")) ||
    (connectionString.startsWith('"') && connectionString.endsWith('"')))
  connectionString = connectionString.slice(1, -1);
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const mode = process.argv[2];
if (!["plan", "release", "verify"].includes(mode)) throw new Error("Use plan, release or verify");
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query(mode === "release" ? "begin" : "begin read only");
  await db.query("set local statement_timeout='30s'");
  const actors = await db.query(`select distinct created_by id from public.teaching_dictionary_manager_drafts
    where source_reference like $1`, ["2026-10-23-reviewed-root-homophone-words-v2:%"]);
  if (actors.rowCount !== 1) throw new Error("REVIEWED_PRODUCTION_ACTOR_NOT_UNIQUE");
  const actor = actors.rows[0].id;
  const result = await db.query(`select w.word_key,w.id,w.normalised_word,w.dialect_code,w.source_row_hash,
    (select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active') metadata_id,
    (select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active') morphology_id,
    (select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active') dictation_id,
    (select definition from public.teaching_dictionary_definition_versions where canonical_word_id=w.id and route_id is null
     order by published_at desc,id desc limit 1) definition
    from public.canonical_teaching_dictionary_words w where w.word_key=any($1::text[]) and w.row_status='active'
    and w.review_status='approved_for_first_exposure' and w.dialect_code='en-GB'`, [rows.map(row => row.word_key)]);
  if (result.rowCount !== 5) throw new Error("CANONICAL_WORD_SET_CHANGED");
  const facts = new Map(result.rows.map(row => [row.word_key, row]));
  let already = 0;
  for (const row of rows) {
    const fact = facts.get(row.word_key);
    if (!fact?.metadata_id || !fact?.morphology_id || !fact?.dictation_id) throw new Error(`MISSING_FACTS:${row.word_key}`);
    if (fact.definition === row.approved_definition) { already++; continue; }
    if ((fact.definition ?? "") !== row.expected_previous_definition) throw new Error(`DEFINITION_CONFLICT:${row.word_key}`);
  }
  if (mode === "verify" && already !== 5) throw new Error(`DEFINITIONS_NOT_FULLY_PUBLISHED:${already}`);
  if (mode !== "release") {
    await db.query("rollback");
    console.log(JSON.stringify({ target: "production", mode, reviewed: 5, alreadyPublished: already,
      remaining: 5 - already, sourceSha256: sourceSha }));
  } else {
    let published = 0;
    for (const row of rows) {
      const fact = facts.get(row.word_key);
      if (fact.definition === row.approved_definition) continue;
      const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
        (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        values ($1,$2,$3,$4::jsonb,'approved_submission',$5,$6) returning id`,
      [fact.id, fact.normalised_word, fact.dialect_code,
        JSON.stringify({ definition: row.approved_definition, routeContents: [] }),
        `family-prerequisite-definitions:${sourceSha}`, actor]);
      await db.query("select public.publish_teaching_dictionary_definition_only($1,$2,$3,$4,$5,$6)",
        [draft.rows[0].id, actor, fact.source_row_hash, fact.metadata_id, fact.dictation_id, fact.morphology_id]);
      published++;
    }
    await db.query("commit");
    console.log(JSON.stringify({ target: "production", mode, published, alreadyPublished: already,
      sourceSha256: sourceSha }));
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
