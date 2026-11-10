/** Rollback proof that an imported reviewed meaning receives exact-fact approval. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const wordId = "02eccc55-4982-43fa-b14e-6e62fd420979";
const skill = "D4_PAT_SPLIT_DIGRAPHS_I_E";
const senseId = "live-on-stage";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const facts = await db.query(`select s.sense_set,m.id morphology_id from
    public.teaching_dictionary_reviewed_sense_sets s
    join public.canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=s.canonical_word_id and m.row_status='active'
    where s.canonical_word_id=$1 order by m.created_at desc limit 1`, [wordId]);
  assert.equal(facts.rows.length, 1);
  const links = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2 order by id`, [wordId, senseId]);
  const snapshot = { senseId, senseSet: facts.rows[0].sense_set,
    morphologyId: facts.rows[0].morphology_id, familyLinkIds: links.rows.map(row => row.id) };
  const requestId = randomUUID();
  await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v6(
    'staging',$1,array[]::uuid[],array[]::uuid[],
    $2::uuid[],array[]::uuid[],array[]::uuid[],
    $3::jsonb,$4,$5,null,'reviewed_overview_candidate_v1',$6::jsonb,
    'teaching_dictionary_import')`, [skill, [wordId], JSON.stringify({ [wordId]: senseId }),
    actor, requestId, JSON.stringify({ [wordId]: snapshot })]);
  const approved = await db.query(`select action,source_kind,fact_fingerprint from
    public.teaching_dictionary_current_candidate_decisions
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2
      and sense_id=$3`, [wordId, skill, senseId]);
  assert.equal(approved.rows.length, 1);
  assert.equal(approved.rows[0].action, "approve");
  assert.equal(approved.rows[0].source_kind, "teaching_dictionary_import");
  assert.match(approved.rows[0].fact_fingerprint, /^[a-f0-9]{64}$/);
  await db.query("rollback");
  const after = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(after.rows, controls.rows);
  console.log(JSON.stringify({ result: "passed", exactFactsRecorded: true,
    importSourceRecorded: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
