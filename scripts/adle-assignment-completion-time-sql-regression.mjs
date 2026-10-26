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

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.daily_assignments (
      id integer primary key,
      status text not null,
      session_completed_at timestamptz
    );
  `);
  await db.exec(readFileSync(
    "supabase/migrations/20261026130000_record_adle_assignment_completion_time.sql",
    "utf8",
  ));
  await db.exec(`
    insert into public.daily_assignments (id, status) values
      (1, 'pending'), (2, 'completed');
    update public.daily_assignments set status = 'completed' where id = 1;
  `);
  const first = await db.query("select id, session_completed_at from public.daily_assignments order by id");
  assert(first.rows.every((row) => row.session_completed_at), "every newly completed assignment has a timestamp");

  await db.exec("update public.daily_assignments set status = 'completed' where id = 1");
  const retry = await db.query("select session_completed_at from public.daily_assignments where id = 1");
  assert.equal(retry.rows[0].session_completed_at.getTime(), first.rows[0].session_completed_at.getTime(),
    "idempotent completion keeps the original timestamp");

  await db.exec("insert into public.daily_assignments (id, status) values (3, 'pending')");
  const pending = await db.query("select session_completed_at from public.daily_assignments where id = 3");
  assert.equal(pending.rows[0].session_completed_at, null, "pending assignment has no completion timestamp");

  await db.exec("alter table public.daily_assignments disable trigger daily_assignments_record_completion_time");
  await db.exec("insert into public.daily_assignments (id, status) values (4, 'completed')");
  await db.exec("alter table public.daily_assignments enable trigger daily_assignments_record_completion_time");
  await db.exec("update public.daily_assignments set status = 'completed' where id = 4");
  const historical = await db.query("select session_completed_at from public.daily_assignments where id = 4");
  assert.equal(historical.rows[0].session_completed_at, null,
    "an old completed row is not assigned an invented completion time");

  console.log("ADLE assignment completion time SQL regression passed");
} finally {
  await db.close();
}
