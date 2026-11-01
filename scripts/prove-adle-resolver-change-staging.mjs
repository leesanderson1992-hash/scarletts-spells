#!/usr/bin/env node
/** Transactional staging proof. Every fixture and the candidate migration roll back. */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const migration = fs.readFileSync(new URL("../supabase/migrations/20261101120000_adle_resolver_change_reconciliation_events.sql", import.meta.url), "utf8")
  .replace(/^begin;/m, "").replace(/commit;\s*$/, "");
const disabledReplacementMigration = fs.readFileSync(new URL("../supabase/migrations/20261101150000_adle_disabled_resolver_replacement_reconciliation.sql", import.meta.url), "utf8")
  .replace(/^begin;/m, "").replace(/commit;\s*$/, "");
const oldMapping = "e232663c-23fb-4b7d-9781-b9e39fd71e02";
const candidateId = "db846eae-9537-40c6-a56c-9652fc00574c";
const identify = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const q = (sql, args = []) => db.query(sql, args);

async function scenario(name, prepare, check, beforeProcess) {
  await q("savepoint scenario");
  try {
    const original = (await q("select * from public.spelling_canonical_mappings where id=$1", [oldMapping])).rows[0];
    assert(original?.mapping_status === "active" && original?.resolver_visibility_status === "visible");
    const candidate = (await q("select * from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert(candidate?.micro_skill_key === original.micro_skill_key);
    const fixture = await prepare(candidate, original);
    const supersession = await q(`select public.supersede_spelling_canonical_mapping_admin(
      $1::uuid,$2::text,$3::text,$4::uuid,null,$5::text,'{}'::jsonb) id`,
      [oldMapping, original.micro_skill_key, identify, original.created_by_admin_user_id,
        "Staging transaction proof of automatic learner demand reconciliation"]);
    const newMapping = supersession.rows[0].id;
    await q(`update public.spelling_canonical_mappings
      set resolver_visibility_status='visible' where id=$1`, [newMapping]);
    const event = (await q(`select * from public.adle_resolver_change_reconciliations
      where old_mapping_id=$1`, [oldMapping])).rows[0];
    assert.equal(event.new_mapping_id, newMapping);
    assert.equal(event.reconciliation_status, "pending");
    if (beforeProcess) await beforeProcess({ candidate, original, event, newMapping, fixture });
    const processed = (await q("select * from public.adle_process_resolver_changes_v1(20)")).rows;
    assert.deepEqual(processed, [{ change_id: event.id, outcome: "complete" }]);
    await check({ candidate, original, event, newMapping });
    console.log(`${name}: ok`);
  } finally {
    await q("rollback to savepoint scenario");
    await q("release savepoint scenario");
  }
}

await db.connect();
try {
  await q("begin");
  await q("set local lock_timeout='5s'");
  await q(migration);
  await q(disabledReplacementMigration);
  await scenario("issued lesson stays pinned", async () => {}, async ({ event, candidate }) => {
    const outcome = (await q("select * from public.adle_resolver_change_source_outcomes where change_id=$1", [event.id])).rows[0];
    assert.equal(outcome.outcome, "issued_pinned");
    const current = (await q("select * from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert.equal(current.learning_item_id, candidate.learning_item_id);
    assert.equal(current.micro_skill_key, candidate.micro_skill_key);
  });
  await scenario("pending intake moves", async () => {
    await q(`update public.adle_canonical_intake_candidates set candidate_state='pending_content',
      learning_item_id=null,activated_at=null where id=$1`, [candidateId]);
  }, async ({ event }) => {
    const current = (await q("select * from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert.equal(current.micro_skill_key, identify);
    assert.equal(current.candidate_state, "queued");
    const outcome = (await q("select outcome from public.adle_resolver_change_source_outcomes where change_id=$1", [event.id])).rows[0];
    assert.equal(outcome.outcome, "requeued");
  });
  await scenario("unissued need merges into existing destination", async (candidate, original) => {
    const oldItem = (await q("select * from public.adle_learning_items where id=$1", [candidate.learning_item_id])).rows[0];
    const source = (await q(`select * from public.adle_learning_item_sources where learning_item_id=$1
      and parent_verified_candidate_mapping_id=$2 and row_status='active'`,
      [oldItem.id, candidate.source_candidate_mapping_id])).rows[0];
    assert.equal(source.canonical_mapping_id, original.id);
    await q("update public.adle_learning_items set row_status='superseded' where id=$1", [oldItem.id]);
    const cloned = (await q(`insert into public.adle_learning_items
      (child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,
        source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
      values($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,'active') returning id`,
      [oldItem.child_id,oldItem.canonical_word_id,oldItem.micro_skill_key,oldItem.source_kind,
        oldItem.source_ref,oldItem.source_attempt_text,oldItem.reteach_priority,oldItem.ejected_on,
        oldItem.intake_on])).rows[0]?.id;
    // Preserve the issued original as history and use a disposable active need.
    assert(cloned, "A disposable unissued item could not be created");
    await q(`insert into public.adle_learning_item_sources
      (learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,
        misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status)
      values($1,$2,$3,$4,$5,$6,$7,'active')`,
      [cloned,candidate.source_candidate_mapping_id,source.canonical_mapping_id,
        source.misspelling_normalized,source.correct_spelling_normalized,source.micro_skill_key,source.source_ref]);
    await q("update public.adle_canonical_intake_candidates set learning_item_id=$2 where id=$1", [candidateId,cloned]);
    const originalRoute = (await q(`select * from public.adle_review_schedule_word_routes
      where learning_item_id=$1 and row_status='active' order by id limit 1`, [oldItem.id])).rows[0];
    if (originalRoute) {
      await q(`insert into public.adle_review_schedule_word_routes
        (schedule_word_id,learning_item_id,micro_skill_key,attached_on,attachment_ordinal,row_status)
        values($1,$2,$3,$4,$5,'active')`,
        [originalRoute.schedule_word_id,cloned,oldItem.micro_skill_key,
          originalRoute.attached_on,originalRoute.attachment_ordinal]);
    }
    const destination = await q(`insert into public.adle_learning_items
      (child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,
        source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
      values($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,'active') returning id`,
      [oldItem.child_id,oldItem.canonical_word_id,identify,oldItem.source_kind,
        oldItem.source_ref,oldItem.source_attempt_text,oldItem.reteach_priority,oldItem.ejected_on,
        oldItem.intake_on]);
    assert(destination.rows[0].id);
    return { cloned };
  }, async ({ event, original, newMapping }) => {
    const current = (await q("select * from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert.equal(current.micro_skill_key, identify);
    const outcome = (await q("select * from public.adle_resolver_change_source_outcomes where change_id=$1", [event.id])).rows[0];
    assert.equal(outcome.outcome, "moved");
    assert.equal(outcome.new_learning_item_id, current.learning_item_id);
    const newRoute = (await q(`select * from public.adle_review_schedule_word_routes
      where learning_item_id=$1 and row_status='active'`, [current.learning_item_id])).rows[0];
    const oldRoute = (await q(`select * from public.adle_review_schedule_word_routes
      where learning_item_id=$1`, [outcome.old_learning_item_id])).rows[0];
    if (oldRoute) {
      assert(newRoute);
      assert.equal(String(newRoute.attached_on), String(oldRoute.attached_on));
      assert.equal(oldRoute.row_status, "superseded");
    }
    const second = (await q(`select public.supersede_spelling_canonical_mapping_admin(
      $1::uuid,$2::text,$3::text,$4::uuid,null,$5::text,'{}'::jsonb) id`,
      [newMapping,identify,original.micro_skill_key,original.created_by_admin_user_id,
        "Second staged resolver change tests latest effective learner route"])).rows[0].id;
    await q("update public.spelling_canonical_mappings set resolver_visibility_status='visible' where id=$1", [second]);
    const secondChange = (await q("select * from public.adle_resolver_change_reconciliations where old_mapping_id=$1", [newMapping])).rows[0];
    assert(secondChange.sequence_number > event.sequence_number);
    const rerouted = (await q("select * from public.adle_process_resolver_changes_v1(20)")).rows;
    assert.deepEqual(rerouted, [{ change_id: secondChange.id, outcome: "complete" }]);
    const latest = (await q("select micro_skill_key from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert.equal(latest.micro_skill_key, original.micro_skill_key);
    const effective = (await q("select public.adle_effective_pending_intake_skill_v1($1,$2) valid",
      [current.source_candidate_mapping_id,original.micro_skill_key])).rows[0];
    assert.equal(effective.valid, true);
  }, async ({ candidate, original, fixture }) => {
    const parent = (await q("select parent_user_id from public.parent_verified_spelling_candidate_mappings where id=$1",
      [candidate.source_candidate_mapping_id])).rows[0].parent_user_id;
    let blocked = false;
    await q("savepoint blocked_assignment");
    try {
      await q(`insert into public.assignment_items
        (child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,metadata)
        values($1,$2,'spelling','adle_test','adle_composer_v1',$3,$4::jsonb)`,
        [candidate.child_id,parent,`proof:${fixture.cloned}`,
          JSON.stringify({ microSkillKey: original.micro_skill_key, adleLearningItemRef: fixture.cloned })]);
    } catch (error) {
      blocked = String(error.message).includes("ADLE_RESOLVER_RECONCILIATION_REQUIRED");
    } finally {
      await q("rollback to savepoint blocked_assignment");
      await q("release savepoint blocked_assignment");
    }
    assert.equal(blocked,true,"stale assignment must fail before reconciliation completes");
  });
  await scenario("active source without intake candidate moves", async (candidate) => {
    const oldItem = (await q("select * from public.adle_learning_items where id=$1", [candidate.learning_item_id])).rows[0];
    const source = (await q(`select * from public.adle_learning_item_sources
      where learning_item_id=$1 and parent_verified_candidate_mapping_id=$2 and row_status='active'`,
      [oldItem.id,candidate.source_candidate_mapping_id])).rows[0];
    await q("update public.adle_learning_items set row_status='superseded' where id=$1", [oldItem.id]);
    const cloned = (await q(`insert into public.adle_learning_items
      (child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,
        source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
      values($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,'active') returning id`,
      [oldItem.child_id,oldItem.canonical_word_id,oldItem.micro_skill_key,oldItem.source_kind,
        oldItem.source_ref,oldItem.source_attempt_text,oldItem.reteach_priority,oldItem.ejected_on,
        oldItem.intake_on])).rows[0].id;
    await q(`insert into public.adle_learning_item_sources
      (learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,
        misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status)
      values($1,$2,$3,$4,$5,$6,$7,'active')`,
      [cloned,candidate.source_candidate_mapping_id,source.canonical_mapping_id,
        source.misspelling_normalized,source.correct_spelling_normalized,source.micro_skill_key,source.source_ref]);
    await q("delete from public.adle_canonical_intake_events where candidate_id=$1", [candidateId]);
    await q("delete from public.adle_canonical_intake_reconciliation_queue where candidate_id=$1", [candidateId]);
    await q("delete from public.adle_canonical_intake_candidate_demands where candidate_id=$1", [candidateId]);
    await q("delete from public.adle_canonical_intake_candidates where id=$1", [candidateId]);
  }, async ({ event }) => {
    const outcome = (await q("select * from public.adle_resolver_change_source_outcomes where change_id=$1", [event.id])).rows[0];
    assert.equal(outcome.outcome, "moved");
    const destination = (await q("select * from public.adle_learning_items where id=$1", [outcome.new_learning_item_id])).rows[0];
    assert.equal(destination.micro_skill_key, identify);
  });
  await q("savepoint disabled_replacement");
  try {
    const original = (await q("select * from public.spelling_canonical_mappings where id=$1", [oldMapping])).rows[0];
    await q(`update public.adle_canonical_intake_candidates set candidate_state='pending_content',
      learning_item_id=null,activated_at=null where id=$1`, [candidateId]);
    await q(`update public.spelling_canonical_mappings set mapping_status='disabled',
      resolver_visibility_status='disabled' where id=$1`, [oldMapping]);
    const replacement = (await q(`select public.create_spelling_canonical_mapping_admin(
      p_misspelling_normalized=>$1,p_correct_spelling_normalized=>$2,
      p_micro_skill_key=>$3,p_admin_user_id=>$4,p_decision_note=>$5) id`,
      [original.misspelling_normalized,original.correct_spelling_normalized,identify,
        original.created_by_admin_user_id,"Staging proof for an independently created resolver replacement"])).rows[0].id;
    await q("update public.spelling_canonical_mappings set resolver_visibility_status='visible' where id=$1", [replacement]);
    const change = (await q("select * from public.adle_resolver_change_reconciliations where old_mapping_id=$1", [oldMapping])).rows[0];
    assert.equal(change.new_mapping_id,replacement);
    const processed = (await q("select * from public.adle_process_resolver_changes_v1(20)")).rows;
    assert.deepEqual(processed,[{ change_id:change.id,outcome:"complete" }]);
    const current = (await q("select micro_skill_key,candidate_state from public.adle_canonical_intake_candidates where id=$1", [candidateId])).rows[0];
    assert.equal(current.micro_skill_key,identify);
    assert.equal(current.candidate_state,"queued");
    console.log("disabled exact-pair replacement requeues pending intake: ok");
  } finally {
    await q("rollback to savepoint disabled_replacement");
    await q("release savepoint disabled_replacement");
  }
  console.log("staging proof complete; all changes rolled back");
} finally {
  await q("rollback").catch(() => {});
  await db.end();
}
