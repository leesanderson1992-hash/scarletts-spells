create table if not exists public.task_day_plans (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  week_start_date date not null,
  planned_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_day_plans_task_child_week_key
  on public.task_day_plans (task_id, child_id, week_start_date);

create index if not exists task_day_plans_child_week_idx
  on public.task_day_plans (child_id, parent_user_id, week_start_date, planned_date);

grant select, insert, update, delete on public.task_day_plans to authenticated;

alter table public.task_day_plans enable row level security;

drop policy if exists task_day_plans_parent_access on public.task_day_plans;
create policy task_day_plans_parent_access
on public.task_day_plans
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);
