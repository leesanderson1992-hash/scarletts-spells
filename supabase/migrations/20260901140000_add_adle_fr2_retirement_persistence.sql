-- ADLE FR.2: additive persistence for the approved pure final-rung
-- retirement authority. FR.1 decides; this migration verifies and persists
-- the supplied decision. It does not activate final-rung runtime behaviour.

begin;

alter table public.adle_review_schedule_words
  add column if not exists pre_retirement_check_outcome_event_id uuid;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_pre_retirement_outcome_fkey;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_pre_retirement_outcome_fkey
  foreign key (pre_retirement_check_outcome_event_id)
  references public.adle_review_outcome_events(id)
  on delete no action
  deferrable initially deferred;

alter table public.adle_review_schedule_words
  drop constraint if exists adle_review_schedule_words_retirement_lineage_check;
alter table public.adle_review_schedule_words
  add constraint adle_review_schedule_words_retirement_lineage_check
  check (
    (
      word_schedule_version is distinct from 'adle_review_per_word_schedule_v2'
      and pre_retirement_check_outcome_event_id is null
    )
    or
    (
      word_schedule_version = 'adle_review_per_word_schedule_v2'
      and (
        membership_status <> 'awaiting_pre_retirement_check'
        or pre_retirement_check_outcome_event_id is null
      )
      and (
        pre_retirement_check_outcome_event_id is null
        or pre_retirement_check_due_on is null
      )
    )
  );

create index if not exists adle_review_schedule_words_retirement_outcome_idx
  on public.adle_review_schedule_words(pre_retirement_check_outcome_event_id)
  where pre_retirement_check_outcome_event_id is not null;

