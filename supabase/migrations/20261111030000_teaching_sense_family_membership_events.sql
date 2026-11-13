begin;

-- New per-sense analyses need family membership keyed to that exact analysis.
-- Legacy family revisions and spelling-level memberships stay readable.
create table public.teaching_dictionary_sense_family_membership_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  request_id uuid not null unique,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null check (btrim(sense_id)<>''),
  sense_morphology_id uuid not null references public.teaching_dictionary_sense_morphology_events(id),
  family_key text not null,
  family_revision integer not null,
  component_part_id text not null check (btrim(component_part_id)<>''),
  base_meaning text not null check (btrim(base_meaning)<>''),
  relationship_kind text not null check (relationship_kind in
    ('free_base','regular_inflection','irregular_inflection','derived','contraction','historical_relative')),
  action text not null check (action in ('approve','withdraw')),
  reviewed_by uuid not null references auth.users(id),
  source_reference text not null check (btrim(source_reference)<>''),
  reviewed_at timestamptz not null default now(),
  foreign key (family_key,family_revision)
    references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision)
);
create index teaching_dictionary_sense_family_membership_events_word
  on public.teaching_dictionary_sense_family_membership_events(
    canonical_word_id,sense_id,event_sequence desc);
create trigger teaching_dictionary_sense_family_membership_events_immutable
  before update or delete on public.teaching_dictionary_sense_family_membership_events
  for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_sense_family_membership_events enable row level security;
revoke all on public.teaching_dictionary_sense_family_membership_events from public,anon,authenticated;
grant select on public.teaching_dictionary_sense_family_membership_events to service_role;

create function public.review_teaching_dictionary_sense_family_membership(
  p_request_id uuid,p_word_id uuid,p_sense_id text,p_sense_morphology_id uuid,
  p_family_key text,p_component_part_id text,p_relationship_kind text,
  p_action text,p_actor uuid,p_source_reference text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_existing public.teaching_dictionary_sense_family_membership_events%rowtype;
  v_analysis public.teaching_dictionary_current_sense_morphology%rowtype;
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_part jsonb;
  v_expected_kind text;
  v_sense jsonb;
  v_id uuid;
begin
  if p_request_id is null or p_word_id is null or p_sense_morphology_id is null
    or p_actor is null or nullif(btrim(p_sense_id),'') is null
    or nullif(btrim(p_family_key),'') is null
    or nullif(btrim(p_component_part_id),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or p_relationship_kind is null
    or p_relationship_kind not in ('free_base','regular_inflection',
      'irregular_inflection','derived','contraction','historical_relative')
    or p_action is null or p_action not in ('approve','withdraw') then
    raise exception 'SENSE_FAMILY_MEMBERSHIP_INCOMPLETE';
  end if;
  select * into v_existing from public.teaching_dictionary_sense_family_membership_events
    where request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.canonical_word_id<>p_word_id or v_existing.sense_id<>p_sense_id
      or v_existing.sense_morphology_id<>p_sense_morphology_id
      or v_existing.family_key<>p_family_key
      or v_existing.component_part_id<>p_component_part_id
      or v_existing.relationship_kind<>p_relationship_kind
      or v_existing.action<>p_action or v_existing.reviewed_by<>p_actor
      or v_existing.source_reference<>p_source_reference then
      raise exception 'SENSE_FAMILY_MEMBERSHIP_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'sense-family-membership:'||p_word_id::text||':'||p_sense_id,0));
  select * into v_analysis from public.teaching_dictionary_current_sense_morphology
    where id=p_sense_morphology_id and canonical_word_id=p_word_id and sense_id=p_sense_id;
  if v_analysis.id is null then raise exception 'SENSE_FAMILY_ANALYSIS_STALE'; end if;
  select * into v_family from public.canonical_teaching_dictionary_lexical_base_families f
    where f.family_key=p_family_key and f.review_status='approved'
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)
    for update;
  if v_family.family_key is null then raise exception 'SENSE_FAMILY_CURRENT_FAMILY_REQUIRED'; end if;
  select value into v_part from jsonb_array_elements(v_analysis.morphology_parts)
    where value->>'id'=p_component_part_id;
  v_expected_kind:=case when v_family.base_kind='bound_root' then 'root' else 'base' end;
  if v_part is null or v_part->>'kind'<>v_expected_kind
    or lower(v_part->>'sourceText')<>v_family.base_lemma
    or v_part->>'gloss'<>v_family.base_meaning then
    raise exception 'SENSE_FAMILY_COMPONENT_INVALID';
  end if;
  select value into v_sense from public.teaching_dictionary_reviewed_sense_sets s,
    jsonb_array_elements(s.sense_set->'senses') value
    where s.canonical_word_id=p_word_id and value->>'id'=p_sense_id;
  if v_sense is null or nullif(btrim(v_sense->>'definition'),'') is null then
    raise exception 'SENSE_FAMILY_REVIEWED_SENSE_REQUIRED';
  end if;
  if p_relationship_kind='free_base' and (v_family.base_kind<>'free_base'
    or v_family.canonical_base_word_id is distinct from p_word_id
    or v_family.base_part_of_speech is distinct from v_sense->>'partOfSpeech') then
    raise exception 'SENSE_FAMILY_ANCHOR_MISMATCH';
  end if;
  if p_action='withdraw' and not exists(select 1 from
    public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=p_word_id and sense_id=p_sense_id
      and family_key=p_family_key and component_part_id=p_component_part_id
      and sense_morphology_id=p_sense_morphology_id) then
    raise exception 'SENSE_FAMILY_ACTIVE_MEMBERSHIP_REQUIRED';
  end if;
  insert into public.teaching_dictionary_sense_family_membership_events
    (request_id,canonical_word_id,sense_id,sense_morphology_id,family_key,
     family_revision,component_part_id,base_meaning,relationship_kind,action,
     reviewed_by,source_reference)
  values(p_request_id,p_word_id,p_sense_id,p_sense_morphology_id,
    v_family.family_key,v_family.revision,p_component_part_id,v_family.base_meaning,
    p_relationship_kind,p_action,p_actor,p_source_reference)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.review_teaching_dictionary_sense_family_membership(
  uuid,uuid,text,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_sense_family_membership(
  uuid,uuid,text,uuid,text,text,text,text,uuid,text) to service_role;

create view public.teaching_dictionary_current_sense_family_memberships as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_membership_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_families as (
  select distinct on (family_key) *
  from public.canonical_teaching_dictionary_lexical_base_families
  order by family_key,revision desc
)
select e.id,e.canonical_word_id,e.sense_id,e.sense_morphology_id,
  e.family_key,f.revision as current_family_revision,e.component_part_id,
  e.base_meaning,e.relationship_kind,e.reviewed_by,e.reviewed_at
from latest e
join public.teaching_dictionary_current_sense_morphology analysis
  on analysis.id=e.sense_morphology_id and analysis.canonical_word_id=e.canonical_word_id
    and analysis.sense_id=e.sense_id
join current_families f on f.family_key=e.family_key and f.review_status='approved'
where e.action='approve' and f.base_meaning=e.base_meaning;
revoke all on public.teaching_dictionary_current_sense_family_memberships from public,anon,authenticated;
grant select on public.teaching_dictionary_current_sense_family_memberships to service_role;

notify pgrst,'reload schema';
commit;
