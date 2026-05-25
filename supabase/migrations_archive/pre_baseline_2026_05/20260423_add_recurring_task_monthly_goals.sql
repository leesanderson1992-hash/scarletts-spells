begin;

alter table public.course_tasks
  add column if not exists monthly_goal_total integer;

alter table public.task_completions
  add column if not exists quantity_completed integer not null default 1;

update public.task_completions
set quantity_completed = 1
where quantity_completed is null or quantity_completed < 1;

commit;
