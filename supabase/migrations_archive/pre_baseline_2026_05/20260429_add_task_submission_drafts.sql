create table if not exists public.task_submission_drafts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  draft_text text not null default '',
  draft_review_summary text,
  draft_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists task_submission_drafts_task_child_idx
  on public.task_submission_drafts (task_id, child_id);

create index if not exists task_submission_drafts_child_updated_idx
  on public.task_submission_drafts (child_id, updated_at desc);

grant select, insert, update, delete on public.task_submission_drafts to authenticated;

alter table public.task_submission_drafts enable row level security;

drop policy if exists task_submission_drafts_parent_access on public.task_submission_drafts;
create policy task_submission_drafts_parent_access
on public.task_submission_drafts
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);
