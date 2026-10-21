#!/usr/bin/env node
/** Install only the three reviewed, inactive weak-vowel route migrations. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const files = [
  "20261021211000_adle_weak_vowel_release.sql",
  "20261021212000_adle_weak_vowel_assignment.sql",
  "20261021213000_adle_weak_vowel_finish.sql",
] as const;
const projectRef = "wwohrqtunajrbwxyssjf";

async function main() {
  const envIndex = process.argv.indexOf("--env-file");
  if (envIndex >= 0) process.loadEnvFile(resolve(process.argv[envIndex + 1]));
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
  const target = new URL(url);
  if (!target.username.includes(projectRef) || !target.hostname.endsWith("pooler.supabase.com"))
    throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
  const migrations = files.map((file) => ({ file, version: file.slice(0, 14),
    name: file.slice(15, -4), raw: readFileSync(resolve("supabase/migrations", file), "utf8") }));
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    await db.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='120s'");
    const ledger = await db.query<{ version: string }>(
      "SELECT version FROM supabase_migrations.schema_migrations WHERE version=ANY($1::text[])",
      [migrations.map((migration) => migration.version)]);
    if (ledger.rowCount) throw new Error("WEAK_VOWEL_ROUTE_MIGRATION_ALREADY_PRESENT");
    const heads = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.adle_route_activation_heads WHERE route_id='weak_vowel_word_lab'");
    if (heads.rows[0].count) throw new Error("WEAK_VOWEL_ROUTE_ALREADY_ACTIVE");
    const hashes = migrations.map((migration) => ({ version: migration.version,
      sha256: createHash("sha256").update(migration.raw).digest("hex") }));
    if (!apply) {
      await db.query("ROLLBACK");
      console.log(JSON.stringify({ target: "production", status: "pending", hashes, activationHeads: 0 }));
      return;
    }
    await db.query("SELECT pg_advisory_xact_lock(hashtext('weak_vowel_route_schema'))");
    for (const migration of migrations) {
      const sql = migration.raw.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      await db.query(sql);
      await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3::text[])",
        [migration.version, migration.name, [migration.raw]]);
    }
    const check = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM supabase_migrations.schema_migrations WHERE version=ANY($1::text[])",
      [migrations.map((migration) => migration.version)]);
    if (check.rows[0].count !== 3) throw new Error("WEAK_VOWEL_ROUTE_MIGRATION_READBACK_FAILED");
    await db.query("COMMIT");
    console.log(JSON.stringify({ target: "production", status: "installed", hashes, activationHeads: 0 }));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
