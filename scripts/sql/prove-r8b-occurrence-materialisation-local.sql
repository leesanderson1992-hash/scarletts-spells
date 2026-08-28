\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create extension if not exists dblink;
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.children (id uuid primary key);
create table public.task_submissions (
  id uuid primary key,
  parent_user_id uuid not null,
  child_id uuid not null,
  task_id uuid not null,
  parent_review_status text not null default 'pending',
  parent_reviewed_at timestamptz
);
create table public.writing_samples (id uuid primary key);
create table public.writing_issue_suggestions (id uuid primary key);
create table public.misspelling_instances (
  id uuid primary key,
  writing_sample_id uuid,
  child_id uuid not null,
  parent_user_id uuid not null,
  misspelled_word text not null,
  corrected_word text not null,
  suggested_word text,
  position_start integer,
  position_end integer,
  notes text
);
create table public.writing_issues (
  id uuid primary key,
  parent_user_id uuid not null,
  child_id uuid not null,
  task_submission_id uuid not null,
  source_misspelling_instance_id uuid,
  source_suggestion_id uuid,
  observed_text text,
  suggested_replacement text,
  approved_replacement text,
  micro_skill_key text,
  issue_status text not null,
  final_classification text,
  draft_final_classification text,
  metadata jsonb not null default '{}'::jsonb,
  final_classified_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.writing_issue_correction_attempts (
  id uuid primary key,
  writing_issue_id uuid not null,
  parent_user_id uuid not null,
  child_id uuid not null,
  task_submission_id uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);
create table public.micro_skill_catalog (
  micro_skill_key text primary key,
  mastery_domain_key text not null,
  practice_route text not null,
  is_active boolean not null,
  is_assignable boolean not null
);
create table public.spelling_canonical_mappings (
  id uuid primary key,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null,
  mapping_status text not null,
  resolver_visibility_status text not null,
  dialect_code text not null default 'en-GB',
  normalization_version text not null default 'spelling_normalize_v1'
);
create table public.spelling_canonical_mapping_events (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null,
  event_type text not null,
  new_resolver_visibility_status text
);
create table public.parent_verifications (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null,
  parent_user_id uuid not null,
  domain_module text not null,
  source_type text not null,
  source_entity_id text not null,
  task_submission_id uuid,
  writing_sample_id uuid,
  suggested_micro_skill_key text,
  suggestion_payload jsonb not null default '{}'::jsonb,
  decision text not null,
  verified_micro_skill_key text,
  verification_notes text,
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.parent_verified_spelling_candidate_mappings (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null,
  child_id uuid not null,
  parent_verification_id uuid not null unique,
  task_submission_id uuid,
  writing_sample_id uuid,
  source_suggestion_id uuid,
  source_misspelling_instance_id uuid,
  source_adle_review_session_id uuid,
  source_provenance text not null,
  reviewed_event_source_entity_id text not null,
  original_child_spelling text,
  original_correct_spelling text,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null,
  candidate_status text not null,
  promotion_scope text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.spelling_catalog_review_cases (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null,
  child_id uuid not null,
  source_misspelling_instance_id uuid,
  case_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.spelling_canonical_mapping_recommendations (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null,
  child_id uuid not null,
  source_misspelling_instance_id uuid,
  candidate_mapping_id uuid,
  recommendation_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null,
  parent_user_id uuid not null,
  micro_skill_key text not null,
  practice_route text not null,
  unique (child_id, parent_user_id, micro_skill_key, practice_route)
);

create or replace function public.finalise_writing_issue_classification_and_learning_item(
  p_writing_issue_id uuid,
  p_parent_user_id uuid,
  p_child_id uuid,
  p_final_classification text
) returns jsonb
language plpgsql
as $$
declare
  v_issue public.writing_issues%rowtype;
  v_learning_item_id uuid;
begin
  select * into v_issue
  from public.writing_issues
  where id = p_writing_issue_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
  for update;
  if not found or v_issue.issue_status <> 'child_responded' then
    raise exception 'fixture issue is not finalisable';
  end if;

  update public.writing_issues
  set issue_status = 'finalised',
      final_classification = p_final_classification,
      final_classified_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_issue.id;

  if p_final_classification in ('fragile_knowledge', 'concept_gap', 'transfer_failure') then
    insert into public.learning_items (
      child_id, parent_user_id, micro_skill_key, practice_route
    )
    select p_child_id, p_parent_user_id, v_issue.micro_skill_key, catalog.practice_route
    from public.micro_skill_catalog catalog
    where catalog.micro_skill_key = v_issue.micro_skill_key
    on conflict (child_id, parent_user_id, micro_skill_key, practice_route)
      do update set micro_skill_key = excluded.micro_skill_key
    returning id into v_learning_item_id;
  end if;

  return jsonb_build_object('learning_item_id', v_learning_item_id);
end;
$$;

-- Downstream tables preserve the source columns guarded by the real R8B
-- migration so bypass attempts exercise the authoritative database boundary.
create table public.adle_canonical_intake_candidates (
  id uuid primary key default gen_random_uuid(),
  source_candidate_mapping_id uuid not null
);
create table public.adle_learning_items (id uuid primary key default gen_random_uuid());
create table public.adle_learning_item_sources (
  id uuid primary key default gen_random_uuid(),
  parent_verified_candidate_mapping_id uuid
);
create table public.adle_review_schedule_words (id uuid primary key default gen_random_uuid());
create table public.adle_review_schedule_word_routes (id uuid primary key default gen_random_uuid());
create table public.daily_assignments (id uuid primary key default gen_random_uuid());
create table public.adle_review_sessions (id uuid primary key default gen_random_uuid());
create table public.adle_review_word_encounters (id uuid primary key default gen_random_uuid());
create table public.adle_review_r6_child_rollouts (id uuid primary key default gen_random_uuid());

-- Schema-compatible service RPC fixtures make the R8B migration wrap the same
-- released signatures. Their bodies perform representative downstream writes;
-- the proof below calls the guarded public wrappers, not these delegates.
create function public.adle_seed_canonical_intake_candidate(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_source_ref text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.adle_canonical_intake_candidates(source_candidate_mapping_id)
  values (p_candidate_mapping_id)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.adle_record_canonical_intake_blocked(
  p_candidate_mapping_id uuid,
  p_normalized_target_token text,
  p_canonical_word_id uuid,
  p_target_identity_status text,
  p_route_id text,
  p_route_version text,
  p_micro_skill_key text,
  p_candidate_state text,
  p_blockers jsonb,
  p_readiness_fingerprint text,
  p_demand_type text,
  p_primary_blocker_code text
) returns table(candidate_id uuid, demand_id uuid, demand_created boolean)
language plpgsql
security definer
as $$
begin
  return query
  insert into public.adle_canonical_intake_candidates(source_candidate_mapping_id)
  values (p_candidate_mapping_id)
  returning id, gen_random_uuid(), true;
end;
$$;

create function public.adle_persist_canonical_intake(
  p_child_id uuid,
  p_canonical_word_id uuid,
  p_micro_skill_key text,
  p_candidate_mapping_id uuid,
  p_canonical_mapping_id uuid,
  p_misspelling_normalized text,
  p_correct_spelling_normalized text,
  p_source_ref text,
  p_verified_on date,
  p_route_id text,
  p_route_version text,
  p_route_activation_id uuid default null,
  p_release_manifest_id uuid default null,
  p_release_manifest_sha256 text default null,
  p_dependency_fingerprint text default null
) returns table(learning_item_id uuid, inserted boolean)
language plpgsql
security definer
as $$
declare
  v_learning_item_id uuid;
begin
  insert into public.adle_learning_items default values
  returning id into v_learning_item_id;
  insert into public.adle_learning_item_sources(parent_verified_candidate_mapping_id)
  values (p_candidate_mapping_id);
  insert into public.adle_canonical_intake_candidates(source_candidate_mapping_id)
  values (p_candidate_mapping_id);
  return query select v_learning_item_id, true;
end;
$$;

\ir ../../supabase/migrations/20260828120000_make_parent_approval_occurrence_complete.sql

begin;

insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into public.children values ('00000000-0000-0000-0000-000000000002');
insert into public.task_submissions(id,parent_user_id,child_id,task_id,parent_review_status) values
  ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','approved'),
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','pending'),
  ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','pending');
insert into public.writing_samples values ('00000000-0000-0000-0000-000000000020');
insert into public.micro_skill_catalog values
  ('D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','D4','word_practice',true,true),
  ('D4_MOR_PREFIXES_RE_PRE','D4','word_practice',true,true),
  ('D4_TEST_MISSING_OCCURRENCE','D4','word_practice',true,true),
  ('D4_TEST_MICRO_A','D4','word_practice',true,true),
  ('D4_TEST_MICRO_B','D4','word_practice',true,true),
  ('D4_TEST_CANONICAL','D4','word_practice',true,true),
  ('D4_TEST_HISTORY','D4','word_practice',true,true),
  ('D3_TEST_NON_SPELLING','D3','sentence_practice',true,true);

insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end
) values
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','futball','football',0,7),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','ranebow','rainbow',10,17),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','riplay','replay',20,26),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','rinew','renew',30,35);

insert into public.spelling_canonical_mappings(
  id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status
) values
  ('00000000-0000-0000-0000-000000000301','futball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','active','visible'),
  ('00000000-0000-0000-0000-000000000303','riplay','replay','D4_MOR_PREFIXES_RE_PRE','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000301','resolver_visibility_enabled','visible'),
  ('00000000-0000-0000-0000-000000000303','resolver_visibility_enabled','visible');

insert into public.writing_issues(
  id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,
  observed_text,suggested_replacement,micro_skill_key,issue_status,
  draft_final_classification,metadata
) values
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000101','futball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','child_responded','concept_gap',jsonb_build_object('source_kind','parent_authored_missed_word','known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000301','micro_skill_key','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'))),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000102','ranebow','rainbow','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','child_responded','concept_gap',jsonb_build_object('source_kind','parent_authored_missed_word')),
  ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000103','riplay','replay','D4_MOR_PREFIXES_RE_PRE','child_responded','concept_gap',jsonb_build_object('source_kind','parent_authored_missed_word','known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000303','micro_skill_key','D4_MOR_PREFIXES_RE_PRE'))),
  ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000104','rinew','renew','D4_MOR_PREFIXES_RE_PRE','child_responded','concept_gap',jsonb_build_object('source_kind','parent_authored_missed_word'));
insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,parent_user_id,child_id,task_submission_id,created_at
) values
  ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','2026-08-28T10:00:01Z'),
  ('00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','2026-08-28T10:00:02Z'),
  ('00000000-0000-0000-0000-000000000703','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','2026-08-28T10:00:03Z'),
  ('00000000-0000-0000-0000-000000000704','00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','2026-08-28T10:00:04Z');

