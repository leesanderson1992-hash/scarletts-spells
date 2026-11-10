/** Rollback proof for a reviewed one-row CSV whose filename differs from its source. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const draft = "5402a6e5-a1e9-47c7-a41f-d85005617208";
const word = "883685c3-9d0d-5071-871c-fca55770d90a";
const migration = await readFile(
  "supabase/migrations/20261110200000_teaching_csv_legacy_family_filename_independence.sql", "utf8");
const body = migration.slice("begin;\n".length, -"\ncommit;\n".length);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query(body);
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const before = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [word]);
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [draft, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [draft, actor]);
  const published = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','free_base') id`, [draft, actor]);
  assert.equal(published.rows[0].id, word);
  const after = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [word]);
  assert.deepEqual(after.rows[0].skill_keys, before.rows[0].skill_keys);
  const family = await db.query(`select count(*)::int n from
    public.canonical_teaching_dictionary_lexical_base_family_members
    where canonical_word_id=$1 and family_key='read_verb_base_family'`, [word]);
  assert.equal(family.rows[0].n, 1);
  await db.query("rollback");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  console.log(JSON.stringify({ result: "passed", word: "readable", renamedCsvAccepted: true,
    pairSetUnchanged: true, familyApproved: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
