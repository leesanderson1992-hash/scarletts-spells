begin;

create table public.teaching_dictionary_multi_sense_csv_requests (
  request_id uuid primary key,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  content_hash text not null,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
alter table public.teaching_dictionary_multi_sense_csv_requests enable row level security;
revoke all on public.teaching_dictionary_multi_sense_csv_requests from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_multi_sense_csv_requests to service_role;

create table public.teaching_dictionary_multi_sense_csv_skill_requests (
  request_id uuid not null references public.teaching_dictionary_multi_sense_csv_requests(request_id),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null,
  micro_skill_key text not null,
  primary key(request_id,sense_id,micro_skill_key)
);
alter table public.teaching_dictionary_multi_sense_csv_skill_requests enable row level security;
revoke all on public.teaching_dictionary_multi_sense_csv_skill_requests from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_multi_sense_csv_skill_requests to service_role;

-- A complete meaning bundle is one transaction. Existing meaning IDs must be
-- retained; removing one is a separate explicit editor review. The underlying
-- review functions validate every part, join and family before anything commits.
create function public.review_teaching_dictionary_multi_sense_csv(
  p_request_id uuid,p_word_id uuid,p_expected_reviewed_at text,
  p_sense_set jsonb,p_analyses jsonb,p_actor uuid,p_source_reference text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_current public.teaching_dictionary_reviewed_sense_sets%rowtype;
  v_existing public.teaching_dictionary_multi_sense_csv_requests%rowtype;
  v_hash text;
  v_analysis jsonb;
  v_sense jsonb;
  v_id uuid;
  v_skill text;
begin
  if p_request_id is null or p_word_id is null or p_actor is null
    or nullif(btrim(p_source_reference),'') is null
    or jsonb_typeof(p_sense_set->'senses') is distinct from 'array'
    or jsonb_typeof(p_sense_set->'pronunciations') is distinct from 'array'
    or jsonb_typeof(p_analyses) is distinct from 'array'
    or jsonb_array_length(p_sense_set->'senses') not between 1 and 20
    or jsonb_array_length(p_analyses)<>jsonb_array_length(p_sense_set->'senses') then
    raise exception 'MULTI_SENSE_CSV_INVALID';
  end if;
  v_hash:=public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
    'wordId',p_word_id,'sourceRevision',p_expected_reviewed_at,
    'senseSet',p_sense_set,'analyses',p_analyses));
  select * into v_existing from public.teaching_dictionary_multi_sense_csv_requests
    where request_id=p_request_id;
  if v_existing.request_id is not null then
    if v_existing.canonical_word_id<>p_word_id or v_existing.content_hash<>v_hash
      or v_existing.reviewed_by<>p_actor then
      raise exception 'MULTI_SENSE_CSV_REQUEST_CONFLICT';
    end if;
    return p_word_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('multi-sense-csv:'||p_word_id::text,0));
  if not exists(select 1 from public.canonical_teaching_dictionary_words
    where id=p_word_id and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure') then
    raise exception 'MULTI_SENSE_CSV_APPROVED_WORD_REQUIRED';
  end if;
  select * into v_current from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word_id for update;
  if (v_current.canonical_word_id is null and nullif(p_expected_reviewed_at,'') is not null)
    or (v_current.canonical_word_id is not null and
      (nullif(p_expected_reviewed_at,'') is null or
       v_current.reviewed_at is distinct from p_expected_reviewed_at::timestamptz)) then
    raise exception 'MULTI_SENSE_CSV_SOURCE_CHANGED';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(v_current.sense_set->'senses','[]'::jsonb)) old_sense
    where not exists(select 1 from jsonb_array_elements(p_sense_set->'senses') new_sense
      where new_sense->>'id'=old_sense->>'id')) then
    raise exception 'MULTI_SENSE_CSV_EXISTING_SENSE_MISSING';
  end if;
  if exists(select 1 from jsonb_array_elements(p_sense_set->'senses') s
    where nullif(btrim(s->>'id'),'') is null
      or nullif(btrim(s->>'definition'),'') is null
      or nullif(btrim(s->>'partOfSpeech'),'') is null
      or (s->>'partOfSpeech'<>'root' and not exists(
        select 1 from jsonb_array_elements(p_sense_set->'pronunciations') p
        where p->>'id'=s->>'pronunciationId' and nullif(btrim(p->>'ipa'),'') is not null)))
    or (select count(distinct s->>'id') from jsonb_array_elements(p_sense_set->'senses') s)
      <>jsonb_array_length(p_sense_set->'senses')
    or exists(select 1 from jsonb_array_elements(p_analyses) a
      where not exists(select 1 from jsonb_array_elements(p_sense_set->'senses') s
        where s->>'id'=a->>'senseId'))
    or (select count(distinct a->>'senseId') from jsonb_array_elements(p_analyses) a)
      <>jsonb_array_length(p_analyses) then
    raise exception 'MULTI_SENSE_CSV_SENSES_INVALID';
  end if;
  insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by,reviewed_at)
  values(p_word_id,p_sense_set,p_actor,now())
  on conflict(canonical_word_id) do update
    set sense_set=excluded.sense_set,reviewed_by=excluded.reviewed_by,
      reviewed_at=excluded.reviewed_at;
  for v_sense in select value from jsonb_array_elements(p_sense_set->'senses') loop
    if nullif(btrim(v_sense->>'dictationSentence'),'') is not null then
      insert into public.teaching_dictionary_reviewed_sense_sentences
        (canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by)
      values(p_word_id,v_sense->>'id',v_sense->>'dictationSentence',
        (v_sense->>'dictationTargetTokenIndex')::integer,
        public.adle_generic_snapshot_json_sha256_v1(jsonb_build_object(
          'senseId',v_sense->>'id','sentence',v_sense->>'dictationSentence',
          'targetTokenIndex',(v_sense->>'dictationTargetTokenIndex')::integer)),p_actor)
      on conflict(canonical_word_id,sense_id,source_row_hash) do nothing;
    end if;
  end loop;
  for v_analysis in select value from jsonb_array_elements(p_analyses) loop
    select id into v_id from public.teaching_dictionary_current_sense_morphology
      where canonical_word_id=p_word_id and sense_id=v_analysis->>'senseId'
        and morphology_parts=v_analysis->'parts'
        and morphology_joins=v_analysis->'joins'
        and morphology_transformations=v_analysis->'transformations'
        and word_sum=v_analysis->>'wordSum';
    if v_id is null then
      v_id:=public.review_teaching_dictionary_sense_morphology(
        gen_random_uuid(),p_word_id,v_analysis->>'senseId','approve',
        v_analysis->'parts',v_analysis->'joins',v_analysis->'transformations',
        v_analysis->>'wordSum',p_actor,p_source_reference);
    end if;
    if nullif(btrim(v_analysis->>'familyKey'),'') is not null then
      if not exists(select 1 from public.teaching_dictionary_current_sense_family_memberships
        where canonical_word_id=p_word_id and sense_id=v_analysis->>'senseId'
          and sense_morphology_id=v_id and family_key=v_analysis->>'familyKey'
          and component_part_id=v_analysis->>'componentPartId'
          and relationship_kind=v_analysis->>'relationshipKind') then
        perform public.review_teaching_dictionary_sense_family_membership(
          gen_random_uuid(),p_word_id,v_analysis->>'senseId',v_id,
          v_analysis->>'familyKey',v_analysis->>'componentPartId',
          v_analysis->>'relationshipKind','approve',p_actor,p_source_reference);
      end if;
    end if;
  end loop;
  insert into public.teaching_dictionary_multi_sense_csv_requests
    (request_id,canonical_word_id,content_hash,reviewed_by)
  values(p_request_id,p_word_id,v_hash,p_actor);
  for v_analysis in select value from jsonb_array_elements(p_analyses) loop
    for v_skill in select value from jsonb_array_elements_text(
      coalesce(v_analysis->'requestedSkillKeys','[]'::jsonb)) loop
      if nullif(btrim(v_skill),'') is null then
        raise exception 'MULTI_SENSE_CSV_SKILL_INVALID'; end if;
      insert into public.teaching_dictionary_multi_sense_csv_skill_requests
        (request_id,canonical_word_id,sense_id,micro_skill_key)
      values(p_request_id,p_word_id,v_analysis->>'senseId',v_skill);
    end loop;
  end loop;
  return p_word_id;
end $$;
revoke all on function public.review_teaching_dictionary_multi_sense_csv(
  uuid,uuid,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_multi_sense_csv(
  uuid,uuid,text,jsonb,jsonb,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
