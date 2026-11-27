-- Additive, initially inactive Latin-root route. Existing assignments remain immutable.
begin;

create function public.adle_latin_root_dictionary_v1(p_family_keys text[]) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 with families as (
  select distinct on (f.family_key) f.family_key,f.revision,f.canonical_base_word_id,f.canonical_base_sense_id,
    f.base_lemma,f.base_meaning,f.review_status,r.origin_language
  from public.teaching_dictionary_families_with_current_meaning f
  join public.canonical_teaching_dictionary_lexical_root_metadata r using(family_key,revision)
  join public.teaching_dictionary_root_skill_families s using(family_key,revision)
  where f.is_current_family and f.family_key=any(p_family_keys)
    and s.micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS'
  order by f.family_key,f.revision desc
 ), words as (
  select l.canonical_word_id,l.sense_id,
    jsonb_build_object('canonicalWordId',w.id,'spelling',w.display_word,'familyKey',l.family_key,
      'senseId',l.sense_id,'definition',coalesce(s.value->>'definition',''),
      'partOfSpeech',coalesce(s.value->>'partOfSpeech',''),'ipa',coalesce(p.value->>'ipa',''),
      'sentence',coalesce(s.value->>'dictationSentence',''),
      'targetTokenIndex',coalesce((s.value->>'dictationTargetTokenIndex')::integer,-1),
      'reviewStatus',w.review_status,'reviewedAt',to_char(ss.reviewed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'morphologyId',a.id,'componentPartId',l.component_part_id,'wordSum',coalesce(a.word_sum,''),
      'parts',coalesce(a.morphology_parts,'[]'::jsonb),'joins',coalesce(a.morphology_joins,'[]'::jsonb),
      'transformations',coalesce(a.morphology_transformations,'[]'::jsonb)) value
  from public.teaching_dictionary_current_sense_family_memberships l
  join families f on f.family_key=l.family_key and f.revision=l.current_family_revision
  join public.canonical_teaching_dictionary_words w on w.id=l.canonical_word_id
    and w.row_status='active' and w.dialect_code='en-GB'
  join public.teaching_dictionary_reviewed_sense_sets ss on ss.canonical_word_id=w.id
  join lateral (select value from jsonb_array_elements(ss.sense_set->'senses') where value->>'id'=l.sense_id) s on true
  left join lateral (select value from jsonb_array_elements(ss.sense_set->'pronunciations') where value->>'id'=s.value->>'pronunciationId') p on true
  join public.teaching_dictionary_current_sense_morphology a on a.id=l.sense_morphology_id and a.sense_id=l.sense_id
  where s.value->>'partOfSpeech'<>'root'
    and not(w.id=f.canonical_base_word_id and l.sense_id=f.canonical_base_sense_id)
 ) select jsonb_build_object(
  'families',coalesce((select jsonb_agg(jsonb_build_object('familyKey',family_key,'revision',revision,
    'rootWordId',canonical_base_word_id,'rootSenseId',canonical_base_sense_id,'root',base_lemma,
    'meaning',base_meaning,'origin',origin_language,'reviewStatus',review_status) order by family_key collate "C") from families),'[]'::jsonb),
  'words',coalesce((select jsonb_agg(value order by canonical_word_id,sense_id collate "C") from words),'[]'::jsonb))
$$;

create function public.adle_latin_root_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; word jsonb; family jsonb; content_word jsonb;
begin
 if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(l->'words') is distinct from 'array'
   or jsonb_typeof(l#>'{content,families}') is distinct from 'array' then return false; end if;
 n:=jsonb_array_length(l->'words');
 if p->>'snapshotSchemaVersion' is distinct from '3' or p#>>'{route,routeId}' is distinct from 'latin_root_word_lab'
   or p#>>'{route,routeVersion}' is distinct from 'v1' or p#>>'{recipe,recipeKey}' is distinct from 'latin_root_word_lab'
   or p#>>'{recipe,recipeVersion}' is distinct from 'v1' or p#>>'{payload,kind}' is distinct from 'latin_root_lesson_v1'
   or p#>>'{payload,version}' is distinct from '1' or p#>>'{runtime,adapterKey}' is distinct from 'latin_root_v1'
   or p#>>'{runtime,rendererKey}' is distinct from 'latin_root_guided' or l->>'schemaVersion' is distinct from '1'
   or l->>'routeId' is distinct from 'latin_root_word_lab' or l->>'microSkillKey' is distinct from 'D4_MOR_ROOTS_COMMON_LATIN_ROOTS'
   or l->>'microSkillKey' is distinct from p#>>'{taxonomy,microSkillKey}' or n not in(5,6)
   or jsonb_array_length(l#>'{content,families}') not in(1,2)
   or l->>'assignmentKey' is distinct from l#>>'{content,id}'
   or l->>'contentVersion' is distinct from 'latin_root_word_lab:v1:'||public.adle_weak_vowel_json_sha256_v1(
     jsonb_build_object('content',l->'content','familyAuthorities',l->'familyAuthorities','words',l->'words'))
   or jsonb_array_length(p->'words') is distinct from n or jsonb_array_length(p->'activities') is distinct from 6
   or (p#>>'{assignment,itemCount}')::integer is distinct from 2+3*n
   or jsonb_array_length(p->'contentVersions') is distinct from 3+n
   or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p->'words'))<>n
   or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'words'))<>n
   or public.adle_weak_vowel_json_sha256_v1(p#-'{provenance,sourceFingerprint}') is distinct from p#>>'{provenance,sourceFingerprint}'
   then return false; end if;
 for family in select value from jsonb_array_elements(l#>'{content,families}') loop
  if nullif(family->>'root','') is null or nullif(family->>'meaning','') is null
    or family->>'origin' not in('Latin','Latin-derived') or jsonb_typeof(family->'words') is distinct from 'array'
    or not exists(select 1 from jsonb_array_elements(family->'words') w where w.value->'target'='true'::jsonb)
    or (jsonb_array_length(l#>'{content,families}')=2 and jsonb_array_length(family->'words') not in(2,3))
    then return false; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(l#>'{content,families}') f,jsonb_array_elements(f.value->'words') w)<>n then return false; end if;
 for word in select value from jsonb_array_elements(l->'words') loop
  select w.value into strict content_word from jsonb_array_elements(l#>'{content,families}') f,
    jsonb_array_elements(f.value->'words') w where w.value->>'id'=word->>'canonicalWordId';
  if nullif(word->>'senseId','') is null or coalesce(word->>'sourceFingerprint','')!~'^[a-f0-9]{64}$'
    or not exists(select 1 from jsonb_array_elements(p->'words') w where w.value->>'canonicalWordId'=word->>'canonicalWordId'
      and w.value->>'displayWord'=content_word->>'word' and w.value->>'learningItemId' is not distinct from word->>'learningItemId')
    or (content_word->>'target')::boolean is distinct from (word->>'learningItemId' is not null)
    then return false; end if;
 end loop;
 return coalesce((select count(*)=2+3*n and count(*)=count(distinct b.value->>'sourceEntityId')
   from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b),false);
exception when others then return false;
end $$;

-- Extend the shared structural dispatcher without replacing its other route branches.
do $migration$ declare original text; patched text;
begin
 select pg_get_functiondef('public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure) into original;
 if position('latin_root_word_lab' in original)=0 then
  patched:=replace(original,'when ''weak_vowel_word_lab'' then',
    'when ''latin_root_word_lab'' then public.adle_latin_root_snapshot_valid_v3(p_snapshot) when ''weak_vowel_word_lab'' then');
  if patched=original then raise exception 'LATIN_ROOT_SNAPSHOT_DISPATCH_PATCH_NOT_FOUND'; end if;
  execute patched;
 end if;
end $migration$;

create function public.publish_adle_latin_root_package_v1(p_package jsonb,p_package_file_sha256 text,p_published_by text)
returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m jsonb:=p_package->'manifest'; a jsonb; d jsonb; aid uuid; rid uuid; fp text; sha text; keys text[];
begin
 if p_package->>'schemaVersion' is distinct from '1' or p_package->>'activation' is distinct from 'inactive'
   or nullif(btrim(p_published_by),'') is null or coalesce(p_package_file_sha256,'')!~'^[a-f0-9]{64}$'
   or public.adle_weak_vowel_json_sha256_v1(p_package-'packageSha256') is distinct from p_package->>'packageSha256'
   or m#>>'{route,routeId}' is distinct from 'latin_root_word_lab' or m#>>'{route,routeVersion}' is distinct from 'v1'
   or m#>>'{route,activationRouteKey}' is distinct from 'latin_root_word_lab:v1' or m#>>'{route,payloadVersion}' is distinct from '1'
   or jsonb_array_length(m->'approvalRefs')<1 or jsonb_array_length(m->'microSkills') is distinct from 1
   or m#>>'{microSkills,0,microSkillKey}' is distinct from 'D4_MOR_ROOTS_COMMON_LATIN_ROOTS'
   or jsonb_array_length(p_package->'authorities') is distinct from 3
   or jsonb_array_length(m#>'{microSkills,0,dependencies}') is distinct from 3 then raise exception 'LATIN_ROOT_PACKAGE_INVALID'; end if;
 for a in select value from jsonb_array_elements(p_package->'authorities') loop
  fp:=public.adle_weak_vowel_json_sha256_v1(a->'semanticProjection');
  if a->>'semanticFingerprint' is distinct from fp or a->>'schemaVersion' is distinct from '1'
    or a->>'authorityType' not in('family_membership','teaching_content','teaching_dictionary_closure')
    or a#>>'{semanticProjection,microSkillKey}' is distinct from 'D4_MOR_ROOTS_COMMON_LATIN_ROOTS'
    then raise exception 'LATIN_ROOT_AUTHORITY_INVALID'; end if;
  if a->>'authorityType'='teaching_dictionary_closure' then
   select array_agg(value->>'familyKey') into keys from jsonb_array_elements(a#>'{semanticProjection,dictionary,families}');
   if a#>'{semanticProjection,dictionary}' is distinct from public.adle_latin_root_dictionary_v1(keys)
     or a#>>'{semanticProjection,dictionaryFingerprint}' is distinct from public.adle_weak_vowel_json_sha256_v1(a#>'{semanticProjection,dictionary}')
     or jsonb_array_length(a#>'{semanticProjection,dictionary,words}')<5 then raise exception 'LATIN_ROOT_DICTIONARY_CHANGED'; end if;
  end if;
  insert into public.adle_curriculum_dependency_authorities
   (authority_key,authority_type,schema_version,source_classification,manifest_file_sha256,authority_manifest,
    authority_manifest_sha256,semantic_projection,semantic_fingerprint,source_provenance,approval_refs,published_by)
  values(a->>'authorityKey',a->>'authorityType',1,'mixed_governed_sources',p_package_file_sha256,a,
    public.adle_canonical_json_sha256_v1(a),a->'semanticProjection',fp,
    jsonb_build_object('packageSha256',p_package->>'packageSha256'),m->'approvalRefs',p_published_by)
  on conflict(authority_type,authority_key) do nothing returning id into aid;
  if aid is null and not exists(select 1 from public.adle_curriculum_dependency_authorities where
    authority_type=a->>'authorityType' and authority_key=a->>'authorityKey' and semantic_projection=a->'semanticProjection'
    and manifest_file_sha256=p_package_file_sha256) then raise exception 'LATIN_ROOT_IMMUTABLE_AUTHORITY_CONFLICT'; end if;
  aid:=null;
 end loop;
 sha:=public.adle_canonical_json_sha256_v1(m); fp:=public.adle_canonical_json_sha256_v1(m->'microSkills');
 insert into public.adle_curriculum_release_manifests
  (release_key,schema_version,manifest_file_sha256,manifest_payload,release_manifest_sha256,dependency_fingerprint,
   route_id,route_version,activation_route_key,payload_version,approval_refs,published_by)
 values(m->>'releaseKey',2,p_package_file_sha256,m,sha,fp,'latin_root_word_lab','v1','latin_root_word_lab:v1',1,m->'approvalRefs',p_published_by)
 on conflict(release_key) do nothing returning id into rid;
 if rid is null then
  select id into strict rid from public.adle_curriculum_release_manifests where release_key=m->>'releaseKey'
    and manifest_payload=m and manifest_file_sha256=p_package_file_sha256;
  return rid;
 end if;
 for d in select value from jsonb_array_elements(m#>'{microSkills,0,dependencies}') loop
  select id into strict aid from public.adle_curriculum_dependency_authorities where authority_type=d->>'authorityType'
    and authority_key=d->>'authorityKey' and semantic_fingerprint=d->>'semanticFingerprint' and schema_version=1;
  insert into public.adle_curriculum_release_dependencies
   (release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id)
  values(rid,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS',d->>'authorityType',d->>'authorityKey',1,d->>'semanticFingerprint',aid);
 end loop;
 return rid;
end $$;

create function public.assert_adle_latin_root_assignment_v1(p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.adle_route_activation_revisions%rowtype; closure jsonb; family jsonb; word jsonb; fact jsonb; content_word jsonb; keys text[];
begin
 if not public.adle_latin_root_snapshot_valid_v3(p_snapshot) or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
   or p_metadata#>>'{route,routeId}' is distinct from 'latin_root_word_lab'
   or p_metadata#>>'{payload,kind}' is distinct from 'latin_root_lesson_v1' then raise exception 'LATIN_ROOT_ASSIGNMENT_INVALID'; end if;
 select * into strict r from public.adle_route_activation_revisions where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
 if r.route_id<>'latin_root_word_lab' or r.route_version<>'v1' or r.activation_route_key<>'latin_root_word_lab:v1'
   or r.micro_skill_key<>'D4_MOR_ROOTS_COMMON_LATIN_ROOTS' or r.activation_status<>'enabled'
   or not public.adle_release_activation_allows_child_v2(r.id,p_child)
   or not public.adle_route_activation_revision_is_current_v2(r.id,
     (p_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid,p_metadata#>>'{curriculumRelease,releaseManifestSha256}',p_metadata#>>'{curriculumRelease,dependencyFingerprint}')
   then raise exception 'LATIN_ROOT_ACTIVATION_NOT_CURRENT'; end if;
 select a.semantic_projection->'dictionary' into strict closure
  from public.adle_curriculum_release_dependencies d join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
  where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key and d.authority_type='teaching_dictionary_closure';
 select array_agg(value->>'familyKey') into keys from jsonb_array_elements(closure->'families');
 if closure is distinct from public.adle_latin_root_dictionary_v1(keys) then raise exception 'LATIN_ROOT_DICTIONARY_CHANGED'; end if;
 for family in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,familyAuthorities}') loop
  if not exists(select 1 from jsonb_array_elements(closure->'families') f where f.value->>'familyKey'=family->>'familyKey'
    and f.value->>'revision'=family->>'revision' and public.adle_weak_vowel_json_sha256_v1(f.value)=family->>'sourceFingerprint')
    then raise exception 'LATIN_ROOT_FAMILY_PROVENANCE_CHANGED'; end if;
 end loop;
 for word in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,words}') loop
  select value into strict fact from jsonb_array_elements(closure->'words') where value->>'canonicalWordId'=word->>'canonicalWordId' and value->>'senseId'=word->>'senseId';
  select w.value into strict content_word from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,content,families}') f,
    jsonb_array_elements(f.value->'words') w where w.value->>'id'=word->>'canonicalWordId';
  if public.adle_weak_vowel_json_sha256_v1(fact) is distinct from word->>'sourceFingerprint'
    or content_word->>'word' is distinct from fact->>'spelling' or content_word->>'meaning' is distinct from fact->>'definition'
    or content_word->>'sentence' is distinct from fact->>'sentence' or word->>'targetTokenIndex' is distinct from fact->>'targetTokenIndex'
    then raise exception 'LATIN_ROOT_WORD_FACTS_CHANGED'; end if;
  if word->>'learningItemId' is not null and not exists(select 1 from public.adle_learning_items i
    where i.id=(word->>'learningItemId')::uuid and i.child_id=p_child and i.canonical_word_id=(word->>'canonicalWordId')::uuid
      and i.micro_skill_key=r.micro_skill_key and i.row_status='active' and i.item_status in('pending','pending_reteach') and i.source_kind<>'stretch_selection')
    then raise exception 'LATIN_ROOT_LEARNER_LINEAGE_INVALID'; end if;
 end loop;
 if jsonb_array_length(p_items) is distinct from (p_snapshot#>>'{assignment,itemCount}')::integer
   or not exists(select 1 from jsonb_array_elements(p_snapshot->'words') w where w.value->>'learningItemId' is not null)
   or exists(select 1 from jsonb_array_elements(p_items) i where i.value->>'childId' is distinct from p_child::text
     or i.value->>'parentUserId' is distinct from p_parent::text or i.value->>'sourceType' is distinct from 'adle_composer')
   or exists(with bindings as (select a.value activity,b.value binding from jsonb_array_elements(p_snapshot->'activities') a,
     jsonb_array_elements(a.value->'itemBindings') b) select 1 from bindings full join jsonb_array_elements(p_items) i
       on i.value->>'sourceEntityId'=bindings.binding->>'sourceEntityId'
     where i.value is null or bindings.binding is null or i.value->>'position' is distinct from bindings.binding->>'position'
       or i.value#>>'{promptData,latinRootActivityId}' is distinct from bindings.activity->>'activityId')
   then raise exception 'LATIN_ROOT_ASSIGNMENT_BINDINGS_INVALID'; end if;
end $$;

revoke all on function public.adle_latin_root_dictionary_v1(text[]),
 public.publish_adle_latin_root_package_v1(jsonb,text,text),
 public.assert_adle_latin_root_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.adle_latin_root_dictionary_v1(text[]),
 public.publish_adle_latin_root_package_v1(jsonb,text,text),
 public.assert_adle_latin_root_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
