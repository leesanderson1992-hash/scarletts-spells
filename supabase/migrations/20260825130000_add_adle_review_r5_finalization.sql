-- R5 only: canonical Review final evidence, per-word schedule transitions,
-- and the explicitly-scoped starter-inventory audit/cutover contract.
-- Nothing in this migration generates assignments, activates Review-first
-- routing, executes a learner cutover, or completes assignment items/headers.

alter table public.adle_review_policy_versions
  add column if not exists completion_grace_minutes integer;

update public.adle_review_policy_versions
set completion_grace_minutes = 120,
    updated_at = timezone('utc', now())
where schedule_policy_version = 'review_policy_v1_2026-07-04'
  and completion_grace_minutes is null;

alter table public.adle_review_policy_versions
  drop constraint if exists adle_review_policy_versions_completion_grace_check;
alter table public.adle_review_policy_versions
  add constraint adle_review_policy_versions_completion_grace_check
  check (completion_grace_minutes between 0 and 1440);

alter table public.adle_review_schedule_words
  add column if not exists word_schedule_transition_count bigint not null default 0,
  add column if not exists word_last_review_completed_on date,
  add column if not exists word_last_review_completed_at timestamptz;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_transition_count_check;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_transition_count_check
  check (word_schedule_transition_count >= 0);

alter table public.adle_review_outcome_events
  add column if not exists daily_assignment_id uuid
    references public.daily_assignments(id) on delete restrict,
  add column if not exists assignment_item_id uuid
    references public.assignment_items(id) on delete restrict,
  add column if not exists review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict,
  add column if not exists review_encounter_id uuid
    references public.adle_review_word_encounters(id) on delete restrict,
  add column if not exists schedule_word_id uuid
    references public.adle_review_schedule_words(id) on delete restrict,
  add column if not exists original_result text,
  add column if not exists result_source text,
  add column if not exists due_kind text,
  add column if not exists frozen_due_on date,
  add column if not exists frozen_interval_index integer,
  add column if not exists word_schedule_version text,
  add column if not exists assignment_practice_date date,
  add column if not exists review_completed_on date,
  add column if not exists completed_at timestamptz,
  add column if not exists original_attempted_at timestamptz,
  add column if not exists writing_submitted_at timestamptz,
  add column if not exists source_provenance jsonb;

alter table public.adle_review_outcome_events
  drop constraint if exists adle_review_outcome_events_r5_shape_check;
alter table public.adle_review_outcome_events
  add constraint adle_review_outcome_events_r5_shape_check check (
    (review_encounter_id is null and review_session_id is null
      and schedule_word_id is null and original_result is null
      and result_source is null and due_kind is null
      and frozen_due_on is null and frozen_interval_index is null
      and word_schedule_version is null and assignment_practice_date is null
      and review_completed_on is null and completed_at is null
      and source_provenance is null)
    or
    (review_encounter_id is not null and review_session_id is not null
      and schedule_word_id is not null
      and original_result in ('success', 'failure')
      and result_source in ('review_writing', 'review_audio_check')
      and due_kind in ('scheduled_review', 'catch_up_retest', 'pre_retirement_check')
      and frozen_due_on is not null and frozen_interval_index >= 0
      and word_schedule_version = 'adle_review_per_word_schedule_v1'
      and assignment_practice_date is not null
      and review_completed_on is not null and completed_at is not null
      and occurred_on = review_completed_on
      and interval_index = frozen_interval_index
      and jsonb_typeof(source_provenance) = 'object')
  );

create unique index if not exists adle_review_outcome_events_one_r5_per_encounter_idx
  on public.adle_review_outcome_events(review_encounter_id)
  where review_encounter_id is not null;
create unique index if not exists adle_review_outcome_events_one_r5_schedule_session_idx
  on public.adle_review_outcome_events(review_session_id, schedule_word_id)
  where review_session_id is not null and schedule_word_id is not null;

alter table public.adle_authentic_use_events
  add column if not exists provenance_kind text not null
    default 'independent_or_parent_verified_application',
  add column if not exists review_session_id uuid
    references public.adle_review_sessions(id) on delete restrict,
  add column if not exists review_encounter_id uuid
    references public.adle_review_word_encounters(id) on delete restrict,
  add column if not exists daily_assignment_id uuid
    references public.daily_assignments(id) on delete restrict,
  add column if not exists assignment_item_id uuid
    references public.assignment_items(id) on delete restrict,
  add column if not exists snapshot_fingerprint text,
  add column if not exists prompt_version_id uuid
    references public.adle_review_prompt_versions(id) on delete restrict,
  add column if not exists writing_submitted_at timestamptz,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.adle_authentic_use_events
  drop constraint if exists adle_authentic_use_events_provenance_kind_check;
alter table public.adle_authentic_use_events
  add constraint adle_authentic_use_events_provenance_kind_check check (
    provenance_kind in (
      'independent_or_parent_verified_application',
      'prompted_review_writing_application'
    )
  );
alter table public.adle_authentic_use_events
  drop constraint if exists adle_authentic_use_events_prompted_review_shape_check;
alter table public.adle_authentic_use_events
  add constraint adle_authentic_use_events_prompted_review_shape_check check (
    provenance_kind <> 'prompted_review_writing_application'
    or (
      parent_verified = false and verified_at is null
      and use_kind = 'authentic_correct_use'
      and review_session_id is not null and review_encounter_id is not null
      and daily_assignment_id is not null and assignment_item_id is not null
      and snapshot_fingerprint ~ '^[a-f0-9]{64}$'
      and prompt_version_id is not null and writing_submitted_at is not null
      and jsonb_typeof(provenance) = 'object'
    )
  );
create unique index if not exists adle_authentic_use_events_one_prompted_review_encounter_idx
  on public.adle_authentic_use_events(review_encounter_id)
  where provenance_kind = 'prompted_review_writing_application'
    and row_status = 'active';

create table if not exists public.adle_review_completion_receipts (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null unique
    references public.adle_review_sessions(id) on delete restrict,
  idempotency_key text not null,
  snapshot_fingerprint text not null,
  request_fingerprint text not null,
  completed_at timestamptz not null,
  review_completed_on date not null,
  result_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_completion_receipts_key_check check (btrim(idempotency_key) <> ''),
  constraint adle_review_completion_receipts_snapshot_check
    check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_completion_receipts_request_check
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_completion_receipts_payload_check
    check (jsonb_typeof(result_payload) = 'object')
);

