/** Transactional proof of the shared bulk/word-page sense binding RPC. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk"
  || !process.env.STAGING_ADMIN_USER_ID) throw new Error("PINNED_STAGING_REQUIRED");
const word = "02eccc55-4982-43fa-b14e-6e62fd420979";
const skill = "D4_PAT_SPLIT_DIGRAPHS_I_E";
const actor = process.env.STAGING_ADMIN_USER_ID;
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
let transaction = false;
try {
  await db.query("begin"); transaction = true;
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const call = (clear, deassign, senseIds) => db.query(`select public.reconcile_teaching_dictionary_bulk_review_v3(
    $1,$2,$3::uuid[],$3::uuid[],$4::uuid[],$5::uuid[],$3::uuid[],
    $6::jsonb,$7,$8,$9) as count`,
  ["staging", skill, [], clear, deassign, JSON.stringify(senseIds), actor, randomUUID(), null]);
  await db.query("savepoint invalid_sense");
  await assert.rejects(call([word], [], { [word]: "unknown-sense" }), /TEACHING_LESSON_SENSE_INVALID/);
  await db.query("rollback to savepoint invalid_sense");
  await call([word], [], { [word]: "live-on-stage" });
  const current = await db.query(`select sense_id,withdrawn_at from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [word, skill]);
  assert.equal(current.rows[0].sense_id, "live-on-stage");
  assert.equal(current.rows[0].withdrawn_at, null);
  await call([], [word], {});
  const removed = await db.query(`select withdrawn_at from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [word, skill]);
  assert.ok(removed.rows[0].withdrawn_at);
  await db.query("rollback"); transaction = false;
  console.log(JSON.stringify({ result: "passed", invalidSenseRejected: true,
    exactBinding: true, deassignmentRetiresBinding: true, mutations: "rolled back" }));
} finally {
  if (transaction) await db.query("rollback");
  await db.end();
}
