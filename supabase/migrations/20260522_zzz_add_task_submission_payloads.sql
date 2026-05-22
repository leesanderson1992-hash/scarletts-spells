begin;

create table if not exists public.task_submission_payloads (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  payload_type text not null,
  payload_version integer not null default 1,
  payload_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_submission_payloads_payload_type_check'
  ) then
    alter table public.task_submission_payloads
      add constraint task_submission_payloads_payload_type_check
      check (payload_type in ('structured_lesson_response', 'structured_test_response'));
  end if;
end $$;

create unique index if not exists task_submission_payloads_submission_type_idx
  on public.task_submission_payloads (submission_id, payload_type);

create index if not exists task_submission_payloads_task_child_created_idx
  on public.task_submission_payloads (task_id, child_id, created_at desc);

create index if not exists task_submission_payloads_parent_child_task_created_idx
  on public.task_submission_payloads (parent_user_id, child_id, task_id, created_at desc);

-- Immutable submitted evidence: authenticated browser clients may read scoped
-- rows, but future writes must go through trusted server/service persistence.
grant select on public.task_submission_payloads to authenticated;

alter table public.task_submission_payloads enable row level security;

drop policy if exists task_submission_payloads_parent_select
  on public.task_submission_payloads;

create policy task_submission_payloads_parent_select
  on public.task_submission_payloads
  for select
  to authenticated
  using (auth.uid() = parent_user_id);

commit;
