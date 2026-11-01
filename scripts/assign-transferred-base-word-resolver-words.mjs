#!/usr/bin/env node
/** Owner-approved Identify pair assignment for the words behind 18 transferred mappings. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const IDENTIFY = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const OLD = ["D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX", "D4_MOR_BASE_WORDS_PRESERVE_BASE"];
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor) throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const rows = (await db.query(`select distinct w.id,w.normalised_word,w.review_status,w.row_status,
      d.action,
      exists(select 1 from public.adle_reviewed_word_skill_pairs p
        join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
        where p.canonical_word_id=w.id and p.micro_skill_key=$1 and p.relationship_role='demonstrates'
          and r.environment_key='production' and not exists(
            select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)) published
    from public.spelling_canonical_mappings old
    join public.spelling_canonical_mappings current on current.id=old.replacement_mapping_id
    join public.canonical_teaching_dictionary_words w on w.normalised_word=current.correct_spelling_normalized
    left join public.teaching_dictionary_pair_latest_decisions d on d.canonical_word_id=w.id
      and d.micro_skill_key=$1 and d.environment_key='production'
    where old.micro_skill_key=any($2::text[]) and old.mapping_status='superseded'
      and current.micro_skill_key=$1 and current.mapping_status='active'
      and current.resolver_visibility_status='visible'
      and current.metadata->>'source_mapping_id'=old.id::text
    order by w.normalised_word`, [IDENTIFY, OLD])).rows;
  assert.equal(rows.length, 17, "Distinct transferred word count changed");
  assert(rows.every((r) => r.review_status === "approved_for_first_exposure" && r.row_status === "active"),
    "Transferred resolver word is not dictionary approved");
  const publish = rows.filter((r) => !r.published);
  const restore = rows.filter((r) => r.action === "deassign");
  assert.deepEqual(restore.map((r) => r.normalised_word), ["ingredients", "invention"]);
  assert.equal(publish.length, 7, "New pair publication count changed");
  const request = randomUUID();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    ownerDecision: "2026-11-01 transfer all 18 old-key resolver mappings and assign their words to Identify",
    skill: IDENTIFY, words: rows.map((r) => r.normalised_word),
  })).digest("hex");
  await db.query(`select * from public.prepare_teaching_dictionary_bulk_skill_approvals(
    'production',$1,$2::uuid[],$3::uuid,$4::uuid)`, [IDENTIFY, publish.map((r) => r.id), actor, request]);
  await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v2(
    'production',$1,$2::uuid[],$3::uuid[],$4::uuid[],$5::uuid[],$6::uuid[],
    $7::uuid,$8::uuid,$9::text)`, [IDENTIFY, publish.map((r) => r.id), [], restore.map((r) => r.id),
    [], restore.map((r) => r.id), actor, request, fingerprint]);
  const after = (await db.query(`select w.normalised_word,d.action,
    exists(select 1 from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where p.canonical_word_id=w.id and p.micro_skill_key=$1 and p.relationship_role='demonstrates'
        and r.environment_key='production' and not exists(
          select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)) published,
    exists(select 1 from public.teaching_dictionary_bulk_review_exclusions e
      where e.canonical_word_id=w.id and e.micro_skill_key=$1 and e.environment_key='production') excluded
    from public.canonical_teaching_dictionary_words w
    left join public.teaching_dictionary_pair_latest_decisions d on d.canonical_word_id=w.id
      and d.micro_skill_key=$1 and d.environment_key='production'
    where w.id=any($2::uuid[]) order by w.normalised_word`, [IDENTIFY, rows.map((r) => r.id)])).rows;
  assert.equal(after.length, 17);
  assert(after.every((r) => r.published && !r.excluded && r.action !== "deassign"), "Identify pair incomplete");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", wordCount: rows.length,
    newlyPublished: publish.map((r) => r.normalised_word),
    restored: restore.map((r) => r.normalised_word), fingerprint, request }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
