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
const assignment = "00000000-0000-4000-8000-000000000003";
const first = "00000000-0000-4000-8000-000000000004";
const second = "00000000-0000-4000-8000-000000000005";

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.test_user_id', true), '')::uuid $$;
    create table public.daily_assignments (
      id uuid primary key, parent_user_id uuid, child_id uuid,
      status text not null, session_completed_at timestamptz
    );
    create table public.assignment_items (
      id uuid primary key, daily_assignment_id uuid, parent_user_id uuid,
      child_id uuid, status text not null
    );
  `);
  for (const filename of [
    "20261026130000_record_adle_assignment_completion_time.sql",
    "20261026132000_complete_adle_assignment_items_atomically.sql",
  ]) {
    await db.exec(readFileSync(`supabase/migrations/${filename}`, "utf8"));
  }
  await db.exec(`
    select set_config('app.test_user_id','${parent}',false);
    insert into public.daily_assignments values ('${assignment}','${parent}','${child}','pending',null);
    insert into public.assignment_items values
      ('${first}','${assignment}','${parent}','${child}','pending'),
      ('${second}','${assignment}','${parent}','${child}','pending');
  `);
  const call = (itemIds) => db.query(
    "select public.complete_adle_assignment_items_v1($1,$2,$3,$4::uuid[]) completed",
    [parent, child, assignment, itemIds]);
  assert.equal((await call([first])).rows[0].completed, false);
  let state = await db.query("select status,session_completed_at from public.daily_assignments where id=$1", [assignment]);
  assert.equal(state.rows[0].status, "pending");
  assert.equal(state.rows[0].session_completed_at, null);

  await assert.rejects(call([second, "00000000-0000-4000-8000-000000000099"]),
    /item set changed/);
  state = await db.query("select status from public.assignment_items where id=$1", [second]);
  assert.equal(state.rows[0].status, "pending", "invalid call rolls back its item update");

  assert.equal((await call([second])).rows[0].completed, true);
  state = await db.query("select status,session_completed_at from public.daily_assignments where id=$1", [assignment]);
  assert.equal(state.rows[0].status, "completed");
  assert(state.rows[0].session_completed_at, "first completion records its timestamp");
  const completedAt = state.rows[0].session_completed_at.getTime();
  assert.equal((await call([second])).rows[0].completed, true);
  state = await db.query("select session_completed_at from public.daily_assignments where id=$1", [assignment]);
  assert.equal(state.rows[0].session_completed_at.getTime(), completedAt,
    "retry preserves first completion time");
  console.log("ADLE atomic assignment item completion SQL regression passed");
} finally {
  await db.close();
}
