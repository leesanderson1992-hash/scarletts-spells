begin;

alter table public.course_tasks
  add column if not exists coin_reward_trigger text not null default 'on_approval';

update public.course_tasks
set coin_reward_trigger = case
  when gold_bar_rule = 'none' then 'none'
  when gold_bar_rule = 'on_completion' then 'on_completion'
  when gold_bar_rule = 'on_monthly_target' then 'on_target'
  when task_type in ('lesson', 'test') then 'on_approval'
  when task_type in ('recurring_daily', 'recurring_weekly') then 'on_target'
  else 'on_completion'
end
where coin_reward_trigger is distinct from case
  when gold_bar_rule = 'none' then 'none'
  when gold_bar_rule = 'on_completion' then 'on_completion'
  when gold_bar_rule = 'on_monthly_target' then 'on_target'
  when task_type in ('lesson', 'test') then 'on_approval'
  when task_type in ('recurring_daily', 'recurring_weekly') then 'on_target'
  else 'on_completion'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_tasks_coin_reward_trigger_check'
  ) then
    alter table public.course_tasks
      add constraint course_tasks_coin_reward_trigger_check
      check (coin_reward_trigger in ('none', 'on_completion', 'on_approval', 'on_target'));
  end if;
end $$;

alter table public.course_modules
  add column if not exists gold_coin_reward_amount integer not null default 0,
  add column if not exists coin_reward_trigger text not null default 'on_completion';

alter table public.focus_blocks
  add column if not exists gold_coin_reward_amount integer not null default 0,
  add column if not exists coin_reward_trigger text not null default 'on_completion';

alter table public.course_checkpoints
  add column if not exists gold_coin_reward_amount integer not null default 0,
  add column if not exists coin_reward_trigger text not null default 'on_completion';

alter table public.courses
  add column if not exists gold_coin_reward_amount integer not null default 0,
  add column if not exists coin_reward_trigger text not null default 'on_completion';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_modules_gold_coin_reward_amount_check'
  ) then
    alter table public.course_modules
      add constraint course_modules_gold_coin_reward_amount_check
      check (gold_coin_reward_amount >= 0 and gold_coin_reward_amount <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'focus_blocks_gold_coin_reward_amount_check'
  ) then
    alter table public.focus_blocks
      add constraint focus_blocks_gold_coin_reward_amount_check
      check (gold_coin_reward_amount >= 0 and gold_coin_reward_amount <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'course_checkpoints_gold_coin_reward_amount_check'
  ) then
    alter table public.course_checkpoints
      add constraint course_checkpoints_gold_coin_reward_amount_check
      check (gold_coin_reward_amount >= 0 and gold_coin_reward_amount <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'courses_gold_coin_reward_amount_check'
  ) then
    alter table public.courses
      add constraint courses_gold_coin_reward_amount_check
      check (gold_coin_reward_amount >= 0 and gold_coin_reward_amount <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'course_modules_coin_reward_trigger_check'
  ) then
    alter table public.course_modules
      add constraint course_modules_coin_reward_trigger_check
      check (coin_reward_trigger in ('none', 'on_completion'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'focus_blocks_coin_reward_trigger_check'
  ) then
    alter table public.focus_blocks
      add constraint focus_blocks_coin_reward_trigger_check
      check (coin_reward_trigger in ('none', 'on_completion'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'course_checkpoints_coin_reward_trigger_check'
  ) then
    alter table public.course_checkpoints
      add constraint course_checkpoints_coin_reward_trigger_check
      check (coin_reward_trigger in ('none', 'on_completion'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'courses_coin_reward_trigger_check'
  ) then
    alter table public.courses
      add constraint courses_coin_reward_trigger_check
      check (coin_reward_trigger in ('none', 'on_completion'));
  end if;
end $$;

create table if not exists public.spelling_reward_states (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  target_word text not null,
  reward_state text not null default 'none' check (reward_state in ('none', 'golden_nugget', 'warm_workshop', 'gold_bar_earned')),
  golden_nugget_at timestamptz,
  warm_workshop_at timestamptz,
  gold_bar_earned_at timestamptz,
  gold_bar_converted_at timestamptz,
  has_converted_gold_bar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, target_word)
);

create index if not exists spelling_reward_states_child_state_idx
  on public.spelling_reward_states (child_id, reward_state, updated_at desc);

create table if not exists public.spelling_reward_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  target_word text not null,
  event_type text not null check (event_type in ('golden_nugget_discovered', 'moved_to_warm_workshop', 'gold_bar_earned', 'gold_bar_regressed', 'gold_bar_restored', 'gold_bar_converted')),
  created_at timestamptz not null default now(),
  notes text
);

create index if not exists spelling_reward_events_child_created_idx
  on public.spelling_reward_events (child_id, created_at desc);

grant select, insert, update, delete on public.spelling_reward_states to authenticated;
grant select, insert, update, delete on public.spelling_reward_events to authenticated;

alter table public.spelling_reward_states enable row level security;
alter table public.spelling_reward_events enable row level security;

drop policy if exists spelling_reward_states_parent_access on public.spelling_reward_states;
create policy spelling_reward_states_parent_access
on public.spelling_reward_states
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists spelling_reward_events_parent_access on public.spelling_reward_events;
create policy spelling_reward_events_parent_access
on public.spelling_reward_events
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

alter table public.child_gold_coin_ledger_events
  drop constraint if exists child_gold_coin_ledger_events_event_type_check;

alter table public.child_gold_coin_ledger_events
  add constraint child_gold_coin_ledger_events_event_type_check
  check (event_type in ('earned_daily', 'earned_task', 'earned_module', 'earned_focus_block', 'earned_course', 'earned_checkpoint', 'converted_from_bar', 'reserved_transfer', 'released_transfer', 'spent', 'transferred', 'adjusted'));

alter table public.gold_coin_transfer_requests
  drop constraint if exists gold_coin_transfer_requests_gold_coin_amount_check;

alter table public.gold_coin_transfer_requests
  add constraint gold_coin_transfer_requests_gold_coin_amount_check
  check (gold_coin_amount >= 100 and mod(gold_coin_amount, 100) = 0);

commit;
