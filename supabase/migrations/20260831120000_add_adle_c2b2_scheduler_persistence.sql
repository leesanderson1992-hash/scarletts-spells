-- ADLE C2B.2: additive persistence for the approved target scheduler.
--
-- TypeScript remains the transition authority. This migration stores pinned
-- policy/state versions, reducer-produced state, controlled-decision lineage,
-- and compare-and-swap transition receipts. It does not activate the target
-- policy, cut over any word, or change any current runtime function.

begin;

-- ---------------------------------------------------------------------------
-- Policy registry coexistence. is_active remains a legacy compatibility flag;
-- is_default_for_new_schedules is creation metadata only. Neither authorizes
-- execution of a word already pinned to a policy/state-shape pair.
-- ---------------------------------------------------------------------------

alter table public.adle_review_policy_versions
  add column if not exists is_default_for_new_schedules boolean not null default false,
  add column if not exists transition_family text not null default 'LEGACY_TWO_STAGE_CATCH_UP',
  add column if not exists due_anchor text not null default 'ROLLING_FROM_COMPLETION',
  add column if not exists recovery_delay_days smallint,
  add column if not exists controlled_graduation_policy_version text;

-- This initializes registry metadata only. It does not touch a learner row and
-- current code continues to read is_active exactly as before.
update public.adle_review_policy_versions
set is_default_for_new_schedules = true,
    updated_at = timezone('utc', now())
where schedule_policy_version = 'review_policy_v1_2026-07-04'
  and is_default_for_new_schedules = false;

do $c2b2_current_policy_preflight$
begin
  if (select count(*) from public.adle_review_policy_versions
      where schedule_policy_version = 'review_policy_v1_2026-07-04'
        and is_active = true
        and interval_ladder_days = array[1, 3, 7, 14, 28, 56]
        and catch_up_offsets_days = array[1, 3]
        and is_default_for_new_schedules = true) <> 1
  then raise exception 'adle_c2b2_current_policy_preflight_conflict'; end if;
end;
$c2b2_current_policy_preflight$;

alter table public.adle_review_policy_versions
  alter column catch_up_offsets_days drop not null;

alter table public.adle_review_policy_versions
  drop constraint if exists adle_review_policy_versions_offsets_check,
  drop constraint if exists adle_review_policy_versions_transition_family_check,
  drop constraint if exists adle_review_policy_versions_due_anchor_check,
  drop constraint if exists adle_review_policy_versions_recovery_delay_check,
  drop constraint if exists adle_review_policy_versions_controlled_policy_check,
  drop constraint if exists adle_review_policy_versions_family_shape_check,
  drop constraint if exists adle_review_policy_versions_default_activation_check;

alter table public.adle_review_policy_versions
  add constraint adle_review_policy_versions_transition_family_check
    check (transition_family in ('LEGACY_TWO_STAGE_CATCH_UP', 'REGRESSION_V1')),
  add constraint adle_review_policy_versions_due_anchor_check
    check (due_anchor = 'ROLLING_FROM_COMPLETION'),
  add constraint adle_review_policy_versions_recovery_delay_check
    check (recovery_delay_days is null or recovery_delay_days >= 1),
  add constraint adle_review_policy_versions_controlled_policy_check
    check (
      controlled_graduation_policy_version is null
      or btrim(controlled_graduation_policy_version) <> ''
    ),
  add constraint adle_review_policy_versions_family_shape_check
    check (
      (
        transition_family = 'LEGACY_TWO_STAGE_CATCH_UP'
        and array_length(catch_up_offsets_days, 1) = 2
        and catch_up_offsets_days[1] >= 1
        and catch_up_offsets_days[2] >= 1
        and recovery_delay_days is null
        and controlled_graduation_policy_version is null
      )
      or
      (
        transition_family = 'REGRESSION_V1'
        and catch_up_offsets_days is null
        and recovery_delay_days = 1
        and due_anchor = 'ROLLING_FROM_COMPLETION'
        and controlled_graduation_policy_version = 'ADLE_CONTROLLED_GRADUATION_V1_OR'
      )
    ),
  add constraint adle_review_policy_versions_default_activation_check
    check (is_default_for_new_schedules = false or activated_at is not null);

create unique index if not exists adle_review_policy_versions_one_default_idx
  on public.adle_review_policy_versions((true))
  where is_default_for_new_schedules = true;

insert into public.adle_review_policy_versions (
  schedule_policy_version,
  is_active,
  is_default_for_new_schedules,
  transition_family,
  interval_ladder_days,
  catch_up_offsets_days,
  recovery_delay_days,
  due_anchor,
  controlled_graduation_policy_version,
  session_cap,
  pre_retirement_check_gap_days,
  completion_grace_minutes,
  formula_reference,
  activated_at
) values (
  'ADLE_SPACED_REVIEW_REGRESSION_V1',
  false,
  false,
  'REGRESSION_V1',
  array[1, 3, 7, 14, 28, 56],
  null,
  1,
  'ROLLING_FROM_COMPLETION',
  'ADLE_CONTROLLED_GRADUATION_V1_OR',
  10,
  112,
  120,
  'docs/contracts/adle-word-progression-and-review-contract.md',
  null
)
on conflict (schedule_policy_version) do nothing;

