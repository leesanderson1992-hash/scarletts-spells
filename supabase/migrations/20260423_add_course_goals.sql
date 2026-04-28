begin;

create table if not exists public.course_goals (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  parent_user_id uuid not null,
  title text not null,
  goal_type text not null check (
    goal_type in (
      'count_goal',
      'completion_goal',
      'skill_goal',
      'submission_goal'
    )
  ),
  unit text not null,
  target_quantity integer not null check (target_quantity > 0),
  progress_source text not null check (
    progress_source in (
      'task_completion',
      'task_submission',
      'focus_block_completion',
      'manual_review',
      'spelling_progress'
    )
  ),
  time_span text not null check (
    time_span in (
      'monthly',
      'cycle',
      'course_duration'
    )
  ),
  success_description text,
  stretch_target integer check (stretch_target is null or stretch_target > 0),
  status text not null default 'planned' check (
    status in (
      'planned',
      'active',
      'secure',
      'paused'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_goals_course_idx
  on public.course_goals (course_id, created_at desc);

commit;
