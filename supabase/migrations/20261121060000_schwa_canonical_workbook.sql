begin;
-- A reviewed pronunciation and meaning are selected once and reused by every Schwa activity.
create or replace function public.teaching_dictionary_schwa_sense_fingerprint(p_word uuid,p_sense text)
returns text language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select encode(extensions.digest(convert_to(jsonb_build_object('sense',sense.value,'pronunciation',pronunciation.value)::text,'UTF8'),'sha256'),'hex')
 from public.teaching_dictionary_reviewed_sense_sets s
 cross join lateral jsonb_array_elements(s.sense_set->'senses') sense
 join lateral jsonb_array_elements(s.sense_set->'pronunciations') pronunciation
   on pronunciation.value->>'id'=sense.value->>'pronunciationId'
 where s.canonical_word_id=p_word and sense.value->>'id'=p_sense
$$;
revoke all on function public.teaching_dictionary_schwa_sense_fingerprint(uuid,text) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_sense_fingerprint(uuid,text) to service_role;
create or replace function public.teaching_dictionary_schwa_shared_facts(p_words uuid[])
returns table(word_id uuid,definition text,sentence text)
language sql stable security definer set search_path=public,pg_temp as $$
 select target.word_id,d.definition,s.dictation_sentence from unnest(p_words) as target(word_id)
 left join lateral (select v.definition from public.teaching_dictionary_definition_versions v where v.canonical_word_id=target.word_id and v.route_id is null order by v.published_at desc,v.id desc limit 1) d on true
 left join lateral (select v.dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences v where v.canonical_word_id=target.word_id and v.row_status='active' and v.review_status='approved_for_first_exposure' order by v.created_at desc,v.id desc limit 1) s on true
 where cardinality(p_words)<=100
$$;
revoke all on function public.teaching_dictionary_schwa_shared_facts(uuid[]) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_shared_facts(uuid[]) to service_role;
-- Batch read prevents one HTTP/database round trip per pool word.
create or replace function public.teaching_dictionary_schwa_fingerprints(p_words uuid[],p_senses jsonb default '{}')
returns table(word_id uuid,dictionary_fingerprint text,sense_fingerprint text)
language sql stable security definer set search_path=public,pg_temp as $$
 select id,public.teaching_dictionary_route_dictionary_fingerprint(id),
   case when p_senses ? id::text then public.teaching_dictionary_schwa_sense_fingerprint(id,p_senses->>id::text) end
 from unnest(p_words) id where cardinality(p_words)<=100
