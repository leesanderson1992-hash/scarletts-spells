/** Rollback proof: a reviewed root reimport preserves its existing skill pair. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-09-veget-root-staging/vegetable.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "205fea479161a9e1bf12129d5832934d5563acdf45b45ffe087d0bc94fbd547d");
const reviewed = parseDictionaryCsv(file.toString("utf8"))[0];
assert(reviewed && !reviewed.error && reviewed.payload.senseSet);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const migration = readFileSync(
    "supabase/migrations/20261110210000_teaching_csv_atomic_sense_family_link.sql", "utf8");
  await db.query(migration.slice("begin;\n".length, -"\ncommit;\n".length));
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const word = await db.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='vegetable' and row_status='active' and dialect_code='en-GB'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id as string;
  const live = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [wordId]);
  assert.equal(live.rows.length, 1);
  assert.equal(live.rows[0].skill_keys.length, 1);
  const payload = { ...reviewed.payload,
    skillKeys: live.rows[0].skill_keys as string[],
    requestedSkillKeys: reviewed.payload.skillKeys };
  const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'vegetable','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(payload),
    `CSV batch ${randomUUID()}, vegetable.csv, row ${reviewed.rowNumber}`, actor]);
  const draftId = draft.rows[0].id as string;
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [draftId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [draftId, actor]);
  const published = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','bound_root') id`, [draftId, actor]);
  assert.equal(published.rows[0].id, wordId);
  const after = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [wordId]);
  assert.deepEqual(after.rows[0].skill_keys, live.rows[0].skill_keys);
  const queue = await db.query(`select micro_skill_key from
    public.teaching_dictionary_import_candidate_handoffs where draft_id=$1`, [draftId]);
  assert.deepEqual(queue.rows.map(row => row.micro_skill_key).sort(),
    [...reviewed.payload.skillKeys].sort());
  const links = await db.query(`select family_key,component_part_id from
    public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2`,
  [wordId, payload.senseSet!.senses[0].id]);
  assert.deepEqual(links.rows, [{ family_key: "veget_bound_root_base_family",
    component_part_id: "part_1" }]);
  await db.query("rollback");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  console.log(JSON.stringify({ result: "passed", word: "vegetable",
    rootFamilyPreserved: true, pairSetUnchanged: true,
    requestedSkillsQueued: true, senseFamilyLinked: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
