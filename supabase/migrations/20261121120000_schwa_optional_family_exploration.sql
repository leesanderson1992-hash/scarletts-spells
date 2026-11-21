begin;
-- The selected family is optional enrichment; the core publication stays valid
-- while it lacks enough approved members. New assignments resolve it live.
create or replace function public.teaching_dictionary_schwa_optional_family_current(p_family jsonb,p_word uuid,p_sense text,p_key text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare f record; ids uuid[]; ready boolean;
begin
 select * into f from public.teaching_dictionary_families_with_current_meaning
   where family_key=p_key order by revision desc limit 1;
 select array_agg(w.id) into ids from public.canonical_teaching_dictionary_words w
 where w.row_status='active' and w.review_status='approved_for_first_exposure' and w.dialect_code='en-GB'
   and (w.id=f.canonical_base_word_id or exists(select 1 from public.teaching_dictionary_current_sense_family_memberships m where m.family_key=p_key and m.canonical_word_id=w.id));
 ready := coalesce(f.review_status='approved' and f.canonical_base_word_id is not null
   and f.canonical_base_word_id=any(ids) and p_word=any(ids) and cardinality(ids)>=2
   and exists(select 1 from public.teaching_dictionary_current_sense_family_memberships
     where canonical_word_id=p_word and sense_id=p_sense and family_key=p_key),false);
 if p_family is null or p_family='null'::jsonb then return not ready; end if;
 return ready and coalesce(public.teaching_dictionary_schwa_family_current(p_family,p_word,p_sense,p_key),false);
end $$;
revoke all on function public.teaching_dictionary_schwa_optional_family_current(jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.teaching_dictionary_schwa_optional_family_current(jsonb,uuid,text,text) to service_role;
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
        not public.teaching_dictionary_schwa_optional_family_current(w#>'{detective,family}',c.canonical_word_id,
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
