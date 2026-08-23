begin;

-- Additive route-specific validator. Compound and generic Snapshot v3 semantics
-- remain owned by their existing validators.
create or replace function public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot jsonb)
returns boolean language plpgsql immutable security definer
set search_path = public, extensions, pg_temp as $$
declare v_activity jsonb; v_binding jsonb; v_ordinal integer; v_item_count integer;
begin
  v_item_count := coalesce((p_snapshot#>>'{assignment,itemCount}')::integer, 0);
  if jsonb_typeof(p_snapshot) <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot)) <> 15
    or p_snapshot->>'snapshotSchemaVersion' <> '3'
    or p_snapshot->>'compilerVersion' <> 'adle_specialist_snapshot_compiler_v3'
    or p_snapshot->>'validatorVersion' <> 'adle_specialist_snapshot_validator_v3'
    or p_snapshot->>'canonicalContractRegistryVersion' <> 'adle_specialist_canonical_contracts_v1'
    or p_snapshot#>>'{route,routeId}' <> 'dynamic_affix_word_lab'
    or p_snapshot#>>'{route,routeVersion}' <> 'v3'
    or p_snapshot#>>'{recipe,recipeKey}' <> 'dynamic_affix_word_lab'
    or p_snapshot#>>'{recipe,recipeVersion}' <> 'v3'
    or p_snapshot#>>'{payload,kind}' <> 'dynamic_affix_lesson_v3'
    or p_snapshot#>>'{payload,version}' <> '3'
    or jsonb_typeof(p_snapshot#>'{payload,resolvedLesson}') <> 'object'
    or p_snapshot#>>'{runtime,adapterKey}' <> 'dynamic_affix_v3'
    or p_snapshot#>>'{runtime,rendererKey}' <> 'morphology_guided'
    or p_snapshot#>>'{assignment,generationSource}' <> 'adle_composer_v1'
    or v_item_count not in (16,18)
    or jsonb_typeof(p_snapshot->'words') <> 'array' or jsonb_array_length(p_snapshot->'words') <> 4
    or jsonb_typeof(p_snapshot->'activities') <> 'array' or jsonb_array_length(p_snapshot->'activities') not in (7,8)
    or jsonb_typeof(p_snapshot->'segments') <> 'array' or jsonb_array_length(p_snapshot->'segments') <> 1
    or jsonb_typeof(p_snapshot->'contentVersions') <> 'array' or jsonb_array_length(p_snapshot->'contentVersions') <> 17
    or p_snapshot#>>'{provenance,sourceKind}' <> 'compiled_specialist_assignment'
    or p_snapshot#>>'{provenance,fingerprintAlgorithm}' <> 'sha256'
    or p_snapshot#>>'{provenance,fingerprintVersion}' <> '1'
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}','') !~ '^[a-f0-9]{64}$'
  then return false; end if;

  for v_activity, v_ordinal in
    select value, ordinality::integer from jsonb_array_elements(p_snapshot->'activities') with ordinality
  loop
    if jsonb_typeof(v_activity) <> 'object'
      or v_activity->>'contractVersion' <> '3' or v_activity->>'order' <> v_ordinal::text
      or nullif(btrim(v_activity->>'activityId'),'') is null
      or jsonb_typeof(v_activity->'itemBindings') <> 'array'
      or jsonb_typeof(v_activity->'wordSnapshotIds') <> 'array'
      or jsonb_typeof(v_activity->'payload') <> 'object'
      or concat(v_activity#>>'{canonical,concept}','.',v_activity#>>'{canonical,mode}','@',v_activity#>>'{canonical,contractVersion}') not in (
        'INTRODUCTION.teaching_page@1','MEANING_DISCOVERY.suffix@1','CLEAVER.find_boundaries@1',
        'MEANING_SORT.meaning@1','WORD_ASSEMBLY.definition_word_builder@1',
        'COVER_CHECK.component_marked@1','DICTATION.target_token@1',
        'LESSON_REFLECTION.standard_lesson_reflection@1')
      or (v_activity->>'ownership' = 'route_owned' and (v_activity->>'activityId' not in ('discover','lesson-reflection') or jsonb_array_length(v_activity->'itemBindings') <> 0))
      or (v_activity->>'ownership' = 'assignment_items' and jsonb_array_length(v_activity->'itemBindings') < 1)
      or v_activity->>'ownership' not in ('route_owned','assignment_items')
    then return false; end if;
    for v_binding in select value from jsonb_array_elements(v_activity->'itemBindings') loop
      if jsonb_typeof(v_binding) <> 'object' or nullif(btrim(v_binding->>'sourceEntityId'),'') is null
        or coalesce(v_binding->>'position','') !~ '^[0-9]+$'
        or v_binding->>'inputSource' <> 'assignment_items.prompt_data' then return false; end if;
    end loop;
  end loop;
  if (select count(*) <> v_item_count from jsonb_array_elements(p_snapshot->'activities') a,
      jsonb_array_elements(a.value->'itemBindings') b)
    or (select count(*) <> count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p_snapshot->'activities') a,
      jsonb_array_elements(a.value->'itemBindings') b)
    or public.adle_generic_snapshot_json_sha256_v1(p_snapshot #- '{provenance,sourceFingerprint}')
      <> p_snapshot#>>'{provenance,sourceFingerprint}' then return false;
  end if;
  return true;
exception when others then return false;
end $$;

create or replace function public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p_snapshot->>'snapshotSchemaVersion'
    when '2' then public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot)
    when '3' then case p_snapshot#>>'{route,routeId}'
      when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
      when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
      else false end
    else false end
