#!/usr/bin/env node
/** Install candidate migrations and prove family creation; roll back all writes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const migrationNames = [
  "20261101170000_review_lexical_root_family_member_revision.sql",
  "20261101180000_create_reviewed_lexical_free_base_family.sql",
];
const proof = async (name, args, expectedMembers) => {
  await db.query("savepoint scenario");
  try {
    const result = await db.query(`select public.create_reviewed_lexical_free_base_family(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) key`, args);
    const key = result.rows[0]?.key;
    const family = await db.query(`select review_status from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=$1 and revision=1`, [key]);
    const members = await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=$1 and revision=1`, [key]);
    assert.equal(family.rows[0]?.review_status, "approved");
    assert.equal(members.rows[0]?.n, expectedMembers);
    await assert.rejects(db.query(`select public.create_reviewed_lexical_free_base_family(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, args), /LEXICAL_FAMILY_ALREADY_EXISTS/);
    console.log(`${name}: approved ${expectedMembers} member(s); duplicate rejected`);
  } finally {
    await db.query("rollback to savepoint scenario");
  }
};

try {
  await db.connect();
  await db.query("begin");
  for (const name of migrationNames) {
    const sql = fs.readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")
      .replace(/^begin;/m, "").replace(/commit;\s*$/, "");
    await db.query(sql);
  }
  await proof("standalone plate", [
    "00ccd7e3-f46c-516c-bb8a-535c49a4c817", "00ccd7e3-f46c-516c-bb8a-535c49a4c817",
    "e9ec241a-36c7-5b34-b09b-97f5e5f3088f", "e9ec241a-36c7-5b34-b09b-97f5e5f3088f",
    "noun", "noun", "free_base", "a flat dish", "a flat dish", "staging proof", "staging reviewer", "staging approval",
  ], 1);
  await proof("kid and kids", [
    "119152bf-a66f-5ac2-9020-d3cbbc9ec13c", "900b31c0-c1c4-5099-8edb-40367679a717",
    "891cee22-41b4-5624-af7a-805a737048a2", "5cef8ab5-9ec3-5d51-bdcd-aa5fcbf1968c",
    "noun", "noun", "regular_inflection", "a child", "more than one child", "staging proof", "staging reviewer", "staging approval",
  ], 2);
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