insert into public.parent_verifications(
  id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision
) values
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','candidate-rainbow','overridden'),
  ('00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','candidate-renew','overridden');
insert into public.parent_verified_spelling_candidate_mappings(
  id,parent_user_id,child_id,parent_verification_id,task_submission_id,writing_sample_id,
  source_misspelling_instance_id,source_provenance,reviewed_event_source_entity_id,
  original_child_spelling,original_correct_spelling,misspelling_normalized,
  correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope,metadata
) values
  ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000102','lesson_submission_parent_added_missed_word','candidate-rainbow','ranebow','rainbow','ranebow','rainbow','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','pending_parent_promotion','parent_local',jsonb_build_object('provenance_marker','rainbow-existing')),
  ('00000000-0000-0000-0000-000000000504','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000104','lesson_submission_parent_added_missed_word','candidate-renew','rinew','renew','rinew','renew','D4_MOR_PREFIXES_RE_PRE','parent_local_promoted','parent_local',jsonb_build_object('provenance_marker','renew-existing'));
insert into public.spelling_canonical_mapping_recommendations(
  parent_user_id,child_id,source_misspelling_instance_id,candidate_mapping_id,recommendation_status
) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000502','recommended'),
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000504','recommended');

do $$
declare
  v_result jsonb;
  v_first_ids uuid[];
  v_replay_ids uuid[];
