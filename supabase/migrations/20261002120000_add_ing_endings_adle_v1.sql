-- Additive and inactive: no content or learner state is changed by this migration.
begin;

alter table public.adle_curriculum_dependency_authorities drop constraint adle_curriculum_dependency_authorities_type_check;
alter table public.adle_curriculum_dependency_authorities add constraint adle_curriculum_dependency_authorities_type_check
  check(authority_type in ('family_membership','compound_structure','adjective_degree_families','ing_word_members','teaching_content','teaching_dictionary_closure'));
alter table public.adle_curriculum_release_dependencies drop constraint adle_curriculum_release_dependencies_type_check;
alter table public.adle_curriculum_release_dependencies add constraint adle_curriculum_release_dependencies_type_check
  check(authority_type in ('family_membership','compound_structure','adjective_degree_families','ing_word_members','teaching_content','teaching_dictionary_closure'));

create or replace function public.adle_ing_word_valid_v1(w jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare rule text; base text:=w->>'base'; spelling text:=w->>'word'; expected text;
begin
  rule:=case w->>'microSkillKey' when 'D4_INF_ING_ENDINGS_REGULAR' then 'regular'
    when 'D4_INF_ING_ENDINGS_DROP_E' then 'drop_e'
    when 'D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT' then 'double_final_consonant'
    when 'D4_INF_ING_ENDINGS_IE_TO_Y' then 'ie_to_y' end;
  if rule is null or coalesce(base,'')!~'^[a-z]+$' or coalesce(spelling,'')!~'^[a-z]+$'
    or coalesce(w->>'canonicalWordId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or w->>'rowStatus' is distinct from 'active' or w->>'reviewStatus' is distinct from 'approved_for_first_exposure'
    or nullif(btrim(w->>'reviewerRef'),'') is null or nullif(btrim(w->>'approvalRef'),'') is null
    or nullif(btrim(w->>'meaning'),'') is null or nullif(btrim(w->>'dictationSentence'),'') is null
    or w->>'audioText' is distinct from w->>'dictationSentence'
    or jsonb_typeof(w->'sourceRefs') is distinct from 'array' or jsonb_array_length(w->'sourceRefs')<1
    or exists(select 1 from jsonb_array_elements(w->'sourceRefs') ref where jsonb_typeof(ref.value)<>'string' or nullif(btrim(ref.value#>>'{}'),'') is null)
    then return false; end if;
  if rule='drop_e' and (right(base,1)<>'e' or right(base,2)='ie') then return false; end if;
  if rule='ie_to_y' and right(base,2)<>'ie' then return false; end if;
  if rule='double_final_consonant' and (char_length(base)>4 or char_length(regexp_replace(base,'[^aeiou]','','g'))<>1 or base!~'[aeiou][b-df-hj-np-tv-z]$') then return false; end if;
  expected:=case rule when 'drop_e' then left(base,-1)||'ing' when 'ie_to_y' then left(base,-2)||'ying'
    when 'double_final_consonant' then base||right(base,1)||'ing' else base||'ing' end;
  if spelling<>expected or (select count(*) from regexp_matches(lower(w->>'dictationSentence'),'\m'||spelling||'\M','g'))<>1 then return false; end if;
  return true;
exception when others then return false;
end $$;

create or replace function public.publish_adle_ing_package_v1(p_package jsonb,p_package_file_sha256 text,p_published_by text)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; s jsonb; d jsonb; w jsonb; aid uuid; rid uuid; fp text; sha text;
begin
  if jsonb_typeof(p_package) is distinct from 'object' or p_package->>'schemaVersion'<>'1' or p_package->>'activation'<>'inactive'
    or nullif(btrim(p_published_by),'') is null or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
    or public.adle_generic_snapshot_json_sha256_v1(p_package-'packageSha256')<>p_package->>'packageSha256'
    or m#>>'{route,routeId}'<>'ing_endings_word_lab' or m#>>'{route,routeVersion}'<>'v1'
    or m#>>'{route,activationRouteKey}'<>'ing_endings_word_lab:v1' or m#>>'{route,payloadVersion}'<>'1'
    or jsonb_typeof(m->'approvalRefs') is distinct from 'array' or jsonb_array_length(m->'approvalRefs')<1
    or jsonb_typeof(m->'microSkills') is distinct from 'array' or jsonb_array_length(m->'microSkills')<>4
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>4
    or jsonb_typeof(p_package->'authorities') is distinct from 'array' or jsonb_array_length(p_package->'authorities')<>12
    or (select count(distinct (value->>'authorityType',value#>>'{semanticProjection,microSkillKey}')) from jsonb_array_elements(p_package->'authorities'))<>12
    then raise exception 'ing package invalid'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1' or a->>'authorityType' not in ('ing_word_members','teaching_content','teaching_dictionary_closure') then raise exception 'ing dependency invalid'; end if;
    if a->>'authorityType'='ing_word_members' then
      if jsonb_typeof(a#>'{semanticProjection,words}') is distinct from 'array' or jsonb_array_length(a#>'{semanticProjection,words}')<6
        or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(a#>'{semanticProjection,words}'))<>jsonb_array_length(a#>'{semanticProjection,words}')
        or (select count(distinct value->>'word') from jsonb_array_elements(a#>'{semanticProjection,words}'))<>jsonb_array_length(a#>'{semanticProjection,words}') then raise exception 'ing approved pool incomplete'; end if;
      for w in select value from jsonb_array_elements(a#>'{semanticProjection,words}') loop
        if not public.adle_ing_word_valid_v1(w) or w->>'microSkillKey'<>a#>>'{semanticProjection,microSkillKey}'
          or not exists(select 1 from public.canonical_teaching_dictionary_words where id=(w->>'canonicalWordId')::uuid and display_word=w->>'word' and dialect_code='en-GB' and row_status='active' and review_status='approved_for_first_exposure')
          then raise exception 'ing word not approved in canonical dictionary'; end if;
      end loop;
    end if;
    insert into public.adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
    values(a->>'authorityKey',a->>'authorityType',1,'mixed_governed_sources',p_package_file_sha256,a,public.adle_canonical_json_sha256_v1(a),a->'semanticProjection',fp,jsonb_build_object('packageSha256',p_package->>'packageSha256'),m->'approvalRefs',p_published_by)
    on conflict(authority_type,authority_key) do nothing returning id into aid;
    if aid is null then select id into aid from public.adle_curriculum_dependency_authorities where authority_key=a->>'authorityKey' and authority_type=a->>'authorityType' and semantic_projection=a->'semanticProjection' and manifest_file_sha256=p_package_file_sha256; if aid is null then raise exception 'ing immutable authority conflict'; end if; end if;
    aid:=null;
  end loop;
  for a in select value from jsonb_array_elements(p_package->'authorities') where value->>'authorityType'='ing_word_members' loop
    select value->'semanticProjection' into strict d from jsonb_array_elements(p_package->'authorities') where value->>'authorityType'='teaching_dictionary_closure' and value#>>'{semanticProjection,microSkillKey}'=a#>>'{semanticProjection,microSkillKey}';
    if d->>'capability'<>'single_ing_word_audio' or d->'words' is distinct from
      (select jsonb_agg(jsonb_build_object('canonicalWordId',w.value->>'canonicalWordId','word',w.value->>'word','sentence',w.value->>'dictationSentence','audioText',w.value->>'audioText') order by w.ordinality)
       from jsonb_array_elements(a#>'{semanticProjection,words}') with ordinality w) then raise exception 'ing audio closure mismatch'; end if;
  end loop;
  sha:=public.adle_canonical_json_sha256_v1(m); fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
  insert into public.adle_curriculum_release_manifests(release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,'ing_endings_word_lab','v1','ing_endings_word_lab:v1',1,m->'approvalRefs',p_published_by)
  on conflict(release_key) do nothing returning id into rid;
  if rid is null then select id into rid from public.adle_curriculum_release_manifests where release_key=m->>'releaseKey' and manifest_payload=m and manifest_file_sha256=p_package_file_sha256; if rid is null then raise exception 'ing immutable release conflict'; end if; return rid; end if;
  for s in select value from jsonb_array_elements(m->'microSkills') loop
    if s->>'microSkillKey' not in ('D4_INF_ING_ENDINGS_REGULAR','D4_INF_ING_ENDINGS_DROP_E','D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT','D4_INF_ING_ENDINGS_IE_TO_Y')
      or (select array_agg(value->>'authorityType' order by ordinality) from jsonb_array_elements(s->'dependencies') with ordinality)<>array['ing_word_members','teaching_content','teaching_dictionary_closure'] then raise exception 'ing exact dependencies required'; end if;
    for d in select value from jsonb_array_elements(s->'dependencies') loop
      select id into strict aid from public.adle_curriculum_dependency_authorities where authority_type=d->>'authorityType' and authority_key=d->>'authorityKey' and schema_version=1 and semantic_fingerprint=d->>'semanticFingerprint' and semantic_projection->>'microSkillKey'=s->>'microSkillKey';
      insert into public.adle_curriculum_release_dependencies(release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id)
      values(rid,s->>'microSkillKey',d->>'authorityType',d->>'authorityKey',1,d->>'semanticFingerprint',aid);
    end loop;
  end loop;
  return rid;
end $$;

create or replace function public.adle_ing_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; a jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(l->'words') is distinct from 'array'
    or jsonb_typeof(l->'queuedTargets') is distinct from 'array' or jsonb_typeof(p->'activities') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(l->'queuedTargets');
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'ing_endings_word_lab' or p#>>'{route,routeVersion}'<>'v1'
    or p#>>'{payload,kind}'<>'ing_endings_lesson_v1' or p#>>'{payload,version}'<>'1' or p#>>'{runtime,adapterKey}'<>'ing_endings_v1'
    or p#>>'{runtime,rendererKey}'<>'ing_endings_guided' or l->>'authority'<>'reviewed_content' or l->>'routeKey'<>'ing_endings_word_lab:v1'
    or p#>>'{taxonomy,microSkillKey}'<>l->>'microSkillKey' or n not between 1 and 6 or (p#>>'{assignment,itemCount}')::integer<>19+n
    or jsonb_array_length(l->'words')<>6 or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'words'))<>6
    or (select count(distinct value->>'word') from jsonb_array_elements(l->'words'))<>6
    or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'queuedTargets'))<>n
    or exists(select 1 from jsonb_array_elements(l->'words') w where not public.adle_ing_word_valid_v1(w.value) or w.value->>'microSkillKey'<>l->>'microSkillKey')
    or exists(select 1 from jsonb_array_elements(l->'queuedTargets') t where not exists(select 1 from jsonb_array_elements(l->'words') w where w.value->>'canonicalWordId'=t.value->>'canonicalWordId' and w.value->>'learningItemId'=t.value->>'learningItemId'))
    or exists(select 1 from jsonb_array_elements(l->'words') w where (w.value->>'learningItemId' is not null) <> exists(select 1 from jsonb_array_elements(l->'queuedTargets') t where t.value->>'canonicalWordId'=w.value->>'canonicalWordId' and t.value->>'learningItemId'=w.value->>'learningItemId'))
    or jsonb_array_length(p->'contentVersions')<>7
    or public.adle_generic_snapshot_json_sha256_v1(p#-'{provenance,sourceFingerprint}')<>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',a#>>'{canonical,contractVersion}') not in
      ('INTRODUCTION.teaching_page@1','MEANING_MATCH.word_to_definition@1','SCRABBLE.ing_tiles@1','CLEAVER.ing_transform_target@1','COVER_CHECK.whole_word@1','DICTATION.single_word_gap@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
  end loop;
  return (select count(*)=19+n and count(*)=count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
exception when others then return false;
end $$;

create or replace function public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select case p_snapshot->>'snapshotSchemaVersion' when '3' then case p_snapshot#>>'{route,routeId}'
  when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'comparative_superlative_word_lab' then public.adle_comparative_snapshot_valid_v3(p_snapshot)
  when 'ing_endings_word_lab' then public.adle_ing_snapshot_valid_v3(p_snapshot)
  else false end else false end $$;

commit;
