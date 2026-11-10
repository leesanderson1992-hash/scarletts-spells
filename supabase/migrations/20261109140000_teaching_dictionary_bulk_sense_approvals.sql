begin;

-- Keep historic binding rows on removal, while excluding them from current reads.
alter table public.teaching_dictionary_lesson_sense_bindings
  add column withdrawn_at timestamptz,
  add column withdrawn_by uuid references auth.users(id);

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
  on conflict (environment_key,canonical_word_id,micro_skill_key) do update
    set sense_id=excluded.sense_id,sense_snapshot=excluded.sense_snapshot,
      pronunciation_snapshot=excluded.pronunciation_snapshot,reviewed_by=excluded.reviewed_by,
      reviewed_at=case when teaching_dictionary_lesson_sense_bindings.sense_id=excluded.sense_id
        and teaching_dictionary_lesson_sense_bindings.sense_snapshot=excluded.sense_snapshot
        and teaching_dictionary_lesson_sense_bindings.pronunciation_snapshot is not distinct from excluded.pronunciation_snapshot
        and teaching_dictionary_lesson_sense_bindings.withdrawn_at is null
        then teaching_dictionary_lesson_sense_bindings.reviewed_at else now() end,
      withdrawn_at=null,withdrawn_by=null;
end $$;

-- Wrap the established batch publisher so relationship and sense changes
-- either commit together or all roll back. Existing callers retain v2.
create function public.reconcile_teaching_dictionary_bulk_review_v3(
  p_environment text,p_skill_key text,p_publish_ids uuid[],p_exclude_ids uuid[],
  p_clear_ids uuid[],p_deassign_ids uuid[],p_restore_ids uuid[],
  p_sense_ids jsonb,p_actor uuid,p_request_id uuid,p_authority_fingerprint text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_word uuid; v_sense text;
begin
  if jsonb_typeof(p_sense_ids) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_sense_ids) key
      where key<>all(select id::text from unnest(p_clear_ids) id)) then
    -- The caller passes a sense for every word it applies, including an
    -- existing approval whose selected meaning is changing.
    raise exception 'TEACHING_BULK_SENSE_SELECTION_INVALID';
  end if;
  for v_word in select id from unnest(p_publish_ids || p_restore_ids) id loop
    v_sense:=nullif(btrim(p_sense_ids->>v_word::text),'');
    if v_sense is null then raise exception 'TEACHING_BULK_SENSE_SELECTION_REQUIRED'; end if;
    if not exists (select 1 from public.teaching_dictionary_reviewed_sense_sets s
      where s.canonical_word_id=v_word and exists (
        select 1 from jsonb_array_elements(s.sense_set->'senses') sense
        where sense->>'id'=v_sense and nullif(btrim(sense->>'definition'),'') is not null
          and nullif(btrim(sense->>'partOfSpeech'),'') is not null)) then
      raise exception 'TEACHING_BULK_REVIEWED_SENSE_REQUIRED';
    end if;
  end loop;
  v_count:=public.reconcile_teaching_dictionary_bulk_review_v2(
    p_environment,p_skill_key,p_publish_ids,p_exclude_ids,p_clear_ids,
    p_deassign_ids,p_restore_ids,p_actor,p_request_id,p_authority_fingerprint);
  for v_word in select id from unnest(p_clear_ids) id where p_sense_ids ? id::text loop
    perform public.review_teaching_dictionary_lesson_sense(
      p_environment,v_word,p_skill_key,p_sense_ids->>v_word::text,p_actor);
  end loop;
  update public.teaching_dictionary_lesson_sense_bindings
    set withdrawn_at=coalesce(withdrawn_at,now()),withdrawn_by=p_actor
    where environment_key=p_environment and micro_skill_key=p_skill_key
      and canonical_word_id=any(p_deassign_ids) and withdrawn_at is null;
  return v_count;
end $$;
revoke all on function public.reconcile_teaching_dictionary_bulk_review_v3(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review_v3(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text)
  to service_role;

notify pgrst,'reload schema';
commit;
