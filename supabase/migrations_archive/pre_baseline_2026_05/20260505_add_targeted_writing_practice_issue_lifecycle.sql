begin;

create table if not exists public.writing_issue_suggestions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  source_type text not null default 'misspelling_instance',
  suggestion_status text not null default 'pending',
  observed_text text,
  suggested_replacement text,
  context_text text,
  source_field_key text,
  position_start integer,
  position_end integer,
  suggested_micro_skill_key text not null default 'unknown',
  suggested_theme_key text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  rejected_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issue_suggestions_source_type_check'
  ) then
    alter table public.writing_issue_suggestions
      add constraint writing_issue_suggestions_source_type_check
      check (
        source_type in (
          'misspelling_instance',
          'parent_manual',
          'historic_mistake',
          'micro_skill_watchlist',
          'transfer_failure_watchlist',
          'other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issue_suggestions_status_check'
  ) then
    alter table public.writing_issue_suggestions
      add constraint writing_issue_suggestions_status_check
      check (suggestion_status in ('pending', 'accepted', 'rejected', 'superseded'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issue_suggestions_position_check'
  ) then
    alter table public.writing_issue_suggestions
      add constraint writing_issue_suggestions_position_check
      check (
        (
          position_start is null
          and position_end is null
        )
        or (
          position_start is not null
          and position_end is not null
          and position_start >= 0
          and position_end > position_start
        )
      );
  end if;
end $$;

create index if not exists writing_issue_suggestions_child_status_idx
  on public.writing_issue_suggestions (child_id, suggestion_status, created_at desc);

create index if not exists writing_issue_suggestions_task_submission_idx
  on public.writing_issue_suggestions (task_submission_id, created_at desc)
  where task_submission_id is not null;

create index if not exists writing_issue_suggestions_writing_sample_idx
  on public.writing_issue_suggestions (writing_sample_id, created_at desc)
  where writing_sample_id is not null;

create index if not exists writing_issue_suggestions_misspelling_idx
  on public.writing_issue_suggestions (misspelling_instance_id, created_at desc)
  where misspelling_instance_id is not null;

create table if not exists public.writing_issues (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  source_suggestion_id uuid references public.writing_issue_suggestions(id) on delete set null,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  linked_word_progress_id uuid references public.word_progress(id) on delete set null,
  reactivates_writing_issue_id uuid references public.writing_issues(id) on delete set null,
  issue_status text not null default 'pending_parent_review',
  final_classification text,
  observed_text text,
  suggested_replacement text,
  approved_replacement text,
  context_text text,
  source_field_key text,
  position_start integer,
  position_end integer,
  micro_skill_key text not null default 'unknown',
  theme_key text,
  parent_review_note text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  parent_marked_at timestamptz,
  sent_back_at timestamptz,
  child_responded_at timestamptz,
  final_classified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issues_status_check'
  ) then
    alter table public.writing_issues
      add constraint writing_issues_status_check
      check (
        issue_status in (
          'pending_parent_review',
          'sent_back_to_child',
          'child_responded',
          'finalised'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issues_final_classification_check'
  ) then
    alter table public.writing_issues
      add constraint writing_issues_final_classification_check
      check (
        final_classification is null
        or final_classification in (
          'checking_only',
          'fragile_knowledge',
          'concept_gap',
          'transfer_failure',
          'not_an_issue'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issues_position_check'
  ) then
    alter table public.writing_issues
      add constraint writing_issues_position_check
      check (
        (
          position_start is null
          and position_end is null
        )
        or (
          position_start is not null
          and position_end is not null
          and position_start >= 0
          and position_end > position_start
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issues_finalised_requires_timestamp_check'
  ) then
    alter table public.writing_issues
      add constraint writing_issues_finalised_requires_timestamp_check
      check (
        issue_status <> 'finalised'
        or final_classified_at is not null
      );
  end if;
end $$;

create index if not exists writing_issues_child_status_idx
  on public.writing_issues (child_id, issue_status, updated_at desc);

create index if not exists writing_issues_task_submission_idx
  on public.writing_issues (task_submission_id, created_at desc)
  where task_submission_id is not null;

create index if not exists writing_issues_writing_sample_idx
  on public.writing_issues (writing_sample_id, created_at desc)
  where writing_sample_id is not null;

create index if not exists writing_issues_source_suggestion_idx
  on public.writing_issues (source_suggestion_id)
  where source_suggestion_id is not null;

create index if not exists writing_issues_word_progress_idx
  on public.writing_issues (linked_word_progress_id)
  where linked_word_progress_id is not null;

create index if not exists writing_issues_reactivates_issue_idx
  on public.writing_issues (reactivates_writing_issue_id)
  where reactivates_writing_issue_id is not null;

create table if not exists public.writing_issue_correction_attempts (
  id uuid primary key default gen_random_uuid(),
  writing_issue_id uuid not null references public.writing_issues(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  attempted_correction text,
  attempt_notes text,
  corrected_independently boolean not null default false,
  reflection text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'writing_issue_correction_attempts_reflection_check'
  ) then
    alter table public.writing_issue_correction_attempts
      add constraint writing_issue_correction_attempts_reflection_check
      check (
        reflection in (
          'easy',
          'medium',
          'hard',
          'needed_help',
          'could_not_fix'
        )
      );
  end if;
end $$;

create index if not exists writing_issue_correction_attempts_issue_idx
  on public.writing_issue_correction_attempts (writing_issue_id, created_at desc);

create index if not exists writing_issue_correction_attempts_child_idx
  on public.writing_issue_correction_attempts (child_id, created_at desc);

create index if not exists writing_issue_correction_attempts_submission_idx
  on public.writing_issue_correction_attempts (task_submission_id, created_at desc)
  where task_submission_id is not null;

grant select, insert, update, delete on public.writing_issue_suggestions to authenticated;
grant select, insert, update, delete on public.writing_issues to authenticated;
grant select, insert, update, delete on public.writing_issue_correction_attempts to authenticated;

alter table public.writing_issue_suggestions enable row level security;
alter table public.writing_issues enable row level security;
alter table public.writing_issue_correction_attempts enable row level security;

drop policy if exists writing_issue_suggestions_parent_access on public.writing_issue_suggestions;
create policy writing_issue_suggestions_parent_access
on public.writing_issue_suggestions
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists writing_issues_parent_access on public.writing_issues;
create policy writing_issues_parent_access
on public.writing_issues
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

drop policy if exists writing_issue_correction_attempts_parent_access on public.writing_issue_correction_attempts;
create policy writing_issue_correction_attempts_parent_access
on public.writing_issue_correction_attempts
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
