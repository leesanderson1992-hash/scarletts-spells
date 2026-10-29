#!/usr/bin/env node
/** Dry-run or install the bounded Schwa authoring/intake migrations on staging. */
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const files = [
  "20261029180000_allow_weak_vowel_lesson_only_r6_adoption.sql",
  "20261029210000_reclassify_retired_pending_intake.sql",
  "20261029211000_supersede_equivalent_base_families.sql",
  "20261029212000_initial_a_staging_catalog_alignment.sql",
];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='120s'");
  const protectedState = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedState();
  const receipts = [];
  for (const file of files) {
    const version = file.slice(0, 14);
    const prior = await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version]);
    if (prior.rowCount) { receipts.push({ version, status: "already_applied" }); continue; }
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    await db.query(sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
    await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
      [version, file.slice(15, -4), [sql]]);
    receipts.push({ version, status: apply ? "installed" : "rollback_proof" });
  }
  const after = await protectedState();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("SCHWA_STAGING_PROTECTED_STATE_CHANGED");
  const readback = await db.query(`select
    to_regclass('public.adle_pending_intake_skill_reclassifications') is not null receipt_table,
    to_regprocedure('public.adle_reclassify_retired_pending_intake_v1(uuid,text,uuid,uuid,text)') is not null reclassify_rpc,
    to_regclass('public.teaching_dictionary_base_family_supersessions') is not null family_audit`);
  if (!Object.values(readback.rows[0]).every(Boolean)) throw Error("SCHWA_STAGING_SCHEMA_READBACK_FAILED");
  const familySupersessions = Number((await db.query(
    "select count(*)::int count from public.teaching_dictionary_base_family_supersessions")).rows[0].count);
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "installed" : "rollback_proof",
    receipts, protectedState: before, schema: readback.rows[0], familySupersessions }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