begin
  v_result := public.approve_task_submission_with_reason_drafts(
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );
  if jsonb_array_length(v_result -> 'governed_occurrence_sources') <> 4 then
    raise exception 'approval did not return four governed sources: %', v_result;
  end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where candidate_status in ('pending_parent_promotion','parent_local_promoted','admin_review_requested','global_canonical_promoted')) <> 4 then
    raise exception 'four live occurrence sources were not materialized';
  end if;
  if (select count(distinct source_misspelling_instance_id) from public.parent_verified_spelling_candidate_mappings where candidate_status in ('pending_parent_promotion','parent_local_promoted','admin_review_requested','global_canonical_promoted')) <> 4 then
    raise exception 'occurrence source identity collapsed';
  end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where correct_spelling_normalized in ('football','rainbow','replay','renew') and candidate_status = 'parent_local_promoted') <> 4 then
    raise exception 'expected football, rainbow, replay, renew promoted sources';
  end if;
  if (select count(*) from public.learning_items) <> 2 then
    raise exception 'legacy teaching containers should remain grouped as two';
  end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff') <> 2 then
    raise exception 'only newly materialized known sources should await R8C';
  end if;
  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where id = '00000000-0000-0000-0000-000000000502'
      and candidate_status = 'parent_local_promoted'
      and source_provenance = 'lesson_submission_parent_added_missed_word'
      and metadata ->> 'provenance_marker' = 'rainbow-existing'
  ) or not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where id = '00000000-0000-0000-0000-000000000504'
      and candidate_status = 'parent_local_promoted'
      and source_provenance = 'lesson_submission_parent_added_missed_word'
      and metadata ->> 'provenance_marker' = 'renew-existing'
  ) then
    raise exception 'existing candidate capture was replaced or lost provenance';
  end if;
  if (select count(*) from public.spelling_canonical_mapping_recommendations) <> 2
    or (select count(*) from public.spelling_canonical_mappings) <> 2
  then
    raise exception 'known-match materialisation created forbidden canonical/admin rows';
  end if;

  select array_agg(id order by id) into v_first_ids
  from public.parent_verified_spelling_candidate_mappings
  where candidate_status in ('pending_parent_promotion','parent_local_promoted','admin_review_requested','global_canonical_promoted');
  v_result := public.approve_task_submission_with_reason_drafts(
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );
  select array_agg(id order by id) into v_replay_ids
  from public.parent_verified_spelling_candidate_mappings
  where candidate_status in ('pending_parent_promotion','parent_local_promoted','admin_review_requested','global_canonical_promoted');
  if v_replay_ids <> v_first_ids or jsonb_array_length(v_result -> 'governed_occurrence_sources') <> 4 then
    raise exception 'approval replay changed source identity';
  end if;
end $$;

-- A D4 learning issue cannot finalise without occurrence identity. The AFTER
-- trigger exception rolls the issue update and the enclosing legacy write back.
insert into public.writing_issues(
  id,parent_user_id,child_id,task_submission_id,observed_text,
  suggested_replacement,micro_skill_key,issue_status,metadata
) values (
  '00000000-0000-0000-0000-000000000208',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000012',
  'mispelt','misspelt','D4_TEST_MISSING_OCCURRENCE','child_responded',
  jsonb_build_object('source_kind','parent_authored_missed_word')
);
do $$
begin
  begin
    perform public.finalise_writing_issue_classification_and_learning_item(
      '00000000-0000-0000-0000-000000000208',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'concept_gap'
    );
    raise exception 'D4 missing-occurrence finalisation did not fail closed';
  exception when others then
    if sqlerrm = 'D4 missing-occurrence finalisation did not fail closed' then
      raise;
    end if;
    if sqlerrm <> 'A learning spelling issue requires a source misspelling occurrence.' then
      raise;
    end if;
  end;

  if (select issue_status from public.writing_issues where id = '00000000-0000-0000-0000-000000000208') <> 'child_responded'
    or (select final_classification from public.writing_issues where id = '00000000-0000-0000-0000-000000000208') is not null
    or exists (select 1 from public.learning_items where micro_skill_key = 'D4_TEST_MISSING_OCCURRENCE')
    or exists (
      select 1 from public.parent_verified_spelling_candidate_mappings
      where micro_skill_key = 'D4_TEST_MISSING_OCCURRENCE'
    )
  then
    raise exception 'D4 missing-occurrence failure left partial finalisation state';
  end if;
