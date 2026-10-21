-- Install the frozen weak-vowel assignment and checkpoint boundaries while
-- route activation remains separate. No learner assignment is created here.
begin;

-- The existing generic canonical JSON helper sorts keys using the database
-- collation, which differs from JavaScript for mixed-case keys such as
-- reviewStatus/reviewedVowelIndex. Keep historical hashes intact and use a
-- route-scoped bytewise ordering for the new frozen snapshot contract.
create function public.adle_weak_vowel_canonical_json_text_v1(p_value jsonb)
returns text language plpgsql immutable strict set search_path=public,pg_temp as $$
declare v_type text:=jsonb_typeof(p_value); v_result text;
begin
  if v_type='object' then
    select '{'||coalesce(string_agg(to_jsonb(entry.key)::text||':'||
      public.adle_weak_vowel_canonical_json_text_v1(entry.value),
      ',' order by entry.key collate "C"),'')||'}' into v_result
      from jsonb_each(p_value) entry;
    return v_result;
  elsif v_type='array' then
    select '['||coalesce(string_agg(
      public.adle_weak_vowel_canonical_json_text_v1(entry.value),
      ',' order by entry.ordinality),'')||']' into v_result
      from jsonb_array_elements(p_value) with ordinality entry(value,ordinality);
    return v_result;
  end if;
  return p_value::text;
end $$;

create function public.adle_weak_vowel_json_sha256_v1(p_value jsonb)
returns text language sql immutable strict set search_path=public,extensions,pg_temp as $$
  select encode(extensions.digest(convert_to(
    public.adle_weak_vowel_canonical_json_text_v1(p_value),'UTF8'),'sha256'),'hex')
$$;

