begin;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_parent_child_idx
  on public.courses (parent_user_id, child_id);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  parent_user_id uuid not null,
  title text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_modules_course_idx
  on public.course_modules (course_id, position);

create table if not exists public.course_tasks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null references public.course_modules(id) on delete cascade,
  parent_user_id uuid not null,
  title text not null,
  task_type text not null check (
    task_type in (
      'checklist',
      'short_written_response',
      'long_written_response',
      'recurring_daily',
      'recurring_weekly',
      'checkpoint'
    )
  ),
  instructions text,
  writing_prompt text,
  estimated_minutes integer,
  monthly_goal_total integer,
  weekly_days text[] not null default '{}',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_tasks_module_idx
  on public.course_tasks (module_id, position);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  submission_text text not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_submissions_task_child_idx
  on public.task_submissions (task_id, child_id, submitted_at desc);

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null,
  completion_date date not null default current_date,
  quantity_completed integer not null default 1,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_completions_task_child_date_key
  on public.task_completions (task_id, child_id, completion_date);

create index if not exists task_completions_course_child_idx
  on public.task_completions (course_id, child_id, completed_at desc);

commit;
