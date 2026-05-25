begin;

alter table public.task_submissions
  add column if not exists parent_review_status text not null default 'pending',
  add column if not exists parent_review_note text,
  add column if not exists parent_reviewed_at timestamptz;

update public.task_submissions
set parent_review_status = 'pending'
where parent_review_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_submissions_parent_review_status_check'
  ) then
    alter table public.task_submissions
      add constraint task_submissions_parent_review_status_check
      check (parent_review_status in ('pending', 'approved', 'returned'));
  end if;
end $$;

create index if not exists task_submissions_review_status_idx
  on public.task_submissions (child_id, parent_review_status, submitted_at desc);

commit;
