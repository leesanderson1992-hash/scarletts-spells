#!/usr/bin/env node
/** Governed, definition-only publication for distinct senses of existing spellings. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const mode = process.argv[2];
if (!["plan", "prove", "release", "verify"].includes(mode)) {
  throw new Error("Usage: publish-owner-approved-existing-senses.mts plan|prove|release|verify [--confirm <sha-prefix>]");
}
const path = "outputs/teaching-dictionary-import-plan-2026-10-30/existing-spelling-sense-decisions.csv";
const source = readFileSync(path, "utf8");
const sourceSha = createHash("sha256").update(source).digest("hex");
const reviewed = parseCsv(source);
assert.equal(reviewed.length, 102);
const rows = reviewed.filter((row) => row.sense_decision === "distinct part of speech or sense");
assert.deepEqual(rows.map((row) => row.word).sort(),
  ["answer", "name", "place", "question", "race", "ring", "shape", "surprise", "sweet", "view", "while"]);
assert(reviewed.filter((row) => row.sense_decision !== "distinct part of speech or sense")
  .every((row) => row.publication_decision === "reuse existing definition"));
const confirmation = process.argv.indexOf("--confirm");
if (mode === "release" && (confirmation < 0 || process.argv[confirmation + 1] !== sourceSha.slice(0, 12))) {
  throw new Error(`Exact source confirmation required: --confirm ${sourceSha.slice(0, 12)}`);
}
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query(mode === "plan" || mode === "verify" ? "begin read only" : "begin");
  await db.query("set local statement_timeout='60s'");
  const result = await db.query(`select w.id,w.normalised_word,w.dialect_code,w.source_row_hash,
    (select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=w.id and row_status='active') metadata_id,
    (select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=w.id and row_status='active') morphology_id,
    (select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=w.id and row_status='active') dictation_id,
    (select definition from public.teaching_dictionary_definition_versions d where d.canonical_word_id=w.id
      and d.route_id is null order by d.published_at desc,d.id desc limit 1) definition
    from public.canonical_teaching_dictionary_words w where w.id=any($1::uuid[]) and w.row_status='active'
      and w.review_status='approved_for_first_exposure' and w.dialect_code='en-GB'`,
    [rows.map((row) => row.canonical_word_id)]);
  assert.equal(result.rowCount, 11);
  const facts = new Map(result.rows.map((row) => [row.normalised_word, row]));
  let alreadyPublished = 0;
  for (const row of rows) {
    const fact = facts.get(row.word);
    assert(fact, `WORD_MISSING:${row.word}`);
    assert.equal(fact.id, row.canonical_word_id);
    assert(fact.metadata_id && fact.morphology_id && fact.dictation_id, `FACTS_MISSING:${row.word}`);
    if (fact.definition === row.proposed_combined_definition) alreadyPublished++;
    else assert.equal(fact.definition, row.current_published_definition, `DEFINITION_CHANGED:${row.word}`);
  }
  if (mode === "verify") {
    assert.equal(alreadyPublished, 11, "SENSES_NOT_FULLY_PUBLISHED");
    await db.query("rollback");
    console.log(JSON.stringify({ mode, verified: 11, sourceSha256: sourceSha }));
  } else if (mode === "plan") {
    await db.query("rollback");
    console.log(JSON.stringify({ mode, reviewed: 102, sameSense: 91,
      additionalSenses: 11, alreadyPublished, sourceSha256: sourceSha }));
  } else {
    const actors = await db.query(`select distinct created_by id from public.teaching_dictionary_manager_drafts
      where source_reference like $1`, ["2026-10-23-reviewed-root-homophone-words-v2:%"]);
    assert.equal(actors.rowCount, 1, "REVIEWED_PRODUCTION_ACTOR_NOT_UNIQUE");
    const actor = actors.rows[0].id;
    let published = 0;
    for (const row of rows) {
      const fact = facts.get(row.word);
      if (fact.definition === row.proposed_combined_definition) continue;
      const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
        (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
        values ($1,$2,$3,$4::jsonb,'approved_submission',$5,$6) returning id`,
        [fact.id, fact.normalised_word, fact.dialect_code,
          JSON.stringify({ definition: row.proposed_combined_definition, routeContents: [] }),
          `owner-approved-existing-senses:${sourceSha}:${row.word}`, actor]);
      await db.query("select public.publish_teaching_dictionary_definition_only($1,$2,$3,$4,$5,$6)",
        [draft.rows[0].id, actor, fact.source_row_hash, fact.metadata_id, fact.dictation_id, fact.morphology_id]);
      published++;
    }
    if (mode === "prove") {
      await db.query("rollback");
      console.log(JSON.stringify({ mode, proved: published, rolledBack: true, sourceSha256: sourceSha }));
    } else {
      await db.query("commit");
      console.log(JSON.stringify({ mode, published, sourceSha256: sourceSha }));
    }
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