do $c2b2_policy_seed$
begin
  if not exists (
    select 1
    from public.adle_review_policy_versions policy
    where policy.schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
      and policy.is_active = false
      and policy.is_default_for_new_schedules = false
      and policy.transition_family = 'REGRESSION_V1'
      and policy.interval_ladder_days = array[1, 3, 7, 14, 28, 56]
      and policy.catch_up_offsets_days is null
      and policy.recovery_delay_days = 1
      and policy.due_anchor = 'ROLLING_FROM_COMPLETION'
      and policy.controlled_graduation_policy_version = 'ADLE_CONTROLLED_GRADUATION_V1_OR'
  ) then
    raise exception 'adle_c2b2_target_policy_seed_conflict';
  end if;
end;
$c2b2_policy_seed$;

-- ---------------------------------------------------------------------------
-- Target per-word state. Route is membership_status; unresolved lineage is
-- stored separately. Old and legacy rows retain null target-lineage fields.
-- ---------------------------------------------------------------------------

alter table public.adle_review_schedule_words
  add column if not exists consecutive_independent_failures smallint,
  add column if not exists failure_episode_id uuid;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_failure_episode_fkey;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_failure_episode_fkey
  foreign key (failure_episode_id)
  references public.adle_review_outcome_events(id)
  on delete no action
  deferrable initially deferred;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_membership_check;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_membership_check
  check (membership_status = any (array[
    'scheduled',
    'catch_up',
    'next_day_recovery',
    'controlled_reacquisition',
    'ejected_pending_reteach',
    'paused_parent_review',
    'awaiting_pre_retirement_check',
    'retired'
  ]));

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_word_authority_check;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_word_authority_check
  check (
    (
      word_schedule_version is null
      and word_interval_index is null
      and word_next_due_on is null
      and word_schedule_policy_version is null
      and consecutive_independent_failures is null
      and failure_episode_id is null
    )
    or
    (
      word_schedule_version = 'adle_review_per_word_schedule_v1'
      and word_interval_index >= 0
      and word_schedule_policy_version is not null
      and consecutive_independent_failures is null
      and failure_episode_id is null
      and (
        (membership_status = 'scheduled' and word_next_due_on is not null)
        or
        (membership_status <> 'scheduled' and word_next_due_on is null)
      )
    )
    or
    (
      word_schedule_version = 'adle_review_per_word_schedule_v2'
      and word_schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
      and word_interval_index between 0 and 5
      and catch_up_stage = 0
      and next_retest_due_on is null
      and failed_review_on is null
      and consecutive_independent_failures is not null
      and consecutive_independent_failures >= 0
      and (
        (consecutive_independent_failures = 0 and failure_episode_id is null)
        or
        (consecutive_independent_failures >= 1 and failure_episode_id is not null)
      )
      and (
        (
          membership_status = 'scheduled'
          and word_next_due_on is not null
          and pre_retirement_check_due_on is null
          and (
            consecutive_independent_failures < 3
            or word_interval_index = 0
          )
        )
        or
        (
          membership_status = 'next_day_recovery'
          and word_interval_index between 1 and 5
          and word_next_due_on is not null
          and pre_retirement_check_due_on is null
          and consecutive_independent_failures between 1 and 2
          and failure_episode_id is not null
        )
        or
        (
          membership_status = 'controlled_reacquisition'
          and word_next_due_on is null
          and pre_retirement_check_due_on is null
          and consecutive_independent_failures >= 1
          and failure_episode_id is not null
        )
        or
        (
          membership_status = 'awaiting_pre_retirement_check'
          and word_interval_index = 5
          and word_next_due_on is null
          and pre_retirement_check_due_on is not null
          and consecutive_independent_failures = 0
          and failure_episode_id is null
        )
        or
        (
          membership_status = 'retired'
          and word_next_due_on is null
          and consecutive_independent_failures = 0
          and failure_episode_id is null
        )
      )
    )
  );

create index if not exists adle_review_schedule_words_target_due_idx
  on public.adle_review_schedule_words(child_id, word_next_due_on, canonical_word_id)
  where word_schedule_version = 'adle_review_per_word_schedule_v2'
    and membership_status in ('scheduled', 'next_day_recovery')
    and row_status = 'active';

-- R5 facts remain immutable. This only admits future v2 outcome rows and the
-- target recovery due kind; the current v1 branch is unchanged.
alter table public.adle_review_outcome_events
  drop constraint if exists adle_review_outcome_events_r5_shape_check;
