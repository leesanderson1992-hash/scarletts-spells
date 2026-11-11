/** Rollback-proof and apply the atomic multi-word CSV batch on pinned staging. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const version = "20261111080000";
const name = "teaching_multi_sense_csv_batch";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes(`--confirm=multi-sense-batch:staging:${version}`))
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
    const analyses = await db.query(`select id,sense_id,morphology_parts,morphology_joins,
      morphology_transformations,word_sum from public.teaching_dictionary_current_sense_morphology
      where canonical_word_id=$1`, [wordId]);
    const links = await db.query(`select sense_id,sense_morphology_id,family_key,component_part_id,
      relationship_kind from public.teaching_dictionary_current_sense_family_memberships
      where canonical_word_id=$1`, [wordId]);
    assert.equal(analyses.rows.length, 3);
    const bundle = { wordId, sourceSenseReviewedAt: reviewed.rows[0].reviewed_at,
      senseSet: reviewed.rows[0].sense_set,
      analyses: analyses.rows.map(row => {
        const link = links.rows.find(item => item.sense_id === row.sense_id
          && item.sense_morphology_id === row.id);
        return { senseId: row.sense_id, parts: row.morphology_parts,
          joins: row.morphology_joins, transformations: row.morphology_transformations,
          wordSum: row.word_sum, familyKey: link?.family_key ?? "",
          componentPartId: link?.component_part_id ?? "",
          relationshipKind: link?.relationship_kind ?? "", requestedSkillKeys: [] };
      }) };
    const requestId = randomUUID();
    const args = [requestId, JSON.stringify([bundle]), reviewed.rows[0].reviewed_by,
      "Rollback proof: boxing meaning batch"];
    const query = `select public.review_teaching_dictionary_multi_sense_csv_batch(
      $1::uuid,$2::jsonb,$3::uuid,$4::text) count`;
    assert.equal((await db.query(query, args)).rows[0].count, 1);
    assert.equal((await db.query(query, args)).rows[0].count, 1);
    const current = await db.query(`select reviewed_at::text reviewed_at from
      public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
    const valid = { ...bundle, sourceSenseReviewedAt: current.rows[0].reviewed_at };
    const boxId = "eea2483f-60e5-463f-87be-2283493f645a";
    const boxReviewed = await db.query(`select sense_set,reviewed_at::text reviewed_at from
      public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [boxId]);
    const boxAnalyses = await db.query(`select id,sense_id,morphology_parts,morphology_joins,
      morphology_transformations,word_sum from public.teaching_dictionary_current_sense_morphology
      where canonical_word_id=$1`, [boxId]);
    const boxLinks = await db.query(`select sense_id,sense_morphology_id,family_key,component_part_id,
      relationship_kind from public.teaching_dictionary_current_sense_family_memberships
      where canonical_word_id=$1`, [boxId]);
    assert.equal(boxAnalyses.rows.length, 2);
    const second = { wordId: boxId, sourceSenseReviewedAt: boxReviewed.rows[0].reviewed_at,
      senseSet: boxReviewed.rows[0].sense_set,
      analyses: boxAnalyses.rows.map(row => {
        const link = boxLinks.rows.find(item => item.sense_id === row.sense_id
          && item.sense_morphology_id === row.id);
        return { senseId: row.sense_id, parts: row.morphology_parts,
          joins: row.morphology_joins, transformations: row.morphology_transformations,
          wordSum: row.word_sum, familyKey: link?.family_key ?? "",
          componentPartId: link?.component_part_id ?? "",
          relationshipKind: link?.relationship_kind ?? "", requestedSkillKeys: [] };
      }) };
    assert.equal((await db.query(query, [randomUUID(), JSON.stringify([valid, second]),
      reviewed.rows[0].reviewed_by, "Rollback proof: boxing and box batch"])).rows[0].count, 2);
    await db.query("savepoint invalid_second_word");
    const latest = await db.query(`select reviewed_at::text reviewed_at from
      public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
    const refreshed = { ...bundle, sourceSenseReviewedAt: latest.rows[0].reviewed_at };
    const invalid = { ...refreshed, wordId: randomUUID() };
    await assert.rejects(() => db.query(query, [randomUUID(), JSON.stringify([refreshed, invalid]),
      reviewed.rows[0].reviewed_by, "Rollback proof: invalid second word"]),
    /MULTI_SENSE_CSV_APPROVED_WORD_REQUIRED/);
    await db.query("rollback to savepoint invalid_second_word");
    const count = await db.query(`select count(*)::integer n from
      public.teaching_dictionary_multi_sense_csv_batches`);
    assert(count.rows[0].n >= 1);
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", version,
    status: apply ? "applied" : "rollback_proof" }));
} finally { await db.end(); }
