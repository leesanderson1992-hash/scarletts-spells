/** Transactional staging proof of two meanings under one governed word-skill pair. */
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
  const set = facts.rows[0].sense_set as { senses: { id: string }[] };
  assert.equal(set.senses.length, 2);
  const call = async (senseId: string | null) => {
    const links = senseId ? await db.query(`select id from public.teaching_dictionary_current_sense_family_links
      where canonical_word_id=$1 and sense_id=$2 order by id`, [wordId, senseId]) : null;
    const snapshot = senseId ? { senseId, senseSet: set, morphologyId: facts.rows[0].morphology_id,
      familyLinkIds: links!.rows.map(row => row.id) } : null;
    return db.query(`select public.reconcile_teaching_dictionary_bulk_review_v6(
      'staging',$1,array[]::uuid[],array[]::uuid[],
      $2::uuid[],$3::uuid[],array[]::uuid[],
      $4::jsonb,$5,$6,null,'reviewed_overview_candidate_v1',$7::jsonb,
      'teaching_dictionary_bulk') n`, [skill, senseId ? [wordId] : [],
      senseId ? [] : [wordId], JSON.stringify(senseId ? { [wordId]: senseId } : {}),
      actor, randomUUID(), JSON.stringify(senseId ? { [wordId]: snapshot } : {})]);
  };
  for (const sense of set.senses) await call(sense.id);
  const effective = await db.query(`select sense_id from public.teaching_dictionary_effective_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2
    order by sense_id`, [wordId, skill]);
  assert.deepEqual(effective.rows.map(row => row.sense_id), set.senses.map(sense => sense.id).sort());
  const decisions = await db.query(`select sense_id,action from public.teaching_dictionary_current_candidate_decisions
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [wordId, skill]);
  assert.equal(decisions.rows.filter(row => row.action === "approve").length, 2);
  await call(null);
  const retired = await db.query(`select sense_id from public.teaching_dictionary_effective_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [wordId, skill]);
  assert.equal(retired.rows.length, 0);
  const withdrawals = await db.query(`select sense_id,action from public.teaching_dictionary_current_candidate_decisions
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [wordId, skill]);
  assert.equal(withdrawals.rows.filter(row => row.action === "withdraw").length, 2);
  await db.query("rollback");
  const after = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(after.rows, controls.rows);
  console.log(JSON.stringify({ result: "passed", twoMeaningsRetained: true,
    pairWithdrawalRetiredBoth: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
