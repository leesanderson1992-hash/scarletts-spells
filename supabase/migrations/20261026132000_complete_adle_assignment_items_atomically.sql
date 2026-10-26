-- All ADLE routes can finish a section without leaving completed item rows
-- under a pending assignment header if the final header write fails.
create or replace function public.complete_adle_assignment_items_v1(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_assignment_id uuid,
  p_item_ids uuid[]
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_incomplete integer;
begin
  if auth.uid() is null or auth.uid() <> p_parent_user_id then
    raise exception 'Assignment completion requires the owning parent.';
  end if;
  if p_item_ids is null or coalesce(array_length(p_item_ids, 1), 0) = 0
    or (select count(distinct item_id) from unnest(p_item_ids) item_id)
      <> array_length(p_item_ids, 1)
  then
    raise exception 'Assignment completion requires distinct item IDs.';
  end if;
  perform 1 from public.daily_assignments assignment
  where assignment.id = p_assignment_id
    and assignment.parent_user_id = p_parent_user_id
    and assignment.child_id = p_child_id
  for update;
  if not found then
    raise exception 'The owned assignment is unavailable.';
  end if;

  select count(*) into v_total from public.assignment_items item
  where item.daily_assignment_id = p_assignment_id
    and item.parent_user_id = p_parent_user_id
    and item.child_id = p_child_id
    and item.id = any(p_item_ids);
  if v_total <> array_length(p_item_ids, 1) then
    raise exception 'The requested assignment item set changed.';
  end if;
  update public.assignment_items set status = 'completed'
  where daily_assignment_id = p_assignment_id
    and parent_user_id = p_parent_user_id
    and child_id = p_child_id
    and id = any(p_item_ids);

  select count(*) into v_incomplete from public.assignment_items item
  where item.daily_assignment_id = p_assignment_id
    and item.parent_user_id = p_parent_user_id
    and item.child_id = p_child_id
    and item.status <> 'completed';
  if v_incomplete = 0 then
    update public.daily_assignments set status = 'completed'
    where id = p_assignment_id and parent_user_id = p_parent_user_id
      and child_id = p_child_id and status <> 'completed';
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.complete_adle_assignment_items_v1(uuid,uuid,uuid,uuid[])
  from public, anon;
grant execute on function public.complete_adle_assignment_items_v1(uuid,uuid,uuid,uuid[])
  to authenticated;
