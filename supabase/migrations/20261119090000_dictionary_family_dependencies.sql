begin;
create table public.teaching_dictionary_family_dependencies (
  id uuid primary key default gen_random_uuid(),
  environment_key text not null check(environment_key in ('staging','production')),
  micro_skill_key text not null,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  sense_id text not null, component_part_id text not null,
  base_form text not null, base_kind text not null check(base_kind in ('free_base','bound_root')),
  expected_meaning text not null,
  expected_morphology_id uuid not null,
  expected_reviewed_at timestamptz not null,
  context jsonb not null default '{}',
  confirmed_family_key text,
  family_resolved boolean not null default false,
  status text not null default 'waiting' check(status in ('waiting','needs_choice','needs_review','ready','error')),
  detail text not null default 'Waiting for the reviewed family.',
  reviewed_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  checked_at timestamptz, lease_until timestamptz,
  unique(environment_key,micro_skill_key,canonical_word_id,sense_id,component_part_id)
);
create index dictionary_family_dependencies_scan on public.teaching_dictionary_family_dependencies(environment_key,checked_at nulls first)
  where status <> 'ready';
create index dictionary_family_dependencies_base on public.teaching_dictionary_family_dependencies(base_form,base_kind);
create index if not exists lexical_family_dependency_lookup on public.canonical_teaching_dictionary_lexical_base_families(base_lemma,base_kind,review_status);
alter table public.teaching_dictionary_family_dependencies enable row level security;
revoke all on public.teaching_dictionary_family_dependencies from public,anon,authenticated;
grant select,insert,update on public.teaching_dictionary_family_dependencies to service_role;

-- The canonical facts and their waiting dependencies commit together.
create function public.import_teaching_dictionary_partial_review(
  p_request_id uuid,p_word_id uuid,p_display_word text,p_expected_reviewed_at text,
  p_sense_set jsonb,p_analyses jsonb,p_actor uuid,p_source_reference text,
  p_environment text,p_skill text,p_dependencies jsonb
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_word uuid; item jsonb; m record; part jsonb; revision timestamptz;
begin
  if p_environment not in ('staging','production') or jsonb_typeof(p_dependencies) is distinct from 'array'
    or not exists(select 1 from public.micro_skill_catalog where micro_skill_key=p_skill and is_active and is_assignable)
    then raise exception 'DICTIONARY_DEPENDENCY_INVALID'; end if;
  v_word:=public.import_reviewed_teaching_dictionary_word(p_request_id,p_word_id,p_display_word,p_expected_reviewed_at,
    p_sense_set,p_analyses,p_actor,p_source_reference);
  select reviewed_at into revision from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=v_word;
  -- An authoritative replacement clears previous waiting choices for the selected senses.
  delete from public.teaching_dictionary_family_dependencies d where d.environment_key=p_environment and d.micro_skill_key=p_skill
    and d.canonical_word_id=v_word and exists(select 1 from jsonb_array_elements(p_analyses) a
      where a->>'senseId'=d.sense_id and a->'requestedSkillKeys' ? p_skill);
  for item in select value from jsonb_array_elements(p_dependencies) loop
    select * into m from public.teaching_dictionary_current_sense_morphology
      where canonical_word_id=v_word and sense_id=item->>'senseId';
    select value into part from jsonb_array_elements(m.morphology_parts)
      where value->>'id'=item->>'componentPartId' and value->>'kind' in ('base','root');
    if m.id is null or part is null or not exists(select 1 from jsonb_array_elements(p_analyses) a
      where a->>'senseId'=item->>'senseId' and a->'requestedSkillKeys' ? p_skill) then
      raise exception 'DICTIONARY_DEPENDENCY_PART_INVALID'; end if;
    insert into public.teaching_dictionary_family_dependencies(environment_key,micro_skill_key,canonical_word_id,sense_id,
      component_part_id,base_form,base_kind,expected_meaning,expected_morphology_id,expected_reviewed_at,context,reviewed_by)
    values(p_environment,p_skill,v_word,item->>'senseId',part->>'id',lower(part->>'sourceText'),
      case when part->>'kind'='root' then 'bound_root' else 'free_base' end,part->>'gloss',m.id,revision,
      coalesce(item->'context','{}'),p_actor);
  end loop;
  return v_word;
end $$;
revoke all on function public.import_teaching_dictionary_partial_review(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.import_teaching_dictionary_partial_review(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,text,jsonb) to service_role;

create or replace function public.claim_dictionary_family_dependencies(p_environment text,p_limit integer default 10,p_base text default null)
returns setof public.teaching_dictionary_family_dependencies language sql security definer set search_path=public,pg_temp as $$
  update public.teaching_dictionary_family_dependencies d set lease_until=now()+interval '3 minutes',checked_at=now()
  where id in(select waiting.id from public.teaching_dictionary_family_dependencies waiting
    where environment_key=p_environment and status<>'ready' and (lease_until is null or lease_until<now())
      and (p_base is null or base_form=p_base)
      and (p_base is not null or exists (
        select 1 from public.canonical_teaching_dictionary_lexical_base_families f
        left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
        where f.base_lemma=waiting.base_form and f.base_kind=waiting.base_kind and f.review_status='approved'
          and (checked_at is null or status='error' or greatest(f.created_at,coalesce(f.reviewed_at,f.created_at),coalesce(s.reviewed_at,f.created_at))>checked_at)))
    order by checked_at nulls first,id limit least(greatest(p_limit,1),20) for update skip locked)
  returning d.*;
$$;
revoke all on function public.claim_dictionary_family_dependencies(text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_dictionary_family_dependencies(text,integer,text) to service_role;

create view public.teaching_dictionary_family_recommendations with(security_invoker=true) as
select d.environment_key,d.base_form,d.base_kind,count(*)::int waiting_words,
  array_agg(distinct d.expected_meaning order by d.expected_meaning) meanings,
  (select w.id from public.canonical_teaching_dictionary_words w where w.normalised_word=d.base_form
    and w.dialect_code='en-GB' and w.row_status='active' limit 1) existing_word_id
from public.teaching_dictionary_family_dependencies d where d.status<>'ready' and not d.family_resolved
group by d.environment_key,d.base_form,d.base_kind;
revoke all on public.teaching_dictionary_family_recommendations from public,anon,authenticated;
grant select on public.teaching_dictionary_family_recommendations to service_role;
notify pgrst,'reload schema';
commit;