create function public.adle_weak_vowel_snapshot_valid_v3(p jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare l jsonb:=p#>'{payload,resolvedLesson}'; n integer; w jsonb; a jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object'
    or jsonb_typeof(l->'words') is distinct from 'array' or jsonb_typeof(p->'words') is distinct from 'array'
    or jsonb_typeof(p->'activities') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(l->'words');
  if p->>'snapshotSchemaVersion'<>'3' or p#>>'{route,routeId}'<>'weak_vowel_word_lab'
    or p#>>'{route,routeVersion}'<>'v1' or p#>>'{recipe,recipeKey}'<>'weak_vowel_word_lab'
    or p#>>'{recipe,recipeVersion}'<>'v1' or p#>>'{payload,kind}'<>'weak_vowel_lesson_v1'
    or p#>>'{payload,version}'<>'1' or p#>>'{runtime,adapterKey}'<>'weak_vowel_v1'
    or p#>>'{runtime,rendererKey}'<>'weak_vowel_guided' or l->>'authority'<>'governed_release'
    or l->>'microSkillKey'<>p#>>'{taxonomy,microSkillKey}' or n not between 4 and 6
    or jsonb_array_length(p->'words')<>n or jsonb_array_length(p->'activities')<>6
    or (p#>>'{assignment,itemCount}')::integer<>1+4*n
    or jsonb_array_length(p->'contentVersions')<>3+n
    or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p->'words'))<>n
    or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(l->'words'))<>n
    or public.adle_weak_vowel_json_sha256_v1(p#-'{provenance,sourceFingerprint}')
      <>p#>>'{provenance,sourceFingerprint}' then return false; end if;
  for w in select value from jsonb_array_elements(l->'words') loop
    if nullif(w->>'canonicalWordId','') is null or nullif(w->>'spelling','') is null
      or w#>>'{dinner,canonicalWordId}'<>w->>'canonicalWordId'
      or w#>>'{detective,canonicalWordId}'<>w->>'canonicalWordId'
      or w#>>'{dinner,spelling}'<>w->>'spelling'
      or w#>>'{detective,spelling}'<>w->>'spelling'
      or nullif(w#>>'{dictation,sentence}','') is null
      or nullif(w#>>'{routeContentSha256}','') is null
      or not exists(select 1 from jsonb_array_elements(p->'words') v
        where v.value->>'canonicalWordId'=w->>'canonicalWordId'
          and v.value->>'displayWord'=w->>'spelling'
          and v.value->>'learningItemId' is not distinct from w->>'learningItemId')
      then return false; end if;
  end loop;
  for a in select value from jsonb_array_elements(p->'activities') loop
    if concat(a#>>'{canonical,concept}','.',a#>>'{canonical,mode}','@',
        a#>>'{canonical,contractVersion}') not in
      ('INTRODUCTION.teaching_page@1','WEAK_VOWEL_DINNER.syllable_and_vowel@1',
       'WEAK_VOWEL_DETECTIVE.missing_vowel_and_family@1','COVER_CHECK.whole_word@1',
       'DICTATION.whole_sentence@1','LESSON_REFLECTION.standard_lesson_reflection@1')
      then return false; end if;
  end loop;
  return (select count(*)=1+4*n and count(*)=count(distinct b.value->>'sourceEntityId')
    from jsonb_array_elements(p->'activities') a,jsonb_array_elements(a.value->'itemBindings') b);
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
  when 'homophone_word_lab' then public.adle_homophone_snapshot_valid_v3(p_snapshot)
  when 'weak_vowel_word_lab' then public.adle_weak_vowel_snapshot_valid_v3(p_snapshot)
  else false end else false end $$;

create function public.assert_adle_weak_vowel_assignment_v1(
  p_snapshot jsonb,p_metadata jsonb,p_items jsonb,p_child uuid,p_parent uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
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
      or publication.dictionary_fingerprint<>
        public.teaching_dictionary_route_dictionary_fingerprint(c.canonical_word_id)
      or publication.word_audio_sha256<>w#>>'{dinner,recording,sha256}'
      or publication.sentence_audio_sha256<>w#>>'{dictation,recording,sha256}'
      or c.content#>'{content,weakVowel,target}' is distinct from w#>'{dinner,target}'
      or c.content#>'{content,weakVowel,acceptedCutSets}' is distinct from w#>'{dinner,acceptedCutSets}'
      or c.content#>>'{content,weakVowel,pronunciationId}' is distinct from w#>>'{dinner,pronunciationId}'
      or c.content#>>'{content,weakVowel,wordSense}' is distinct from w#>>'{dinner,wordSense}'
      or c.content#>>'{content,weakVowel,sentenceTarget,start}' is distinct from w#>>'{dictation,targetStart}'
      or c.content#>>'{content,weakVowel,sentenceTarget,end}' is distinct from w#>>'{dictation,targetEnd}'
      or c.content->>'wordMeaning' is distinct from w#>>'{definition,text}'
      or (w#>'{detective,family}' is not null and w#>'{detective,family}'<>'null'::jsonb
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
                and current_member.assignment_eligible=true))))
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
end $$;

create function public.persist_adle_weak_vowel_daily_plan_v3(
  p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,
  p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; previous jsonb; i jsonb;
begin
  if p_intakes<>'[]'::jsonb or p_header->>'childId'<>p_child_id::text
    or p_header->>'parentUserId'<>p_parent_user_id::text
    or p_header->>'assignmentDate'<>p_plan_date::text
    or not exists(select 1 from public.children where children.id=p_child_id
      and parent_user_id=p_parent_user_id and not coalesce(is_archived,false))
    then raise exception 'WEAK_VOWEL_OWNERSHIP_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select daily_assignments.id,compiled_lesson_snapshot into id,previous
    from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id
      and assignment_date=p_plan_date and title='ADLE Daily Plan';
  if id is not null then
    if previous#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}'
      then raise exception 'WEAK_VOWEL_IDEMPOTENCY_CONFLICT'; end if;
    return id;
  end if;
  perform public.assert_adle_weak_vowel_assignment_v1(
    p_snapshot,p_header->'lessonRouteMetadata',p_items,p_child_id,p_parent_user_id);
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,
    target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
  values(p_child_id,p_parent_user_id,p_plan_date,'ADLE Daily Plan','pending',
    array(select jsonb_array_elements_text(p_header->'targetWords')),
    array[]::text[],'adle_composer_v1',p_header->'lessonRouteMetadata',p_snapshot)
  returning daily_assignments.id into id;
  for i in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,
      item_type,source_type,source_entity_id,template_key,target_word,position,status,prompt_data,metadata)
    values(id,p_child_id,p_parent_user_id,'spelling',i->>'itemType','adle_composer',
      i->>'sourceEntityId',i->>'templateKey',i->>'targetWord',(i->>'position')::integer,
      'ready',i->'promptData',i->'metadata');
  end loop;
  return id;
end $$;

create function public.append_adle_weak_vowel_stage_r6(
  p_daily_assignment_id uuid,p_snapshot jsonb,p_items jsonb,p_intakes jsonb,p_lesson_route_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare h public.daily_assignments%rowtype;
begin
  select * into strict h from public.daily_assignments where id=p_daily_assignment_id for update;
  if p_intakes<>'[]'::jsonb then raise exception 'WEAK_VOWEL_LESSON_CANNOT_CREATE_NEEDS'; end if;
  if h.compiled_lesson_snapshot is null then
    perform public.assert_adle_weak_vowel_assignment_v1(
      p_snapshot,p_lesson_route_metadata,p_items,h.child_id,h.parent_user_id);
  end if;
  return public.append_adle_specialist_stage_r6(
    p_daily_assignment_id,p_snapshot,p_items,p_intakes,p_lesson_route_metadata);
end $$;

create function public.guard_weak_vowel_checkpoint_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; k text; v jsonb; next_state jsonb; old_state jsonb;
begin
  select compiled_lesson_snapshot into s from public.daily_assignments
    where id=new.daily_assignment_id;
  if s#>>'{route,routeId}' is distinct from 'weak_vowel_word_lab' then return new; end if;
  next_state:=new.checkpoint_payload->'state';
  if new.adapter_key is distinct from 'weak_vowel_v1'
    or new.checkpoint_schema_version is distinct from 'weak_vowel_progress_v1'
    or new.lesson_snapshot_fingerprint is distinct from s#>>'{provenance,sourceFingerprint}'
    or jsonb_typeof(next_state) is distinct from 'object'
    or next_state->>'schemaVersion'<>'1'
    or next_state->>'assignmentKey' is distinct from s#>>'{payload,resolvedLesson,assignmentKey}'
    or next_state->>'contentVersion' is distinct from s#>>'{payload,resolvedLesson,contentVersion}'
    or jsonb_typeof(next_state->'coverAttempts') is distinct from 'object'
    or jsonb_typeof(next_state->'dictationAttempts') is distinct from 'object'
    or jsonb_typeof(next_state->'dictationChecked') is distinct from 'array'
    then raise exception 'WEAK_VOWEL_CHECKPOINT_INVALID'; end if;
  if tg_op='INSERT' then
    if next_state->'finished' is distinct from 'false'::jsonb
      then raise exception 'WEAK_VOWEL_CHECKPOINT_FINISH_FORBIDDEN'; end if;
  else
    old_state:=old.checkpoint_payload->'state';
    if old_state->'finished'='true'::jsonb and old.checkpoint_payload is distinct from new.checkpoint_payload
      then raise exception 'WEAK_VOWEL_COMPLETED_PROGRESS_LOCKED'; end if;
    if next_state->'finished'='true'::jsonb and old_state->'finished'='false'::jsonb and
      (new.checkpoint_payload is distinct from
          jsonb_set(old.checkpoint_payload,'{state,finished}','true'::jsonb)
        or new.completed_at is null)
      then raise exception 'WEAK_VOWEL_CHECKPOINT_COMPLETION_INVALID'; end if;
    for k,v in select * from jsonb_each(old_state->'coverAttempts') loop
      if next_state->'coverAttempts'->k is distinct from v
        then raise exception 'WEAK_VOWEL_COVER_ANSWER_LOCKED'; end if;
    end loop;
    for k,v in select * from jsonb_each(old_state->'dictationAttempts') loop
      if next_state->'dictationAttempts'->k is distinct from v
        then raise exception 'WEAK_VOWEL_DICTATION_ANSWER_LOCKED'; end if;
    end loop;
    if old_state->'dinnerResponse' is not null and old_state->'dinnerResponse'<>'null'::jsonb
      and next_state->'dinnerResponse' is distinct from old_state->'dinnerResponse'
      then raise exception 'WEAK_VOWEL_GUIDED_RESPONSE_LOCKED'; end if;
    if old_state->'detectiveResponse' is not null and old_state->'detectiveResponse'<>'null'::jsonb
      and next_state->'detectiveResponse' is distinct from old_state->'detectiveResponse'
      then raise exception 'WEAK_VOWEL_GUIDED_RESPONSE_LOCKED'; end if;
    if exists(select 1 from jsonb_array_elements_text(old_state->'dictationChecked') old_id
      where not next_state->'dictationChecked' ? old_id)
      then raise exception 'WEAK_VOWEL_DICTATION_CHECK_LOCKED'; end if;
  end if;
  return new;
end $$;
create trigger weak_vowel_checkpoint_answer_lock
  before insert or update on public.adle_specialist_stage_checkpoints
  for each row execute function public.guard_weak_vowel_checkpoint_v1();

revoke all on function public.assert_adle_weak_vowel_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),
  public.persist_adle_weak_vowel_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb),
  public.append_adle_weak_vowel_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.assert_adle_weak_vowel_assignment_v1(jsonb,jsonb,jsonb,uuid,uuid),
  public.persist_adle_weak_vowel_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb),
  public.append_adle_weak_vowel_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb)
  to service_role;
revoke all on function public.adle_weak_vowel_canonical_json_text_v1(jsonb),
  public.adle_weak_vowel_json_sha256_v1(jsonb) from public,anon,authenticated;
grant execute on function public.adle_weak_vowel_canonical_json_text_v1(jsonb),
  public.adle_weak_vowel_json_sha256_v1(jsonb) to service_role;
commit;
