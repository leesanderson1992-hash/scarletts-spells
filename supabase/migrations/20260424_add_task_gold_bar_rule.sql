alter table public.course_tasks
add column if not exists gold_bar_rule text not null default 'auto';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_tasks_gold_bar_rule_check'
  ) then
    alter table public.course_tasks
    add constraint course_tasks_gold_bar_rule_check
    check (gold_bar_rule in ('auto', 'on_completion', 'on_monthly_target', 'none'));
  end if;
end $$;
