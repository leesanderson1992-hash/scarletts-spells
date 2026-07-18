-- D4_MOR base-word-family guarded pilot. This path is deliberately separate
-- from D4_MOR_PREFIXES_UN and is service-role-only. No row is created by a
-- page view; the explicit generator must call the persistence function.

create table if not exists public.adle_base_word_family_pilot_runs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.daily_assignments(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  pilot_lesson_number integer not null check (pilot_lesson_number between 1 and 5),
  run_status text not null default 'generated' check (run_status in ('generated', 'completed', 'stopped', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  unique (child_id, pilot_lesson_number)
);

alter table public.adle_base_word_family_pilot_runs enable row level security;
revoke all on table public.adle_base_word_family_pilot_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.adle_base_word_family_pilot_runs to service_role;

create or replace function public.persist_adle_base_word_family_pilot_v1(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_payload jsonb,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_assignment_id uuid; v_item jsonb; v_position integer := 0; v_run_number integer;
begin
  if not exists (select 1 from public.children where id = p_child_id and parent_user_id = p_parent_user_id and coalesce(is_archived, false) = false) then
    raise exception 'ADLE base-word pilot child ownership validation failed';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or p_payload->>'experience' <> 'D4_MOR_BASE_WORD_FAMILY'
    or jsonb_array_length(coalesce(p_payload->'authenticTargets', '[]'::jsonb)) <> 2
    or jsonb_array_length(coalesce(p_payload->'independentWords', '[]'::jsonb)) <> 5 then
    raise exception 'ADLE base-word pilot payload validation failed';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 13 then
    raise exception 'ADLE base-word pilot requires exactly 13 assignment items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('adle-base-word-family:' || p_child_id::text, 0));
  select count(*) + 1 into v_run_number from public.adle_base_word_family_pilot_runs
    where child_id = p_child_id and run_status <> 'cancelled';
  if v_run_number > 5 then raise exception 'ADLE base-word pilot has reached its five-lesson cap'; end if;
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
$$;

revoke all on function public.persist_adle_base_word_family_pilot_v1(uuid, uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_adle_base_word_family_pilot_v1(uuid, uuid, date, jsonb, jsonb) to service_role;

-- Completion is a separate atomic boundary. Its lesson write is computed by
-- the existing evidence/scheduler policy from the *two authentic slots only*.
-- Transfer misses are ledgered here, but are never passed to schedule words.
create or replace function public.complete_adle_base_word_family_pilot_v1(
  p_parent_user_id uuid, p_child_id uuid, p_assignment_id uuid, p_plan_date date,
  p_micro_skill_key text, p_source_ref text, p_assignment_item_ids uuid[],
  p_attempts jsonb, p_lesson jsonb, p_transfer_misses jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text; v_row jsonb; v_bundle_id uuid; v_input_bundle_id uuid; v_now timestamptz := timezone('utc', now()); v_attempt_count integer;
begin
  if p_micro_skill_key <> 'D4_MOR_BASE_WORDS_PRESERVE_BASE' or nullif(btrim(p_source_ref),'') is null
    or jsonb_typeof(p_attempts) <> 'array' or jsonb_typeof(p_lesson) <> 'object' or jsonb_typeof(p_transfer_misses) <> 'array' then
    raise exception 'ADLE base-word pilot completion envelope validation failed';
  end if;
  select status into v_status from public.daily_assignments where id = p_assignment_id and parent_user_id = p_parent_user_id and child_id = p_child_id and assignment_date = p_plan_date and title = 'ADLE Base-word Family Pilot' and assignment_generation_source = 'adle_base_word_family_pilot_v1' for update;
  if v_status is null then raise exception 'ADLE base-word pilot completion ownership validation failed'; end if;
  if (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id) <> 13
    or coalesce(array_length(p_assignment_item_ids,1),0) <> 13
    or (select count(distinct id) from unnest(p_assignment_item_ids) as id) <> 13
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and id = any(p_assignment_item_ids)) <> 13
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_intro') <> 1
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'guided_practice') <> 2
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_production') <> 5
    or (select count(*) from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'sectionKey' = 'lesson_dictation') <> 5
    or exists (select 1 from public.assignment_items where daily_assignment_id = p_assignment_id and metadata->>'microSkillKey' is distinct from p_micro_skill_key) then
    raise exception 'ADLE base-word pilot requires the exact 13-item snapshot';
  end if;
  if jsonb_array_length(p_attempts) <> 10 or (select count(*) from jsonb_array_elements(p_attempts) where value->>'attemptKind' = 'lesson_production') <> 5 or (select count(*) from jsonb_array_elements(p_attempts) where value->>'attemptKind' = 'lesson_dictation') <> 5
    or exists (select 1 from jsonb_array_elements(p_attempts) where value->>'childId' is distinct from p_child_id::text or value->>'parentUserId' is distinct from p_parent_user_id::text or value->>'dailyAssignmentId' is distinct from p_assignment_id::text or value->>'sourceRef' not like p_source_ref || '%') then
    raise exception 'ADLE base-word pilot requires ten bound independent attempt events';
  end if;
  if jsonb_array_length(coalesce(p_lesson->'scheduleWords','[]'::jsonb)) <> 2 or jsonb_array_length(coalesce(p_lesson->'taughtEvents','[]'::jsonb)) <> 2 or jsonb_array_length(coalesce(p_lesson->'itemTransitions','[]'::jsonb)) <> 2 or jsonb_typeof(p_lesson->'bundle') <> 'object' then
    raise exception 'ADLE base-word pilot requires normal outcomes for exactly two authentic targets';
  end if;
  if v_status <> 'completed' then
    v_input_bundle_id := (p_lesson->'bundle'->>'bundleId')::uuid; v_bundle_id := v_input_bundle_id;
    insert into public.adle_review_bundles (id, child_id, source_ref, interval_index, next_due_on, schedule_policy_version, bundle_status, row_status)
    select v_bundle_id, p_child_id, p_source_ref, (p_lesson->'bundle'->>'intervalIndex')::integer, (p_lesson->'bundle'->>'nextDueOn')::date, p_lesson->'bundle'->>'schedulePolicyVersion', p_lesson->'bundle'->>'bundleStatus', 'active'
    where not exists (select 1 from public.adle_review_bundles where child_id = p_child_id and source_ref = p_source_ref and row_status = 'active');
    for v_row in select value from jsonb_array_elements(p_lesson->'scheduleWords') loop
      if not exists (select 1 from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'provenance'='authentic_target' and metadata->>'canonicalWordId'=v_row->>'canonicalWordId') then raise exception 'Transfer words cannot enter base-word pilot scheduling'; end if;
      if exists (select 1 from public.adle_review_schedule_words where child_id=p_child_id and canonical_word_id=(v_row->>'canonicalWordId')::uuid and bundle_id=v_bundle_id and row_status='active') then
        update public.adle_review_schedule_words set membership_status=v_row->>'membershipStatus', catch_up_stage=(v_row->>'catchUpStage')::integer, next_retest_due_on=nullif(v_row->>'nextRetestDueOn','')::date, failed_review_on=nullif(v_row->>'failedReviewOn','')::date, pre_retirement_check_due_on=nullif(v_row->>'preRetirementCheckDueOn','')::date, last_28_day_review_on=nullif(v_row->>'last28DayReviewOn','')::date, reteach_cycle_count=(v_row->>'reteachCycleCount')::integer, taught_on=(v_row->>'taughtOn')::date, updated_at=v_now where child_id=p_child_id and canonical_word_id=(v_row->>'canonicalWordId')::uuid and bundle_id=v_bundle_id and row_status='active';
      else
        insert into public.adle_review_schedule_words (child_id, canonical_word_id, bundle_id, membership_status, catch_up_stage, next_retest_due_on, failed_review_on, pre_retirement_check_due_on, last_28_day_review_on, reteach_cycle_count, taught_on, row_status)
        values (p_child_id,(v_row->>'canonicalWordId')::uuid,v_bundle_id,v_row->>'membershipStatus',(v_row->>'catchUpStage')::integer,nullif(v_row->>'nextRetestDueOn','')::date,nullif(v_row->>'failedReviewOn','')::date,nullif(v_row->>'preRetirementCheckDueOn','')::date,nullif(v_row->>'last28DayReviewOn','')::date,(v_row->>'reteachCycleCount')::integer,(v_row->>'taughtOn')::date,'active');
      end if;
    end loop;
    for v_row in select value from jsonb_array_elements(p_lesson->'taughtEvents') loop
      insert into public.adle_taught_word_history (child_id, canonical_word_id, event_kind, occurred_on, source_ref, row_status, attempt_text)
      select p_child_id,(v_row->>'canonicalWordId')::uuid,v_row->>'eventKind',(v_row->>'occurredOn')::date,p_source_ref,'active',nullif(v_row->>'attemptText','')
      where not exists (select 1 from public.adle_taught_word_history where child_id=p_child_id and canonical_word_id=(v_row->>'canonicalWordId')::uuid and event_kind=v_row->>'eventKind' and source_ref=p_source_ref and row_status='active');
    end loop;
    for v_row in select value from jsonb_array_elements(p_lesson->'itemTransitions') loop
      update public.adle_learning_items set item_status=v_row->>'itemStatus', reteach_priority=(v_row->>'reteachPriority')::boolean, ejected_on=nullif(v_row->>'ejectedOn','')::date, row_status=v_row->>'rowStatus', updated_at=v_now where id=(v_row->>'learningItemId')::uuid and child_id=p_child_id and micro_skill_key=p_micro_skill_key;
      if not found then raise exception 'ADLE base-word pilot authentic learning item transition target missing'; end if;
    end loop;
    insert into public.adle_assignment_attempt_events (child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,micro_skill_key,section_key,template_key,target_word,attempt_text,is_correct,attempt_kind,evidence_class,source_ref)
    select (value->>'childId')::uuid,(value->>'parentUserId')::uuid,(value->>'dailyAssignmentId')::uuid,(value->>'assignmentItemId')::uuid,nullif(value->>'canonicalWordId','')::uuid,nullif(value->>'microSkillKey',''),value->>'sectionKey',nullif(value->>'templateKey',''),nullif(value->>'targetWord',''),value->>'attemptText',nullif(value->>'isCorrect','')::boolean,value->>'attemptKind',value->>'evidenceClass',value->>'sourceRef' from jsonb_array_elements(p_attempts) on conflict (assignment_item_id,attempt_kind,source_ref) do nothing;
    for v_row in select value from jsonb_array_elements(p_transfer_misses) loop
      if not exists (select 1 from public.assignment_items where daily_assignment_id=p_assignment_id and metadata->>'provenance'='transfer' and metadata->>'canonicalWordId'=v_row->>'canonicalWordId') then raise exception 'ADLE base-word transfer evidence must name a bound transfer word'; end if;
      perform public.record_adle_base_word_transfer_miss_v1(p_child_id,(v_row->>'canonicalWordId')::uuid,p_micro_skill_key,p_source_ref,p_plan_date,v_row->>'attemptText');
    end loop;
    update public.assignment_items set status='completed' where daily_assignment_id=p_assignment_id and id=any(p_assignment_item_ids);
    update public.daily_assignments set status='completed' where id=p_assignment_id;
    update public.adle_base_word_family_pilot_runs set run_status='completed', completed_at=v_now where assignment_id=p_assignment_id;
  end if;
  select count(*) into v_attempt_count from public.adle_assignment_attempt_events where daily_assignment_id=p_assignment_id;
  if v_attempt_count <> 10 then raise exception 'ADLE base-word pilot durable attempt verification failed'; end if;
  return jsonb_build_object('status',case when v_status='completed' then 'already_completed' else 'completed' end,'counts',jsonb_build_object('items',13,'attempts',v_attempt_count,'authenticTargets',2));
end;
$$;
revoke all on function public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_adle_base_word_family_pilot_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;
