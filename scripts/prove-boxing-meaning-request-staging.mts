/** Apply one reviewed boxing lesson request on pinned staging, then verify its receipt. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseMultiSenseCsv } from "../lib/teaching-dictionary-manager/multi-sense-csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
const path = process.argv[2];
const verifyOnly = process.argv.includes("--verify-only");
assert(path && process.argv.includes("--confirm=boxing-meaning-request:staging"),
  "EXACT_STAGING_CONFIRMATION_REQUIRED");
const [bundle, ...others] = parseMultiSenseCsv(readFileSync(path, "utf8"));
const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
assert.equal(bundle?.wordId, wordId);
assert.equal(others.length, 0);
assert.equal(bundle.senseSet.senses.length, 3);
assert.deepEqual(bundle.analyses.flatMap(analysis => analysis.requestedSkillKeys.map(skillKey =>
  ({ senseId: analysis.senseId, skillKey }))), [{ senseId: "boxing-verb-packing",
  skillKey: "D4_INF_ING_ENDINGS_REGULAR" }]);

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  const reviewed = await db.query(`select reviewed_by,reviewed_at::text reviewed_at
    from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(reviewed.rows.length, 1);
  if (!verifyOnly) {
    assert.equal(Date.parse(bundle.sourceSenseReviewedAt), Date.parse(reviewed.rows[0].reviewed_at),
      "Export a fresh boxing sheet before this proof.");
    const result = await db.query(`select public.review_teaching_dictionary_multi_sense_csv_batch(
      $1::uuid,$2::jsonb,$3::uuid,$4::text) count`, [randomUUID(), JSON.stringify([bundle]),
      reviewed.rows[0].reviewed_by, "Signed-in Preview proof: boxing packing meaning request"]);
    assert.equal(result.rows[0].count, 1);
  }
  const latest = await db.query(`select request_id from
    public.teaching_dictionary_multi_sense_csv_requests where canonical_word_id=$1
    order by reviewed_at desc limit 1`, [wordId]);
  assert.equal(latest.rows.length, 1);
  const requests = await db.query(`select sense_id,micro_skill_key from
    public.teaching_dictionary_multi_sense_csv_skill_requests where request_id=$1`,
    [latest.rows[0].request_id]);
  assert.deepEqual(requests.rows, [{ sense_id: "boxing-verb-packing",
    micro_skill_key: "D4_INF_ING_ENDINGS_REGULAR" }]);
  console.log(JSON.stringify({ target: "staging", result: "passed", words: 1,
    meanings: 3, queuedRequests: requests.rows.length }));
} finally { await db.end(); }
