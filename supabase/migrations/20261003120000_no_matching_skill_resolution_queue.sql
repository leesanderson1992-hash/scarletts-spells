begin;

alter table public.spelling_resolution_items
  drop constraint spelling_resolution_items_review_status_check;
alter table public.spelling_resolution_items
  add constraint spelling_resolution_items_review_status_check
  check (review_status in ('pending', 'confirmed', 'closed', 'no_matching_skill'));

create table public.spelling_no_matching_skill_cases (
  id uuid primary key default gen_random_uuid(),
  resolution_item_id uuid not null unique references public.spelling_resolution_items(id) on delete cascade,
  case_status text not null default 'open' check (case_status in ('open', 'returned')),
  moved_by_admin_user_id uuid not null,
  moved_by_admin_email text,
  moved_at timestamptz not null default timezone('utc', now()),
  returned_at timestamptz
);
create index spelling_no_matching_skill_cases_status_idx
  on public.spelling_no_matching_skill_cases(case_status, moved_at desc);
alter table public.spelling_no_matching_skill_cases enable row level security;
revoke all on public.spelling_no_matching_skill_cases from anon, authenticated;
grant all on public.spelling_no_matching_skill_cases to service_role;

create function public.move_spelling_resolution_to_no_matching_skill_admin(
  p_item_id uuid, p_admin_user_id uuid, p_admin_email text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.spelling_resolution_items%rowtype;
begin
  if p_admin_user_id is null then
    raise exception 'An admin identity is required.';
  end if;
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found or v_item.review_status <> 'pending' or v_item.mapping_id is not null
    or v_item.resolver_enabled then
    raise exception 'Only pending rows without a canonical mapping can move to No Matching Skill.';
  end if;
  if exists (select 1 from public.spelling_no_matching_skill_cases
    where resolution_item_id = p_item_id and case_status = 'open') then
    raise exception 'This row is already in No Matching Skill.';
  end if;
  update public.spelling_resolution_items set review_status = 'no_matching_skill',
    micro_skill_key = null, resolver_enabled = false,
    updated_at = timezone('utc', now()) where id = p_item_id;
  insert into public.spelling_no_matching_skill_cases (
    resolution_item_id, moved_by_admin_user_id, moved_by_admin_email
  ) values (p_item_id, p_admin_user_id, p_admin_email)
  on conflict (resolution_item_id) do update set
    case_status = 'open', moved_by_admin_user_id = excluded.moved_by_admin_user_id,
    moved_by_admin_email = excluded.moved_by_admin_email,
    moved_at = excluded.moved_at, returned_at = null;
  return p_item_id;
end;
$$;

create function public.return_no_matching_skill_to_resolution_admin(
  p_item_id uuid, p_admin_user_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.spelling_resolution_items%rowtype;
begin
  if p_admin_user_id is null then raise exception 'An admin identity is required.'; end if;
  select * into v_item from public.spelling_resolution_items where id = p_item_id for update;
  if not found or v_item.review_status <> 'no_matching_skill' or v_item.mapping_id is not null
    or v_item.resolver_enabled then
    raise exception 'This spelling pair is no longer waiting for a matching skill.';
  end if;
  update public.spelling_no_matching_skill_cases set case_status = 'returned',
    returned_at = timezone('utc', now())
  where resolution_item_id = p_item_id and case_status = 'open';
  if not found then raise exception 'The No Matching Skill case was not found.'; end if;
  update public.spelling_resolution_items set review_status = 'pending',
    updated_at = timezone('utc', now()) where id = p_item_id;
  return p_item_id;
end;
$$;

create function public.sync_no_matching_skill_case_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.review_status = 'no_matching_skill' and new.review_status <> 'no_matching_skill' then
    update public.spelling_no_matching_skill_cases set case_status = 'returned',
      returned_at = timezone('utc', now())
    where resolution_item_id = new.id and case_status = 'open';
  end if;
  return new;
end;
$$;
create trigger spelling_no_matching_skill_status_sync
  after update of review_status on public.spelling_resolution_items
  for each row execute function public.sync_no_matching_skill_case_status();

create or replace function public.register_spelling_resolution_source() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_misspelling text;
  v_correction text;
  v_dialect text;
  v_skill text;
  v_item_id uuid;
  v_open boolean;
begin
  if tg_table_name = 'parent_verified_spelling_candidate_mappings' then
    if new.candidate_status not in ('parent_local_promoted', 'global_canonical_promoted') then
      return new;
    end if;
    v_type := 'candidate';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := new.micro_skill_key;
    v_open := true;
  elsif tg_table_name = 'spelling_seed_import_rows' then
    v_type := 'seed';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := new.dialect_code;
    v_skill := new.suggested_micro_skill_key;
    v_open := new.row_status not in ('rejected', 'duplicate', 'superseded');
  elsif tg_table_name = 'spelling_canonical_mapping_recommendations' then
    v_type := 'recommendation';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := new.micro_skill_key;
    v_open := new.recommendation_status in ('recommended', 'pending_admin_review', 'accepted');
  else
    v_type := 'catalog';
    v_misspelling := new.misspelling_normalized;
    v_correction := new.correct_spelling_normalized;
    v_dialect := 'en-GB';
    v_skill := coalesce(new.metadata->>'suggested_micro_skill_key', new.metadata->>'selected_micro_skill_key');
    v_open := new.case_status in ('open', 'needs_new_micro_skill', 'word_level_only');
  end if;

  -- Import data can suggest an unknown skill; keep it pending without one.
  if v_skill is not null and not exists (
    select 1 from public.micro_skill_catalog where micro_skill_key = v_skill
  ) then
    v_skill := null;
  end if;

  select id into v_item_id from public.spelling_resolution_items
  where misspelling = v_misspelling and correction = v_correction and dialect_code = v_dialect
    and review_status <> 'closed'
  order by (review_status = 'confirmed') desc, created_at, id limit 1;
  if v_item_id is null then
    insert into public.spelling_resolution_items (
      origin_misspelling, origin_correction, misspelling, correction, dialect_code, micro_skill_key
    ) values (v_misspelling, v_correction, v_misspelling, v_correction, v_dialect, v_skill)
    on conflict (origin_misspelling, origin_correction, dialect_code) do update
      set micro_skill_key = case when public.spelling_resolution_items.review_status = 'no_matching_skill'
        then public.spelling_resolution_items.micro_skill_key
        else coalesce(public.spelling_resolution_items.micro_skill_key, excluded.micro_skill_key) end
    returning id into v_item_id;
  elsif v_skill is not null and not exists (
    select 1 from public.spelling_resolution_items
    where id = v_item_id and review_status = 'no_matching_skill'
  ) then
    update public.spelling_resolution_items set micro_skill_key = coalesce(micro_skill_key, v_skill)
    where id = v_item_id;
  end if;

  insert into public.spelling_resolution_item_sources(item_id, source_type, source_id)
  values (v_item_id, v_type, new.id)
  on conflict (source_type, source_id) do nothing;

  -- A new source may add evidence, but an admin's no-skill disposition stays in its own queue.
  if (select review_status from public.spelling_resolution_items where id = v_item_id) = 'no_matching_skill' then
    return new;
  end if;

  if exists (select 1 from public.spelling_canonical_mappings where id =
      (select mapping_id from public.spelling_resolution_items where id = v_item_id)
      and mapping_status = 'active') then
    update public.spelling_resolution_items set review_status = 'confirmed' where id = v_item_id;
  elsif v_open then
    update public.spelling_resolution_items set review_status = 'pending' where id = v_item_id;
  elsif (select count(*) from public.spelling_resolution_item_sources where item_id = v_item_id) = 1 then
    update public.spelling_resolution_items set review_status = 'closed' where id = v_item_id;
  end if;
  return new;
end;
$$;


revoke all on function public.move_spelling_resolution_to_no_matching_skill_admin(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.return_no_matching_skill_to_resolution_admin(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.move_spelling_resolution_to_no_matching_skill_admin(uuid,uuid,text)
  to service_role;
grant execute on function public.return_no_matching_skill_to_resolution_admin(uuid,uuid)
  to service_role;

commit;
