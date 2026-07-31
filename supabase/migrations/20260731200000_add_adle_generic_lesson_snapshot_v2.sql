-- Immutable assignment-level lesson snapshots for newly composed generic
-- ADLE plans. Historical rows deliberately remain NULL; there is no backfill.

create or replace function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(
  p_snapshot jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)
from public, anon, authenticated;
-- CHECK constraints are evaluated during authenticated status updates.
grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)
to authenticated, service_role;

alter table public.daily_assignments
  add column compiled_lesson_snapshot jsonb null;

alter table public.daily_assignments
  add constraint daily_assignments_compiled_lesson_snapshot_v2_check
  check (
    compiled_lesson_snapshot is null
    or public.adle_generic_lesson_snapshot_is_structurally_valid_v2(compiled_lesson_snapshot)
  );

create index daily_assignments_compiled_snapshot_version_idx
  on public.daily_assignments ((compiled_lesson_snapshot->>'snapshotSchemaVersion'))
  where compiled_lesson_snapshot is not null;

create or replace function public.prevent_adle_compiled_lesson_snapshot_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.compiled_lesson_snapshot is distinct from new.compiled_lesson_snapshot then
    raise exception 'ADLE compiled lesson snapshot is immutable';
  end if;
  return new;
end;
$$;

create trigger daily_assignments_compiled_lesson_snapshot_immutable
before update of compiled_lesson_snapshot on public.daily_assignments
for each row
execute function public.prevent_adle_compiled_lesson_snapshot_update();

create or replace function public.persist_adle_generic_daily_plan_v2(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_header jsonb,
  p_items jsonb,
  p_intakes jsonb,
  p_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- Serialize the repository's unique (child, date, title) envelope so two
  -- concurrent first visits cannot append different item sets.
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
$$;

revoke all on function public.persist_adle_generic_daily_plan_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_adle_generic_daily_plan_v2(
  uuid, uuid, date, jsonb, jsonb, jsonb, jsonb
) to service_role;