end $$;

-- Direct insertion in a finalised D4 learning state is also a finalisation
-- boundary. It cannot bypass the occurrence requirement through broad table
-- INSERT permissions.
do $$
begin
  begin
    insert into public.writing_issues(
      id,parent_user_id,child_id,task_submission_id,observed_text,
      suggested_replacement,micro_skill_key,issue_status,
      final_classification,final_classified_at,metadata
    ) values (
      '00000000-0000-0000-0000-000000000216',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000012',
      'directt','direct','D4_TEST_MISSING_OCCURRENCE','finalised',
      'concept_gap',timezone('utc', now()),'{}'::jsonb
    );
    raise exception 'inserted D4 finalisation bypassed occurrence identity';
  exception when others then
    if sqlerrm = 'inserted D4 finalisation bypassed occurrence identity' then
      raise;
    end if;
    if sqlerrm <> 'A learning spelling issue requires a source misspelling occurrence.' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.writing_issues
    where id = '00000000-0000-0000-0000-000000000216'
  ) then
    raise exception 'failed inserted D4 finalisation left a writing issue row';
  end if;
end $$;

-- A governed non-D4 learning issue remains finalisable without a spelling
-- occurrence and retains the existing legacy teaching-container semantics.
insert into public.writing_issues(
  id,parent_user_id,child_id,task_submission_id,observed_text,
  suggested_replacement,micro_skill_key,issue_status,metadata
) values (
  '00000000-0000-0000-0000-000000000209',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000012',
  'run on sentence','sentence boundary','D3_TEST_NON_SPELLING','child_responded',
  jsonb_build_object('source_type','authentic_writing')
);
select public.finalise_writing_issue_classification_and_learning_item(
  '00000000-0000-0000-0000-000000000209',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'concept_gap'
);
do $$
begin
  if (select issue_status from public.writing_issues where id = '00000000-0000-0000-0000-000000000209') <> 'finalised'
    or not exists (select 1 from public.learning_items where micro_skill_key = 'D3_TEST_NON_SPELLING')
    or exists (
      select 1 from public.parent_verified_spelling_candidate_mappings
      where micro_skill_key = 'D3_TEST_NON_SPELLING'
    )
  then
    raise exception 'valid non-spelling finalisation was not preserved';
  end if;
end $$;

-- The atomic approval RPC uses the same governed spelling predicate as the
-- finalisation trigger. A D3 learning issue without spelling occurrence
-- identity must therefore remain an approvable non-spelling learning issue.
insert into public.writing_issues(
  id,parent_user_id,child_id,task_submission_id,observed_text,
  suggested_replacement,micro_skill_key,issue_status,
  draft_final_classification,metadata
) values (
  '00000000-0000-0000-0000-000000000215',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000014',
  'another run on sentence','sentence boundary','D3_TEST_NON_SPELLING','child_responded',
  'concept_gap',jsonb_build_object('source_type','authentic_writing')
);
insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,parent_user_id,child_id,task_submission_id,created_at
) values (
  '00000000-0000-0000-0000-000000000715',
  '00000000-0000-0000-0000-000000000215',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000014',
  '2026-08-28T10:00:10Z'
);
do $$
declare
  v_result jsonb;
begin
  v_result := public.approve_task_submission_with_reason_drafts(
    '00000000-0000-0000-0000-000000000014',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );
  if (select issue_status from public.writing_issues where id = '00000000-0000-0000-0000-000000000215') <> 'finalised'
    or (select parent_review_status from public.task_submissions where id = '00000000-0000-0000-0000-000000000014') <> 'approved'
    or jsonb_array_length(v_result -> 'governed_occurrence_sources') <> 0
    or exists (
      select 1 from public.parent_verified_spelling_candidate_mappings
      where micro_skill_key = 'D3_TEST_NON_SPELLING'
    )
  then
    raise exception 'atomic approval did not preserve valid non-spelling learning finalisation: %', v_result;
  end if;
end $$;

