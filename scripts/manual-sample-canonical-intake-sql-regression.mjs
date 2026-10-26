import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = process.env.PATH?.split(delimiter)
  .map((entry) => resolve(entry, "../@electric-sql/pglite"))
  .find(existsSync);
if (!packageRoot) throw new Error("Run with npx --package=@electric-sql/pglite@0.5.8");
const { PGlite } = require(packageRoot);
const db = new PGlite();
const parentId = "00000000-0000-4000-8000-000000000001";
const childId = "00000000-0000-4000-8000-000000000002";
const sampleId = "00000000-0000-4000-8000-000000000003";

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.test_user_id', true), '')::uuid $$;
    create table public.writing_samples (
      id uuid primary key, parent_user_id uuid, child_id uuid,
      task_submission_id uuid, review_completed_at timestamptz,
      sample_text text not null
    );
    create table public.micro_skill_catalog (
      micro_skill_key text primary key, mastery_domain_key text,
      is_active boolean, is_assignable boolean
    );
    create table public.misspelling_instances (
      id uuid primary key default gen_random_uuid(), writing_sample_id uuid,
      parent_user_id uuid, child_id uuid, misspelled_word text,
      corrected_word text, context_text text, position_start integer,
      position_end integer, notes text, is_parent_overridden boolean,
      created_at timestamptz default now()
    );
    create table public.parent_verifications (
      id uuid primary key default gen_random_uuid(), parent_user_id uuid,
      child_id uuid, domain_module text, source_type text,
      source_entity_id text, writing_sample_id uuid,
      suggested_micro_skill_key text, decision text,
      verified_micro_skill_key text, verification_notes text,
      metadata jsonb
    );
    create table public.parent_verified_spelling_candidate_mappings (
      id uuid primary key default gen_random_uuid(), parent_user_id uuid,
      child_id uuid, parent_verification_id uuid, task_submission_id uuid,
      writing_sample_id uuid, source_misspelling_instance_id uuid,
      source_adle_review_session_id uuid, source_provenance text,
      reviewed_event_source_entity_id text, original_child_spelling text,
      original_correct_spelling text, misspelling_normalized text,
      correct_spelling_normalized text, micro_skill_key text,
      candidate_status text, promotion_scope text, metadata jsonb,
      created_at timestamptz default now(),
      constraint parent_verified_spelling_candidate_mappings_source_provenance_c
        check (source_provenance in (
          'lesson_submission_existing_output',
          'lesson_submission_parent_added_missed_word',
          'adle_review_submitted_writing_parent_identified'))
    );
    create table public.adle_canonical_intake_candidates (
      id uuid primary key default gen_random_uuid(),
      source_candidate_mapping_id uuid, source_submission_id uuid,
      source_adle_review_session_id uuid, child_id uuid,
      micro_skill_key text,
      constraint adle_canonical_intake_candidates_one_source_check
        check (num_nonnulls(source_submission_id, source_adle_review_session_id) = 1)
    );
    create table public.adle_review_sessions (
      id uuid primary key, parent_user_id uuid, child_id uuid,
      stage text, completed_at timestamptz
    );

    create function public.adle_seed_canonical_intake_candidate_r8b_delegate(
      p_candidate_mapping_id uuid, p_normalized_target_token text,
      p_route_id text, p_route_version text, p_micro_skill_key text,
      p_source_ref text) returns uuid language plpgsql as $$
    declare v_source public.parent_verified_spelling_candidate_mappings%rowtype;
      v_id uuid;
    begin
      select * into v_source from public.parent_verified_spelling_candidate_mappings
        where id = p_candidate_mapping_id;
      if not found or num_nonnulls(v_source.task_submission_id, v_source.source_adle_review_session_id) <> 1 then
        raise exception 'invalid source';
      end if;
      insert into public.adle_canonical_intake_candidates(
        source_candidate_mapping_id, source_submission_id, source_adle_review_session_id, child_id, micro_skill_key)
      values (p_candidate_mapping_id, v_source.task_submission_id,
        v_source.source_adle_review_session_id, v_source.child_id, p_micro_skill_key)
      returning id into v_id;
      return v_id;
    end; $$;

    create function public.adle_record_canonical_intake_blocked_r8b_delegate(
      p_candidate_mapping_id uuid, p_normalized_target_token text,
      p_canonical_word_id uuid, p_target_identity_status text, p_route_id text,
      p_route_version text, p_micro_skill_key text, p_candidate_state text,
      p_blockers jsonb, p_readiness_fingerprint text,
      p_demand_type text, p_primary_blocker_code text)
      returns uuid language plpgsql as $$
    declare v_source public.parent_verified_spelling_candidate_mappings%rowtype;
      v_id uuid;
    begin
      select * into v_source from public.parent_verified_spelling_candidate_mappings
        where id = p_candidate_mapping_id;
      if not found or num_nonnulls(v_source.task_submission_id, v_source.source_adle_review_session_id) <> 1 then
        raise exception 'invalid source';
      end if;
      insert into public.adle_canonical_intake_candidates(
        source_candidate_mapping_id, source_submission_id, source_adle_review_session_id, child_id, micro_skill_key)
      values (p_candidate_mapping_id, v_source.task_submission_id,
        v_source.source_adle_review_session_id, v_source.child_id, p_micro_skill_key)
      returning id into v_id;
      return v_id;
    end; $$;

    create function public.adle_persist_canonical_intake_r8b_delegate(
      p_child_id uuid, p_canonical_word_id uuid, p_micro_skill_key text,
      p_candidate_mapping_id uuid, p_canonical_mapping_id uuid,
      p_misspelling_normalized text, p_correct_spelling_normalized text,
      p_source_ref text, p_verified_on date, p_route_id text,
      p_route_version text, p_route_activation_id uuid,
      p_release_manifest_id uuid, p_release_manifest_sha256 text,
      p_dependency_fingerprint text)
      returns uuid language plpgsql as $$
    declare v_source public.parent_verified_spelling_candidate_mappings%rowtype;
      v_id uuid;
    begin
      select * into v_source from public.parent_verified_spelling_candidate_mappings
        where id = p_candidate_mapping_id;
      if not found or num_nonnulls(v_source.task_submission_id, v_source.source_adle_review_session_id) <> 1 then
        raise exception 'invalid source';
      end if;
      insert into public.adle_canonical_intake_candidates(
        source_candidate_mapping_id, source_submission_id, source_adle_review_session_id, child_id, micro_skill_key)
      values (p_candidate_mapping_id, v_source.task_submission_id,
        v_source.source_adle_review_session_id, v_source.child_id, p_micro_skill_key)
      returning id into v_id;
      return v_id;
    end; $$;

    create function public.adle_authorize_governed_source_continuation(
      p_candidate_mapping_id uuid, p_expected_parent_user_id uuid,
      p_expected_child_id uuid) returns jsonb language plpgsql as $$
    declare v_source public.parent_verified_spelling_candidate_mappings%rowtype;
      v_verification public.parent_verifications%rowtype;
    begin
      select * into v_source from public.parent_verified_spelling_candidate_mappings
        where id = p_candidate_mapping_id;
      select * into v_verification from public.parent_verifications
        where id = v_source.parent_verification_id;
      if num_nonnulls(
        v_source.task_submission_id, v_source.source_adle_review_session_id
      ) <> 1 then raise exception 'invalid source'; end if;
      if v_source.task_submission_id is not null then
        null;
      else
        if v_source.source_provenance <> 'adle_review_submitted_writing_parent_identified'
        then raise exception 'invalid review source'; end if;
      end if;
      return jsonb_build_object(
        'source_adle_review_session_id', v_source.source_adle_review_session_id,
        'candidate_mapping_id', v_source.id
      );
    end; $$;
  `);
  try {
    await db.exec(readFileSync(
      "supabase/migrations/20261026131000_manual_sample_canonical_intake_source.sql", "utf8"));
  } catch (error) {
    throw new Error(`Manual source migration failed: ${error.message}`);
  }
  await db.exec(`
    select set_config('app.test_user_id', '${parentId}', false);
    insert into public.writing_samples(id,parent_user_id,child_id,sample_text)
      values ('${sampleId}','${parentId}','${childId}',
        'The door was urnlocked and she felt unnhappy.');
    insert into public.micro_skill_catalog values
      ('D4_MOR_PREFIXES_UN','D4',true,true);
  `);
  const args = [sampleId, "urnlocked", "unlocked", "D4_MOR_PREFIXES_UN"];
  const first = await db.query(
    "select public.capture_parent_manual_sample_spelling_candidate($1,$2,$3,$4) id", args);
  const second = await db.query(
    "select public.capture_parent_manual_sample_spelling_candidate($1,$2,$3,$4) id", args);
  assert.equal(first.rows[0].id, second.rows[0].id, "capture is idempotent");
  const source = await db.query(`
    select candidate.candidate_status, candidate.task_submission_id,
      candidate.writing_sample_id, occurrence.position_start,
      verification.source_type
    from public.parent_verified_spelling_candidate_mappings candidate
    join public.misspelling_instances occurrence
      on occurrence.id = candidate.source_misspelling_instance_id
    join public.parent_verifications verification
      on verification.id = candidate.parent_verification_id
  `);
  assert.equal(source.rows.length, 1, "one durable candidate source");
  assert.equal(source.rows[0].task_submission_id, null, "no synthetic lesson submission");
  assert.equal(source.rows[0].writing_sample_id, sampleId, "sample provenance retained");
  assert.equal(source.rows[0].position_start, 13, "exact occurrence retained");
  assert.equal(source.rows[0].source_type, "manual_writing_sample_parent_verified");
  const seeded = await db.query(
    "select public.adle_seed_canonical_intake_candidate_r8b_delegate($1,$2,$3,$4,$5,$6) id",
    [first.rows[0].id, "unlocked", "dynamic_prefix_word_lab", "v2",
      "D4_MOR_PREFIXES_UN", "parent_approval:proof"]);
  const intake = await db.query(
    "select source_writing_sample_id,source_submission_id from public.adle_canonical_intake_candidates where id=$1",
    [seeded.rows[0].id]);
  assert.equal(intake.rows[0].source_writing_sample_id, sampleId);
  assert.equal(intake.rows[0].source_submission_id, null);
  await assert.rejects(db.query(
    "select public.capture_parent_manual_sample_spelling_candidate($1,$2,$3,$4)",
    [sampleId, "outside", "inside", "D4_MOR_PREFIXES_UN"]),
  /misspelling must occur exactly once/);
  console.log("Manual sample canonical intake SQL regression passed");
} finally {
  await db.close();
}
