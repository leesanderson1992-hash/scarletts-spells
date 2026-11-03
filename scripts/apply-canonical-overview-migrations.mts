/** Apply the exact ordered canonical Overview SQL set; default is rollback proof. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const VERSIONS = [
  "20261103110000", "20261103113000", "20261103120000", "20261103123000",
  "20261103130000", "20261103131000", "20261103132000", "20261103133000",
  "20261103140000", "20261103142000", "20261103143000", "20261103144000",
] as const;
const target = process.argv[2];
const apply = process.argv.includes("--apply");
if (target !== "staging" && target !== "production") throw new Error("STAGING_OR_PRODUCTION_REQUIRED");
const confirmation = `canonical-overview-migrations:${target}:${VERSIONS.at(-1)}`;
if (apply && !process.argv.includes(`--confirm=${confirmation}`))
  throw new Error(`EXACT_CONFIRMATION_REQUIRED:${confirmation}`);
const url = target === "staging" ? process.env.SUPABASE_STAGING_DB_URL
  : process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const expectedRef = target === "staging" ? "qkpjbajicacbrphthibk" : "wwohrqtunajrbwxyssjf";
if (!url || new URL(url).username.split(".").at(-1) !== expectedRef)
  throw new Error("DATABASE_TARGET_MISMATCH");
const migrationDir = resolve(import.meta.dirname, "../supabase/migrations");
const names = await readdir(migrationDir);
const migrations = await Promise.all(VERSIONS.map(async (version) => {
  const fileName = names.find((name) => name.startsWith(`${version}_`) && name.endsWith(".sql"));
  if (!fileName) throw new Error(`MIGRATION_MISSING:${version}`);
  const original = await readFile(resolve(migrationDir, fileName), "utf8");
  if (!/^begin;\s*/iu.test(original) || !/\scommit;\s*$/iu.test(original))
    throw new Error(`MIGRATION_TRANSACTION_WRAPPER_UNEXPECTED:${version}`);
  const body = original.replace(/^begin;\s*/iu, "").replace(/\scommit;\s*$/iu, "");
  return { version, name: fileName.slice(version.length + 1, -4), original, body,
    sha256: createHash("sha256").update(original).digest("hex") };
}));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["canonical_overview_migrations"]);
  const ledger = await db.query(`select version,name,statements from supabase_migrations.schema_migrations
    where version=any($1::text[])`, [[...VERSIONS]]);
  const byVersion = new Map(ledger.rows.map((row) => [row.version, row]));
  const appliedNow: string[] = [];
  for (const migration of migrations) {
    const existing = byVersion.get(migration.version);
    if (existing) {
      if (existing.name !== migration.name || existing.statements?.length !== 1
        || createHash("sha256").update(existing.statements[0]).digest("hex") !== migration.sha256)
        throw new Error(`MIGRATION_LEDGER_HASH_MISMATCH:${migration.version}`);
      continue;
    }
    await db.query(migration.body);
    await db.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [migration.version, [migration.original], migration.name]);
    appliedNow.push(migration.version);
  }
  const proof = await db.query(`select version from supabase_migrations.schema_migrations
    where version=any($1::text[]) order by version`, [[...VERSIONS]]);
  if (proof.rows.length !== VERSIONS.length || proof.rows.some((row, index) => row.version !== VERSIONS[index]))
    throw new Error("MIGRATION_LEDGER_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target, status: apply ? "applied" : "rollback_proof",
    alreadyPresent: ledger.rows.length, appliedNow, migrationSha256: migrations.map(({ version, sha256 }) =>
      ({ version, sha256 })) }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
