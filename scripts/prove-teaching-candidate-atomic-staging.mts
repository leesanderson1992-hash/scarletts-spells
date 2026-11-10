/** Disposable staging proof of the exact-fact guard before governed approval. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const wordId = "02eccc55-4982-43fa-b14e-6e62fd420979";
  const skill = "D4_PAT_SPLIT_DIGRAPHS_I_E";
  const call = (expected: object, clear: string[] = []) => db.query(`select
    public.reconcile_teaching_dictionary_bulk_review_v4(
      'staging',$1,$2::uuid[],$2::uuid[],$3::uuid[],$2::uuid[],$2::uuid[],
      $4::jsonb,$5,$6,null,'reviewed_overview_candidate_v2',$7::jsonb) n`,
  [skill, [], clear, JSON.stringify(clear.length ? { [wordId]: "live-on-stage" } : {}),
    actor, randomUUID(), JSON.stringify(expected)]);
  await db.query("savepoint stale_fact");
  await assert.rejects(call({ [wordId]: { senseId: "live-on-stage", senseSet: {},
    morphologyId: randomUUID(), familyLinkIds: [] } }, [wordId]),
  /TEACHING_CANDIDATE_FACTS_STALE/);
  await db.query("rollback to savepoint stale_fact");
  const facts = await db.query(`select s.sense_set,m.id morphology_id from
    public.teaching_dictionary_reviewed_sense_sets s
    join public.canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=s.canonical_word_id and m.row_status='active'
    where s.canonical_word_id=$1 order by m.created_at desc limit 1`, [wordId]);
  assert.equal(facts.rows.length, 1);
  const links = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id='live-on-stage' order by id`, [wordId]);
  const reviewed = await call({ [wordId]: { senseId: "live-on-stage",
    senseSet: facts.rows[0].sense_set, morphologyId: facts.rows[0].morphology_id,
    familyLinkIds: links.rows.map(row => row.id) } }, [wordId]);
  assert.equal(reviewed.rows[0].n, 0);
  await db.query("rollback");
  console.log(JSON.stringify({ result: "passed", staleFactsRejected: true,
    exactFactsAccepted: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