$$;
revoke all on function public.teaching_dictionary_schwa_fingerprints(uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_fingerprints(uuid[],jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.publish_adle_weak_vowel_content_v1(p_content_version uuid, p_actor uuid, p_expected_source_fingerprint text, p_expected_word_audio_sha256 text, p_expected_sentence_audio_sha256 text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
      'D4_SCHWA_FINAL_OR_FINAL','D4_SCHWA_INITIAL_A_INITIAL',
      'D4_SCHWA_INITIAL_E_INITIAL','D4_SCHWA_INITIAL_O_INITIAL',
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
    or not (coalesce(v_facts#>>'{wordRecording,src}','') like '/audio/%'
      or coalesce(v_facts#>>'{wordRecording,src}','') like 'device-speech:%')
    or not (coalesce(v_facts#>>'{sentenceRecording,src}','') like '/audio/%'
      or coalesce(v_facts#>>'{sentenceRecording,src}','') like 'device-speech:%')
    or (coalesce(v_facts#>>'{wordRecording,src}','') like 'device-speech:%' and
      v_facts#>>'{wordRecording,sha256}' is distinct from
        encode(extensions.digest(convert_to(v_facts#>>'{wordRecording,src}','UTF8'),'sha256'),'hex'))
    or (coalesce(v_facts#>>'{sentenceRecording,src}','') like 'device-speech:%' and
      v_facts#>>'{sentenceRecording,sha256}' is distinct from
        encode(extensions.digest(convert_to(v_facts#>>'{sentenceRecording,src}','UTF8'),'sha256'),'hex')) then
    raise exception 'WEAK_VOWEL_CONTENT_INCOMPLETE';
  end if;
  if c.content->>'routeId'<>'weak_vowel_word_lab'
    or c.content->>'routeVersion'<>'v1'
    or c.content->>'microSkillKey'<>c.micro_skill_key then
    raise exception 'WEAK_VOWEL_CONTENT_IDENTITY_MISMATCH';
  end if;
  if v_facts ? 'canonicalSenseId' then
    if public.teaching_dictionary_schwa_sense_fingerprint(c.canonical_word_id,v_facts->>'canonicalSenseId')
        is distinct from v_facts->>'canonicalSenseFingerprint'
      or (select value->>'definition' from public.teaching_dictionary_reviewed_sense_sets s,
          lateral jsonb_array_elements(s.sense_set->'senses') where s.canonical_word_id=c.canonical_word_id
          and value->>'id'=v_facts->>'canonicalSenseId') is distinct from c.content->>'wordMeaning'
      or not exists(select 1 from public.teaching_dictionary_effective_lesson_sense_bindings b
          where b.canonical_word_id=c.canonical_word_id and b.micro_skill_key=c.micro_skill_key
          and b.sense_id=v_facts->>'canonicalSenseId') then
      raise exception 'WEAK_VOWEL_CANONICAL_FACTS_CHANGED';
    end if;
  else
  if (select definition.definition from public.teaching_dictionary_definition_versions definition
      where definition.canonical_word_id=c.canonical_word_id and definition.route_id is null
      order by definition.published_at desc,definition.id desc limit 1)
      is distinct from c.content->>'wordMeaning' then
    raise exception 'WEAK_VOWEL_SHARED_DEFINITION_CHANGED';
  end if;
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
end $function$
;
create or replace function public.teaching_dictionary_schwa_family_current(p_family jsonb,p_word uuid,p_sense text,p_key text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; ids jsonb; expected_sha text;
begin
 if p_family is null or p_family='null'::jsonb or jsonb_typeof(p_family->'members')<>'array' then return false; end if;
 select * into f from public.teaching_dictionary_families_with_current_meaning where family_key=p_key order by revision desc limit 1;
 if f.family_key is null or f.review_status<>'approved' or f.canonical_base_word_id is null
   or not exists(select 1 from public.teaching_dictionary_current_sense_family_memberships where canonical_word_id=p_word and sense_id=p_sense and family_key=p_key) then return false; end if;
 select jsonb_agg(w.id::text order by w.id::text) into ids from public.canonical_teaching_dictionary_words w
 where w.row_status='active' and w.review_status='approved_for_first_exposure' and w.dialect_code='en-GB'
   and (w.id=f.canonical_base_word_id or exists(select 1 from public.teaching_dictionary_current_sense_family_memberships m where m.family_key=p_key and m.canonical_word_id=w.id));
 if jsonb_array_length(coalesce(ids,'[]'))<2 then return false; end if;
 expected_sha:=public.adle_weak_vowel_json_sha256_v1(jsonb_build_object('familyKey',p_key,'base',f.canonical_base_word_id::text,'members',ids));
 return p_family->>'authorityId'='dictionary:'||p_key and p_family->>'sourceFingerprint'=expected_sha
   and p_family->>'name'=f.base_lemma
   and (select jsonb_agg(value->>'canonicalWordId' order by value->>'canonicalWordId') from jsonb_array_elements(p_family->'members'))=ids
   and not exists(select 1 from jsonb_array_elements(p_family->'members') member
       join public.canonical_teaching_dictionary_words w on w.id::text=member.value->>'canonicalWordId'
       where member.value->>'spelling' is distinct from w.display_word);
end $$;
revoke all on function public.teaching_dictionary_schwa_family_current(jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_family_current(jsonb,uuid,text,text) to service_role;
CREATE OR REPLACE FUNCTION public.assert_adle_weak_vowel_assignment_v1(p_snapshot jsonb, p_metadata jsonb, p_items jsonb, p_child uuid, p_parent uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.adle_route_activation_revisions%rowtype; template jsonb; w jsonb;
  c public.teaching_dictionary_route_content_versions%rowtype;
  publication public.adle_weak_vowel_content_publications%rowtype;
begin
  if not public.adle_weak_vowel_snapshot_valid_v3(p_snapshot)
    or not public.adle_lesson_route_metadata_is_valid_v2(p_metadata)
    or p_metadata#>>'{route,routeId}' is distinct from 'weak_vowel_word_lab'
    or p_metadata#>>'{route,routeVersion}' is distinct from 'v1'
    or p_metadata#>>'{payload,kind}' is distinct from 'weak_vowel_lesson_v1'
    or p_metadata#>>'{payload,version}' is distinct from '1'
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items)<>(p_snapshot#>>'{assignment,itemCount}')::integer
    then raise exception 'WEAK_VOWEL_ASSIGNMENT_CONTRACT_INVALID'; end if;
  select * into strict r from public.adle_route_activation_revisions
    where id=(p_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  if r.route_id<>'weak_vowel_word_lab' or r.route_version<>'v1'
    or r.activation_route_key<>'weak_vowel_word_lab:v1'
    or r.micro_skill_key<>p_snapshot#>>'{taxonomy,microSkillKey}'
    or not public.adle_release_activation_allows_child_v2(r.id,p_child)
    or not public.adle_route_activation_revision_is_current_v2(r.id,r.release_manifest_id,
      p_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      p_metadata#>>'{curriculumRelease,dependencyFingerprint}')
    then raise exception 'WEAK_VOWEL_ACTIVATION_CHANGED'; end if;
  select a.semantic_projection into strict template
    from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=r.release_manifest_id and d.micro_skill_key=r.micro_skill_key
      and d.authority_type='weak_vowel_lesson_content';
  if template->>'microSkillKey'<>r.micro_skill_key
    or template->>'teachingTemplateSha256' is distinct from
      public.adle_generic_snapshot_json_sha256_v1(
        jsonb_set(p_snapshot#>'{payload,resolvedLesson,teaching}','{meetWords,words}','[]'::jsonb))
    then raise exception 'WEAK_VOWEL_TEACHING_RELEASE_MISMATCH'; end if;
  for w in select value from jsonb_array_elements(p_snapshot#>'{payload,resolvedLesson,words}') loop
    select * into c from public.teaching_dictionary_route_content_versions
      where id=(w#>>'{dinner,contentVersion}')::uuid;
    select * into publication from public.adle_weak_vowel_content_publications
      where content_version_id=c.id;
    if c.id is null or publication.content_version_id is null
      or c.canonical_word_id::text<>w->>'canonicalWordId'
      or c.micro_skill_key<>r.micro_skill_key or c.route_id<>'weak_vowel_word_lab'
      or c.route_version<>'v1' or publication.content_sha256<>w->>'routeContentSha256'
      or publication.source_fingerprint<>w#>>'{dinner,sourceFingerprint}'
      or (case when c.content#>>'{content,weakVowel,canonicalSenseId}' is not null then
        public.teaching_dictionary_schwa_sense_fingerprint(c.canonical_word_id,c.content#>>'{content,weakVowel,canonicalSenseId}')
          is distinct from c.content#>>'{content,weakVowel,canonicalSenseFingerprint}'
        or not exists(select 1 from public.teaching_dictionary_effective_lesson_sense_bindings b
          where b.environment_key=r.environment_key and b.canonical_word_id=c.canonical_word_id
            and b.micro_skill_key=r.micro_skill_key and b.sense_id=c.content#>>'{content,weakVowel,canonicalSenseId}')
      else publication.dictionary_fingerprint<>public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id) end)
      or publication.word_audio_sha256<>w#>>'{dinner,recording,sha256}'
      or publication.sentence_audio_sha256<>w#>>'{dictation,recording,sha256}'
      or c.content#>'{content,weakVowel,target}' is distinct from w#>'{dinner,target}'
      or c.content#>'{content,weakVowel,acceptedCutSets}' is distinct from w#>'{dinner,acceptedCutSets}'
      or c.content#>>'{content,weakVowel,pronunciationId}' is distinct from w#>>'{dinner,pronunciationId}'
      or c.content#>>'{content,weakVowel,wordSense}' is distinct from w#>>'{dinner,wordSense}'
      or c.content#>>'{content,weakVowel,sentenceTarget,start}' is distinct from w#>>'{dictation,targetStart}'
      or c.content#>>'{content,weakVowel,sentenceTarget,end}' is distinct from w#>>'{dictation,targetEnd}'
      or c.content->>'wordMeaning' is distinct from w#>>'{definition,text}'
      or (case when c.content#>>'{content,weakVowel,familyAuthorityId}' like 'dictionary:%' then
        not public.teaching_dictionary_schwa_family_current(w#>'{detective,family}',c.canonical_word_id,
          c.content#>>'{content,weakVowel,canonicalSenseId}',substring(c.content#>>'{content,weakVowel,familyAuthorityId}' from 12))
      else (w#>'{detective,family}' is not null and w#>'{detective,family}'<>'null'::jsonb
        and (w#>>'{detective,family,authorityId}' is distinct from
            c.content#>>'{content,weakVowel,familyAuthorityId}'
          or not exists(select 1 from public.canonical_teaching_dictionary_base_word_families family
            where family.id=(w#>>'{detective,family,authorityId}')::uuid
              and family.source_row_hash=w#>>'{detective,family,sourceFingerprint}'
              and family.row_status='active' and family.review_status='approved_for_first_exposure')
          or exists(select 1 from jsonb_array_elements(w#>'{detective,family,members}') member
            where not exists(select 1 from public.canonical_teaching_dictionary_base_word_family_members current_member
              where current_member.base_word_family_id=(w#>>'{detective,family,authorityId}')::uuid
                and current_member.canonical_word_id=(member.value->>'canonicalWordId')::uuid
                and current_member.row_status='active'
                and current_member.review_status='approved_for_first_exposure'
                and current_member.assignment_eligible=true)))) end)
      or exists(select 1 from public.teaching_dictionary_pair_latest_decisions d
        where d.canonical_word_id=c.canonical_word_id and d.micro_skill_key=r.micro_skill_key
          and d.environment_key=r.environment_key and d.action='deassign')
      or not exists(select 1 from public.canonical_teaching_dictionary_words d
        where d.id=c.canonical_word_id and d.display_word=w->>'spelling'
          and d.row_status='active' and d.review_status='approved_for_first_exposure'
          and d.dialect_code='en-GB')
      or exists(select 1 from public.adle_weak_vowel_content_publications newer
        where newer.canonical_word_id=c.canonical_word_id and newer.micro_skill_key=r.micro_skill_key
          and (newer.published_at,newer.content_version_id)>
            (publication.published_at,publication.content_version_id))
      then raise exception 'WEAK_VOWEL_WORD_PUBLICATION_CHANGED'; end if;
    if w->>'learningItemId' is not null and not exists(
      select 1 from public.adle_learning_items i where i.id=(w->>'learningItemId')::uuid
        and i.child_id=p_child and i.canonical_word_id=c.canonical_word_id
        and i.micro_skill_key=r.micro_skill_key and i.row_status='active'
        and i.item_status in ('pending','pending_reteach'))
      then raise exception 'WEAK_VOWEL_LEARNING_ITEM_LINEAGE_INVALID'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_snapshot->'words') w
      where w.value->>'learningItemId' is not null)
    or exists(select 1 from jsonb_array_elements(p_items) i where
      i.value->>'childId'<>p_child::text or i.value->>'parentUserId'<>p_parent::text
      or i.value->>'sourceType'<>'adle_composer')
    or exists(with bindings as (select a.value activity,b.value binding
      from jsonb_array_elements(p_snapshot->'activities') a,
        jsonb_array_elements(a.value->'itemBindings') b)
      select 1 from bindings full join jsonb_array_elements(p_items) i
        on i.value->>'sourceEntityId'=bindings.binding->>'sourceEntityId'
      where i.value is null or bindings.binding is null
        or i.value->>'position'<>bindings.binding->>'position'
        or i.value#>>'{promptData,weakVowelActivityId}'<>bindings.activity->>'activityId')
    then raise exception 'WEAK_VOWEL_ASSIGNMENT_ITEM_BINDING_INVALID'; end if;
end $function$
;
commit;
