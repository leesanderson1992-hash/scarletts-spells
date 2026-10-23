#!/usr/bin/env node
/** Install the empty, review-gated lexical-family registry on Production. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const VERSION = "20261023154000";
const NAME = "teaching_dictionary_lexical_base_registry";
const SHA256 = "545b8a632fd32d53957b01d05a096f499638985e9755c998fc50a9eabd34ac90";
const raw = readFileSync(resolve(ROOT, `supabase/migrations/${VERSION}_${NAME}.sql`), "utf8");
if (createHash("sha256").update(raw).digest("hex") !== SHA256) throw new Error("MIGRATION_SOURCE_CHANGED");
const sql = raw.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
const line = readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!line) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
let connectionString = line.slice(line.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) connectionString = connectionString.slice(1, -1);
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query(apply ? "begin" : "begin read only");
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='90s'");
  if (apply) await client.query("select pg_advisory_xact_lock(hashtext('teaching-lexical-family-schema'))");
  const ledger = await client.query("select version from supabase_migrations.schema_migrations where version=$1", [VERSION]);
  const existing = await client.query(`select
    to_regclass('public.canonical_teaching_dictionary_lexical_base_families')::text family_table,
    to_regclass('public.canonical_teaching_dictionary_lexical_base_family_members')::text member_table`);
  if (ledger.rowCount || existing.rows[0].family_table || existing.rows[0].member_table)
    throw new Error("LEXICAL_FAMILY_MIGRATION_ALREADY_PRESENT_OR_SCHEMA_DRIFT");
  if (!apply) {
    await client.query("rollback");
    console.log(JSON.stringify({ target: "production", version: VERSION, status: "pending", changed: false }));
  } else {
    await client.query(sql);
    await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [VERSION, NAME, [raw]]);
    const proof = await client.query(`select
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_families) family_rows,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members) member_rows,
      (select count(*)::int from supabase_migrations.schema_migrations where version=$1) ledger_rows`, [VERSION]);
    if (proof.rows[0].family_rows !== 0 || proof.rows[0].member_rows !== 0 || proof.rows[0].ledger_rows !== 1)
      throw new Error("LEXICAL_FAMILY_INSTALL_READBACK_FAILED");
    await client.query("commit");
    console.log(JSON.stringify({ target: "production", version: VERSION, status: "installed",
      familyRows: 0, memberRows: 0 }));
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally { await client.end().catch(() => {}); }
