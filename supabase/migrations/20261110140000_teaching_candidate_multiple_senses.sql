begin;

-- A spelling and skill may demonstrate two separately reviewed meanings.
alter table public.teaching_dictionary_lesson_sense_bindings
  drop constraint teaching_dictionary_lesson_sense_bindings_pkey;
alter table public.teaching_dictionary_lesson_sense_bindings
  add primary key (environment_key,canonical_word_id,micro_skill_key,sense_id);

create or replace function public.review_teaching_dictionary_lesson_sense(
  p_environment text,p_word uuid,p_skill text,p_sense text,p_actor uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_set jsonb; v_sense jsonb; v_pronunciation jsonb;
begin
  if p_environment not in ('local','staging','production') or p_actor is null then
    raise exception 'TEACHING_LESSON_SENSE_INVALID';
  end if;
  select sense_set into v_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word;
  if v_set is null then raise exception 'TEACHING_LESSON_REVIEWED_SENSE_REQUIRED'; end if;
  select value into v_sense from jsonb_array_elements(v_set->'senses')
    where value->>'id'=p_sense;
  if v_sense is null then raise exception 'TEACHING_LESSON_SENSE_INVALID'; end if;
  select value into v_pronunciation from jsonb_array_elements(v_set->'pronunciations')
    where value->>'id'=v_sense->>'pronunciationId';
  if v_sense->>'pronunciationId' is not null and v_pronunciation is null then
    raise exception 'TEACHING_LESSON_PRONUNCIATION_INVALID';
  end if;
  if not exists (
    select 1 from public.adle_reviewed_word_skill_pairs pair
    join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
    where pair.canonical_word_id=p_word and pair.micro_skill_key=p_skill
      and pair.relationship_role='demonstrates' and release.environment_key=p_environment
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals withdrawal
        where withdrawal.release_id=release.id)
  ) then raise exception 'TEACHING_LESSON_SKILL_APPROVAL_REQUIRED'; end if;
  insert into public.teaching_dictionary_lesson_sense_bindings
    (environment_key,canonical_word_id,micro_skill_key,sense_id,sense_snapshot,pronunciation_snapshot,reviewed_by)
  values (p_environment,p_word,p_skill,p_sense,v_sense,v_pronunciation,p_actor)
  on conflict (environment_key,canonical_word_id,micro_skill_key,sense_id) do update
    set sense_snapshot=excluded.sense_snapshot,
      pronunciation_snapshot=excluded.pronunciation_snapshot,reviewed_by=excluded.reviewed_by,
      reviewed_at=case when teaching_dictionary_lesson_sense_bindings.sense_snapshot=excluded.sense_snapshot
        and teaching_dictionary_lesson_sense_bindings.pronunciation_snapshot is not distinct from excluded.pronunciation_snapshot
        and teaching_dictionary_lesson_sense_bindings.withdrawn_at is null
        then teaching_dictionary_lesson_sense_bindings.reviewed_at else now() end,
      withdrawn_at=null,withdrawn_by=null;
end $$;

-- Superseded decisions do not remain effective even when their historical
-- binding row is retained. CSV-era bindings without a decision remain readable.
create view public.teaching_dictionary_effective_lesson_sense_bindings as
select b.* from public.teaching_dictionary_lesson_sense_bindings b
left join public.teaching_dictionary_current_candidate_decisions d
  on d.environment_key=b.environment_key and d.canonical_word_id=b.canonical_word_id
    and d.micro_skill_key=b.micro_skill_key and d.sense_id=b.sense_id
where b.withdrawn_at is null and (d.id is null or d.action='approve');
revoke all on public.teaching_dictionary_effective_lesson_sense_bindings from public,anon,authenticated;
grant select on public.teaching_dictionary_effective_lesson_sense_bindings to service_role;

-- Add the selected meaning without retiring another meaning for the same
-- skill. Deassigning the word retires every meaning in the governed pair.
create function public.reconcile_teaching_dictionary_bulk_review_v6(
  p_environment text,p_skill_key text,p_publish_ids uuid[],p_exclude_ids uuid[],
  p_clear_ids uuid[],p_deassign_ids uuid[],p_restore_ids uuid[],
  p_sense_ids jsonb,p_actor uuid,p_request_id uuid,p_authority_fingerprint text,
  p_rule_revision text,p_expected_facts jsonb,p_source_kind text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_old record; v_key text; v_fact jsonb;
  v_sense jsonb; v_pronunciation text;
begin
  if p_source_kind not in ('teaching_dictionary_bulk','teaching_dictionary_word')
    or p_request_id is null or p_actor is null
    or jsonb_typeof(p_expected_facts) is distinct from 'object' then
    raise exception 'TEACHING_CANDIDATE_EVENT_INPUT_INVALID';
  end if;
  if exists(select 1 from jsonb_object_keys(p_expected_facts) key
    where key<>all(select id::text from unnest(p_clear_ids) id)
      or p_sense_ids->>key is distinct from p_expected_facts->key->>'senseId') then
    raise exception 'TEACHING_CANDIDATE_EVENT_SELECTION_INVALID';
  end if;
  create temporary table if not exists pg_temp.teaching_candidate_prior_binding_v6 (
    canonical_word_id uuid,sense_id text,primary key(canonical_word_id,sense_id)
  ) on commit drop;
  truncate pg_temp.teaching_candidate_prior_binding_v6;
  insert into pg_temp.teaching_candidate_prior_binding_v6(canonical_word_id,sense_id)
    select canonical_word_id,sense_id from public.teaching_dictionary_effective_lesson_sense_bindings
    where environment_key=p_environment and micro_skill_key=p_skill_key
      and canonical_word_id=any(p_deassign_ids);
  v_count:=public.reconcile_teaching_dictionary_bulk_review_v4(
    p_environment,p_skill_key,p_publish_ids,p_exclude_ids,p_clear_ids,
    p_deassign_ids,p_restore_ids,p_sense_ids,p_actor,p_request_id,
    p_authority_fingerprint,p_rule_revision,p_expected_facts);
  for v_old in select * from pg_temp.teaching_candidate_prior_binding_v6 loop
    insert into public.teaching_dictionary_candidate_decision_events
      (environment_key,canonical_word_id,micro_skill_key,sense_id,action,
        rule_revision,request_id,reviewed_by,source_kind)
    values(p_environment,v_old.canonical_word_id,p_skill_key,v_old.sense_id,
      'withdraw',p_rule_revision,p_request_id,p_actor,p_source_kind)
    on conflict do nothing;
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
revoke all on function public.reconcile_teaching_dictionary_bulk_review_v6(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review_v6(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb,text)
  to service_role;

notify pgrst,'reload schema';
commit;
