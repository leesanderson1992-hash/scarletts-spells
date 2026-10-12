import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(part => resolve(part, "../@electric-sql/pglite")).find(existsSync);
if (!root) throw new Error("Run with npx --yes --package=@electric-sql/pglite@0.5.8 -c 'node scripts/adle-homophone-best-sql-regression.mjs'");
const { PGlite } = require(root);
const db = new PGlite();
const parentA = "11111111-1111-4111-8111-111111111111";
const parentB = "22222222-2222-4222-8222-222222222222";
const childA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const childB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const skill = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
try {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.children(id uuid primary key, parent_user_id uuid not null, is_archived boolean default false);
    insert into auth.users values ('${parentA}'), ('${parentB}');
    insert into children values ('${childA}', '${parentA}', false), ('${childB}', '${parentB}', false);
  `);
  await db.exec(readFileSync("supabase/migrations/20261012160000_adle_homophone_balloon_bests.sql", "utf8"));
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${parentA}';`);
  const save = (child, key, score) => db.query("select record_adle_homophone_balloon_best($1,$2,$3) as best", [child, key, score]);
  assert.equal((await save(childA, skill, 2)).rows[0].best, 2);
  assert.equal((await save(childA, skill, 1)).rows[0].best, 2);
  assert.equal((await save(childA, skill, 5)).rows[0].best, 5);
  assert.equal((await save(childA, "D4_HOM_CONTENT_WORD_HOMOPHONES_FLOWER_FLOUR", 3)).rows[0].best, 3);
  await assert.rejects(save(childB, skill, 10));
  await assert.rejects(save(childA, skill, -1));
  assert.equal((await db.query("select count(*)::integer as n from adle_homophone_balloon_bests")).rows[0].n, 2);
  await db.exec(`set request.jwt.claim.sub = '${parentB}';`);
  assert.equal((await db.query("select count(*)::integer as n from adle_homophone_balloon_bests")).rows[0].n, 0);
  assert.equal((await save(childB, skill, 4)).rows[0].best, 4);
  assert.equal((await db.query("select best_score from adle_homophone_balloon_bests")).rows[0].best_score, 4);
  console.log("Homophone personal-best SQL regression passed: higher-only, child and skill isolation, ownership and RLS.");
} finally {
  await db.close();
}
