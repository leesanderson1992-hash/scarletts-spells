begin;

-- The applied Base Word release is immutable. For the two reviewed pilot
-- words, permit a parallel canonical family only when the teaching analysis
-- is the same spelling decomposition and no other guarded dependency exists.
create or replace function public.teaching_dictionary_pilot_legacy_family_compatible(p_draft uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  m public.canonical_teaching_dictionary_base_word_family_members%rowtype;
  old_parts jsonb;
  new_parts jsonb;
begin
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft;
  if d.id is null or d.normalised_word not in ('readable','enjoyable')
    or d.source_reference !~ '^CSV batch [a-f0-9-]{36}, reviewed-14-word-pilot[.]csv, row [0-9]+$'
    or d.payload#>>'{canonicalMorphology,analysisStatus}' <> 'approved'
    or jsonb_typeof(d.payload#>'{canonicalMorphology,parts}') is distinct from 'array'
    or (select count(*) from public.canonical_teaching_dictionary_base_word_family_members x
      where x.canonical_word_id=d.canonical_word_id and x.row_status='active') <> 1
    then return false;
  end if;
  select * into m from public.canonical_teaching_dictionary_base_word_family_members x
    where x.canonical_word_id=d.canonical_word_id and x.row_status='active';
  if m.word_sum is distinct from d.payload#>>'{canonicalMorphology,wordSum}' then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',part.value->>'kind',
    'sourceText',part.value->>'sourceText','surfaceText',part.value->>'surfaceText')
    order by part.ordinality),'[]'::jsonb) into old_parts
    from jsonb_array_elements(m.morphology_parts) with ordinality part(value,ordinality);
  select coalesce(jsonb_agg(jsonb_build_object('kind',part.value->>'kind',
    'sourceText',part.value->>'sourceText','surfaceText',part.value->>'surfaceText')
    order by part.ordinality),'[]'::jsonb) into new_parts
    from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}')
      with ordinality part(value,ordinality);
  return old_parts=new_parts;
end $$;
revoke all on function public.teaching_dictionary_pilot_legacy_family_compatible(uuid)
  from public,anon,authenticated;
grant execute on function public.teaching_dictionary_pilot_legacy_family_compatible(uuid)
  to service_role;

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
    or (exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
      and not public.teaching_dictionary_pilot_legacy_family_compatible(d.id))
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

create or replace function public.publish_teaching_dictionary_reviewed_unrouted_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  v_draft_keys text[];
  v_live_keys text[];
  v_word uuid;
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_UNROUTED_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  if d.id is null or d.canonical_word_id is null then
    raise exception 'TEACHING_UNROUTED_EXISTING_WORD_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(d.payload->'routeContents','[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb)) <> 0 then
    raise exception 'TEACHING_UNROUTED_DEPENDENCIES_EXIST';
  end if;
  if not exists (select 1 from public.teaching_dictionary_overview_reviews r
    where r.draft_id=d.id and r.canonical_word_id=d.canonical_word_id
      and r.reviewed_by=p_actor
      and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and r.base_dictionary_fingerprint is not distinct from
        public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id)) then
    raise exception 'TEACHING_UNROUTED_REVIEW_STALE';
  end if;
  if exists(select 1 from public.canonical_teaching_dictionary_prefix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_suffix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or (exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
      and not public.teaching_dictionary_pilot_legacy_family_compatible(d.id))
    or exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_base_family_registry_members x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_facts x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.adle_learning_items x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where v.canonical_word_id=d.canonical_word_id) then
    raise exception 'TEACHING_UNROUTED_DEPENDENCIES_EXIST';
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[])
    into v_draft_keys from jsonb_array_elements_text(coalesce(d.payload->'skillKeys','[]'::jsonb)) value;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_live_keys
    from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=d.canonical_word_id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  if v_draft_keys is distinct from v_live_keys then
    raise exception 'TEACHING_UNROUTED_SKILL_SET_CHANGED';
  end if;
  perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
  v_word:=public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  return v_word;
end $$;

notify pgrst,'reload schema';
commit;