-- The baseline grants authenticated parents broad owner-row UPDATE/DELETE.
-- Exercise that role directly and require the protected trigger's error, not a
-- coincidental permission failure.
grant select, update, delete
on public.parent_verified_spelling_candidate_mappings
to authenticated;
do $$
begin
  execute 'set local role authenticated';
  begin
    update public.parent_verified_spelling_candidate_mappings
    set canonical_intake_handoff_state = null
    where correct_spelling_normalized = 'football'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
    raise exception 'quarantine state mutation did not fail closed';
  exception when others then
    if sqlerrm = 'quarantine state mutation did not fail closed' then raise; end if;
    if sqlerrm <> 'Canonical intake handoff state is server-controlled and immutable before R8C.' then
      raise;
    end if;
  end;

  begin
    update public.parent_verified_spelling_candidate_mappings
    set source_provenance = 'lesson_submission_existing_output'
    where correct_spelling_normalized = 'football'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
    raise exception 'quarantined provenance mutation did not fail closed';
  exception when others then
    if sqlerrm = 'quarantined provenance mutation did not fail closed' then raise; end if;
    if sqlerrm <> 'An R8B occurrence source identity and live status are server-controlled before R8C.' then
      raise;
    end if;
  end;

  begin
    update public.parent_verified_spelling_candidate_mappings
    set candidate_status = 'superseded'
    where correct_spelling_normalized = 'football'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
    raise exception 'quarantined live-status mutation did not fail closed';
  exception when others then
    if sqlerrm = 'quarantined live-status mutation did not fail closed' then raise; end if;
    if sqlerrm <> 'An R8B occurrence source identity and live status are server-controlled before R8C.' then
      raise;
    end if;
  end;

  begin
    delete from public.parent_verified_spelling_candidate_mappings
    where correct_spelling_normalized = 'football'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';
    raise exception 'quarantined source deletion did not fail closed';
  exception when others then
    if sqlerrm = 'quarantined source deletion did not fail closed' then raise; end if;
    if sqlerrm <> 'An R8B occurrence source awaiting R8C cannot be deleted.' then
      raise;
    end if;
  end;
  execute 'reset role';

  if not exists (
    select 1 from public.parent_verified_spelling_candidate_mappings
    where correct_spelling_normalized = 'football'
      and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff'
  ) then
    raise exception 'quarantine state changed after a rejected mutation';
  end if;
end $$;

-- Direct service-boundary bypass attempts cannot seed canonical intake or
-- learning-item lineage for a quarantined source.
do $$
declare
  v_quarantined_id uuid;
  v_legacy_id uuid;
begin
  select id into v_quarantined_id
  from public.parent_verified_spelling_candidate_mappings
  where correct_spelling_normalized = 'football'
    and canonical_intake_handoff_state = 'awaiting_r8c_exact_id_handoff';

  execute 'set local role service_role';
  begin
    perform public.adle_seed_canonical_intake_candidate(
      v_quarantined_id,'football','adle_word_level','v1',
      'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8b-proof'
    );
    raise exception 'seed RPC consumed a quarantined source';
  exception when others then
    if sqlerrm = 'seed RPC consumed a quarantined source' then raise; end if;
    if sqlerrm <> 'The governed occurrence source is quarantined pending R8C exact-ID handoff.' then raise; end if;
  end;

  begin
    perform * from public.adle_record_canonical_intake_blocked(
      v_quarantined_id,'football',null,'established','adle_word_level','v1',
      'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','pending_content',
      '[{"code":"canonical_word_missing"}]'::jsonb,'proof-fingerprint',
      'teaching_content','canonical_word_missing'
    );
    raise exception 'blocked RPC consumed a quarantined source';
  exception when others then
    if sqlerrm = 'blocked RPC consumed a quarantined source' then raise; end if;
    if sqlerrm <> 'The governed occurrence source is quarantined pending R8C exact-ID handoff.' then raise; end if;
  end;

  begin
    perform * from public.adle_persist_canonical_intake(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000801',
      'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
      v_quarantined_id,
      '00000000-0000-0000-0000-000000000301',
      'futball','football','r8b-proof',date '2026-08-28',
      'adle_word_level','v1'
    );
    raise exception 'persist RPC consumed a quarantined source';
  exception when others then
    if sqlerrm = 'persist RPC consumed a quarantined source' then raise; end if;
    if sqlerrm <> 'The governed occurrence source is quarantined pending R8C exact-ID handoff.' then raise; end if;
  end;

  begin
    perform public.adle_seed_canonical_intake_candidate_r8b_delegate(
      v_quarantined_id,'football','adle_word_level','v1',
      'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','r8b-proof'
    );
    raise exception 'service_role retained direct delegate execution';
  exception when insufficient_privilege then
    null;
  end;
  execute 'reset role';

  if exists (select 1 from public.adle_canonical_intake_candidates)
    or exists (select 1 from public.adle_learning_items)
    or exists (select 1 from public.adle_learning_item_sources)
  then
    raise exception 'a rejected service RPC left partial canonical-intake state';
  end if;

  begin
    insert into public.adle_canonical_intake_candidates(source_candidate_mapping_id)
    values (v_quarantined_id);
    raise exception 'quarantined candidate entered canonical intake directly';
  exception when others then
    if sqlerrm = 'quarantined candidate entered canonical intake directly' then raise; end if;
    if sqlerrm <> 'The governed occurrence source is quarantined pending R8C exact-ID handoff.' then raise; end if;
  end;

  begin
    insert into public.adle_learning_item_sources(parent_verified_candidate_mapping_id)
    values (v_quarantined_id);
    raise exception 'quarantined candidate entered learning-item lineage directly';
  exception when others then
    if sqlerrm = 'quarantined candidate entered learning-item lineage directly' then raise; end if;
    if sqlerrm <> 'The governed occurrence source is quarantined pending R8C exact-ID handoff.' then raise; end if;
  end;

  -- A pre-R8B candidate has NULL handoff state and remains eligible under the
  -- current released intake contract.
  select id into v_legacy_id
  from public.parent_verified_spelling_candidate_mappings
  where correct_spelling_normalized = 'rainbow';
  perform * from public.adle_persist_canonical_intake(
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000802',
    'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS',
    v_legacy_id,
    null,
    'ranebow','rainbow','legacy-proof',date '2026-08-28',
    'adle_word_level','v1'
  );

  if (select count(*) from public.adle_canonical_intake_candidates) <> 1
    or (select count(*) from public.adle_learning_items) <> 1
    or (select count(*) from public.adle_learning_item_sources) <> 1
  then
    raise exception 'legacy canonical-intake compatibility was not preserved';
  end if;

  delete from public.adle_learning_item_sources;
  delete from public.adle_canonical_intake_candidates;
  delete from public.adle_learning_items;
