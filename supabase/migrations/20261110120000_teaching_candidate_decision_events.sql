begin;

-- A governed word-skill publication may be shared by several meanings, but
-- each meaning's reviewed rule and facts need their own immutable decision.
create table public.teaching_dictionary_candidate_decision_events (
  id uuid primary key default gen_random_uuid(),
  environment_key text not null check (environment_key in ('local','staging','production')),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  sense_id text not null check (btrim(sense_id) <> ''),
  action text not null check (action in ('approve','supersede','withdraw')),
  pronunciation_id text,
  rule_revision text not null check (btrim(rule_revision) <> ''),
  fact_snapshot jsonb,
  fact_fingerprint text,
  request_id uuid not null,
  reviewed_by uuid not null references auth.users(id),
  source_kind text not null check (source_kind in ('teaching_dictionary_bulk','teaching_dictionary_word')),
  recorded_at timestamptz not null default now(),
  unique (environment_key,canonical_word_id,micro_skill_key,sense_id,action,request_id),
  check ((action='approve' and fact_snapshot is not null and fact_fingerprint ~ '^[a-f0-9]{64}$')
    or (action<>'approve' and fact_snapshot is null and fact_fingerprint is null))
);
create index teaching_candidate_decisions_current_idx on public.teaching_dictionary_candidate_decision_events
  (environment_key,canonical_word_id,micro_skill_key,sense_id,recorded_at desc,id desc);
create trigger teaching_candidate_decisions_immutable before update or delete
  on public.teaching_dictionary_candidate_decision_events for each row
  execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_candidate_decision_events enable row level security;
revoke all on public.teaching_dictionary_candidate_decision_events from public,anon,authenticated;
grant select on public.teaching_dictionary_candidate_decision_events to service_role;

create view public.teaching_dictionary_current_candidate_decisions as
select distinct on (environment_key,canonical_word_id,micro_skill_key,sense_id)
  id,environment_key,canonical_word_id,micro_skill_key,sense_id,action,
  pronunciation_id,rule_revision,fact_snapshot,fact_fingerprint,
  request_id,reviewed_by,source_kind,recorded_at
from public.teaching_dictionary_candidate_decision_events
order by environment_key,canonical_word_id,micro_skill_key,sense_id,recorded_at desc,id desc;
revoke all on public.teaching_dictionary_current_candidate_decisions from public,anon,authenticated;
grant select on public.teaching_dictionary_current_candidate_decisions to service_role;

-- Keep the original publisher and exact-fact guard in one transaction with
-- the candidate event. Historical bindings stay readable until migrated.
create function public.reconcile_teaching_dictionary_bulk_review_v5(
  p_environment text,p_skill_key text,p_publish_ids uuid[],p_exclude_ids uuid[],
  p_clear_ids uuid[],p_deassign_ids uuid[],p_restore_ids uuid[],
  p_sense_ids jsonb,p_actor uuid,p_request_id uuid,p_authority_fingerprint text,
  p_rule_revision text,p_expected_facts jsonb,p_source_kind text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_count integer;
  v_old record;
  v_key text;
  v_fact jsonb;
  v_sense jsonb;
  v_pronunciation text;
begin
  if p_source_kind not in ('teaching_dictionary_bulk','teaching_dictionary_word')
    or p_request_id is null or p_actor is null then
    raise exception 'TEACHING_CANDIDATE_EVENT_INPUT_INVALID';
  end if;
  if jsonb_typeof(p_expected_facts) is distinct from 'object' then
    raise exception 'TEACHING_CANDIDATE_FACTS_REQUIRED';
  end if;
  -- Only exact applied meanings receive a candidate event. Other historical
  -- skills retain the legacy path until their rule manifests are defined.
  if exists(select 1 from jsonb_object_keys(p_expected_facts) key
    where key<>all(select id::text from unnest(p_clear_ids) id)
      or p_sense_ids->>key is distinct from p_expected_facts->key->>'senseId') then
    raise exception 'TEACHING_CANDIDATE_EVENT_SELECTION_INVALID';
  end if;
  create temporary table if not exists pg_temp.teaching_candidate_prior_binding (
    canonical_word_id uuid,sense_id text,primary key(canonical_word_id,sense_id)
  ) on commit drop;
  truncate pg_temp.teaching_candidate_prior_binding;
  insert into pg_temp.teaching_candidate_prior_binding(canonical_word_id,sense_id)
    select canonical_word_id,sense_id from public.teaching_dictionary_lesson_sense_bindings
    where environment_key=p_environment and micro_skill_key=p_skill_key and withdrawn_at is null
      and canonical_word_id=any(p_clear_ids || p_deassign_ids);
  v_count:=public.reconcile_teaching_dictionary_bulk_review_v4(
    p_environment,p_skill_key,p_publish_ids,p_exclude_ids,p_clear_ids,
    p_deassign_ids,p_restore_ids,p_sense_ids,p_actor,p_request_id,
    p_authority_fingerprint,p_rule_revision,p_expected_facts);
  for v_old in select * from pg_temp.teaching_candidate_prior_binding loop
    if v_old.canonical_word_id=any(p_deassign_ids)
      or (p_sense_ids ? v_old.canonical_word_id::text
        and p_sense_ids->>v_old.canonical_word_id::text is distinct from v_old.sense_id) then
      insert into public.teaching_dictionary_candidate_decision_events
        (environment_key,canonical_word_id,micro_skill_key,sense_id,action,
          rule_revision,request_id,reviewed_by,source_kind)
      values(p_environment,v_old.canonical_word_id,p_skill_key,v_old.sense_id,
        case when v_old.canonical_word_id=any(p_deassign_ids) then 'withdraw' else 'supersede' end,
        p_rule_revision,p_request_id,p_actor,p_source_kind)
      on conflict do nothing;
    end if;
  end loop;
  for v_key,v_fact in select key,value from jsonb_each(p_expected_facts) loop
    if not exists(select 1 from public.teaching_dictionary_lesson_sense_bindings b
      where b.environment_key=p_environment and b.canonical_word_id=v_key::uuid
        and b.micro_skill_key=p_skill_key and b.sense_id=v_fact->>'senseId'
        and b.withdrawn_at is null) then
      raise exception 'TEACHING_CANDIDATE_BINDING_MISMATCH';
    end if;
    select value into v_sense from jsonb_array_elements(v_fact->'senseSet'->'senses')
      where value->>'id'=v_fact->>'senseId';
    if v_sense is null then raise exception 'TEACHING_CANDIDATE_SENSE_MISSING'; end if;
    v_pronunciation:=v_sense->>'pronunciationId';
    insert into public.teaching_dictionary_candidate_decision_events
      (environment_key,canonical_word_id,micro_skill_key,sense_id,action,
        pronunciation_id,rule_revision,fact_snapshot,fact_fingerprint,
        request_id,reviewed_by,source_kind)
    values(p_environment,v_key::uuid,p_skill_key,v_fact->>'senseId','approve',
      v_pronunciation,p_rule_revision,v_fact,
      public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
        'facts',v_fact,'ruleRevision',p_rule_revision)),
      p_request_id,p_actor,p_source_kind)
    on conflict do nothing;
  end loop;
  return v_count;
end $$;
revoke all on function public.reconcile_teaching_dictionary_bulk_review_v5(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review_v5(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb,text)
  to service_role;

notify pgrst,'reload schema';
commit;
