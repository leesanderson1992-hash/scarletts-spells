begin;

create table if not exists public.spelling_catalog_review_cases (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  source_suggestion_id uuid references public.writing_issue_suggestions(id) on delete set null,
  source_misspelling_instance_id uuid not null references public.misspelling_instances(id) on delete cascade,
  source_provenance text not null,
  reviewed_event_source_entity_id text not null,
  original_child_spelling text,
  original_correct_spelling text,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  case_status text not null default 'open',
  parent_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_cases_source_provenance_check'
  ) then
    alter table public.spelling_catalog_review_cases
      add constraint spelling_catalog_review_cases_source_provenance_check
      check (
        source_provenance in (
          'lesson_submission_existing_output',
          'lesson_submission_parent_added_missed_word'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_catalog_review_cases_status_check'
  ) then
    alter table public.spelling_catalog_review_cases
      add constraint spelling_catalog_review_cases_status_check
      check (
        case_status in (
          'open',
          'closed_duplicate',
          'superseded'
        )
      );
  end if;
end $$;

create index if not exists spelling_catalog_review_cases_parent_child_idx
  on public.spelling_catalog_review_cases (parent_user_id, child_id, created_at desc);

create index if not exists spelling_catalog_review_cases_task_submission_idx
  on public.spelling_catalog_review_cases (task_submission_id, created_at desc);

create unique index if not exists spelling_catalog_review_cases_open_source_event_idx
  on public.spelling_catalog_review_cases (
    parent_user_id,
    child_id,
    source_misspelling_instance_id
  )
  where case_status = 'open';

grant select, insert, update, delete
  on public.spelling_catalog_review_cases
  to authenticated;

alter table public.spelling_catalog_review_cases enable row level security;

drop policy if exists spelling_catalog_review_cases_parent_access
  on public.spelling_catalog_review_cases;
create policy spelling_catalog_review_cases_parent_access
on public.spelling_catalog_review_cases
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
