/** Rollback proof of one human-reviewed flat CSV row through the DB publisher. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk" || !actor)
  throw new Error("PINNED_STAGING_REQUIRED");
const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const reviewed = parseDictionaryCsv(file.toString("utf8"))
  .find(row => row.normalisedWord === "readable");
assert.ok(reviewed && !reviewed.error && reviewed.payload.senseSet);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
let inTransaction = false;
try {
  await db.query("begin"); inTransaction = true;
  // Enable the governed workflow only inside this rollback proof transaction.
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true
    where environment_key='staging'`);
  const word = await db.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='readable' and row_status='active' and dialect_code='en-GB'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id as string;
  const prior = await db.query(`select count(*)::int as n from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [wordId]);
  assert.equal(prior.rows[0].n, 0);
  const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'readable','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(reviewed.payload),
    `CSV batch ${randomUUID()}, reviewed-14-word-pilot.csv, row ${reviewed.rowNumber}`, actor]);
  const draftId = draft.rows[0].id as string;
  const compatible = await db.query(`select public.teaching_dictionary_pilot_legacy_family_compatible($1) ok`, [draftId]);
  assert.equal(compatible.rows[0].ok, true);
  const badDraft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'readable','en-GB',
      jsonb_set($2::jsonb,'{canonicalMorphology,wordSum}','"read + able → other"'::jsonb),
      'csv',$3,$4) returning id`, [wordId, JSON.stringify(reviewed.payload),
      `CSV batch ${randomUUID()}, reviewed-14-word-pilot.csv, row ${reviewed.rowNumber}`, actor]);
  const conflicting = await db.query(`select public.teaching_dictionary_pilot_legacy_family_compatible($1) ok`,
    [badDraft.rows[0].id]);
  assert.equal(conflicting.rows[0].ok, false);
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [draftId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [draftId, actor]);
  let published: pg.QueryResult<{ word_id: string }> | null = null;
  try {
    published = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_senses(
      $1,$2,'staging','free_base') as word_id`, [draftId, actor]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("TEACHING_FREE_BASE_IMPORT_FAMILY_REVIEW_REQUIRED")) {
      await db.query("rollback"); inTransaction = false;
      console.log(JSON.stringify({ result: "blocked", word: "readable",
        blocker: "TEACHING_FREE_BASE_IMPORT_FAMILY_REVIEW_REQUIRED",
        changes: "rolled back" }));
    } else {
      throw error;
    }
  }
  if (published) {
    assert.equal(published.rows[0].word_id, wordId);
    const bindings = await db.query(`select micro_skill_key,sense_id from public.teaching_dictionary_lesson_sense_bindings
      where environment_key='staging' and canonical_word_id=$1 and withdrawn_at is null
      order by micro_skill_key`, [wordId]);
    assert.equal(bindings.rows.length, reviewed.payload.skillKeys.length);
    assert.deepEqual(bindings.rows.map(row => row.micro_skill_key), [...reviewed.payload.skillKeys].sort());
    assert.ok(bindings.rows.every(row => row.sense_id === reviewed.payload.senseSet?.senses[0].id));
    const families = await db.query(`select
      (select count(*)::int from public.canonical_teaching_dictionary_base_word_family_members
        where canonical_word_id=$1 and row_status='active') historical,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members m
        join public.canonical_teaching_dictionary_lexical_base_families f
          on f.family_key=m.family_key and f.revision=m.revision
        where m.canonical_word_id=$1 and f.family_key='read_verb_base_family'
          and f.review_status='approved') canonical`, [wordId]);
    assert.equal(families.rows[0].historical, 1);
    assert.equal(families.rows[0].canonical, 1);
    await db.query("rollback"); inTransaction = false;
    console.log(JSON.stringify({ result: "passed", word: "readable",
      skillsBound: bindings.rows.length, historicalFamilyPreserved: true,
      canonicalFamilyApproved: true, changes: "rolled back" }));
  }
} finally {
  if (inTransaction) await db.query("rollback");
  await db.end();
}
