#!/usr/bin/env node
/** Install only the reviewed lexical family functions on guarded staging. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("CANONICAL_FAMILY_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const files = [
  ["20261101170000", "review_lexical_root_family_member_revision"],
  ["20261101180000", "create_reviewed_lexical_free_base_family"],
];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  for (const [version, name] of files) {
    const prior = await db.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
    if (prior.rowCount) throw new Error(`CANONICAL_FAMILY_MIGRATION_ALREADY_APPLIED:${version}`);
    const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
    await db.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
    if (apply) await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [version, name, [sql]],
    );
  }
  const proof = await db.query(`select
    pg_get_functiondef('public.review_lexical_base_family_member_revision(text,integer,uuid,uuid,text,text,text,text,text,text)'::regprocedure) root_function,
    to_regprocedure('public.create_reviewed_lexical_free_base_family(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text)')::text free_base_function`);
  if (!proof.rows[0]?.root_function?.includes("canonical_teaching_dictionary_lexical_root_metadata") ||
    !proof.rows[0]?.free_base_function) throw new Error("CANONICAL_FAMILY_STAGING_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ environment: "staging", versions: files.map(([version]) => version),
    status: apply ? "installed" : "rollback_proof" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