create table if not exists public.adle_review_starter_cutover_receipts (
  id uuid primary key default gen_random_uuid(),
  cutover_version text not null unique,
  idempotency_key text not null unique,
  approved_child_ids uuid[] not null,
  audit_fingerprint text not null,
  eligible_starter_count integer not null,
  already_reviewed_count integer not null,
  ambiguous_count integer not null,
  excluded_count integer not null,
  schedule_policy_version text not null
    references public.adle_review_policy_versions(schedule_policy_version) on delete restrict,
  result_payload jsonb not null,
  applied_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_starter_cutover_version_check check (btrim(cutover_version) <> ''),
  constraint adle_review_starter_cutover_key_check check (btrim(idempotency_key) <> ''),
  constraint adle_review_starter_cutover_scope_check check (cardinality(approved_child_ids) > 0),
  constraint adle_review_starter_cutover_fingerprint_check
    check (audit_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_starter_cutover_counts_check check (
    eligible_starter_count >= 0 and already_reviewed_count >= 0
    and ambiguous_count >= 0 and excluded_count >= 0
  ),
  constraint adle_review_starter_cutover_payload_check
    check (jsonb_typeof(result_payload) = 'object')
);

create or replace function public.prevent_adle_review_r5_evidence_mutation()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'ADLE Review R5 evidence and receipts are append-only';
end;
$$;

-- R3/R3.1 made the original outcome immutable before R5 had a final-ledger
-- link. Permit exactly one null -> matching R5 event link while retaining all
-- original retrieval and R3.1 attribution immutability.
create or replace function public.prevent_adle_review_original_outcome_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pending_r31_refinement boolean;
  v_valid_final_link boolean;
begin
  if old.review_session_id is distinct from new.review_session_id
    or old.schedule_word_id is distinct from new.schedule_word_id
    or old.canonical_word_id is distinct from new.canonical_word_id
    or old.target_order is distinct from new.target_order
  then raise exception 'ADLE Review encounter identity is immutable'; end if;

  v_pending_r31_refinement :=
    old.writing_disposition = 'unaccounted_for'
    and old.original_outcome = 'pending'
    and old.original_outcome_source is null
    and (
      (new.writing_disposition = 'unaccounted_for'
        and new.original_outcome = 'pending'
        and new.original_outcome_source is null
        and new.original_attempt_event_id is null
        and new.repair_state = 'not_required')
      or
      (new.writing_disposition = 'attributable_misspelling'
        and new.original_outcome = 'failure'
        and new.original_outcome_source = 'writing'
        and new.original_attempt_event_id is not null
        and new.repair_state = 'required'
        and new.attribution_algorithm_version = 'learner_confirmed_writing_intent_v1')
    );
  v_valid_final_link := old.original_outcome in ('success', 'failure')
    and old.review_outcome_event_id is null
    and new.review_outcome_event_id is not null
    and exists (
      select 1 from public.adle_review_outcome_events outcome
      where outcome.id = new.review_outcome_event_id
        and outcome.review_encounter_id = old.id
        and outcome.review_session_id = old.review_session_id
        and outcome.schedule_word_id = old.schedule_word_id
        and outcome.canonical_word_id = old.canonical_word_id
        and outcome.original_result = old.original_outcome
        and outcome.result_source = case old.original_outcome_source
          when 'writing' then 'review_writing'
          when 'audio_retrieval_check' then 'review_audio_check'
        end
    );

  if old.writing_disposition is not null and not v_pending_r31_refinement and (
    old.writing_disposition is distinct from new.writing_disposition
    or old.attribution_algorithm_version is distinct from new.attribution_algorithm_version
    or old.attribution_provenance is distinct from new.attribution_provenance
  ) then raise exception 'ADLE Review writing disposition is immutable'; end if;
  if old.original_outcome <> 'pending' and (
    old.original_outcome is distinct from new.original_outcome
    or old.original_outcome_source is distinct from new.original_outcome_source
    or old.original_attempt_event_id is distinct from new.original_attempt_event_id
    or (old.review_outcome_event_id is distinct from new.review_outcome_event_id
      and not v_valid_final_link)
  ) then raise exception 'ADLE Review original scheduled-retrieval outcome is immutable'; end if;
  if old.review_outcome_event_id is not null
    and old.review_outcome_event_id is distinct from new.review_outcome_event_id
  then raise exception 'ADLE Review final outcome link is immutable'; end if;
  if old.writing_disposition = 'unaccounted_for'
    and old.original_outcome = 'pending'
    and new.original_outcome_source = 'audio_retrieval_check'
    and old.attribution_provenance ? 'r31ConfirmationState'
    and old.attribution_provenance->>'r31ConfirmationState' <> 'no_attempt_confirmed'
  then raise exception 'audio_check_not_eligible'; end if;
  return new;
end;
$$;

create or replace function public.finalize_adle_review_r5(
  p_review_session_id uuid,
  p_snapshot_fingerprint text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_assignment public.daily_assignments%rowtype;
  v_policy public.adle_review_policy_versions%rowtype;
  v_receipt public.adle_review_completion_receipts%rowtype;
  v_target jsonb;
  v_encounter public.adle_review_word_encounters%rowtype;
  v_word public.adle_review_schedule_words%rowtype;
  v_attempt public.adle_assignment_attempt_events%rowtype;
  v_outcome_id uuid;
  v_event_type text;
  v_result_source text;
  v_due_kind text;
  v_frozen_due_on date;
  v_frozen_interval integer;
  v_actual_completed_at timestamptz;
  v_actual_completed_on date;
  v_review_completed_on date;
  v_latest_activity_at timestamptz;
  v_latest_activity_on date;
  v_request_fingerprint text;
  v_policy_count integer;
  v_target_count integer;
  v_encounter_count integer;
  v_success_count integer := 0;
  v_failure_count integer := 0;
  v_authentic_count integer := 0;
  v_has_independent_authentic boolean;
  v_final_interval integer;
  v_new_interval integer;
  v_new_membership text;
  v_new_due_on date;
  v_new_catch_up_stage integer;
  v_new_retest_due_on date;
  v_new_failed_review_on date;
  v_new_pre_retirement_due_on date;
  v_new_last_28_on date;
  v_result jsonb;
  v_state_version integer;
begin
  if p_review_session_id is null
    or coalesce(p_snapshot_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_idempotency_key), '') is null
  then raise exception 'invalid_review_finalization_contract'; end if;

  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found then raise exception 'review_session_not_found'; end if;

  select * into v_receipt from public.adle_review_completion_receipts
  where review_session_id = p_review_session_id;
  if found then
    if v_receipt.idempotency_key <> p_idempotency_key
      or v_receipt.snapshot_fingerprint <> p_snapshot_fingerprint
    then raise exception 'review_finalization_conflict'; end if;
    return v_receipt.result_payload || jsonb_build_object('replayed', true);
  end if;
  if v_session.completed_at is not null or v_session.stage = 'completed'
    then raise exception 'review_completion_without_r5_receipt'; end if;
  if exists (select 1 from public.adle_review_transition_receipts
    where review_session_id = p_review_session_id and idempotency_key = p_idempotency_key)
  then raise exception 'review_idempotency_conflict'; end if;
  if v_session.snapshot_fingerprint <> p_snapshot_fingerprint
    or v_session.stage <> 'ready_to_complete'
    or v_session.submitted_writing_text is null
    or v_session.writing_submitted_at is null
    or v_session.selected_prompt_version_id is null
    or v_session.selected_challenge_type is null
  then raise exception 'review_session_not_finalizable'; end if;

  select * into v_assignment from public.daily_assignments
  where id = v_session.daily_assignment_id for share;
  if not found or v_assignment.child_id <> v_session.child_id
    or v_assignment.parent_user_id <> v_session.parent_user_id
    or v_assignment.compiled_review_snapshot is null
    or not public.adle_review_snapshot_is_structurally_valid_v3(v_assignment.compiled_review_snapshot)
    or v_assignment.compiled_review_snapshot#>>'{assignment,assignmentId}' <> v_assignment.id::text
    or v_assignment.compiled_review_snapshot#>>'{assignment,reviewItemId}' <> v_session.assignment_item_id::text
    or not exists (
      select 1 from public.assignment_items item
      where item.id = v_session.assignment_item_id
        and item.daily_assignment_id = v_session.daily_assignment_id
        and item.child_id = v_session.child_id
        and item.parent_user_id = v_session.parent_user_id
    )
  then raise exception 'review_assignment_snapshot_conflict'; end if;

  select count(*) into v_policy_count from public.adle_review_policy_versions where is_active = true;
  if v_policy_count <> 1 then raise exception 'active_review_policy_missing_or_ambiguous'; end if;
  select * into v_policy from public.adle_review_policy_versions where is_active = true;
  if array_length(v_policy.interval_ladder_days, 1) < 1
    or array_length(v_policy.catch_up_offsets_days, 1) <> 2
    or v_policy.session_cap < 1
    or v_policy.pre_retirement_check_gap_days < 1
    or v_policy.completion_grace_minutes is null
    or v_policy.completion_grace_minutes not between 0 and 1440
    or exists (select 1 from unnest(v_policy.interval_ladder_days) value where value < 1)
    or exists (select 1 from unnest(v_policy.catch_up_offsets_days) value where value < 1)
  then raise exception 'active_review_policy_unsupported'; end if;

  select jsonb_array_length(v_assignment.compiled_review_snapshot->'targets') into v_target_count;
  select count(*) into v_encounter_count from public.adle_review_word_encounters
    where review_session_id = p_review_session_id;
  if v_target_count <> v_encounter_count or v_target_count > v_policy.session_cap
    then raise exception 'review_target_set_conflict'; end if;
  perform 1 from public.adle_review_word_encounters
    where review_session_id = p_review_session_id order by target_order for update;
  perform 1 from public.adle_review_schedule_words word
    where word.id in (select schedule_word_id from public.adle_review_word_encounters
      where review_session_id = p_review_session_id)
    order by word.child_id, word.id for update;

  v_actual_completed_at := clock_timestamp();
  select greatest(
    v_session.created_at, v_session.updated_at, v_session.writing_started_at,
    v_session.writing_submitted_at,
    (select max(created_at) from public.adle_review_transition_receipts
      where review_session_id = p_review_session_id),
    (select max(updated_at) from public.adle_review_word_encounters
      where review_session_id = p_review_session_id),
    (select max(repair.created_at) from public.adle_review_repair_attempts repair
      join public.adle_review_word_encounters encounter
        on encounter.id = repair.review_encounter_id
      where encounter.review_session_id = p_review_session_id)
  ) into v_latest_activity_at;
  if v_latest_activity_at is null or v_latest_activity_at > v_actual_completed_at
    then raise exception 'invalid_review_activity_timeline'; end if;
  v_actual_completed_on := (v_actual_completed_at at time zone 'Europe/London')::date;
  v_latest_activity_on := (v_latest_activity_at at time zone 'Europe/London')::date;
  if v_assignment.assignment_date > v_actual_completed_on
    then raise exception 'future_assignment_practice_date'; end if;
  v_review_completed_on := case
    when v_assignment.assignment_date = v_actual_completed_on
      then v_actual_completed_on
    when v_assignment.assignment_date + 1 = v_actual_completed_on
      and v_latest_activity_on = v_assignment.assignment_date
      and v_actual_completed_at - v_latest_activity_at
        <= make_interval(mins => v_policy.completion_grace_minutes)
      then v_assignment.assignment_date
    else v_actual_completed_on
  end;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'kind', 'complete_review', 'reviewSessionId', p_review_session_id,
    'snapshotFingerprint', p_snapshot_fingerprint
  )::text, 'UTF8'), 'sha256'), 'hex');
  v_final_interval := array_length(v_policy.interval_ladder_days, 1) - 1;

  for v_target in select value from jsonb_array_elements(
    v_assignment.compiled_review_snapshot->'targets'
  ) with ordinality targets(value, ordinal) order by ordinal
  loop
    select * into v_encounter from public.adle_review_word_encounters
    where id = (v_target->>'encounterId')::uuid
      and review_session_id = p_review_session_id;
    if not found then raise exception 'review_snapshot_encounter_conflict'; end if;
    select * into v_word from public.adle_review_schedule_words
    where id = (v_target#>>'{schedule,scheduleWordId}')::uuid;
    if not found
      or v_encounter.schedule_word_id <> v_word.id
      or v_encounter.canonical_word_id <> (v_target->>'canonicalWordId')::uuid
      or v_word.canonical_word_id <> v_encounter.canonical_word_id
      or v_word.child_id <> v_session.child_id
      or v_word.row_status <> 'active'
      or v_word.word_schedule_version <> 'adle_review_per_word_schedule_v1'
      or v_word.word_interval_index is null
      or v_word.word_next_due_on is null and v_word.membership_status = 'scheduled'
      or v_word.word_schedule_policy_version <> v_policy.schedule_policy_version
      or v_target#>>'{schedule,wordScheduleVersion}' <> v_word.word_schedule_version
      or v_target#>>'{schedule,schedulePolicyVersion}' <> v_word.word_schedule_policy_version
      or (v_target#>>'{schedule,intervalIndex}')::integer <> v_word.word_interval_index
      or v_word.word_interval_index not between 0 and v_final_interval
      or coalesce(v_target#>>'{schedule,sourceBundleId}', '')
        <> coalesce(v_word.bundle_id::text, '')
    then raise exception 'review_per_word_schedule_authority_conflict'; end if;
    v_due_kind := v_target#>>'{schedule,dueKind}';
    v_frozen_due_on := (v_target#>>'{schedule,dueOn}')::date;
    v_frozen_interval := (v_target#>>'{schedule,intervalIndex}')::integer;
    if v_frozen_due_on > v_review_completed_on
      or (v_due_kind = 'scheduled_review' and (
        v_word.membership_status <> 'scheduled' or v_word.word_next_due_on <> v_frozen_due_on))
      or (v_due_kind = 'catch_up_retest' and (
        v_word.membership_status <> 'catch_up' or v_word.next_retest_due_on <> v_frozen_due_on
        or v_word.catch_up_stage not in (1, 2) or v_word.failed_review_on is null))
      or (v_due_kind = 'pre_retirement_check' and (
        v_word.membership_status <> 'awaiting_pre_retirement_check'
        or v_word.pre_retirement_check_due_on <> v_frozen_due_on))
      or v_due_kind not in ('scheduled_review', 'catch_up_retest', 'pre_retirement_check')
    then raise exception 'review_frozen_due_identity_conflict'; end if;

    if v_encounter.original_outcome not in ('success', 'failure')
      or v_encounter.original_outcome_source not in ('writing', 'audio_retrieval_check')
      or v_encounter.original_attempt_event_id is null
      or (v_encounter.original_outcome = 'failure'
        and v_encounter.repair_state not in ('completed_correct', 'attempted_not_secured'))
      or (v_encounter.original_outcome = 'success'
        and v_encounter.repair_state <> 'not_required')
      or (v_encounter.original_outcome_source = 'writing'
        and v_encounter.writing_disposition not in ('correct_in_writing', 'attributable_misspelling'))
      or (v_encounter.original_outcome_source = 'audio_retrieval_check'
        and v_encounter.writing_disposition <> 'unaccounted_for')
    then raise exception 'immutable_original_outcome_or_repair_incomplete'; end if;
    select * into v_attempt from public.adle_assignment_attempt_events
      where id = v_encounter.original_attempt_event_id;
    if not found or v_attempt.child_id <> v_session.child_id
      or v_attempt.canonical_word_id <> v_word.canonical_word_id
      or v_attempt.daily_assignment_id <> v_session.daily_assignment_id
      or v_attempt.assignment_item_id <> v_session.assignment_item_id
      or v_attempt.evidence_class <> 'scheduled_review_attempt'
    then raise exception 'original_attempt_provenance_conflict'; end if;

    v_result_source := case v_encounter.original_outcome_source
      when 'writing' then 'review_writing' else 'review_audio_check' end;
    v_event_type := case
      when v_due_kind = 'scheduled_review' and v_encounter.original_outcome = 'success' then 'review_pass'
      when v_due_kind = 'scheduled_review' then 'review_fail'
      when v_due_kind = 'catch_up_retest' and v_encounter.original_outcome = 'success' then 'retest_pass'
      when v_due_kind = 'catch_up_retest' then 'retest_fail'
      when v_encounter.original_outcome = 'success' then 'retirement_check_pass'
      else 'retirement_check_fail'
    end;
    v_outcome_id := gen_random_uuid();
    insert into public.adle_review_outcome_events(
      id, child_id, canonical_word_id, bundle_id, event_type, occurred_on,
      interval_index, schedule_policy_version, daily_assignment_id,
      assignment_item_id, review_session_id, review_encounter_id,
      schedule_word_id, original_result, result_source, due_kind,
      frozen_due_on, frozen_interval_index, word_schedule_version,
      assignment_practice_date, review_completed_on, completed_at,
      original_attempted_at, writing_submitted_at, source_provenance
    ) values (
      v_outcome_id, v_session.child_id, v_word.canonical_word_id,
      v_word.bundle_id, v_event_type, v_review_completed_on,
      v_frozen_interval, v_policy.schedule_policy_version,
      v_session.daily_assignment_id, v_session.assignment_item_id,
      p_review_session_id, v_encounter.id, v_word.id,
      v_encounter.original_outcome, v_result_source, v_due_kind,
      v_frozen_due_on, v_frozen_interval, v_word.word_schedule_version,
      v_assignment.assignment_date, v_review_completed_on,
      v_actual_completed_at, v_attempt.created_at, v_session.writing_submitted_at,
      jsonb_build_object(
        'authority', 'immutable_r3_r31_original_retrieval',
        'writingDisposition', v_encounter.writing_disposition,
        'attributionAlgorithmVersion', v_encounter.attribution_algorithm_version,
        'attributionProvenance', v_encounter.attribution_provenance,
        'originalAttemptEventId', v_encounter.original_attempt_event_id,
        'repairState', v_encounter.repair_state,
        'repairTerminalAt', v_encounter.repair_terminal_at,
        'repairMemoryCueVersionId', v_encounter.repair_memory_cue_version_id,
        'assignmentPracticeDate', v_assignment.assignment_date,
        'actualCompletedAt', v_actual_completed_at,
        'governedReviewCompletedOn', v_review_completed_on
      )
    );
    insert into public.adle_review_outcome_event_routes(
      outcome_event_id, learning_item_id, micro_skill_key
    ) select v_outcome_id, route.learning_item_id, route.micro_skill_key
      from public.adle_review_schedule_word_routes route
      where route.schedule_word_id = v_word.id and route.row_status = 'active'
      on conflict do nothing;

    if v_encounter.writing_disposition = 'correct_in_writing'
      and v_encounter.original_outcome = 'success'
      and v_encounter.original_outcome_source = 'writing'
    then
      insert into public.adle_authentic_use_events(
        child_id, canonical_word_id, occurred_on, use_kind, parent_verified,
        verified_at, piece_ref, source_ref, row_status, provenance_kind,
        review_session_id, review_encounter_id, daily_assignment_id,
        assignment_item_id, snapshot_fingerprint, prompt_version_id,
        writing_submitted_at, provenance
      ) values (
        v_session.child_id, v_word.canonical_word_id,
        (v_session.writing_submitted_at at time zone 'Europe/London')::date,
        'authentic_correct_use', false, null,
        'review-r5-writing:' || p_review_session_id::text,
        'review-r5:' || p_review_session_id::text || ':encounter:' || v_encounter.id::text,
        'active', 'prompted_review_writing_application',
        p_review_session_id, v_encounter.id, v_session.daily_assignment_id,
        v_session.assignment_item_id, p_snapshot_fingerprint,
        v_session.selected_prompt_version_id, v_session.writing_submitted_at,
        jsonb_build_object(
          'challengeType', v_session.selected_challenge_type,
          'promptVersionId', v_session.selected_prompt_version_id,
          'writingSubmittedAt', v_session.writing_submitted_at,
          'assignmentPracticeDate', v_assignment.assignment_date,
          'evidenceRole', 'prompted_review_writing_application_only'
        )
      );
      v_authentic_count := v_authentic_count + 1;
    end if;

    v_new_interval := v_word.word_interval_index;
    v_new_membership := v_word.membership_status;
    v_new_due_on := v_word.word_next_due_on;
    v_new_catch_up_stage := v_word.catch_up_stage;
    v_new_retest_due_on := v_word.next_retest_due_on;
    v_new_failed_review_on := v_word.failed_review_on;
    v_new_pre_retirement_due_on := v_word.pre_retirement_check_due_on;
    v_new_last_28_on := v_word.last_28_day_review_on;
    if v_due_kind = 'scheduled_review' then
      if v_encounter.original_outcome = 'failure' then
        v_new_membership := 'catch_up'; v_new_due_on := null;
        v_new_catch_up_stage := 1; v_new_failed_review_on := v_review_completed_on;
        v_new_retest_due_on := v_review_completed_on + v_policy.catch_up_offsets_days[1];
      else
        if v_policy.interval_ladder_days[v_word.word_interval_index + 1] = 28
          then v_new_last_28_on := v_review_completed_on; end if;
        if v_word.word_interval_index < v_final_interval then
          v_new_interval := v_word.word_interval_index + 1;
          v_new_membership := 'scheduled';
          v_new_due_on := v_review_completed_on + v_policy.interval_ladder_days[v_new_interval + 1];
          v_new_catch_up_stage := 0; v_new_retest_due_on := null; v_new_failed_review_on := null;
        else
          select exists (
            select 1 from public.adle_authentic_use_events authentic
            where authentic.child_id = v_word.child_id
              and authentic.canonical_word_id = v_word.canonical_word_id
              and authentic.row_status = 'active' and authentic.parent_verified = true
              and authentic.provenance_kind <> 'prompted_review_writing_application'
              and v_word.last_28_day_review_on is not null
              and authentic.occurred_on >= v_word.last_28_day_review_on
          ) into v_has_independent_authentic;
          v_new_due_on := null; v_new_catch_up_stage := 0;
          v_new_retest_due_on := null; v_new_failed_review_on := null;
          if v_has_independent_authentic then v_new_membership := 'retired';
          else
            v_new_membership := 'awaiting_pre_retirement_check';
            v_new_pre_retirement_due_on := v_review_completed_on + v_policy.pre_retirement_check_gap_days;
          end if;
        end if;
      end if;
    elsif v_due_kind = 'catch_up_retest' then
      if v_encounter.original_outcome = 'success' then
        v_new_catch_up_stage := 0; v_new_retest_due_on := null;
        v_new_failed_review_on := null; v_new_due_on := null;
        if v_word.pre_retirement_check_due_on is not null then
          v_new_membership := 'retired';
        elsif v_word.word_interval_index < v_final_interval then
          v_new_interval := v_word.word_interval_index + 1;
          v_new_membership := 'scheduled';
          v_new_due_on := v_review_completed_on + v_policy.interval_ladder_days[v_new_interval + 1];
        else
          v_new_membership := 'awaiting_pre_retirement_check';
          v_new_pre_retirement_due_on := v_review_completed_on + v_policy.pre_retirement_check_gap_days;
        end if;
      elsif v_word.catch_up_stage = 1 then
        v_new_catch_up_stage := 2;
        v_new_retest_due_on := v_word.failed_review_on + v_policy.catch_up_offsets_days[2];
      else
        v_new_membership := case when v_word.reteach_cycle_count >= 1
          then 'paused_parent_review' else 'ejected_pending_reteach' end;
        v_new_catch_up_stage := 0; v_new_retest_due_on := null; v_new_due_on := null;
      end if;
    else
      if v_encounter.original_outcome = 'success' then
        v_new_membership := 'retired'; v_new_due_on := null;
      else
        v_new_membership := 'catch_up'; v_new_due_on := null;
        v_new_catch_up_stage := 1; v_new_failed_review_on := v_review_completed_on;
        v_new_retest_due_on := v_review_completed_on + v_policy.catch_up_offsets_days[1];
      end if;
    end if;

    update public.adle_review_schedule_words set
      word_interval_index = v_new_interval,
      word_next_due_on = v_new_due_on,
      membership_status = v_new_membership,
      catch_up_stage = v_new_catch_up_stage,
      next_retest_due_on = v_new_retest_due_on,
      failed_review_on = v_new_failed_review_on,
      pre_retirement_check_due_on = v_new_pre_retirement_due_on,
      last_28_day_review_on = v_new_last_28_on,
      word_schedule_transition_count = word_schedule_transition_count + 1,
      word_last_review_completed_on = v_review_completed_on,
      word_last_review_completed_at = v_actual_completed_at,
      updated_at = timezone('utc', now())
    where id = v_word.id;
    update public.adle_review_word_encounters set
      review_outcome_event_id = v_outcome_id,
      updated_at = timezone('utc', now())
    where id = v_encounter.id;
    if v_encounter.original_outcome = 'success' then v_success_count := v_success_count + 1;
    else v_failure_count := v_failure_count + 1; end if;
  end loop;

  v_state_version := v_session.state_version + 1;
  v_result := jsonb_build_object(
    'ok', true, 'replayed', false, 'reviewSessionId', p_review_session_id,
    'assignmentPracticeDate', v_assignment.assignment_date,
    'completedAt', v_actual_completed_at,
    'reviewCompletedOn', v_review_completed_on,
    'successCount', v_success_count, 'failureCount', v_failure_count,
    'promptedAuthenticUseCount', v_authentic_count,
    'transitionedWordCount', v_success_count + v_failure_count,
    'stateVersion', v_state_version
  );
  insert into public.adle_review_completion_receipts(
    review_session_id, idempotency_key, snapshot_fingerprint,
    request_fingerprint, completed_at, review_completed_on, result_payload
  ) values (
    p_review_session_id, p_idempotency_key, p_snapshot_fingerprint,
    v_request_fingerprint, v_actual_completed_at, v_review_completed_on, v_result
  );
  insert into public.adle_review_transition_receipts(
    review_session_id, idempotency_key, transition_kind,
    request_fingerprint, resulting_state_version
  ) values (
    p_review_session_id, p_idempotency_key, 'complete_review',
    v_request_fingerprint, v_state_version
  );
  update public.adle_review_sessions set
    stage = 'completed', completed_at = v_actual_completed_at,
    state_version = v_state_version, updated_at = timezone('utc', now())
  where id = p_review_session_id;
  return v_result;
end;
$$;

create trigger adle_review_outcome_events_append_only
before update or delete on public.adle_review_outcome_events
for each row execute function public.prevent_adle_review_r5_evidence_mutation();
create trigger adle_review_completion_receipts_append_only
before update or delete on public.adle_review_completion_receipts
for each row execute function public.prevent_adle_review_r5_evidence_mutation();
create trigger adle_review_starter_cutover_receipts_append_only
before update or delete on public.adle_review_starter_cutover_receipts
for each row execute function public.prevent_adle_review_r5_evidence_mutation();

create or replace function public.prevent_prompted_review_authentic_use_verification()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.provenance_kind = 'prompted_review_writing_application' and (
    new.parent_verified is distinct from false or new.verified_at is not null
    or new.provenance_kind is distinct from old.provenance_kind
    or new.review_session_id is distinct from old.review_session_id
    or new.review_encounter_id is distinct from old.review_encounter_id
  ) then
    raise exception 'Prompted Review-writing evidence can never become parent-verified or independent';
  end if;
  return new;
end;
$$;
create trigger adle_authentic_use_events_prompted_review_guard
before update on public.adle_authentic_use_events
for each row execute function public.prevent_prompted_review_authentic_use_verification();

create or replace function public.adle_review_starter_inventory_rows_r5(
  p_child_ids uuid[] default null
) returns table (
  schedule_word_id uuid,
  child_id uuid,
  classification text,
  reason_codes text[]
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row record;
  v_matching_outcomes integer;
  v_mismatched_outcomes integer;
  v_orphan_attempts integer;
  v_incomplete_encounters integer;
  v_taught integer;
  v_routes integer;
  v_reasons text[];
  v_inactive boolean;
  v_word_fields_null boolean;
  v_word_fields_exact boolean;
begin
  for v_row in
    select sw.*, bundle.interval_index as bundle_interval_index,
      bundle.next_due_on as bundle_next_due_on,
      bundle.schedule_policy_version as bundle_policy_version,
      bundle.bundle_status, bundle.row_status as bundle_row_status,
      canonical.row_status as canonical_row_status
    from public.adle_review_schedule_words sw
    join public.adle_review_bundles bundle on bundle.id = sw.bundle_id
    join public.canonical_teaching_dictionary_words canonical
      on canonical.id = sw.canonical_word_id
    where p_child_ids is null or sw.child_id = any(p_child_ids)
    order by sw.child_id, sw.id
  loop
    select count(*) into v_matching_outcomes
    from public.adle_review_outcome_events outcome
    where outcome.child_id = v_row.child_id
      and outcome.canonical_word_id = v_row.canonical_word_id
      and outcome.event_type in (
        'review_pass', 'review_fail', 'retest_pass', 'retest_fail',
        'retirement_check_pass', 'retirement_check_fail'
      )
      and (outcome.schedule_word_id = v_row.id
        or (outcome.schedule_word_id is null and outcome.bundle_id = v_row.bundle_id));
    select count(*) into v_mismatched_outcomes
    from public.adle_review_outcome_events outcome
    where outcome.child_id = v_row.child_id
      and outcome.canonical_word_id = v_row.canonical_word_id
      and outcome.event_type in (
        'review_pass', 'review_fail', 'retest_pass', 'retest_fail',
        'retirement_check_pass', 'retirement_check_fail'
      )
      and (
        (outcome.schedule_word_id is not null and outcome.schedule_word_id <> v_row.id)
        or (outcome.schedule_word_id is null and outcome.bundle_id is distinct from v_row.bundle_id)
      );
    select count(*) into v_orphan_attempts
    from public.adle_assignment_attempt_events attempt
    where attempt.child_id = v_row.child_id
      and attempt.canonical_word_id = v_row.canonical_word_id
      and attempt.evidence_class = 'scheduled_review_attempt'
      and not exists (
        select 1 from public.adle_review_outcome_events outcome
        where outcome.child_id = attempt.child_id
          and outcome.canonical_word_id = attempt.canonical_word_id
      );
    select count(*) into v_incomplete_encounters
    from public.adle_review_word_encounters encounter
    join public.adle_review_sessions session on session.id = encounter.review_session_id
    where encounter.schedule_word_id = v_row.id and session.completed_at is null;
    select count(*) into v_taught
    from public.adle_taught_word_history taught
    where taught.child_id = v_row.child_id
      and taught.canonical_word_id = v_row.canonical_word_id
      and taught.event_kind = 'taught' and taught.row_status = 'active';
    select count(*) into v_routes
    from public.adle_review_schedule_word_routes route
    where route.schedule_word_id = v_row.id and route.row_status = 'active';

    v_reasons := array[]::text[];
    v_inactive := v_row.row_status <> 'active'
      or v_row.bundle_status <> 'active' or v_row.bundle_row_status <> 'active'
      or v_row.canonical_row_status <> 'active';
    if v_inactive then
      if v_row.row_status <> 'active' then v_reasons := array_append(v_reasons, 'schedule_inactive'); end if;
      if v_row.bundle_status <> 'active' or v_row.bundle_row_status <> 'active'
        then v_reasons := array_append(v_reasons, 'bundle_inactive'); end if;
      if v_row.canonical_row_status <> 'active'
        then v_reasons := array_append(v_reasons, 'canonical_inactive'); end if;
      if v_matching_outcomes + v_mismatched_outcomes + v_orphan_attempts
          + v_incomplete_encounters > 0 or v_row.word_schedule_version is not null
      then
        schedule_word_id := v_row.id; child_id := v_row.child_id;
        classification := 'ambiguous';
        reason_codes := array_append(v_reasons, 'inactive_with_schedule_history');
        return next;
      else
        schedule_word_id := v_row.id; child_id := v_row.child_id;
        classification := 'excluded'; reason_codes := v_reasons; return next;
      end if;
      continue;
    end if;

    if v_matching_outcomes > 0 then
      if v_matching_outcomes <> 1 then v_reasons := array_append(v_reasons, 'duplicate_completed_outcomes'); end if;
      if v_mismatched_outcomes > 0 then v_reasons := array_append(v_reasons, 'mismatched_completed_outcome'); end if;
      if v_incomplete_encounters > 0 then v_reasons := array_append(v_reasons, 'outcome_with_incomplete_encounter'); end if;
      schedule_word_id := v_row.id; child_id := v_row.child_id;
      classification := case when cardinality(v_reasons) = 0 then 'already_reviewed' else 'ambiguous' end;
      reason_codes := case when cardinality(v_reasons) = 0
        then array['matching_completed_outcome']::text[] else v_reasons end;
      return next; continue;
    end if;

    if v_row.membership_status <> 'scheduled'
      then v_reasons := array_append(v_reasons, 'not_initial_scheduled_membership'); end if;
    if v_row.catch_up_stage <> 0 or v_row.next_retest_due_on is not null
      or v_row.failed_review_on is not null
      then v_reasons := array_append(v_reasons, 'failure_or_catch_up_history'); end if;
    if v_row.pre_retirement_check_due_on is not null
      then v_reasons := array_append(v_reasons, 'pre_retirement_history'); end if;
    if v_taught < 1 then v_reasons := array_append(v_reasons, 'missing_taught_history'); end if;
    if v_routes < 1 and nullif(btrim((select source_ref from public.adle_review_bundles where id=v_row.bundle_id)), '') is null
      then v_reasons := array_append(v_reasons, 'missing_source_lineage'); end if;
    if v_row.bundle_interval_index <> 0
      then v_reasons := array_append(v_reasons, 'unexplained_interval_advancement'); end if;
    if v_row.bundle_next_due_on is null
      then v_reasons := array_append(v_reasons, 'invalid_existing_due_date'); end if;
    if not exists (
      select 1 from public.adle_review_policy_versions policy
      where policy.schedule_policy_version = v_row.bundle_policy_version
    ) then v_reasons := array_append(v_reasons, 'invalid_policy_version'); end if;
    if v_mismatched_outcomes > 0 then v_reasons := array_append(v_reasons, 'mismatched_completed_outcome'); end if;
    if v_orphan_attempts > 0 then v_reasons := array_append(v_reasons, 'orphan_scheduled_attempt'); end if;
    if v_incomplete_encounters > 0 then v_reasons := array_append(v_reasons, 'incomplete_review_encounter'); end if;
    v_word_fields_null := v_row.word_schedule_version is null
      and v_row.word_interval_index is null and v_row.word_next_due_on is null
      and v_row.word_schedule_policy_version is null;
    v_word_fields_exact := v_row.word_schedule_version = 'adle_review_per_word_schedule_v1'
      and v_row.word_interval_index = v_row.bundle_interval_index
      and v_row.word_next_due_on = v_row.bundle_next_due_on
      and v_row.word_schedule_policy_version = v_row.bundle_policy_version;
    if not v_word_fields_null and not coalesce(v_word_fields_exact, false)
      then v_reasons := array_append(v_reasons, 'conflicting_per_word_authority'); end if;

    schedule_word_id := v_row.id; child_id := v_row.child_id;
    classification := case when cardinality(v_reasons) = 0 then 'eligible_starter' else 'ambiguous' end;
    reason_codes := case when cardinality(v_reasons) = 0
      then array['never_reviewed_pending_word']::text[] else v_reasons end;
    return next;
  end loop;
end;
$$;

create or replace function public.audit_adle_review_starter_inventory_r5(
  p_child_ids uuid[] default null
) returns jsonb
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  with rows as (
    select * from public.adle_review_starter_inventory_rows_r5(p_child_ids)
  ), summary as (
    select
      count(*) filter (where classification='eligible_starter')::integer as eligible_starter,
      count(*) filter (where classification='already_reviewed')::integer as already_reviewed,
      count(*) filter (where classification='ambiguous')::integer as ambiguous,
      count(*) filter (where classification='excluded')::integer as excluded
    from rows
  ), payload as (
    select jsonb_build_object(
      'scope', case when p_child_ids is null then null else to_jsonb(
        (select array_agg(id order by id::text) from unnest(p_child_ids) id)
      ) end,
      'counts', to_jsonb(summary),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'scheduleWordId', schedule_word_id, 'childId', child_id,
        'classification', classification, 'reasonCodes', reason_codes
      ) order by child_id, schedule_word_id) from rows), '[]'::jsonb)
    ) as value from summary
  )
  select value || jsonb_build_object(
    'fingerprint', encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
  ) from payload;
$$;

create or replace function public.apply_adle_review_starter_cutover_r5(
  p_child_ids uuid[],
  p_audit_fingerprint text,
  p_cutover_version text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_scope uuid[];
  v_audit jsonb;
  v_policy public.adle_review_policy_versions%rowtype;
  v_receipt public.adle_review_starter_cutover_receipts%rowtype;
  v_updated integer;
  v_result jsonb;
begin
  if p_child_ids is null or cardinality(p_child_ids) = 0
    or exists (select 1 from unnest(p_child_ids) as scoped(scope_id) where scope_id is null)
    or cardinality(p_child_ids) <> (
      select count(distinct scope_id) from unnest(p_child_ids) as scoped(scope_id)
    )
    or coalesce(p_audit_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_cutover_version), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
  then raise exception 'invalid_explicit_starter_cutover_contract'; end if;
  select array_agg(scope_id order by scope_id::text) into v_scope
    from unnest(p_child_ids) as scoped(scope_id);
  perform pg_advisory_xact_lock(hashtextextended('adle-review-starter-cutover:' || p_cutover_version, 0));
  perform 1 from public.adle_review_schedule_words
    where child_id = any(v_scope) order by child_id, id for update;

  select * into v_receipt from public.adle_review_starter_cutover_receipts
    where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.approved_child_ids <> v_scope
      or v_receipt.audit_fingerprint <> p_audit_fingerprint
      or v_receipt.cutover_version <> p_cutover_version
    then raise exception 'starter_cutover_idempotency_conflict'; end if;
    return v_receipt.result_payload || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.adle_review_starter_cutover_receipts
    where cutover_version = p_cutover_version)
  then raise exception 'starter_cutover_version_conflict'; end if;

  v_audit := public.audit_adle_review_starter_inventory_r5(v_scope);
  if v_audit->>'fingerprint' <> p_audit_fingerprint
    then raise exception 'starter_audit_fingerprint_drift'; end if;
  if (v_audit#>>'{counts,ambiguous}')::integer <> 0
    then raise exception 'ambiguous_starter_inventory'; end if;
  select * into v_policy from public.adle_review_policy_versions where is_active = true;
  if not found or v_policy.completion_grace_minutes is null
    then raise exception 'active_review_policy_missing_or_unsupported'; end if;

  update public.adle_review_schedule_words word set
    word_schedule_version = 'adle_review_per_word_schedule_v1',
    word_interval_index = bundle.interval_index,
    word_next_due_on = bundle.next_due_on,
    word_schedule_policy_version = bundle.schedule_policy_version,
    updated_at = word.updated_at
  from public.adle_review_bundles bundle
  where word.bundle_id = bundle.id and word.child_id = any(v_scope)
    and word.id in (select classified.schedule_word_id
      from public.adle_review_starter_inventory_rows_r5(v_scope) classified
      where classified.classification = 'eligible_starter')
    and word.word_schedule_version is null;
  get diagnostics v_updated = row_count;
  if v_updated > (v_audit#>>'{counts,eligible_starter}')::integer
    then raise exception 'starter_cutover_update_count_conflict'; end if;

  v_result := jsonb_build_object(
    'ok', true, 'replayed', false, 'cutoverVersion', p_cutover_version,
    'approvedChildIds', v_scope, 'auditFingerprint', p_audit_fingerprint,
    'counts', v_audit->'counts', 'initializedRows', v_updated
  );
  insert into public.adle_review_starter_cutover_receipts(
    cutover_version, idempotency_key, approved_child_ids, audit_fingerprint,
    eligible_starter_count, already_reviewed_count, ambiguous_count,
    excluded_count, schedule_policy_version, result_payload
  ) values (
    p_cutover_version, p_idempotency_key, v_scope, p_audit_fingerprint,
    (v_audit#>>'{counts,eligible_starter}')::integer,
    (v_audit#>>'{counts,already_reviewed}')::integer,
    (v_audit#>>'{counts,ambiguous}')::integer,
    (v_audit#>>'{counts,excluded}')::integer,
    v_policy.schedule_policy_version, v_result
  );
  return v_result;
end;
$$;

alter table public.adle_review_completion_receipts enable row level security;
alter table public.adle_review_starter_cutover_receipts enable row level security;
revoke all on table public.adle_review_completion_receipts from anon, authenticated;
revoke all on table public.adle_review_starter_cutover_receipts from anon, authenticated;
grant all on table public.adle_review_completion_receipts to service_role;
grant all on table public.adle_review_starter_cutover_receipts to service_role;

revoke all on function public.adle_review_starter_inventory_rows_r5(uuid[])
  from public, anon, authenticated;
revoke all on function public.audit_adle_review_starter_inventory_r5(uuid[])
  from public, anon, authenticated;
revoke all on function public.apply_adle_review_starter_cutover_r5(uuid[], text, text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_adle_review_r5(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.adle_review_starter_inventory_rows_r5(uuid[])
  to service_role;
grant execute on function public.audit_adle_review_starter_inventory_r5(uuid[])
  to service_role;
grant execute on function public.apply_adle_review_starter_cutover_r5(uuid[], text, text, text)
  to service_role;
grant execute on function public.finalize_adle_review_r5(uuid, text, text)
  to service_role;

comment on function public.finalize_adle_review_r5(uuid, text, text) is
  'R5 service-only atomic finalizer. Inputs are governed identity/idempotency only; no clock, outcome, schedule, or fault-injection controls.';
comment on function public.apply_adle_review_starter_cutover_r5(uuid[], text, text, text) is
  'R6 administrative boundary: requires an explicit approved child scope and matching R5 audit fingerprint. Never invoked by this migration.';
