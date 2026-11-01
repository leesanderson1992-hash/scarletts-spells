#!/usr/bin/env node
/** Correct two staging-only ledger versions that collided with a Production migration. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("CANONICAL_FAMILY_LEDGER_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const entries = [
  ["20261101170000", "20261101210000", "review_lexical_root_family_member_revision"],
  ["20261101180000", "20261101211000", "create_reviewed_lexical_free_base_family"],
];
const sha = (value) => createHash("sha256").update(value).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  for (const [oldVersion, newVersion, name] of entries) {
    const current = await db.query(`select version,name,statements
      from supabase_migrations.schema_migrations where version=any($1::text[])
      for update`, [[oldVersion, newVersion]]);
    if (current.rowCount !== 1 || current.rows[0].version !== oldVersion ||
      current.rows[0].name !== name || current.rows[0].statements?.length !== 1)
      throw new Error(`CANONICAL_FAMILY_LEDGER_UNEXPECTED_STATE:${name}`);
    const file = readFileSync(`supabase/migrations/${newVersion}_${name}.sql`, "utf8");
    if (sha(current.rows[0].statements[0]) !== sha(file))
      throw new Error(`CANONICAL_FAMILY_LEDGER_SQL_MISMATCH:${name}`);
    await db.query(`update supabase_migrations.schema_migrations
      set version=$1 where version=$2 and name=$3`, [newVersion, oldVersion, name]);
  }
  const proof = await db.query(`select version,name from supabase_migrations.schema_migrations
    where version=any($1::text[]) order by version`, [entries.map((row) => row[1])]);
  if (proof.rowCount !== entries.length || proof.rows.some((row, index) =>
    row.version !== entries[index][1] || row.name !== entries[index][2]))
    throw new Error("CANONICAL_FAMILY_LEDGER_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ environment: "staging", versions: entries.map((row) => row[1]),
    status: apply ? "repaired" : "rollback_proof" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
