#!/usr/bin/env node
/** Owner-directed edge-case decisions. Dry-run rolls back unless --apply. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const targets = [
  { word: "mouth-watering", id: "17b0e224-633d-5d3f-8c5e-e6963c0b5978", reason: "compound_two_bases" },
  { word: "transport", id: "222a9962-ec36-5644-9e0d-8e1ba5661bcb", reason: "latin_port_root_not_harbour_base" },
  { word: "readable", id: "883685c3-9d0d-5071-871c-fca55770d90a", reason: "irregular_read_verb_family" },
];
const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor) {
  throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
}
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const ids = targets.map((target) => target.id);
  const words = (await db.query(`select id,normalised_word,row_status,review_status
    from public.canonical_teaching_dictionary_words where id=any($1::uuid[]) for share`, [ids])).rows;
  assert.equal(words.length, targets.length);
  for (const target of targets) {
    const word = words.find((row) => row.id === target.id);
    assert.equal(word?.normalised_word, target.word);
    assert.equal(word?.row_status, "active");
    assert.equal(word?.review_status, "approved_for_first_exposure");
  }
  const existing = (await db.query(`select canonical_word_id from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and micro_skill_key=$1 and action='deassign'
      and canonical_word_id=any($2::uuid[])`, [skill, ids])).rows;
  assert.equal(existing.length, 0, "one edge case is already deassigned");
  const requestId = randomUUID();
  await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v2(
    'production',$1,$2::uuid[],$3::uuid[],$2::uuid[],$3::uuid[],$2::uuid[],$4::uuid,$5::uuid,$6)`,
  [skill, [], ids, actor, requestId,
    "Owner-approved 2026-10-31 Identify edge-case review: exclude compound, Latin port root, and irregular read family"]);
  const decisions = (await db.query(`select canonical_word_id,action from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [skill, ids])).rows;
  assert.equal(decisions.length, targets.length);
  assert(decisions.every((row) => row.action === "deassign"));
  const exclusions = (await db.query(`select count(*)::int n from public.teaching_dictionary_bulk_review_exclusions
    where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [skill, ids])).rows[0].n;
  assert.equal(exclusions, targets.length);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", targets, requestId,
    decisions: decisions.length, exclusions }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
