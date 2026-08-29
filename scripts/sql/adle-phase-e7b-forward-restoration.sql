-- Generated from the final Production pg_get_functiondef receipt captured by Phase E7A/E7B.
-- Restoration is separately governed. Never repair or replay the historical migration ledger.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $phase_e7b_restore_preflight$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)',
    'public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)',
    'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)',
    'public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)',
    'public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)',
    'public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)',
    'public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Phase E7B restoration expected an absent retired function: %', v_signature;
    end if;
  end loop;

  select pg_get_functiondef('public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure)
    into v_definition;
  if v_definition not like '%when ''3'' then%'
     or v_definition like '%when ''2'' then%'
  then
    raise exception 'Phase E7B restoration requires the v3-only aggregate validator';
  end if;
end
$phase_e7b_restore_preflight$;

CREATE OR REPLACE FUNCTION public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot)) <> 15
    or jsonb_typeof(p_snapshot->'snapshotSchemaVersion') <> 'number'
    or p_snapshot->>'snapshotSchemaVersion' <> '2'
    or p_snapshot->>'compilerVersion' <> 'adle_generic_snapshot_compiler_v2'
    or p_snapshot->>'validatorVersion' <> 'adle_generic_snapshot_validator_v2'
    or p_snapshot->>'requirementRegistryVersion' <> 'adle_generic_activity_requirements_v2'
    or jsonb_typeof(p_snapshot->'route') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'route')) <> 2
    or p_snapshot#>>'{route,routeId}' <> 'generic_composer'
    or p_snapshot#>>'{route,routeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'recipe') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'recipe')) <> 2
    or p_snapshot#>>'{recipe,recipeKey}' <> 'generic_first_exposure'
    or p_snapshot#>>'{recipe,recipeVersion}' <> 'v1'
    or jsonb_typeof(p_snapshot->'payload') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'payload')) <> 2
    or p_snapshot#>>'{payload,kind}' <> 'composed_daily_plan'
    or p_snapshot#>>'{payload,version}' <> '1'
    or jsonb_typeof(p_snapshot->'runtime') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'runtime')) <> 2
    or p_snapshot#>>'{runtime,adapterKey}' <> 'generic_composer_v1'
    or p_snapshot#>>'{runtime,rendererKey}' <> 'generic_session'
    or jsonb_typeof(p_snapshot->'assignment') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'assignment')) <> 2
    or p_snapshot#>>'{assignment,generationSource}' <> 'adle_composer_v1'
    or jsonb_typeof(p_snapshot#>'{assignment,itemCount}') <> 'number'
    or (p_snapshot#>>'{assignment,itemCount}') !~ '^[0-9]+$'
    or (p_snapshot#>>'{assignment,itemCount}')::integer < 1
    or jsonb_typeof(p_snapshot->'taxonomy') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'taxonomy')) <> 3
    or jsonb_typeof(p_snapshot->'words') <> 'array'
    or jsonb_typeof(p_snapshot->'activities') <> 'array'
    or jsonb_array_length(p_snapshot->'activities') < 1
    or jsonb_typeof(p_snapshot->'segments') <> 'array'
    or jsonb_array_length(p_snapshot->'segments') <> 2
    or jsonb_typeof(p_snapshot->'contentVersions') <> 'array'
    or jsonb_typeof(p_snapshot->'provenance') <> 'object'
    or (select count(*) from jsonb_object_keys(p_snapshot->'provenance')) <> 4
    or p_snapshot#>>'{provenance,sourceKind}' <> 'compiled_generic_assignment'
    or p_snapshot#>>'{provenance,fingerprintAlgorithm}' <> 'sha256'
    or p_snapshot#>>'{provenance,fingerprintVersion}' <> '1'
    or coalesce(p_snapshot#>>'{provenance,sourceFingerprint}', '') !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;
  return true;
exception
  when others then
    return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.adle_generic_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_snapshot->>'snapshotSchemaVersion'
    when '2' then public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot)
    when '3' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
    else false
  end
$function$;

CREATE OR REPLACE FUNCTION public.adle_lesson_snapshot_is_structurally_valid(p_snapshot jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select case p_snapshot->>'snapshotSchemaVersion' when '2' then public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot)
 when '3' then case p_snapshot#>>'{route,routeId}'
  when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_affix_word_lab' then public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'dynamic_prefix_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  when 'base_word_lab' then public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(p_snapshot)
  else false end else false end $function$;

CREATE OR REPLACE FUNCTION public.persist_adle_composed_daily_plan_v1(p_parent_user_id uuid, p_child_id uuid, p_plan_date date, p_header jsonb, p_items jsonb, p_intakes jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assignment_id uuid;
  v_item jsonb;
  v_intake jsonb;
  v_position integer := 0;
begin
  if not exists (
    select 1
    from public.children
    where id = p_child_id
      and parent_user_id = p_parent_user_id
      and coalesce(is_archived, false) = false
  ) then
    raise exception 'ADLE composed plan child ownership validation failed';
  end if;

  if jsonb_typeof(p_header) <> 'object'
    or p_header->>'childId' <> p_child_id::text
    or p_header->>'parentUserId' <> p_parent_user_id::text
    or p_header->>'assignmentDate' <> p_plan_date::text
    or p_header->>'title' <> 'ADLE Daily Plan'
    or p_header->>'status' <> 'pending'
    or p_header->>'assignmentGenerationSource' <> 'adle_composer_v1'
  then
    raise exception 'ADLE composed plan header validation failed';
  end if;

  if p_header ? 'lessonRouteMetadata'
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
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or (
      not public.adle_release_bound_composed_plan_is_ready_v2(p_child_id,p_header,p_items,p_intakes)
      and (
      jsonb_array_length(p_items) <> 16
      and not (
        jsonb_array_length(p_items) = 20
        and exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'microSkillId' = 'D4_MOR_PREFIXES_IN_IM_IL_IR'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'experienceProfile' = 'prefix_word_lab_v2'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'contentVersion' = 'd4_mor_prefix_word_lab_v2'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->>'presentationPolicyVersion' = 'dynamic_prefix_pedagogy_v1'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->>'meaningCheckKind' = 'prefix_form'
            and candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->>'meaningResultsPresentation' = 'none'
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'words'->'lesson') = 4
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds') between 2 and 4
            and jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds') = 6 - jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds')
        )
        and not exists (
          select 1
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_prefix_v2'
            or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_PREFIXES_IN_IM_IL_IR'
            or nullif(candidate.value->'promptData'->>'dynamicPrefixActivityId', '') is null
        )
        and (
          select count(distinct candidate.value->'promptData'->>'dynamicPrefixActivityId')
          from jsonb_array_elements(p_items) as candidate(value)
        ) = 20
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' in ('intro-root', 'intro-words')
        ) = 2
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) between 2 and 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        ) = (
          select jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'splitCanonicalWordIds')
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
        )
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-meaning-%'
        ) = 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = 6 - (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-strip-%'
        )
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'guided-build-%'
        ) = (
          select jsonb_array_length(candidate.value->'promptData'->'dynamicPrefixLesson'->'activities'->'guided'->'builds')
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
        )
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'controlled-%'
        ) = 4
        and (
          select count(*)
          from jsonb_array_elements(p_items) as candidate(value)
          where candidate.value->'promptData'->>'dynamicPrefixActivityId' like 'dictation-%'
        ) = 4
      )
      and (
        jsonb_array_length(p_items) <> 18
        or not (
          (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'dynamicPrefixActivityId' = 'intro-root'
                and candidate.value->'promptData'->'dynamicPrefixLesson'->>'microSkillId' = 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_prefix_v2'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_PREFIXES_SUB_INTER_SUPER'
            )
          )
          or
          (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'dynamicAffixActivityId' = 'intro-root'
                and candidate.value->'promptData'->'dynamicAffixLesson'->>'microSkillId' = 'D4_MOR_SUFFIXES_FUL_LESS'
                and candidate.value->'promptData'->'dynamicAffixLesson'->'activities'->'guided'->>'includeMeaningSort' = 'true'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'dynamic_affix_v3'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_SUFFIXES_FUL_LESS'
            )
          )
          or (
            exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'promptData'->>'closedCompoundActivityId' = 'intro-root'
                and candidate.value->'promptData'->'closedCompoundLesson'->>'microSkillId' = 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
            )
            and not exists (
              select 1
              from jsonb_array_elements(p_items) as candidate(value)
              where candidate.value->'metadata'->>'provenance' is distinct from 'closed_compound_v1'
                or candidate.value->'metadata'->>'microSkillKey' is distinct from 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS'
            )
          )
        )
      )
    ))
  then
    raise exception 'ADLE composed plan requires 16 items, except reviewed 18-item profiles, release-bound plans, or the reviewed 20-item IN/IM/IL/IR snapshot';
  end if;
  if jsonb_typeof(p_intakes) <> 'array' then
    raise exception 'ADLE composed plan intakes must be an array';
  end if;

  if exists (
    select 1 from public.daily_assignments
    where child_id = p_child_id
      and assignment_date = p_plan_date
      and title = 'ADLE Daily Plan'
  ) then
    raise exception 'ADLE composed plan already exists for child and date';
  end if;

  insert into public.daily_assignments (
    child_id, parent_user_id, assignment_date, title, status,
    target_words, review_words, assignment_generation_source,
    lesson_route_metadata
  ) values (
    p_child_id,
    p_parent_user_id,
    p_plan_date,
    p_header->>'title',
    p_header->>'status',
    array(select jsonb_array_elements_text(coalesce(p_header->'targetWords', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords', '[]'::jsonb))),
    p_header->>'assignmentGenerationSource',
    case
      when jsonb_typeof(p_header->'lessonRouteMetadata') = 'object'
        then p_header->'lessonRouteMetadata'
      else null
    end
  )
  returning id into v_assignment_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    if v_item->>'childId' <> p_child_id::text
      or v_item->>'parentUserId' <> p_parent_user_id::text
      or (v_item->>'position')::integer <> v_position
      or v_item->>'domainModule' <> 'spelling'
      or v_item->>'sourceType' <> 'adle_composer'
      or v_item->>'status' <> 'ready'
      or v_item#>>'{metadata,planDate}' <> p_plan_date::text
    then
      raise exception 'ADLE composed plan item validation failed at position %', v_position;
    end if;

    insert into public.assignment_items (
      daily_assignment_id, child_id, parent_user_id, domain_module, item_type,
      source_type, source_entity_id, learning_item_id, template_key,
      target_word, position, status, prompt_data, metadata
    ) values (
      v_assignment_id,
      p_child_id,
      p_parent_user_id,
      v_item->>'domainModule',
      v_item->>'itemType',
      v_item->>'sourceType',
      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',
      nullif(v_item->>'targetWord', ''),
      (v_item->>'position')::integer,
      v_item->>'status',
      coalesce(v_item->'promptData', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_intake in select value from jsonb_array_elements(p_intakes)
  loop
    if v_intake->>'childId' <> p_child_id::text
      or nullif(btrim(v_intake->>'canonicalWordId'), '') is null
      or nullif(btrim(v_intake->>'microSkillKey'), '') is null
      or v_intake->>'rowStatus' <> 'active'
    then
      raise exception 'ADLE composed plan intake validation failed';
    end if;

    update public.adle_learning_items
    set row_status = 'superseded', updated_at = timezone('utc', now())
    where child_id = p_child_id
      and canonical_word_id = (v_intake->>'canonicalWordId')::uuid
      and micro_skill_key = v_intake->>'microSkillKey'
      and row_status = 'active';

    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on,
      intake_on, row_status
    ) values (
      p_child_id,
      (v_intake->>'canonicalWordId')::uuid,
      v_intake->>'microSkillKey',
      v_intake->>'itemStatus',
      v_intake->>'sourceKind',
      v_intake->>'sourceRef',
      nullif(v_intake->>'sourceAttemptText', ''),
      coalesce((v_intake->>'reteachPriority')::boolean, false),
      nullif(v_intake->>'ejectedOn', '')::date,
      (v_intake->>'intakeOn')::date,
      'active'
    );
  end loop;

  return v_assignment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.persist_adle_generic_daily_plan_v2(p_parent_user_id uuid, p_child_id uuid, p_plan_date date, p_header jsonb, p_items jsonb, p_intakes jsonb, p_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assignment_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_intake jsonb;
  v_position integer;
begin
  if not exists (
    select 1
    from public.children
    where id = p_child_id
      and parent_user_id = p_parent_user_id
      and coalesce(is_archived, false) = false
  ) then
    raise exception 'ADLE generic plan child ownership validation failed';
  end if;

  if jsonb_typeof(p_header) <> 'object'
    or p_header->>'childId' <> p_child_id::text
    or p_header->>'parentUserId' <> p_parent_user_id::text
    or p_header->>'assignmentDate' <> p_plan_date::text
    or p_header->>'title' <> 'ADLE Daily Plan'
    or p_header->>'status' <> 'pending'
    or p_header->>'assignmentGenerationSource' <> 'adle_composer_v1'
    or not public.adle_lesson_route_metadata_is_valid_v1(p_header->'lessonRouteMetadata')
    or p_header#>>'{lessonRouteMetadata,route,routeId}' <> 'generic_composer'
    or p_header#>>'{lessonRouteMetadata,route,routeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeKey}' <> 'generic_first_exposure'
    or p_header#>>'{lessonRouteMetadata,recipe,recipeVersion}' <> 'v1'
    or p_header#>>'{lessonRouteMetadata,payload,kind}' <> 'composed_daily_plan'
    or p_header#>>'{lessonRouteMetadata,payload,version}' <> '1'
  then
    raise exception 'ADLE generic plan header validation failed';
  end if;

  if not public.adle_generic_lesson_snapshot_is_structurally_valid_v2(p_snapshot) then
    raise exception 'ADLE generic plan snapshot structural validation failed';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_typeof(p_intakes) <> 'array'
    or (p_snapshot#>>'{assignment,itemCount}')::integer <> jsonb_array_length(p_items)
    or jsonb_array_length(p_snapshot->'activities') <> jsonb_array_length(p_items)
  then
    raise exception 'ADLE generic plan collection validation failed';
  end if;

  if (
    select count(*) <> count(distinct value->>'sourceEntityId')
    from jsonb_array_elements(p_items)
  ) then
    raise exception 'ADLE generic plan item source bindings must be unique';
  end if;
  if (
    select count(*) <> count(distinct value#>>'{itemBinding,sourceEntityId}')
    from jsonb_array_elements(p_snapshot->'activities')
  ) then
    raise exception 'ADLE generic plan snapshot bindings must be unique';
  end if;

  for v_item, v_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    if v_item->>'childId' <> p_child_id::text
      or v_item->>'parentUserId' <> p_parent_user_id::text
      or (v_item->>'position')::integer <> v_position
      or v_item->>'domainModule' <> 'spelling'
      or v_item->>'sourceType' <> 'adle_composer'
      or v_item->>'status' <> 'ready'
      or nullif(btrim(v_item->>'sourceEntityId'), '') is null
      or nullif(btrim(v_item->>'templateKey'), '') is null
      or v_item#>>'{metadata,planDate}' <> p_plan_date::text
      or nullif(btrim(v_item#>>'{metadata,sectionKey}'), '') is null
    then
      raise exception 'ADLE generic plan item validation failed at position %', v_position;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'activities') activity
    full join jsonb_array_elements(p_items) item
      on activity.value#>>'{itemBinding,sourceEntityId}' = item.value->>'sourceEntityId'
    where activity.value is null
      or item.value is null
      or activity.value#>>'{itemBinding,position}' <> item.value->>'position'
      or activity.value->>'order' <> item.value->>'position'
      or activity.value->>'sectionKey' <> item.value#>>'{metadata,sectionKey}'
      or activity.value->>'templateKey' <> item.value->>'templateKey'
  ) then
    raise exception 'ADLE generic plan snapshot and item bindings disagree';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_child_id::text || ':' || p_plan_date::text || ':ADLE Daily Plan', 0)
  );
  select id into v_existing_id
  from public.daily_assignments
  where child_id = p_child_id
    and parent_user_id = p_parent_user_id
    and assignment_date = p_plan_date
    and title = 'ADLE Daily Plan'
    and assignment_generation_source = 'adle_composer_v1';
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if exists (
    select 1 from public.daily_assignments
    where child_id = p_child_id
      and assignment_date = p_plan_date
      and title = 'ADLE Daily Plan'
  ) then
    raise exception 'ADLE generic plan assignment envelope already exists';
  end if;

  insert into public.daily_assignments (
    child_id, parent_user_id, assignment_date, title, status,
    target_words, review_words, assignment_generation_source,
    lesson_route_metadata, compiled_lesson_snapshot
  ) values (
    p_child_id,
    p_parent_user_id,
    p_plan_date,
    p_header->>'title',
    p_header->>'status',
    array(select jsonb_array_elements_text(coalesce(p_header->'targetWords', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords', '[]'::jsonb))),
    p_header->>'assignmentGenerationSource',
    p_header->'lessonRouteMetadata',
    p_snapshot
  ) returning id into v_assignment_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.assignment_items (
      daily_assignment_id, child_id, parent_user_id, domain_module, item_type,
      source_type, source_entity_id, learning_item_id, template_key,
      target_word, position, status, prompt_data, metadata
    ) values (
      v_assignment_id,
      p_child_id,
      p_parent_user_id,
      v_item->>'domainModule',
      v_item->>'itemType',
      v_item->>'sourceType',
      v_item->>'sourceEntityId',
      null,
      v_item->>'templateKey',
      nullif(v_item->>'targetWord', ''),
      (v_item->>'position')::integer,
      v_item->>'status',
      coalesce(v_item->'promptData', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  for v_intake in select value from jsonb_array_elements(p_intakes)
  loop
    if v_intake->>'childId' <> p_child_id::text
      or nullif(btrim(v_intake->>'canonicalWordId'), '') is null
      or nullif(btrim(v_intake->>'microSkillKey'), '') is null
      or v_intake->>'rowStatus' <> 'active'
    then
      raise exception 'ADLE generic plan intake validation failed';
    end if;

    update public.adle_learning_items
    set row_status = 'superseded', updated_at = timezone('utc', now())
    where child_id = p_child_id
      and canonical_word_id = (v_intake->>'canonicalWordId')::uuid
      and micro_skill_key = v_intake->>'microSkillKey'
      and row_status = 'active';

    insert into public.adle_learning_items (
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on,
      intake_on, row_status
    ) values (
      p_child_id,
      (v_intake->>'canonicalWordId')::uuid,
      v_intake->>'microSkillKey',
      v_intake->>'itemStatus',
      v_intake->>'sourceKind',
      v_intake->>'sourceRef',
      nullif(v_intake->>'sourceAttemptText', ''),
      coalesce((v_intake->>'reteachPriority')::boolean, false),
      nullif(v_intake->>'ejectedOn', '')::date,
      (v_intake->>'intakeOn')::date,
      'active'
    );
  end loop;

  return v_assignment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.persist_adle_base_word_family_pilot_v1(p_parent_user_id uuid, p_child_id uuid, p_plan_date date, p_payload jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_assignment_id uuid; v_item jsonb; v_position integer := 0; v_run_number integer;
begin
  if not exists (select 1 from public.children where id = p_child_id and parent_user_id = p_parent_user_id and coalesce(is_archived, false) = false) then
    raise exception 'ADLE base-word pilot child ownership validation failed';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or p_payload->>'experience' <> 'D4_MOR_BASE_WORD_FAMILY'
    or jsonb_array_length(coalesce(p_payload->'authenticTargets', '[]'::jsonb)) <> 2
    or jsonb_array_length(coalesce(p_payload->'independentWords', '[]'::jsonb)) <> 6 then
    raise exception 'ADLE base-word pilot payload validation failed';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 18 then
    raise exception 'ADLE base-word pilot requires exactly 18 assignment items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('adle-base-word-family:' || p_child_id::text, 0));
  select count(*) + 1 into v_run_number from public.adle_base_word_family_pilot_runs
    where child_id = p_child_id and run_status <> 'cancelled';
  null;
  if exists (select 1 from public.daily_assignments where child_id = p_child_id and assignment_date = p_plan_date and title = 'ADLE Base-word Family Pilot') then
    raise exception 'ADLE base-word pilot already exists for child and date';
  end if;
  insert into public.daily_assignments (child_id, parent_user_id, assignment_date, title, status, target_words, review_words, assignment_generation_source)
  values (p_child_id, p_parent_user_id, p_plan_date, 'ADLE Base-word Family Pilot', 'pending',
    array[]::text[], array[]::text[], 'adle_base_word_family_pilot_v1') returning id into v_assignment_id;
  -- target_words is set below from the reviewed immutable payload.
  update public.daily_assignments set target_words = array(select value->>'displayWord' from jsonb_array_elements(p_payload->'independentWords')) where id = v_assignment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    if v_item->>'childId' <> p_child_id::text or v_item->>'parentUserId' <> p_parent_user_id::text
      or (v_item->>'position')::integer <> v_position or v_item->>'domainModule' <> 'spelling'
      or v_item->>'itemType' <> 'lesson' or v_item->>'sourceType' <> 'adle_base_word_family_pilot'
      or v_item#>>'{metadata,planDate}' <> p_plan_date::text then raise exception 'ADLE base-word pilot item validation failed at position %', v_position; end if;
    insert into public.assignment_items (daily_assignment_id, child_id, parent_user_id, domain_module, item_type, source_type, source_entity_id, learning_item_id, template_key, target_word, position, status, prompt_data, metadata)
    values (v_assignment_id, p_child_id, p_parent_user_id, 'spelling', 'lesson', 'adle_base_word_family_pilot', v_item->>'sourceEntityId', null, v_item->>'templateKey', nullif(v_item->>'targetWord',''), v_position, 'ready', coalesce(v_item->'promptData','{}'::jsonb), coalesce(v_item->'metadata','{}'::jsonb));
  end loop;
  insert into public.adle_base_word_family_pilot_runs (assignment_id, child_id, parent_user_id, pilot_lesson_number) values (v_assignment_id, p_child_id, p_parent_user_id, v_run_number);
  return v_assignment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.persist_adle_base_word_family_pilot_v2(p_parent_user_id uuid, p_child_id uuid, p_plan_date date, p_payload jsonb, p_items jsonb, p_route_metadata jsonb, p_activation_revision_id uuid DEFAULT NULL::uuid, p_release_manifest_id uuid DEFAULT NULL::uuid, p_release_manifest_sha256 text DEFAULT NULL::text, p_dependency_fingerprint text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assignment_id uuid;
  v_item jsonb;
  v_position integer := 0;
  v_run_number integer;
  v_micro_skill_key text := p_payload->>'microSkillKey';
begin
  if not exists (select 1 from public.children where id=p_child_id and parent_user_id=p_parent_user_id and coalesce(is_archived,false)=false) then
    raise exception 'ADLE base-word pilot child ownership validation failed';
  end if;
  if not public.adle_lesson_route_metadata_is_valid_v2(p_route_metadata)
     or p_route_metadata#>>'{route,routeId}' <> 'base_word_lab'
     or p_route_metadata#>>'{route,routeVersion}' <> 'v2'
     or p_route_metadata#>>'{payload,kind}' <> 'base_word_family_snapshot_v1'
     or (p_route_metadata#>>'{payload,version}')::integer <> 1
     or (p_route_metadata#>>'{curriculumRelease,activationRevisionId}')::uuid is distinct from p_activation_revision_id
     or (p_route_metadata#>>'{curriculumRelease,releaseManifestId}')::uuid is distinct from p_release_manifest_id
     or p_route_metadata#>>'{curriculumRelease,releaseManifestSha256}' is distinct from p_release_manifest_sha256
     or p_route_metadata#>>'{curriculumRelease,dependencyFingerprint}' is distinct from p_dependency_fingerprint then
    raise exception 'ADLE base-word route metadata/release authority validation failed';
  end if;
  if jsonb_typeof(p_payload)<>'object' or p_payload->>'experience'<>'D4_MOR_BASE_WORD_FAMILY'
     or not public.adle_micro_skill_owns_base_word_lab_v2(v_micro_skill_key)
     or jsonb_array_length(coalesce(p_payload->'familySections','[]'::jsonb))<>2
     or jsonb_array_length(coalesce(p_payload->'authenticTargets','[]'::jsonb))<>2
     or jsonb_array_length(coalesce(p_payload->'independentWords','[]'::jsonb))<>6
     or jsonb_array_length(coalesce(p_payload->'independentSlots','[]'::jsonb))<>6
     or (select count(distinct value->>'baseFamilyKey') from jsonb_array_elements(p_payload->'familySections'))<>2
     or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p_payload->'independentSlots'))<>6
     or (select count(distinct value->>'canonicalWordId') from jsonb_array_elements(p_payload->'independentWords'))<>6
     or (select count(*) from jsonb_array_elements(p_payload->'independentSlots') slot where slot->>'provenance'='authentic_target')<>2
     or (select count(*) from jsonb_array_elements(p_payload->'independentSlots') slot where slot->>'provenance'='transfer')<>4 then
    raise exception 'ADLE base-word pilot payload validation failed';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<>18 then
    raise exception 'ADLE base-word pilot requires exactly 18 assignment items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('adle-base-word-family:'||p_child_id::text,0));
  select id into v_assignment_id from public.daily_assignments
  where child_id=p_child_id and parent_user_id=p_parent_user_id and assignment_date=p_plan_date
    and title='ADLE Base-word Family Pilot' and assignment_generation_source='adle_base_word_family_pilot_v1';
  if v_assignment_id is not null then return v_assignment_id; end if;

  perform 1 from public.adle_route_activation_heads head
  join public.adle_route_activation_revisions revision on revision.id=head.current_revision_id
  join public.adle_curriculum_release_manifests release on release.id=revision.release_manifest_id
  where revision.id=p_activation_revision_id and revision.release_manifest_id=p_release_manifest_id
    and revision.release_manifest_sha256=p_release_manifest_sha256
    and revision.dependency_fingerprint=p_dependency_fingerprint
    and revision.route_id='base_word_lab' and revision.route_version='v2'
    and revision.micro_skill_key=v_micro_skill_key and revision.activation_status='enabled'
    and release.release_key=p_route_metadata#>>'{curriculumRelease,releaseKey}'
  for share of head,revision,release;
  if not found or not public.adle_route_activation_revision_is_current_v2(
    p_activation_revision_id,p_release_manifest_id,p_release_manifest_sha256,p_dependency_fingerprint
  ) then raise exception 'Base Word release authority changed before assignment persistence'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentSlots') slot
    where not exists (
      select 1 from public.adle_curriculum_release_dependencies dependency
      join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
      where dependency.release_manifest_id=p_release_manifest_id and dependency.micro_skill_key=v_micro_skill_key
        and dependency.authority_type='family_membership'
        and exists (
          select 1 from jsonb_array_elements(authority.semantic_projection->'families') family,
            jsonb_array_elements(family->'members') member
          where family->>'baseFamilyKey'=slot->>'baseFamilyKey'
            and member->>'canonicalWordId'=slot->>'canonicalWordId'
            and (member->>'assignmentEligible')::boolean
            and (
              (authority.schema_version = 1 and (
                (slot->>'provenance'='authentic_target' and member->>'memberRole'='authentic_target')
                or (slot->>'provenance'='transfer' and member->>'memberRole' in ('base','transfer'))
              ))
              or
              (authority.schema_version = 2
                and authority.semantic_projection->>'schemaVersion' = '2'
                and authority.semantic_projection->>'skillClusterKey' = 'D4_MOR_BASE_WORDS'
                and member->>'structuralRole' in ('base','family_member')
                and member->'applicableMicroSkillKeys' ? v_micro_skill_key)
            )
        )
    )
  ) then raise exception 'Base Word assignment selection is outside its exact family authority'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentSlots') slot
    where (
      exists (
        select 1 from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
        where dependency.release_manifest_id=p_release_manifest_id
          and dependency.micro_skill_key=v_micro_skill_key
          and dependency.authority_type='family_membership'
          and authority.schema_version=2
      ) and (
        slot->>'assignmentRole' not in ('primary_authentic_target','queued_family_practice','generated_family_practice')
        or slot->>'learnerProvenance' not in ('verified_misspelling','generated_family_practice')
        or (slot->>'assignmentRole'='primary_authentic_target' and (
          slot->>'provenance'<>'authentic_target'
          or not exists (select 1 from jsonb_array_elements(p_payload->'authenticTargets') target
            where target->>'canonicalWordId'=slot->>'canonicalWordId'
              and target->>'learningItemId'=slot->>'learningItemId')
        ))
        or (slot->>'assignmentRole'<>'primary_authentic_target' and slot->>'provenance'<>'transfer')
        or (slot->>'assignmentRole' in ('primary_authentic_target','queued_family_practice') and (
          slot->>'learnerProvenance'<>'verified_misspelling'
          or nullif(slot->>'learningItemId','') is null
          or not exists (
            select 1 from public.adle_learning_items item
            where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
              and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
              and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
              and item.item_status in ('pending','pending_reteach')
              and item.source_kind='verified_misspelling'
          )
        ))
        or (slot->>'assignmentRole'='generated_family_practice' and (
          slot->>'learnerProvenance'<>'generated_family_practice'
          or nullif(slot->>'learningItemId','') is not null
        ))
      )
    ) or (
      not exists (
        select 1 from public.adle_curriculum_release_dependencies dependency
        join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
        where dependency.release_manifest_id=p_release_manifest_id
          and dependency.micro_skill_key=v_micro_skill_key
          and dependency.authority_type='family_membership'
          and authority.schema_version=2
      ) and (
        (slot->>'provenance'='authentic_target' and (
          nullif(slot->>'learningItemId','') is null or not exists (
            select 1 from public.adle_learning_items item
            where item.id=(slot->>'learningItemId')::uuid and item.child_id=p_child_id
              and item.canonical_word_id=(slot->>'canonicalWordId')::uuid
              and item.micro_skill_key=v_micro_skill_key and item.row_status='active'
              and item.source_kind='verified_misspelling'
          )
        )) or (slot->>'provenance'='transfer' and nullif(slot->>'learningItemId','') is not null)
      )
    )
  ) then raise exception 'Base Word assignment learner evidence and slot-role provenance is invalid'; end if;
  if not exists (
    select 1 from public.adle_curriculum_release_dependencies dependency
    join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
    where dependency.release_manifest_id=p_release_manifest_id
      and dependency.micro_skill_key=v_micro_skill_key
      and dependency.authority_type='teaching_content'
      and authority.semantic_projection->>'contentVersion'=p_payload->>'contentVersion'
  ) then raise exception 'Base Word snapshot disagrees with its exact teaching-content authority'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'independentWords') word
    where not exists (
      select 1 from public.adle_curriculum_release_dependencies dependency
      join public.adle_teaching_dictionary_closure_words closure_word on closure_word.authority_id=dependency.authority_id
      where dependency.release_manifest_id=p_release_manifest_id and dependency.micro_skill_key=v_micro_skill_key
        and dependency.authority_type='teaching_dictionary_closure'
        and closure_word.canonical_word_id=(word->>'canonicalWordId')::uuid
        and closure_word.display_word=word->>'displayWord'
        and closure_word.dictation_sentence=word->>'dictationSentence'
        and closure_word.dictation_target_token_index=(word->>'dictationTargetTokenIndex')::integer
        and closure_word.audio_text=word->>'audioText'
    )
  ) then raise exception 'Base Word snapshot disagrees with its exact Teaching Dictionary closure'; end if;

  select count(*)+1 into v_run_number from public.adle_base_word_family_pilot_runs
  where child_id=p_child_id and run_status<>'cancelled';
  insert into public.daily_assignments (
    child_id,parent_user_id,assignment_date,title,status,target_words,review_words,
    assignment_generation_source,lesson_route_metadata
  ) values (
    p_child_id,p_parent_user_id,p_plan_date,'ADLE Base-word Family Pilot','pending',
    array(select value->>'displayWord' from jsonb_array_elements(p_payload->'independentWords')),
    array[]::text[],'adle_base_word_family_pilot_v1',p_route_metadata
  ) returning id into v_assignment_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position:=v_position+1;
    if v_item->>'childId'<>p_child_id::text or v_item->>'parentUserId'<>p_parent_user_id::text
       or (v_item->>'position')::integer<>v_position or v_item->>'domainModule'<>'spelling'
       or v_item->>'itemType'<>'lesson' or v_item->>'sourceType'<>'adle_base_word_family_pilot'
       or v_item#>>'{metadata,planDate}'<>p_plan_date::text
       or v_item#>>'{metadata,microSkillKey}'<>v_micro_skill_key then
      raise exception 'ADLE base-word pilot item validation failed at position %',v_position;
    end if;
    insert into public.assignment_items (
      daily_assignment_id,child_id,parent_user_id,domain_module,item_type,source_type,
      source_entity_id,learning_item_id,template_key,target_word,position,status,prompt_data,metadata
    ) values (
      v_assignment_id,p_child_id,p_parent_user_id,'spelling','lesson','adle_base_word_family_pilot',
      v_item->>'sourceEntityId',null,v_item->>'templateKey',nullif(v_item->>'targetWord',''),
      v_position,'ready',coalesce(v_item->'promptData','{}'::jsonb),coalesce(v_item->'metadata','{}'::jsonb)
    );
  end loop;
  insert into public.adle_base_word_family_pilot_runs (assignment_id,child_id,parent_user_id,pilot_lesson_number)
  values (v_assignment_id,p_child_id,p_parent_user_id,v_run_number);
  return v_assignment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_adle_word_lab_v1(p_parent_user_id uuid, p_child_id uuid, p_assignment_id uuid, p_plan_date date, p_micro_skill_key text, p_source_ref text, p_assignment_item_ids uuid[], p_attempts jsonb, p_lesson jsonb, p_reflection jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_header_status text;
  v_existing_bundle_count integer;
  v_bundle_id uuid;
  v_input_bundle_id uuid;
  v_row jsonb;
  v_item_count integer;
  v_attempt_count integer;
  v_guided_count integer;
  v_controlled_count integer;
  v_dictation_count integer;
  v_reflection_count integer;
  v_learning_count integer;
  v_taught_count integer;
  v_schedule_count integer;
  v_committed_at timestamptz := timezone('utc', now());
begin
  if p_micro_skill_key <> 'D4_MOR_PREFIXES_UN'
    or nullif(btrim(p_source_ref), '') is null
    or jsonb_typeof(p_attempts) <> 'array'
    or jsonb_typeof(p_lesson) <> 'object'
    or jsonb_typeof(p_reflection) <> 'object'
  then
    raise exception 'Word Lab completion envelope validation failed';
  end if;

  select status into v_header_status
  from public.daily_assignments
  where id = p_assignment_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and assignment_date = p_plan_date
    and title = 'ADLE Daily Plan'
    and assignment_generation_source = 'adle_composer_v1'
  for update;

  if v_header_status is null then
    raise exception 'Word Lab completion ownership or assignment validation failed';
  end if;

  select count(*) into v_item_count
  from public.assignment_items
  where daily_assignment_id = p_assignment_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id;

  if v_item_count <> 16
    or coalesce(array_length(p_assignment_item_ids, 1), 0) <> 16
    or (select count(distinct id) from unnest(p_assignment_item_ids) as id) <> 16
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and id = any(p_assignment_item_ids)) <> 16
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_intro') <> 2
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'guided_practice') <> 6
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_production') <> 4
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_dictation') <> 4
    or (select array_agg(prompt_data->>'pilotActivityId' order by position) from public.assignment_items where daily_assignment_id = p_assignment_id) <> array[
      'intro-root', 'intro-words', 'guided-strip-unhappy',
      'guided-meaning-unfair', 'guided-meaning-unkind', 'guided-meaning-unlock',
      'guided-meaning-untidy', 'guided-build-untidy', 'controlled-unfair',
      'controlled-unkind', 'controlled-unlock', 'controlled-untidy',
      'dictation-unfair', 'dictation-unkind', 'dictation-unlock', 'dictation-untidy'
    ]::text[]
    or exists (select 1 from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'microSkillKey' is distinct from p_micro_skill_key)
  then
    raise exception 'Word Lab completion requires the exact 16-item assignment snapshot';
  end if;

  if jsonb_array_length(p_attempts) <> 14
    or (select count(*) from jsonb_array_elements(p_attempts) where value->>'attemptKind' = 'guided_practice') <> 6
    or (select count(*) from jsonb_array_elements(p_attempts) where value->>'attemptKind' = 'lesson_production') <> 4
    or (select count(*) from jsonb_array_elements(p_attempts) where value->>'attemptKind' = 'lesson_dictation') <> 4
    or exists (
      select 1 from jsonb_array_elements(p_attempts)
      where value->>'childId' is distinct from p_child_id::text
        or value->>'parentUserId' is distinct from p_parent_user_id::text
        or value->>'dailyAssignmentId' is distinct from p_assignment_id::text
        or value->>'sourceRef' is null
        or value->>'sourceRef' not like p_source_ref || '%'
        or nullif(value->>'assignmentItemId', '') is null
        or (value->>'assignmentItemId')::uuid <> all(p_assignment_item_ids)
        or (value->>'attemptKind' = 'lesson_dictation' and position(' ' in coalesce(value->>'attemptText', '')) = 0)
    )
  then
    raise exception 'Word Lab completion requires exactly 14 bound attempt events';
  end if;

  if jsonb_array_length(coalesce(p_lesson->'scheduleWords', '[]'::jsonb)) <> 4
    or jsonb_array_length(coalesce(p_lesson->'taughtEvents', '[]'::jsonb)) <> 4
    or jsonb_array_length(coalesce(p_lesson->'itemTransitions', '[]'::jsonb)) <> 4
    or jsonb_typeof(p_lesson->'bundle') <> 'object'
  then
    raise exception 'Word Lab completion requires four schedule, taught and learning transitions';
  end if;

  if p_reflection->>'childId' <> p_child_id::text
    or p_reflection->>'parentUserId' <> p_parent_user_id::text
    or p_reflection->>'assignmentId' <> p_assignment_id::text
    or p_reflection->>'microSkillKey' <> p_micro_skill_key
    or p_reflection->>'promptKey' <> 'word-lab-un-observation-v1'
    or char_length(btrim(coalesce(p_reflection->>'reflectionText', ''))) not between 1 and 2000
  then
    raise exception 'Word Lab private reflection validation failed';
  end if;

  select count(*), (array_agg(id))[1] into v_existing_bundle_count, v_bundle_id
  from public.adle_review_bundles
  where child_id = p_child_id and source_ref = p_source_ref and row_status = 'active';
  if v_existing_bundle_count > 1 then
    raise exception 'Word Lab completion found duplicate active lesson bundles';
  end if;

  -- A completed call is immutable. Verify it below and return without rewriting
  -- the child's submitted attempts or private note.
  if v_header_status <> 'completed' then
    v_input_bundle_id := (p_lesson->'bundle'->>'bundleId')::uuid;
    if v_bundle_id is null then
      v_bundle_id := v_input_bundle_id;
      insert into public.adle_review_bundles (
        id, child_id, source_ref, interval_index, next_due_on,
        schedule_policy_version, bundle_status, row_status
      ) values (
        v_bundle_id,
        p_child_id,
        p_source_ref,
        (p_lesson->'bundle'->>'intervalIndex')::integer,
        (p_lesson->'bundle'->>'nextDueOn')::date,
        p_lesson->'bundle'->>'schedulePolicyVersion',
        p_lesson->'bundle'->>'bundleStatus',
        'active'
      );
    end if;

    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      if v_row->>'childId' <> p_child_id::text or v_row->>'bundleId' <> v_input_bundle_id::text then
        raise exception 'Word Lab schedule ownership validation failed';
      end if;
      update public.adle_review_schedule_words
      set row_status = 'superseded', updated_at = v_committed_at
      where child_id = p_child_id
        and canonical_word_id = (v_row->>'canonicalWordId')::uuid
        and row_status = 'active'
        and bundle_id <> v_bundle_id;

      if exists (
        select 1 from public.adle_review_schedule_words
        where child_id = p_child_id
          and canonical_word_id = (v_row->>'canonicalWordId')::uuid
          and bundle_id = v_bundle_id
          and row_status = 'active'
      ) then
        update public.adle_review_schedule_words set
          membership_status = v_row->>'membershipStatus',
          catch_up_stage = (v_row->>'catchUpStage')::integer,
          next_retest_due_on = nullif(v_row->>'nextRetestDueOn', '')::date,
          failed_review_on = nullif(v_row->>'failedReviewOn', '')::date,
          pre_retirement_check_due_on = nullif(v_row->>'preRetirementCheckDueOn', '')::date,
          last_28_day_review_on = nullif(v_row->>'last28DayReviewOn', '')::date,
          reteach_cycle_count = (v_row->>'reteachCycleCount')::integer,
          taught_on = (v_row->>'taughtOn')::date,
          updated_at = v_committed_at
        where child_id = p_child_id
          and canonical_word_id = (v_row->>'canonicalWordId')::uuid
          and bundle_id = v_bundle_id
          and row_status = 'active';
      else
        insert into public.adle_review_schedule_words (
          child_id, canonical_word_id, bundle_id, membership_status,
          catch_up_stage, next_retest_due_on, failed_review_on,
          pre_retirement_check_due_on, last_28_day_review_on,
          reteach_cycle_count, taught_on, row_status
        ) values (
          p_child_id,
          (v_row->>'canonicalWordId')::uuid,
          v_bundle_id,
          v_row->>'membershipStatus',
          (v_row->>'catchUpStage')::integer,
          nullif(v_row->>'nextRetestDueOn', '')::date,
          nullif(v_row->>'failedReviewOn', '')::date,
          nullif(v_row->>'preRetirementCheckDueOn', '')::date,
          nullif(v_row->>'last28DayReviewOn', '')::date,
          (v_row->>'reteachCycleCount')::integer,
          (v_row->>'taughtOn')::date,
          'active'
        );
      end if;
    end loop;

    for v_row in select value from jsonb_array_elements(p_lesson->'taughtEvents') loop
      if v_row->>'childId' <> p_child_id::text or v_row->>'sourceRef' <> p_source_ref then
        raise exception 'Word Lab taught-history ownership validation failed';
      end if;
      insert into public.adle_taught_word_history (
        child_id, canonical_word_id, event_kind, occurred_on,
        source_ref, row_status, attempt_text
      )
      select
        p_child_id,
        (v_row->>'canonicalWordId')::uuid,
        v_row->>'eventKind',
        (v_row->>'occurredOn')::date,
        p_source_ref,
        'active',
        nullif(v_row->>'attemptText', '')
      where not exists (
        select 1 from public.adle_taught_word_history
        where child_id = p_child_id
          and canonical_word_id = (v_row->>'canonicalWordId')::uuid
          and event_kind = v_row->>'eventKind'
          and source_ref = p_source_ref
          and row_status = 'active'
      );
    end loop;

    for v_row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
      if v_row->>'childId' <> p_child_id::text or v_row->>'microSkillKey' <> p_micro_skill_key then
        raise exception 'Word Lab learning-item ownership validation failed';
      end if;
      update public.adle_learning_items set
        item_status = v_row->>'itemStatus',
        reteach_priority = (v_row->>'reteachPriority')::boolean,
        ejected_on = nullif(v_row->>'ejectedOn', '')::date,
        row_status = v_row->>'rowStatus',
        updated_at = v_committed_at
      where id = (v_row->>'learningItemId')::uuid
        and child_id = p_child_id
        and canonical_word_id = (v_row->>'canonicalWordId')::uuid
        and micro_skill_key = p_micro_skill_key;
      if not found then raise exception 'Word Lab learning-item transition target missing'; end if;
    end loop;

    insert into public.adle_assignment_attempt_events (
      child_id, parent_user_id, daily_assignment_id, assignment_item_id,
      canonical_word_id, micro_skill_key, section_key, template_key,
      target_word, attempt_text, is_correct, attempt_kind,
      evidence_class, source_ref
    )
    select
      (value->>'childId')::uuid,
      (value->>'parentUserId')::uuid,
      (value->>'dailyAssignmentId')::uuid,
      (value->>'assignmentItemId')::uuid,
      nullif(value->>'canonicalWordId', '')::uuid,
      nullif(value->>'microSkillKey', ''),
      value->>'sectionKey',
      nullif(value->>'templateKey', ''),
      nullif(value->>'targetWord', ''),
      value->>'attemptText',
      nullif(value->>'isCorrect', '')::boolean,
      value->>'attemptKind',
      value->>'evidenceClass',
      value->>'sourceRef'
    from jsonb_array_elements(p_attempts)
    on conflict (assignment_item_id, attempt_kind, source_ref) do nothing;

    insert into public.adle_child_learning_reflections (
      child_id, parent_user_id, daily_assignment_id, micro_skill_key,
      content_version, prompt_key, prompt_text, reflection_text, updated_at
    ) values (
      p_child_id,
      p_parent_user_id,
      p_assignment_id,
      p_micro_skill_key,
      p_reflection->>'contentVersion',
      p_reflection->>'promptKey',
      p_reflection->>'promptText',
      btrim(p_reflection->>'reflectionText'),
      v_committed_at
    )
    on conflict (daily_assignment_id, prompt_key) do update set
      content_version = excluded.content_version,
      prompt_text = excluded.prompt_text,
      reflection_text = excluded.reflection_text,
      updated_at = excluded.updated_at;

    update public.assignment_items
    set status = 'completed'
    where daily_assignment_id = p_assignment_id and id = any(p_assignment_item_ids);

    update public.daily_assignments
    set status = 'completed'
    where id = p_assignment_id;
  end if;

  select count(*) into v_item_count from public.assignment_items where daily_assignment_id = p_assignment_id and status = 'completed';
  select count(*) into v_attempt_count from public.adle_assignment_attempt_events where daily_assignment_id = p_assignment_id;
  select
    count(*) filter (where attempt_kind = 'guided_practice'),
    count(*) filter (where attempt_kind = 'lesson_production'),
    count(*) filter (where attempt_kind = 'lesson_dictation')
  into v_guided_count, v_controlled_count, v_dictation_count
  from public.adle_assignment_attempt_events
  where daily_assignment_id = p_assignment_id;
  select count(*) into v_reflection_count from public.adle_child_learning_reflections where daily_assignment_id = p_assignment_id and prompt_key = 'word-lab-un-observation-v1';
  select count(*) into v_learning_count from public.adle_learning_items where id in (select (value->>'learningItemId')::uuid from jsonb_array_elements(p_lesson->'itemTransitions')) and child_id = p_child_id and row_status = 'active';
  select count(*) into v_taught_count from public.adle_taught_word_history where child_id = p_child_id and source_ref = p_source_ref and event_kind = 'taught' and row_status = 'active';
  select count(*) into v_schedule_count from public.adle_review_schedule_words where child_id = p_child_id and bundle_id = v_bundle_id and row_status = 'active';

  if v_item_count <> 16 or v_attempt_count <> 14
    or v_guided_count <> 6 or v_controlled_count <> 4 or v_dictation_count <> 4
    or v_reflection_count <> 1
    or v_learning_count <> 4 or v_taught_count <> 4 or v_schedule_count <> 4
  then
    raise exception 'Word Lab durable contract verification failed: items %, attempts % (%/%/%), reflection %, learning %, taught %, schedule %',
      v_item_count, v_attempt_count, v_guided_count, v_controlled_count, v_dictation_count,
      v_reflection_count, v_learning_count, v_taught_count, v_schedule_count;
  end if;

  return jsonb_build_object(
    'status', case when v_header_status = 'completed' then 'already_completed' else 'completed' end,
    'committedAt', v_committed_at,
    'counts', jsonb_build_object(
      'header', 1, 'items', v_item_count, 'attempts', v_attempt_count,
      'guided', v_guided_count, 'controlled', v_controlled_count, 'dictation', v_dictation_count,
      'reflection', v_reflection_count, 'learningItems', v_learning_count,
      'taught', v_taught_count, 'schedule', v_schedule_count
    )
  );
end;
$function$;

revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb) from public, anon, authenticated;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb) to service_role;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb) to authenticated;

revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb) from public, anon, authenticated;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb) to service_role;
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb) to authenticated;

revoke all on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) to service_role;

revoke all on function public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;

revoke all on function public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb) to service_role;

