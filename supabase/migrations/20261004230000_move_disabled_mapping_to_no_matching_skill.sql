begin;

-- A reopened, disabled historical mapping must not strand a valid-word pair
-- in the canonical resolver queue. Keep the disabled mapping and its audit
-- record; detach only the pending resolver item before moving it to review.
create or replace function public.move_spelling_resolution_to_no_matching_skill_admin(
  p_item_id uuid, p_admin_user_id uuid, p_admin_email text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.spelling_resolution_items%rowtype;
  v_mapping public.spelling_canonical_mappings%rowtype;
begin
  if p_admin_user_id is null then raise exception 'An admin identity is required.'; end if;
  select * into v_item from public.spelling_resolution_items where id=p_item_id for update;
  if v_item.id is null or v_item.review_status<>'pending' or v_item.resolver_enabled then
    raise exception 'Only pending, resolver-inactive rows can move to No Matching Skill.';
  end if;
  if v_item.mapping_id is not null then
    select * into v_mapping from public.spelling_canonical_mappings
      where id=v_item.mapping_id for update;
    if v_mapping.id is null or v_mapping.mapping_status<>'disabled'
      or v_mapping.resolver_visibility_status<>'disabled' then
      raise exception 'The historical canonical mapping must be disabled before moving this pair.';
    end if;
  end if;
  if exists(select 1 from public.spelling_no_matching_skill_cases
    where resolution_item_id=p_item_id and case_status='open') then
    raise exception 'This row is already in No Matching Skill.';
  end if;
  update public.spelling_resolution_items set review_status='no_matching_skill',
    mapping_id=null,micro_skill_key=null,resolver_enabled=false,
    updated_at=timezone('utc',now()) where id=p_item_id;
  insert into public.spelling_no_matching_skill_cases(
    resolution_item_id,moved_by_admin_user_id,moved_by_admin_email)
  values(p_item_id,p_admin_user_id,p_admin_email)
  on conflict(resolution_item_id) do update set
    case_status='open',moved_by_admin_user_id=excluded.moved_by_admin_user_id,
    moved_by_admin_email=excluded.moved_by_admin_email,
    moved_at=excluded.moved_at,returned_at=null;
  return p_item_id;
end $$;

revoke all on function public.move_spelling_resolution_to_no_matching_skill_admin(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.move_spelling_resolution_to_no_matching_skill_admin(uuid,uuid,text)
  to service_role;

commit;
