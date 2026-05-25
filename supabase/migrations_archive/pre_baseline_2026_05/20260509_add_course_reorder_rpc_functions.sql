begin;

create or replace function public.reorder_course_module_adjacent(
  p_module_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
as $$
declare
  v_current public.course_modules%rowtype;
  v_target_id uuid;
  v_target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid module move.';
  end if;

  select *
  into v_current
  from public.course_modules
  where id = p_module_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that module.';
  end if;

  with ordered as (
    select
      id,
      position,
      row_number() over (
        order by position asc, created_at asc, id asc
      ) as row_num
    from public.course_modules
    where course_id = v_current.course_id
      and parent_user_id = auth.uid()
      and phase_id is not distinct from v_current.phase_id
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select id
  into v_target_id
  from ordered, current_row
  where ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end;

  if v_target_id is null then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  select position
  into v_target_position
  from public.course_modules
  where id = v_target_id
    and parent_user_id = auth.uid()
  for update;

  update public.course_modules
  set position = v_target_position
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_modules
  set position = v_current.position
  where id = v_target_id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'position', v_target_position),
      jsonb_build_object('id', v_target_id, 'position', v_current.position)
    )
  );
end;
$$;

grant execute on function public.reorder_course_module_adjacent(uuid, text) to authenticated;

create or replace function public.reorder_course_task_adjacent(
  p_task_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
as $$
declare
  v_current public.course_tasks%rowtype;
  v_target_id uuid;
  v_target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid task move.';
  end if;

  select *
  into v_current
  from public.course_tasks
  where id = p_task_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that task.';
  end if;

  with ordered as (
    select
      id,
      position,
      row_number() over (
        order by position asc, created_at asc, id asc
      ) as row_num
    from public.course_tasks
    where module_id = v_current.module_id
      and parent_user_id = auth.uid()
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select id
  into v_target_id
  from ordered, current_row
  where ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end;

  if v_target_id is null then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  select position
  into v_target_position
  from public.course_tasks
  where id = v_target_id
    and parent_user_id = auth.uid()
  for update;

  update public.course_tasks
  set position = v_target_position
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_tasks
  set position = v_current.position
  where id = v_target_id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'position', v_target_position),
      jsonb_build_object('id', v_target_id, 'position', v_current.position)
    )
  );
end;
$$;

grant execute on function public.reorder_course_task_adjacent(uuid, text) to authenticated;

create or replace function public.reorder_course_checkpoint_adjacent(
  p_checkpoint_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
as $$
declare
  v_current public.course_checkpoints%rowtype;
  v_target public.course_checkpoints%rowtype;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Choose a valid checkpoint move.';
  end if;

  select *
  into v_current
  from public.course_checkpoints
  where id = p_checkpoint_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that checkpoint.';
  end if;

  with ordered as (
    select
      id,
      row_number() over (
        order by scheduled_date asc nulls last, created_at desc, id asc
      ) as row_num
    from public.course_checkpoints
    where course_id = v_current.course_id
      and parent_user_id = auth.uid()
      and cycle_number is not distinct from v_current.cycle_number
  ),
  current_row as (
    select row_num
    from ordered
    where id = v_current.id
  )
  select checkpoints.*
  into v_target
  from public.course_checkpoints as checkpoints
  join ordered on ordered.id = checkpoints.id
  join current_row on ordered.row_num = current_row.row_num + case when p_direction = 'up' then -1 else 1 end
  where checkpoints.parent_user_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('changed', '[]'::jsonb);
  end if;

  if v_target.scheduled_date is not distinct from v_current.scheduled_date then
    raise exception 'Checkpoints on the same day cannot be reordered until one of the dates changes.';
  end if;

  update public.course_checkpoints
  set scheduled_date = v_target.scheduled_date
  where id = v_current.id
    and parent_user_id = auth.uid();

  update public.course_checkpoints
  set scheduled_date = v_current.scheduled_date
  where id = v_target.id
    and parent_user_id = auth.uid();

  return jsonb_build_object(
    'changed',
    jsonb_build_array(
      jsonb_build_object('id', v_current.id, 'scheduledDate', v_target.scheduled_date),
      jsonb_build_object('id', v_target.id, 'scheduledDate', v_current.scheduled_date)
    )
  );
end;
$$;

grant execute on function public.reorder_course_checkpoint_adjacent(uuid, text) to authenticated;

create or replace function public.persist_course_task_positions(
  p_module_id uuid,
  p_task_ids uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_module public.course_modules%rowtype;
  v_existing_ids uuid[];
  v_changed jsonb;
begin
  select *
  into v_module
  from public.course_modules
  where id = p_module_id
    and parent_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'We couldn''t find that module.';
  end if;

  with locked as (
    select id
    from public.course_tasks
    where module_id = p_module_id
      and parent_user_id = auth.uid()
    order by position asc, created_at asc, id asc
    for update
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_existing_ids
  from locked;

  if coalesce(cardinality(v_existing_ids), 0) <> coalesce(cardinality(p_task_ids), 0) then
    raise exception 'We couldn''t place that focus block.';
  end if;

  if exists (
    select 1
    from unnest(p_task_ids) as provided_id
    where not (provided_id = any(v_existing_ids))
  ) then
    raise exception 'We couldn''t place that focus block.';
  end if;

  with input as (
    select task_id, ordinality - 1 as next_position
    from unnest(p_task_ids) with ordinality as ordered(task_id, ordinality)
  ),
  updated as (
    update public.course_tasks as tasks
    set position = input.next_position
    from input
    where tasks.id = input.task_id
      and tasks.parent_user_id = auth.uid()
    returning tasks.id, input.next_position
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', updated.id, 'position', updated.next_position)
      order by updated.next_position asc
    ),
    '[]'::jsonb
  )
  into v_changed
  from updated;

  return jsonb_build_object('changed', v_changed);
end;
$$;

grant execute on function public.persist_course_task_positions(uuid, uuid[]) to authenticated;

commit;
