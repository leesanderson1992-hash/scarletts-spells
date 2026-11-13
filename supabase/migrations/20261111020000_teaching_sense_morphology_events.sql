begin;

-- A spelling may have different reviewed word-part meanings or structures for
-- different senses. Keep the legacy active spelling analysis readable while
-- new sense analyses are approved independently and immutably.
create table public.teaching_dictionary_sense_morphology_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  request_id uuid not null unique,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null check (btrim(sense_id)<>''),
  pronunciation_id text,
  sense_fingerprint text not null check (sense_fingerprint ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('approve','withdraw')),
  morphology_parts jsonb not null,
  morphology_joins jsonb not null,
  morphology_transformations jsonb not null,
  word_sum text not null,
  reviewed_by uuid not null references auth.users(id),
  source_reference text not null check (btrim(source_reference)<>''),
  reviewed_at timestamptz not null default now(),
  check (jsonb_typeof(morphology_parts)='array' and jsonb_typeof(morphology_joins)='array'
    and jsonb_typeof(morphology_transformations)='array'),
  check (action<>'approve' or (jsonb_array_length(morphology_parts)>0 and btrim(word_sum)<>''))
);
create index teaching_dictionary_sense_morphology_events_word
  on public.teaching_dictionary_sense_morphology_events(canonical_word_id,sense_id,event_sequence desc);
create trigger teaching_dictionary_sense_morphology_events_immutable
  before update or delete on public.teaching_dictionary_sense_morphology_events
  for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_sense_morphology_events enable row level security;
revoke all on public.teaching_dictionary_sense_morphology_events from public,anon,authenticated;
grant select on public.teaching_dictionary_sense_morphology_events to service_role;

