begin;

-- Parent Review Work is an observational inbox for completed ADLE Review v3
-- sessions. These rows deliberately have no relationship to task submission
-- status, learner completion, scheduling, or rewards.
create table public.adle_review_parent_reviews (
  review_session_id uuid primary key
    references public.adle_review_sessions(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  reviewed_by_user_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default timezone('utc', now()),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_parent_reviews_note_check
    check (note is null or char_length(note) <= 500)
);

create index adle_review_parent_reviews_parent_child_idx
  on public.adle_review_parent_reviews(parent_user_id, child_id, reviewed_at desc);

create table public.adle_review_parent_issue_links (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null
    references public.adle_review_sessions(id) on delete restrict,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  position_start integer not null,
  position_end integer not null,
  observed_spelling_normalized text not null,
  correct_spelling_normalized text not null,
  related_review_encounter_id uuid
    references public.adle_review_word_encounters(id) on delete restrict,
  source_suggestion_id uuid
    references public.writing_issue_suggestions(id) on delete set null,
  parent_verification_id uuid
    references public.parent_verifications(id) on delete set null,
  candidate_mapping_id uuid
    references public.parent_verified_spelling_candidate_mappings(id) on delete set null,
  catalog_review_case_id uuid
    references public.spelling_catalog_review_cases(id) on delete set null,
  canonical_recommendation_id uuid
    references public.spelling_canonical_mapping_recommendations(id) on delete set null,
  analysis_payload jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'needs_route',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_parent_issue_links_span_check
    check (position_start >= 0 and position_end > position_start),
  constraint adle_review_parent_issue_links_observed_check
    check (
      btrim(observed_spelling_normalized) <> '' and
      observed_spelling_normalized = lower(observed_spelling_normalized)
    ),
  constraint adle_review_parent_issue_links_correct_check
    check (
      btrim(correct_spelling_normalized) <> '' and
      correct_spelling_normalized = lower(correct_spelling_normalized)
    ),
  constraint adle_review_parent_issue_links_resolution_check
    check (
      resolution_status in (
        'needs_route', 'confirmed', 'not_a_learning_issue', 'sent_to_admin'
      )
    ),
  constraint adle_review_parent_issue_links_occurrence_unique
    unique (
      review_session_id, position_start, position_end,
      observed_spelling_normalized, correct_spelling_normalized
    ),
  constraint adle_review_parent_issue_links_suggestion_unique unique (source_suggestion_id),
  constraint adle_review_parent_issue_links_verification_unique unique (parent_verification_id),
  constraint adle_review_parent_issue_links_mapping_unique unique (candidate_mapping_id)
);

alter table public.spelling_canonical_mapping_recommendations
  add column source_adle_review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict,
  add column source_adle_review_parent_issue_link_id uuid
    references public.adle_review_parent_issue_links(id) on delete restrict;

alter table public.spelling_canonical_mapping_recommendations
  drop constraint spelling_canonical_mapping_recommendations_source_type_check,
  drop constraint spelling_canonical_mapping_recommendations_source_provenance_check;
alter table public.spelling_canonical_mapping_recommendations
  add constraint spelling_canonical_mapping_recommendations_source_type_check check (
    source_row_type in (
      'engine_suggested', 'parent_added_missed_word', 'returned_correction',
      'adle_parent_added_missed_word'
    )
  ),
  add constraint spelling_canonical_mapping_recommendations_source_provenance_check check (
    source_provenance in (
      'lesson_submission_existing_output',
      'lesson_submission_parent_added_missed_word',
      'adle_review_submitted_writing_parent_identified'
    )
  ),
  add constraint spelling_canonical_mapping_recommendations_source_anchor_check check (
    (
      source_provenance in (
        'lesson_submission_existing_output',
        'lesson_submission_parent_added_missed_word'
      )
      and task_submission_id is not null
      and source_adle_review_session_id is null
      and source_adle_review_parent_issue_link_id is null
    )
    or (
      source_provenance = 'adle_review_submitted_writing_parent_identified'
      and task_submission_id is null
      and writing_sample_id is null
      and source_misspelling_instance_id is null
      and source_writing_issue_id is null
      and source_correction_attempt_id is null
      and source_adle_review_session_id is not null
      and source_adle_review_parent_issue_link_id is not null
    )
  );

create unique index spelling_canonical_mapping_recommendations_open_adle_occurrence_idx
  on public.spelling_canonical_mapping_recommendations(
    parent_user_id, child_id, source_adle_review_parent_issue_link_id
  )
  where recommendation_status in ('recommended', 'pending_admin_review')
    and source_adle_review_parent_issue_link_id is not null;

create index adle_review_parent_issue_links_session_idx
  on public.adle_review_parent_issue_links(review_session_id, position_start, position_end);

alter table public.parent_verified_spelling_candidate_mappings
  add column source_adle_review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict;

alter table public.parent_verified_spelling_candidate_mappings
  drop constraint parent_verified_spelling_candidate_mappings_source_provenance_c;
alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_source_provenance_c check (
    source_provenance in (
      'lesson_submission_existing_output',
      'lesson_submission_parent_added_missed_word',
      'adle_review_submitted_writing_parent_identified'
    )
  );

alter table public.parent_verified_spelling_candidate_mappings
  add constraint parent_verified_spelling_candidate_mappings_adle_source_check check (
    source_provenance <> 'adle_review_submitted_writing_parent_identified'
    or (
      source_adle_review_session_id is not null
      and task_submission_id is null
      and writing_sample_id is null
      and source_misspelling_instance_id is null
    )
  );

create index parent_verified_spelling_candidate_mappings_adle_session_idx
  on public.parent_verified_spelling_candidate_mappings(source_adle_review_session_id, created_at desc)
  where source_adle_review_session_id is not null;

-- Catalog review keeps its legacy lesson branch and gains one alternative ADLE
-- occurrence anchor. Existing rows remain submission anchored.
alter table public.spelling_catalog_review_cases
  alter column task_submission_id drop not null,
  alter column source_misspelling_instance_id drop not null,
  add column source_adle_review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict,
  add column source_adle_review_parent_issue_link_id uuid
    references public.adle_review_parent_issue_links(id) on delete restrict;

alter table public.spelling_catalog_review_cases
  drop constraint spelling_catalog_review_cases_source_provenance_check;
alter table public.spelling_catalog_review_cases
  add constraint spelling_catalog_review_cases_source_provenance_check check (
    source_provenance in (
      'lesson_submission_existing_output',
      'lesson_submission_parent_added_missed_word',
      'adle_review_submitted_writing_parent_identified'
    )
  ),
  add constraint spelling_catalog_review_cases_source_anchor_check check (
    (
      source_provenance in (
        'lesson_submission_existing_output',
        'lesson_submission_parent_added_missed_word'
      )
      and task_submission_id is not null
      and source_misspelling_instance_id is not null
      and source_adle_review_session_id is null
      and source_adle_review_parent_issue_link_id is null
    )
    or (
      source_provenance = 'adle_review_submitted_writing_parent_identified'
      and task_submission_id is null
      and writing_sample_id is null
      and source_misspelling_instance_id is null
      and source_adle_review_session_id is not null
      and source_adle_review_parent_issue_link_id is not null
    )
  );

create unique index spelling_catalog_review_cases_adle_occurrence_idx
  on public.spelling_catalog_review_cases(
    parent_user_id, child_id, source_adle_review_parent_issue_link_id
  )
  where source_adle_review_parent_issue_link_id is not null;

alter table public.adle_canonical_intake_candidates
  alter column source_submission_id drop not null,
  add column source_adle_review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict;

alter table public.adle_canonical_intake_candidates
  add constraint adle_canonical_intake_candidates_one_source_check check (
    num_nonnulls(source_submission_id, source_adle_review_session_id) = 1
  );

create index adle_canonical_intake_candidates_review_session_idx
  on public.adle_canonical_intake_candidates(source_adle_review_session_id)
  where source_adle_review_session_id is not null;

-- The source identity is occurrence-specific. Repeated confirm requests reuse
-- the same verification and cannot create a second canonical lineage.
create unique index parent_verifications_adle_review_occurrence_source_idx
  on public.parent_verifications(parent_user_id, child_id, source_entity_id)
  where source_type = 'adle_review_submitted_writing_parent_identified';

create or replace function public.validate_adle_review_parent_observation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
begin
  select * into v_session
  from public.adle_review_sessions
  where id = new.review_session_id;

  if not found
    or v_session.completed_at is null
    or v_session.stage <> 'completed'
    or v_session.parent_user_id <> new.parent_user_id
    or v_session.child_id <> new.child_id
  then
    raise exception 'ADLE Review parent observation source is not an owned completed session';
  end if;

  if tg_table_name = 'adle_review_parent_reviews' then
    if new.reviewed_by_user_id <> new.parent_user_id then
      raise exception 'ADLE Review parent receipt actor must own the session';
    end if;
  elsif tg_table_name = 'adle_review_parent_issue_links' then
    if new.related_review_encounter_id is not null
      and not exists (
        select 1 from public.adle_review_word_encounters encounter
        where encounter.id = new.related_review_encounter_id
          and encounter.review_session_id = new.review_session_id
      )
    then
      raise exception 'ADLE Review parent issue encounter does not belong to the session';
    end if;

    if new.source_suggestion_id is not null
      and not exists (
        select 1 from public.writing_issue_suggestions suggestion
        where suggestion.id = new.source_suggestion_id
          and suggestion.parent_user_id = new.parent_user_id
          and suggestion.child_id = new.child_id
          and suggestion.task_submission_id is null
          and suggestion.writing_sample_id is null
          and suggestion.source_type = 'parent_manual'
          and suggestion.position_start = new.position_start
          and suggestion.position_end = new.position_end
          and lower(btrim(suggestion.observed_text)) = new.observed_spelling_normalized
          and lower(btrim(suggestion.suggested_replacement)) = new.correct_spelling_normalized
      )
    then
      raise exception 'ADLE Review parent issue suggestion lineage is invalid';
    end if;

    if new.parent_verification_id is not null
      and not exists (
        select 1 from public.parent_verifications verification
        where verification.id = new.parent_verification_id
          and verification.parent_user_id = new.parent_user_id
          and verification.child_id = new.child_id
          and verification.source_type = 'adle_review_submitted_writing_parent_identified'
          and verification.task_submission_id is null
          and verification.writing_sample_id is null
      )
    then
      raise exception 'ADLE Review parent issue verification lineage is invalid';
    end if;

    if new.candidate_mapping_id is not null
      and not exists (
        select 1 from public.parent_verified_spelling_candidate_mappings mapping
        where mapping.id = new.candidate_mapping_id
          and mapping.parent_user_id = new.parent_user_id
          and mapping.child_id = new.child_id
          and mapping.source_adle_review_session_id = new.review_session_id
          and mapping.parent_verification_id = new.parent_verification_id
      )
    then
      raise exception 'ADLE Review parent issue candidate lineage is invalid';
    end if;

    if new.catalog_review_case_id is not null
      and not exists (
        select 1 from public.spelling_catalog_review_cases review_case
        where review_case.id = new.catalog_review_case_id
          and review_case.parent_user_id = new.parent_user_id
          and review_case.child_id = new.child_id
          and review_case.source_adle_review_session_id = new.review_session_id
          and review_case.source_adle_review_parent_issue_link_id = new.id
      )
    then
      raise exception 'ADLE Review parent issue catalog lineage is invalid';
    end if;

    if new.canonical_recommendation_id is not null
      and not exists (
        select 1 from public.spelling_canonical_mapping_recommendations recommendation
        where recommendation.id = new.canonical_recommendation_id
          and recommendation.parent_user_id = new.parent_user_id
          and recommendation.child_id = new.child_id
          and recommendation.source_adle_review_session_id = new.review_session_id
          and recommendation.source_adle_review_parent_issue_link_id = new.id
          and recommendation.candidate_mapping_id = new.candidate_mapping_id
      )
    then
      raise exception 'ADLE Review parent issue canonical recommendation lineage is invalid';
    end if;
  end if;

  return new;
end;
$$;

create trigger adle_review_parent_reviews_validate_source
before insert or update on public.adle_review_parent_reviews
for each row execute function public.validate_adle_review_parent_observation();

create or replace function public.prevent_adle_review_parent_review_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'ADLE Review parent observation receipts are immutable';
end;
$$;

create trigger adle_review_parent_reviews_immutable
before update or delete on public.adle_review_parent_reviews
for each row execute function public.prevent_adle_review_parent_review_mutation();

create trigger adle_review_parent_issue_links_validate_source
before insert or update on public.adle_review_parent_issue_links
for each row execute function public.validate_adle_review_parent_observation();

create or replace function public.validate_adle_review_candidate_mapping_source()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.source_provenance = 'adle_review_submitted_writing_parent_identified'
    and not exists (
      select 1 from public.adle_review_sessions session
      where session.id = new.source_adle_review_session_id
        and session.parent_user_id = new.parent_user_id
        and session.child_id = new.child_id
        and session.stage = 'completed'
        and session.completed_at is not null
    )
  then
    raise exception 'ADLE Review candidate source is not an owned completed session';
  end if;
  if new.source_provenance = 'adle_review_submitted_writing_parent_identified'
    and not exists (
      select 1 from public.parent_verifications verification
      where verification.id = new.parent_verification_id
        and verification.parent_user_id = new.parent_user_id
        and verification.child_id = new.child_id
        and verification.source_type = 'adle_review_submitted_writing_parent_identified'
        and verification.decision in ('accepted', 'overridden')
        and verification.task_submission_id is null
        and verification.writing_sample_id is null
    )
  then
    raise exception 'ADLE Review candidate requires an accepted parent verification';
  end if;
  return new;
end;
$$;

create trigger parent_verified_spelling_candidate_mapping_validate_adle_source
before insert or update on public.parent_verified_spelling_candidate_mappings
for each row execute function public.validate_adle_review_candidate_mapping_source();

create or replace function public.validate_adle_canonical_recommendation_source()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.source_provenance = 'adle_review_submitted_writing_parent_identified'
    and not exists (
      select 1
      from public.adle_review_parent_issue_links issue
      join public.adle_review_sessions session on session.id = issue.review_session_id
      join public.parent_verified_spelling_candidate_mappings mapping
        on mapping.id = new.candidate_mapping_id
      where issue.id = new.source_adle_review_parent_issue_link_id
        and issue.review_session_id = new.source_adle_review_session_id
        and issue.parent_user_id = new.parent_user_id
        and issue.child_id = new.child_id
        and session.stage = 'completed'
        and session.completed_at is not null
        and mapping.source_adle_review_session_id = session.id
        and mapping.parent_verification_id = new.parent_verification_id
        and mapping.parent_user_id = new.parent_user_id
        and mapping.child_id = new.child_id
    )
  then
    raise exception 'ADLE canonical recommendation lineage is invalid';
  end if;
  return new;
end;
$$;

create trigger spelling_canonical_recommendation_validate_adle_source
before insert or update on public.spelling_canonical_mapping_recommendations
for each row execute function public.validate_adle_canonical_recommendation_source();

create or replace function public.resume_adle_spelling_catalog_review_case_admin(
  p_case_id uuid,
  p_admin_user_id uuid,
  p_admin_email text,
  p_decision_type text,
  p_decision_note text default null,
  p_linked_micro_skill_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dialect_code text default 'en-GB',
  p_normalization_version text default 'spelling_normalize_v1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.spelling_catalog_review_cases%rowtype;
  v_decision_id uuid;
begin
  select * into v_case
  from public.spelling_catalog_review_cases
  where id = p_case_id
  for update;

  if not found
    or v_case.source_provenance <> 'adle_review_submitted_writing_parent_identified'
    or v_case.case_status not in ('needs_new_micro_skill', 'word_level_only')
  then
    raise exception 'Only an actionable ADLE catalog backlog case can be resumed';
  end if;

  if p_decision_type not in (
    'linked_existing_skill', 'add_canonical_mapping',
    'not_a_learning_issue', 'reject_no_canonical_update'
  ) then
    raise exception 'ADLE backlog resume requires a terminal route or rejection decision';
  end if;

  update public.spelling_catalog_review_cases
  set case_status = 'open', updated_at = timezone('utc', now())
  where id = p_case_id;

  v_decision_id := public.resolve_spelling_catalog_review_case_admin(
    p_case_id,
    p_admin_user_id,
    p_admin_email,
    p_decision_type,
    p_decision_note,
    p_linked_micro_skill_key,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'resumed_from_status', v_case.case_status,
      'adle_route_backlog_resume', true
    ),
    p_dialect_code,
    p_normalization_version
  );

  update public.spelling_catalog_review_case_decisions
  set previous_status = v_case.case_status
  where id = v_decision_id;

  return v_decision_id;
end;
$$;

revoke all on function public.resume_adle_spelling_catalog_review_case_admin(
  uuid, uuid, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.resume_adle_spelling_catalog_review_case_admin(
  uuid, uuid, text, text, text, text, jsonb, text, text
) to service_role;

alter table public.adle_review_parent_reviews enable row level security;
alter table public.adle_review_parent_issue_links enable row level security;
revoke all on table public.adle_review_parent_reviews from anon, authenticated;
revoke all on table public.adle_review_parent_issue_links from anon, authenticated;
grant all on table public.adle_review_parent_reviews to service_role;
grant all on table public.adle_review_parent_issue_links to service_role;

comment on table public.adle_review_parent_reviews is
  'Observational Parent Review Work receipts for learner-completed ADLE Review v3 sessions; never a progression gate.';
comment on column public.adle_review_parent_reviews.reviewed_at is
  'Parent inbox acknowledgement only; must not be read by learner progression, scheduling, or reward code.';

-- Generalise only the canonical-intake source guard and source-anchor insert.
-- The route, dictionary, release, mapping, locking, queue and learning-item
-- bodies remain byte-for-byte inherited from the currently installed
-- Production definitions. Fail closed if those definitions do not contain the
-- expected legacy branch rather than silently broadening intake.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.adle_seed_canonical_intake_candidate(uuid,text,text,text,text,text)'::regprocedure,
    'public.adle_record_canonical_intake_blocked(uuid,text,uuid,text,text,text,text,text,jsonb,text,text,text)'::regprocedure,
    'public.adle_persist_canonical_intake(uuid,uuid,text,uuid,uuid,text,text,text,date,text,text,uuid,uuid,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_updated := regexp_replace(
      v_definition,
      'if not found or v_source\.task_submission_id is null then',
      'if not found or num_nonnulls(v_source.task_submission_id, v_source.source_adle_review_session_id) <> 1 then',
      'i'
    );
    if v_updated = v_definition then
      raise exception 'canonical intake source guard preflight failed for %', v_signature;
    end if;

    v_definition := v_updated;
    v_updated := regexp_replace(
      v_definition,
      'source_candidate_mapping_id\s*,\s*source_submission_id\s*,\s*child_id',
      'source_candidate_mapping_id, source_submission_id, source_adle_review_session_id, child_id',
      'i'
    );
    if v_updated = v_definition then
      raise exception 'canonical intake source column preflight failed for %', v_signature;
    end if;

    v_definition := v_updated;
    v_updated := regexp_replace(
      v_definition,
      'p_candidate_mapping_id\s*,\s*v_source\.task_submission_id\s*,\s*(v_source\.child_id|p_child_id)',
      'p_candidate_mapping_id, v_source.task_submission_id, v_source.source_adle_review_session_id, \1',
      'i'
    );
    if v_updated = v_definition then
      raise exception 'canonical intake source value preflight failed for %', v_signature;
    end if;

    execute v_updated;
  end loop;
end;
$$;

commit;
