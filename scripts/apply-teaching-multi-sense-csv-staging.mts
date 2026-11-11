/** Rollback-proof and apply the atomic multi-meaning CSV review on pinned staging. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const version = "20261111070000";
const name = "teaching_multi_sense_csv_review";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes(`--confirm=multi-sense-csv:staging:${version}`))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
assert(sql.startsWith("begin;\n") && sql.endsWith("\ncommit;\n"));
const body = sql.slice("begin;\n".length, -"\ncommit;\n".length);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  const prior = await db.query(`select name,statements from supabase_migrations.schema_migrations
    where version=$1`, [version]);
  if (prior.rows.length) {
    assert.equal(prior.rows[0].name, name);
    assert.equal(createHash("sha256").update(prior.rows[0].statements[0]).digest("hex"),
      createHash("sha256").update(sql).digest("hex"));
  } else {
    await db.query(body);
    await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [version, [sql], name]);
  }
  if (!apply) {
  const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
  const reviewed = await db.query(`select sense_set,reviewed_at::text reviewed_at,reviewed_by
    from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(reviewed.rows[0]?.sense_set?.senses?.length, 3);
  const analyses = await db.query(`select id,sense_id,morphology_parts,morphology_joins,
    morphology_transformations,word_sum from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=$1`, [wordId]);
  assert.equal(analyses.rows.length, 3);
  const links = await db.query(`select sense_id,sense_morphology_id,family_key,component_part_id,
    relationship_kind from public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1`, [wordId]);
  const payload = analyses.rows.map(row => {
    const link = links.rows.find(item => item.sense_id === row.sense_id
      && item.sense_morphology_id === row.id);
    return { senseId: row.sense_id, parts: row.morphology_parts, joins: row.morphology_joins,
      transformations: row.morphology_transformations, wordSum: row.word_sum,
      familyKey: link?.family_key ?? "", componentPartId: link?.component_part_id ?? "",
      relationshipKind: link?.relationship_kind ?? "", requestedSkillKeys: [] };
  });
  const requestId = randomUUID();
  const applied = await db.query(`select public.review_teaching_dictionary_multi_sense_csv(
    $1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::uuid,$7::text) word_id`,
  [requestId, wordId, reviewed.rows[0].reviewed_at,
    JSON.stringify(reviewed.rows[0].sense_set), JSON.stringify(payload),
    reviewed.rows[0].reviewed_by, "Rollback proof: reviewed boxing meanings"]);
  assert.equal(applied.rows[0].word_id, wordId);
  const replay = await db.query(`select public.review_teaching_dictionary_multi_sense_csv(
    $1::uuid,$2::uuid,$3::text,$4::jsonb,$5::jsonb,$6::uuid,$7::text) word_id`,
  [requestId, wordId, reviewed.rows[0].reviewed_at,
    JSON.stringify(reviewed.rows[0].sense_set), JSON.stringify(payload),
    reviewed.rows[0].reviewed_by, "Rollback proof: reviewed boxing meanings"]);
  assert.equal(replay.rows[0].word_id, wordId);
  const after = await db.query(`select count(*)::integer n from
    public.teaching_dictionary_current_sense_morphology where canonical_word_id=$1`, [wordId]);
  assert.equal(after.rows[0].n, 3);
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", version,
    status: apply ? "applied" : "rollback_proof" }));
} finally { await db.end(); }
