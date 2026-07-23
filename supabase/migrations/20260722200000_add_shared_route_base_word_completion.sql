-- Complete Base Word Lab lessons through the same shared canonical-word
-- schedule used by ordinary ADLE lessons.  V1 remains available for stored
-- assignments and rollback; the application calls V2 for new completions.

create or replace function public.complete_adle_base_word_family_pilot_v2(
  p_parent_user_id uuid, p_child_id uuid, p_assignment_id uuid, p_plan_date date,
  p_micro_skill_key text, p_source_ref text, p_assignment_item_ids uuid[],
  p_attempts jsonb, p_lesson jsonb, p_transfer_misses jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_result jsonb;
  v_row jsonb;
  v_word_id uuid;
  v_bundle_id uuid;
  v_schedule_word_id uuid;
  v_outcome_event_id uuid;
  v_old_route_count integer;
  v_new_route_count integer;
  v_old_route_counts jsonb := '{}'::jsonb;
begin
  if not exists (
    select 1
      from public.micro_skill_catalog catalog
     where catalog.micro_skill_key = p_micro_skill_key
       and catalog.mastery_domain_key = 'D4'
       and catalog.is_active = true
       and catalog.is_assignable = true
  ) then
    raise exception 'Base Word Lab completion requires an active assignable D4 catalogued micro-skill';
  end if;

  if jsonb_typeof(p_lesson) <> 'object'
     or jsonb_array_length(coalesce(p_lesson->'scheduleWords', '[]'::jsonb)) <> 2
     or jsonb_typeof(p_lesson->'bundle') <> 'object' then
    raise exception 'Base Word Lab shared-route completion requires exactly two authentic schedule words';
  end if;

  v_bundle_id := (p_lesson->'bundle'->>'bundleId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('adle-base-word-shared-routes:' || p_child_id::text, 0));

  select assignment.status
    into v_status
    from public.daily_assignments assignment
   where assignment.id = p_assignment_id
     and assignment.parent_user_id = p_parent_user_id
     and assignment.child_id = p_child_id
     and assignment.assignment_date = p_plan_date
     and assignment.title = 'ADLE Base-word Family Pilot'
     and assignment.assignment_generation_source = 'adle_base_word_family_pilot_v1'
   for update;
  if v_status is null then
    raise exception 'Base Word Lab shared-route completion ownership validation failed';
  end if;

  -- Replays must not disturb the active schedule. V1 performs its existing
  -- durable-count verification and returns already_completed.
  if v_status = 'completed' then
    v_result := public.complete_adle_base_word_family_pilot_v1(
      p_parent_user_id, p_child_id, p_assignment_id, p_plan_date,
      p_micro_skill_key, p_source_ref, p_assignment_item_ids,
      p_attempts, p_lesson, p_transfer_misses
    );
  else
    -- Capture the previous route cardinality before superseding the one active
    -- child + canonical-word schedule. A legacy linked schedule counts as one
    -- route even if its additive linkage row has not yet been reconciled.
    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      v_word_id := (v_row->>'canonicalWordId')::uuid;
      if not exists (
        select 1
          from public.adle_learning_items item
         where item.child_id = p_child_id
           and item.canonical_word_id = v_word_id
           and item.micro_skill_key = p_micro_skill_key
           and item.row_status = 'active'
           and item.item_status <> 'resolved'
      ) then
        raise exception 'Base Word Lab authentic target has no active learning item for the selected catalogued route';
      end if;

      select count(distinct route.micro_skill_key)
        into v_old_route_count
        from public.adle_review_schedule_words schedule
        left join public.adle_review_schedule_word_routes route
          on route.schedule_word_id = schedule.id and route.row_status = 'active'
       where schedule.child_id = p_child_id
         and schedule.canonical_word_id = v_word_id
         and schedule.row_status = 'active';
      if v_old_route_count = 0 and exists (
        select 1 from public.adle_review_schedule_words schedule
         where schedule.child_id = p_child_id
           and schedule.canonical_word_id = v_word_id
           and schedule.row_status = 'active'
      ) then
        v_old_route_count := 1;
      end if;
      v_old_route_counts := jsonb_set(v_old_route_counts, array[v_word_id::text], to_jsonb(v_old_route_count), true);

      update public.adle_review_schedule_word_routes route
         set row_status = 'superseded'
       where route.schedule_word_id in (
         select schedule.id from public.adle_review_schedule_words schedule
          where schedule.child_id = p_child_id
            and schedule.canonical_word_id = v_word_id
            and schedule.row_status = 'active'
       ) and route.row_status = 'active';

      update public.adle_review_schedule_words schedule
         set row_status = 'superseded', updated_at = timezone('utc', now())
       where schedule.child_id = p_child_id
         and schedule.canonical_word_id = v_word_id
         and schedule.row_status = 'active';
    end loop;

    -- V1 owns the exact 18-item snapshot, reflection, attempt, transfer,
    -- learning-item, assignment and base-word-run transaction contract.
    v_result := public.complete_adle_base_word_family_pilot_v1(
      p_parent_user_id, p_child_id, p_assignment_id, p_plan_date,
      p_micro_skill_key, p_source_ref, p_assignment_item_ids,
      p_attempts, p_lesson, p_transfer_misses
    );

    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      v_word_id := (v_row->>'canonicalWordId')::uuid;
      select schedule.id
        into v_schedule_word_id
        from public.adle_review_schedule_words schedule
       where schedule.child_id = p_child_id
         and schedule.canonical_word_id = v_word_id
         and schedule.bundle_id = v_bundle_id
         and schedule.row_status = 'active';
      if v_schedule_word_id is null then
        raise exception 'Base Word Lab failed to create the active shared canonical-word schedule';
      end if;

      insert into public.adle_review_schedule_word_routes (
        schedule_word_id, learning_item_id, micro_skill_key,
        attached_on, attachment_ordinal, row_status
      )
      select
        v_schedule_word_id,
        item.id,
        item.micro_skill_key,
        (v_row->>'taughtOn')::date,
        row_number() over (order by item.intake_on, item.created_at, item.id),
        'active'
      from public.adle_learning_items item
      where item.child_id = p_child_id
        and item.canonical_word_id = v_word_id
        and item.row_status = 'active'
        and item.item_status <> 'resolved'
      order by item.intake_on, item.created_at, item.id;

      select count(distinct route.micro_skill_key)
        into v_new_route_count
        from public.adle_review_schedule_word_routes route
       where route.schedule_word_id = v_schedule_word_id
         and route.row_status = 'active';
      if v_new_route_count = 0 then
        raise exception 'Base Word Lab shared canonical-word schedule has no active routes';
      end if;

      v_old_route_count := coalesce((v_old_route_counts->>v_word_id::text)::integer, 0);
      if v_old_route_count > 0 and v_new_route_count > v_old_route_count then
        insert into public.adle_review_outcome_events (
          child_id, canonical_word_id, bundle_id, event_type, occurred_on,
          interval_index, schedule_policy_version, attempt_text
        ) values (
          p_child_id, v_word_id, v_bundle_id, 'reactivated_for_new_skill',
          (v_row->>'taughtOn')::date, 0,
          p_lesson->'bundle'->>'schedulePolicyVersion', null
        ) returning id into v_outcome_event_id;

        insert into public.adle_review_outcome_event_routes (
          outcome_event_id, learning_item_id, micro_skill_key
        )
        select v_outcome_event_id, route.learning_item_id, route.micro_skill_key
          from public.adle_review_schedule_word_routes route
         where route.schedule_word_id = v_schedule_word_id
           and route.row_status = 'active';
      end if;
    end loop;
  end if;

  -- A completed multi-route word without explicit links is never accepted,
  -- including an idempotent replay of a partially-written legacy completion.
  for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
    v_word_id := (v_row->>'canonicalWordId')::uuid;
    select schedule.id into v_schedule_word_id
      from public.adle_review_schedule_words schedule
     where schedule.child_id = p_child_id
       and schedule.canonical_word_id = v_word_id
       and schedule.row_status = 'active';
    select count(distinct item.micro_skill_key) into v_new_route_count
      from public.adle_learning_items item
     where item.child_id = p_child_id
       and item.canonical_word_id = v_word_id
       and item.row_status = 'active'
       and item.item_status <> 'resolved';
    if v_new_route_count > 1 and (
      v_schedule_word_id is null or
      (select count(distinct route.micro_skill_key)
         from public.adle_review_schedule_word_routes route
        where route.schedule_word_id = v_schedule_word_id
          and route.row_status = 'active') <> v_new_route_count
    ) then
      raise exception 'Base Word Lab multi-route schedule is incomplete and has failed closed';
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_adle_base_word_family_pilot_v2(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;
