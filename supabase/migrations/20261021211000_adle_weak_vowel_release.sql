-- Inactive weak-vowel lesson-template release. Word publications are independent
-- so future approved assignments can join without replacing this release.
begin;
alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_type_check;
alter table public.adle_curriculum_dependency_authorities
  add constraint adle_curriculum_dependency_authorities_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families',
    'ing_word_members','teaching_content','teaching_dictionary_closure',
    'homophone_lesson_content','weak_vowel_lesson_content'));
alter table public.adle_curriculum_release_dependencies
  drop constraint adle_curriculum_release_dependencies_type_check;
alter table public.adle_curriculum_release_dependencies
  add constraint adle_curriculum_release_dependencies_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families',
    'ing_word_members','teaching_content','teaching_dictionary_closure',
    'homophone_lesson_content','weak_vowel_lesson_content'));
create or replace function public.set_adle_route_activation_revision_v2(
  p_release_manifest_sha256 text,
  p_micro_skill_key text,
  p_environment_key text,
  p_activation_status text,
  p_incomplete_assignment_policy text,
  p_readiness_report jsonb,
  p_expected_current_revision_id uuid,
  p_changed_by text,
  p_change_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.adle_curriculum_release_manifests%rowtype;
  v_current_revision_id uuid;
  v_current public.adle_route_activation_revisions%rowtype;
  v_revision_id uuid;
begin
  if p_environment_key not in ('local', 'staging', 'production')
     or p_activation_status not in ('enabled', 'paused', 'safety_revoked')
     or (p_activation_status in ('enabled', 'paused') and p_incomplete_assignment_policy <> 'allow_existing')
     or (p_activation_status = 'safety_revoked' and p_incomplete_assignment_policy <> 'block_incomplete')
     or jsonb_typeof(p_readiness_report) <> 'object'
     or (p_activation_status = 'enabled' and p_readiness_report = '{}'::jsonb)
     or nullif(btrim(p_changed_by), '') is null
     or nullif(btrim(p_change_reason), '') is null then
    raise exception 'invalid ADLE activation revision';
  end if;
  select * into v_release from public.adle_curriculum_release_manifests
  where release_manifest_sha256 = p_release_manifest_sha256;
  if not found then raise exception 'ADLE curriculum release is unavailable'; end if;
  if not exists (
    select 1 from public.adle_curriculum_release_dependencies
    where release_manifest_id = v_release.id and micro_skill_key = p_micro_skill_key
    group by release_manifest_id, micro_skill_key
    having count(*) = case when (v_release.route_id = 'homophone_word_lab' and v_release.route_version = 'v2')
      or (v_release.route_id = 'weak_vowel_word_lab' and v_release.route_version = 'v1')
      then 1 else 3 end
  ) then raise exception 'ADLE curriculum release does not bind the requested micro-skill'; end if;
  if exists (
    select 1 from public.adle_curriculum_release_dependencies dependency
    left join public.adle_curriculum_dependency_authorities authority
      on authority.id = dependency.authority_id
     and authority.authority_type = dependency.authority_type
     and authority.authority_key = dependency.authority_key
     and authority.schema_version = dependency.authority_schema_version
     and authority.semantic_fingerprint = dependency.semantic_fingerprint
    where dependency.release_manifest_id = v_release.id
      and dependency.micro_skill_key = p_micro_skill_key
      and authority.id is null
  ) then raise exception 'ADLE curriculum release dependency authority is unavailable or mismatched'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_environment_key || ':' || v_release.route_id || ':' || v_release.route_version || ':' || p_micro_skill_key,
    0
  ));
  select current_revision_id into v_current_revision_id
  from public.adle_route_activation_heads
  where environment_key = p_environment_key
    and route_id = v_release.route_id
    and route_version = v_release.route_version
    and micro_skill_key = p_micro_skill_key
  for update;
  if v_current_revision_id is distinct from p_expected_current_revision_id then
    raise exception 'ADLE activation revision compare-and-swap failed';
  end if;
  if v_current_revision_id is not null then
    select * into strict v_current from public.adle_route_activation_revisions
    where id = v_current_revision_id;
    if v_current.release_manifest_id = v_release.id
       and v_current.activation_status = p_activation_status
       and v_current.incomplete_assignment_policy = p_incomplete_assignment_policy
       and v_current.readiness_report = p_readiness_report then
      return v_current.id;
    end if;
  end if;

  insert into public.adle_route_activation_revisions (
    environment_key, release_manifest_id, release_manifest_sha256,
    dependency_fingerprint, route_id, route_version, activation_route_key,
    micro_skill_key, activation_status, incomplete_assignment_policy,
    readiness_report, previous_revision_id, change_reason, changed_by
  ) values (
    p_environment_key, v_release.id, v_release.release_manifest_sha256,
    v_release.dependency_fingerprint, v_release.route_id, v_release.route_version,
    v_release.activation_route_key, p_micro_skill_key, p_activation_status,
    p_incomplete_assignment_policy, p_readiness_report, v_current_revision_id,
    p_change_reason, p_changed_by
  ) returning id into v_revision_id;
  insert into public.adle_route_activation_heads (
    environment_key, route_id, route_version, micro_skill_key,
    current_revision_id, updated_at
  ) values (
    p_environment_key, v_release.route_id, v_release.route_version,
    p_micro_skill_key, v_revision_id, timezone('utc', now())
  ) on conflict (environment_key, route_id, route_version, micro_skill_key)
  do update set current_revision_id = excluded.current_revision_id,
                updated_at = excluded.updated_at;
  return v_revision_id;
end;
$$;
create function public.publish_adle_weak_vowel_package_v1(
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
    or jsonb_typeof(m->'microSkills') is distinct from 'array' or jsonb_array_length(m->'microSkills')<>8
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>8
    or jsonb_typeof(p_package->'authorities') is distinct from 'array' or jsonb_array_length(p_package->'authorities')<>8
    or (select count(distinct value#>>'{semanticProjection,microSkillKey}') from jsonb_array_elements(p_package->'authorities'))<>8
    then raise exception 'WEAK_VOWEL_PACKAGE_INVALID'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1'
      or a->>'authorityType'<>'weak_vowel_lesson_content'
      or a#>>'{semanticProjection,schemaVersion}'<>'1'
      or coalesce(a#>>'{semanticProjection,microSkillKey}','') not in (
        'D4_SCHWA_FINAL_A_FINAL','D4_SCHWA_FINAL_AR_FINAL','D4_SCHWA_FINAL_ER_FINAL',
        'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
        'D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS','D4_SCHWA_MEDIAL_NATURAL_ACTUAL')
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

revoke all on function public.publish_adle_weak_vowel_package_v1(jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_adle_weak_vowel_package_v1(jsonb,text,text)
  to service_role;
commit;
