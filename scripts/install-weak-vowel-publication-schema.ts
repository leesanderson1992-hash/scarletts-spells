#!/usr/bin/env node
/** Install only the reviewed weak-vowel publication schema on Production. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const VERSION = "20261021210000";
const NAME = "publish_reviewed_weak_vowel_content";
const EXPECTED_SHA256 = "154981f8fdc11e620a5b9eb15923efcbb4eee2ea2b1513bfc98d4eb7f3111633";
const PROJECT_REF = "wwohrqtunajrbwxyssjf";

async function main() {
  const envIndex = process.argv.indexOf("--env-file");
  if (envIndex >= 0) process.loadEnvFile(resolve(process.argv[envIndex + 1]));
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
  const target = new URL(url);
  if (!target.username.includes(PROJECT_REF) || !target.hostname.endsWith("pooler.supabase.com"))
    throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
  const rawSql = readFileSync(resolve("supabase/migrations", `${VERSION}_${NAME}.sql`), "utf8");
  const sha256 = createHash("sha256").update(rawSql).digest("hex");
  if (sha256 !== EXPECTED_SHA256) throw new Error("MIGRATION_SOURCE_CHANGED");
  const sql = rawSql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '90s'");
    if (apply) await client.query("SELECT pg_advisory_xact_lock(hashtext('weak_vowel_publication_schema'))");
    const ledger = await client.query<{ version: string; name: string; statements: string[] | null }>(
      "SELECT version,name,statements FROM supabase_migrations.schema_migrations WHERE version=$1", [VERSION]);
    const existing = await client.query<{ table_name: string | null; function_name: string | null; head_count: number }>(
      `SELECT to_regclass('public.adle_weak_vowel_content_publications')::text table_name,
        to_regprocedure('public.publish_adle_weak_vowel_content_v1(uuid,uuid,text,text,text)')::text function_name,
        (SELECT count(*)::int FROM public.adle_route_activation_heads WHERE route_id='weak_vowel_word_lab') head_count`);
    if (ledger.rowCount || existing.rows[0].table_name || existing.rows[0].function_name)
      throw new Error("WEAK_VOWEL_MIGRATION_ALREADY_PRESENT_OR_SCHEMA_DRIFT");
    if (existing.rows[0].head_count !== 0) throw new Error("WEAK_VOWEL_ROUTE_ALREADY_ACTIVE");
    if (!apply) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ target: "production", version: VERSION, sha256, status: "pending", changed: false }));
      return;
    }
    await client.query(sql);
    await client.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ($1,$2,$3::text[])",
      [VERSION, NAME, [rawSql]]);
    const proof = await client.query<{ version: string; table_name: string | null; function_name: string | null; head_count: number }>(
      `SELECT ledger.version,
        to_regclass('public.adle_weak_vowel_content_publications')::text table_name,
        to_regprocedure('public.publish_adle_weak_vowel_content_v1(uuid,uuid,text,text,text)')::text function_name,
        (SELECT count(*)::int FROM public.adle_route_activation_heads WHERE route_id='weak_vowel_word_lab') head_count
       FROM supabase_migrations.schema_migrations ledger WHERE ledger.version=$1`, [VERSION]);
    if (proof.rowCount !== 1 || !proof.rows[0].table_name || !proof.rows[0].function_name || proof.rows[0].head_count !== 0)
      throw new Error("WEAK_VOWEL_MIGRATION_READBACK_FAILED");
    await client.query("COMMIT");
    console.log(JSON.stringify({ target: "production", version: VERSION, sha256, status: "installed", activationHeads: 0 }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
