#!/usr/bin/env node
/** Apply only the reviewed dictionary-audio migration to guarded staging. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw Error("DICTIONARY_AUDIO_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const currentQueueFix = process.argv.includes("--current-queue-fix");
const completedQueueFix = process.argv.includes("--complete-queue-fix");
const version = completedQueueFix ? "20261029100000" : currentQueueFix ? "20261029093000" : "20261029090000";
const name = completedQueueFix ? "dictionary_british_recording_queue_complete"
  : currentQueueFix ? "dictionary_british_recording_queue_current" : "dictionary_british_recordings";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const prior = await db.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
  if (prior.rowCount) throw Error("DICTIONARY_AUDIO_STAGING_MIGRATION_ALREADY_APPLIED");
  await db.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
  const proof = await db.query("select to_regclass('public.teaching_dictionary_british_recording_versions') table_name, to_regprocedure('public.teaching_dictionary_awaiting_british_recording_ids()') function_name");
  if (!proof.rows[0]?.table_name || !proof.rows[0]?.function_name) throw Error("DICTIONARY_AUDIO_STAGING_READBACK_FAILED");
  if (apply) {
    await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [version, name, [sql]]);
    await db.query("commit");
  } else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", version, status: apply ? "installed" : "rollback_proof" }));
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
