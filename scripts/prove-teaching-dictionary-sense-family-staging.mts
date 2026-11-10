/** Verify and optionally approve the reviewed vegetable sense-to-root link. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=veget-sense-family-staging"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const wordId = "4be8170a-0103-5999-9344-4dacb3772ad6";
const senseId = "csv-sense:vegetable";
const familyKey = "veget_bound_root_base_family";
const partId = "part_1";
const reference = "Owner-reviewed vegetable and veget staging family link";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const prior = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2 and family_key=$3 and component_part_id=$4`,
  [wordId,senseId,familyKey,partId]);
  if (prior.rows.length) {
    assert.equal(prior.rows.length, 1);
    await db.query("rollback");
    console.log(JSON.stringify({ status: "already_present", word: "vegetable", family: familyKey }));
  } else {
    await db.query("savepoint invalid_component");
    try {
      await db.query(`select public.review_teaching_dictionary_sense_family_link(
        $1,$2,$3,$4,'part_2','approve',$5,$6)`,
      [randomUUID(),wordId,senseId,familyKey,actor,reference]);
      throw new Error("INVALID_COMPONENT_UNEXPECTEDLY_APPROVED");
    } catch (error) {
      assert.match(String(error), /SENSE_FAMILY_COMPONENT_INVALID/);
      await db.query("rollback to savepoint invalid_component");
    }
    const requestId = randomUUID();
    const args = [requestId,wordId,senseId,familyKey,partId,"approve",actor,reference];
    const approved = await db.query(`select public.review_teaching_dictionary_sense_family_link(
      $1,$2,$3,$4,$5,$6,$7,$8) as id`, args);
    const retry = await db.query(`select public.review_teaching_dictionary_sense_family_link(
      $1,$2,$3,$4,$5,$6,$7,$8) as id`, args);
    assert.equal(approved.rows[0].id, retry.rows[0].id);
    const current = await db.query(`select family_key,current_family_revision,sense_id,component_part_id
      from public.teaching_dictionary_current_sense_family_links
      where canonical_word_id=$1 and sense_id=$2`, [wordId,senseId]);
    assert.deepEqual(current.rows, [{ family_key: familyKey, current_family_revision: 2,
      sense_id: senseId, component_part_id: partId }]);
    if (!apply) {
      await db.query(`select public.review_teaching_dictionary_sense_family_link(
        $1,$2,$3,$4,$5,'withdraw',$6,$7)`,
      [randomUUID(),wordId,senseId,familyKey,partId,actor,reference]);
      const withdrawn = await db.query(`select count(*)::int as n
        from public.teaching_dictionary_current_sense_family_links
        where canonical_word_id=$1 and sense_id=$2`, [wordId,senseId]);
      assert.equal(withdrawn.rows[0].n, 0);
    }
    await db.query(apply ? "commit" : "rollback");
    console.log(JSON.stringify({ status: apply ? "applied" : "rollback_proof",
      word: "vegetable", senseId, family: familyKey, componentPartId: partId,
      invalidComponentRejected: true, idempotentRetry: true,
      withdrawalProved: !apply }));
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