end $$;

-- The unique index is the concurrency backstop even if two writers race.
do $$
begin
  begin
    insert into public.parent_verifications(
      id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision
    ) values (
      '00000000-0000-0000-0000-000000000499','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','race-duplicate','accepted'
    );
    insert into public.parent_verified_spelling_candidate_mappings(
      parent_user_id,child_id,parent_verification_id,task_submission_id,source_misspelling_instance_id,
      source_provenance,reviewed_event_source_entity_id,misspelling_normalized,
      correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope
    ) values (
      '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000499','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000101','lesson_submission_existing_output','race-duplicate','futball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','parent_local_promoted','parent_local'
    );
    raise exception 'live occurrence uniqueness did not reject a racing duplicate';
  exception when unique_violation then
    null;
  end;
end $$;

-- A later occurrence of the same canonical word remains distinct evidence.
insert into public.task_submissions(id,parent_user_id,child_id,task_id,parent_review_status) values
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','approved'),
  ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','pending');
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','fotball','football',40,47);
insert into public.spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000305','fotball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000305','resolver_visibility_enabled','visible');
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status,metadata) values
  ('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000105','fotball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','child_responded',jsonb_build_object('known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000305','micro_skill_key','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS')));
insert into public.writing_issue_correction_attempts(id,writing_issue_id,parent_user_id,child_id,task_submission_id) values
  ('00000000-0000-0000-0000-000000000705','00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000013');
select public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000205','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','concept_gap');

do $$
begin
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where correct_spelling_normalized='football' and candidate_status='parent_local_promoted') <> 2 then
    raise exception 'later football occurrence collapsed into the first';
  end if;
end $$;

-- A conflicting live target fails the finalisation transaction closed.
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','futtball','football',50,58);
insert into public.spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000306','futtball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000306','resolver_visibility_enabled','visible');
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status,metadata) values
  ('00000000-0000-0000-0000-000000000206','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000106','futtball','football','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','child_responded',jsonb_build_object('known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000306','micro_skill_key','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS')));
insert into public.writing_issue_correction_attempts(id,writing_issue_id,parent_user_id,child_id,task_submission_id) values
  ('00000000-0000-0000-0000-000000000706','00000000-0000-0000-0000-000000000206','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000013');
insert into public.parent_verifications(id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision) values
  ('00000000-0000-0000-0000-000000000406','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','conflict-source','overridden');
insert into public.parent_verified_spelling_candidate_mappings(parent_user_id,child_id,parent_verification_id,task_submission_id,source_misspelling_instance_id,source_provenance,reviewed_event_source_entity_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000406','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000106','lesson_submission_existing_output','conflict-source','futtball','footsball','D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS','parent_local_promoted','parent_local');
do $$
begin
  begin
    perform public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000206','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','concept_gap');
    raise exception 'conflicting occurrence identity did not fail closed';
  exception when others then
    if sqlerrm = 'conflicting occurrence identity did not fail closed' then raise; end if;
    if sqlerrm <> 'The live spelling occurrence source disagrees with the final parent-approved identity.' then raise; end if;
  end;
  if (select issue_status from public.writing_issues where id='00000000-0000-0000-0000-000000000206') <> 'child_responded' then
    raise exception 'conflicting finalisation was not rolled back';
  end if;
end $$;

-- A live occurrence source with a different micro-skill fails closed and leaves
-- both finalisation and legacy persistence untouched.
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','mikroskil','microskill',70,79);
insert into public.spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000307','mikroskil','microskill','D4_TEST_MICRO_A','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000307','resolver_visibility_enabled','visible');
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status,metadata) values
  ('00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000108','mikroskil','microskill','D4_TEST_MICRO_A','child_responded',jsonb_build_object('known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000307','micro_skill_key','D4_TEST_MICRO_A')));
insert into public.writing_issue_correction_attempts(id,writing_issue_id,parent_user_id,child_id,task_submission_id) values
  ('00000000-0000-0000-0000-000000000708','00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000013');
insert into public.parent_verifications(id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision) values
  ('00000000-0000-0000-0000-000000000408','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','micro-conflict-source','overridden');
insert into public.parent_verified_spelling_candidate_mappings(parent_user_id,child_id,parent_verification_id,task_submission_id,source_misspelling_instance_id,source_provenance,reviewed_event_source_entity_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000408','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000108','lesson_submission_existing_output','micro-conflict-source','mikroskil','microskill','D4_TEST_MICRO_B','parent_local_promoted','parent_local');
do $$
begin
  begin
    perform public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000212','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','concept_gap');
    raise exception 'micro-skill disagreement did not fail closed';
  exception when others then
    if sqlerrm = 'micro-skill disagreement did not fail closed' then raise; end if;
    if sqlerrm <> 'The live spelling occurrence source disagrees with the final parent-approved identity.' then raise; end if;
  end;
  if (select issue_status from public.writing_issues where id='00000000-0000-0000-0000-000000000212') <> 'child_responded'
    or exists (select 1 from public.learning_items where micro_skill_key='D4_TEST_MICRO_A')
  then
    raise exception 'micro-skill disagreement left partial finalisation state';
  end if;
end $$;

-- A stale/mismatched canonical mapping identity fails before source creation.
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000109','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','canoncal','canonical',80,88);
insert into public.spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000308','canoncal','canonically','D4_TEST_CANONICAL','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000308','resolver_visibility_enabled','visible');
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status,metadata) values
  ('00000000-0000-0000-0000-000000000210','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000109','canoncal','canonical','D4_TEST_CANONICAL','child_responded',jsonb_build_object('known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000308','micro_skill_key','D4_TEST_CANONICAL')));
