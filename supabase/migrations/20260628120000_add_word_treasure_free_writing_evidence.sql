create table if not exists public.child_word_treasure_evidence_candidates (
  id uuid primary key default gen_random_uuid(),
  treasure_id uuid not null,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  task_submission_id uuid not null references public.task_submissions(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  task_type text not null,
  source_field_key text not null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  matched_word text not null,
  matched_word_normalized text not null,
  occurrence_count integer not null default 1,
  duplicate_status text not null default 'unique_candidate',
  confirmation_status text not null default 'pending_parent_confirmation',
  would_award_golden_bar boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_event_id uuid,
  confirmed_awarded_golden_bar boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_word_treasure_evidence_candidates_task_type_check
    check (task_type in ('lesson', 'test')),
  constraint child_word_treasure_evidence_candidates_occurrence_check
    check (occurrence_count > 0),
  constraint child_word_treasure_evidence_candidates_duplicate_check
    check (duplicate_status in (
      'unique_candidate',
      'confirmed_duplicate',
      'candidate_duplicate'
    )),
  constraint child_word_treasure_evidence_candidates_confirmation_check
    check (confirmation_status in (
      'pending_parent_confirmation',
      'confirmed',
      'dismissed',
      'duplicate'
    )),
  constraint child_word_treasure_evidence_candidates_treasure_fkey
    foreign key (treasure_id, child_id, parent_user_id)
    references public.child_word_treasures(id, child_id, parent_user_id)
    on delete cascade
);

create unique index if not exists child_word_treasure_evidence_candidates_source_uidx
  on public.child_word_treasure_evidence_candidates (
    treasure_id,
    task_submission_id,
    source_field_key
  );

create index if not exists child_word_treasure_evidence_candidates_submission_idx
  on public.child_word_treasure_evidence_candidates (
    parent_user_id,
    child_id,
    task_submission_id,
    confirmation_status,
    created_at desc
  );

create index if not exists child_word_treasure_evidence_candidates_field_idx
  on public.child_word_treasure_evidence_candidates (
    treasure_id,
    task_id,
    source_field_key
  );

create or replace trigger set_child_word_treasure_evidence_candidates_updated_at
before update on public.child_word_treasure_evidence_candidates
for each row execute function public.set_updated_at();

alter table public.child_word_treasure_evidence_candidates enable row level security;

revoke all on table public.child_word_treasure_evidence_candidates from public;
revoke all on table public.child_word_treasure_evidence_candidates from anon;
grant select, insert, update on table public.child_word_treasure_evidence_candidates to authenticated;
grant all on table public.child_word_treasure_evidence_candidates to service_role;

drop policy if exists child_word_treasure_evidence_candidates_parent_select
  on public.child_word_treasure_evidence_candidates;
create policy child_word_treasure_evidence_candidates_parent_select
on public.child_word_treasure_evidence_candidates
for select
to authenticated
using (auth.uid() = parent_user_id);

drop policy if exists child_word_treasure_evidence_candidates_parent_insert
  on public.child_word_treasure_evidence_candidates;
create policy child_word_treasure_evidence_candidates_parent_insert
on public.child_word_treasure_evidence_candidates
for insert
to authenticated
with check (auth.uid() = parent_user_id);

drop policy if exists child_word_treasure_evidence_candidates_parent_update
  on public.child_word_treasure_evidence_candidates;
create policy child_word_treasure_evidence_candidates_parent_update
on public.child_word_treasure_evidence_candidates
for update
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);