alter table public.adle_review_outcome_events
  add constraint adle_review_outcome_events_r5_shape_check check (
    (
      review_encounter_id is null and review_session_id is null
      and schedule_word_id is null and original_result is null
      and result_source is null and due_kind is null
      and frozen_due_on is null and frozen_interval_index is null
      and word_schedule_version is null and assignment_practice_date is null
      and review_completed_on is null and completed_at is null
      and source_provenance is null
    )
    or
    (
      review_encounter_id is not null and review_session_id is not null
      and schedule_word_id is not null
      and original_result in ('success', 'failure')
      and result_source in ('review_writing', 'review_audio_check')
      and frozen_due_on is not null and frozen_interval_index >= 0
      and assignment_practice_date is not null
      and review_completed_on is not null and completed_at is not null
      and occurred_on = review_completed_on
      and interval_index = frozen_interval_index
      and jsonb_typeof(source_provenance) = 'object'
      and (
        (
          word_schedule_version = 'adle_review_per_word_schedule_v1'
          and due_kind in ('scheduled_review', 'catch_up_retest', 'pre_retirement_check')
        )
        or
        (
          word_schedule_version = 'adle_review_per_word_schedule_v2'
          and schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
          and due_kind in ('scheduled_review', 'next_day_recovery', 'pre_retirement_check')
          and frozen_interval_index between 0 and 5
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Controlled decisions. Rows are update-immutable; deletion intentionally
-- follows the current child/assignment/attempt lifecycle.
-- ---------------------------------------------------------------------------

create table if not exists public.adle_controlled_graduation_receipts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  daily_assignment_id uuid not null
    references public.daily_assignments(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_ref text not null,
  controlled_policy_version text not null,
  controlled_cycle_kind text not null,
  cover_write_attempt_event_id uuid
    references public.adle_assignment_attempt_events(id) on delete cascade,
  cover_write_outcome text,
  sentence_dictation_attempt_event_id uuid
    references public.adle_assignment_attempt_events(id) on delete cascade,
  sentence_dictation_outcome text,
  later_clean_attempt_event_id uuid
    references public.adle_assignment_attempt_events(id) on delete cascade,
  later_clean_outcome text,
  decision text not null,
  decision_reason text not null,
  completed_on date not null,
  decided_at timestamptz not null,
  source_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_controlled_graduation_receipts_identity_unique unique (
    child_id,
    daily_assignment_id,
    canonical_word_id,
    source_ref,
    controlled_policy_version,
    controlled_cycle_kind
  ),
  constraint adle_controlled_graduation_receipts_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_controlled_graduation_receipts_policy_check
    check (controlled_policy_version = 'ADLE_CONTROLLED_GRADUATION_V1_OR'),
  constraint adle_controlled_graduation_receipts_kind_check
    check (controlled_cycle_kind in (
      'GOVERNED_OR_PAIR', 'LATER_CLEAN_CONTROLLED_PRODUCTION'
    )),
  constraint adle_controlled_graduation_receipts_outcomes_check
    check (
      (cover_write_outcome is null or cover_write_outcome in ('PASS', 'FAIL'))
      and (sentence_dictation_outcome is null or sentence_dictation_outcome in ('PASS', 'FAIL'))
      and (later_clean_outcome is null or later_clean_outcome in ('PASS', 'FAIL'))
    ),
  constraint adle_controlled_graduation_receipts_decision_check
    check (decision in ('PASS', 'NOT_PASSED')),
  constraint adle_controlled_graduation_receipts_reason_check
    check (decision_reason in (
      'CONTROLLED_OR_PASS',
      'CONTROLLED_BOTH_FAILED',
      'LATER_CLEAN_CONTROLLED_PASS',
      'LATER_CONTROLLED_PRODUCTION_FAILED'
    )),
  constraint adle_controlled_graduation_receipts_shape_check
    check (
      (
        controlled_cycle_kind = 'GOVERNED_OR_PAIR'
        and cover_write_attempt_event_id is not null
        and sentence_dictation_attempt_event_id is not null
        and cover_write_attempt_event_id <> sentence_dictation_attempt_event_id
        and later_clean_attempt_event_id is null
        and cover_write_outcome is not null
        and sentence_dictation_outcome is not null
        and later_clean_outcome is null
        and (
          (
            (cover_write_outcome = 'PASS' or sentence_dictation_outcome = 'PASS')
            and decision = 'PASS'
            and decision_reason = 'CONTROLLED_OR_PASS'
          )
          or
          (
            cover_write_outcome = 'FAIL'
            and sentence_dictation_outcome = 'FAIL'
            and decision = 'NOT_PASSED'
            and decision_reason = 'CONTROLLED_BOTH_FAILED'
          )
        )
      )
      or
      (
        controlled_cycle_kind = 'LATER_CLEAN_CONTROLLED_PRODUCTION'
        and cover_write_attempt_event_id is null
        and sentence_dictation_attempt_event_id is null
        and later_clean_attempt_event_id is not null
        and cover_write_outcome is null
        and sentence_dictation_outcome is null
        and later_clean_outcome is not null
        and (
          (
            later_clean_outcome = 'PASS'
            and decision = 'PASS'
            and decision_reason = 'LATER_CLEAN_CONTROLLED_PASS'
          )
          or
          (
            later_clean_outcome = 'FAIL'
            and decision = 'NOT_PASSED'
            and decision_reason = 'LATER_CONTROLLED_PRODUCTION_FAILED'
          )
        )
      )
    ),
  constraint adle_controlled_graduation_receipts_fingerprint_check
    check (source_fingerprint ~ '^[a-f0-9]{64}$')
);

create unique index if not exists adle_controlled_receipts_cover_attempt_idx
  on public.adle_controlled_graduation_receipts(cover_write_attempt_event_id)
  where cover_write_attempt_event_id is not null;
create unique index if not exists adle_controlled_receipts_dictation_attempt_idx
  on public.adle_controlled_graduation_receipts(sentence_dictation_attempt_event_id)
  where sentence_dictation_attempt_event_id is not null;
create unique index if not exists adle_controlled_receipts_later_attempt_idx
  on public.adle_controlled_graduation_receipts(later_clean_attempt_event_id)
  where later_clean_attempt_event_id is not null;
create index if not exists adle_controlled_receipts_child_word_idx
  on public.adle_controlled_graduation_receipts(child_id, canonical_word_id, completed_on);

-- ---------------------------------------------------------------------------
-- Scheduler transition facts. The existing schedule row remains typed current
-- state; these rows prove source, policy/state pin, revision, and submitted
-- reducer result without creating another learner outcome.
-- ---------------------------------------------------------------------------

create table if not exists public.adle_review_schedule_transition_events (
  id uuid primary key default gen_random_uuid(),
  schedule_word_id uuid not null
    references public.adle_review_schedule_words(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  schedule_policy_version text not null
    references public.adle_review_policy_versions(schedule_policy_version) on delete restrict,
  state_shape_version text not null,
  transition_kind text not null,
  source_review_outcome_event_id uuid
    references public.adle_review_outcome_events(id) on delete cascade,
  source_controlled_graduation_receipt_id uuid
    references public.adle_controlled_graduation_receipts(id) on delete cascade,
  cutover_approval_reference text,
  idempotency_key text not null,
  expected_state_revision bigint not null,
  applied_state_revision bigint not null,
  from_state jsonb not null,
  to_state jsonb not null,
  transition_reason text not null,
  reducer_version text not null,
  source_fingerprint text not null,
  occurred_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_schedule_transition_events_key_unique
    unique (schedule_word_id, idempotency_key),
  constraint adle_review_schedule_transition_events_revision_unique
    unique (schedule_word_id, applied_state_revision),
  constraint adle_review_schedule_transition_events_key_check
    check (btrim(idempotency_key) <> ''),
  constraint adle_review_schedule_transition_events_revision_check
    check (
      expected_state_revision >= 0
      and applied_state_revision = expected_state_revision + 1
    ),
  constraint adle_review_schedule_transition_events_state_check
    check (jsonb_typeof(from_state) = 'object' and jsonb_typeof(to_state) = 'object'),
  constraint adle_review_schedule_transition_events_reason_check
    check (btrim(transition_reason) <> '' and btrim(reducer_version) <> ''),
  constraint adle_review_schedule_transition_events_fingerprint_check
    check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_schedule_transition_events_kind_check
    check (transition_kind in (
      'REVIEW_OUTCOME_APPLIED',
      'CONTROLLED_PASS_APPLIED',
      'POLICY_CUTOVER_APPLIED'
    )),
  constraint adle_review_schedule_transition_events_source_shape_check
    check (
      (
        transition_kind = 'REVIEW_OUTCOME_APPLIED'
        and source_review_outcome_event_id is not null
        and source_controlled_graduation_receipt_id is null
        and cutover_approval_reference is null
        and occurred_at is not null
      )
      or
      (
        transition_kind = 'CONTROLLED_PASS_APPLIED'
        and source_review_outcome_event_id is null
        and source_controlled_graduation_receipt_id is not null
        and cutover_approval_reference is null
        and occurred_at is not null
      )
      or
      (
        transition_kind = 'POLICY_CUTOVER_APPLIED'
        and source_review_outcome_event_id is null
        and source_controlled_graduation_receipt_id is null
        and nullif(btrim(cutover_approval_reference), '') is not null
      )
    )
);

create unique index if not exists adle_review_schedule_transition_review_source_idx
  on public.adle_review_schedule_transition_events(source_review_outcome_event_id)
  where source_review_outcome_event_id is not null;
create unique index if not exists adle_review_schedule_transition_controlled_source_idx
  on public.adle_review_schedule_transition_events(source_controlled_graduation_receipt_id)
  where source_controlled_graduation_receipt_id is not null;
create index if not exists adle_review_schedule_transition_child_word_idx
  on public.adle_review_schedule_transition_events(child_id, canonical_word_id, created_at);

-- Update immutability is separate from deletion. Cascaded deletion remains a
-- deliberate parent/source lifecycle operation.
create or replace function public.prevent_adle_c2b2_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'adle_c2b2_row_is_update_immutable';
end;
$$;

drop trigger if exists adle_assignment_attempt_events_update_immutable
  on public.adle_assignment_attempt_events;
create trigger adle_assignment_attempt_events_update_immutable
before update on public.adle_assignment_attempt_events
for each row execute function public.prevent_adle_c2b2_update();

drop trigger if exists adle_controlled_graduation_receipts_update_immutable
  on public.adle_controlled_graduation_receipts;
create trigger adle_controlled_graduation_receipts_update_immutable
before update on public.adle_controlled_graduation_receipts
for each row execute function public.prevent_adle_c2b2_update();

drop trigger if exists adle_review_schedule_transition_events_update_immutable
  on public.adle_review_schedule_transition_events;
create trigger adle_review_schedule_transition_events_update_immutable
before update on public.adle_review_schedule_transition_events
for each row execute function public.prevent_adle_c2b2_update();

-- Persist one reducer/helper-produced controlled decision. This function does
-- not choose the decision: it verifies exact immutable voters, the governed
-- source contract, the supplied pure-helper result, and its fingerprint.
create or replace function public.persist_adle_controlled_graduation_receipt_c2b2(
  p_child_id uuid,
  p_daily_assignment_id uuid,
  p_canonical_word_id uuid,
  p_source_ref text,
  p_controlled_cycle_kind text,
  p_cover_write_attempt_event_id uuid,
  p_sentence_dictation_attempt_event_id uuid,
  p_later_clean_attempt_event_id uuid,
  p_decision text,
  p_decision_reason text,
  p_completed_on date,
  p_decided_at timestamptz,
  p_source_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_cover public.adle_assignment_attempt_events%rowtype;
  v_dictation public.adle_assignment_attempt_events%rowtype;
  v_later public.adle_assignment_attempt_events%rowtype;
  v_cover_position integer;
  v_dictation_position integer;
  v_later_position integer;
  v_existing public.adle_controlled_graduation_receipts%rowtype;
  v_receipt public.adle_controlled_graduation_receipts%rowtype;
  v_cover_outcome text;
  v_dictation_outcome text;
  v_later_outcome text;
  v_envelope jsonb;
  v_fingerprint text;
begin
  if nullif(btrim(p_source_ref), '') is null
    or coalesce(p_controlled_cycle_kind, '') not in ('GOVERNED_OR_PAIR', 'LATER_CLEAN_CONTROLLED_PRODUCTION')
    or coalesce(p_decision, '') not in ('PASS', 'NOT_PASSED')
    or nullif(btrim(p_decision_reason), '') is null
    or p_completed_on is null
    or p_decided_at is null
    or p_source_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'adle_c2b2_controlled_envelope_malformed'; end if;

  select * into v_assignment
  from public.daily_assignments assignment
  where assignment.id = p_daily_assignment_id
    and assignment.child_id = p_child_id
  for update;
  if not found or v_assignment.assignment_date <> p_completed_on then
    raise exception 'adle_c2b2_controlled_assignment_conflict';
  end if;
  if (p_decided_at at time zone 'Europe/London')::date <> p_completed_on then
    raise exception 'adle_c2b2_controlled_occurrence_time_conflict';
  end if;

  select * into v_existing
  from public.adle_controlled_graduation_receipts receipt
  where receipt.child_id = p_child_id
    and receipt.daily_assignment_id = p_daily_assignment_id
    and receipt.canonical_word_id = p_canonical_word_id
    and receipt.source_ref = p_source_ref
    and receipt.controlled_policy_version = 'ADLE_CONTROLLED_GRADUATION_V1_OR'
    and receipt.controlled_cycle_kind = p_controlled_cycle_kind;
  if found then
    if v_existing.source_fingerprint <> p_source_fingerprint then
      raise exception 'adle_c2b2_controlled_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'status', 'already_persisted',
      'receiptId', v_existing.id,
      'decision', v_existing.decision
    );
  end if;

  if p_controlled_cycle_kind = 'GOVERNED_OR_PAIR' then
    if p_cover_write_attempt_event_id is null
      or p_sentence_dictation_attempt_event_id is null
      or p_later_clean_attempt_event_id is not null
      or p_cover_write_attempt_event_id = p_sentence_dictation_attempt_event_id
    then raise exception 'adle_c2b2_controlled_pair_shape_conflict'; end if;

    -- Stable lock order prevents concurrent cross-role reuse of a voter.
    perform 1
    from public.adle_assignment_attempt_events attempt
    where attempt.id in (
      p_cover_write_attempt_event_id, p_sentence_dictation_attempt_event_id
    )
    order by attempt.id::text
    for update;

    select attempt.*
    into v_cover
    from public.adle_assignment_attempt_events attempt
    join public.assignment_items item on item.id = attempt.assignment_item_id
    where attempt.id = p_cover_write_attempt_event_id;
    select item.position into v_cover_position
    from public.assignment_items item
    where item.id = v_cover.assignment_item_id;
    select attempt.*
    into v_dictation
    from public.adle_assignment_attempt_events attempt
    join public.assignment_items item on item.id = attempt.assignment_item_id
    where attempt.id = p_sentence_dictation_attempt_event_id;
    select item.position into v_dictation_position
    from public.assignment_items item
    where item.id = v_dictation.assignment_item_id;

    if v_cover.id is null or v_dictation.id is null
      or v_cover.child_id <> p_child_id or v_dictation.child_id <> p_child_id
      or v_cover.parent_user_id <> v_assignment.parent_user_id
      or v_dictation.parent_user_id <> v_assignment.parent_user_id
      or v_cover.daily_assignment_id <> p_daily_assignment_id
      or v_dictation.daily_assignment_id <> p_daily_assignment_id
      or v_cover.canonical_word_id <> p_canonical_word_id
      or v_dictation.canonical_word_id <> p_canonical_word_id
      or not exists (
        select 1 from public.assignment_items item
        where item.id = v_cover.assignment_item_id
          and item.daily_assignment_id = p_daily_assignment_id
          and item.child_id = p_child_id
          and item.parent_user_id = v_assignment.parent_user_id
          and item.metadata->>'sectionKey' = 'lesson_production'
      )
      or not exists (
        select 1 from public.assignment_items item
        where item.id = v_dictation.assignment_item_id
          and item.daily_assignment_id = p_daily_assignment_id
          and item.child_id = p_child_id
          and item.parent_user_id = v_assignment.parent_user_id
          and item.metadata->>'sectionKey' = 'lesson_dictation'
      )
      or v_cover.attempt_kind <> 'lesson_production'
      or v_dictation.attempt_kind <> 'lesson_dictation'
      or v_cover.section_key <> 'lesson_production'
      or v_dictation.section_key <> 'lesson_dictation'
      or v_cover.evidence_class <> 'first_exposure_lesson_attempt'
      or v_dictation.evidence_class <> 'first_exposure_lesson_attempt'
      or v_cover.is_correct is null or v_dictation.is_correct is null
      or v_cover.source_ref not in (
        p_source_ref, p_source_ref || ':' || v_cover_position::text
      )
      or v_dictation.source_ref not in (
        p_source_ref, p_source_ref || ':' || v_dictation_position::text
      )
    then raise exception 'adle_c2b2_controlled_voter_lineage_conflict'; end if;

    if exists (
      select 1 from public.adle_controlled_graduation_receipts receipt
      where p_cover_write_attempt_event_id in (
          receipt.cover_write_attempt_event_id,
          receipt.sentence_dictation_attempt_event_id,
          receipt.later_clean_attempt_event_id
        )
        or p_sentence_dictation_attempt_event_id in (
          receipt.cover_write_attempt_event_id,
          receipt.sentence_dictation_attempt_event_id,
          receipt.later_clean_attempt_event_id
        )
    ) then raise exception 'adle_c2b2_controlled_voter_already_used'; end if;

    v_cover_outcome := case when v_cover.is_correct then 'PASS' else 'FAIL' end;
    v_dictation_outcome := case when v_dictation.is_correct then 'PASS' else 'FAIL' end;
  else
    if p_cover_write_attempt_event_id is not null
      or p_sentence_dictation_attempt_event_id is not null
      or p_later_clean_attempt_event_id is null
    then raise exception 'adle_c2b2_later_controlled_shape_conflict'; end if;

    perform 1 from public.adle_assignment_attempt_events attempt
    where attempt.id = p_later_clean_attempt_event_id for update;
    select attempt.*
    into v_later
    from public.adle_assignment_attempt_events attempt
    join public.assignment_items item on item.id = attempt.assignment_item_id
    where attempt.id = p_later_clean_attempt_event_id;
    select item.position into v_later_position
    from public.assignment_items item
    where item.id = v_later.assignment_item_id;

    if v_later.id is null
      or v_later.child_id <> p_child_id
      or v_later.parent_user_id <> v_assignment.parent_user_id
      or v_later.daily_assignment_id <> p_daily_assignment_id
      or v_later.canonical_word_id <> p_canonical_word_id
      or not exists (
        select 1 from public.assignment_items item
        where item.id = v_later.assignment_item_id
          and item.daily_assignment_id = p_daily_assignment_id
          and item.child_id = p_child_id
          and item.parent_user_id = v_assignment.parent_user_id
          and item.metadata->>'sectionKey' = v_later.attempt_kind
      )
      or v_later.attempt_kind not in ('lesson_production', 'lesson_dictation')
      or v_later.section_key <> v_later.attempt_kind
      or v_later.evidence_class <> 'first_exposure_lesson_attempt'
      or v_later.is_correct is null
      or v_later.source_ref not in (
        p_source_ref, p_source_ref || ':' || v_later_position::text
      )
    then raise exception 'adle_c2b2_later_controlled_lineage_conflict'; end if;

    if exists (
      select 1 from public.adle_controlled_graduation_receipts receipt
      where p_later_clean_attempt_event_id in (
        receipt.cover_write_attempt_event_id,
        receipt.sentence_dictation_attempt_event_id,
        receipt.later_clean_attempt_event_id
      )
    ) then raise exception 'adle_c2b2_controlled_voter_already_used'; end if;
    v_later_outcome := case when v_later.is_correct then 'PASS' else 'FAIL' end;
  end if;

  v_envelope := jsonb_build_object(
    'childId', p_child_id,
    'dailyAssignmentId', p_daily_assignment_id,
    'canonicalWordId', p_canonical_word_id,
    'sourceRef', p_source_ref,
    'controlledPolicyVersion', 'ADLE_CONTROLLED_GRADUATION_V1_OR',
    'controlledCycleKind', p_controlled_cycle_kind,
    'coverWriteAttemptEventId', p_cover_write_attempt_event_id,
    'coverWriteOutcome', v_cover_outcome,
    'sentenceDictationAttemptEventId', p_sentence_dictation_attempt_event_id,
    'sentenceDictationOutcome', v_dictation_outcome,
    'laterCleanAttemptEventId', p_later_clean_attempt_event_id,
    'laterCleanOutcome', v_later_outcome,
    'decision', p_decision,
    'decisionReason', p_decision_reason,
    'completedOn', p_completed_on,
    'decidedAt', p_decided_at
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  if v_fingerprint <> p_source_fingerprint then
    raise exception 'adle_c2b2_controlled_fingerprint_conflict';
  end if;

  insert into public.adle_controlled_graduation_receipts (
    child_id, daily_assignment_id, canonical_word_id, source_ref,
    controlled_policy_version, controlled_cycle_kind,
    cover_write_attempt_event_id, cover_write_outcome,
    sentence_dictation_attempt_event_id, sentence_dictation_outcome,
    later_clean_attempt_event_id, later_clean_outcome,
    decision, decision_reason, completed_on, decided_at, source_fingerprint
  ) values (
    p_child_id, p_daily_assignment_id, p_canonical_word_id, p_source_ref,
    'ADLE_CONTROLLED_GRADUATION_V1_OR', p_controlled_cycle_kind,
    p_cover_write_attempt_event_id, v_cover_outcome,
    p_sentence_dictation_attempt_event_id, v_dictation_outcome,
    p_later_clean_attempt_event_id, v_later_outcome,
    p_decision, p_decision_reason, p_completed_on, p_decided_at,
    p_source_fingerprint
  ) returning * into v_receipt;

  return jsonb_build_object(
    'status', 'persisted',
    'receiptId', v_receipt.id,
    'decision', v_receipt.decision
  );
end;
$$;

-- Persist exactly one target reducer result with optimistic concurrency. The
-- RPC accepts the reducer-produced to_state; it has no educational branches.
create or replace function public.persist_adle_review_schedule_transition_c2b2(
  p_schedule_word_id uuid,
  p_transition_kind text,
  p_source_review_outcome_event_id uuid,
  p_source_controlled_graduation_receipt_id uuid,
  p_idempotency_key text,
  p_expected_state_revision bigint,
  p_from_state jsonb,
  p_to_state jsonb,
  p_transition_reason text,
  p_reducer_version text,
  p_occurred_at timestamptz,
  p_source_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_word public.adle_review_schedule_words%rowtype;
  v_existing public.adle_review_schedule_transition_events%rowtype;
  v_outcome public.adle_review_outcome_events%rowtype;
  v_controlled public.adle_controlled_graduation_receipts%rowtype;
  v_current_state jsonb;
  v_envelope jsonb;
  v_fingerprint text;
  v_event public.adle_review_schedule_transition_events%rowtype;
begin
  if coalesce(p_transition_kind, '') not in ('REVIEW_OUTCOME_APPLIED', 'CONTROLLED_PASS_APPLIED')
    or nullif(btrim(p_idempotency_key), '') is null
    or p_expected_state_revision < 0
    or jsonb_typeof(p_from_state) <> 'object'
    or jsonb_typeof(p_to_state) <> 'object'
    or nullif(btrim(p_transition_reason), '') is null
    or nullif(btrim(p_reducer_version), '') is null
    or p_occurred_at is null
    or p_source_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'adle_c2b2_transition_envelope_malformed'; end if;

  select * into v_word
  from public.adle_review_schedule_words word
  where word.id = p_schedule_word_id
  for update;
  if not found then raise exception 'adle_c2b2_schedule_word_missing'; end if;

  select * into v_existing
  from public.adle_review_schedule_transition_events event
  where event.schedule_word_id = p_schedule_word_id
    and event.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source_fingerprint <> p_source_fingerprint then
      raise exception 'adle_c2b2_transition_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'status', 'already_applied',
      'transitionEventId', v_existing.id,
      'appliedStateRevision', v_existing.applied_state_revision
    );
  end if;

  if v_word.word_schedule_policy_version <> 'ADLE_SPACED_REVIEW_REGRESSION_V1'
    or v_word.word_schedule_version <> 'adle_review_per_word_schedule_v2'
    or v_word.row_status <> 'active'
  then raise exception 'adle_c2b2_policy_state_pair_unsupported'; end if;
  if v_word.word_schedule_transition_count <> p_expected_state_revision then
    raise exception 'adle_c2b2_stale_state_revision';
  end if;

  v_current_state := jsonb_build_object(
    'stateShapeVersion', v_word.word_schedule_version,
    'schedulePolicyVersion', v_word.word_schedule_policy_version,
    'membershipStatus', v_word.membership_status,
    'wordIntervalIndex', v_word.word_interval_index,
    'wordNextDueOn', v_word.word_next_due_on,
    'consecutiveIndependentFailures', v_word.consecutive_independent_failures,
    'failureEpisodeId', v_word.failure_episode_id,
    'preRetirementCheckDueOn', v_word.pre_retirement_check_due_on,
    'last28DayReviewOn', v_word.last_28_day_review_on,
    'wordLastReviewCompletedOn', v_word.word_last_review_completed_on,
    'wordLastReviewCompletedAt', v_word.word_last_review_completed_at
  );
  if p_from_state <> v_current_state then
    raise exception 'adle_c2b2_from_state_conflict';
  end if;

  if p_to_state - array[
      'stateShapeVersion', 'schedulePolicyVersion', 'membershipStatus',
      'wordIntervalIndex', 'wordNextDueOn',
      'consecutiveIndependentFailures', 'failureEpisodeId',
      'preRetirementCheckDueOn', 'last28DayReviewOn',
      'wordLastReviewCompletedOn', 'wordLastReviewCompletedAt'
    ]::text[] <> '{}'::jsonb
    or p_to_state->>'stateShapeVersion' <> 'adle_review_per_word_schedule_v2'
    or p_to_state->>'schedulePolicyVersion' <> 'ADLE_SPACED_REVIEW_REGRESSION_V1'
    or coalesce(p_to_state->>'membershipStatus', '') not in (
      'scheduled', 'next_day_recovery', 'controlled_reacquisition',
      'awaiting_pre_retirement_check', 'retired'
    )
    or (p_to_state->>'wordIntervalIndex') !~ '^[0-5]$'
    or (p_to_state->>'consecutiveIndependentFailures') !~ '^[0-9]+$'
  then raise exception 'adle_c2b2_to_state_shape_conflict'; end if;

  if p_transition_kind = 'REVIEW_OUTCOME_APPLIED' then
    if p_source_review_outcome_event_id is null
      or p_source_controlled_graduation_receipt_id is not null
    then raise exception 'adle_c2b2_transition_source_shape_conflict'; end if;
    select * into v_outcome
    from public.adle_review_outcome_events outcome
    where outcome.id = p_source_review_outcome_event_id
    for update;
    if not found
      or v_outcome.child_id <> v_word.child_id
      or v_outcome.canonical_word_id <> v_word.canonical_word_id
      or v_outcome.schedule_word_id <> v_word.id
      or v_outcome.schedule_policy_version <> v_word.word_schedule_policy_version
      or v_outcome.word_schedule_version <> v_word.word_schedule_version
      or v_outcome.completed_at is distinct from p_occurred_at
    then raise exception 'adle_c2b2_review_outcome_lineage_conflict'; end if;
  else
    if p_source_review_outcome_event_id is not null
      or p_source_controlled_graduation_receipt_id is null
    then raise exception 'adle_c2b2_transition_source_shape_conflict'; end if;
    select * into v_controlled
    from public.adle_controlled_graduation_receipts receipt
    where receipt.id = p_source_controlled_graduation_receipt_id
    for update;
    if not found
      or v_controlled.child_id <> v_word.child_id
      or v_controlled.canonical_word_id <> v_word.canonical_word_id
      or v_controlled.decision <> 'PASS'
      or v_controlled.controlled_policy_version <> 'ADLE_CONTROLLED_GRADUATION_V1_OR'
      or v_controlled.decided_at is distinct from p_occurred_at
    then raise exception 'adle_c2b2_controlled_receipt_lineage_conflict'; end if;
  end if;

  v_envelope := jsonb_build_object(
    'scheduleWordId', p_schedule_word_id,
    'transitionKind', p_transition_kind,
    'sourceReviewOutcomeEventId', p_source_review_outcome_event_id,
    'sourceControlledGraduationReceiptId', p_source_controlled_graduation_receipt_id,
    'idempotencyKey', p_idempotency_key,
    'expectedStateRevision', p_expected_state_revision,
    'fromState', p_from_state,
    'toState', p_to_state,
    'transitionReason', p_transition_reason,
    'reducerVersion', p_reducer_version,
    'occurredAt', p_occurred_at
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  if v_fingerprint <> p_source_fingerprint then
    raise exception 'adle_c2b2_transition_fingerprint_conflict';
  end if;

  perform set_config('adle.r6_per_word_writer', 'on', true);
  update public.adle_review_schedule_words word set
    membership_status = p_to_state->>'membershipStatus',
    word_interval_index = (p_to_state->>'wordIntervalIndex')::integer,
    word_next_due_on = nullif(p_to_state->>'wordNextDueOn', '')::date,
    consecutive_independent_failures =
      (p_to_state->>'consecutiveIndependentFailures')::smallint,
    failure_episode_id = nullif(p_to_state->>'failureEpisodeId', '')::uuid,
    pre_retirement_check_due_on =
      nullif(p_to_state->>'preRetirementCheckDueOn', '')::date,
    last_28_day_review_on = nullif(p_to_state->>'last28DayReviewOn', '')::date,
    word_last_review_completed_on =
      nullif(p_to_state->>'wordLastReviewCompletedOn', '')::date,
    word_last_review_completed_at =
      nullif(p_to_state->>'wordLastReviewCompletedAt', '')::timestamptz,
    catch_up_stage = 0,
    next_retest_due_on = null,
    failed_review_on = null,
    word_schedule_transition_count = word.word_schedule_transition_count + 1,
    updated_at = timezone('utc', now())
  where word.id = p_schedule_word_id
    and word.word_schedule_transition_count = p_expected_state_revision;
  if not found then raise exception 'adle_c2b2_stale_state_revision'; end if;

  insert into public.adle_review_schedule_transition_events (
    schedule_word_id, child_id, canonical_word_id,
    schedule_policy_version, state_shape_version, transition_kind,
    source_review_outcome_event_id,
    source_controlled_graduation_receipt_id,
    idempotency_key, expected_state_revision, applied_state_revision,
    from_state, to_state, transition_reason, reducer_version,
    source_fingerprint, occurred_at
  ) values (
    v_word.id, v_word.child_id, v_word.canonical_word_id,
    v_word.word_schedule_policy_version, v_word.word_schedule_version,
    p_transition_kind, p_source_review_outcome_event_id,
    p_source_controlled_graduation_receipt_id,
    p_idempotency_key, p_expected_state_revision,
    p_expected_state_revision + 1,
    p_from_state, p_to_state, p_transition_reason, p_reducer_version,
    p_source_fingerprint, p_occurred_at
  ) returning * into v_event;

  return jsonb_build_object(
    'status', 'applied',
    'transitionEventId', v_event.id,
    'appliedStateRevision', v_event.applied_state_revision
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Security and documentation.
-- ---------------------------------------------------------------------------

alter table public.adle_controlled_graduation_receipts enable row level security;
alter table public.adle_review_schedule_transition_events enable row level security;

revoke all on table public.adle_controlled_graduation_receipts
  from public, anon, authenticated;
revoke all on table public.adle_review_schedule_transition_events
  from public, anon, authenticated;
revoke all on table public.adle_controlled_graduation_receipts from service_role;
revoke all on table public.adle_review_schedule_transition_events from service_role;
grant select on table public.adle_controlled_graduation_receipts to service_role;
grant select on table public.adle_review_schedule_transition_events to service_role;

revoke all on function public.persist_adle_controlled_graduation_receipt_c2b2(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, date,
  timestamptz, text
) from public, anon, authenticated;
revoke all on function public.persist_adle_review_schedule_transition_c2b2(
  uuid, text, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  timestamptz, text
) from public, anon, authenticated;
grant execute on function public.persist_adle_controlled_graduation_receipt_c2b2(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text, text, date,
  timestamptz, text
) to service_role;
grant execute on function public.persist_adle_review_schedule_transition_c2b2(
  uuid, text, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  timestamptz, text
) to service_role;

comment on column public.adle_review_policy_versions.is_default_for_new_schedules is
  'Creation default only. Never execution authority for an already-pinned schedule word.';
comment on column public.adle_review_policy_versions.transition_family is
  'Registry configuration family. Exact per-word policy and state-shape pins own reducer dispatch.';
comment on column public.adle_review_policy_versions.due_anchor is
  'Approved V1 due anchor: ROLLING_FROM_COMPLETION.';
comment on column public.adle_review_schedule_words.consecutive_independent_failures is
  'Target/v2 unresolved independent failure lineage count; NULL for legacy/v1 rows.';
comment on column public.adle_review_schedule_words.failure_episode_id is
  'Target/v2 first failed immutable Review outcome in the unresolved sequence; route membership is stored separately.';
comment on table public.adle_controlled_graduation_receipts is
  'Update-immutable controlled-decision facts. Deletion follows governed child/assignment/attempt lifecycle.';
comment on table public.adle_review_schedule_transition_events is
  'Update-immutable scheduler transition facts produced by TypeScript reducers. Deletion follows governed parent/source lifecycle.';
comment on function public.persist_adle_review_schedule_transition_c2b2(
  uuid, text, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  timestamptz, text
) is
  'Algorithm-free target/v2 compare-and-swap persistence. Does not consult registry active/default flags or implement scheduler transitions.';

commit;
