-- Keep global enrolment off until the guarded production release transaction.
begin;

create table public.authentic_use_rollout (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  enabled_at timestamptz
);
insert into public.authentic_use_rollout (id, enabled) values (true, false);
alter table public.authentic_use_rollout enable row level security;

create function public.enrol_child_in_authentic_use() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_archived or not exists (
    select 1 from public.authentic_use_rollout where id and enabled
  ) then return new; end if;

  insert into public.authentic_use_controls (
    child_id, parent_user_id, mode, gold_enabled, proficiency_enabled, activation_cutoff
  ) values (new.id, new.parent_user_id, 'enabled', true, true, clock_timestamp())
  on conflict (child_id) do update set
    parent_user_id = excluded.parent_user_id,
    mode = 'enabled',
    gold_enabled = true,
    proficiency_enabled = true,
    activation_cutoff = case
      when public.authentic_use_controls.mode = 'enabled'
      then public.authentic_use_controls.activation_cutoff
      else excluded.activation_cutoff
    end;
  return new;
end $$;

create trigger enrol_child_in_authentic_use
  after insert or update of is_archived on public.children
  for each row execute function public.enrol_child_in_authentic_use();

commit;
