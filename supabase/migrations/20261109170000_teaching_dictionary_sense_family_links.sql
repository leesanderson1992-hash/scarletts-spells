begin;

-- A sense can have several family links. These reviewed events sit beside the
-- immutable spelling-level family revisions and never rewrite their history.
create table public.teaching_dictionary_sense_family_link_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  request_id uuid not null unique,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null check (btrim(sense_id) <> ''),
  family_key text not null,
  family_revision integer not null,
  component_part_id text not null check (btrim(component_part_id) <> ''),
  canonical_morphology_id uuid not null references public.canonical_teaching_dictionary_word_morphology(id),
  base_meaning text not null,
  sense_set_fingerprint text not null check (sense_set_fingerprint ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('approve','withdraw')),
  reviewed_by uuid not null references auth.users(id),
  source_reference text not null check (btrim(source_reference) <> ''),
  reviewed_at timestamptz not null default now(),
  foreign key (family_key,family_revision)
    references public.canonical_teaching_dictionary_lexical_base_families(family_key,revision)
);
create index teaching_dictionary_sense_family_link_events_word
  on public.teaching_dictionary_sense_family_link_events(canonical_word_id,sense_id,reviewed_at desc);
create trigger teaching_dictionary_sense_family_link_events_immutable
  before update or delete on public.teaching_dictionary_sense_family_link_events
  for each row execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_sense_family_link_events enable row level security;
revoke all on public.teaching_dictionary_sense_family_link_events from public,anon,authenticated;
grant select on public.teaching_dictionary_sense_family_link_events to service_role;

