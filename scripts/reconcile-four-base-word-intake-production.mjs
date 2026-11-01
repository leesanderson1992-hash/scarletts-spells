#!/usr/bin/env node
/** Exact owner-approved backfill. Default execution proves the transaction then rolls back. */
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor) throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const IDENTIFY = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const CASES = [
  { word: "government", item: "af236f93-3ab9-4d66-9a13-2ffaf6372248", source: "9f306360-72fe-4211-af9c-12c5dd60027e" },
  { word: "immigrants", item: "4f60bb4e-ffac-4b20-8131-d8bde3b69838", source: "28b1c060-b848-4b54-8e4f-69890fc883b4" },
  { word: "ingredients", item: "62909f20-56db-4163-b897-df98e3e01f0f", source: "71deea87-9d0b-42ef-8c1c-90bc55a2328d" },
  { word: "scrolling", item: null, source: "a1154ed9-68c9-4ace-9ecb-b01d887155e8" },
];
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
const apply = process.argv.includes("--apply");
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const result = [];
  for (const target of CASES) {
    const source = (await db.query(`select * from public.parent_verified_spelling_candidate_mappings
      where id=$1 for update`, [target.source])).rows[0];
    assert(source && source.correct_spelling_normalized === target.word);
    const candidate = (await db.query(`select * from public.adle_canonical_intake_candidates
      where source_candidate_mapping_id=$1 for update`, [target.source])).rows[0];
    assert(candidate && candidate.micro_skill_key === source.micro_skill_key && candidate.learning_item_id === target.item);
    const mapping = (await db.query(`select m.id,m.replacement_mapping_id,n.micro_skill_key new_key,
        n.mapping_status new_status,n.resolver_visibility_status new_visibility
      from public.spelling_canonical_mappings m join public.spelling_canonical_mappings n
        on n.id=m.replacement_mapping_id
      where m.misspelling_normalized=$1 and m.correct_spelling_normalized=$2
        and m.micro_skill_key=$3 and m.mapping_status='superseded'`,
    [source.misspelling_normalized, target.word, source.micro_skill_key])).rows;
    assert.equal(mapping.length, 1, `${target.word}: replacement mapping missing`);
    assert(mapping[0].new_key === IDENTIFY && mapping[0].new_status === "active" && mapping[0].new_visibility === "visible");
    const word = (await db.query(`select id from public.canonical_teaching_dictionary_words where normalised_word=$1
      and row_status='active' and review_status='approved_for_first_exposure'`, [target.word])).rows;
    assert.equal(word.length, 1, `${target.word}: canonical identity missing`);
    const receipt = (await db.query(`insert into public.adle_pending_intake_skill_reclassifications
      (source_candidate_mapping_id,canonical_word_id,old_micro_skill_key,new_micro_skill_key,
        resolver_mapping_id,actor_user_id,reason)
      values($1,$2,$3,$4,$5,$6,$7) returning id`,
    [target.source, word[0].id, source.micro_skill_key, IDENTIFY, mapping[0].replacement_mapping_id,
      actor, "Owner-approved 2026-11-01 base-word resolver cutover; preserve parent evidence and pinned history"])).rows[0].id;
    if (target.item) {
      const old = (await db.query(`select * from public.adle_learning_items where id=$1 for update`, [target.item])).rows[0];
      assert(old && old.row_status === "active" && old.item_status === "pending" && old.canonical_word_id === word[0].id);
      const assignment = (await db.query(`select count(*)::int n from public.assignment_items a
        where a.child_id=$1 and (a.metadata::text like '%'||$2::text||'%' or
          a.prompt_data::text like '%'||$2::text||'%')`, [old.child_id, old.id])).rows[0].n;
      assert.equal(assignment, 0, `${target.word}: issued lesson exists`);
      const sourceRows = (await db.query(`select * from public.adle_learning_item_sources
        where learning_item_id=$1 and row_status='active' for update`, [old.id])).rows;
      assert.equal(sourceRows.length, 1, `${target.word}: source split requires review`);
      assert.equal(sourceRows[0].parent_verified_candidate_mapping_id, target.source);
      assert.equal(sourceRows[0].canonical_mapping_id, mapping[0].id);
      const newItem = (await db.query(`insert into public.adle_learning_items
        (child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,
          source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') returning id`,
      [old.child_id, old.canonical_word_id, IDENTIFY, old.item_status, old.source_kind, old.source_ref,
        old.source_attempt_text, old.reteach_priority, old.ejected_on, old.intake_on])).rows[0].id;
      await db.query(`insert into public.adle_learning_item_sources
        (learning_item_id,parent_verified_candidate_mapping_id,canonical_mapping_id,
          misspelling_normalized,correct_spelling_normalized,micro_skill_key,source_ref,row_status)
        values($1,$2,$3,$4,$5,$6,$7,'active')`,
      [newItem, target.source, mapping[0].replacement_mapping_id, sourceRows[0].misspelling_normalized,
        target.word, IDENTIFY, sourceRows[0].source_ref]);
      await db.query(`update public.adle_learning_item_sources set row_status='superseded' where id=$1`, [sourceRows[0].id]);
      await db.query(`update public.adle_learning_items set row_status='superseded' where id=$1`, [old.id]);
      await db.query(`update public.adle_canonical_intake_candidates set micro_skill_key=$2,learning_item_id=$3,
        updated_at=timezone('utc',now()),lock_version=lock_version+1 where id=$1`, [candidate.id, IDENTIFY, newItem]);
      result.push({ word: target.word, oldItem: old.id, newItem, receipt });
    } else {
      assert(candidate.candidate_state === "pending_content" && candidate.activated_at === null);
      await db.query(`update public.adle_canonical_intake_candidates set micro_skill_key=$2,candidate_state='queued',
        blockers='[]'::jsonb,readiness_fingerprint='not_evaluated',updated_at=timezone('utc',now()),
        lock_version=lock_version+1 where id=$1`, [candidate.id, IDENTIFY]);
      await db.query(`update public.adle_canonical_intake_candidate_demands
        set link_status='superseded',resolved_at=timezone('utc',now()),updated_at=timezone('utc',now())
        where candidate_id=$1 and link_status='waiting'`, [candidate.id]);
      await db.query(`update public.adle_canonical_intake_demands d set lifecycle_status='superseded',
        resolution_note=$2,updated_at=timezone('utc',now())
        where d.normalized_target_token=$1 and d.micro_skill_key=$3
          and d.lifecycle_status in ('pending','in_review','content_ready','reconciling')
          and exists(select 1 from public.adle_canonical_intake_candidate_demands l
            where l.demand_id=d.id and l.candidate_id=$4)
          and not exists(select 1 from public.adle_canonical_intake_candidate_demands l
            where l.demand_id=d.id and l.link_status='waiting')`,
      [target.word, `Reclassified to ${IDENTIFY} under receipt ${receipt}`, source.micro_skill_key, candidate.id]);
      await db.query(`select public.adle_enqueue_canonical_intake_candidate($1::uuid,$2::text,$3::text)`,
        [candidate.id, "resolver_mapping_reclassification", `receipt:${receipt}`]);
      result.push({ word: target.word, candidate: candidate.id, receipt });
    }
  }
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", result }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
