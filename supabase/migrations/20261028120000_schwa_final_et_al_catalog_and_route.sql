-- Register final weak-vowel skills. Content and activation remain governed separately.
begin;
insert into public.micro_skill_catalog
  (mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,display_name,practice_route,is_active,is_assignable,allowed_template_keys,metadata)
values
  ('D4','D4_SCHWA','D4_SCHWA_FINAL','D4_SCHWA_FINAL_ET','Spell weak final -et instead of -it or -ut','word_practice',true,true,
   array['T01','T02','T03','T04','T05','T08','T09','T10','T11'],
   '{"seed_version":"schwa-final-et-al-v1","cluster_name":"Final schwa","developmental_foundation":"Unstressed vowel awareness","example_words":["basket","jacket","pocket","ticket"],"teaching_point":"The weak final vowel in lexical -et words is written e; check its sound in the chosen British recording."}'::jsonb),
  ('D4','D4_SCHWA','D4_SCHWA_FINAL','D4_SCHWA_FINAL_AL','Spell lexical final -al instead of -ul or -el','word_practice',true,true,
   array['T01','T02','T03','T04','T05','T08','T09','T10','T11'],
   '{"seed_version":"schwa-final-et-al-v1","cluster_name":"Final schwa","developmental_foundation":"Unstressed vowel awareness","example_words":["natural","actual","factual","ritual"],"teaching_point":"Keep the written a in -al, including when relatives retain -al before -ly."}'::jsonb)
on conflict (micro_skill_key) do update set
  display_name=excluded.display_name,skill_family_key=excluded.skill_family_key,
  skill_cluster_key=excluded.skill_cluster_key,practice_route=excluded.practice_route,
  is_active=true,is_assignable=true,allowed_template_keys=excluded.allowed_template_keys,
  metadata=excluded.metadata;
-- Retire the old key only after its resolver and word assignments are audited and moved.
update public.micro_skill_catalog set is_active=false,is_assignable=false
where micro_skill_key='D4_SCHWA_MEDIAL_NATURAL_ACTUAL'
  and not exists (
    select 1 from public.spelling_canonical_mappings
    where micro_skill_key='D4_SCHWA_MEDIAL_NATURAL_ACTUAL'
      and (mapping_status<>'disabled' or resolver_visibility_status<>'disabled')
  )
  and not exists (
    select 1 from public.adle_learning_items
    where micro_skill_key='D4_SCHWA_MEDIAL_NATURAL_ACTUAL'
  );

create or replace function public.publish_adle_weak_vowel_content_v1(
  p_content_version uuid,
  p_actor uuid,
  p_expected_source_fingerprint text,
  p_expected_word_audio_sha256 text,
  p_expected_sentence_audio_sha256 text
) returns uuid language plpgsql security definer
  set search_path=public,extensions,pg_temp as $$
declare
  c public.teaching_dictionary_route_content_versions%rowtype;
  v_facts jsonb;
  v_content_sha text;
  v_dictionary_sha text;
  v_word public.canonical_teaching_dictionary_words%rowtype;
