alter table public.writing_samples
  add column if not exists review_completed_at timestamptz,
  add column if not exists review_completed_by uuid references auth.users(id) on delete set null;

create index if not exists writing_samples_manual_review_completion_idx
  on public.writing_samples (parent_user_id, review_completed_at desc)
  where task_submission_id is null;