insert into public.writing_issue_correction_attempts(id,writing_issue_id,parent_user_id,child_id,task_submission_id) values
  ('00000000-0000-0000-0000-000000000709','00000000-0000-0000-0000-000000000210','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000013');
do $$
begin
  begin
    perform public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000210','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','concept_gap');
    raise exception 'canonical mapping disagreement did not fail closed';
  exception when others then
    if sqlerrm = 'canonical mapping disagreement did not fail closed' then raise; end if;
    if sqlerrm <> 'The known canonical mapping no longer agrees with the spelling occurrence.' then raise; end if;
  end;
  if (select issue_status from public.writing_issues where id='00000000-0000-0000-0000-000000000210') <> 'child_responded'
    or exists (select 1 from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000109')
    or exists (select 1 from public.learning_items where micro_skill_key='D4_TEST_CANONICAL')
  then
    raise exception 'canonical mapping disagreement left partial state';
  end if;
end $$;

-- Superseded audit history may coexist with one later live replacement.
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000110','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','historee','history',90,98);
insert into public.spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000309','historee','history','D4_TEST_HISTORY','active','visible');
insert into public.spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values
  ('00000000-0000-0000-0000-000000000309','resolver_visibility_enabled','visible');
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status,metadata) values
  ('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000110','historee','history','D4_TEST_HISTORY','child_responded',jsonb_build_object('known_match_auto_resolution',jsonb_build_object('authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000309','micro_skill_key','D4_TEST_HISTORY')));
insert into public.writing_issue_correction_attempts(id,writing_issue_id,parent_user_id,child_id,task_submission_id) values
  ('00000000-0000-0000-0000-000000000710','00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000013');
insert into public.parent_verifications(id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision) values
  ('00000000-0000-0000-0000-000000000409','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','history-source','accepted');
