import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = process.env.PATH?.split(delimiter)
  .map((entry) => resolve(entry, "../@electric-sql/pglite"))
  .find(existsSync);
if (!packageRoot) throw new Error("Run with npx --package=@electric-sql/pglite@0.5.8");
const { PGlite } = require(packageRoot);
const db = new PGlite();
const parent = "00000000-0000-4000-8000-000000000001";
const child = "00000000-0000-4000-8000-000000000002";
const sample = "00000000-0000-4000-8000-000000000003";

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.test_user_id', true), '')::uuid $$;
    create table public.writing_samples (
      id uuid primary key, parent_user_id uuid, child_id uuid,
      task_submission_id uuid, review_completed_at timestamptz
    );
    create table public.writing_issue_suggestions (
      id uuid primary key default gen_random_uuid(), child_id uuid,
      parent_user_id uuid, task_submission_id uuid, writing_sample_id uuid,
      source_type text, suggestion_status text, observed_text text,
      suggested_replacement text, source_field_key text,
      suggested_micro_skill_key text, notes text, resolved_at timestamptz
    );
    create table public.writing_issues (
      id uuid primary key default gen_random_uuid(), child_id uuid,
      parent_user_id uuid, task_submission_id uuid, writing_sample_id uuid,
      source_suggestion_id uuid, source_misspelling_instance_id uuid,
      issue_status text, final_classification text, observed_text text,
      suggested_replacement text, approved_replacement text,
      source_field_key text, micro_skill_key text, parent_review_note text,
      parent_marked_at timestamptz, created_at timestamptz default now(),
      constraint reject_failure_probe check (observed_text <> 'fail')
    );
  `);
  await db.exec(readFileSync(
    "supabase/migrations/20261026133000_save_manual_writing_issue_atomically.sql", "utf8"));
  await db.exec(`
    select set_config('app.test_user_id','${parent}',false);
    insert into public.writing_samples(id,parent_user_id,child_id)
      values ('${sample}','${parent}','${child}');
  `);
  const call = (observed) => db.query(
    "select public.save_parent_manual_writing_issue_v1($1,null,$2,$3,$4,null,null) id",
    [sample, observed, "unlocked", "D4_MOR_PREFIXES_UN"]);
  const first = await call("urnlocked");
  const retry = await call("urnlocked");
  assert.equal(first.rows[0].id, retry.rows[0].id, "retry returns the same issue");
  let counts = await db.query(`
    select (select count(*) from public.writing_issue_suggestions) suggestions,
      (select count(*) from public.writing_issues) issues
  `);
  assert.deepEqual([Number(counts.rows[0].suggestions), Number(counts.rows[0].issues)], [1, 1]);
  await assert.rejects(call("fail"), /reject_failure_probe/);
  counts = await db.query(`
    select (select count(*) from public.writing_issue_suggestions) suggestions,
      (select count(*) from public.writing_issues) issues
  `);
  assert.deepEqual([Number(counts.rows[0].suggestions), Number(counts.rows[0].issues)],
    [1, 1], "failed issue insert leaves no accepted suggestion");
  console.log("Manual writing issue atomic SQL regression passed");
} finally {
  await db.close();
}