create or replace function public.review_teaching_dictionary_sense_family_link(
  p_request_id uuid,p_word_id uuid,p_sense_id text,p_family_key text,
  p_component_part_id text,p_action text,p_actor uuid,p_source_reference text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_existing public.teaching_dictionary_sense_family_link_events%rowtype;
  v_set jsonb;
  v_sense jsonb;
  v_family public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  v_member public.canonical_teaching_dictionary_lexical_base_family_members%rowtype;
  v_morphology public.canonical_teaching_dictionary_word_morphology%rowtype;
  v_part jsonb;
  v_expected_kind text;
  v_id uuid;
begin
  if p_request_id is null or p_actor is null or p_word_id is null
    or nullif(btrim(p_sense_id),'') is null or nullif(btrim(p_family_key),'') is null
    or nullif(btrim(p_component_part_id),'') is null
    or nullif(btrim(p_source_reference),'') is null
    or p_action not in ('approve','withdraw') then
    raise exception 'SENSE_FAMILY_REVIEW_INCOMPLETE';
  end if;
  select * into v_existing from public.teaching_dictionary_sense_family_link_events
    where request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.canonical_word_id<>p_word_id or v_existing.sense_id<>p_sense_id
      or v_existing.family_key<>p_family_key
      or v_existing.component_part_id<>p_component_part_id
      or v_existing.action<>p_action or v_existing.reviewed_by<>p_actor
      or v_existing.source_reference<>p_source_reference then
      raise exception 'SENSE_FAMILY_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sense-family:'||p_word_id::text||':'||p_sense_id,0));
  select sense_set into v_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=p_word_id;
  select value into v_sense from jsonb_array_elements(coalesce(v_set->'senses','[]'::jsonb))
    where value->>'id'=p_sense_id;
  if v_sense is null then raise exception 'SENSE_FAMILY_REVIEWED_SENSE_REQUIRED'; end if;
  select * into v_family from public.canonical_teaching_dictionary_lexical_base_families f
    where f.family_key=p_family_key and f.review_status='approved'
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)
    for update;
  if v_family.family_key is null then raise exception 'SENSE_FAMILY_CURRENT_FAMILY_REQUIRED'; end if;
  select * into v_member from public.canonical_teaching_dictionary_lexical_base_family_members
    where family_key=v_family.family_key and revision=v_family.revision
      and canonical_word_id=p_word_id;
  if v_member.canonical_word_id is null then raise exception 'SENSE_FAMILY_MEMBERSHIP_REQUIRED'; end if;
  select * into v_morphology from public.canonical_teaching_dictionary_word_morphology
    where id=v_member.canonical_morphology_id and canonical_word_id=p_word_id
      and row_status='active' and analysis_status='approved'
      and review_status='approved_for_first_exposure';
  if v_morphology.id is null or v_member.morphology_parts<>v_morphology.morphology_parts
    or v_member.morphology_joins<>v_morphology.morphology_joins
    or v_member.word_sum<>v_morphology.word_sum then
    raise exception 'SENSE_FAMILY_MORPHOLOGY_STALE';
  end if;
  select value into v_part from jsonb_array_elements(v_morphology.morphology_parts)
    where value->>'id'=p_component_part_id;
  v_expected_kind:=case when v_family.base_kind='bound_root' then 'root' else 'base' end;
  if v_part is null or v_part->>'kind'<>v_expected_kind
    or lower(v_part->>'sourceText')<>v_family.base_lemma
    or v_part->>'gloss'<>v_family.base_meaning then
    raise exception 'SENSE_FAMILY_COMPONENT_INVALID';
  end if;
  if p_action='approve' and (v_sense->>'partOfSpeech' is distinct from
      v_member.word_part_of_speech or nullif(btrim(v_sense->>'definition'),'') is null) then
    raise exception 'SENSE_FAMILY_MEANING_CONFLICT';
  end if;
  if p_action='withdraw' and not exists (
    select 1 from public.teaching_dictionary_sense_family_link_events e
    where e.canonical_word_id=p_word_id and e.sense_id=p_sense_id
      and e.family_key=p_family_key and e.component_part_id=p_component_part_id
      and e.action='approve'
      and not exists(select 1 from public.teaching_dictionary_sense_family_link_events newer
        where newer.canonical_word_id=e.canonical_word_id and newer.sense_id=e.sense_id
          and newer.family_key=e.family_key and newer.component_part_id=e.component_part_id
          and newer.event_sequence>e.event_sequence)) then
    raise exception 'SENSE_FAMILY_ACTIVE_LINK_REQUIRED';
  end if;
  insert into public.teaching_dictionary_sense_family_link_events
    (request_id,canonical_word_id,sense_id,family_key,family_revision,
     component_part_id,canonical_morphology_id,base_meaning,sense_set_fingerprint,
     action,reviewed_by,source_reference)
  values(p_request_id,p_word_id,p_sense_id,v_family.family_key,v_family.revision,
    p_component_part_id,v_morphology.id,v_family.base_meaning,
    public.adle_generic_snapshot_json_sha256_v1(v_set),p_action,p_actor,p_source_reference)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.review_teaching_dictionary_sense_family_link(
  uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_sense_family_link(
  uuid,uuid,text,text,text,text,uuid,text) to service_role;

-- The current projection keeps a link when an unrelated family member gains
-- a new revision, but stales it if this word's morphology or base meaning changes.
create view public.teaching_dictionary_current_sense_family_links as
with latest as (
  select distinct on (canonical_word_id,sense_id,family_key,component_part_id) *
  from public.teaching_dictionary_sense_family_link_events
  order by canonical_word_id,sense_id,family_key,component_part_id,event_sequence desc
), current_families as (
  select distinct on (family_key) * from public.canonical_teaching_dictionary_lexical_base_families
  order by family_key,revision desc
)
select e.id,e.canonical_word_id,e.sense_id,e.family_key,
  f.revision as current_family_revision,e.component_part_id,e.canonical_morphology_id,
  e.base_meaning,e.reviewed_by,e.reviewed_at
from latest e
join current_families f on f.family_key=e.family_key and f.review_status='approved'
join public.canonical_teaching_dictionary_lexical_base_family_members m
  on m.family_key=f.family_key and m.revision=f.revision
    and m.canonical_word_id=e.canonical_word_id
    and m.canonical_morphology_id=e.canonical_morphology_id
join public.canonical_teaching_dictionary_word_morphology morph
  on morph.id=e.canonical_morphology_id and morph.row_status='active'
join public.teaching_dictionary_reviewed_sense_sets s
  on s.canonical_word_id=e.canonical_word_id
where e.action='approve' and f.base_meaning=e.base_meaning
  and public.adle_generic_snapshot_json_sha256_v1(s.sense_set)=e.sense_set_fingerprint;
revoke all on public.teaching_dictionary_current_sense_family_links from public,anon,authenticated;
grant select on public.teaching_dictionary_current_sense_family_links to service_role;

notify pgrst,'reload schema';
commit;
