begin;

-- A reviewed CSV may replace one existing bound-root member, its immutable
-- family revision, root entry and word-skill choices as one transaction.
create function public.publish_teaching_dictionary_reviewed_bound_root_draft(
  p_draft uuid,p_actor uuid,p_environment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  d public.teaching_dictionary_manager_drafts%rowtype;
  f public.canonical_teaching_dictionary_lexical_base_families%rowtype;
  root_review jsonb;
  root_meaning text;
  v_word uuid;
  v_morphology uuid;
  v_desired text[];
  v_live text[];
  v_skill text;
  v_candidate jsonb;
  v_package uuid;
  v_actual text[];
begin
  if p_actor is null or p_environment not in ('staging','production') then
    raise exception 'TEACHING_ROOT_IMPORT_REVIEW_REQUIRED';
  end if;
  select * into d from public.teaching_dictionary_manager_drafts where id=p_draft for update;
  root_review:=d.payload->'rootFamilyReview';
  if d.id is null or d.canonical_word_id is null
    or d.source_reference !~ '^CSV batch [a-f0-9-]{36},'
    or jsonb_typeof(root_review) is distinct from 'object'
    or jsonb_typeof(d.payload->'skillKeys') is distinct from 'array'
    or jsonb_typeof(coalesce(d.payload->'routeContents','[]'::jsonb)) is distinct from 'array'
    or jsonb_array_length(coalesce(d.payload->'routeContents','[]'::jsonb))<>0
    or exists(select 1 from public.teaching_dictionary_manager_publications p where p.draft_id=d.id) then
    raise exception 'TEACHING_ROOT_IMPORT_DRAFT_INVALID';
  end if;
  if not exists(select 1 from public.teaching_dictionary_overview_reviews r
    where r.draft_id=d.id and r.canonical_word_id=d.canonical_word_id
      and r.reviewed_by=p_actor
      and r.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and r.base_dictionary_fingerprint is not distinct from
        public.teaching_dictionary_route_dictionary_fingerprint(d.canonical_word_id))
    or not exists(select 1 from public.teaching_dictionary_import_skill_reviews r
      where r.draft_id=d.id and r.reviewed_by=p_actor and r.source_reference=d.source_reference
        and r.skill_fingerprint=public.adle_generic_snapshot_json_sha256_v1(d.payload->'skillKeys')) then
    raise exception 'TEACHING_ROOT_IMPORT_REVIEW_STALE';
  end if;
  if (select count(*) from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
    where part->>'kind'='root')<>1 then
    raise exception 'TEACHING_ROOT_IMPORT_PART_INVALID';
  end if;
  select part->>'gloss' into root_meaning
    from jsonb_array_elements(d.payload#>'{canonicalMorphology,parts}') part
    where part->>'kind'='root';
  select * into f from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=root_review->>'familyKey' order by revision desc limit 1 for update;
  if f.family_key is null or f.base_kind<>'bound_root' or f.review_status<>'approved'
    or not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_family_members m
      where m.family_key=f.family_key and m.revision=f.revision
        and m.canonical_word_id=d.canonical_word_id)
    or (select count(distinct m.family_key) from public.canonical_teaching_dictionary_lexical_base_family_members m
      where m.canonical_word_id=d.canonical_word_id)<>1 then
    raise exception 'TEACHING_ROOT_IMPORT_FAMILY_INVALID';
  end if;
  -- This path does not alter an active lesson, another morphology profile or
  -- learner item. Those require the coordinated route release workflow.
  if exists(select 1 from public.canonical_teaching_dictionary_prefix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_suffix_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.canonical_teaching_dictionary_compound_structures_v2 x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_compound_facts x where x.canonical_word_id=d.canonical_word_id)
    or exists(select 1 from public.canonical_teaching_dictionary_word_support x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.adle_learning_items x where x.canonical_word_id=d.canonical_word_id and x.row_status='active')
    or exists(select 1 from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_publications p on p.content_version_id=v.id
      where v.canonical_word_id=d.canonical_word_id) then
    raise exception 'TEACHING_ROOT_IMPORT_DEPENDENCIES_EXIST';
  end if;
  select coalesce(array_agg(distinct value order by value),'{}'::text[])
    into v_desired from jsonb_array_elements_text(d.payload->'skillKeys') value;
  if cardinality(v_desired)<>jsonb_array_length(d.payload->'skillKeys')
    or exists(select 1 from unnest(v_desired) key
      where not exists(select 1 from public.micro_skill_catalog c
        where c.micro_skill_key=key and c.is_active and c.is_assignable)) then
    raise exception 'TEACHING_ROOT_IMPORT_SKILLS_INVALID';
  end if;
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_live from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=d.canonical_word_id
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
  v_word:=public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  select id into v_morphology from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=v_word and row_status='active'
      and analysis_status='approved' and review_status='approved_for_first_exposure'
    order by created_at desc,id desc limit 1;
  if v_morphology is null then raise exception 'TEACHING_ROOT_IMPORT_MORPHOLOGY_MISSING'; end if;
  perform public.review_existing_bound_root_member_revision(
    f.family_key,f.revision,v_word,v_morphology,root_meaning,
    root_review->>'rootDefinition',root_review->>'originLanguage',
    root_review->>'pronunciationApplicability',
    nullif(root_review->>'pronunciationIpa',''),d.source_reference,p_actor::text,
    'Reviewed Teaching Dictionary CSV: '||d.source_reference);
  foreach v_skill in array v_live loop
    if v_skill=any(v_desired) then continue; end if;
    perform public.withdraw_teaching_dictionary_manager_skill_pair(
      p_environment,v_skill,v_word,p_actor);
  end loop;
  foreach v_skill in array v_desired loop
    if v_skill=any(v_live) then continue; end if;
    if exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
      where x.environment_key=p_environment and x.canonical_word_id=v_word
        and x.micro_skill_key=v_skill and x.action='deassign') then
      insert into public.teaching_dictionary_pair_decision_events
        (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
      values(p_environment,v_skill,v_word,'restore',p_actor,d.id);
    end if;
    if not exists(select 1 from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where p.canonical_word_id=v_word and p.micro_skill_key=v_skill
        and r.environment_key=p_environment
        and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals w where w.release_id=r.id)) then
      v_candidate:=jsonb_build_object('canonicalWordId',v_word,
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
  select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
    into v_actual from public.adle_reviewed_word_skill_pairs p
    join public.adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key=p_environment
    where p.canonical_word_id=v_word
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)
      and not exists(select 1 from public.teaching_dictionary_pair_latest_decisions x
        where x.environment_key=p_environment and x.canonical_word_id=p.canonical_word_id
          and x.micro_skill_key=p.micro_skill_key and x.action='deassign');
  if v_actual is distinct from v_desired then
    raise exception 'TEACHING_ROOT_IMPORT_SKILL_SET_CHANGED';
  end if;
  return v_word;
end $$;

revoke all on function public.publish_teaching_dictionary_reviewed_bound_root_draft(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.publish_teaching_dictionary_reviewed_bound_root_draft(uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
