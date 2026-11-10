/** Exact, staging-only migration proof. Defaults to rollback. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const files = [
  "20261109120000_teaching_dictionary_reviewed_senses.sql",
  "20261109130000_teaching_dictionary_lesson_sense_bindings.sql",
] as const;
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=teaching-dictionary-senses:staging:20261109130000"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_TARGET_MISMATCH");
const migrations = await Promise.all(files.map(async file => {
  const sql = await readFile(resolve("supabase/migrations", file), "utf8");
  return { file, version: file.slice(0, 14), name: file.slice(15, -4), sql,
    sha256: createHash("sha256").update(sql).digest("hex") };
}));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["teaching_dictionary_senses_staging"]);
  const ledger = await db.query(`select version,name,statements from supabase_migrations.schema_migrations
    where version=any($1::text[])`, [migrations.map(item => item.version)]);
  const existing = new Map(ledger.rows.map(row => [row.version, row]));
  const appliedNow: string[] = [];
  for (const migration of migrations) {
    const previous = existing.get(migration.version);
    if (previous) {
      if (previous.name !== migration.name || previous.statements?.length !== 1 ||
        createHash("sha256").update(previous.statements[0]).digest("hex") !== migration.sha256)
        throw new Error(`MIGRATION_LEDGER_HASH_MISMATCH:${migration.version}`);
      continue;
    }
    await db.query(migration.sql);
    await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [migration.version, [migration.sql], migration.name]);
    appliedNow.push(migration.version);
  }
  const verified = await db.query(`select version from supabase_migrations.schema_migrations
    where version=any($1::text[]) order by version`, [migrations.map(item => item.version)]);
  if (verified.rows.length !== files.length) throw new Error("STAGING_MIGRATION_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", status: apply ? "applied" : "rollback_proof",
    appliedNow, migrations: migrations.map(({ version, sha256 }) => ({ version, sha256 })) }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
