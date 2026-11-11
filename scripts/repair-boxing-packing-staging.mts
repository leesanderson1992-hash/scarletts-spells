/** Correct the owner-reviewed boxing packing verb to regular inflection, staging only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=boxing-packing-regular:staging"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const senseId = "boxing-verb-packing";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const current = await db.query(`select sense_morphology_id,family_key,component_part_id,
    relationship_kind from public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, senseId]);
  assert.equal(current.rows.length, 1);
  const row = current.rows[0];
  assert.equal(row.family_key, "box_verb_box_verb_packing_base_family");
  assert.equal(row.component_part_id, "base-boxing-verb-packing");
  if (row.relationship_kind !== "regular_inflection") {
    assert.equal(row.relationship_kind, "derived");
    const reviewer = await db.query(`select reviewed_by from
      public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
    assert(reviewer.rows[0]?.reviewed_by);
    await db.query(`select public.review_teaching_dictionary_sense_family_membership(
      $1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::text,
      'approve',$8::uuid,$9::text)`, [randomUUID(), wordId, senseId,
      row.sense_morphology_id, row.family_key, row.component_part_id,
      "regular_inflection", reviewer.rows[0].reviewed_by,
      "Owner-reviewed boxing packing verb: box + ing regular inflection"]);
  }
  const after = await db.query(`select relationship_kind from
    public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, senseId]);
  assert.deepEqual(after.rows, [{ relationship_kind: "regular_inflection" }]);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", senseId,
    status: apply ? "applied" : "rollback_proof" }));
} finally { await db.end(); }
