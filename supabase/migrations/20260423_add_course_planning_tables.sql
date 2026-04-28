begin;

create table if not exists public.focus_blocks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid references public.course_modules(id) on delete set null,
  parent_user_id uuid not null,
  title text not null,
  goal text,
  description text,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists focus_blocks_course_idx
  on public.focus_blocks (course_id, is_active, created_at desc);

create table if not exists public.course_checkpoints (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid references public.course_modules(id) on delete set null,
  parent_user_id uuid not null,
  title text not null,
  target text,
  scheduled_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_checkpoints_course_idx
  on public.course_checkpoints (course_id, scheduled_date asc nulls last, created_at desc);

commit;
