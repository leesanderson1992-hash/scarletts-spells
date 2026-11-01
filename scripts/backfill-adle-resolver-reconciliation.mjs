#!/usr/bin/env node
/** Backfill the 18 owner-approved base-word resolver transfers. Dry run by default. */
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const apply = process.argv.includes("--apply");
const identify = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const oldKeys = ["D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX","D4_MOR_BASE_WORDS_PRESERVE_BASE"];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const q = (sql, args = []) => db.query(sql, args);

await db.connect();
try {
  await q("begin isolation level serializable");
  await q("set local lock_timeout='5s'");
  const old = (await q(`select m.*,r.id new_id,r.micro_skill_key new_skill,
    r.mapping_status new_status,r.resolver_visibility_status new_visibility
    from public.spelling_canonical_mappings m
    join public.spelling_canonical_mappings r on r.id=m.replacement_mapping_id
    where m.micro_skill_key=any($1::text[]) and m.mapping_status='superseded'
      and r.micro_skill_key=$2 and r.mapping_status='active'
      and r.resolver_visibility_status='visible'
    order by m.id for update of m`, [oldKeys,identify])).rows;
  assert.equal(old.length,18);
  const existing = (await q(`select count(*)::int n from public.adle_resolver_change_reconciliations
    where old_mapping_id=any($1::uuid[])`,[old.map(row=>row.id)])).rows[0].n;
  assert.equal(existing,0,"Backfill already started");
  const before = (await q(`select
    (select count(*)::int from public.adle_learning_items where row_status='active'
      and micro_skill_key=any($1::text[])) old_active_needs,
    (select count(*)::int from public.adle_canonical_intake_candidates
      where micro_skill_key=any($1::text[])) old_candidates,
    (select count(*)::int from public.adle_resolver_change_reconciliations) events`,[oldKeys])).rows[0];
  assert.equal(before.old_active_needs,4);
  assert.equal(before.old_candidates,4);
  for (const mapping of old) {
    await q(`insert into public.adle_resolver_change_reconciliations
      (old_mapping_id,new_mapping_id,misspelling_normalized,correct_spelling_normalized,
        dialect_code,normalization_version,old_micro_skill_key,new_micro_skill_key,
        requested_by,reason)
      values($1,$2,$3,$4,$5,$6,$7,$8,
        (select id from auth.users where id=$9),$10)`,
      [mapping.id,mapping.new_id,mapping.misspelling_normalized,mapping.correct_spelling_normalized,
        mapping.dialect_code,mapping.normalization_version,mapping.micro_skill_key,identify,
        mapping.created_by_admin_user_id,
        "Backfill of owner-approved 2026-11-01 base-word resolver cutover; preserve exact mapping and learner source lineage"]);
  }
  const processed = (await q("select * from public.adle_process_resolver_changes_v1(100)")).rows;
  assert.equal(processed.length,18);
  assert(processed.every(row=>row.outcome==="complete"),"Resolver backfill needs review");
  const prior = (await q(`select r.source_candidate_mapping_id,r.old_micro_skill_key,
    r.new_micro_skill_key,c.learning_item_id,c.id candidate_id,
    m.id old_mapping_id,m.replacement_mapping_id new_mapping_id
    from public.adle_pending_intake_skill_reclassifications r
    join public.parent_verified_spelling_candidate_mappings p
      on p.id=r.source_candidate_mapping_id
    join public.spelling_canonical_mappings m
      on m.misspelling_normalized=p.misspelling_normalized
      and m.correct_spelling_normalized=p.correct_spelling_normalized
      and m.micro_skill_key=r.old_micro_skill_key
      and m.replacement_mapping_id=r.resolver_mapping_id
    left join public.adle_canonical_intake_candidates c
      on c.source_candidate_mapping_id=r.source_candidate_mapping_id
    where r.old_micro_skill_key=any($1::text[])
      and r.new_micro_skill_key=$2 order by r.source_candidate_mapping_id`,[oldKeys,identify])).rows;
  assert.equal(prior.length,4);
  for (const row of prior) {
    const change=(await q(`select id from public.adle_resolver_change_reconciliations
      where old_mapping_id=$1`,[row.old_mapping_id])).rows[0];
    assert(change);
    const item = row.learning_item_id ? (await q(`select id from public.adle_learning_items
      where id=$1 and micro_skill_key=$2`,[row.learning_item_id,identify])).rows[0] : null;
    assert(!row.learning_item_id || item);
    await q(`insert into public.adle_resolver_change_source_outcomes
      (change_id,source_candidate_mapping_id,new_learning_item_id,outcome,reason)
      values($1,$2,$3,$4,$5) on conflict(change_id,source_candidate_mapping_id) do nothing`,
      [change.id,row.source_candidate_mapping_id,item?.id??null,
        item?"moved":"requeued","Earlier owner-approved intake reconciliation receipt; original parent source and intake date retained"]);
  }
  const mismatched=(await q(`select s.*,li.micro_skill_key item_skill,m.id old_mapping_id,
    m.replacement_mapping_id new_mapping_id
    from public.adle_learning_item_sources s
    join public.adle_learning_items li on li.id=s.learning_item_id
    join public.spelling_canonical_mappings m on m.id=s.canonical_mapping_id
    where s.row_status='active' and li.row_status='active' and li.micro_skill_key=$1
      and s.micro_skill_key=any($2::text[]) and m.mapping_status='superseded'
      and m.replacement_mapping_id is not null
    order by s.id for update of s`,[identify,oldKeys])).rows;
  assert.equal(mismatched.length,1);
  for (const source of mismatched) {
    const change=(await q(`select id from public.adle_resolver_change_reconciliations
      where old_mapping_id=$1`,[source.old_mapping_id])).rows[0];
    assert(change);
    await q(`update public.adle_learning_item_sources set row_status='superseded'
      where id=$1`,[source.id]);
    await q(`insert into public.adle_learning_item_sources
      (learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,
        misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status)
      values($1,$2,$3,$4,$5,$6,$7,'active')`,
      [source.learning_item_id,source.parent_verified_candidate_mapping_id,source.new_mapping_id,
        source.misspelling_normalized,source.correct_spelling_normalized,identify,
        `resolver_change:${change.id}:${source.id}`]);
    await q(`insert into public.adle_resolver_change_source_outcomes
      (change_id,source_candidate_mapping_id,old_learning_item_id,new_learning_item_id,outcome,reason)
      values($1,$2,$3,$3,'moved',$4)
      on conflict(change_id,source_candidate_mapping_id) do nothing`,
      [change.id,source.parent_verified_candidate_mapping_id,source.learning_item_id,
        "Earlier migration placed this source under Identify; restored active source authority while retaining historical source row"]);
  }
  await q(`update public.adle_resolver_change_reconciliations e set
    affected_candidate_count=(select count(*) from public.adle_resolver_change_source_outcomes o where o.change_id=e.id),
    moved_need_count=(select count(*) from public.adle_resolver_change_source_outcomes o
      where o.change_id=e.id and o.outcome='moved'),
    issued_need_count=(select count(*) from public.adle_resolver_change_source_outcomes o
      where o.change_id=e.id and o.outcome='issued_pinned')
    where e.old_mapping_id=any($1::uuid[])`,[old.map(row=>row.id)]);
  const after=(await q(`select
    (select count(*)::int from public.adle_resolver_change_reconciliations
      where old_mapping_id=any($1::uuid[]) and reconciliation_status='complete') events,
    (select count(*)::int from public.adle_resolver_change_source_outcomes o
      join public.adle_resolver_change_reconciliations e on e.id=o.change_id
      where e.old_mapping_id=any($1::uuid[])) source_outcomes,
    (select count(*)::int from public.adle_learning_items where row_status='active'
      and micro_skill_key=any($2::text[])) old_active_needs`,[old.map(row=>row.id),oldKeys])).rows[0];
  assert.equal(after.events,18);
  assert.equal(after.old_active_needs,4);
  if (apply) await q("commit"); else await q("rollback");
  console.log({mode:apply?"applied":"rollback_proof",before,after,
    earlierReceipts:prior.length,sourceAuthorityRepairs:mismatched.length});
} catch(error) {
  await q("rollback").catch(()=>{});
  throw error;
} finally { await db.end(); }
