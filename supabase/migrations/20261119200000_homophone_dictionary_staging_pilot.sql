begin;
-- Deliberately limited to the named staging pilot. No production activation or
-- legacy contrast authority is changed by this publisher.
create or replace function public.publish_homophone_dictionary_staging_v1(
  p_content jsonb, p_expected_head uuid, p_actor uuid
) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare skill text := p_content->>'microSkillKey'; fact jsonb; s jsonb; member jsonb;
  word_id uuid; sense jsonb; pronunciation jsonb; binding record; morph record;
  previous_id uuid; rid uuid; aid uuid; revision_id uuid; projection jsonb; manifest jsonb;
  content_hash text; projection_hash text; manifest_hash text; dependency_hash text;
  key text; akey text; fact_ids uuid[] := '{}'; expected_ids uuid[]; dictionary_sense_set jsonb;
begin
  if skill is distinct from 'D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT'
    or p_content->>'reviewStatus' is distinct from 'approved'
    or p_actor is null or not exists(select 1 from auth.users where id=p_actor)
    or jsonb_typeof(p_content->'dictionaryFacts') is distinct from 'array'
    or jsonb_array_length(p_content->'dictionaryFacts')<>2
    or jsonb_array_length(p_content->'sets')<>1
    or jsonb_array_length(p_content->'questions')<2
  then raise exception 'homophone Dictionary staging pilot input invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('staging:homophone_contextual_choice:v1:'||skill,0));
  select current_revision_id into previous_id from adle_route_activation_heads
    where environment_key='staging' and route_id='homophone_contextual_choice'
      and route_version='v1' and micro_skill_key=skill for update;
  -- A deterministic release key makes retries safe; stale previews cannot
  -- replace a newer release with another content revision.
  content_hash:=adle_homophone_contextual_json_sha256_v1(p_content);
  key:='homophone-dictionary-staging:'||skill||':'||content_hash;
  if exists(select 1 from adle_route_activation_revisions r join adle_curriculum_release_manifests m
      on m.id=r.release_manifest_id where r.id=previous_id and m.release_key=key and r.activation_status='enabled')
    then return previous_id; end if;
  if previous_id is distinct from p_expected_head then
    raise exception 'The lesson changed. Refresh the publish preview.';
  end if;
  for fact in select value from jsonb_array_elements(p_content->'dictionaryFacts') loop
    word_id:=(fact->>'wordId')::uuid;
    if word_id=any(fact_ids) then raise exception 'Duplicate Dictionary word'; end if;
    fact_ids:=array_append(fact_ids,word_id);
    perform 1 from canonical_teaching_dictionary_words where id=word_id and row_status='active'
      and review_status='approved_for_first_exposure' and dialect_code='en-GB' for share;
    if not found then raise exception 'Dictionary word is not approved'; end if;
    select sense_set into strict dictionary_sense_set from teaching_dictionary_reviewed_sense_sets
      where canonical_word_id=word_id for share;
    select value into strict sense from jsonb_array_elements(dictionary_sense_set->'senses')
      where value->>'id'=fact->>'senseId';
    select value into strict pronunciation from jsonb_array_elements(dictionary_sense_set->'pronunciations')
      where value->>'id'=sense->>'pronunciationId';
    select * into strict binding from teaching_dictionary_effective_lesson_sense_bindings
      where environment_key='staging' and canonical_word_id=word_id and micro_skill_key=skill;
    select * into strict morph from teaching_dictionary_current_sense_morphology
      where canonical_word_id=word_id and sense_id=fact->>'senseId';
    if sense is distinct from fact->'sense' or pronunciation is distinct from fact->'pronunciation'
      or binding.sense_id<>fact->>'senseId' or binding.sense_snapshot is distinct from sense
      or binding.pronunciation_snapshot is distinct from pronunciation
      or morph.morphology_parts is distinct from fact->'parts'
      or morph.morphology_joins is distinct from fact->'joins'
      or morph.morphology_transformations is distinct from fact->'transformations'
      or morph.word_sum is distinct from fact->>'wordSum'
      or nullif(pronunciation->>'ipa','') is null
      or jsonb_array_length(morph.morphology_parts)<1
      or not exists(select 1 from teaching_dictionary_reviewed_sense_sentences sentence
        where sentence.id=(fact->>'dictationAuthorityId')::uuid and sentence.canonical_word_id=word_id
          and sentence.sense_id=fact->>'senseId' and sentence.sentence=sense->>'dictationSentence'
          and sentence.target_token_index=(sense->>'dictationTargetTokenIndex')::integer
          and sentence.source_row_hash=fact->>'dictationSourceHash')
    then raise exception 'Approved Dictionary facts changed. Recheck the workbook.'; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_content->'sets') loop
    if not exists(select 1 from homophone_contrast_sets x where x.set_key=s->>'setKey'
      and x.revision=(s->>'revision')::integer and x.micro_skill_key=skill and x.review_status='approved'
      and x.semantic_fingerprint=s->>'semanticFingerprint'
      and s->>'setId'=x.set_key||'@'||x.revision::text
      and x.revision=(select max(revision) from homophone_contrast_sets where set_key=x.set_key))
    then raise exception 'Reviewed contrast set changed'; end if;
    select array_agg(canonical_word_id order by canonical_word_id) into expected_ids
      from homophone_contrast_set_members where set_key=s->>'setKey' and revision=(s->>'revision')::integer;
    if expected_ids is distinct from (select array_agg(id order by id) from unnest(fact_ids) id)
      or jsonb_array_length(s->'members')<>cardinality(expected_ids)
    then raise exception 'Complete contrast membership is required'; end if;
    for member in select value from jsonb_array_elements(s->'members') loop
      select value into strict fact from jsonb_array_elements(p_content->'dictionaryFacts')
        where value->>'wordId'=member->>'canonicalWordId';
      if member->>'intendedSense' is distinct from fact#>>'{sense,definition}'
        or member->>'teachingSentence' is distinct from fact#>>'{sense,dictationSentence}'
        or member->>'grammaticalRole' is distinct from fact#>>'{sense,partOfSpeech}'
        or not exists(select 1 from canonical_teaching_dictionary_words where id=(member->>'canonicalWordId')::uuid
          and normalised_word=member->>'word')
      then raise exception 'Lesson facts must match approved Dictionary facts'; end if;
    end loop;
  end loop;
  projection:=jsonb_build_object('schemaVersion',1,'microSkillKey',skill,'contentVersion',p_content->>'contentVersion',
    'dictionarySource','teaching_dictionary_v1','content',p_content);
  projection_hash:=adle_homophone_contextual_json_sha256_v1(projection);
  akey:=key||':content';
  insert into adle_curriculum_dependency_authorities(authority_key,authority_type,schema_version,
    source_classification,manifest_file_sha256,authority_manifest,authority_manifest_sha256,
    semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
  values(akey,'homophone_contextual_content',1,'mixed_governed_sources',content_hash,projection,
    adle_canonical_json_sha256_v1(projection),projection,projection_hash,
    jsonb_build_object('source','Teaching Dictionary workbook'),jsonb_build_array(p_actor::text),p_actor::text)
  on conflict(authority_type,authority_key) do nothing;
  select id into strict aid from adle_curriculum_dependency_authorities where authority_type='homophone_contextual_content' and authority_key=akey;
  manifest:=jsonb_build_object('schemaVersion',2,'releaseKey',key,
    'route',jsonb_build_object('routeId','homophone_contextual_choice','routeVersion','v1','activationRouteKey','homophone_contextual_choice:v1','payloadVersion',1),
    'approvalRefs',jsonb_build_array(p_actor::text),'microSkills',jsonb_build_array(jsonb_build_object('microSkillKey',skill,
      'dependencies',jsonb_build_array(jsonb_build_object('authorityKey',akey,'authorityType','homophone_contextual_content',
        'authoritySchemaVersion',1,'semanticFingerprint',projection_hash)))));
  manifest_hash:=adle_canonical_json_sha256_v1(manifest);
  dependency_hash:=adle_canonical_json_sha256_v1(manifest->'microSkills');
  insert into adle_curriculum_release_manifests(release_key,schema_version,manifest_file_sha256,manifest_payload,
    release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
  values(key,2,content_hash,manifest,manifest_hash,dependency_hash,'homophone_contextual_choice','v1',
    'homophone_contextual_choice:v1',1,jsonb_build_array(p_actor::text),p_actor::text)
  on conflict(release_key) do nothing;
  select id into strict rid from adle_curriculum_release_manifests where release_key=key;
  insert into adle_curriculum_release_dependencies(release_manifest_id,micro_skill_key,authority_type,authority_key,
    authority_schema_version,semantic_fingerprint,authority_id)
  select rid,skill,'homophone_contextual_content',akey,1,projection_hash,aid
    where not exists(select 1 from adle_curriculum_release_dependencies where release_manifest_id=rid and micro_skill_key=skill);
  insert into adle_route_activation_revisions(environment_key,release_manifest_id,release_manifest_sha256,dependency_fingerprint,
    route_id,route_version,activation_route_key,micro_skill_key,activation_status,incomplete_assignment_policy,
    readiness_report,previous_revision_id,change_reason,changed_by)
  values('staging',rid,manifest_hash,dependency_hash,'homophone_contextual_choice','v1','homophone_contextual_choice:v1',
    skill,'enabled','allow_existing',jsonb_build_object('schemaVersion',1,'scope',jsonb_build_object('kind','all_eligible'),
      'emergencyDisableAvailable',true),previous_id,'Approved Dictionary workbook staging pilot',p_actor::text)
  returning id into revision_id;
  insert into adle_route_activation_heads(environment_key,route_id,route_version,micro_skill_key,current_revision_id)
  values('staging','homophone_contextual_choice','v1',skill,revision_id)
  on conflict(environment_key,route_id,route_version,micro_skill_key) do update
    set current_revision_id=excluded.current_revision_id,updated_at=timezone('utc',now());
  return revision_id;
end $$;
revoke all on function public.publish_homophone_dictionary_staging_v1(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_homophone_dictionary_staging_v1(jsonb,uuid,uuid) to service_role;
commit;