$$;

alter table public.daily_assignments drop constraint if exists daily_assignments_compiled_lesson_snapshot_versioned_check;
alter table public.daily_assignments add constraint daily_assignments_compiled_lesson_snapshot_versioned_check
check (compiled_lesson_snapshot is null or public.adle_lesson_snapshot_is_structurally_valid(compiled_lesson_snapshot));

create or replace function public.persist_adle_specialist_daily_plan_v3(
  p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_assignment_id uuid; v_existing_id uuid; v_existing_snapshot jsonb; v_item jsonb; v_intake jsonb;
  v_position integer; v_route text; v_version text; v_kind text; v_expected_count integer;
begin
  if not exists (select 1 from public.children where id=p_child_id and parent_user_id=p_parent_user_id and coalesce(is_archived,false)=false)
    then raise exception 'ADLE specialist v3 plan child ownership validation failed'; end if;
  v_route := p_snapshot#>>'{route,routeId}'; v_version := p_snapshot#>>'{route,routeVersion}';
  v_kind := p_snapshot#>>'{payload,kind}'; v_expected_count := coalesce((p_snapshot#>>'{assignment,itemCount}')::integer,0);
  if not ((v_route='compound_word_lab' and v_version='v2' and v_kind='compound_word_lesson_v2' and v_expected_count=18
      and public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot))
    or (v_route='dynamic_affix_word_lab' and v_version='v3' and v_kind='dynamic_affix_lesson_v3' and v_expected_count in (16,18)
      and public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)))
    then raise exception 'ADLE specialist v3 plan snapshot durable validation failed'; end if;
  if jsonb_typeof(p_header)<>'object' or p_header->>'childId'<>p_child_id::text
    or p_header->>'parentUserId'<>p_parent_user_id::text or p_header->>'assignmentDate'<>p_plan_date::text
    or p_header->>'title'<>'ADLE Daily Plan' or p_header->>'status'<>'pending'
    or p_header->>'assignmentGenerationSource'<>'adle_composer_v1'
    or not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
    or p_header#>>'{lessonRouteMetadata,route,routeId}'<>v_route
    or p_header#>>'{lessonRouteMetadata,route,routeVersion}'<>v_version
    or p_header#>>'{lessonRouteMetadata,recipe,recipeKey}'<>v_route
    or p_header#>>'{lessonRouteMetadata,recipe,recipeVersion}'<>v_version
    or p_header#>>'{lessonRouteMetadata,payload,kind}'<>v_kind
    or p_header#>>'{lessonRouteMetadata,payload,version}'<>replace(v_version,'v','')
    then raise exception 'ADLE specialist v3 plan header validation failed'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>v_expected_count or jsonb_typeof(p_intakes)<>'array'
    then raise exception 'ADLE specialist v3 plan collection validation failed'; end if;
  for v_item,v_position in select value,ordinality::integer from jsonb_array_elements(p_items) with ordinality loop
    if jsonb_typeof(v_item)<>'object' or v_item->>'childId'<>p_child_id::text or v_item->>'parentUserId'<>p_parent_user_id::text
      or v_item->>'position'<>v_position::text or v_item->>'domainModule'<>'spelling' or v_item->>'sourceType'<>'adle_composer'
      or v_item->>'status'<>'ready' or nullif(btrim(v_item->>'sourceEntityId'),'') is null
      or nullif(btrim(v_item->>'templateKey'),'') is null or jsonb_typeof(v_item->'promptData')<>'object'
      or jsonb_typeof(v_item->'metadata')<>'object' or v_item#>>'{metadata,planDate}'<>p_plan_date::text
      or nullif(btrim(v_item#>>'{metadata,sectionKey}'),'') is null
      then raise exception 'ADLE specialist v3 plan item validation failed at position %',v_position; end if;
  end loop;
  if exists (with bindings as (select a.value->>'sectionKey' section_key,b.value from jsonb_array_elements(p_snapshot->'activities') a,
      jsonb_array_elements(a.value->'itemBindings') b)
    select 1 from bindings full join jsonb_array_elements(p_items) i on bindings.value->>'sourceEntityId'=i.value->>'sourceEntityId'
    where bindings.value is null or i.value is null or bindings.value->>'position'<>i.value->>'position'
      or bindings.section_key<>i.value#>>'{metadata,sectionKey}')
    then raise exception 'ADLE specialist v3 snapshot and item bindings disagree'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':ADLE Daily Plan',0));
  select id,compiled_lesson_snapshot into v_existing_id,v_existing_snapshot from public.daily_assignments
    where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date
      and title='ADLE Daily Plan' and assignment_generation_source='adle_composer_v1';
  if v_existing_id is not null then
    if v_existing_snapshot#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}'
      then raise exception 'ADLE specialist v3 plan idempotency conflict'; end if; return v_existing_id;
  end if;
  if exists(select 1 from public.daily_assignments where child_id=p_child_id and assignment_date=p_plan_date and title='ADLE Daily Plan')
    then raise exception 'ADLE specialist v3 plan assignment envelope already exists'; end if;
  insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,
    assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot) values(p_child_id,p_parent_user_id,p_plan_date,
    p_header->>'title',p_header->>'status',array(select jsonb_array_elements_text(coalesce(p_header->'targetWords','[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords','[]'::jsonb))),p_header->>'assignmentGenerationSource',
    p_header->'lessonRouteMetadata',p_snapshot) returning id into v_assignment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,
      learning_item_id,template_key,target_word,position,status,prompt_data,metadata) values(v_assignment_id,p_child_id,p_parent_user_id,
      v_item->>'domainModule',v_item->>'itemType',v_item->>'sourceType',v_item->>'sourceEntityId',null,v_item->>'templateKey',
      nullif(v_item->>'targetWord',''),(v_item->>'position')::integer,v_item->>'status',coalesce(v_item->'promptData','{}'::jsonb),
      coalesce(v_item->'metadata','{}'::jsonb));
  end loop;
  for v_intake in select value from jsonb_array_elements(p_intakes) loop
    if v_intake->>'childId'<>p_child_id::text or nullif(btrim(v_intake->>'canonicalWordId'),'') is null
      or nullif(btrim(v_intake->>'microSkillKey'),'') is null or v_intake->>'rowStatus'<>'active'
      then raise exception 'ADLE specialist v3 plan intake validation failed'; end if;
    update public.adle_learning_items set row_status='superseded',updated_at=timezone('utc',now()) where child_id=p_child_id
      and canonical_word_id=(v_intake->>'canonicalWordId')::uuid and micro_skill_key=v_intake->>'microSkillKey' and row_status='active';
    insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,
      reteach_priority,ejected_on,intake_on,row_status) values(p_child_id,(v_intake->>'canonicalWordId')::uuid,v_intake->>'microSkillKey',
      v_intake->>'itemStatus',v_intake->>'sourceKind',v_intake->>'sourceRef',nullif(v_intake->>'sourceAttemptText',''),
      coalesce((v_intake->>'reteachPriority')::boolean,false),nullif(v_intake->>'ejectedOn','')::date,(v_intake->>'intakeOn')::date,'active');
  end loop;
  return v_assignment_id;
end $$;

revoke all on function public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(jsonb) from public,anon,authenticated;
grant execute on function public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(jsonb) to authenticated,service_role;
revoke all on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) from public,anon,authenticated;
grant execute on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) to authenticated,service_role;
revoke all on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
comment on function public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(jsonb) is
  'Route-specific additive Snapshot v3 structural validator for dynamic_affix_word_lab:v3.';
comment on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) is
  'Service-only atomic Specialist Snapshot v3 persistence for approved Compound and Dynamic Affix routes.';

commit;
