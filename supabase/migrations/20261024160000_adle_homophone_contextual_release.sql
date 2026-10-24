-- The approved contextual lessons are published inactive. A separate activation
-- revision is required for each microskill after its live assignment path passes.
begin;

alter table public.adle_curriculum_dependency_authorities
  drop constraint adle_curriculum_dependency_authorities_type_check;
alter table public.adle_curriculum_dependency_authorities
  add constraint adle_curriculum_dependency_authorities_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families',
    'ing_word_members','teaching_content','teaching_dictionary_closure',
    'homophone_lesson_content','weak_vowel_lesson_content','homophone_contextual_content'));
alter table public.adle_curriculum_release_dependencies
  drop constraint adle_curriculum_release_dependencies_type_check;
alter table public.adle_curriculum_release_dependencies
  add constraint adle_curriculum_release_dependencies_type_check
  check (authority_type in ('family_membership','compound_structure','adjective_degree_families',
    'ing_word_members','teaching_content','teaching_dictionary_closure',
    'homophone_lesson_content','weak_vowel_lesson_content','homophone_contextual_content'));

create function public.publish_adle_homophone_contextual_package_v1(
  p_package jsonb,p_package_file_sha256 text,p_published_by text
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; s jsonb; d jsonb; c jsonb; q jsonb;
  member jsonb; live_set public.homophone_contrast_sets%rowtype; aid uuid; rid uuid;
  fp text; sha text; question_count integer:=0;
begin
  if jsonb_typeof(p_package) is distinct from 'object' or p_package->>'schemaVersion'<>'1'
    or p_package->>'activation'<>'inactive' or nullif(btrim(p_published_by),'') is null
    or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
    or public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256')<>p_package->>'packageSha256'
    or m#>>'{route,routeId}'<>'homophone_contextual_choice'
    or m#>>'{route,routeVersion}'<>'v1'
    or m#>>'{route,activationRouteKey}'<>'homophone_contextual_choice:v1'
    or m#>>'{route,payloadVersion}'<>'1'
    or jsonb_typeof(m->'approvalRefs') is distinct from 'array'
    or jsonb_array_length(m->'approvalRefs')<1
    or jsonb_typeof(m->'microSkills') is distinct from 'array'
    or jsonb_array_length(m->'microSkills')<>58
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>58
    or jsonb_typeof(p_package->'authorities') is distinct from 'array'
    or jsonb_array_length(p_package->'authorities')<>58
    or (select count(distinct value#>>'{semanticProjection,microSkillKey}')
        from jsonb_array_elements(p_package->'authorities'))<>58
  then raise exception 'homophone contextual package invalid'; end if;

  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    c:=a#>'{semanticProjection,content}';
    if a->>'authorityType'<>'homophone_contextual_content' or a->>'schemaVersion'<>'1'
      or a->>'semanticFingerprint'<>fp
      or a#>>'{semanticProjection,microSkillKey}' is distinct from c->>'microSkillKey'
      or a#>>'{semanticProjection,contentVersion}' is distinct from c->>'contentVersion'
      or c->>'reviewStatus'<>'approved' or nullif(c->>'approvalReference','') is null
      or jsonb_typeof(c->'sets') is distinct from 'array'
      or jsonb_array_length(c->'sets') not between 1 and 12
      or jsonb_typeof(c->'questions') is distinct from 'array'
      or jsonb_array_length(c->'questions')<2
      or not exists(select 1 from jsonb_array_elements(m->'microSkills') x
        where x.value->>'microSkillKey'=c->>'microSkillKey'
          and x.value#>>'{dependencies,0,authorityKey}'=a->>'authorityKey'
          and x.value#>>'{dependencies,0,semanticFingerprint}'=fp)
    then raise exception 'homophone contextual authority invalid: %',a->>'authorityKey'; end if;

    for s in select value from jsonb_array_elements(c->'sets') loop
      select * into live_set from public.homophone_contrast_sets x
        where x.set_key=s->>'setKey' and x.revision=(s->>'revision')::integer
          and x.micro_skill_key=c->>'microSkillKey' and x.review_status='approved'
          and x.semantic_fingerprint=s->>'semanticFingerprint'
          and x.relation_kind=s->>'relationKind';
      if not found or s->>'setId'<>live_set.set_key||'@'||live_set.revision::text
        or jsonb_array_length(s->'members') not between 2 and 3
        or jsonb_array_length(s->'members')<>(select count(*) from public.homophone_contrast_set_members x
          where x.set_key=live_set.set_key and x.revision=live_set.revision)
      then raise exception 'homophone contextual set invalid: %',s->>'setKey'; end if;
      for member in select value from jsonb_array_elements(s->'members') loop
        if not exists(select 1 from public.homophone_contrast_set_members x
          join public.canonical_teaching_dictionary_words w on w.id=x.canonical_word_id
          where x.set_key=live_set.set_key and x.revision=live_set.revision
            and x.canonical_word_id=(member->>'canonicalWordId')::uuid
            and x.intended_sense=member->>'intendedSense'
            and x.grammatical_role=member->>'grammaticalRole'
            and x.target_sentence=member->>'teachingSentence'
            and replace(w.normalised_word,'’','''')=member->>'word'
            and w.row_status='active' and w.review_status='approved_for_first_exposure'
            and w.dialect_code='en-GB')
        then raise exception 'homophone contextual member invalid: %',member->>'word'; end if;
      end loop;
    end loop;
    for q in select value from jsonb_array_elements(c->'questions') loop
      if q->>'evidenceMode'<>'independent_sentence'
        or (select count(*) from regexp_matches(q->>'sentenceWithBlank','____','g'))<>1
        or not exists(select 1 from jsonb_array_elements(c->'sets') x
          where x.value->>'setId'=q->>'setId'
            and exists(select 1 from jsonb_array_elements(x.value->'members') w
              where w.value->>'canonicalWordId'=q->>'correctWordId')
            and (select jsonb_agg(w.value->>'canonicalWordId' order by w.ordinality)
              from jsonb_array_elements(x.value->'members') with ordinality w)
              =(select jsonb_agg(o.value#>>'{}' order by o.ordinality)
                from jsonb_array_elements(q->'optionWordIds') with ordinality o))
      then raise exception 'homophone contextual question invalid: %',q->>'questionId'; end if;
      question_count:=question_count+1;
    end loop;
    insert into public.adle_curriculum_dependency_authorities(
      authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,
      authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,
      source_provenance,approval_refs,published_by)
    values(a->>'authorityKey','homophone_contextual_content',1,'mixed_governed_sources',p_package_file_sha256,
      a,public.adle_canonical_json_sha256_v1(a),a->'semanticProjection',fp,
      jsonb_build_object('packageSha256',p_package->>'packageSha256'),m->'approvalRefs',p_published_by)
    on conflict(authority_type,authority_key) do nothing returning id into aid;
    if aid is null and not exists(select 1 from public.adle_curriculum_dependency_authorities x
      where x.authority_key=a->>'authorityKey' and x.authority_type='homophone_contextual_content'
        and x.semantic_projection=a->'semanticProjection' and x.manifest_file_sha256=p_package_file_sha256)
    then raise exception 'homophone contextual immutable authority conflict'; end if;
    aid:=null;
  end loop;
  if question_count<>152 then raise exception 'homophone contextual question scope invalid'; end if;
  sha:=public.adle_canonical_json_sha256_v1(m);
  fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
  insert into public.adle_curriculum_release_manifests(
    release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,
    dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,
    'homophone_contextual_choice','v1','homophone_contextual_choice:v1',1,m->'approvalRefs',p_published_by)
  on conflict(release_key) do nothing returning id into rid;
  if rid is null then
    select id into rid from public.adle_curriculum_release_manifests x
      where x.release_key=m->>'releaseKey' and x.manifest_payload=m
        and x.manifest_file_sha256=p_package_file_sha256;
    if rid is null then raise exception 'homophone contextual immutable release conflict'; end if;
    return rid;
  end if;
  for s in select value from jsonb_array_elements(m->'microSkills') loop
    if jsonb_array_length(s->'dependencies')<>1
      or s#>>'{dependencies,0,authorityType}'<>'homophone_contextual_content'
      or s#>>'{dependencies,0,authoritySchemaVersion}'<>'1'
    then raise exception 'homophone contextual exact dependency required'; end if;
    d:=s->'dependencies'->0;
    select id into strict aid from public.adle_curriculum_dependency_authorities x
      where x.authority_type='homophone_contextual_content'
        and x.authority_key=d->>'authorityKey' and x.schema_version=1
        and x.semantic_fingerprint=d->>'semanticFingerprint'
        and x.semantic_projection->>'microSkillKey'=s->>'microSkillKey';
    insert into public.adle_curriculum_release_dependencies(
      release_manifest_id,micro_skill_key,authority_type,authority_key,
      authority_schema_version,semantic_fingerprint,authority_id)
    values(rid,s->>'microSkillKey','homophone_contextual_content',d->>'authorityKey',1,
      d->>'semanticFingerprint',aid);
  end loop;
  return rid;
end $$;

revoke all on function public.publish_adle_homophone_contextual_package_v1(jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_adle_homophone_contextual_package_v1(jsonb,text,text)
  to service_role;
commit;
