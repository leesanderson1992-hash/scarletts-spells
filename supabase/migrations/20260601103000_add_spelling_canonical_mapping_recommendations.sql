begin;

create table if not exists public.spelling_canonical_mapping_recommendations (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  task_submission_id uuid references public.task_submissions(id) on delete set null,
  writing_sample_id uuid references public.writing_samples(id) on delete set null,
  source_misspelling_instance_id uuid references public.misspelling_instances(id) on delete set null,
  source_writing_issue_id uuid references public.writing_issues(id) on delete set null,
  source_correction_attempt_id uuid references public.writing_issue_correction_attempts(id) on delete set null,
  parent_verification_id uuid references public.parent_verifications(id) on delete set null,
  source_suggestion_id uuid references public.writing_issue_suggestions(id) on delete set null,
  candidate_mapping_id uuid references public.parent_verified_spelling_candidate_mappings(id) on delete set null,
  source_row_type text not null,
  source_provenance text not null,
  reviewed_event_source_entity_id text,
  original_child_spelling text,
  original_correct_spelling text,
  misspelling_normalized text not null,
  correct_spelling_normalized text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  recommendation_status text not null default 'pending_admin_review',
  recommendation_note text,
  duplicate_of_recommendation_id uuid references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  merge_target_recommendation_id uuid references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  superseded_by_recommendation_id uuid references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  canonical_mapping_id uuid references public.spelling_canonical_mappings(id) on delete set null,
  reviewed_by_admin_user_id uuid,
  reviewed_by_admin_email text,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  recommended_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_recommendations_source_type_check'
  ) then
    alter table public.spelling_canonical_mapping_recommendations
      add constraint spelling_canonical_mapping_recommendations_source_type_check
      check (
        source_row_type in (
          'engine_suggested',
          'parent_added_missed_word',
          'returned_correction'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_recommendations_source_provenance_check'
  ) then
    alter table public.spelling_canonical_mapping_recommendations
      add constraint spelling_canonical_mapping_recommendations_source_provenance_check
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
    where conname = 'spelling_canonical_mapping_recommendations_status_check'
  ) then
    alter table public.spelling_canonical_mapping_recommendations
      add constraint spelling_canonical_mapping_recommendations_status_check
      check (
        recommendation_status in (
          'recommended',
          'pending_admin_review',
          'accepted',
          'rejected',
          'merged',
          'duplicate',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'spelling_canonical_mapping_recommendations_words_check'
  ) then
    alter table public.spelling_canonical_mapping_recommendations
      add constraint spelling_canonical_mapping_recommendations_words_check
      check (
        btrim(misspelling_normalized) <> ''
        and btrim(correct_spelling_normalized) <> ''
        and btrim(misspelling_normalized) <> btrim(correct_spelling_normalized)
      );
  end if;
end $$;

create index if not exists spelling_canonical_mapping_recommendations_parent_child_idx
  on public.spelling_canonical_mapping_recommendations (
    parent_user_id,
    child_id,
    created_at desc
  );

create index if not exists spelling_canonical_mapping_recommendations_status_idx
  on public.spelling_canonical_mapping_recommendations (
    recommendation_status,
    created_at desc
  );

create index if not exists spelling_canonical_mapping_recommendations_pair_idx
  on public.spelling_canonical_mapping_recommendations (
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key,
    recommendation_status
  );

create unique index if not exists spelling_canonical_mapping_recommendations_open_candidate_idx
  on public.spelling_canonical_mapping_recommendations (
    parent_user_id,
    child_id,
    candidate_mapping_id
  )
  where candidate_mapping_id is not null
    and recommendation_status in ('recommended', 'pending_admin_review');

create unique index if not exists spelling_canonical_mapping_recommendations_open_source_idx
  on public.spelling_canonical_mapping_recommendations (
    parent_user_id,
    child_id,
    source_row_type,
    source_misspelling_instance_id,
    misspelling_normalized,
    correct_spelling_normalized,
    micro_skill_key
  )
  where source_misspelling_instance_id is not null
    and recommendation_status in ('recommended', 'pending_admin_review');

create unique index if not exists spelling_canonical_mapping_recommendations_open_event_idx
  on public.spelling_canonical_mapping_recommendations (
    parent_user_id,
    child_id,
    reviewed_event_source_entity_id,
    micro_skill_key
  )
  where reviewed_event_source_entity_id is not null
    and recommendation_status in ('recommended', 'pending_admin_review');

create or replace function public.validate_spelling_canonical_mapping_recommendation_row()
returns trigger
language plpgsql
as $$
declare
  v_micro_skill record;
begin
  new.source_row_type := nullif(btrim(coalesce(new.source_row_type, '')), '');
  new.source_provenance := nullif(btrim(coalesce(new.source_provenance, '')), '');
  new.reviewed_event_source_entity_id :=
    nullif(btrim(coalesce(new.reviewed_event_source_entity_id, '')), '');
  new.original_child_spelling :=
    nullif(btrim(coalesce(new.original_child_spelling, '')), '');
  new.original_correct_spelling :=
    nullif(btrim(coalesce(new.original_correct_spelling, '')), '');
  new.misspelling_normalized :=
    lower(nullif(btrim(coalesce(new.misspelling_normalized, '')), ''));
  new.correct_spelling_normalized :=
    lower(nullif(btrim(coalesce(new.correct_spelling_normalized, '')), ''));
  new.micro_skill_key := nullif(btrim(coalesce(new.micro_skill_key, '')), '');
  new.recommendation_status :=
    nullif(btrim(coalesce(new.recommendation_status, 'pending_admin_review')), '');
  new.recommendation_note :=
    nullif(btrim(coalesce(new.recommendation_note, '')), '');
  new.reviewed_by_admin_email :=
    nullif(btrim(coalesce(new.reviewed_by_admin_email, '')), '');
  new.review_note := nullif(btrim(coalesce(new.review_note, '')), '');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.updated_at := timezone('utc', now());

  if new.source_row_type is null then
    raise exception 'Canonical mapping recommendations require a source row type.';
  end if;

  if new.source_provenance is null then
    raise exception 'Canonical mapping recommendations require source provenance.';
  end if;

  if new.misspelling_normalized is null or new.correct_spelling_normalized is null then
    raise exception 'Canonical mapping recommendations require normalized spelling pair.';
  end if;

  if new.micro_skill_key is null then
    raise exception 'Canonical mapping recommendations require a micro-skill key.';
  end if;

  select micro_skill_key, mastery_domain_key, is_active, is_assignable
  into v_micro_skill
  from public.micro_skill_catalog
  where micro_skill_key = new.micro_skill_key
  limit 1;

  if v_micro_skill.micro_skill_key is null then
    raise exception 'Canonical mapping recommendations require an existing micro-skill.';
  end if;

  if v_micro_skill.mastery_domain_key <> 'D4'
    or v_micro_skill.is_active is not true
    or v_micro_skill.is_assignable is not true
  then
    raise exception 'Canonical mapping recommendations require an active assignable D4 micro-skill.';
  end if;

  if not exists (
    select 1
    from public.children
    where id = new.child_id
      and parent_user_id = new.parent_user_id
  ) then
    raise exception 'Canonical mapping recommendation child scope mismatch.';
  end if;

  if new.task_submission_id is not null
    and not exists (
      select 1
      from public.task_submissions
      where id = new.task_submission_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation task submission scope mismatch.';
  end if;

  if new.writing_sample_id is not null
    and not exists (
      select 1
      from public.writing_samples
      where id = new.writing_sample_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation writing sample scope mismatch.';
  end if;

  if new.source_misspelling_instance_id is not null
    and not exists (
      select 1
      from public.misspelling_instances
      where id = new.source_misspelling_instance_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation misspelling scope mismatch.';
  end if;

  if new.source_writing_issue_id is not null
    and not exists (
      select 1
      from public.writing_issues
      where id = new.source_writing_issue_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation writing issue scope mismatch.';
  end if;

  if new.source_correction_attempt_id is not null
    and not exists (
      select 1
      from public.writing_issue_correction_attempts
      where id = new.source_correction_attempt_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
        and (
          new.source_writing_issue_id is null
          or writing_issue_id = new.source_writing_issue_id
        )
    )
  then
    raise exception 'Canonical mapping recommendation correction attempt scope mismatch.';
  end if;

  if new.parent_verification_id is not null
    and not exists (
      select 1
      from public.parent_verifications
      where id = new.parent_verification_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation parent verification scope mismatch.';
  end if;

  if new.source_suggestion_id is not null
    and not exists (
      select 1
      from public.writing_issue_suggestions
      where id = new.source_suggestion_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation suggestion scope mismatch.';
  end if;

  if new.candidate_mapping_id is not null
    and not exists (
      select 1
      from public.parent_verified_spelling_candidate_mappings
      where id = new.candidate_mapping_id
        and parent_user_id = new.parent_user_id
        and child_id = new.child_id
    )
  then
    raise exception 'Canonical mapping recommendation candidate mapping scope mismatch.';
  end if;

  if tg_op = 'INSERT'
    and auth.uid() is not null
    and auth.uid() = new.parent_user_id
  then
    if new.recommendation_status not in ('recommended', 'pending_admin_review') then
      raise exception 'Parent-created canonical mapping recommendations cannot start in admin-reviewed status.';
    end if;

    if new.canonical_mapping_id is not null
      or new.reviewed_by_admin_user_id is not null
      or new.reviewed_by_admin_email is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.duplicate_of_recommendation_id is not null
      or new.merge_target_recommendation_id is not null
      or new.superseded_by_recommendation_id is not null
    then
      raise exception 'Parent-created canonical mapping recommendations cannot include admin curation fields.';
    end if;
  end if;

  if new.reviewed_at is null
    and (
      new.recommendation_status in ('accepted', 'rejected', 'merged', 'duplicate', 'superseded')
      or new.reviewed_by_admin_user_id is not null
      or new.reviewed_by_admin_email is not null
      or new.review_note is not null
      or new.canonical_mapping_id is not null
    )
  then
    new.reviewed_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists spelling_canonical_mapping_recommendations_validate_row
  on public.spelling_canonical_mapping_recommendations;
create trigger spelling_canonical_mapping_recommendations_validate_row
before insert or update on public.spelling_canonical_mapping_recommendations
for each row execute function public.validate_spelling_canonical_mapping_recommendation_row();

grant select, insert on public.spelling_canonical_mapping_recommendations to authenticated;

alter table public.spelling_canonical_mapping_recommendations enable row level security;

drop policy if exists spelling_canonical_mapping_recommendations_parent_select
  on public.spelling_canonical_mapping_recommendations;
create policy spelling_canonical_mapping_recommendations_parent_select
on public.spelling_canonical_mapping_recommendations
for select
to authenticated
using (auth.uid() = parent_user_id);

drop policy if exists spelling_canonical_mapping_recommendations_parent_insert
  on public.spelling_canonical_mapping_recommendations;
create policy spelling_canonical_mapping_recommendations_parent_insert
on public.spelling_canonical_mapping_recommendations
for insert
to authenticated
with check (
  auth.uid() = parent_user_id
  and recommendation_status in ('recommended', 'pending_admin_review')
  and canonical_mapping_id is null
  and reviewed_by_admin_user_id is null
  and reviewed_by_admin_email is null
  and reviewed_at is null
  and review_note is null
  and duplicate_of_recommendation_id is null
  and merge_target_recommendation_id is null
  and superseded_by_recommendation_id is null
);

commit;
