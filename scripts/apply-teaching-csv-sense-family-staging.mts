/** Rollback-test or apply atomic sense-family linking to pinned staging. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const file = "supabase/migrations/20261110210000_teaching_csv_atomic_sense_family_link.sql";
const version = "20261110210000";
const name = "teaching_csv_atomic_sense_family_link";
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=csv-sense-family:staging:20261110210000"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_TARGET_MISMATCH");
const sql = await readFile(file, "utf8");
if (!sql.startsWith("begin;\n") || !sql.endsWith("\ncommit;\n"))
  throw new Error("MIGRATION_TRANSACTION_WRAPPER_CHANGED");
const body = sql.slice("begin;\n".length, -"\ncommit;\n".length);
const sha256 = createHash("sha256").update(sql).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["teaching_csv_sense_family_staging"]);
  const prior = await db.query(`select name,statements from supabase_migrations.schema_migrations where version=$1`, [version]);
  if (prior.rows.length) {
    if (prior.rows[0].name !== name || prior.rows[0].statements?.length !== 1 ||
      createHash("sha256").update(prior.rows[0].statements[0]).digest("hex") !== sha256)
      throw new Error("STAGING_MIGRATION_LEDGER_HASH_MISMATCH");
  } else {
    await db.query(body);
    await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [version, [sql], name]);
  }
  const check = await db.query(`select position('TEACHING_CSV_SENSE_FAMILY_LINK_STALE' in
    pg_get_functiondef('public.publish_teaching_dictionary_reviewed_csv_facts_first(
      uuid,uuid,text,text)'::regprocedure)) n`);
  if (check.rows[0].n <= 0) throw new Error("STAGING_SCHEMA_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", status: apply ? "applied" : "rollback_proof", version, sha256 }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
