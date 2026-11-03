begin;

-- Import skill choices are reviewed separately from Overview facts. The
-- Overview fingerprint intentionally omits skillKeys, so an import needs its
-- own immutable receipt before changing effective word-skill authority.
create table if not exists public.teaching_dictionary_import_skill_reviews (
  draft_id uuid primary key references public.teaching_dictionary_manager_drafts(id),
  skill_fingerprint text not null,
  reviewed_by uuid not null references auth.users(id),
  source_reference text not null,
  reviewed_at timestamptz not null default now()
);
alter table public.teaching_dictionary_import_skill_reviews enable row level security;
revoke all on public.teaching_dictionary_import_skill_reviews from public,anon,authenticated;
grant select on public.teaching_dictionary_import_skill_reviews to service_role;

create or replace function public.review_teaching_dictionary_import_skills(p_draft uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.teaching_dictionary_manager_drafts%rowtype;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or p_actor is null or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or jsonb_typeof(d.payload->'skillKeys') is distinct from 'array' then
    raise exception 'TEACHING_IMPORT_SKILL_REVIEW_REQUIRED';
  end if;
  insert into public.teaching_dictionary_import_skill_reviews
    (draft_id,skill_fingerprint,reviewed_by,source_reference)
  values(d.id,public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys'),p_actor,d.source_reference)
  on conflict(draft_id) do nothing;
  if not exists(select 1 from public.teaching_dictionary_import_skill_reviews r
    where r.draft_id=d.id and r.reviewed_by=p_actor and r.source_reference=d.source_reference
      and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_IMPORT_SKILL_REVIEW_STALE';
  end if;
end $$;
revoke all on function public.review_teaching_dictionary_import_skills(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.review_teaching_dictionary_import_skills(uuid,uuid) to service_role;

-- All withdrawals, new reviewed releases, and the Overview publication share
-- this transaction. An error rolls back the complete word update.
create or replace function public.publish_teaching_dictionary_reviewed_reconciled_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_desired text[];
  v_live text[];
  v_skill text;
  v_candidate jsonb;
  v_package uuid;
  v_word uuid;
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_RECONCILED_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null
    or jsonb_typeof(d.payload->'skillKeys') is distinct from 'array' then
    raise exception 'TEACHING_RECONCILED_DRAFT_INVALID';
  end if;
  if not exists(select 1 from public.teaching_dictionary_import_skill_reviews r
    where r.draft_id=d.id and r.reviewed_by=p_actor and r.source_reference=d.source_reference
      and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_RECONCILED_SKILL_REVIEW_REQUIRED';
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[])
    into v_desired from jsonb_array_elements_text(d.payload->'skillKeys') value;
  if cardinality(v_desired)<>jsonb_array_length(d.payload->'skillKeys')
    or exists(select 1 from unnest(v_desired) key
      where not exists(select 1 from public.micro_skill_catalog c
        where c.micro_skill_key=key and c.is_active and c.is_assignable)) then
    raise exception 'TEACHING_RECONCILED_SKILLS_INVALID';
  end if;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_live from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=d.canonical_word_id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  -- The guarded unrouted path must reject family, route, and learner dependants
  -- before a skill release is changed. This preflight has the same scope.
  if jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb))<>0
    or exists(select 1 from public.canonical_teaching_dictionary_prefix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_suffix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_base_family_registry_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_facts x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.adle_learning_items x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where v.canonical_word_id=d.canonical_word_id) then
    if v_desired is distinct from v_live then
      raise exception 'TEACHING_RECONCILED_GOVERNED_SKILL_CHANGE';
    end if;
    raise exception 'TEACHING_RECONCILED_DEPENDENCIES_EXIST';
  end if;
  foreach v_skill in array v_live loop
    if v_skill=any(v_desired) then continue; end if;
    perform public.withdraw_teaching_dictionary_manager_skill_pair(
      p_environment,v_skill,d.canonical_word_id,p_actor);
  end loop;
  foreach v_skill in array v_desired loop
    if v_skill=any(v_live) then continue; end if;
    if exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
      where x.environment_key=p_environment and x.canonical_word_id=d.canonical_word_id
        and x.micro_skill_key=v_skill and x.action='deassign') then
      insert into public.teaching_dictionary_pair_decision_events
        (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
      values(p_environment,v_skill,d.canonical_word_id,'restore',p_actor,d.id);
    end if;
    if not exists(select 1 from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where p.canonical_word_id=d.canonical_word_id and p.micro_skill_key=v_skill
        and r.environment_key=p_environment
        and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals w where w.release_id=r.id)) then
      v_candidate:=jsonb_build_object('canonicalWordId',d.canonical_word_id,
        'microSkillKey',v_skill,'relationshipRole','demonstrates',
        'method','deterministic_candidate',
        'sourceReference','Reviewed Teaching Dictionary CSV: '||d.source_reference,
        'licenceReference','internal_authored');
      v_package:=public.create_word_skill_candidate_package(
        'tdm:'||d.id::text||':'||md5(v_skill),p_environment,jsonb_build_array(v_candidate),p_actor);
      perform public.review_word_skill_candidate_package_with_metrics(
        v_package,p_environment,'["approved"]'::jsonb,'[""]'::jsonb,p_actor,
        'Approved in reviewed Teaching Dictionary CSV import',null);
      perform public.publish_word_skill_candidate_package(v_package,p_environment,p_actor,
        public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys'));
    end if;
  end loop;
  v_word:=public.publish_teaching_dictionary_reviewed_unrouted_draft(d.id,p_actor,p_environment);
  return v_word;
end $$;
revoke all on function public.publish_teaching_dictionary_reviewed_reconciled_draft(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_reconciled_draft(uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
