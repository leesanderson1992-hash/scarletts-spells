begin;

create or replace function public.publish_adle_weak_vowel_package_v1(
  p_package jsonb,p_package_file_sha256 text,p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; s jsonb; d jsonb; aid uuid; rid uuid; fp text; sha text;
begin
  if jsonb_typeof(p_package) is distinct from 'object'
    or p_package->>'schemaVersion'<>'1' or p_package->>'activation'<>'inactive'
    or nullif(btrim(p_published_by),'') is null or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
    or public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256')<>p_package->>'packageSha256'
    or m#>>'{route,routeId}'<>'weak_vowel_word_lab' or m#>>'{route,routeVersion}'<>'v1'
    or m#>>'{route,activationRouteKey}'<>'weak_vowel_word_lab:v1' or m#>>'{route,payloadVersion}'<>'1'
    or jsonb_typeof(m->'approvalRefs') is distinct from 'array' or jsonb_array_length(m->'approvalRefs')<1
    or jsonb_typeof(m->'microSkills') is distinct from 'array' or jsonb_array_length(m->'microSkills') not in (9,10)
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>jsonb_array_length(m->'microSkills')
    or jsonb_typeof(p_package->'authorities') is distinct from 'array' or jsonb_array_length(p_package->'authorities')<>jsonb_array_length(m->'microSkills')
    or (select count(distinct value#>>'{semanticProjection,microSkillKey}') from jsonb_array_elements(p_package->'authorities'))<>jsonb_array_length(m->'microSkills')
    then raise exception 'WEAK_VOWEL_PACKAGE_INVALID'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1'
      or a->>'authorityType'<>'weak_vowel_lesson_content'
      or a#>>'{semanticProjection,schemaVersion}'<>'1'
      or coalesce(a#>>'{semanticProjection,microSkillKey}','') not in (
        'D4_SCHWA_FINAL_A_FINAL','D4_SCHWA_FINAL_AR_FINAL','D4_SCHWA_FINAL_ER_FINAL',
        'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_A_INITIAL',
        'D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
        'D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS','D4_SCHWA_FINAL_AL','D4_SCHWA_FINAL_ET')
      or a#>>'{semanticProjection,teachingTemplateSha256}' is distinct from
        public.adle_generic_snapshot_json_sha256_v1(a#>'{semanticProjection,teachingTemplate}')
      or jsonb_array_length(a#>'{semanticProjection,teachingTemplate,pages}')<>3
      or a#>'{semanticProjection,teachingTemplate,meetWords,words}'<>'[]'::jsonb
      then raise exception 'WEAK_VOWEL_TEACHING_AUTHORITY_INVALID'; end if;
    insert into public.adle_curriculum_dependency_authorities
      (authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,
       authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,
       source_provenance,approval_refs,published_by)
    values(a->>'authorityKey','weak_vowel_lesson_content',1,'mixed_governed_sources',
      p_package_file_sha256,a,public.adle_canonical_json_sha256_v1(a),
      a->'semanticProjection',fp,jsonb_build_object('packageSha256',p_package->>'packageSha256'),
      m->'approvalRefs',p_published_by)
    on conflict(authority_type,authority_key) do nothing returning id into aid;
    if aid is null then
      select id into aid from public.adle_curriculum_dependency_authorities
        where authority_key=a->>'authorityKey' and authority_type='weak_vowel_lesson_content'
          and semantic_projection=a->'semanticProjection' and manifest_file_sha256=p_package_file_sha256;
      if aid is null then raise exception 'WEAK_VOWEL_IMMUTABLE_AUTHORITY_CONFLICT'; end if;
    end if;
    aid:=null;
  end loop;
  sha:=public.adle_canonical_json_sha256_v1(m);
  fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
  insert into public.adle_curriculum_release_manifests
    (release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,
     dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,
    'weak_vowel_word_lab','v1','weak_vowel_word_lab:v1',1,m->'approvalRefs',p_published_by)
  on conflict(release_key) do nothing returning id into rid;
  if rid is null then
    select id into rid from public.adle_curriculum_release_manifests
      where release_key=m->>'releaseKey' and manifest_payload=m and manifest_file_sha256=p_package_file_sha256;
    if rid is null then raise exception 'WEAK_VOWEL_IMMUTABLE_RELEASE_CONFLICT'; end if;
    return rid;
  end if;
  for s in select value from jsonb_array_elements(m->'microSkills') loop
    if jsonb_array_length(s->'dependencies')<>1
      or s#>>'{dependencies,0,authorityType}'<>'weak_vowel_lesson_content'
      then raise exception 'WEAK_VOWEL_EXACT_DEPENDENCY_REQUIRED'; end if;
    d:=s->'dependencies'->0;
    select id into strict aid from public.adle_curriculum_dependency_authorities
      where authority_type='weak_vowel_lesson_content' and authority_key=d->>'authorityKey'
        and schema_version=1 and semantic_fingerprint=d->>'semanticFingerprint'
        and semantic_projection->>'microSkillKey'=s->>'microSkillKey';
    insert into public.adle_curriculum_release_dependencies
      (release_manifest_id,micro_skill_key,authority_type,authority_key,
       authority_schema_version,semantic_fingerprint,authority_id)
    values(rid,s->>'microSkillKey','weak_vowel_lesson_content',d->>'authorityKey',1,
      d->>'semanticFingerprint',aid);
  end loop;
  return rid;
end $$;

commit;
