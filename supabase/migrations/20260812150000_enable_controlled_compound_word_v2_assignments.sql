-- CW-3C-1: extend the shared release-bound assignment persistence guard for
-- Compound Word v2. This migration creates no activation or learner work.

begin;

create or replace function public.adle_release_activation_allows_child_v2(
  p_activation_revision_id uuid,
  p_child_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.adle_route_activation_revisions revision
    join public.adle_route_activation_heads head
      on head.current_revision_id = revision.id
     and head.environment_key = revision.environment_key
     and head.route_id = revision.route_id
     and head.route_version = revision.route_version
     and head.micro_skill_key = revision.micro_skill_key
    where revision.id = p_activation_revision_id
      and revision.activation_status = 'enabled'
      and revision.readiness_report->>'schemaVersion' = '1'
      and revision.readiness_report#>>'{scope,kind}' = 'child_allowlist'
      and revision.readiness_report->>'emergencyDisableAvailable' = 'true'
      and jsonb_typeof(revision.readiness_report#>'{scope,childIds}') = 'array'
      and revision.readiness_report#>'{scope,childIds}' ? p_child_id::text
  );
$$;

revoke all on function public.adle_release_activation_allows_child_v2(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.adle_release_activation_allows_child_v2(uuid,uuid)
  to service_role;

create or replace function public.adle_release_bound_composed_plan_is_ready_v2(
  p_child_id uuid,
  p_header jsonb,
  p_items jsonb,
  p_intakes jsonb
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_metadata jsonb := p_header->'lessonRouteMetadata';
  v_revision_id uuid;
  v_release_id uuid;
  v_micro_skill_key text;
  v_payload jsonb;
  v_structure_authority_id uuid;
  v_teaching_authority_id uuid;
  v_closure_authority_id uuid;
  v_teaching jsonb;
  v_word jsonb;
  v_structure jsonb;
  v_lineage jsonb;
  v_id uuid;
begin
  if not public.adle_lesson_route_metadata_is_valid_v2(v_metadata)
    or v_metadata#>>'{route,routeId}' <> 'compound_word_lab'
    or v_metadata#>>'{route,routeVersion}' <> 'v2'
    or v_metadata#>>'{recipe,recipeKey}' <> 'compound_word_lab'
    or v_metadata#>>'{recipe,recipeVersion}' <> 'v2'
    or v_metadata#>>'{payload,kind}' <> 'compound_word_lesson_v2'
    or v_metadata#>>'{payload,version}' <> '2'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) <> 18
    or jsonb_typeof(p_intakes) <> 'array'
    or jsonb_array_length(p_intakes) <> 0
  then return false; end if;

  v_revision_id := (v_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  v_release_id := (v_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid;
  if not public.adle_release_activation_allows_child_v2(v_revision_id,p_child_id)
    or not public.adle_route_activation_revision_is_current_v2(
      v_revision_id,
      v_release_id,
      v_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      v_metadata#>>'{curriculumRelease,dependencyFingerprint}'
    )
  then return false; end if;

  select revision.micro_skill_key into v_micro_skill_key
  from public.adle_route_activation_revisions revision
  join public.adle_curriculum_release_manifests release
    on release.id = revision.release_manifest_id
  where revision.id = v_revision_id
    and revision.environment_key = 'production'
    and revision.release_manifest_id = v_release_id
    and revision.route_id = 'compound_word_lab'
    and revision.route_version = 'v2'
    and revision.activation_route_key = 'compound_word_lab:v2'
    and release.release_key = v_metadata#>>'{curriculumRelease,releaseKey}'
    and release.release_manifest_sha256 = v_metadata#>>'{curriculumRelease,releaseManifestSha256}'
    and release.dependency_fingerprint = v_metadata#>>'{curriculumRelease,dependencyFingerprint}'
    and release.route_id = 'compound_word_lab'
    and release.route_version = 'v2'
    and release.activation_route_key = 'compound_word_lab:v2'
    and release.payload_version = 2;
  if v_micro_skill_key is null or not public.adle_micro_skill_owns_compound_word_lab_v2(v_micro_skill_key)
  then return false; end if;

  select
    (array_agg(dependency.authority_id) filter (where dependency.authority_type='compound_structure'))[1],
    (array_agg(dependency.authority_id) filter (where dependency.authority_type='teaching_content'))[1],
    (array_agg(dependency.authority_id) filter (where dependency.authority_type='teaching_dictionary_closure'))[1]
  into v_structure_authority_id,v_teaching_authority_id,v_closure_authority_id
  from public.adle_curriculum_release_dependencies dependency
  join public.adle_curriculum_dependency_authorities authority
    on authority.id=dependency.authority_id
   and authority.authority_type=dependency.authority_type
   and authority.authority_key=dependency.authority_key
   and authority.schema_version=dependency.authority_schema_version
   and authority.semantic_fingerprint=dependency.semantic_fingerprint
  where dependency.release_manifest_id=v_release_id
    and dependency.micro_skill_key=v_micro_skill_key;
  if v_structure_authority_id is null or v_teaching_authority_id is null or v_closure_authority_id is null
    or (select count(*) from public.adle_curriculum_release_dependencies
        where release_manifest_id=v_release_id and micro_skill_key=v_micro_skill_key) <> 3
  then return false; end if;

  select semantic_projection into v_teaching
  from public.adle_curriculum_dependency_authorities
  where id=v_teaching_authority_id and authority_type='teaching_content';
  select candidate.value->'promptData'->'compoundWordLesson' into v_payload
  from jsonb_array_elements(p_items) candidate(value)
  where candidate.value->'promptData'->>'compoundWordActivityId'='intro-root';
  if v_payload is null
    or v_payload->>'schemaVersion'<>'2'
    or v_payload->>'payloadKind'<>'compound_word_lesson_v2'
    or v_payload#>>'{route,routeId}'<>'compound_word_lab'
    or v_payload#>>'{route,routeVersion}'<>'v2'
    or v_payload->>'microSkillKey'<>v_micro_skill_key
    or v_payload->>'assignmentEligible'<>'true'
    or jsonb_array_length(v_payload#>'{words,lesson}')<>4
    or v_payload->>'contentVersion' is distinct from coalesce(v_teaching#>>'{content,contentVersion}',v_teaching->>'contentVersion')
    or v_payload#>>'{activities,introduction,childFriendlyExplanation}' is distinct from coalesce(v_teaching#>>'{content,childFriendlyExplanation}',v_teaching->>'childFriendlyExplanation')
    or v_payload#>>'{activities,introduction,summary}' is distinct from coalesce(v_teaching#>>'{content,ruleExplanation}',v_teaching->>'ruleExplanation')
    or v_payload#>'{activities,introduction,readingPages}' is distinct from
      coalesce(v_teaching#>'{content,readingPages}',v_teaching->'readingPages')
  then return false; end if;

  if (select count(*) from jsonb_array_elements(p_items) item(value) where value->'metadata'->>'sectionKey'='lesson_intro')<>2
    or (select count(*) from jsonb_array_elements(p_items) item(value) where value->'metadata'->>'sectionKey'='guided_practice')<>8
    or (select count(*) from jsonb_array_elements(p_items) item(value) where value->'metadata'->>'sectionKey'='lesson_production')<>4
    or (select count(*) from jsonb_array_elements(p_items) item(value) where value->'metadata'->>'sectionKey'='lesson_dictation')<>4
    or exists(select 1 from jsonb_array_elements(p_items) item(value)
      where value->'metadata'->>'microSkillKey' is distinct from v_micro_skill_key
        or value->'metadata'->>'provenance' is distinct from 'compound_word_v2')
  then return false; end if;

  for v_word in select value from jsonb_array_elements(v_payload#>'{words,lesson}') loop
    v_structure:=v_word->'structure';
    v_lineage:=v_word->'lineage';
    v_id:=(v_structure->>'wholeCanonicalWordId')::uuid;
    if v_structure->>'microSkillKey'<>v_micro_skill_key
      or v_structure->>'wholeWord'<>v_word#>>'{dictation,targetSpan,exactAnswer}'
      or not exists(
        select 1 from public.canonical_teaching_dictionary_compound_structures_v2 structure
        join public.canonical_teaching_dictionary_words word on word.id=structure.canonical_word_id
        where structure.canonical_word_id=v_id and structure.micro_skill_key=v_micro_skill_key
          and structure.source_metadata->>'dependencyAuthorityId'=v_structure_authority_id::text
          and structure.assignment_eligible and structure.row_status='active'
          and structure.review_status='approved_for_first_exposure'
          and word.display_word=v_structure->>'wholeWord'
      )
      or not exists(
        select 1 from public.adle_teaching_dictionary_closure_words closure
        where closure.authority_id=v_closure_authority_id
          and closure.canonical_word_id=v_id
          and closure.display_word=v_structure->>'wholeWord'
          and closure.dictation_sentence=v_word#>>'{dictation,sentence}'
          and closure.dictation_target_token_index=(v_word#>>'{dictation,targetSpan,startTokenIndex}')::integer
          and closure.dictation_target_end_exclusive=(v_word#>>'{dictation,targetSpan,endTokenIndexExclusive}')::integer
          and closure.exact_governed_answer=v_structure->>'wholeWord'
      )
    then return false; end if;
    if v_lineage->>'kind'='learner_target' then
      if nullif(v_lineage->>'learningItemId','') is null
        or not exists(select 1 from public.adle_learning_items learning
          where learning.id=(v_lineage->>'learningItemId')::uuid
            and learning.child_id=p_child_id and learning.canonical_word_id=v_id
            and learning.micro_skill_key=v_micro_skill_key
            and learning.source_kind='verified_misspelling'
            and learning.row_status='active'
            and learning.item_status in ('pending','pending_reteach'))
      then return false; end if;
    elsif v_lineage->>'kind'='generated_transfer' then
      if v_lineage->'learningItemId'<>'null'::jsonb then return false; end if;
    else return false;
    end if;
    if exists(select 1 from jsonb_array_elements(p_items) item(value)
      where value->'metadata'->>'canonicalWordId'=v_id::text
        and value->'metadata'->>'adleLearningItemRef' is distinct from
          case when v_lineage->>'kind'='learner_target' then v_lineage->>'learningItemId' else null end)
      or (select count(*) from jsonb_array_elements(p_items) item(value)
          where value->'metadata'->>'canonicalWordId'=v_id::text)<>4
    then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

revoke all on function public.adle_release_bound_composed_plan_is_ready_v2(uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.adle_release_bound_composed_plan_is_ready_v2(uuid,jsonb,jsonb,jsonb)
  to service_role;

do $migration$
declare
  v_signature constant text :=
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)';
  v_definition text;
  v_old text := $old$if p_header ? 'lessonRouteMetadata'
    and p_header->'lessonRouteMetadata' <> 'null'::jsonb
    and not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
  then
    raise exception 'ADLE composed plan route metadata validation failed';
  end if;$old$;
  v_new text := $new$if p_header ? 'lessonRouteMetadata'
    and p_header->'lessonRouteMetadata' <> 'null'::jsonb
    and not (
      public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
      or public.adle_lesson_route_metadata_is_valid_v2(p_header->'lessonRouteMetadata')
    )
  then
    raise exception 'ADLE composed plan route metadata validation failed';
  end if;
  if p_header#>>'{lessonRouteMetadata,route,routeId}'='compound_word_lab'
    and not public.adle_release_bound_composed_plan_is_ready_v2(p_child_id,p_header,p_items,p_intakes)
  then
    raise exception 'ADLE release-bound composed plan validation failed';
  end if;$new$;
  v_count_start text := $old$if jsonb_typeof(p_items) <> 'array'
    or ($old$;
  v_count_start_new text := $new$if jsonb_typeof(p_items) <> 'array'
    or (
      not public.adle_release_bound_composed_plan_is_ready_v2(p_child_id,p_header,p_items,p_intakes)
      and ($new$;
  v_count_end text := $old$    )
  then
    raise exception 'ADLE composed plan requires 16 items, except reviewed 18-item profiles or the reviewed 20-item IN/IM/IL/IR snapshot';$old$;
  v_count_end_new text := $new$    ))
  then
    raise exception 'ADLE composed plan requires 16 items, except reviewed 18-item profiles, release-bound plans, or the reviewed 20-item IN/IM/IL/IR snapshot';$new$;
  v_learning_item text := $old$      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',$old$;
  v_learning_item_new text := $new$      v_item->>'sourceEntityId',
      nullif(v_item->>'learningItemId', '')::uuid,
      v_item->>'templateKey',$new$;
begin
  select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'composed-plan predecessor differs from reviewed CW-3C-1 contract';
  end if;
  v_definition:=replace(v_definition,v_old,v_new);
  if position(v_count_start in v_definition)=0
    or position(v_count_end in v_definition)=0
    or position(v_learning_item in v_definition)=0
  then
    raise exception 'composed-plan item-count or lineage predecessor differs from reviewed CW-3C-1 contract';
  end if;
  v_definition:=replace(v_definition,v_count_start,v_count_start_new);
  v_definition:=replace(v_definition,v_count_end,v_count_end_new);
  v_definition:=replace(v_definition,v_learning_item,v_learning_item_new);
  if position(v_old in v_definition)>0 or position(v_new in v_definition)=0
    or position(v_count_start_new in v_definition)=0
    or position(v_count_end in v_definition)>0 or position(v_count_end_new in v_definition)=0
    or position(v_learning_item in v_definition)>0 or position(v_learning_item_new in v_definition)=0
  then
    raise exception 'could not install shared release-bound persistence guard';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)
  to service_role;

create or replace function public.complete_adle_release_bound_word_lab_v2(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_assignment_id uuid,
  p_plan_date date,
  p_micro_skill_key text,
  p_source_ref text,
  p_assignment_item_ids uuid[],
  p_attempts jsonb,
  p_lesson jsonb,
  p_reflection jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_header public.daily_assignments%rowtype;
  v_metadata jsonb;
  v_revision_id uuid;
  v_release_id uuid;
  v_payload jsonb;
  v_bundle_id uuid;
  v_input_bundle_id uuid;
  v_row jsonb;
  v_word_id uuid;
  v_schedule_id uuid;
  v_attempt_count integer;
  v_evidence_route_count integer;
  v_schedule_count integer;
  v_learning_count integer;
  v_committed_at timestamptz:=timezone('utc',now());
begin
  if not public.adle_micro_skill_owns_compound_word_lab_v2(p_micro_skill_key)
    or nullif(btrim(p_source_ref),'') is null
    or jsonb_typeof(p_attempts)<>'array'
    or jsonb_typeof(p_lesson)<>'object'
    or jsonb_typeof(p_reflection)<>'object'
  then raise exception 'Compound Word completion envelope validation failed'; end if;
  select * into v_header from public.daily_assignments
  where id=p_assignment_id and parent_user_id=p_parent_user_id and child_id=p_child_id
    and assignment_date=p_plan_date and title='ADLE Daily Plan'
    and assignment_generation_source='adle_composer_v1' for update;
  if not found then raise exception 'Compound Word completion assignment validation failed'; end if;
  v_metadata:=v_header.lesson_route_metadata;
  v_revision_id:=(v_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid;
  v_release_id:=(v_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid;
  if not public.adle_lesson_route_metadata_is_valid_v2(v_metadata)
    or v_metadata#>>'{route,routeId}'<>'compound_word_lab'
    or not public.adle_release_activation_allows_child_v2(v_revision_id,p_child_id)
    or not public.adle_route_activation_revision_is_current_v2(
      v_revision_id,v_release_id,v_metadata#>>'{curriculumRelease,releaseManifestSha256}',
      v_metadata#>>'{curriculumRelease,dependencyFingerprint}')
  then raise exception 'Compound Word completion release or activation changed'; end if;
  if (select micro_skill_key from public.adle_route_activation_revisions where id=v_revision_id)
      is distinct from p_micro_skill_key
  then raise exception 'Compound Word completion micro-skill mismatch'; end if;
  select prompt_data->'compoundWordLesson' into v_payload
  from public.assignment_items where daily_assignment_id=p_assignment_id
    and prompt_data->>'compoundWordActivityId'='intro-root';
  if v_payload is null or v_payload->>'microSkillKey'<>p_micro_skill_key
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id)<>18
    or coalesce(array_length(p_assignment_item_ids,1),0)<>18
    or (select count(distinct id) from unnest(p_assignment_item_ids) id)<>18
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids))<>18
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='lesson_intro')<>2
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='guided_practice')<>8
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='lesson_production')<>4
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'sectionKey'='lesson_dictation')<>4
  then raise exception 'Compound Word completion requires exact 18-item snapshot'; end if;
  if jsonb_array_length(p_attempts)<>18
    or (select count(*) from jsonb_array_elements(p_attempts) row(value) where value->>'attemptKind'='guided_practice')<>10
    or (select count(*) from jsonb_array_elements(p_attempts) row(value) where value->>'attemptKind'='lesson_production')<>4
    or (select count(*) from jsonb_array_elements(p_attempts) row(value) where value->>'attemptKind'='lesson_dictation')<>4
    or exists(select 1 from jsonb_array_elements(p_attempts) row(value)
      where value->>'childId' is distinct from p_child_id::text
        or value->>'parentUserId' is distinct from p_parent_user_id::text
        or value->>'dailyAssignmentId' is distinct from p_assignment_id::text
        or (value->>'assignmentItemId')::uuid<>all(p_assignment_item_ids)
        or value->>'sourceRef' not like p_source_ref||'%')
    or exists(select 1 from jsonb_array_elements(p_attempts) row(value)
      join public.assignment_items item on item.id=(value->>'assignmentItemId')::uuid
      where value->>'attemptKind' in ('lesson_production','lesson_dictation')
        and (value->>'isCorrect')::boolean is distinct from
          (lower(btrim(value->>'attemptText'))=lower(item.target_word)))
  then raise exception 'Compound Word completion attempt validation failed'; end if;
  if jsonb_array_length(coalesce(p_lesson->'taughtEvents','[]'::jsonb))<>4
    or jsonb_array_length(coalesce(p_lesson->'scheduleWords','[]'::jsonb)) not between 1 and 4
    or jsonb_array_length(coalesce(p_lesson->'itemTransitions','[]'::jsonb))
      <>jsonb_array_length(p_lesson->'scheduleWords')
    or jsonb_typeof(p_lesson->'bundle')<>'object'
    or p_lesson#>>'{bundle,childId}'<>p_child_id::text
    or p_lesson#>>'{bundle,sourceRef}'<>p_source_ref
    or jsonb_array_length(p_lesson->'scheduleWords') <>
      (select count(distinct item.metadata->>'canonicalWordId')
       from public.assignment_items item
       where item.daily_assignment_id=p_assignment_id
         and item.metadata->>'sectionKey'='lesson_production'
         and nullif(item.metadata->>'adleLearningItemRef','') is not null)
  then raise exception 'Compound Word completion learner-provenance contract failed'; end if;
  if exists(select 1 from jsonb_array_elements(p_lesson->'scheduleWords') row(value)
    where value->>'childId' is distinct from p_child_id::text
      or value->>'bundleId' is distinct from p_lesson#>>'{bundle,bundleId}'
      or not exists(select 1 from public.assignment_items item
      where item.daily_assignment_id=p_assignment_id
        and item.metadata->>'canonicalWordId'=value->>'canonicalWordId'
        and item.metadata->>'sectionKey'='lesson_production'
        and nullif(item.metadata->>'adleLearningItemRef','') is not null))
    or exists(select 1 from public.assignment_items item
      where item.daily_assignment_id=p_assignment_id
        and item.metadata->>'sectionKey'='lesson_production'
        and nullif(item.metadata->>'adleLearningItemRef','') is null
        and exists(select 1 from jsonb_array_elements(p_lesson->'scheduleWords') row(value)
          where value->>'canonicalWordId'=item.metadata->>'canonicalWordId'))
    or exists(select 1 from jsonb_array_elements(p_lesson->'itemTransitions') row(value)
      where value->>'childId' is distinct from p_child_id::text
        or value->>'microSkillKey' is distinct from p_micro_skill_key
        or not exists(select 1 from public.assignment_items item
          where item.daily_assignment_id=p_assignment_id
            and item.metadata->>'sectionKey'='lesson_production'
            and item.metadata->>'canonicalWordId'=value->>'canonicalWordId'
            and item.metadata->>'adleLearningItemRef'=value->>'learningItemId'))
    or exists(select 1 from jsonb_array_elements(p_lesson->'taughtEvents') row(value)
      where value->>'childId' is distinct from p_child_id::text
        or value->>'sourceRef' is distinct from p_source_ref)
  then raise exception 'Generated Compound practice cannot enter learner scheduling'; end if;
  if p_reflection->>'childId'<>p_child_id::text
    or p_reflection->>'parentUserId'<>p_parent_user_id::text
    or p_reflection->>'assignmentId'<>p_assignment_id::text
    or p_reflection->>'microSkillKey'<>p_micro_skill_key
    or p_reflection->>'contentVersion'<>v_payload->>'contentVersion'
    or p_reflection->>'promptKey'<>v_payload#>>'{activities,reflection,promptKey}'
    or p_reflection->>'promptText'<>v_payload#>>'{activities,reflection,promptText}'
    or char_length(btrim(coalesce(p_reflection->>'reflectionText',''))) not between 1 and 2000
  then raise exception 'Compound Word reflection validation failed'; end if;

  select count(*),(array_agg(id))[1] into v_schedule_count,v_bundle_id
  from public.adle_review_bundles where child_id=p_child_id and source_ref=p_source_ref and row_status='active';
  if v_schedule_count>1 then raise exception 'Duplicate Compound completion bundle'; end if;
  if v_header.status<>'completed' then
    v_input_bundle_id:=(p_lesson->'bundle'->>'bundleId')::uuid;
    if v_bundle_id is null then
      v_bundle_id:=v_input_bundle_id;
      insert into public.adle_review_bundles(id,child_id,source_ref,interval_index,next_due_on,schedule_policy_version,bundle_status,row_status)
      values(v_bundle_id,p_child_id,p_source_ref,(p_lesson->'bundle'->>'intervalIndex')::integer,
        (p_lesson->'bundle'->>'nextDueOn')::date,p_lesson->'bundle'->>'schedulePolicyVersion',
        p_lesson->'bundle'->>'bundleStatus','active');
    end if;
    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      v_word_id:=(v_row->>'canonicalWordId')::uuid;
      update public.adle_review_schedule_word_routes route set row_status='superseded'
      where route.schedule_word_id in (select id from public.adle_review_schedule_words
        where child_id=p_child_id and canonical_word_id=v_word_id and row_status='active');
      update public.adle_review_schedule_words set row_status='superseded',updated_at=v_committed_at
      where child_id=p_child_id and canonical_word_id=v_word_id and row_status='active';
      insert into public.adle_review_schedule_words(child_id,canonical_word_id,bundle_id,membership_status,catch_up_stage,next_retest_due_on,failed_review_on,pre_retirement_check_due_on,last_28_day_review_on,reteach_cycle_count,taught_on,row_status)
      values(p_child_id,v_word_id,v_bundle_id,v_row->>'membershipStatus',(v_row->>'catchUpStage')::integer,
        nullif(v_row->>'nextRetestDueOn','')::date,nullif(v_row->>'failedReviewOn','')::date,
        nullif(v_row->>'preRetirementCheckDueOn','')::date,nullif(v_row->>'last28DayReviewOn','')::date,
        (v_row->>'reteachCycleCount')::integer,(v_row->>'taughtOn')::date,'active') returning id into v_schedule_id;
      insert into public.adle_review_schedule_word_routes(schedule_word_id,learning_item_id,micro_skill_key,attached_on,attachment_ordinal,row_status)
      select v_schedule_id,item.id,item.micro_skill_key,(v_row->>'taughtOn')::date,1,'active'
      from public.adle_learning_items item
      join public.assignment_items assignment_item
        on assignment_item.daily_assignment_id=p_assignment_id
       and assignment_item.metadata->>'sectionKey'='lesson_production'
       and assignment_item.metadata->>'adleLearningItemRef'=item.id::text
      where item.child_id=p_child_id and item.canonical_word_id=v_word_id
        and item.micro_skill_key=p_micro_skill_key and item.source_kind='verified_misspelling'
        and item.row_status='active';
      if not found then raise exception 'Authentic Compound schedule lost learner lineage'; end if;
    end loop;
    insert into public.adle_taught_word_history(child_id,canonical_word_id,event_kind,occurred_on,source_ref,row_status,attempt_text)
    select p_child_id,(value->>'canonicalWordId')::uuid,value->>'eventKind',(value->>'occurredOn')::date,p_source_ref,'active',value->>'attemptText'
    from jsonb_array_elements(p_lesson->'taughtEvents')
    on conflict do nothing;
    for v_row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
      update public.adle_learning_items set item_status=v_row->>'itemStatus',reteach_priority=(v_row->>'reteachPriority')::boolean,
        ejected_on=nullif(v_row->>'ejectedOn','')::date,row_status=v_row->>'rowStatus',updated_at=v_committed_at
      where id=(v_row->>'learningItemId')::uuid and child_id=p_child_id
        and canonical_word_id=(v_row->>'canonicalWordId')::uuid and micro_skill_key=p_micro_skill_key;
      if not found then raise exception 'Compound learning-item transition target missing'; end if;
    end loop;
    insert into public.adle_assignment_attempt_events(child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref)
    select (value->>'childId')::uuid,(value->>'parentUserId')::uuid,(value->>'dailyAssignmentId')::uuid,
      (value->>'assignmentItemId')::uuid,nullif(value->>'canonicalWordId','')::uuid,nullif(value->>'microSkillKey',''),
      value->>'sectionKey',nullif(value->>'templateKey',''),nullif(value->>'targetWord',''),value->>'attemptText',
      nullif(value->>'isCorrect','')::boolean,value->>'attemptKind',value->>'evidenceClass',value->>'sourceRef'
    from jsonb_array_elements(p_attempts) on conflict(assignment_item_id,attempt_kind,source_ref) do nothing;
    insert into public.adle_assignment_attempt_event_routes(attempt_event_id,learning_item_id,micro_skill_key)
    select event.id,item.learning_item_id,p_micro_skill_key
    from public.adle_assignment_attempt_events event
    join public.assignment_items item on item.id=event.assignment_item_id
    where event.daily_assignment_id=p_assignment_id
      and item.daily_assignment_id=p_assignment_id
      and item.learning_item_id is not null
      and event.canonical_word_id is not null
    on conflict(attempt_event_id,learning_item_id) do nothing;
    insert into public.adle_child_learning_reflections(child_id,parent_user_id,daily_assignment_id,micro_skill_key,content_version,prompt_key,prompt_text,reflection_text,updated_at)
    values(p_child_id,p_parent_user_id,p_assignment_id,p_micro_skill_key,p_reflection->>'contentVersion',p_reflection->>'promptKey',p_reflection->>'promptText',btrim(p_reflection->>'reflectionText'),v_committed_at)
    on conflict(daily_assignment_id,prompt_key) do nothing;
    update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);
    update public.daily_assignments set status='completed' where id=p_assignment_id;
  end if;
  select count(*) into v_attempt_count from public.adle_assignment_attempt_events where daily_assignment_id=p_assignment_id;
  select count(*) into v_evidence_route_count
  from public.adle_assignment_attempt_event_routes route
  join public.adle_assignment_attempt_events event on event.id=route.attempt_event_id
  where event.daily_assignment_id=p_assignment_id;
  select count(*) into v_schedule_count from public.adle_review_schedule_words where child_id=p_child_id and bundle_id=v_bundle_id and row_status='active';
  select count(*) into v_learning_count from public.adle_review_schedule_word_routes route
    join public.adle_review_schedule_words schedule on schedule.id=route.schedule_word_id
    where schedule.bundle_id=v_bundle_id and route.row_status='active';
  if v_attempt_count<>18 or v_schedule_count<>jsonb_array_length(p_lesson->'scheduleWords')
    or v_learning_count<>v_schedule_count
    or v_evidence_route_count<>8
    or (select count(*) from public.assignment_items where daily_assignment_id=p_assignment_id and status='completed')<>18
    or (select count(*) from public.adle_taught_word_history where child_id=p_child_id and source_ref=p_source_ref and row_status='active')<>4
    or (select count(*) from public.adle_child_learning_reflections where daily_assignment_id=p_assignment_id)<>1
  then raise exception 'Compound Word durable contract verification failed'; end if;
  return jsonb_build_object('status',case when v_header.status='completed' then 'already_completed' else 'completed' end,
    'committedAt',v_committed_at,'counts',jsonb_build_object('header',1,'items',18,'attempts',18,
      'guided',10,'controlled',4,'dictation',4,'reflection',1,'learningItems',v_learning_count,
      'evidenceRoutes',v_evidence_route_count,'taught',4,'schedule',v_schedule_count));
end;
$$;

revoke all on function public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.complete_adle_release_bound_word_lab_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)
  to service_role;

commit;
