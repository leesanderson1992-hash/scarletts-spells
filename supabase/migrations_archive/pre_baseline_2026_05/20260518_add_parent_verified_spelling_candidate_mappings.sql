begin;

create table if not exists public.parent_verified_spelling_candidate_mappings (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_verification_id uuid not null unique references public.parent_verifications(id) on delete cascade,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  source_suggestion_id uuid references public.writing_issue_suggestions(id) on delete set null,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  source_provenance text not null,
  reviewed_event_source_entity_id text not null,
  original_child_spelling text,
  original_correct_spelling text,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  candidate_status text not null default 'pending_parent_promotion',
  promotion_scope text not null default 'parent_local',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'parent_verified_spelling_candidate_mappings_source_provenance_check'
  ) then
    alter table public.parent_verified_spelling_candidate_mappings
      add constraint parent_verified_spelling_candidate_mappings_source_provenance_check
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
    where conname = 'parent_verified_spelling_candidate_mappings_status_check'
  ) then
    alter table public.parent_verified_spelling_candidate_mappings
      add constraint parent_verified_spelling_candidate_mappings_status_check
      check (
        candidate_status in (
          'pending_parent_promotion',
          'parent_local_promoted',
          'admin_review_requested',
          'global_canonical_promoted',
          'rejected',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'parent_verified_spelling_candidate_mappings_scope_check'
  ) then
    alter table public.parent_verified_spelling_candidate_mappings
      add constraint parent_verified_spelling_candidate_mappings_scope_check
      check (promotion_scope in ('child_local', 'parent_local', 'global'));
  end if;
end $$;

create index if not exists parent_verified_spelling_candidate_mappings_parent_child_idx
  on public.parent_verified_spelling_candidate_mappings (parent_user_id, child_id, created_at desc);

create index if not exists parent_verified_spelling_candidate_mappings_lookup_idx
  on public.parent_verified_spelling_candidate_mappings (
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    candidate_status
  );

grant select, insert, update, delete
  on public.parent_verified_spelling_candidate_mappings
  to authenticated;

alter table public.parent_verified_spelling_candidate_mappings enable row level security;

drop policy if exists parent_verified_spelling_candidate_mappings_parent_access
  on public.parent_verified_spelling_candidate_mappings;
create policy parent_verified_spelling_candidate_mappings_parent_access
on public.parent_verified_spelling_candidate_mappings
for all
to authenticated
using (auth.uid() = parent_user_id)
with check (auth.uid() = parent_user_id);

commit;
