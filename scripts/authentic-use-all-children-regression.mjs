import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
if (!root) throw new Error("pglite unavailable");
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key);
create table public.children(id uuid primary key,parent_user_id uuid not null references auth.users(id),is_archived boolean not null default false);
create table public.authentic_use_controls(child_id uuid primary key references public.children(id),parent_user_id uuid not null references auth.users(id),mode text not null,gold_enabled boolean not null,proficiency_enabled boolean not null,activation_cutoff timestamptz not null);
`);
const parent = randomUUID(), canary = randomUUID(), oldChild = randomUUID(), newChild = randomUUID(), archivedChild = randomUUID();
await db.query("insert into auth.users values($1)", [parent]);
for (const id of [canary, oldChild]) await db.query("insert into public.children(id,parent_user_id) values($1,$2)", [id,parent]);
await db.query("insert into public.authentic_use_controls values($1,$2,'enabled',true,true,'2026-10-05T10:00:00Z')", [canary,parent]);
await db.query("insert into public.authentic_use_controls values($1,$2,'shadow',false,false,'2026-10-05T10:00:00Z')", [oldChild,parent]);
await db.exec(readFileSync("supabase/migrations/20261006190000_authentic_use_all_children_rollout.sql", "utf8"));

await db.query("insert into public.children(id,parent_user_id) values($1,$2)", [newChild,parent]);
assert.equal((await db.query("select count(*)::int n from public.authentic_use_controls where child_id=$1", [newChild])).rows[0].n, 0,
  "Migration is inert until the guarded release enables it");
await db.query("update public.authentic_use_rollout set enabled=true,enabled_at=clock_timestamp() where id");
await db.query("update public.children set is_archived=false where id=any($1::uuid[])", [[canary,oldChild]]);
const existing = (await db.query("select child_id,mode,gold_enabled,proficiency_enabled,activation_cutoff from public.authentic_use_controls where child_id=any($1::uuid[]) order by child_id", [[canary,oldChild]])).rows;
assert.equal(existing.length, 2);
assert.ok(existing.every(row => row.mode === "enabled" && row.gold_enabled && row.proficiency_enabled));
assert.equal(new Date(existing.find(row => row.child_id === canary).activation_cutoff).toISOString(), "2026-10-05T10:00:00.000Z",
  "An enabled child's established cutoff is preserved");
assert.ok(new Date(existing.find(row => row.child_id === oldChild).activation_cutoff).getTime() > Date.parse("2026-10-05T10:00:00Z"),
  "A shadow child receives a fresh cutoff");

await db.query("insert into public.children(id,parent_user_id) values($1,$2)", [archivedChild,parent]);
assert.equal((await db.query("select mode from public.authentic_use_controls where child_id=$1", [archivedChild])).rows[0].mode, "enabled");
const trulyArchived = randomUUID();
await db.query("insert into public.children(id,parent_user_id,is_archived) values($1,$2,true)", [trulyArchived,parent]);
assert.equal((await db.query("select count(*)::int n from public.authentic_use_controls where child_id=$1", [trulyArchived])).rows[0].n, 0);
await db.query("update public.children set is_archived=false where id=$1", [trulyArchived]);
assert.equal((await db.query("select mode from public.authentic_use_controls where child_id=$1", [trulyArchived])).rows[0].mode, "enabled");
await db.close();
console.log("Authentic-use all-child rollout enrolment and cutoff regression passed.");
