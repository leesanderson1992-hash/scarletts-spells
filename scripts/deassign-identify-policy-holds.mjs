#!/usr/bin/env node
/** Owner-approved, reversible Identify policy holds. Dry-run rolls back. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const manifest = JSON.parse(readFileSync(new URL("../data/adle/approved/d4-mor/v2/identify-policy-holds-2026-10-31.json", import.meta.url)));
const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor) {
  throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
}
assert.equal(manifest.environment, "production");
assert.equal(manifest.microSkillKey, skill);
assert.equal(manifest.targets.length, 198);
assert.equal(new Set(manifest.targets.map((row) => row.canonicalWordId)).size, 198);
const ids = manifest.targets.map((row) => row.canonicalWordId);
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const words = (await db.query(`select id,normalised_word,row_status,review_status
    from public.canonical_teaching_dictionary_words where id=any($1::uuid[]) for share`, [ids])).rows;
  assert.equal(words.length, ids.length, "manifest word missing");
  const byId = new Map(words.map((row) => [row.id, row]));
  for (const target of manifest.targets) {
    const word = byId.get(target.canonicalWordId);
    assert.equal(word?.normalised_word, target.word, `manifest word changed: ${target.word}`);
    assert.equal(word?.row_status, "active");
    assert.equal(word?.review_status, "approved_for_first_exposure");
  }
  const published = (await db.query(`select count(distinct p.canonical_word_id)::int n
    from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
    where r.environment_key='production' and p.micro_skill_key=$1
      and p.relationship_role='demonstrates' and p.canonical_word_id=any($2::uuid[])
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)`,
  [skill, ids])).rows[0].n;
  assert.equal(published, ids.length, "a manifest pair is not published");
  const existing = (await db.query(`select canonical_word_id,action from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [skill, ids])).rows;
  assert.equal(existing.filter((row) => row.action === "deassign").length, 0, "manifest includes already deassigned pair");
  const controls = (await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='production'`)).rows[0];
  assert(controls?.review_enabled && controls.publication_enabled && controls.withdrawal_enabled,
    "Production review controls disabled");
  const empty = [];
  const requests = [];
  for (let offset = 0; offset < ids.length; offset += 99) {
    const batch = ids.slice(offset, offset + 99);
    const requestId = randomUUID();
    requests.push(requestId);
    await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v2(
      'production',$1,$2::uuid[],$3::uuid[],$2::uuid[],$3::uuid[],$2::uuid[],$4::uuid,$5::uuid,$6)`,
    [skill, empty, batch, actor, requestId,
      `Owner-approved 2026-10-31 Identify policy hold: ${manifest.sourceReportSha256}`]);
  }
  const decisions = (await db.query(`select canonical_word_id,action from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [skill, ids])).rows;
  assert.equal(decisions.length, ids.length);
  assert(decisions.every((row) => row.action === "deassign"));
  const exclusions = (await db.query(`select count(*)::int n from public.teaching_dictionary_bulk_review_exclusions
    where environment_key='production' and micro_skill_key=$1 and canonical_word_id=any($2::uuid[])`,
  [skill, ids])).rows[0].n;
  assert.equal(exclusions, ids.length);
  if (apply) await db.query("commit");
  else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", environment: "production",
    words: ids.length, publishedPairsBefore: published, decisions: decisions.length,
    exclusions, sourceReportSha256: manifest.sourceReportSha256, requests }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
