alter table public.writing_samples
add column if not exists task_submission_id uuid references public.task_submissions(id) on delete set null;

create unique index if not exists writing_samples_task_submission_id_key
on public.writing_samples (task_submission_id)
where task_submission_id is not null;
