#!/usr/bin/env node
/** Exact production repair for an already-visible disabled-mapping replacement. Dry run by default. */
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const apply = process.argv.includes("--apply");
const pair = ["everywere", "everywhere"];
const oldSkill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR";
const newSkill = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const q = (sql, args = []) => db.query(sql, args);

await db.connect();
try {
  await q("begin isolation level serializable");
  await q("set local lock_timeout='5s'");
  const mappings = (await q(`select id,micro_skill_key,mapping_status,resolver_visibility_status,
    dialect_code,normalization_version,created_by_admin_user_id,replacement_mapping_id
    from public.spelling_canonical_mappings
    where misspelling_normalized=$1 and correct_spelling_normalized=$2
    order by id for update`, pair)).rows;
  assert.equal(mappings.length, 2, "Expected exactly two mappings for this pair");
  const old = mappings.find(row => row.micro_skill_key === oldSkill);
  const replacement = mappings.find(row => row.micro_skill_key === newSkill);
  assert(old && replacement, "Exact old and replacement skills are required");
  assert.equal(old.mapping_status, "disabled");
  assert.equal(old.resolver_visibility_status, "disabled");
  assert.equal(old.replacement_mapping_id, null);
  assert.equal(replacement.mapping_status, "active");
  assert.equal(replacement.resolver_visibility_status, "visible");
  assert.equal(old.dialect_code, replacement.dialect_code);
  assert.equal(old.normalization_version, replacement.normalization_version);
  for (const mapping of [old, replacement]) {
    const events = (await q(`select count(*)::int n from public.spelling_canonical_mapping_events
      where mapping_id=$1 and event_type='resolver_visibility_enabled'
        and new_resolver_visibility_status='visible'`, [mapping.id])).rows[0].n;
    assert(events > 0, "Both mappings require prior visibility evidence");
  }
  const candidates = (await q(`select c.id,c.micro_skill_key,c.candidate_state,c.learning_item_id
    from public.adle_canonical_intake_candidates c
    join public.parent_verified_spelling_candidate_mappings p on p.id=c.source_candidate_mapping_id
    where p.misspelling_normalized=$1 and p.correct_spelling_normalized=$2
    order by c.id for update of c`, pair)).rows;
  assert.equal(candidates.length, 1, "Expected exactly one intake candidate");
  assert.equal(candidates[0].micro_skill_key, oldSkill);
  assert.equal(candidates[0].candidate_state, "pending_mapping");
  assert.equal(candidates[0].learning_item_id, null);
  const existing = (await q(`select count(*)::int n from public.adle_resolver_change_reconciliations
    where old_mapping_id=$1`, [old.id])).rows[0].n;
  assert.equal(existing, 0, "Resolver change already recorded");
  const inserted = (await q(`insert into public.adle_resolver_change_reconciliations
    (old_mapping_id,new_mapping_id,misspelling_normalized,correct_spelling_normalized,
      dialect_code,normalization_version,old_micro_skill_key,new_micro_skill_key,
      requested_by,reason)
    values($1,$2,$3,$4,$5,$6,$7,$8,
      (select id from auth.users where id=$9),$10)
    returning id`, [old.id,replacement.id,...pair,replacement.dialect_code,
      replacement.normalization_version,oldSkill,newSkill,replacement.created_by_admin_user_id,
      "Reconcile approved everywere to everywhere resolver transfer from disabled homophone mapping to visible compound-word mapping"])).rows[0];
  const processed = (await q("select * from public.adle_process_resolver_changes_v1(1)")).rows;
  assert.deepEqual(processed, [{ change_id: inserted.id, outcome: "complete" }],
    "The exact resolver change did not complete");
  const current = (await q(`select micro_skill_key,candidate_state,learning_item_id
    from public.adle_canonical_intake_candidates where id=$1`, [candidates[0].id])).rows[0];
  assert.equal(current.micro_skill_key, newSkill);
  assert.equal(current.candidate_state, "queued");
  assert.equal(current.learning_item_id, null);
  const waitingOld = (await q(`select count(*)::int n
    from public.adle_canonical_intake_candidate_demands l
    join public.adle_canonical_intake_demands d on d.id=l.demand_id
    where l.candidate_id=$1 and d.micro_skill_key=$2 and l.link_status='waiting'`,
    [candidates[0].id,oldSkill])).rows[0].n;
  assert.equal(waitingOld, 0);
  if (apply) await q("commit"); else await q("rollback");
  console.log({ mode: apply ? "applied" : "rollback_proof", pair: pair.join(" → "),
    oldSkill, newSkill, candidateState: current.candidate_state, waitingOld });
} catch (error) {
  await q("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
