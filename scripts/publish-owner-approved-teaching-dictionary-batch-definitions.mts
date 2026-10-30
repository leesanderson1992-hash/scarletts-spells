#!/usr/bin/env node
/** Governed definition-only publication for the owner-approved 304-word batch. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const target = process.argv[2];
const mode = process.argv[3];
if (!(["staging", "production"].includes(target) && ["plan", "release", "verify"].includes(mode))) {
  throw new Error("Usage: publish-owner-approved-teaching-dictionary-batch-definitions.ts staging|production plan|release|verify");
}
const sourcePath = resolve("outputs/teaching-dictionary-import-plan-2026-10-30/definition-publication-candidates.csv");
const source = readFileSync(sourcePath, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const rows = parseCsv(source);
if (rows.length !== 304 || new Set(rows.map((row) => row.word_key)).size !== 304 ||
    rows.some((row) => !row.definition || row.publication_status !== "prepared_after_canonical_import")) {
  throw new Error("OWNER_APPROVED_DEFINITION_SOURCE_INVALID");
}
const connectionString = target === "staging"
  ? process.env.SUPABASE_STAGING_DB_URL
  : process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!connectionString) throw new Error(`${target} database URL required`);
const identity = new URL(connectionString);
const expectedProject = target === "staging" ? process.env.SUPABASE_STAGING_PROJECT_REF : "wwohrqtunajrbwxyssjf";
if (!expectedProject || !`${identity.hostname}|${decodeURIComponent(identity.username)}`.includes(expectedProject)) {
  throw new Error(`${target} database target mismatch`);
}
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query(mode === "release" ? "begin" : "begin read only");
  await db.query("set local statement_timeout='60s'");
  const result = await db.query(`select w.word_key,w.id,w.normalised_word,w.dialect_code,w.source_row_hash,
    (select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active') metadata_id,
    (select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active') morphology_id,
    (select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active') dictation_id,
    (select definition from public.teaching_dictionary_definition_versions where canonical_word_id=w.id and route_id is null
      order by published_at desc,id desc limit 1) definition
    from public.canonical_teaching_dictionary_words w
    where w.word_key=any($1::text[]) and w.row_status='active' and w.review_status='approved_for_first_exposure'
      and w.dialect_code='en-GB'`, [rows.map((row) => row.word_key)]);
  if (result.rowCount !== 304) throw new Error(`CANONICAL_WORD_SET_CHANGED:${result.rowCount}`);
  const facts = new Map(result.rows.map((row) => [row.word_key, row]));
  let alreadyPublished = 0;
  for (const row of rows) {
    const fact = facts.get(row.word_key);
    if (!fact || fact.normalised_word !== row.normalised_word ||
        !fact.metadata_id || !fact.morphology_id || !fact.dictation_id) {
      throw new Error(`CANONICAL_FACTS_MISSING:${row.word_key}`);
    }
    if (fact.definition === row.definition) alreadyPublished++;
    else if (fact.definition) throw new Error(`DIFFERENT_DEFINITION_ALREADY_PUBLISHED:${row.word_key}`);
  }
  if (mode === "verify" && alreadyPublished !== 304) throw new Error(`DEFINITIONS_INCOMPLETE:${alreadyPublished}`);
  if (mode !== "release") {
    await db.query("rollback");
    console.log(JSON.stringify({ target, mode, words: 304, alreadyPublished, remaining: 304 - alreadyPublished, sourceSha256: sourceSha }));
  } else {
    let actor: string;
    if (target === "staging") {
      actor = process.env.STAGING_ADMIN_USER_ID ?? "";
      if (!actor) throw new Error("STAGING_ADMIN_USER_ID_REQUIRED");
    } else {
      const actors = await db.query(`select distinct created_by id from public.teaching_dictionary_manager_drafts
        where source_reference like $1`, ["2026-10-23-reviewed-root-homophone-words-v2:%"]);
      if (actors.rowCount !== 1) throw new Error("REVIEWED_PRODUCTION_ACTOR_NOT_UNIQUE");
      actor = actors.rows[0].id;
    }
    let published = 0;
    for (const row of rows) {
      const fact = facts.get(row.word_key);
      if (fact.definition === row.definition) continue;
      const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
        (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        values ($1,$2,$3,$4::jsonb,'approved_submission',$5,$6) returning id`,
        [fact.id, fact.normalised_word, fact.dialect_code,
          JSON.stringify({ definition: row.definition, routeContents: [] }),
          `owner-approved-dictionary-batch-definitions:${sourceSha}:${row.word_key}`, actor]);
      await db.query("select public.publish_teaching_dictionary_definition_only($1,$2,$3,$4,$5,$6)",
        [draft.rows[0].id, actor, fact.source_row_hash, fact.metadata_id, fact.dictation_id, fact.morphology_id]);
      published++;
    }
    await db.query("commit");
    console.log(JSON.stringify({ target, mode, published, alreadyPublished, sourceSha256: sourceSha }));
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
