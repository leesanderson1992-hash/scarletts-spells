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
