begin;

alter table public.teaching_dictionary_lesson_launches
  add column previous_activation_revision_id uuid,
  add column published_activation_revision_id uuid,
  add column environment_key text;

-- Native package publishers remain the sole authority writers. This transaction
-- joins their reviewed inputs to the existing enabled route using its exact head.
create function public.launch_teaching_dictionary_governed_package_v1(
  p_route_id text,p_micro_skill_key text,p_versions uuid[],p_package jsonb,p_package_sha256 text,
  p_expected_revision uuid,p_environment text,p_preflight_fingerprint text,p_actor uuid,p_compiler_witnesses jsonb
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare h public.adle_route_activation_heads%rowtype; r public.adle_route_activation_revisions%rowtype;
  c public.teaching_dictionary_route_content_versions%rowtype; d public.teaching_dictionary_manager_drafts%rowtype;
  a jsonb; v_release uuid; v_sha text; v_revision uuid; v_launch uuid; v_before jsonb:='[]'::jsonb;
begin
  if p_package_sha256 is distinct from public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256') then raise exception 'TEACHING_LESSON_PACKAGE_HASH_MISMATCH'; end if;
  if p_actor is null or p_versions is null or p_expected_revision is null or p_environment is null or p_preflight_fingerprint is null or p_package_sha256 is null or p_environment not in ('local','staging','production')
    or cardinality(p_versions)<1 or cardinality(p_versions)>30 or p_preflight_fingerprint !~ '^[a-f0-9]{64}$'
    or p_package_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'TEACHING_LESSON_PREFLIGHT_REQUIRED'; end if;
  if (select count(*) from public.teaching_dictionary_route_content_versions where id=any(p_versions))<>cardinality(p_versions) then raise exception 'TEACHING_LESSON_CONTENT_MISSING'; end if;
  if exists(select 1 from public.teaching_dictionary_route_content_publications where content_version_id=any(p_versions))
    then raise exception 'TEACHING_LESSON_ALREADY_RELEASED'; end if;
  select * into h from public.adle_route_activation_heads where environment_key=p_environment
    and route_id=p_route_id and micro_skill_key=p_micro_skill_key for update;
  if h.current_revision_id is distinct from p_expected_revision then raise exception 'TEACHING_LESSON_ACTIVATION_CHANGED'; end if;
  select * into r from public.adle_route_activation_revisions where id=h.current_revision_id;
  if r.id is null or r.activation_status<>'enabled' then raise exception 'TEACHING_LESSON_ROUTE_INACTIVE'; end if;
  if p_package#>>'{manifest,route,routeId}' is distinct from p_route_id
    or not exists(select 1 from jsonb_array_elements(p_package#>'{manifest,microSkills}') skill where skill->>'microSkillKey'=p_micro_skill_key)
    then raise exception 'TEACHING_LESSON_PACKAGE_ROUTE_MISMATCH'; end if;
  for c in select * from public.teaching_dictionary_route_content_versions where id=any(p_versions) order by canonical_word_id for update loop
    if c.route_id<>p_route_id or c.micro_skill_key<>p_micro_skill_key then raise exception 'TEACHING_LESSON_CONTENT_MISMATCH'; end if;
    select * into d from public.teaching_dictionary_manager_drafts where id=c.draft_id;
    if not exists(select 1 from public.teaching_dictionary_route_content_reviews review where review.content_version_id=c.id
      and review.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
      and review.content_sha256=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex'))
      then raise exception 'TEACHING_ROUTE_REVIEW_STALE'; end if;
    if not exists(select 1 from public.teaching_dictionary_overview_reviews review where review.draft_id=d.id
      and review.content_fingerprint=public.teaching_dictionary_overview_fingerprint(d.payload)
      and (review.base_dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
        or exists(select 1 from public.teaching_dictionary_manager_publications where draft_id=d.id)))
      then raise exception 'TEACHING_OVERVIEW_REVIEW_STALE'; end if;
    if exists(select 1 from public.teaching_dictionary_route_content_versions newer where newer.canonical_word_id=c.canonical_word_id
      and newer.route_id=c.route_id and newer.micro_skill_key=c.micro_skill_key and (newer.published_at,newer.id)>(c.published_at,c.id))
      then raise exception 'TEACHING_LESSON_CONTENT_STALE'; end if;
    if not p_package#>'{manifest,approvalRefs}' @> jsonb_build_array('admin-review:'||c.id::text)
      then raise exception 'TEACHING_LESSON_PACKAGE_REVIEW_MISSING'; end if;
    if not exists(select 1 from public.teaching_dictionary_manager_publications where draft_id=d.id) and (
      exists(select 1 from public.canonical_teaching_dictionary_prefix_members m join public.canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id
        where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active')
      or exists(select 1 from public.canonical_teaching_dictionary_suffix_members m join public.canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id
        where m.canonical_word_id=c.canonical_word_id and m.row_status='active' and p.row_status='active'))
      then raise exception 'TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED'; end if;
    if d.payload->>'displayWord' is distinct from (select display_word from public.canonical_teaching_dictionary_words where id=c.canonical_word_id)
      then raise exception 'TEACHING_SHARED_DISPLAY_REQUIRES_ALL_ROUTE_RELEASES'; end if;
    v_before:=v_before||jsonb_build_array(jsonb_build_object('word',(select to_jsonb(w) from public.canonical_teaching_dictionary_words w where id=c.canonical_word_id),
      'metadataId',(select id from public.canonical_teaching_dictionary_word_metadata where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'morphologyId',(select id from public.canonical_teaching_dictionary_word_morphology where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'dictationId',(select id from public.canonical_teaching_dictionary_dictation_sentences where canonical_word_id=c.canonical_word_id and row_status='active' order by created_at desc limit 1),
      'definition',(select definition from public.teaching_dictionary_definition_versions where canonical_word_id=c.canonical_word_id and route_id is null order by published_at desc limit 1),
      'dictationSetId',(select set_id from public.teaching_dictionary_dictation_heads where canonical_word_id=c.canonical_word_id)));
    perform set_config('app.teaching_dictionary_release_draft',d.id::text,true);
    perform public.publish_teaching_dictionary_manager_draft(d.id,p_actor);
  end loop;
  perform public.assert_teaching_dictionary_compiler_witnesses(p_compiler_witnesses,array(
    select distinct (word->>'canonicalWordId')::uuid from jsonb_array_elements(p_package->'authorities') package_authority(value)
      cross join lateral jsonb_array_elements(case package_authority.value->>'authorityType'
        when 'ing_word_members' then package_authority.value#>'{semanticProjection,words}'
        when 'homophone_lesson_content' then package_authority.value#>'{semanticProjection,canonicalWords}'
        when 'adjective_degree_families' then (select jsonb_agg(w) from jsonb_array_elements(package_authority.value#>'{semanticProjection,families}') f cross join lateral jsonb_array_elements(f->'words') w)
        when 'family_membership' then (select jsonb_agg(m) from jsonb_array_elements(package_authority.value#>'{semanticProjection,families}') f cross join lateral jsonb_array_elements(f->'members') m where m->>'assignmentEligible'='true')
        when 'compound_structure' then (select jsonb_agg(jsonb_build_object('canonicalWordId',m->>'wholeCanonicalWordId')) from jsonb_array_elements(package_authority.value#>'{semanticProjection,structures}') m)
        else '[]'::jsonb end) word
      where package_authority.value#>>'{semanticProjection,microSkillKey}' is null or package_authority.value#>>'{semanticProjection,microSkillKey}'=p_micro_skill_key));
  if p_route_id in ('base_word_lab','compound_word_lab') then
    for a in select value from jsonb_array_elements(p_package->'authorities') loop
      if a->>'changed'='true' then
        if a->>'authorityType'='family_membership' then
          perform public.publish_teaching_dictionary_base_family_authority_v2((a->>'parentAuthorityId')::uuid,a->'manifest',p_package_sha256,p_actor::text);
        elsif a->>'authorityType'='compound_structure' then
          perform public.publish_adle_compound_word_structure_authority_v1(a->'manifest',p_package_sha256,p_actor::text);
        elsif a->>'authorityType'='teaching_dictionary_closure' then
          perform public.publish_teaching_dictionary_reviewed_closure_v1((a->>'parentAuthorityId')::uuid,a->'manifest',a->'sourceBindings',p_package_sha256,p_actor);
        else raise exception 'TEACHING_LESSON_AUTHORITY_UNSUPPORTED'; end if;
      end if;
    end loop;
    v_release:=public.publish_adle_curriculum_release_v2(p_package->'manifest',p_package_sha256,p_actor::text);
  elsif p_route_id='ing_endings_word_lab' then
    v_release:=public.publish_adle_ing_package_v1(p_package,p_package_sha256,p_actor::text);
  elsif p_route_id='comparative_superlative_word_lab' then
    v_release:=public.publish_adle_comparative_package_v1(p_package,p_package_sha256,p_actor::text);
  elsif p_route_id='homophone_word_lab' then
    v_release:=public.publish_adle_homophone_package_v2(p_package,p_package_sha256,p_actor::text);
  else raise exception 'TEACHING_LESSON_NATIVE_PACKAGE_REQUIRED'; end if;
  select release_manifest_sha256 into v_sha from public.adle_curriculum_release_manifests where id=v_release;
  v_revision:=public.set_adle_route_activation_revision_v2(v_sha,p_micro_skill_key,p_environment,'enabled','allow_existing',
    jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true),
    r.id,p_actor::text,'Reviewed Teaching Dictionary lesson replacement');
  insert into public.teaching_dictionary_route_content_publications(content_version_id,route_profile_id,published_by)
    select id,v_release,p_actor from public.teaching_dictionary_route_content_versions where id=any(p_versions);
  insert into public.teaching_dictionary_lesson_launches(route_id,micro_skill_key,content_version_ids,preflight_fingerprint,
    previous_profile_id,published_profile_id,dictionary_before,published_by,compiler_witnesses,previous_activation_revision_id,published_activation_revision_id,environment_key)
    values(p_route_id,p_micro_skill_key,p_versions,p_preflight_fingerprint,r.release_manifest_id,v_release,v_before,p_actor,p_compiler_witnesses,r.id,v_revision,p_environment)
    returning id into v_launch;
  return v_launch;
end $$;
revoke all on function public.launch_teaching_dictionary_governed_package_v1(text,text,uuid[],jsonb,text,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.launch_teaching_dictionary_governed_package_v1(text,text,uuid[],jsonb,text,uuid,text,text,uuid,jsonb) to service_role;
create or replace function public.rollback_teaching_dictionary_launch_v2(p_launch uuid,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.teaching_dictionary_lesson_launches%rowtype; v_content uuid; v_before jsonb; v_word public.canonical_teaching_dictionary_words%rowtype; v_previous public.adle_curriculum_release_manifests%rowtype; v_current uuid;
begin
  select * into l from public.teaching_dictionary_lesson_launches where id=p_launch for update;
  if l.id is null or p_actor is null or length(btrim(p_reason))<8 then raise exception 'TEACHING_LESSON_ROLLBACK_INVALID'; end if;
  if exists(select 1 from public.teaching_dictionary_lesson_launch_rollbacks where launch_id=l.id) then raise exception 'TEACHING_LESSON_ALREADY_ROLLED_BACK'; end if;
  if l.published_activation_revision_id is not null then
    select current_revision_id into v_current from public.adle_route_activation_heads where route_id=l.route_id
      and micro_skill_key=l.micro_skill_key and environment_key=l.environment_key for update;
    if v_current is distinct from l.published_activation_revision_id then raise exception 'TEACHING_LESSON_ROLLBACK_NOT_CURRENT'; end if;
    select * into strict v_previous from public.adle_curriculum_release_manifests where id=l.previous_profile_id;
    perform public.set_adle_route_activation_revision_v2(v_previous.release_manifest_sha256,l.micro_skill_key,l.environment_key,'enabled','allow_existing',
      jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),'emergencyDisableAvailable',true),
      v_current,p_actor::text,p_reason);
    insert into public.teaching_dictionary_route_content_rollbacks(content_version_id,route_profile_id,previous_profile_id,reason,rolled_back_by)
      select unnest(l.content_version_ids),l.published_profile_id,l.previous_profile_id,p_reason,p_actor;
  else
  foreach v_content in array (select array_agg(id order by ord desc) from unnest(l.content_version_ids) with ordinality v(id,ord)) loop
    if l.route_id='dynamic_prefix_word_lab' then perform public.rollback_teaching_dictionary_prefix_content(v_content,p_actor,p_reason);
    else perform public.rollback_teaching_dictionary_suffix_content(v_content,p_actor,p_reason); end if;
  end loop;
  end if;
  for v_before in select value from jsonb_array_elements(l.dictionary_before) loop
    v_word:=jsonb_populate_record(null::public.canonical_teaching_dictionary_words,v_before->'word');
    -- Refuse to undo a later dictionary release made after this lesson.
    if exists(select 1 from public.teaching_dictionary_manager_publications p join public.teaching_dictionary_manager_drafts d on d.id=p.draft_id
      where p.canonical_word_id=v_word.id and p.published_at>l.published_at) then raise exception 'TEACHING_DICTIONARY_ROLLBACK_NOT_CURRENT'; end if;
    update public.canonical_teaching_dictionary_words set display_word=v_word.display_word,frequency_band=v_word.frequency_band,age_band=v_word.age_band,
      complexity_band=v_word.complexity_band,source_row_hash=v_word.source_row_hash,source_category=v_word.source_category,source_name=v_word.source_name,
      source_url=v_word.source_url,source_licence=v_word.source_licence,source_use_note=v_word.source_use_note,confidence=v_word.confidence,updated_at=v_word.updated_at where id=v_word.id;
    update public.canonical_teaching_dictionary_word_metadata set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_metadata set row_status='active' where id=(v_before->>'metadataId')::uuid;
    update public.canonical_teaching_dictionary_word_morphology set row_status='retired' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_word_morphology set row_status='active' where id=(v_before->>'morphologyId')::uuid;
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='superseded' where canonical_word_id=v_word.id and row_status='active';
    update public.canonical_teaching_dictionary_dictation_sentences set row_status='active' where id=(v_before->>'dictationId')::uuid;
    insert into public.teaching_dictionary_definition_versions(canonical_word_id,definition,is_withdrawn,draft_id)
      values(v_word.id,coalesce(v_before->>'definition',''),nullif(v_before->>'definition','') is null,(select draft_id from public.teaching_dictionary_route_content_versions where id=l.content_version_ids[1]));
    delete from public.teaching_dictionary_dictation_heads where canonical_word_id=v_word.id;
    if v_before->>'dictationSetId' is not null then insert into public.teaching_dictionary_dictation_heads values(v_word.id,(v_before->>'dictationSetId')::uuid); end if;
  end loop;
  insert into public.teaching_dictionary_lesson_launch_rollbacks(launch_id,reason,rolled_back_by) values(l.id,p_reason,p_actor);
end $$;

notify pgrst, 'reload schema';
commit;
