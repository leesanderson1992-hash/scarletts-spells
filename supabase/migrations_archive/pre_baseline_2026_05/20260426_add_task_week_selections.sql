create table if not exists public.task_week_selections (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  week_start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_week_selections_unique_key
  on public.task_week_selections (task_id, child_id, week_start_date);

create index if not exists task_week_selections_child_week_idx
  on public.task_week_selections (child_id, week_start_date);

grant select, insert, update, delete on public.task_week_selections to authenticated;

alter table public.task_week_selections enable row level security;

drop policy if exists task_week_selections_parent_access on public.task_week_selections;
create policy task_week_selections_parent_access
on public.task_week_selections
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);