create function public.review_teaching_dictionary_sense_morphology(
  p_request_id uuid,p_word_id uuid,p_sense_id text,p_action text,
  p_parts jsonb,p_joins jsonb,p_transformations jsonb,p_word_sum text,
  p_actor uuid,p_source_reference text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_existing public.teaching_dictionary_sense_morphology_events%rowtype;
  v_word public.canonical_teaching_dictionary_words%rowtype;
  v_set jsonb;
  v_sense jsonb;
  v_part jsonb;
  v_next jsonb;
  v_join jsonb;
  v_transformation jsonb;
  v_transformation_index integer;
  v_transformed text;
  v_seen_ids text[] := '{}'::text[];
  v_surface text := '';
  v_sources text := '';
  v_position integer := 0;
  v_count integer;
  v_index integer;
  v_id uuid;
begin
  if p_request_id is null or p_word_id is null or p_actor is null
    or nullif(btrim(p_sense_id),'') is null or p_action not in ('approve','withdraw')
    or nullif(btrim(p_source_reference),'') is null then
    raise exception 'SENSE_MORPHOLOGY_REVIEW_INCOMPLETE';
  end if;
  select * into v_existing from public.teaching_dictionary_sense_morphology_events
    where request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.canonical_word_id<>p_word_id or v_existing.sense_id<>p_sense_id
      or v_existing.action<>p_action or v_existing.morphology_parts is distinct from p_parts
      or v_existing.morphology_joins is distinct from p_joins
      or v_existing.morphology_transformations is distinct from p_transformations
      or v_existing.word_sum is distinct from p_word_sum
      or v_existing.reviewed_by<>p_actor or v_existing.source_reference<>p_source_reference then
      raise exception 'SENSE_MORPHOLOGY_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sense-morphology:'||p_word_id::text||':'||p_sense_id,0));
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=p_word_id and row_status='active' and review_status='approved_for_first_exposure';
  if v_word.id is null then raise exception 'SENSE_MORPHOLOGY_WORD_NOT_APPROVED'; end if;
  select sense_set into v_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word_id;
  select value into v_sense from jsonb_array_elements(coalesce(v_set->'senses','[]'::jsonb))
    where value->>'id'=p_sense_id;
  if v_sense is null or nullif(btrim(v_sense->>'definition'),'') is null
    or nullif(btrim(v_sense->>'partOfSpeech'),'') is null then
    raise exception 'SENSE_MORPHOLOGY_REVIEWED_SENSE_REQUIRED';
  end if;
  if p_action='approve' then
    if jsonb_typeof(p_parts) is distinct from 'array'
      or jsonb_typeof(p_joins) is distinct from 'array'
      or jsonb_typeof(p_transformations) is distinct from 'array'
      or jsonb_array_length(p_transformations)>24 then
      raise exception 'SENSE_MORPHOLOGY_PARTS_INVALID';
    end if;
    v_count:=jsonb_array_length(p_parts);
    if v_count<1 or v_count>12 or jsonb_array_length(p_joins)<>v_count-1 then
      raise exception 'SENSE_MORPHOLOGY_JOIN_COUNT';
    end if;
    for v_index in 0..v_count-1 loop
      v_part:=p_parts->v_index;
      if jsonb_typeof(v_part) is distinct from 'object'
        or nullif(btrim(v_part->>'id'),'') is null
        or v_part->>'kind' is null
        or v_part->>'kind' not in ('prefix','base','root','suffix','connector')
        or nullif(v_part->>'sourceText','') is null
        or nullif(v_part->>'surfaceText','') is null
        or nullif(btrim(v_part->>'gloss'),'') is null
        or jsonb_typeof(v_part->'displayRange') is distinct from 'object'
        or jsonb_typeof(v_part->'displayRange'->'start') is distinct from 'number'
        or jsonb_typeof(v_part->'displayRange'->'end') is distinct from 'number'
        or v_part ?| array['text','type','role','partType','meaning','start','end']
        or (v_part->'displayRange'->>'start')::integer<>v_position
        or (v_part->'displayRange'->>'end')::integer<>
          v_position+char_length(v_part->>'surfaceText')
        or v_part->>'id'=any(v_seen_ids) then
        raise exception 'SENSE_MORPHOLOGY_PART_INVALID';
      end if;
      v_seen_ids:=array_append(v_seen_ids,v_part->>'id');
      v_transformed:=v_part->>'sourceText';
      for v_transformation_index in 0..jsonb_array_length(p_transformations)-1 loop
        v_transformation:=p_transformations->v_transformation_index;
        if v_transformation->>'sourcePartId'=v_part->>'id' then
          if jsonb_typeof(v_transformation) is distinct from 'object'
            or nullif(btrim(v_transformation->>'type'),'') is null
            or nullif(btrim(v_transformation->>'explanation'),'') is null
            or v_transformation->>'sourceText' is distinct from v_transformed
            or nullif(v_transformation->>'surfaceText','') is null then
            raise exception 'SENSE_MORPHOLOGY_TRANSFORMATION_INVALID';
          end if;
          v_transformed:=v_transformation->>'surfaceText';
        end if;
      end loop;
      if v_transformed<>v_part->>'surfaceText' then
        raise exception 'SENSE_MORPHOLOGY_TRANSFORMATION_MISSING';
      end if;
      v_surface:=v_surface||(v_part->>'surfaceText');
      v_sources:=v_sources||case when v_index=0 then '' else ' + ' end||(v_part->>'sourceText');
      v_position:=v_position+char_length(v_part->>'surfaceText');
      if v_index<v_count-1 then
        v_next:=p_parts->(v_index+1);
        v_join:=p_joins->v_index;
        if jsonb_typeof(v_join) is distinct from 'object'
          or v_join->>'afterPartId' is distinct from v_part->>'id'
          or v_join->>'beforePartId' is distinct from v_next->>'id'
          or v_join->>'joinType' is null
          or v_join->>'joinType' not in ('none','space','hyphen') then
          raise exception 'SENSE_MORPHOLOGY_JOIN_INVALID';
        end if;
        v_surface:=v_surface||case v_join->>'joinType'
          when 'space' then ' ' when 'hyphen' then '-' else '' end;
        v_position:=char_length(v_surface);
      end if;
    end loop;
    for v_transformation_index in 0..jsonb_array_length(p_transformations)-1 loop
      v_transformation:=p_transformations->v_transformation_index;
      if v_transformation->>'sourcePartId' is null
        or not (v_transformation->>'sourcePartId'=any(v_seen_ids)) then
        raise exception 'SENSE_MORPHOLOGY_TRANSFORMATION_PART_INVALID';
      end if;
    end loop;
    if v_surface<>v_word.display_word or p_word_sum<>v_sources||' → '||v_word.display_word then
      raise exception 'SENSE_MORPHOLOGY_WORD_SUM_INVALID';
    end if;
  else
    if p_parts is distinct from '[]'::jsonb or p_joins is distinct from '[]'::jsonb
      or p_transformations is distinct from '[]'::jsonb
      or coalesce(p_word_sum,'')<>''
      or not exists(select 1 from public.teaching_dictionary_current_sense_morphology
        where canonical_word_id=p_word_id and sense_id=p_sense_id) then
      raise exception 'SENSE_MORPHOLOGY_WITHDRAW_INVALID';
    end if;
  end if;
  insert into public.teaching_dictionary_sense_morphology_events
    (request_id,canonical_word_id,sense_id,pronunciation_id,sense_fingerprint,
     action,morphology_parts,morphology_joins,morphology_transformations,
     word_sum,reviewed_by,source_reference)
  values(p_request_id,p_word_id,p_sense_id,v_sense->>'pronunciationId',
    public.adle_generic_snapshot_json_sha256_v1(v_sense),p_action,p_parts,p_joins,
    p_transformations,p_word_sum,p_actor,p_source_reference)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.review_teaching_dictionary_sense_morphology(
  uuid,uuid,text,text,jsonb,jsonb,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_sense_morphology(
  uuid,uuid,text,text,jsonb,jsonb,jsonb,text,uuid,text) to service_role;

create view public.teaching_dictionary_current_sense_morphology as
with latest as (
  select distinct on (canonical_word_id,sense_id) *
  from public.teaching_dictionary_sense_morphology_events
  order by canonical_word_id,sense_id,event_sequence desc
)
select e.id,e.canonical_word_id,e.sense_id,e.pronunciation_id,
  e.morphology_parts,e.morphology_joins,e.morphology_transformations,
  e.word_sum,e.reviewed_by,e.reviewed_at
from latest e
join public.canonical_teaching_dictionary_words w
  on w.id=e.canonical_word_id and w.row_status='active'
    and w.review_status='approved_for_first_exposure'
join public.teaching_dictionary_reviewed_sense_sets s
  on s.canonical_word_id=e.canonical_word_id
join lateral (
  select value from jsonb_array_elements(s.sense_set->'senses')
  where value->>'id'=e.sense_id
) selected on true
where e.action='approve'
  and public.adle_generic_snapshot_json_sha256_v1(selected.value)=e.sense_fingerprint;
revoke all on public.teaching_dictionary_current_sense_morphology from public,anon,authenticated;
grant select on public.teaching_dictionary_current_sense_morphology to service_role;

notify pgrst,'reload schema';
commit;
