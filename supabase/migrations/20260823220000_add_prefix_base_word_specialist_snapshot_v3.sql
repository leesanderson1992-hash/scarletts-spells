begin;

-- Additive validators for the two remaining registered first-impression
-- specialist routes. Existing generic, Compound and Dynamic Affix validators
-- are deliberately not redefined.
create or replace function public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot jsonb)
returns boolean language plpgsql immutable security definer
set search_path=public,extensions,pg_temp as $$
declare v_route text:=p_snapshot#>>'{route,routeId}'; v_count integer:=coalesce((p_snapshot#>>'{assignment,itemCount}')::integer,0);
  v_activity jsonb; v_binding jsonb;
begin
  if jsonb_typeof(p_snapshot)<>'object' or p_snapshot->>'snapshotSchemaVersion'<>'3'
    or p_snapshot->>'compilerVersion'<>'adle_specialist_snapshot_compiler_v3'
    or p_snapshot->>'validatorVersion'<>'adle_specialist_snapshot_validator_v3'
    or p_snapshot->>'canonicalContractRegistryVersion'<>'adle_specialist_canonical_contracts_v1'
    or v_route not in ('dynamic_prefix_word_lab','base_word_lab')
    or jsonb_typeof(p_snapshot#>'{payload,resolvedLesson}')<>'object'
    or jsonb_typeof(p_snapshot->'activities')<>'array' or jsonb_typeof(p_snapshot->'words')<>'array'
    or jsonb_typeof(p_snapshot->'contentVersions')<>'array' or jsonb_array_length(p_snapshot->'contentVersions')<7
    or p_snapshot#>>'{provenance,sourceKind}'<>'compiled_specialist_assignment'
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}','')!~'^[a-f0-9]{64}$' then return false; end if;
  if v_route='dynamic_prefix_word_lab' and (p_snapshot#>>'{route,routeVersion}'<>'v2'
      or p_snapshot#>>'{recipe,recipeKey}'<>'dynamic_prefix_word_lab' or p_snapshot#>>'{recipe,recipeVersion}'<>'v2'
      or p_snapshot#>>'{payload,kind}'<>'dynamic_prefix_lesson_v2' or p_snapshot#>>'{payload,version}'<>'2'
      or p_snapshot#>>'{runtime,adapterKey}'<>'dynamic_prefix_v2' or p_snapshot#>>'{runtime,rendererKey}'<>'morphology_guided'
      or p_snapshot#>>'{assignment,generationSource}'<>'adle_composer_v1' or v_count not in (16,18,20)
      or jsonb_array_length(p_snapshot->'words')<>4 or jsonb_array_length(p_snapshot->'contentVersions')<>17) then return false; end if;
  if v_route='base_word_lab' and (p_snapshot#>>'{route,routeVersion}'<>'v2'
      or p_snapshot#>>'{recipe,recipeKey}'<>'base_word_family' or p_snapshot#>>'{recipe,recipeVersion}'<>'v1'
      or p_snapshot#>>'{payload,kind}'<>'base_word_family_snapshot_v1' or p_snapshot#>>'{payload,version}'<>'1'
      or p_snapshot#>>'{runtime,adapterKey}'<>'base_word_family_v1' or p_snapshot#>>'{runtime,rendererKey}'<>'base_word_family_guided'
      or p_snapshot#>>'{assignment,generationSource}'<>'adle_base_word_family_pilot_v1' or v_count<>18
      or jsonb_array_length(p_snapshot->'words')<>6 or jsonb_array_length(p_snapshot->'contentVersions')<>7) then return false; end if;
  for v_activity in select value from jsonb_array_elements(p_snapshot->'activities') loop
    if jsonb_typeof(v_activity)<>'object' or jsonb_typeof(v_activity->'itemBindings')<>'array'
      or concat(v_activity#>>'{canonical,concept}','.',v_activity#>>'{canonical,mode}','@',v_activity#>>'{canonical,contractVersion}') not in (
        'INTRODUCTION.teaching_page@1','MEANING_DISCOVERY.prefix@1','CLEAVER.find_boundaries@1','CLEAVER.isolate_component@1',
        'MEANING_SORT.meaning@1','MEANING_SORT.prefix_form@1','WORD_ASSEMBLY.definition_word_builder@1',
        'WORD_FAMILY_REVEAL.base_led_family@1','COVER_CHECK.component_marked@1','COVER_CHECK.ratio_close_policy@1',
        'COVER_CHECK.whole_word@1','DICTATION.target_token@1','LESSON_REFLECTION.standard_lesson_reflection@1') then return false; end if;
    for v_binding in select value from jsonb_array_elements(v_activity->'itemBindings') loop
      if nullif(btrim(v_binding->>'sourceEntityId'),'') is null or coalesce(v_binding->>'position','')!~'^[0-9]+$'
        or v_binding->>'inputSource'<>'assignment_items.prompt_data' then return false; end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings'))<>v_count
    or (select count(*)<>count(distinct b.value->>'sourceEntityId') from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings') b)
    or public.adle_generic_snapshot_json_sha256_v1(p_snapshot#-'{provenance,sourceFingerprint}')<>p_snapshot#>>'{provenance,sourceFingerprint}' then return false; end if;
  return true;
exception when others then return false;
end $$;

create or replace function public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select case p_snapshot->>'snapshotSchemaVersion' when '2' then public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot)
 when '3' then case p_snapshot#>>'{route,routeId}'
  when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  else false end else false end $$;

alter table public.daily_assignments drop constraint if exists daily_assignments_compiled_lesson_snapshot_versioned_check;
alter table public.daily_assignments add constraint daily_assignments_compiled_lesson_snapshot_versioned_check
check(compiled_lesson_snapshot is null or public.adle_lesson_snapshot_is_structurally_valid(compiled_lesson_snapshot));

create or replace function public.persist_adle_specialist_daily_plan_v3(
 p_parent_user_id uuid,p_child_id uuid,p_plan_date date,p_header jsonb,p_items jsonb,p_intakes jsonb,p_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_existing_snapshot jsonb; v_item jsonb; v_intake jsonb; v_pos integer; v_route text:=p_snapshot#>>'{route,routeId}';
 v_count integer:=coalesce((p_snapshot#>>'{assignment,itemCount}')::integer,0); v_title text:=p_header->>'title'; v_base boolean:=v_route='base_word_lab';
 v_micro text:=p_snapshot#>>'{taxonomy,microSkillKey}'; v_run integer; v_activation uuid; v_manifest uuid; v_manifest_sha text; v_dependency text;
begin
 if not exists(select 1 from public.children where id=p_child_id and parent_user_id=p_parent_user_id and coalesce(is_archived,false)=false) then raise exception 'ADLE specialist v3 child ownership validation failed'; end if;
 if not public.adle_lesson_snapshot_is_structurally_valid(p_snapshot) or v_route not in ('compound_word_lab','dynamic_affix_word_lab','dynamic_prefix_word_lab','base_word_lab') then raise exception 'ADLE specialist v3 snapshot durable validation failed'; end if;
 if jsonb_typeof(p_header)<>'object' or p_header->>'childId'<>p_child_id::text or p_header->>'parentUserId'<>p_parent_user_id::text
   or p_header->>'assignmentDate'<>p_plan_date::text or p_header->>'status'<>'pending'
   or p_header#>>'{lessonRouteMetadata,route,routeId}'<>v_route or p_header#>>'{lessonRouteMetadata,route,routeVersion}'<>p_snapshot#>>'{route,routeVersion}'
   or p_header#>>'{lessonRouteMetadata,recipe,recipeKey}'<>p_snapshot#>>'{recipe,recipeKey}'
   or p_header#>>'{lessonRouteMetadata,recipe,recipeVersion}'<>p_snapshot#>>'{recipe,recipeVersion}'
   or p_header#>>'{lessonRouteMetadata,payload,kind}'<>p_snapshot#>>'{payload,kind}'
   or p_header#>>'{lessonRouteMetadata,payload,version}'<>p_snapshot#>>'{payload,version}'
   or (v_base and (v_title<>'ADLE Base-word Family Pilot' or p_header->>'assignmentGenerationSource'<>'adle_base_word_family_pilot_v1'))
   or (not v_base and (v_title<>'ADLE Daily Plan' or p_header->>'assignmentGenerationSource'<>'adle_composer_v1')) then raise exception 'ADLE specialist v3 header validation failed'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>v_count or jsonb_typeof(p_intakes)<>'array' then raise exception 'ADLE specialist v3 collections invalid'; end if;
 for v_item,v_pos in select value,ordinality::integer from jsonb_array_elements(p_items) with ordinality loop
  if v_item->>'childId'<>p_child_id::text or v_item->>'parentUserId'<>p_parent_user_id::text or v_item->>'position'<>v_pos::text
    or v_item->>'domainModule'<>'spelling' or v_item->>'status'<>'ready' or v_item#>>'{metadata,planDate}'<>p_plan_date::text
    or v_item->>'sourceType'<>(case when v_base then 'adle_base_word_family_pilot' else 'adle_composer' end) then raise exception 'ADLE specialist v3 item invalid at %',v_pos; end if;
 end loop;
 if exists(with b as(select a.value->>'sectionKey' section_key,x.value from jsonb_array_elements(p_snapshot->'activities') a,jsonb_array_elements(a.value->'itemBindings') x)
  select 1 from b full join jsonb_array_elements(p_items) i on b.value->>'sourceEntityId'=i.value->>'sourceEntityId'
  where b.value is null or i.value is null or b.value->>'position'<>i.value->>'position' or b.section_key<>i.value#>>'{metadata,sectionKey}') then raise exception 'ADLE specialist v3 bindings disagree'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_child_id::text||':'||p_plan_date::text||':'||v_title,0));
 select id,compiled_lesson_snapshot into v_id,v_existing_snapshot from public.daily_assignments where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date and title=v_title;
 if v_id is not null then if v_existing_snapshot#>>'{provenance,sourceFingerprint}' is distinct from p_snapshot#>>'{provenance,sourceFingerprint}' then raise exception 'ADLE specialist v3 idempotency conflict'; end if; return v_id; end if;
 if v_base then
  v_activation:=(p_header#>>'{lessonRouteMetadata,curriculumRelease,activationRevisionId}')::uuid; v_manifest:=(p_header#>>'{lessonRouteMetadata,curriculumRelease,releaseManifestId}')::uuid;
  v_manifest_sha:=p_header#>>'{lessonRouteMetadata,curriculumRelease,releaseManifestSha256}'; v_dependency:=p_header#>>'{lessonRouteMetadata,curriculumRelease,dependencyFingerprint}';
  if not public.adle_route_activation_revision_is_current_v2(v_activation,v_manifest,v_manifest_sha,v_dependency) then raise exception 'Base Word release authority changed before persistence'; end if;
  if not exists(select 1 from public.adle_route_activation_revisions where id=v_activation and release_manifest_id=v_manifest
    and route_id='base_word_lab' and route_version='v2' and micro_skill_key=v_micro and activation_status='enabled')
    then raise exception 'Base Word snapshot is outside its active release'; end if;
 end if;
 insert into public.daily_assignments(child_id,parent_user_id,assignment_date,title,status,target_words,review_words,assignment_generation_source,lesson_route_metadata,compiled_lesson_snapshot)
 values(p_child_id,p_parent_user_id,p_plan_date,v_title,'pending',array(select jsonb_array_elements_text(coalesce(p_header->'targetWords','[]'))),array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords','[]'))),p_header->>'assignmentGenerationSource',p_header->'lessonRouteMetadata',p_snapshot) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  insert into public.assignment_items(daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,source_entity_id,learning_item_id,template_key,target_word,position,status,prompt_data,metadata)
  values(v_id,p_child_id,p_parent_user_id,v_item->>'domainModule',v_item->>'itemType',v_item->>'sourceType',v_item->>'sourceEntityId',null,v_item->>'templateKey',nullif(v_item->>'targetWord',''),(v_item->>'position')::integer,'ready',v_item->'promptData',v_item->'metadata');
 end loop;
 if v_base then select count(*)+1 into v_run from public.adle_base_word_family_pilot_runs where child_id=p_child_id and run_status<>'cancelled'; insert into public.adle_base_word_family_pilot_runs(assignment_id,child_id,parent_user_id,pilot_lesson_number) values(v_id,p_child_id,p_parent_user_id,v_run); end if;
 for v_intake in select value from jsonb_array_elements(p_intakes) loop
  if v_base then raise exception 'Base Word specialist snapshots do not permit intakes'; end if;
  if v_intake->>'childId'<>p_child_id::text or nullif(btrim(v_intake->>'canonicalWordId'),'') is null
    or nullif(btrim(v_intake->>'microSkillKey'),'') is null or v_intake->>'rowStatus'<>'active'
    then raise exception 'ADLE specialist v3 intake validation failed'; end if;
  update public.adle_learning_items set row_status='superseded',updated_at=timezone('utc',now()) where child_id=p_child_id and canonical_word_id=(v_intake->>'canonicalWordId')::uuid and micro_skill_key=v_intake->>'microSkillKey' and row_status='active';
  insert into public.adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status)
  values(p_child_id,(v_intake->>'canonicalWordId')::uuid,v_intake->>'microSkillKey',v_intake->>'itemStatus',v_intake->>'sourceKind',v_intake->>'sourceRef',nullif(v_intake->>'sourceAttemptText',''),coalesce((v_intake->>'reteachPriority')::boolean,false),nullif(v_intake->>'ejectedOn','')::date,(v_intake->>'intakeOn')::date,'active');
 end loop;
 return v_id;
end $$;

revoke all on function public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(jsonb) from public,anon,authenticated;
grant execute on function public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(jsonb) to authenticated,service_role;
revoke all on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
comment on function public.persist_adle_specialist_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) is 'Service-only atomic Specialist Snapshot v3 persistence for every registered first-impression specialist route.';

commit;
