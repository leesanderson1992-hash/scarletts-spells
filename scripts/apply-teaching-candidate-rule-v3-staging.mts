/** Apply or rollback-test the canonical candidate revision on pinned staging. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const version = "20261111000000";
const name = "teaching_candidate_affix_registry_v3";
const file = `supabase/migrations/${version}_${name}.sql`;
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes(`--confirm=candidate-rule:staging:${version}`))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
const sql = readFileSync(file, "utf8");
assert(sql.startsWith("begin;\n") && sql.endsWith("\ncommit;\n"),
  "MIGRATION_TRANSACTION_WRAPPER_CHANGED");
const body = sql.slice("begin;\n".length, -"\ncommit;\n".length);
const sha256 = createHash("sha256").update(sql).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", [name]);
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }], "STAGING_REVIEW_CONTROLS_MUST_BE_CLOSED");
  const prior = await db.query<{ name: string; statements: string[] }>(
    "select name,statements from supabase_migrations.schema_migrations where version=$1", [version]);
  if (prior.rows.length) {
    assert.equal(prior.rows[0].name, name, "STAGING_MIGRATION_LEDGER_NAME_MISMATCH");
    assert.equal(prior.rows[0].statements?.length, 1, "STAGING_MIGRATION_LEDGER_BODY_MISSING");
    assert.equal(createHash("sha256").update(prior.rows[0].statements[0]).digest("hex"),
      sha256, "STAGING_MIGRATION_LEDGER_HASH_MISMATCH");
  } else {
    await db.query(body);
    await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [version, [sql], name]);
  }
  const definition = await db.query<{ body: string }>(`select pg_get_functiondef(
    'public.reconcile_teaching_dictionary_bulk_review_v4(
      text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb
    )'::regprocedure) body`);
  assert.match(definition.rows[0].body, /'reviewed_overview_candidate_v3'/);
  assert.doesNotMatch(definition.rows[0].body, /'reviewed_overview_candidate_v2'/);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", status: apply ? "applied" : "rollback_proof",
    version, sha256 }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