begin
  if p_actor is null or p_expected_source_fingerprint !~ '^[a-f0-9]{64}$'
    or p_expected_word_audio_sha256 !~ '^[a-f0-9]{64}$'
    or p_expected_sentence_audio_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'WEAK_VOWEL_PUBLICATION_INPUT_INVALID';
  end if;
  select * into c from public.teaching_dictionary_route_content_versions
    where id=p_content_version for update;
  if c.id is null or c.route_id<>'weak_vowel_word_lab' or c.route_version<>'v1'
    or c.micro_skill_key not in (
      'D4_SCHWA_FINAL_A_FINAL','D4_SCHWA_FINAL_AR_FINAL','D4_SCHWA_FINAL_ER_FINAL',
      'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
      'D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS','D4_SCHWA_FINAL_AL','D4_SCHWA_FINAL_ET') then
    raise exception 'WEAK_VOWEL_CONTENT_VERSION_INVALID';
  end if;
  if exists(select 1 from public.teaching_dictionary_route_content_versions newer
    where newer.canonical_word_id=c.canonical_word_id and newer.route_id=c.route_id
      and newer.route_version=c.route_version and newer.micro_skill_key=c.micro_skill_key
      and (newer.published_at,newer.id)>(c.published_at,c.id)) then
    raise exception 'WEAK_VOWEL_CONTENT_STALE';
  end if;
  select * into v_word from public.canonical_teaching_dictionary_words
    where id=c.canonical_word_id for share;
  if v_word.id is null or v_word.row_status<>'active'
    or v_word.review_status<>'approved_for_first_exposure'
    or v_word.dialect_code<>'en-GB' then
    raise exception 'WEAK_VOWEL_WORD_NOT_APPROVED';
  end if;
  if exists(select 1 from public.teaching_dictionary_pair_latest_decisions decision
    where decision.canonical_word_id=c.canonical_word_id and decision.micro_skill_key=c.micro_skill_key
      and decision.environment_key='production' and decision.action='deassign') then
    raise exception 'WEAK_VOWEL_PAIR_DEASSIGNED';
  end if;
  v_facts:=c.content#>'{content,weakVowel}';
  if jsonb_typeof(v_facts)<>'object'
    or v_facts->>'schemaVersion'<>'weak_vowel_route_facts_v1'
    or v_facts->>'sourceFingerprint' is distinct from p_expected_source_fingerprint
    or v_facts#>>'{wordRecording,sha256}' is distinct from p_expected_word_audio_sha256
    or v_facts#>>'{sentenceRecording,sha256}' is distinct from p_expected_sentence_audio_sha256
    or v_facts#>>'{activityEligibility,dinner,status}'<>'ready'
    or v_facts#>>'{activityEligibility,detective,status}'<>'ready'
    or v_facts#>>'{activityEligibility,memoryLock,status}'<>'ready'
    or v_facts#>>'{activityEligibility,dictation,status}'<>'ready'
    or nullif(btrim(c.content->>'wordMeaning'),'') is null
    or nullif(btrim(v_facts->>'pronunciationId'),'') is null
    or coalesce(v_facts#>>'{wordRecording,src}','') not like '/audio/%'
    or coalesce(v_facts#>>'{sentenceRecording,src}','') not like '/audio/%' then
    raise exception 'WEAK_VOWEL_CONTENT_INCOMPLETE';
  end if;
  if c.content->>'routeId'<>'weak_vowel_word_lab'
    or c.content->>'routeVersion'<>'v1'
    or c.content->>'microSkillKey'<>c.micro_skill_key then
    raise exception 'WEAK_VOWEL_CONTENT_IDENTITY_MISMATCH';
  end if;
  if (select definition.definition from public.teaching_dictionary_definition_versions definition
      where definition.canonical_word_id=c.canonical_word_id and definition.route_id is null
      order by definition.published_at desc,definition.id desc limit 1)
      is distinct from c.content->>'wordMeaning' then
    raise exception 'WEAK_VOWEL_SHARED_DEFINITION_CHANGED';
  end if;
  v_dictionary_sha:=public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id);
  v_content_sha:=encode(extensions.digest(convert_to(c.content::text,'UTF8'),'sha256'),'hex');
  if not exists(select 1 from public.teaching_dictionary_route_content_reviews review
    where review.content_version_id=c.id and review.content_sha256=v_content_sha
      and review.dictionary_fingerprint=v_dictionary_sha) then
    raise exception 'WEAK_VOWEL_REVIEW_STALE';
  end if;
  insert into public.adle_weak_vowel_content_publications
    (content_version_id,canonical_word_id,micro_skill_key,source_fingerprint,
     content_sha256,dictionary_fingerprint,word_audio_sha256,sentence_audio_sha256,published_by)
  values (c.id,c.canonical_word_id,c.micro_skill_key,p_expected_source_fingerprint,
          v_content_sha,v_dictionary_sha,p_expected_word_audio_sha256,
          p_expected_sentence_audio_sha256,p_actor)
  on conflict (content_version_id) do nothing;
  if not exists(select 1 from public.adle_weak_vowel_content_publications p
    where p.content_version_id=c.id and p.source_fingerprint=p_expected_source_fingerprint
      and p.content_sha256=v_content_sha and p.dictionary_fingerprint=v_dictionary_sha
      and p.word_audio_sha256=p_expected_word_audio_sha256
      and p.sentence_audio_sha256=p_expected_sentence_audio_sha256) then
    raise exception 'WEAK_VOWEL_PUBLICATION_CONFLICT';
  end if;
  return c.id;
end $$;

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
    or jsonb_typeof(m->'microSkills') is distinct from 'array' or jsonb_array_length(m->'microSkills')<>9
    or (select count(distinct value->>'microSkillKey') from jsonb_array_elements(m->'microSkills'))<>9
    or jsonb_typeof(p_package->'authorities') is distinct from 'array' or jsonb_array_length(p_package->'authorities')<>9
    or (select count(distinct value#>>'{semanticProjection,microSkillKey}') from jsonb_array_elements(p_package->'authorities'))<>9
    then raise exception 'WEAK_VOWEL_PACKAGE_INVALID'; end if;
  for a in select value from jsonb_array_elements(p_package->'authorities') loop
    fp:=public.adle_generic_snapshot_json_sha256_v1(a->'semanticProjection');
    if a->>'semanticFingerprint'<>fp or a->>'schemaVersion'<>'1'
      or a->>'authorityType'<>'weak_vowel_lesson_content'
      or a#>>'{semanticProjection,schemaVersion}'<>'1'
      or coalesce(a#>>'{semanticProjection,microSkillKey}','') not in (
        'D4_SCHWA_FINAL_A_FINAL','D4_SCHWA_FINAL_AR_FINAL','D4_SCHWA_FINAL_ER_FINAL',
        'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
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
