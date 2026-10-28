#!/usr/bin/env node
/** Targeted staging migration; dry-run rolls back the replaced publication function. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const version = "20261028230000";
const name = "weak_vowel_device_voice_publication";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='90s'");
  const prior = await client.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
  if (prior.rowCount) throw Error("SCHWA_DEVICE_VOICE_STAGING_MIGRATION_ALREADY_APPLIED");
  await client.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
  const proof = await client.query<{ definition: string }>(`select pg_get_functiondef(
    'public.publish_adle_weak_vowel_content_v1(uuid,uuid,text,text,text)'::regprocedure) definition`);
  if (proof.rowCount !== 1 || !proof.rows[0].definition.includes("device-speech:%"))
    throw Error("SCHWA_DEVICE_VOICE_STAGING_FUNCTION_READBACK_FAILED");
  if (apply) {
    await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [version, name, [sql]]);
    await client.query("commit");
  } else await client.query("rollback");
  console.log(JSON.stringify({ environment: "staging", version, status: apply ? "installed" : "rollback_proof" }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally { await client.end(); }