revoke all on function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text) to service_role;

revoke all on function public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;

revoke all on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) from public, anon, authenticated;
grant execute on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) to service_role;
grant execute on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) to authenticated;

do $phase_e7b_restore_postflight$
declare
  v_expected record;
  v_oid regprocedure;
  v_hash text;
begin
  for v_expected in
    select * from (values
        ('public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)', 'bf99950e871a45ef1260eff1626d291c09f23b2449cf286a486888c46e2811c0'),
        ('public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)', '8398fd1077d13846d3c02a3ff7b0613ae628e316763f1be1296d689522e48c2b'),
        ('public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)', '79a98937b6664476f857b331a34eabd21d7170f4ec337681c2a54351c9103ff8'),
        ('public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)', 'afa14e96373e76c15ba2e90f090de3169ac626870fe4093cb6c84ae7f420185e'),
        ('public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)', 'd6697eddbefc3f9636f9ff6645b74fd2f28670746fa69d66178d65f955af37d7'),
        ('public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)', 'ac5ab5f28efc192de35be465c2c7e167d7e91a081321b8dbfb3d96ed7557b576'),
        ('public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)', '4ee491437a6e6edd287ae187424ea013405a5bbbb9e1f0756f75813511be62c1'),
        ('public.adle_lesson_snapshot_is_structurally_valid(jsonb)', '37fe23fa813f0e3746161f691460e1481daf6852476a3ae8a2406629e5689823')
    ) expected(signature, definition_sha256)
  loop
    v_oid := to_regprocedure(v_expected.signature);
    if v_oid is null then
      raise exception 'Phase E7B restoration failed to recreate %', v_expected.signature;
    end if;
    select encode(extensions.digest(pg_get_functiondef(v_oid), 'sha256'), 'hex') into v_hash;
    if v_hash <> v_expected.definition_sha256 then
      raise exception 'Phase E7B restoration hash mismatch for %', v_expected.signature;
    end if;
  end loop;
end
$phase_e7b_restore_postflight$;

commit;
