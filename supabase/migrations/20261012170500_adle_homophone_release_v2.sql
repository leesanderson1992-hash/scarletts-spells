-- Publication creates immutable, inactive release authorities. Activation is
-- a separate revision per micro-skill and child scope.
begin;

create or replace function public.publish_adle_homophone_package_v2(p_package jsonb,p_package_file_sha256 text,p_published_by text)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; s jsonb; d jsonb; w jsonb; aid uuid; rid uuid; fp text; sha text;
begin
  if jsonb_typeof(p_package) is distinct from 'object' or p_package->>'schemaVersion'<>'1' or p_package->>'activation'<>'inactive'
    or nullif(btrim(p_published_by),'') is null or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
    or public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256')<>p_package->>'packageSha256'
    or m#>>'{route,routeId}'<>'homophone_word_lab' or m#>>'{route,routeVersion}'<>'v2'
    or m#>>'{route,activationRouteKey}'<>'homophone_word_lab:v2' or m#>>'{route,payloadVersion}'<>'2'
    or jsonb_typeof(m->'approvalRefs') is distinct from 'array' or jsonb_array_length(m->'approvalRefs')<1
    or jsonb_typeof(m->'microSkills') is distinct from 'array' or jsonb_array_length(m->'microSkills')<>14
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>14
    or jsonb_typeof(p_package->'authorities') is distinct from 'array' or jsonb_array_length(p_package->'authorities')<>14
    or (select count(distinct value#>>'{semanticProjection,microSkillKey}') from jsonb_array_elements(p_package->'authorities'))<>14
    or public.adle_generic_snapshot_json_sha256_v1((select jsonb_agg(value#>'{semanticProjection,lesson}' order by ordinality)
      from jsonb_array_elements(p_package->'authorities') with ordinality))<>'b425ccf1f9a3bf013015749e10203837687cc099888b20e6dc0bc40b2be0a92a'
    then raise exception 'homophone package invalid'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1' or a->>'authorityType'<>'homophone_lesson_content'
      or a#>>'{semanticProjection,contentVersion}'<>'d4-hom-v4'
      or a#>>'{semanticProjection,contentSha256}'<>'b425ccf1f9a3bf013015749e10203837687cc099888b20e6dc0bc40b2be0a92a'
      or a#>>'{semanticProjection,imageAssetManifestSha256}'<>'8ec7efa7b8494d9f89130d8ba4d1fffe932610aa946264c750032722b8e18737'
      or a#>>'{semanticProjection,microSkillKey}' is distinct from a#>>'{semanticProjection,lesson,microSkillKey}'
      or jsonb_array_length(a#>'{semanticProjection,canonicalWords}')<>jsonb_array_length(a#>'{semanticProjection,lesson,words}')
      then raise exception 'homophone authority invalid'; end if;
    for w in select value from jsonb_array_elements(a#>'{semanticProjection,canonicalWords}') loop
      if not exists(select 1 from jsonb_array_elements(a#>'{semanticProjection,lesson,words}') word where word.value->>'word'=w->>'word')
        or not exists(select 1 from public.canonical_teaching_dictionary_words d where d.id=(w->>'canonicalWordId')::uuid
          and d.display_word=w->>'word' and d.dialect_code='en-GB' and d.row_status='active' and d.review_status='approved_for_first_exposure')
        then raise exception 'homophone authority canonical word invalid'; end if;
    end loop;
    insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
    values(a->>'authorityKey','homophone_lesson_content',1,'mixed_governed_sources',p_package_file_sha256,a,public.adle_canonical_json_sha256_v1(a),a->'semanticProjection',fp,
      jsonb_build_object('packageSha256',p_package->>'packageSha256'),m->'approvalRefs',p_published_by)
    on conflict(authority_type,authority_key) do nothing returning id into aid;
    if aid is null then
      select id into aid from public.adle_curriculum_dependency_authorities where authority_key=a->>'authorityKey'
        and authority_type='homophone_lesson_content' and semantic_projection=a->'semanticProjection' and manifest_file_sha256=p_package_file_sha256;
      if aid is null then raise exception 'homophone immutable authority conflict'; end if;
    end if;
    aid:=null;
  end loop;
  sha:=public.adle_canonical_json_sha256_v1(m); fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
  insert into public.adle_curriculum_release_manifests(release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,'homophone_word_lab','v2','homophone_word_lab:v2',2,m->'approvalRefs',p_published_by)
  on conflict(release_key) do nothing returning id into rid;
  if rid is null then
    select id into rid from public.adle_curriculum_release_manifests where release_key=m->>'releaseKey' and manifest_payload=m and manifest_file_sha256=p_package_file_sha256;
    if rid is null then raise exception 'homophone immutable release conflict'; end if;
    return rid;
  end if;
  for s in select value from jsonb_array_elements(m->'microSkills') loop
    if jsonb_array_length(s->'dependencies')<>1 or s#>>'{dependencies,0,authorityType}'<>'homophone_lesson_content'
      then raise exception 'homophone exact dependency required'; end if;
    d:=s->'dependencies'->0;
    select id into strict aid from public.adle_curriculum_dependency_authorities where authority_type='homophone_lesson_content'
      and authority_key=d->>'authorityKey' and schema_version=1 and semantic_fingerprint=d->>'semanticFingerprint'
      and semantic_projection->>'microSkillKey'=s->>'microSkillKey';
    insert into public.adle_curriculum_release_dependencies(release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id)
    values(rid,s->>'microSkillKey','homophone_lesson_content',d->>'authorityKey',1,d->>'semanticFingerprint',aid);
  end loop;
  return rid;
end $$;

revoke all on function public.publish_adle_homophone_package_v2(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.publish_adle_homophone_package_v2(jsonb,text,text) to service_role;
commit;
