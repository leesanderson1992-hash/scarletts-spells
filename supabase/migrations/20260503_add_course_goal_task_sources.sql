begin;

create table if not exists public.course_goal_task_sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  goal_id uuid not null references public.course_goals(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  parent_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (goal_id, task_id)
);

create index if not exists course_goal_task_sources_course_idx
  on public.course_goal_task_sources (course_id, created_at asc);

create index if not exists course_goal_task_sources_goal_idx
  on public.course_goal_task_sources (goal_id, created_at asc);

create index if not exists course_goal_task_sources_task_idx
  on public.course_goal_task_sources (task_id, created_at asc);

grant select, insert, update, delete on public.course_goal_task_sources to authenticated;

alter table public.course_goal_task_sources enable row level security;

drop policy if exists course_goal_task_sources_parent_access on public.course_goal_task_sources;
create policy course_goal_task_sources_parent_access
on public.course_goal_task_sources
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
