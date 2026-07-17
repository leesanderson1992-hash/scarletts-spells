-- ADLE 7-UI-H: one durable completion transaction for the explicitly
-- allowlisted Word Lab v1 pilot. Generic ADLE completion remains unchanged.

create or replace function public.complete_adle_word_lab_v1(
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
$$;

revoke all on function public.complete_adle_word_lab_v1(uuid, uuid, uuid, date, text, text, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_adle_word_lab_v1(uuid, uuid, uuid, date, text, text, uuid[], jsonb, jsonb, jsonb) to service_role;
