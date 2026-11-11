/** Rollback-test or apply the v4 regular -ing sense rule on pinned staging. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const version = "20261111050000";
const name = "teaching_candidate_verb_ing_rule_v4";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes(`--confirm=candidate-verb-ing:staging:${version}`))
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
  const functionDef = await db.query<{ body: string }>(`select pg_get_functiondef(
    'public.reconcile_teaching_dictionary_bulk_review_v4(
      text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb
    )'::regprocedure) body`);
  assert.match(functionDef.rows[0].body, /reviewed_overview_candidate_v4/);
  assert.doesNotMatch(functionDef.rows[0].body, /reviewed_overview_candidate_v3/);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", version,
    status: apply ? "applied" : "rollback_proof" }));
} finally {
  await db.end();
}