create table if not exists public.adle_review_retirement_decision_receipts (
  id uuid primary key default gen_random_uuid(),
  schedule_word_id uuid not null
    references public.adle_review_schedule_words(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  schedule_policy_version text not null
    references public.adle_review_policy_versions(schedule_policy_version) on delete restrict,
  state_shape_version text not null,
  retirement_policy_version text not null,
  retirement_state_version text not null,
  source_review_outcome_event_id uuid not null,
  qualifying_authentic_use_event_id uuid,
  pre_retirement_check_outcome_event_id uuid,
  decision text not null,
  decision_reason text not null,
  scheduler_reducer_input_state jsonb,
  schedule_transition_event_id uuid not null,
  idempotency_key text not null,
  expected_state_revision bigint not null,
  applied_state_revision bigint not null,
  source_fingerprint text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_retirement_receipts_source_outcome_fkey
    foreign key (source_review_outcome_event_id)
    references public.adle_review_outcome_events(id)
    on delete no action deferrable initially deferred,
  constraint adle_review_retirement_receipts_authentic_use_fkey
    foreign key (qualifying_authentic_use_event_id)
    references public.adle_authentic_use_events(id)
    on delete no action deferrable initially deferred,
  constraint adle_review_retirement_receipts_check_outcome_fkey
    foreign key (pre_retirement_check_outcome_event_id)
    references public.adle_review_outcome_events(id)
    on delete no action deferrable initially deferred,
  constraint adle_review_retirement_receipts_transition_fkey
    foreign key (schedule_transition_event_id)
    references public.adle_review_schedule_transition_events(id)
    on delete no action deferrable initially deferred,
  constraint adle_review_retirement_receipts_idempotency_unique
    unique (schedule_word_id, idempotency_key),
  constraint adle_review_retirement_receipts_source_unique
    unique (source_review_outcome_event_id),
  constraint adle_review_retirement_receipts_transition_unique
    unique (schedule_transition_event_id),
  constraint adle_review_retirement_receipts_revision_unique
    unique (schedule_word_id, applied_state_revision),
  constraint adle_review_retirement_receipts_policy_check
    check (
      schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
      and state_shape_version = 'adle_review_per_word_schedule_v2'
      and retirement_policy_version = 'ADLE_FINAL_RUNG_RETIREMENT_V1'
      and retirement_state_version = 'adle_final_rung_retirement_v1'
    ),
  constraint adle_review_retirement_receipts_decision_check
    check (decision in (
      'AWAIT_PRE_RETIREMENT_CHECK',
      'CONTINUE_V2_RECOVERY',
      'RETIRE'
    )),
  constraint adle_review_retirement_receipts_reason_check
    check (decision_reason in (
      'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE',
      'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK',
      'PRE_RETIREMENT_CHECK_PASS_RETIRED',
      'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY',
      'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
    )),
  constraint adle_review_retirement_receipts_revision_check
    check (
      expected_state_revision >= 0
      and applied_state_revision = expected_state_revision + 1
    ),
  constraint adle_review_retirement_receipts_key_check
    check (btrim(idempotency_key) <> ''),
  constraint adle_review_retirement_receipts_fingerprint_check
    check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint adle_review_retirement_receipts_adapter_state_check
    check (
      scheduler_reducer_input_state is null
      or jsonb_typeof(scheduler_reducer_input_state) = 'object'
    ),
  constraint adle_review_retirement_receipts_shape_check
    check (
      (
        decision = 'RETIRE'
        and decision_reason = 'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE'
        and qualifying_authentic_use_event_id is not null
        and pre_retirement_check_outcome_event_id is null
        and scheduler_reducer_input_state is null
      )
      or
      (
        decision = 'AWAIT_PRE_RETIREMENT_CHECK'
        and decision_reason = 'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK'
        and qualifying_authentic_use_event_id is null
        and pre_retirement_check_outcome_event_id is null
        and scheduler_reducer_input_state is null
      )
      or
      (
        decision = 'RETIRE'
        and decision_reason = 'PRE_RETIREMENT_CHECK_PASS_RETIRED'
        and qualifying_authentic_use_event_id is null
        and pre_retirement_check_outcome_event_id = source_review_outcome_event_id
        and scheduler_reducer_input_state is null
      )
      or
      (
        decision = 'CONTINUE_V2_RECOVERY'
        and decision_reason = 'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY'
        and qualifying_authentic_use_event_id is null
        and pre_retirement_check_outcome_event_id = source_review_outcome_event_id
        and scheduler_reducer_input_state is not null
      )
      or
      (
        decision = 'RETIRE'
        and decision_reason = 'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
        and qualifying_authentic_use_event_id is null
        and pre_retirement_check_outcome_event_id is not null
        and pre_retirement_check_outcome_event_id <> source_review_outcome_event_id
        and scheduler_reducer_input_state is null
      )
    )
);

create index if not exists adle_review_retirement_receipts_child_word_idx
  on public.adle_review_retirement_decision_receipts(
    child_id, canonical_word_id, created_at
  );
create index if not exists adle_review_retirement_receipts_check_outcome_idx
  on public.adle_review_retirement_decision_receipts(
    pre_retirement_check_outcome_event_id
  ) where pre_retirement_check_outcome_event_id is not null;

drop trigger if exists adle_review_retirement_receipts_update_immutable
  on public.adle_review_retirement_decision_receipts;
create trigger adle_review_retirement_receipts_update_immutable
before update on public.adle_review_retirement_decision_receipts
for each row execute function public.prevent_adle_c2b2_update();

-- Persist one supplied FR.1 decision atomically with the existing C2B.2
-- scheduler CAS transition. This function verifies identities, revisions,
-- envelope shape and fingerprints; it contains no retirement or scheduler
-- decision table.
create or replace function public.persist_adle_final_rung_retirement_decision_fr2(
  p_schedule_word_id uuid,
  p_source_review_outcome_event_id uuid,
  p_qualifying_authentic_use_event_id uuid,
  p_pre_retirement_check_outcome_event_id uuid,
  p_expected_pre_retirement_check_outcome_event_id uuid,
  p_idempotency_key text,
  p_expected_state_revision bigint,
  p_from_state jsonb,
  p_to_state jsonb,
  p_decision text,
  p_decision_reason text,
  p_scheduler_reducer_input_state jsonb,
  p_occurred_at timestamptz,
  p_transition_source_fingerprint text,
  p_retirement_source_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_word public.adle_review_schedule_words%rowtype;
  v_existing public.adle_review_retirement_decision_receipts%rowtype;
  v_outcome public.adle_review_outcome_events%rowtype;
  v_authentic public.adle_authentic_use_events%rowtype;
  v_check public.adle_review_outcome_events%rowtype;
  v_transition_result jsonb;
  v_transition public.adle_review_schedule_transition_events%rowtype;
  v_receipt public.adle_review_retirement_decision_receipts%rowtype;
  v_envelope jsonb;
  v_fingerprint text;
begin
  if p_schedule_word_id is null
    or p_source_review_outcome_event_id is null
    or nullif(btrim(p_idempotency_key), '') is null
    or p_expected_state_revision < 0
    or jsonb_typeof(p_from_state) <> 'object'
    or jsonb_typeof(p_to_state) <> 'object'
    or coalesce(p_decision, '') not in (
      'AWAIT_PRE_RETIREMENT_CHECK', 'CONTINUE_V2_RECOVERY', 'RETIRE'
    )
    or coalesce(p_decision_reason, '') not in (
      'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE',
      'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK',
      'PRE_RETIREMENT_CHECK_PASS_RETIRED',
      'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY',
      'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
    )
    or (
      p_scheduler_reducer_input_state is not null
      and jsonb_typeof(p_scheduler_reducer_input_state) <> 'object'
    )
    or p_occurred_at is null
    or p_transition_source_fingerprint !~ '^[a-f0-9]{64}$'
    or p_retirement_source_fingerprint !~ '^[a-f0-9]{64}$'
  then raise exception 'adle_fr2_retirement_envelope_malformed'; end if;

  select * into v_word
  from public.adle_review_schedule_words word
  where word.id = p_schedule_word_id
  for update;
  if not found then raise exception 'adle_fr2_schedule_word_missing'; end if;

  select * into v_existing
  from public.adle_review_retirement_decision_receipts receipt
  where receipt.schedule_word_id = p_schedule_word_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source_fingerprint <> p_retirement_source_fingerprint
    then raise exception 'adle_fr2_retirement_idempotency_conflict'; end if;
    return jsonb_build_object(
      'status', 'already_persisted',
      'retirementReceiptId', v_existing.id,
      'transitionEventId', v_existing.schedule_transition_event_id,
      'appliedStateRevision', v_existing.applied_state_revision
    );
  end if;

  if v_word.word_schedule_policy_version <> 'ADLE_SPACED_REVIEW_REGRESSION_V1'
    or v_word.word_schedule_version <> 'adle_review_per_word_schedule_v2'
    or v_word.row_status <> 'active'
  then raise exception 'adle_fr2_policy_state_pair_unsupported'; end if;
  if v_word.word_schedule_transition_count <> p_expected_state_revision
  then raise exception 'adle_fr2_stale_state_revision'; end if;
  if v_word.pre_retirement_check_outcome_event_id
      is distinct from p_expected_pre_retirement_check_outcome_event_id
  then raise exception 'adle_fr2_check_lineage_conflict'; end if;

  select * into v_outcome
  from public.adle_review_outcome_events outcome
  where outcome.id = p_source_review_outcome_event_id
  for share;
  if not found
    or v_outcome.child_id <> v_word.child_id
    or v_outcome.canonical_word_id <> v_word.canonical_word_id
    or v_outcome.schedule_word_id <> v_word.id
    or v_outcome.schedule_policy_version <> v_word.word_schedule_policy_version
    or v_outcome.word_schedule_version <> v_word.word_schedule_version
    or v_outcome.completed_at is distinct from p_occurred_at
  then raise exception 'adle_fr2_review_outcome_lineage_conflict'; end if;

  if p_qualifying_authentic_use_event_id is not null then
    select * into v_authentic
    from public.adle_authentic_use_events evidence
    where evidence.id = p_qualifying_authentic_use_event_id
    for share;
    if not found
      or v_authentic.child_id <> v_word.child_id
      or v_authentic.canonical_word_id <> v_word.canonical_word_id
      or v_authentic.row_status <> 'active'
      or v_authentic.parent_verified is not true
      or v_authentic.use_kind <> 'authentic_correct_use'
      or v_authentic.provenance_kind
        <> 'independent_or_parent_verified_application'
      or v_word.last_28_day_review_on is null
      or v_authentic.occurred_on < v_word.last_28_day_review_on
      or v_authentic.occurred_on > v_outcome.occurred_on
    then raise exception 'adle_fr2_authentic_use_lineage_conflict'; end if;
  end if;

  if p_pre_retirement_check_outcome_event_id is not null then
    select * into v_check
    from public.adle_review_outcome_events outcome
    where outcome.id = p_pre_retirement_check_outcome_event_id
    for share;
    if not found
      or v_check.child_id <> v_word.child_id
      or v_check.canonical_word_id <> v_word.canonical_word_id
      or v_check.schedule_word_id <> v_word.id
      or v_check.schedule_policy_version <> v_word.word_schedule_policy_version
      or v_check.word_schedule_version <> v_word.word_schedule_version
      or v_check.due_kind <> 'pre_retirement_check'
      or v_check.event_type not in (
        'retirement_check_pass', 'retirement_check_fail'
      )
    then raise exception 'adle_fr2_pre_retirement_check_lineage_conflict'; end if;
  end if;

  if (
      p_decision_reason = 'DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE'
      and (
        p_decision <> 'RETIRE'
        or p_qualifying_authentic_use_event_id is null
        or p_pre_retirement_check_outcome_event_id is not null
        or p_expected_pre_retirement_check_outcome_event_id is not null
        or p_scheduler_reducer_input_state is not null
        or v_outcome.event_type <> 'review_pass'
        or v_outcome.original_result <> 'success'
        or v_outcome.due_kind not in ('scheduled_review', 'next_day_recovery')
        or v_outcome.frozen_interval_index <> 5
      )
    ) or (
      p_decision_reason = 'DAY_56_PASS_TO_PRE_RETIREMENT_CHECK'
      and (
        p_decision <> 'AWAIT_PRE_RETIREMENT_CHECK'
        or p_qualifying_authentic_use_event_id is not null
        or p_pre_retirement_check_outcome_event_id is not null
        or p_expected_pre_retirement_check_outcome_event_id is not null
        or p_scheduler_reducer_input_state is not null
        or v_outcome.event_type <> 'review_pass'
        or v_outcome.original_result <> 'success'
        or v_outcome.due_kind not in ('scheduled_review', 'next_day_recovery')
        or v_outcome.frozen_interval_index <> 5
      )
    ) or (
      p_decision_reason = 'PRE_RETIREMENT_CHECK_PASS_RETIRED'
      and (
        p_decision <> 'RETIRE'
        or p_qualifying_authentic_use_event_id is not null
        or p_pre_retirement_check_outcome_event_id
          is distinct from p_source_review_outcome_event_id
        or p_expected_pre_retirement_check_outcome_event_id is not null
        or p_scheduler_reducer_input_state is not null
        or v_outcome.event_type <> 'retirement_check_pass'
        or v_outcome.original_result <> 'success'
        or v_outcome.due_kind <> 'pre_retirement_check'
      )
    ) or (
      p_decision_reason = 'PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY'
      and (
        p_decision <> 'CONTINUE_V2_RECOVERY'
        or p_qualifying_authentic_use_event_id is not null
        or p_pre_retirement_check_outcome_event_id
          is distinct from p_source_review_outcome_event_id
        or p_expected_pre_retirement_check_outcome_event_id is not null
        or p_scheduler_reducer_input_state is null
        or v_outcome.event_type <> 'retirement_check_fail'
        or v_outcome.original_result <> 'failure'
        or v_outcome.due_kind <> 'pre_retirement_check'
      )
    ) or (
      p_decision_reason = 'POST_CHECK_FINAL_RUNG_PASS_RETIRED'
      and (
        p_decision <> 'RETIRE'
        or p_qualifying_authentic_use_event_id is not null
        or p_pre_retirement_check_outcome_event_id is null
        or p_pre_retirement_check_outcome_event_id
          is distinct from p_expected_pre_retirement_check_outcome_event_id
        or p_pre_retirement_check_outcome_event_id
          = p_source_review_outcome_event_id
        or p_scheduler_reducer_input_state is not null
        or v_check.event_type <> 'retirement_check_fail'
        or v_outcome.event_type <> 'review_pass'
        or v_outcome.original_result <> 'success'
        or v_outcome.due_kind not in ('scheduled_review', 'next_day_recovery')
        or v_outcome.frozen_interval_index <> 5
      )
    )
  then raise exception 'adle_fr2_retirement_decision_shape_conflict'; end if;

  v_transition_result := public.persist_adle_review_schedule_transition_c2b2(
    p_schedule_word_id,
    'REVIEW_OUTCOME_APPLIED',
    p_source_review_outcome_event_id,
    null,
    p_idempotency_key,
    p_expected_state_revision,
    p_from_state,
    p_to_state,
    p_decision_reason,
    'ADLE_FINAL_RUNG_RETIREMENT_V1',
    p_occurred_at,
    p_transition_source_fingerprint
  );
  if v_transition_result->>'status' <> 'applied'
  then raise exception 'adle_fr2_transition_preexisting_without_receipt'; end if;

  select * into v_transition
  from public.adle_review_schedule_transition_events event
  where event.id = (v_transition_result->>'transitionEventId')::uuid;
  if not found
    or v_transition.schedule_word_id <> v_word.id
    or v_transition.source_review_outcome_event_id <> v_outcome.id
    or v_transition.expected_state_revision <> p_expected_state_revision
    or v_transition.applied_state_revision <> p_expected_state_revision + 1
    or v_transition.source_fingerprint <> p_transition_source_fingerprint
  then raise exception 'adle_fr2_transition_lineage_conflict'; end if;

  perform set_config('adle.r6_per_word_writer', 'on', true);
  update public.adle_review_schedule_words word set
    pre_retirement_check_outcome_event_id =
      p_pre_retirement_check_outcome_event_id,
    updated_at = timezone('utc', now())
  where word.id = p_schedule_word_id
    and word.word_schedule_transition_count = p_expected_state_revision + 1
    and word.pre_retirement_check_outcome_event_id
      is not distinct from p_expected_pre_retirement_check_outcome_event_id;
  if not found then raise exception 'adle_fr2_stale_state_revision'; end if;

  v_envelope := jsonb_build_object(
    'scheduleWordId', p_schedule_word_id,
    'sourceReviewOutcomeEventId', p_source_review_outcome_event_id,
    'qualifyingAuthenticUseEventId', p_qualifying_authentic_use_event_id,
    'preRetirementCheckOutcomeEventId',
      p_pre_retirement_check_outcome_event_id,
    'expectedPreRetirementCheckOutcomeEventId',
      p_expected_pre_retirement_check_outcome_event_id,
    'idempotencyKey', p_idempotency_key,
    'schedulePolicyVersion', 'ADLE_SPACED_REVIEW_REGRESSION_V1',
    'stateShapeVersion', 'adle_review_per_word_schedule_v2',
    'retirementPolicyVersion', 'ADLE_FINAL_RUNG_RETIREMENT_V1',
    'retirementStateVersion', 'adle_final_rung_retirement_v1',
    'decision', p_decision,
    'decisionReason', p_decision_reason,
    'schedulerReducerInputState', p_scheduler_reducer_input_state,
    'expectedStateRevision', p_expected_state_revision,
    'appliedStateRevision', p_expected_state_revision + 1,
    'transitionSourceFingerprint', p_transition_source_fingerprint,
    'occurredAt', p_occurred_at
  );
  v_fingerprint := public.adle_canonical_json_sha256_v1(v_envelope);
  if v_fingerprint <> p_retirement_source_fingerprint
  then raise exception 'adle_fr2_retirement_fingerprint_conflict'; end if;

  insert into public.adle_review_retirement_decision_receipts (
    schedule_word_id, child_id, canonical_word_id,
    schedule_policy_version, state_shape_version,
    retirement_policy_version, retirement_state_version,
    source_review_outcome_event_id, qualifying_authentic_use_event_id,
    pre_retirement_check_outcome_event_id, decision, decision_reason,
    scheduler_reducer_input_state, schedule_transition_event_id,
    idempotency_key, expected_state_revision, applied_state_revision,
    source_fingerprint, occurred_at
  ) values (
    v_word.id, v_word.child_id, v_word.canonical_word_id,
    v_word.word_schedule_policy_version, v_word.word_schedule_version,
    'ADLE_FINAL_RUNG_RETIREMENT_V1', 'adle_final_rung_retirement_v1',
    v_outcome.id, p_qualifying_authentic_use_event_id,
    p_pre_retirement_check_outcome_event_id, p_decision, p_decision_reason,
    p_scheduler_reducer_input_state, v_transition.id,
    p_idempotency_key, p_expected_state_revision,
    p_expected_state_revision + 1, p_retirement_source_fingerprint,
    p_occurred_at
  ) returning * into v_receipt;

  return jsonb_build_object(
    'status', 'persisted',
    'retirementReceiptId', v_receipt.id,
    'transitionEventId', v_transition.id,
    'appliedStateRevision', v_receipt.applied_state_revision
  );
end;
$$;

alter table public.adle_review_retirement_decision_receipts
  enable row level security;

revoke all on table public.adle_review_retirement_decision_receipts
  from public, anon, authenticated;
revoke all on table public.adle_review_retirement_decision_receipts
  from service_role;
grant select on table public.adle_review_retirement_decision_receipts
  to service_role;

revoke all on function public.persist_adle_final_rung_retirement_decision_fr2(
  uuid, uuid, uuid, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  jsonb, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.persist_adle_final_rung_retirement_decision_fr2(
  uuid, uuid, uuid, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  jsonb, timestamptz, text, text
) to service_role;

comment on column public.adle_review_schedule_words.pre_retirement_check_outcome_event_id is
  'FR.2 immutable 112-day check lineage, separate from C2B.1 route and failure lineage. NULL before the check and for direct authentic-use retirement.';
comment on table public.adle_review_retirement_decision_receipts is
  'Update-immutable FR.1 retirement decisions linked to the singular learner outcome and C2B transition. Deletion follows governed source/schedule lifecycle.';
comment on function public.persist_adle_final_rung_retirement_decision_fr2(
  uuid, uuid, uuid, uuid, uuid, text, bigint, jsonb, jsonb, text, text,
  jsonb, timestamptz, text, text
) is
  'Algorithm-free FR.2 verifier/CAS wrapper. FR.1 supplies the decision; C2B.2 persists scheduler state. No registry active/default execution check.';

commit;
