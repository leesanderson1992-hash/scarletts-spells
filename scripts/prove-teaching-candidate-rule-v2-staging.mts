/** Rollback proof that the pinned staging function can switch rule revisions. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const definition = () => db.query<{ body: string }>(`select pg_get_functiondef(
  'public.reconcile_teaching_dictionary_bulk_review_v4(
    text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb
  )'::regprocedure) body`);
await db.connect();
try {
  const controls = await db.query<{ review_enabled: boolean; publication_enabled: boolean;
    withdrawal_enabled: boolean }>(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  assert.match((await definition()).rows[0].body, /'reviewed_overview_candidate_v1'/);
  const migration = readFileSync(
    "supabase/migrations/20261110230000_teaching_candidate_canonical_rule_v2.sql", "utf8")
    .replace(/^begin;\s*/u, "").replace(/\s*commit;\s*$/u, "");
  await db.query("begin");
  await db.query(migration);
  const changed = (await definition()).rows[0].body;
  assert.match(changed, /'reviewed_overview_candidate_v2'/);
  assert.doesNotMatch(changed, /'reviewed_overview_candidate_v1'/);
  await db.query("rollback");
  assert.match((await definition()).rows[0].body, /'reviewed_overview_candidate_v1'/);
  console.log(JSON.stringify({ environment: "staging", result: "passed", changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
