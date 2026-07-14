-- ADLE 7-UI-G: atomic persistence boundary for an explicitly composed pilot
-- assignment. The normal composer route remains unchanged. This function is
-- service-role only and validates the complete child/parent/date envelope
-- before writing the header, its 16 items, and any stretch intakes in one
-- PostgreSQL transaction.

create or replace function public.persist_adle_composed_daily_plan_v1(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_header jsonb,
  p_items jsonb,
  p_intakes jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 16 then
    raise exception 'ADLE composed plan requires exactly 16 assignment items';
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
    target_words, review_words, assignment_generation_source
  ) values (
    p_child_id,
    p_parent_user_id,
    p_plan_date,
    p_header->>'title',
    p_header->>'status',
    array(select jsonb_array_elements_text(coalesce(p_header->'targetWords', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_header->'reviewWords', '[]'::jsonb))),
    p_header->>'assignmentGenerationSource'
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
$$;

revoke all on function public.persist_adle_composed_daily_plan_v1(uuid, uuid, date, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_adle_composed_daily_plan_v1(uuid, uuid, date, jsonb, jsonb, jsonb) to service_role;