insert into public.parent_verified_spelling_candidate_mappings(parent_user_id,child_id,parent_verification_id,task_submission_id,source_misspelling_instance_id,source_provenance,reviewed_event_source_entity_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000409','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000110','lesson_submission_existing_output','history-source','historee','history','D4_TEST_HISTORY','superseded','parent_local');
select public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','concept_gap');
do $$
begin
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000110') <> 2
    or (select count(*) from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000110' and candidate_status='superseded') <> 1
    or (select count(*) from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000110' and candidate_status='parent_local_promoted') <> 1
  then
    raise exception 'superseded history and later live replacement did not coexist';
  end if;
end $$;

-- A non-learning final decision supersedes, rather than deletes, prior evidence.
insert into public.misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end) values
  ('00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','wordd','word',60,65);
insert into public.writing_issues(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,observed_text,suggested_replacement,micro_skill_key,issue_status) values
  ('00000000-0000-0000-0000-000000000207','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000107','wordd','word','D4_MOR_PREFIXES_RE_PRE','child_responded');
insert into public.parent_verifications(id,child_id,parent_user_id,domain_module,source_type,source_entity_id,decision) values
  ('00000000-0000-0000-0000-000000000407','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','spelling','authentic_writing','non-learning-source','overridden');
insert into public.parent_verified_spelling_candidate_mappings(parent_user_id,child_id,parent_verification_id,task_submission_id,source_misspelling_instance_id,source_provenance,reviewed_event_source_entity_id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,candidate_status,promotion_scope) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000407','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000107','lesson_submission_existing_output','non-learning-source','wordd','word','D4_MOR_PREFIXES_RE_PRE','pending_parent_promotion','parent_local');
select public.finalise_writing_issue_classification_and_learning_item('00000000-0000-0000-0000-000000000207','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','not_an_issue');

do $$
begin
  if (select candidate_status from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000107') <> 'superseded' then
    raise exception 'non-learning source was not superseded';
  end if;
  if (select count(*) from public.parent_verified_spelling_candidate_mappings where source_misspelling_instance_id='00000000-0000-0000-0000-000000000107') <> 1 then
    raise exception 'non-learning source history was deleted';
  end if;
  if (select count(*) from public.adle_canonical_intake_candidates) <> 0
    or (select count(*) from public.adle_learning_items) <> 0
    or (select count(*) from public.adle_learning_item_sources) <> 0
    or (select count(*) from public.adle_review_schedule_words) <> 0
    or (select count(*) from public.adle_review_schedule_word_routes) <> 0
    or (select count(*) from public.daily_assignments) <> 0
    or (select count(*) from public.adle_review_sessions) <> 0
    or (select count(*) from public.adle_review_word_encounters) <> 0
    or (select count(*) from public.adle_review_r6_child_rollouts) <> 0
  then
    raise exception 'R8B crossed the learner-facing rollout boundary';
  end if;
end $$;

select 'prove-r8b-occurrence-materialisation-local: ok' as result;
rollback;

-- True concurrent finalisation proof. These fixtures are committed only inside
-- the disposable database so two independent dblink sessions can observe them;
-- the container is destroyed after this script exits.
insert into auth.users values ('00000000-0000-0000-0000-000000000901');
insert into public.children values ('00000000-0000-0000-0000-000000000902');
insert into public.task_submissions(id,parent_user_id,child_id,task_id,parent_review_status) values
  ('00000000-0000-0000-0000-000000000910','00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000903','approved'),
  ('00000000-0000-0000-0000-000000000911','00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000903','pending'),
  ('00000000-0000-0000-0000-000000000912','00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000903','pending');
insert into public.writing_samples values ('00000000-0000-0000-0000-000000000920');
insert into public.micro_skill_catalog values
  ('D4_CONCURRENT_OCCURRENCE','D4','word_practice',true,true);
insert into public.misspelling_instances(
  id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word,position_start,position_end
) values (
  '00000000-0000-0000-0000-000000000921','00000000-0000-0000-0000-000000000920',
  '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000901',
  'concurent','concurrent',0,9
);
insert into public.spelling_canonical_mappings(
  id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status
) values (
  '00000000-0000-0000-0000-000000000922','concurent','concurrent',
  'D4_CONCURRENT_OCCURRENCE','active','visible'
);
insert into public.spelling_canonical_mapping_events(
  mapping_id,event_type,new_resolver_visibility_status
) values (
  '00000000-0000-0000-0000-000000000922','resolver_visibility_enabled','visible'
);
insert into public.writing_issues(
  id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id,
  observed_text,suggested_replacement,micro_skill_key,issue_status,metadata
) values
  (
    '00000000-0000-0000-0000-000000000923','00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000921','concurent','concurrent',
    'D4_CONCURRENT_OCCURRENCE','child_responded',
    jsonb_build_object('known_match_auto_resolution',jsonb_build_object(
      'authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000922',
      'micro_skill_key','D4_CONCURRENT_OCCURRENCE'
    ))
  ),
  (
    '00000000-0000-0000-0000-000000000924','00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000910',
    '00000000-0000-0000-0000-000000000921','concurent','concurrent',
    'D4_CONCURRENT_OCCURRENCE','child_responded',
    jsonb_build_object('known_match_auto_resolution',jsonb_build_object(
      'authority','known_match','canonical_mapping_id','00000000-0000-0000-0000-000000000922',
      'micro_skill_key','D4_CONCURRENT_OCCURRENCE'
    ))
  );
insert into public.writing_issue_correction_attempts(
  id,writing_issue_id,parent_user_id,child_id,task_submission_id
) values
  ('00000000-0000-0000-0000-000000000925','00000000-0000-0000-0000-000000000923','00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000911'),
  ('00000000-0000-0000-0000-000000000926','00000000-0000-0000-0000-000000000924','00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000912');

select dblink_connect(
  'r8b_concurrent_one',
  format(
    'host=%L dbname=%I',
    btrim(split_part(current_setting('unix_socket_directories'), ',', 1)),
    current_database()
  )
);
select dblink_connect(
  'r8b_concurrent_two',
  format(
    'host=%L dbname=%I',
    btrim(split_part(current_setting('unix_socket_directories'), ',', 1)),
    current_database()
  )
);
select dblink_exec('r8b_concurrent_one','begin');
select dblink_exec(
  'r8b_concurrent_one',
  $lock$do $$ begin
    perform 1 from public.misspelling_instances
    where id = '00000000-0000-0000-0000-000000000921'
    for update;
  end $$;$lock$
);
select dblink_send_query(
  'r8b_concurrent_two',
  $query$select public.finalise_writing_issue_classification_and_learning_item(
    '00000000-0000-0000-0000-000000000924',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000902',
    'concept_gap'
  )$query$
);
select pg_sleep(0.2);
select dblink_send_query(
  'r8b_concurrent_one',
  $query$select public.finalise_writing_issue_classification_and_learning_item(
    '00000000-0000-0000-0000-000000000923',
    '00000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000902',
    'concept_gap'
  )$query$
);
select * from dblink_get_result('r8b_concurrent_one') as result(payload jsonb);
select * from dblink_get_result('r8b_concurrent_one') as result(payload jsonb);
select dblink_exec('r8b_concurrent_one','commit');
select * from dblink_get_result('r8b_concurrent_two') as result(payload jsonb);
select * from dblink_get_result('r8b_concurrent_two') as result(payload jsonb);
select dblink_disconnect('r8b_concurrent_one');
select dblink_disconnect('r8b_concurrent_two');

do $$
begin
  if (
    select count(*)
    from public.writing_issues
    where id in (
      '00000000-0000-0000-0000-000000000923',
      '00000000-0000-0000-0000-000000000924'
    )
      and issue_status = 'finalised'
      and final_classification = 'concept_gap'
  ) <> 2 then
    raise exception 'both concurrent finalisers did not commit';
  end if;

  if (
    select count(*)
    from public.parent_verified_spelling_candidate_mappings
    where source_misspelling_instance_id = '00000000-0000-0000-0000-000000000921'
      and candidate_status in (
        'pending_parent_promotion','parent_local_promoted',
        'admin_review_requested','global_canonical_promoted'
      )
  ) <> 1 then
    raise exception 'concurrent finalisers created more than one live occurrence source';
  end if;

  if (
    select count(*)
    from public.learning_items
    where child_id = '00000000-0000-0000-0000-000000000902'
      and micro_skill_key = 'D4_CONCURRENT_OCCURRENCE'
  ) <> 1 then
    raise exception 'concurrent finalisers duplicated the legacy teaching container';
  end if;
end $$;

select 'prove-r8b-true-concurrent-finalisation: ok' as result;
