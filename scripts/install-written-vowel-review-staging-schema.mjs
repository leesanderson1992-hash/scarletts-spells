#!/usr/bin/env node
/** Install the missing written-vowel review prerequisite on staging only. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("WRITTEN_VOWEL_REVIEW_STAGING_TARGET_MISMATCH");

const version = "20261029230000";
const name = "schwa_written_fact_owner_reviews";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const prior = await db.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
  if (prior.rowCount) throw new Error("WRITTEN_VOWEL_REVIEW_STAGING_ALREADY_APPLIED");
  await db.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
  const proof = await db.query("select to_regclass('public.teaching_dictionary_weak_vowel_written_reviews')::text table_name");
  if (!proof.rows[0]?.table_name) throw new Error("WRITTEN_VOWEL_REVIEW_STAGING_READBACK_FAILED");
  if (apply) await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
    [version, name, [sql]]);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ environment: "staging", version,
    status: apply ? "installed" : "rollback_proof" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
