begin;

alter table public.course_tasks
  add column if not exists gold_coin_reward_amount integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_tasks_gold_coin_reward_amount_check'
  ) then
    alter table public.course_tasks
      add constraint course_tasks_gold_coin_reward_amount_check
      check (gold_coin_reward_amount >= 0 and gold_coin_reward_amount <= 500);
  end if;
end $$;

alter table public.child_gold_coin_ledger_events
  drop constraint if exists child_gold_coin_ledger_events_event_type_check;

alter table public.child_gold_coin_ledger_events
  add constraint child_gold_coin_ledger_events_event_type_check
  check (event_type in ('earned_daily', 'earned_task', 'converted_from_bar', 'spent', 'transferred', 'adjusted'));

commit;
