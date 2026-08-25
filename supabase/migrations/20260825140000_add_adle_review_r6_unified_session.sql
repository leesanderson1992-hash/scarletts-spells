-- R6: inactive foundations for one learner-facing Today's ADLE session.
-- This migration is additive. It activates no child, creates no assignment,
-- changes no environment setting, and performs no starter inventory cutover.

create table if not exists public.adle_today_session_orchestrations (
  daily_assignment_id uuid primary key
    references public.daily_assignments(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  assignment_date date not null,
  major_stage text not null,
  review_generation_status text not null default 'not_required',
  specialist_generation_status text not null default 'not_started',
  blocker_code text,
  state_version integer not null default 0,
  review_completed_at timestamptz,
  specialist_started_at timestamptz,
  session_completed_at timestamptz,
  completion_receipt_id uuid references public.adle_review_completion_receipts(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_today_session_stage_check check (major_stage = any (array[
    'review', 'specialist_generation', 'specialist_lesson',
    'session_complete', 'blocked'
  ])),
  constraint adle_today_session_review_generation_check check (
    review_generation_status = any (array['not_required', 'ready', 'completed'])
  ),
  constraint adle_today_session_specialist_generation_check check (
    specialist_generation_status = any (array[
      'not_started', 'generating', 'ready', 'not_due', 'blocked'
    ])
  ),
  constraint adle_today_session_state_version_check check (state_version >= 0),
  constraint adle_today_session_blocker_check check (
    (major_stage = 'blocked' and nullif(btrim(blocker_code), '') is not null)
    or (major_stage <> 'blocked' and blocker_code is null)
  ),
  constraint adle_today_session_completion_check check (
    (major_stage = 'session_complete' and session_completed_at is not null)
    or (major_stage <> 'session_complete' and session_completed_at is null)
  ),
  unique (child_id, assignment_date)
);

create index if not exists adle_today_session_child_open_idx
  on public.adle_today_session_orchestrations(child_id, assignment_date)
  where major_stage <> 'session_complete';

create table if not exists public.adle_specialist_stage_checkpoints (
  daily_assignment_id uuid primary key
    references public.daily_assignments(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  adapter_key text not null,
  checkpoint_schema_version text not null,
  lesson_snapshot_fingerprint text not null,
  checkpoint_payload jsonb not null default '{}'::jsonb,
  state_version integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_specialist_checkpoint_key_check check (
    btrim(adapter_key) <> '' and btrim(checkpoint_schema_version) <> ''
  ),
  constraint adle_specialist_checkpoint_fingerprint_check check (
    lesson_snapshot_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_specialist_checkpoint_payload_check check (
    jsonb_typeof(checkpoint_payload) = 'object'
  ),
  constraint adle_specialist_checkpoint_state_version_check check (state_version >= 0)
);

create table if not exists public.adle_review_r6_authority_cutover_receipts (
  id uuid primary key default gen_random_uuid(),
  cutover_version text not null unique,
  idempotency_key text not null unique,
  gate_b_approval_reference text not null unique,
  approved_child_ids uuid[] not null,
  audit_on date not null,
  audit_fingerprint text not null,
  protected_before_digest text not null,
  protected_after_digest text not null,
  active_schedule_row_count integer not null,
  canonical_word_count integer not null,
  state_counts jsonb not null,
  overdue_count integer not null,
  due_today_count integer not null,
  future_due_count integer not null,
  catch_up_stage_1_count integer not null,
  catch_up_stage_2_count integer not null,
  pre_retirement_count integer not null,
  ambiguity_count integer not null,
  initialized_authority_count integer not null,
  result_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_r6_cutover_scope_check check (cardinality(approved_child_ids) > 0),
  constraint adle_review_r6_cutover_fingerprints_check check (
    audit_fingerprint ~ '^[a-f0-9]{64}$'
    and protected_before_digest ~ '^[a-f0-9]{64}$'
    and protected_after_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_review_r6_cutover_parity_check check (
    protected_before_digest = protected_after_digest
  ),
  constraint adle_review_r6_cutover_counts_check check (
    active_schedule_row_count >= 0 and canonical_word_count >= 0
    and overdue_count >= 0 and due_today_count >= 0 and future_due_count >= 0
    and catch_up_stage_1_count >= 0 and catch_up_stage_2_count >= 0
    and pre_retirement_count >= 0 and ambiguity_count = 0
    and initialized_authority_count >= 0
  ),
  constraint adle_review_r6_cutover_state_counts_check check (
    jsonb_typeof(state_counts) = 'object'
  ),
  constraint adle_review_r6_cutover_payload_check check (
    jsonb_typeof(result_payload) = 'object'
  )
);

create table if not exists public.adle_review_r6_child_rollouts (
  child_id uuid primary key references public.children(id) on delete cascade,
  rollout_state text not null default 'inactive',
  approved_scope_reference text,
  audit_fingerprint text,
  cutover_receipt_id uuid
    references public.adle_review_r6_authority_cutover_receipts(id) on delete restrict,
  activated_at timestamptz,
  paused_at timestamptz,
  state_version integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_r6_rollout_state_check check (rollout_state = any (array[
    'inactive', 'legacy_quiesced', 'cutover_complete', 'active', 'paused'
  ])),
  constraint adle_review_r6_rollout_scope_check check (
    rollout_state = 'inactive' or nullif(btrim(approved_scope_reference), '') is not null
  ),
  constraint adle_review_r6_rollout_audit_check check (
    audit_fingerprint is null or audit_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_review_r6_rollout_activation_check check (
    rollout_state <> 'active' or (
      activated_at is not null and cutover_receipt_id is not null
    )
  ),
  constraint adle_review_r6_rollout_state_version_check check (state_version >= 0)
);

create table if not exists public.adle_review_r6_approval_receipts (
  id uuid primary key default gen_random_uuid(),
  gate text not null,
  approval_reference text not null,
  approved_child_ids uuid[] not null default '{}'::uuid[],
  audit_fingerprint text,
  migration_manifest jsonb,
  approval_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_r6_approval_gate_check check (gate = any (array[
    'gate_a_code_schema', 'gate_b_schedule_authority_cutover', 'gate_c_activation'
  ])),
  constraint adle_review_r6_approval_reference_unique unique (approval_reference),
  constraint adle_review_r6_approval_reference_check check (btrim(approval_reference) <> ''),
  constraint adle_review_r6_approval_fingerprint_check check (
    audit_fingerprint is null or audit_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint adle_review_r6_approval_manifest_check check (
    migration_manifest is null or jsonb_typeof(migration_manifest) = 'object'
  ),
  constraint adle_review_r6_approval_payload_check check (
    jsonb_typeof(approval_payload) = 'object'
  )
);

create or replace function public.prevent_adle_review_r6_receipt_mutation()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  raise exception 'ADLE Review R6 approval receipts are append-only';
end;
$$;

drop trigger if exists adle_review_r6_approval_receipts_append_only
  on public.adle_review_r6_approval_receipts;
create trigger adle_review_r6_approval_receipts_append_only
before update or delete on public.adle_review_r6_approval_receipts
for each row execute function public.prevent_adle_review_r6_receipt_mutation();

drop trigger if exists adle_review_r6_authority_cutover_receipts_append_only
  on public.adle_review_r6_authority_cutover_receipts;
create trigger adle_review_r6_authority_cutover_receipts_append_only
before update or delete on public.adle_review_r6_authority_cutover_receipts
for each row execute function public.prevent_adle_review_r6_receipt_mutation();

-- Dormant until a child is explicitly moved out of inactive. Specialist
-- completion may create an active child's first per-word authority row, while
-- old bundle advancement is refused. R5 and the approved cutover wrapper use
-- transaction-local capabilities rather than permanent dual writes.
create or replace function public.enforce_adle_review_r6_bundle_quiescence()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_state text;
begin
  select rollout_state into v_state from public.adle_review_r6_child_rollouts
  where child_id = new.child_id;
  if v_state is null or v_state = 'inactive' then return new; end if;
  if tg_op = 'INSERT' then
    if v_state <> 'active' then raise exception 'adle_review_r6_legacy_writes_quiesced'; end if;
    return new;
  end if;
  if coalesce(current_setting('adle.r6_per_word_writer', true), '') = 'on' then return new; end if;
  if old.interval_index is distinct from new.interval_index
    or old.next_due_on is distinct from new.next_due_on
    or old.schedule_policy_version is distinct from new.schedule_policy_version
    or old.bundle_status is distinct from new.bundle_status
    or old.row_status is distinct from new.row_status
  then raise exception 'adle_review_r6_legacy_bundle_advancement_blocked'; end if;
  return new;
end;
$$;

drop trigger if exists adle_review_r6_bundle_quiescence on public.adle_review_bundles;
create trigger adle_review_r6_bundle_quiescence
before insert or update on public.adle_review_bundles
for each row execute function public.enforce_adle_review_r6_bundle_quiescence();

create or replace function public.enforce_adle_review_r6_schedule_authority()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_state text;
  v_bundle public.adle_review_bundles%rowtype;
begin
  select rollout_state into v_state from public.adle_review_r6_child_rollouts
  where child_id = new.child_id;
  if v_state is null or v_state = 'inactive' then return new; end if;
  if coalesce(current_setting('adle.r6_per_word_writer', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if v_state <> 'active' then raise exception 'adle_review_r6_legacy_writes_quiesced'; end if;
    if new.membership_status <> 'scheduled' then
      raise exception 'adle_review_r6_new_word_must_start_scheduled';
    end if;
    select * into v_bundle from public.adle_review_bundles where id = new.bundle_id;
    if not found or v_bundle.child_id <> new.child_id then
      raise exception 'adle_review_r6_new_word_bundle_conflict';
    end if;
    new.word_schedule_version := 'adle_review_per_word_schedule_v1';
    new.word_interval_index := v_bundle.interval_index;
    new.word_next_due_on := v_bundle.next_due_on;
    new.word_schedule_policy_version := v_bundle.schedule_policy_version;
    return new;
  end if;
  -- A specialist route may supersede the old lineage row immediately before
  -- inserting its new governed row. It may not otherwise mutate its schedule.
  if old.row_status = 'active' and new.row_status = 'superseded'
    and old.membership_status is not distinct from new.membership_status
    and old.word_interval_index is not distinct from new.word_interval_index
    and old.word_next_due_on is not distinct from new.word_next_due_on
    and old.word_schedule_policy_version is not distinct from new.word_schedule_policy_version
  then return new; end if;
  -- The existing parent release surface remains valid for per-word rows: it
  -- can only remove a paused word from scheduling, never invent a due date.
  if old.membership_status = 'paused_parent_review'
    and new.membership_status in ('ejected_pending_reteach', 'retired')
    and new.word_next_due_on is null
  then return new; end if;
  raise exception 'adle_review_r6_per_word_authority_required';
end;
$$;

drop trigger if exists adle_review_r6_schedule_authority
  on public.adle_review_schedule_words;
create trigger adle_review_r6_schedule_authority
before insert or update on public.adle_review_schedule_words
for each row execute function public.enforce_adle_review_r6_schedule_authority();

create or replace function public.quiesce_adle_review_r6_scope(
  p_child_ids uuid[], p_gate_b_approval_reference text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scope uuid[]; v_receipt public.adle_review_r6_approval_receipts%rowtype;
begin
  select array_agg(id order by id::text) into v_scope from unnest(p_child_ids) id;
  if v_scope is null or cardinality(v_scope) <> cardinality(p_child_ids)
  then raise exception 'adle_review_r6_scope_invalid'; end if;
  select * into v_receipt from public.adle_review_r6_approval_receipts
  where gate = 'gate_b_schedule_authority_cutover'
    and approval_reference = p_gate_b_approval_reference;
  if v_receipt.id is null or (select array_agg(id order by id::text)
      from unnest(v_receipt.approved_child_ids) id) is distinct from v_scope
  then raise exception 'adle_review_r6_gate_b_scope_not_approved'; end if;
  if exists (select 1 from public.adle_review_sessions
    where child_id = any(v_scope) and completed_at is null)
  then raise exception 'adle_review_r6_scope_has_inflight_review'; end if;
  insert into public.adle_review_r6_child_rollouts(
    child_id, rollout_state, approved_scope_reference
  ) select id, 'legacy_quiesced', p_gate_b_approval_reference from unnest(v_scope) id
  on conflict (child_id) do update set
    rollout_state = 'legacy_quiesced',
    approved_scope_reference = excluded.approved_scope_reference,
    state_version = adle_review_r6_child_rollouts.state_version + 1,
    updated_at = timezone('utc', now())
  where adle_review_r6_child_rollouts.rollout_state in ('inactive', 'legacy_quiesced');
  if (select count(*) from public.adle_review_r6_child_rollouts
      where child_id = any(v_scope) and rollout_state = 'legacy_quiesced')
    <> cardinality(v_scope)
  then raise exception 'adle_review_r6_scope_transition_conflict'; end if;
  return jsonb_build_object('ok', true, 'scope', v_scope,
    'rolloutState', 'legacy_quiesced');
end;
$$;

-- Gate B migrates authority for every genuinely live Review schedule state.
-- Exact active-state predicate: the word, bundle, and canonical word are active,
-- the bundle is not completed, and membership is one of scheduled, catch_up,
-- awaiting_pre_retirement_check, or paused_parent_review. Retired,
-- ejected_pending_reteach, superseded, rejected, and draft rows are historical
-- or specialist-owned and are intentionally not converted.
create or replace function public.adle_review_schedule_authority_rows_r6(
  p_child_ids uuid[]
) returns table (
  schedule_word_id uuid,
  child_id uuid,
  canonical_word_id uuid,
  active_schedule boolean,
  classification text,
  scheduler_state text,
  effective_due_on date,
  protected_state jsonb,
  authority_state jsonb,
  ambiguity_codes text[]
)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row record;
  v_live_membership boolean;
  v_active boolean;
  v_legacy_authority boolean;
  v_exact_authority boolean;
  v_ambiguities text[];
  v_taught_history jsonb;
  v_routes jsonb;
  v_outcomes jsonb;
begin
  for v_row in
    select word.*,
      bundle.child_id as bundle_child_id,
      bundle.source_ref as bundle_source_ref,
      bundle.interval_index as bundle_interval_index,
      bundle.next_due_on as bundle_next_due_on,
      bundle.schedule_policy_version as bundle_policy_version,
      bundle.bundle_status,
      bundle.row_status as bundle_row_status,
      canonical.row_status as canonical_row_status,
      canonical.word_key as canonical_word_key,
      canonical.normalised_word as canonical_normalised_word
    from public.adle_review_schedule_words word
    join public.adle_review_bundles bundle on bundle.id = word.bundle_id
    join public.canonical_teaching_dictionary_words canonical
      on canonical.id = word.canonical_word_id
    where word.child_id = any(p_child_ids)
    order by word.child_id, word.id
  loop
    v_live_membership := v_row.membership_status in (
      'scheduled', 'catch_up', 'awaiting_pre_retirement_check',
      'paused_parent_review'
    );
    v_active := v_row.row_status = 'active'
      and v_row.bundle_status = 'active'
      and v_row.bundle_row_status = 'active'
      and v_row.canonical_row_status = 'active'
      and v_live_membership;
    v_ambiguities := array[]::text[];

    if v_row.row_status = 'active' and v_live_membership then
      if v_row.bundle_status <> 'active' or v_row.bundle_row_status <> 'active'
        then v_ambiguities := array_append(v_ambiguities, 'live_word_has_inactive_bundle'); end if;
      if v_row.canonical_row_status <> 'active'
        then v_ambiguities := array_append(v_ambiguities, 'live_word_has_inactive_canonical_word'); end if;
      if v_row.bundle_child_id <> v_row.child_id
        then v_ambiguities := array_append(v_ambiguities, 'schedule_bundle_child_mismatch'); end if;
    end if;

    if v_active and v_row.membership_status = 'scheduled' and (
      v_row.catch_up_stage <> 0 or v_row.next_retest_due_on is not null
      or v_row.failed_review_on is not null
      or v_row.pre_retirement_check_due_on is not null
    ) then v_ambiguities := array_append(v_ambiguities, 'invalid_normal_scheduled_state'); end if;
    if v_active and v_row.membership_status = 'catch_up' and (
      v_row.catch_up_stage not in (1, 2) or v_row.next_retest_due_on is null
      or v_row.failed_review_on is null
    ) then v_ambiguities := array_append(v_ambiguities, 'invalid_catch_up_state'); end if;
    if v_active and v_row.membership_status = 'awaiting_pre_retirement_check' and (
      v_row.pre_retirement_check_due_on is null or v_row.catch_up_stage <> 0
      or v_row.next_retest_due_on is not null
    ) then v_ambiguities := array_append(v_ambiguities, 'invalid_pre_retirement_state'); end if;
    if v_active and v_row.membership_status = 'paused_parent_review' and (
      v_row.catch_up_stage <> 0 or v_row.next_retest_due_on is not null
    ) then v_ambiguities := array_append(v_ambiguities, 'invalid_paused_parent_state'); end if;

    v_legacy_authority := v_row.word_schedule_version is null
      and v_row.word_interval_index is null
      and v_row.word_next_due_on is null
      and v_row.word_schedule_policy_version is null;
    v_exact_authority := v_row.word_schedule_version = 'adle_review_per_word_schedule_v1'
      and v_row.word_interval_index = v_row.bundle_interval_index
      and v_row.word_schedule_policy_version = v_row.bundle_policy_version
      and (
        (v_row.membership_status = 'scheduled'
          and v_row.word_next_due_on = v_row.bundle_next_due_on)
        or (v_row.membership_status <> 'scheduled'
          and v_row.word_next_due_on is null)
      );
    if v_active and not v_legacy_authority and not coalesce(v_exact_authority, false)
      then v_ambiguities := array_append(v_ambiguities, 'conflicting_per_word_authority'); end if;

    select coalesce(jsonb_agg(to_jsonb(history) order by history.id), '[]'::jsonb)
      into v_taught_history
    from public.adle_taught_word_history history
    where history.child_id = v_row.child_id
      and history.canonical_word_id = v_row.canonical_word_id;
    if v_active and not exists (
      select 1 from public.adle_taught_word_history history
      where history.child_id = v_row.child_id
        and history.canonical_word_id = v_row.canonical_word_id
        and history.event_kind = 'taught' and history.row_status = 'active'
    ) then v_ambiguities := array_append(v_ambiguities, 'missing_active_taught_history'); end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'route', to_jsonb(route),
      'learningItem', to_jsonb(learning),
      'assignmentItems', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', assignment_item.id,
          'dailyAssignmentId', assignment_item.daily_assignment_id,
          'sourceType', assignment_item.source_type,
          'sourceEntityId', assignment_item.source_entity_id,
          'learningItemId', assignment_item.learning_item_id,
          'templateKey', assignment_item.template_key,
          'position', assignment_item.position,
          'status', assignment_item.status
        ) order by assignment_item.id)
        from public.assignment_items assignment_item
        where assignment_item.learning_item_id = route.learning_item_id
      ), '[]'::jsonb)
    ) order by route.id), '[]'::jsonb) into v_routes
    from public.adle_review_schedule_word_routes route
    left join public.adle_learning_items learning on learning.id = route.learning_item_id
    where route.schedule_word_id = v_row.id;
    if v_active and jsonb_array_length(v_routes) = 0
      and nullif(btrim(v_row.bundle_source_ref), '') is null
    then v_ambiguities := array_append(v_ambiguities, 'missing_source_or_route_provenance'); end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'outcome', to_jsonb(outcome),
      'routes', coalesce((
        select jsonb_agg(to_jsonb(outcome_route) order by outcome_route.id)
        from public.adle_review_outcome_event_routes outcome_route
        where outcome_route.outcome_event_id = outcome.id
      ), '[]'::jsonb)
    ) order by outcome.id), '[]'::jsonb) into v_outcomes
    from public.adle_review_outcome_events outcome
    where outcome.child_id = v_row.child_id
      and outcome.canonical_word_id = v_row.canonical_word_id
      and (
        outcome.schedule_word_id = v_row.id
        or (outcome.schedule_word_id is null and outcome.bundle_id = v_row.bundle_id)
      );

    schedule_word_id := v_row.id;
    child_id := v_row.child_id;
    canonical_word_id := v_row.canonical_word_id;
    active_schedule := v_active;
    scheduler_state := v_row.membership_status;
    effective_due_on := case v_row.membership_status
      when 'scheduled' then coalesce(v_row.word_next_due_on, v_row.bundle_next_due_on)
      when 'catch_up' then v_row.next_retest_due_on
      when 'awaiting_pre_retirement_check' then v_row.pre_retirement_check_due_on
      else null
    end;
    protected_state := jsonb_build_object(
      'scheduleWord', to_jsonb(v_row)
        - 'bundle_child_id' - 'bundle_source_ref' - 'bundle_interval_index'
        - 'bundle_next_due_on' - 'bundle_policy_version' - 'bundle_status'
        - 'bundle_row_status' - 'canonical_row_status' - 'canonical_word_key'
        - 'canonical_normalised_word' - 'word_schedule_version'
        - 'word_interval_index' - 'word_next_due_on'
        - 'word_schedule_policy_version',
      'effectiveDueOn', effective_due_on,
      'effectiveIntervalIndex', coalesce(v_row.word_interval_index, v_row.bundle_interval_index),
      'effectivePolicyVersion', coalesce(v_row.word_schedule_policy_version, v_row.bundle_policy_version),
      'bundle', jsonb_build_object(
        'id', v_row.bundle_id,
        'childId', v_row.bundle_child_id,
        'sourceRef', v_row.bundle_source_ref,
        'intervalIndex', v_row.bundle_interval_index,
        'nextDueOn', v_row.bundle_next_due_on,
        'schedulePolicyVersion', v_row.bundle_policy_version,
        'bundleStatus', v_row.bundle_status,
        'rowStatus', v_row.bundle_row_status
      ),
      'canonicalWord', jsonb_build_object(
        'id', v_row.canonical_word_id,
        'wordKey', v_row.canonical_word_key,
        'normalisedWord', v_row.canonical_normalised_word,
        'rowStatus', v_row.canonical_row_status
      ),
      'taughtHistory', v_taught_history,
      'routes', v_routes,
      'outcomes', v_outcomes
    );
    authority_state := jsonb_build_object(
      'wordScheduleVersion', v_row.word_schedule_version,
      'wordIntervalIndex', v_row.word_interval_index,
      'wordNextDueOn', v_row.word_next_due_on,
      'wordSchedulePolicyVersion', v_row.word_schedule_policy_version
    );
    ambiguity_codes := v_ambiguities;
    classification := case
      when cardinality(v_ambiguities) > 0 then 'ambiguous'
      when not v_active then 'excluded'
      when v_legacy_authority then 'legacy_authoritative'
      else 'already_per_word_authoritative'
    end;
    return next;
  end loop;
end;
$$;

create or replace function public.audit_adle_review_schedule_authority_r6(
  p_child_ids uuid[], p_audit_on date
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_scope uuid[]; v_value jsonb;
begin
  if p_child_ids is null or cardinality(p_child_ids) = 0 or p_audit_on is null
    or exists (select 1 from unnest(p_child_ids) scoped(id) where id is null)
    or cardinality(p_child_ids) <> (
      select count(distinct id) from unnest(p_child_ids) scoped(id)
    )
  then raise exception 'adle_review_r6_authority_audit_scope_invalid'; end if;
  select array_agg(id order by id::text) into v_scope from unnest(p_child_ids) scoped(id);
  with rows as (
    select * from public.adle_review_schedule_authority_rows_r6(v_scope)
  ), active_rows as (
    select * from rows where active_schedule
  ), summary as (
    select
      count(*)::integer as active_count,
      count(distinct canonical_word_id)::integer as canonical_count,
      count(*) filter (where classification = 'legacy_authoritative')::integer as legacy_count,
      count(*) filter (where classification = 'already_per_word_authoritative')::integer as per_word_count,
      count(*) filter (where classification = 'ambiguous')::integer as ambiguity_count,
      count(*) filter (where classification = 'excluded')::integer as excluded_count,
      count(*) filter (where active_schedule and effective_due_on < p_audit_on)::integer as overdue_count,
      count(*) filter (where active_schedule and effective_due_on = p_audit_on)::integer as due_today_count,
      count(*) filter (where active_schedule and effective_due_on > p_audit_on)::integer as future_due_count,
      count(*) filter (where active_schedule and scheduler_state = 'catch_up'
        and (protected_state#>>'{scheduleWord,catch_up_stage}')::integer = 1)::integer as stage_1_count,
      count(*) filter (where active_schedule and scheduler_state = 'catch_up'
        and (protected_state#>>'{scheduleWord,catch_up_stage}')::integer = 2)::integer as stage_2_count,
      count(*) filter (where active_schedule
        and scheduler_state = 'awaiting_pre_retirement_check')::integer as pre_retirement_count
    from rows
  ), payload as (
    select jsonb_build_object(
      'contractVersion', 'adle_review_r6_authority_cutover_v1',
      'activeStatePredicate', jsonb_build_object(
        'scheduleRowStatus', 'active', 'bundleStatus', 'active',
        'bundleRowStatus', 'active', 'canonicalRowStatus', 'active',
        'memberships', jsonb_build_array(
          'scheduled', 'catch_up', 'awaiting_pre_retirement_check',
          'paused_parent_review'
        ),
        'excludedMemberships', jsonb_build_array('ejected_pending_reteach', 'retired')
      ),
      'scope', to_jsonb(v_scope),
      'auditOn', p_audit_on,
      'counts', jsonb_build_object(
        'totalActiveScheduleRows', summary.active_count,
        'canonicalWords', summary.canonical_count,
        'legacyAuthoritative', summary.legacy_count,
        'alreadyPerWordAuthoritative', summary.per_word_count,
        'excluded', summary.excluded_count,
        'overdue', summary.overdue_count,
        'dueToday', summary.due_today_count,
        'futureDue', summary.future_due_count,
        'catchUpStage1', summary.stage_1_count,
        'catchUpStage2', summary.stage_2_count,
        'preRetirement', summary.pre_retirement_count,
        'ambiguity', summary.ambiguity_count
      ),
      'stateCounts', jsonb_build_object(
        'scheduled', (select count(*) from active_rows where scheduler_state = 'scheduled'),
        'catch_up', (select count(*) from active_rows where scheduler_state = 'catch_up'),
        'awaiting_pre_retirement_check', (select count(*) from active_rows
          where scheduler_state = 'awaiting_pre_retirement_check'),
        'paused_parent_review', (select count(*) from active_rows
          where scheduler_state = 'paused_parent_review')
      ),
      'activeRowIds', coalesce((select jsonb_agg(schedule_word_id order by schedule_word_id)
        from active_rows), '[]'::jsonb),
      'canonicalWordIds', coalesce((select jsonb_agg(canonical_word_id order by canonical_word_id)
        from active_rows), '[]'::jsonb),
      'protectedStateDigest', encode(extensions.digest(convert_to(coalesce((
        select jsonb_agg(protected_state order by child_id, schedule_word_id)
        from active_rows
      ), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex'),
      'outcomeReferenceCount', coalesce((select sum(jsonb_array_length(protected_state->'outcomes'))
        from active_rows), 0),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'scheduleWordId', schedule_word_id, 'childId', child_id,
        'activeSchedule', active_schedule, 'classification', classification,
        'schedulerState', scheduler_state, 'effectiveDueOn', effective_due_on,
        'protectedState', protected_state, 'authorityState', authority_state,
        'ambiguityCodes', ambiguity_codes
      ) order by child_id, schedule_word_id) from rows), '[]'::jsonb)
    ) as value
    from summary
  )
  select value || jsonb_build_object(
    'fingerprint', encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
  ) into v_value from payload;
  return v_value;
end;
$$;

create or replace function public.apply_adle_review_schedule_authority_cutover_r6(
  p_child_ids uuid[], p_audit_on date, p_audit_fingerprint text,
  p_cutover_version text, p_idempotency_key text,
  p_gate_b_approval_reference text
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_scope uuid[];
  v_approval public.adle_review_r6_approval_receipts%rowtype;
  v_existing public.adle_review_r6_authority_cutover_receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_initialized integer;
  v_rollouts_updated integer;
  v_result jsonb;
  v_cutover_receipt_id uuid;
begin
  if p_child_ids is null or cardinality(p_child_ids) = 0 or p_audit_on is null
    or exists (select 1 from unnest(p_child_ids) scoped(id) where id is null)
    or cardinality(p_child_ids) <> (
      select count(distinct id) from unnest(p_child_ids) scoped(id)
    )
    or coalesce(p_audit_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_cutover_version), '') is null
    or nullif(btrim(p_idempotency_key), '') is null
    or nullif(btrim(p_gate_b_approval_reference), '') is null
  then raise exception 'adle_review_r6_authority_cutover_contract_invalid'; end if;
  select array_agg(id order by id::text) into v_scope from unnest(p_child_ids) scoped(id);
  perform pg_advisory_xact_lock(hashtextextended(
    'adle-review-r6-authority-cutover:' || p_cutover_version, 0
  ));

  select * into v_existing from public.adle_review_r6_authority_cutover_receipts
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.approved_child_ids <> v_scope
      or v_existing.audit_on <> p_audit_on
      or v_existing.audit_fingerprint <> p_audit_fingerprint
      or v_existing.cutover_version <> p_cutover_version
      or v_existing.gate_b_approval_reference <> p_gate_b_approval_reference
    then raise exception 'adle_review_r6_authority_cutover_idempotency_conflict'; end if;
    return v_existing.result_payload || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.adle_review_r6_authority_cutover_receipts
    where cutover_version = p_cutover_version
      or gate_b_approval_reference = p_gate_b_approval_reference)
  then raise exception 'adle_review_r6_authority_cutover_receipt_conflict'; end if;

  select * into v_approval from public.adle_review_r6_approval_receipts
  where gate = 'gate_b_schedule_authority_cutover'
    and approval_reference = p_gate_b_approval_reference;
  if v_approval.id is null
    or v_approval.audit_fingerprint is distinct from p_audit_fingerprint
    or (select array_agg(id order by id::text)
      from unnest(v_approval.approved_child_ids) id) is distinct from v_scope
    or v_approval.approval_payload->>'auditOn' is distinct from p_audit_on::text
    or v_approval.approval_payload->>'cutoverVersion' is distinct from p_cutover_version
    or v_approval.approval_payload->>'idempotencyKey' is distinct from p_idempotency_key
    or (select count(*) from public.adle_review_r6_child_rollouts
      where child_id = any(v_scope) and rollout_state = 'legacy_quiesced')
      <> cardinality(v_scope)
  then raise exception 'adle_review_r6_gate_b_authority_cutover_not_authorized'; end if;

  perform 1 from public.adle_review_schedule_words word
    where word.child_id = any(v_scope) order by word.child_id, word.id for update;
  perform 1 from public.adle_review_bundles bundle
    where bundle.child_id = any(v_scope) order by bundle.child_id, bundle.id for update;
  v_before := public.audit_adle_review_schedule_authority_r6(v_scope, p_audit_on);
  if v_before->>'fingerprint' <> p_audit_fingerprint
    then raise exception 'adle_review_r6_authority_audit_fingerprint_drift'; end if;
  if (v_before#>>'{counts,ambiguity}')::integer <> 0
    then raise exception 'adle_review_r6_authority_inventory_ambiguous'; end if;

  perform set_config('adle.r6_per_word_writer', 'on', true);
  update public.adle_review_schedule_words word set
    word_schedule_version = 'adle_review_per_word_schedule_v1',
    word_interval_index = bundle.interval_index,
    word_next_due_on = case when word.membership_status = 'scheduled'
      then bundle.next_due_on else null end,
    word_schedule_policy_version = bundle.schedule_policy_version,
    updated_at = word.updated_at
  from public.adle_review_bundles bundle,
    public.canonical_teaching_dictionary_words canonical
  where word.bundle_id = bundle.id
    and word.canonical_word_id = canonical.id
    and word.child_id = any(v_scope)
    and word.row_status = 'active'
    and bundle.bundle_status = 'active' and bundle.row_status = 'active'
    and canonical.row_status = 'active'
    and word.membership_status in (
      'scheduled', 'catch_up', 'awaiting_pre_retirement_check',
      'paused_parent_review'
    )
    and word.word_schedule_version is null
    and word.word_interval_index is null
    and word.word_next_due_on is null
    and word.word_schedule_policy_version is null;
  get diagnostics v_initialized = row_count;
  if v_initialized <> (v_before#>>'{counts,legacyAuthoritative}')::integer
    then raise exception 'adle_review_r6_authority_cutover_update_count_conflict'; end if;

  v_after := public.audit_adle_review_schedule_authority_r6(v_scope, p_audit_on);
  if (v_after#>>'{counts,ambiguity}')::integer <> 0
    or (v_after#>>'{counts,legacyAuthoritative}')::integer <> 0
    or v_after->'activeRowIds' is distinct from v_before->'activeRowIds'
    or v_after->'canonicalWordIds' is distinct from v_before->'canonicalWordIds'
    or v_after->'stateCounts' is distinct from v_before->'stateCounts'
    or v_after#>>'{counts,totalActiveScheduleRows}' is distinct from
      v_before#>>'{counts,totalActiveScheduleRows}'
    or v_after#>>'{counts,canonicalWords}' is distinct from
      v_before#>>'{counts,canonicalWords}'
    or v_after#>>'{counts,overdue}' is distinct from v_before#>>'{counts,overdue}'
    or v_after#>>'{counts,dueToday}' is distinct from v_before#>>'{counts,dueToday}'
    or v_after#>>'{counts,futureDue}' is distinct from v_before#>>'{counts,futureDue}'
    or v_after#>>'{counts,catchUpStage1}' is distinct from v_before#>>'{counts,catchUpStage1}'
    or v_after#>>'{counts,catchUpStage2}' is distinct from v_before#>>'{counts,catchUpStage2}'
    or v_after#>>'{counts,preRetirement}' is distinct from v_before#>>'{counts,preRetirement}'
    or v_after->>'outcomeReferenceCount' is distinct from v_before->>'outcomeReferenceCount'
    or v_after->>'protectedStateDigest' is distinct from v_before->>'protectedStateDigest'
  then raise exception 'adle_review_r6_authority_cutover_protected_state_changed'; end if;

  v_result := jsonb_build_object(
    'ok', true, 'replayed', false,
    'contractVersion', 'adle_review_r6_authority_cutover_v1',
    'cutoverVersion', p_cutover_version,
    'approvedChildIds', v_scope,
    'auditOn', p_audit_on,
    'auditFingerprint', p_audit_fingerprint,
    'counts', v_before->'counts',
    'stateCounts', v_before->'stateCounts',
    'initializedAuthorityRows', v_initialized,
    'protectedBeforeDigest', v_before->>'protectedStateDigest',
    'protectedAfterDigest', v_after->>'protectedStateDigest',
    'outcomeReferenceCountBefore', v_before->'outcomeReferenceCount',
    'outcomeReferenceCountAfter', v_after->'outcomeReferenceCount',
    'r6RolloutState', 'cutover_complete'
  );
  insert into public.adle_review_r6_authority_cutover_receipts(
    cutover_version, idempotency_key, gate_b_approval_reference,
    approved_child_ids, audit_on, audit_fingerprint,
    protected_before_digest, protected_after_digest,
    active_schedule_row_count, canonical_word_count, state_counts,
    overdue_count, due_today_count, future_due_count,
    catch_up_stage_1_count, catch_up_stage_2_count, pre_retirement_count,
    ambiguity_count, initialized_authority_count, result_payload
  ) values (
    p_cutover_version, p_idempotency_key, p_gate_b_approval_reference,
    v_scope, p_audit_on, p_audit_fingerprint,
    v_before->>'protectedStateDigest', v_after->>'protectedStateDigest',
    (v_before#>>'{counts,totalActiveScheduleRows}')::integer,
    (v_before#>>'{counts,canonicalWords}')::integer,
    v_before->'stateCounts',
    (v_before#>>'{counts,overdue}')::integer,
    (v_before#>>'{counts,dueToday}')::integer,
    (v_before#>>'{counts,futureDue}')::integer,
    (v_before#>>'{counts,catchUpStage1}')::integer,
    (v_before#>>'{counts,catchUpStage2}')::integer,
    (v_before#>>'{counts,preRetirement}')::integer,
    (v_before#>>'{counts,ambiguity}')::integer,
    v_initialized, v_result
  ) returning id into v_cutover_receipt_id;
  update public.adle_review_r6_child_rollouts set
    rollout_state = 'cutover_complete', audit_fingerprint = p_audit_fingerprint,
    cutover_receipt_id = v_cutover_receipt_id, state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where child_id = any(v_scope) and rollout_state = 'legacy_quiesced';
  get diagnostics v_rollouts_updated = row_count;
  if v_rollouts_updated <> cardinality(v_scope) then
    raise exception 'adle_review_r6_authority_cutover_rollout_transition_failed'; end if;
  return v_result;
end;
$$;

create or replace function public.activate_adle_review_r6_scope(
  p_child_ids uuid[], p_gate_c_approval_reference text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scope uuid[]; v_receipt public.adle_review_r6_approval_receipts%rowtype;
begin
  select array_agg(id order by id::text) into v_scope from unnest(p_child_ids) id;
  select * into v_receipt from public.adle_review_r6_approval_receipts
  where gate = 'gate_c_activation' and approval_reference = p_gate_c_approval_reference;
  if v_scope is null or v_receipt.id is null
    or (select array_agg(id order by id::text)
      from unnest(v_receipt.approved_child_ids) id) is distinct from v_scope
    or (select count(*) from public.adle_review_r6_child_rollouts
      where child_id = any(v_scope) and rollout_state in ('cutover_complete', 'paused'))
      <> cardinality(v_scope)
  then raise exception 'adle_review_r6_gate_c_not_authorized'; end if;
  if (select count(distinct stable_prompt_key) from public.adle_review_prompt_versions
      where row_status = 'active' and review_status = 'approved'
        and challenge_type = 'reflection') < 2
    or exists (select 1 from unnest(array[
      'conundrums','stories','fortunately_unfortunately','persuasion'
    ]) as challenge(challenge_type) where (select count(distinct prompt.stable_prompt_key)
      from public.adle_review_prompt_versions prompt
      where prompt.row_status = 'active' and prompt.review_status = 'approved'
        and prompt.challenge_type = challenge.challenge_type) < 5)
  then raise exception 'adle_review_r6_prompt_capacity_not_ready'; end if;
  if exists (
    select 1 from unnest(v_scope) scoped(child_id)
    cross join unnest(array[
      'conundrums','stories','fortunately_unfortunately','persuasion'
    ]) challenge(challenge_type)
    where (select count(distinct candidate.stable_prompt_key)
      from public.adle_review_prompt_versions candidate
      where candidate.row_status = 'active' and candidate.review_status = 'approved'
        and candidate.challenge_type = challenge.challenge_type
        and not exists (
          select 1 from public.adle_review_sessions completed
          join public.adle_review_prompt_versions historical
            on historical.id = completed.selected_prompt_version_id
          where completed.child_id = scoped.child_id
            and completed.completed_at is not null
            and historical.stable_prompt_key = candidate.stable_prompt_key
        )) < 5
  ) then raise exception 'adle_review_r6_scoped_prompt_capacity_not_ready'; end if;
  update public.adle_review_r6_child_rollouts set
    rollout_state = 'active', approved_scope_reference = p_gate_c_approval_reference,
    activated_at = clock_timestamp(), paused_at = null,
    state_version = state_version + 1, updated_at = timezone('utc', now())
  where child_id = any(v_scope) and rollout_state in ('cutover_complete', 'paused');
  return jsonb_build_object('ok', true, 'scope', v_scope, 'rolloutState', 'active');
end;
$$;

create or replace function public.pause_adle_review_r6_scope(p_child_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scope uuid[];
begin
  select array_agg(id order by id::text) into v_scope from unnest(p_child_ids) id;
  if v_scope is null then raise exception 'adle_review_r6_scope_invalid'; end if;
  update public.adle_review_r6_child_rollouts set
    rollout_state = 'paused', paused_at = clock_timestamp(),
    state_version = state_version + 1, updated_at = timezone('utc', now())
  where child_id = any(v_scope) and rollout_state = 'active';
  return jsonb_build_object('ok', true, 'scope', v_scope, 'rolloutState', 'paused');
end;
$$;

-- R6 is the only path allowed to attach a specialist snapshot to a Review-first
-- header. Existing non-null lesson snapshots remain immutable.
create or replace function public.prevent_adle_compiled_lesson_snapshot_update()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.compiled_lesson_snapshot is distinct from new.compiled_lesson_snapshot then
    if old.compiled_lesson_snapshot is not null
      or new.compiled_lesson_snapshot is null
      or not public.adle_lesson_snapshot_is_structurally_valid(
        new.compiled_lesson_snapshot
      )
      or coalesce(current_setting('adle.r6_specialist_append', true), '') <> 'on'
      or not exists (
        select 1 from public.adle_today_session_orchestrations orchestration
        where orchestration.daily_assignment_id = old.id
          and orchestration.major_stage = 'specialist_generation'
      )
    then
      raise exception 'ADLE compiled lesson snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_adle_lesson_route_metadata_update()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.lesson_route_metadata is distinct from new.lesson_route_metadata then
    if old.lesson_route_metadata is not null
      or new.lesson_route_metadata is null
      or not public.adle_lesson_route_metadata_is_valid_v1(new.lesson_route_metadata)
      or coalesce(current_setting('adle.r6_specialist_append', true), '') <> 'on'
      or not exists (
        select 1 from public.adle_today_session_orchestrations orchestration
        where orchestration.daily_assignment_id = old.id
          and orchestration.major_stage = 'specialist_generation'
      )
    then
      raise exception 'ADLE lesson route metadata is immutable';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.persist_adle_review_assignment_r6(
  p_parent_user_id uuid,
  p_child_id uuid,
  p_plan_date date,
  p_assignment_id uuid,
  p_review_item_id uuid,
  p_review_session_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_existing public.adle_review_sessions%rowtype;
  v_rollout public.adle_review_r6_child_rollouts%rowtype;
  v_policy public.adle_review_policy_versions%rowtype;
  v_target jsonb;
  v_word public.adle_review_schedule_words%rowtype;
  v_due_kind text;
  v_due_on date;
  v_prompt jsonb;
  v_prompt_row public.adle_review_prompt_versions%rowtype;
  v_target_words text[];
  v_expected_schedule_ids uuid[];
  v_snapshot_schedule_ids uuid[];
  v_existing_count integer;
begin
  if p_parent_user_id is null or p_child_id is null or p_plan_date is null
    or p_assignment_id is null or p_review_item_id is null or p_review_session_id is null
    or not public.adle_review_snapshot_is_structurally_valid_v3(p_snapshot)
    or p_snapshot#>>'{assignment,assignmentId}' <> p_assignment_id::text
    or p_snapshot#>>'{assignment,reviewItemId}' <> p_review_item_id::text
  then raise exception 'invalid_review_r6_assignment_contract'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_child_id::text || ':' || p_plan_date::text || ':adle-review-r6', 0
  ));

  if not exists (
    select 1 from public.children child
    where child.id = p_child_id and child.parent_user_id = p_parent_user_id
      and child.is_archived = false
  ) then raise exception 'review_r6_child_not_owned_or_inactive'; end if;

  select * into v_rollout from public.adle_review_r6_child_rollouts
  where child_id = p_child_id for share;
  if not found or v_rollout.rollout_state <> 'active' then
    raise exception 'review_r6_scope_inactive';
  end if;

  select count(*) into v_existing_count from public.adle_review_sessions
  where child_id = p_child_id and completed_at is null;
  if v_existing_count > 1 then
    raise exception 'multiple_incomplete_review_sessions';
  end if;
  select * into v_existing from public.adle_review_sessions
  where child_id = p_child_id and completed_at is null
  order by created_at, id limit 1 for update;
  if found then
    return jsonb_build_object(
      'outcome', 'reused_incomplete',
      'assignmentId', v_existing.daily_assignment_id,
      'reviewSessionId', v_existing.id
    );
  end if;

  if exists (
    select 1 from public.daily_assignments assignment
    where assignment.child_id = p_child_id
      and assignment.assignment_date = p_plan_date
      and ((assignment.title = 'ADLE Daily Plan'
        and assignment.assignment_generation_source = 'adle_composer_v1')
        or (assignment.title = 'ADLE Base-word Family Pilot'
        and assignment.assignment_generation_source = 'adle_base_word_family_pilot_v1'))
  ) then raise exception 'review_r6_assignment_day_conflict'; end if;

  select * into v_policy from public.adle_review_policy_versions where is_active = true;
  if not found or v_policy.session_cap < 1 then
    raise exception 'active_review_policy_missing_or_ambiguous';
  end if;
  if jsonb_array_length(p_snapshot->'targets') > least(10, v_policy.session_cap) then
    raise exception 'review_r6_target_cap_conflict';
  end if;

  with due_words as (
    select word.id, word.taught_on, word.canonical_word_id,
      case
        when word.membership_status = 'scheduled' then word.word_next_due_on
        when word.membership_status = 'catch_up' then word.next_retest_due_on
        when word.membership_status = 'awaiting_pre_retirement_check'
          then word.pre_retirement_check_due_on
        else null
      end as due_on
    from public.adle_review_schedule_words word
    where word.child_id = p_child_id
      and word.row_status = 'active'
      and word.word_schedule_version = 'adle_review_per_word_schedule_v1'
      and word.word_schedule_policy_version = v_policy.schedule_policy_version
  ), selected as (
    select * from due_words where due_on <= p_plan_date
    order by due_on, taught_on, canonical_word_id, id
    limit least(10, v_policy.session_cap)
  )
  select array_agg(id order by due_on, taught_on, canonical_word_id, id)
  into v_expected_schedule_ids from selected;
  select array_agg((target#>>'{schedule,scheduleWordId}')::uuid
    order by (target->>'order')::integer)
  into v_snapshot_schedule_ids
  from jsonb_array_elements(p_snapshot->'targets') target;
  if coalesce(v_expected_schedule_ids, '{}'::uuid[])
    is distinct from coalesce(v_snapshot_schedule_ids, '{}'::uuid[])
  then raise exception 'review_r6_oldest_due_selection_conflict'; end if;

  for v_prompt in select value from jsonb_array_elements(p_snapshot->'promptCandidates')
  loop
    select * into v_prompt_row from public.adle_review_prompt_versions
    where id = (v_prompt->>'promptVersionId')::uuid
      and stable_prompt_key = v_prompt->>'stablePromptKey'
      and challenge_type = v_prompt->>'challengeType'
      and content_version = v_prompt->>'contentVersion'
      and source_fingerprint = v_prompt#>>'{authority,sourceFingerprint}'
      and review_status = 'approved' and row_status = 'active';
    if not found then raise exception 'review_r6_prompt_authority_conflict'; end if;
  end loop;

  for v_target in select value from jsonb_array_elements(p_snapshot->'targets')
  loop
    select * into v_word from public.adle_review_schedule_words
    where id = (v_target#>>'{schedule,scheduleWordId}')::uuid for update;
    v_due_kind := v_target#>>'{schedule,dueKind}';
    v_due_on := (v_target#>>'{schedule,dueOn}')::date;
    if not found or v_word.child_id <> p_child_id
      or v_word.canonical_word_id <> (v_target->>'canonicalWordId')::uuid
      or v_word.row_status <> 'active'
      or v_word.word_schedule_version <> 'adle_review_per_word_schedule_v1'
      or v_word.word_schedule_policy_version <> v_policy.schedule_policy_version
      or v_word.word_schedule_policy_version <> v_target#>>'{schedule,schedulePolicyVersion}'
      or v_word.word_interval_index <> (v_target#>>'{schedule,intervalIndex}')::integer
      or coalesce(v_word.bundle_id::text, '') <> coalesce(v_target#>>'{schedule,sourceBundleId}', '')
      or v_due_on > p_plan_date
      or (v_due_kind = 'scheduled_review' and (
        v_word.membership_status <> 'scheduled' or v_word.word_next_due_on <> v_due_on))
      or (v_due_kind = 'catch_up_retest' and (
        v_word.membership_status <> 'catch_up' or v_word.next_retest_due_on <> v_due_on))
      or (v_due_kind = 'pre_retirement_check' and (
        v_word.membership_status <> 'awaiting_pre_retirement_check'
        or v_word.pre_retirement_check_due_on <> v_due_on))
      or v_due_kind not in ('scheduled_review', 'catch_up_retest', 'pre_retirement_check')
    then raise exception 'review_r6_due_word_authority_conflict'; end if;
  end loop;

  select array_agg(target->>'canonicalSpelling' order by (target->>'order')::integer)
  into v_target_words from jsonb_array_elements(p_snapshot->'targets') target;

  insert into public.daily_assignments(
    id, child_id, parent_user_id, assignment_date, title, status,
    target_words, review_words, assignment_generation_source,
    lesson_route_metadata, compiled_review_snapshot
  ) values (
    p_assignment_id, p_child_id, p_parent_user_id, p_plan_date,
    'ADLE Daily Plan', 'pending', v_target_words, v_target_words,
    'adle_composer_v1',
    null,
    p_snapshot
  );

  insert into public.assignment_items(
    id, daily_assignment_id, child_id, parent_user_id, domain_module,
    item_type, source_type, source_entity_id, learning_item_id,
    template_key, target_word, position, status, prompt_data, metadata
  ) values (
    p_review_item_id, p_assignment_id, p_child_id, p_parent_user_id,
    'spelling', 'review_writing_challenge', 'adle_review_session',
    p_review_session_id::text, null, 'review_writing_challenge_v3', null,
    0, 'pending',
    jsonb_build_object('snapshotFingerprint', p_snapshot#>>'{provenance,sourceFingerprint}'),
    jsonb_build_object('sectionKey', 'review_writing_challenge', 'r6MajorStage', 'review')
  );

  insert into public.adle_review_sessions(
    id, daily_assignment_id, assignment_item_id, child_id, parent_user_id,
    snapshot_fingerprint, stage
  ) values (
    p_review_session_id, p_assignment_id, p_review_item_id, p_child_id,
    p_parent_user_id, p_snapshot#>>'{provenance,sourceFingerprint}',
    'challenge_selection'
  );

  for v_target in select value from jsonb_array_elements(p_snapshot->'targets')
  loop
    insert into public.adle_review_word_encounters(
      id, review_session_id, schedule_word_id, canonical_word_id,
      target_order, repair_state
    ) values (
      (v_target->>'encounterId')::uuid,
      p_review_session_id,
      (v_target#>>'{schedule,scheduleWordId}')::uuid,
      (v_target->>'canonicalWordId')::uuid,
      (v_target->>'order')::integer,
      'not_required'
    );
  end loop;

  insert into public.adle_today_session_orchestrations(
    daily_assignment_id, child_id, parent_user_id, assignment_date,
    major_stage, review_generation_status, specialist_generation_status
  ) values (
    p_assignment_id, p_child_id, p_parent_user_id, p_plan_date,
    'review', 'ready', 'not_started'
  );

  return jsonb_build_object(
    'outcome', 'created', 'assignmentId', p_assignment_id,
    'reviewSessionId', p_review_session_id,
    'snapshotFingerprint', p_snapshot#>>'{provenance,sourceFingerprint}'
  );
end;
$$;

create or replace function public.transition_adle_review_writing_r6(
  p_review_session_id uuid,
  p_snapshot_fingerprint text,
  p_transition_kind text,
  p_challenge_type text,
  p_draft_text text,
  p_extension_seconds integer,
  p_authorized_parent_user_id uuid,
  p_expected_state_version integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_assignment public.daily_assignments%rowtype;
  v_prompt_id uuid;
  v_receipt public.adle_review_transition_receipts%rowtype;
  v_request_fingerprint text;
  v_next_version integer;
begin
  if p_transition_kind not in ('select_prompt', 'start_writing', 'save_draft', 'extend_writing')
    or nullif(btrim(p_idempotency_key), '') is null
    or p_expected_state_version < 0
  then raise exception 'invalid_review_r6_writing_transition'; end if;
  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found then raise exception 'review_session_not_found'; end if;
  select * into v_assignment from public.daily_assignments
  where id = v_session.daily_assignment_id for share;
  if v_session.snapshot_fingerprint <> p_snapshot_fingerprint
    or v_assignment.compiled_review_snapshot is null
  then raise exception 'review_snapshot_fingerprint_conflict'; end if;

  v_request_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'sessionId', p_review_session_id, 'kind', p_transition_kind,
    'challengeType', p_challenge_type, 'draftText', p_draft_text,
    'extensionSeconds', p_extension_seconds,
    'authorizedParentUserId', p_authorized_parent_user_id,
    'expectedStateVersion', p_expected_state_version
  )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.adle_review_transition_receipts
  where review_session_id = p_review_session_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_request_fingerprint then
      raise exception 'review_idempotency_conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'stateVersion', v_receipt.resulting_state_version);
  end if;
  if v_session.state_version <> p_expected_state_version then
    raise exception 'review_state_version_conflict';
  end if;

  if p_transition_kind in ('select_prompt', 'start_writing') then
    select (prompt->>'promptVersionId')::uuid into v_prompt_id
    from jsonb_array_elements(v_assignment.compiled_review_snapshot->'promptCandidates') prompt
    where prompt->>'challengeType' = p_challenge_type;
    if v_prompt_id is null then raise exception 'review_prompt_not_frozen'; end if;
  end if;

  v_next_version := v_session.state_version + 1;
  if p_transition_kind = 'select_prompt' then
    if v_session.writing_started_at is not null or v_session.completed_at is not null
      then raise exception 'review_prompt_choice_locked'; end if;
    update public.adle_review_sessions set selected_prompt_version_id = v_prompt_id,
      selected_challenge_type = p_challenge_type, state_version = v_next_version,
      updated_at = timezone('utc', now()) where id = p_review_session_id;
  elsif p_transition_kind = 'start_writing' then
    if v_session.writing_started_at is not null or v_session.stage <> 'challenge_selection'
      then raise exception 'review_writing_already_started'; end if;
    update public.adle_review_sessions set selected_prompt_version_id = v_prompt_id,
      selected_challenge_type = p_challenge_type, stage = 'creative_writing',
      writing_started_at = clock_timestamp(),
      writing_deadline_at = clock_timestamp() + interval '10 minutes',
      state_version = v_next_version, updated_at = timezone('utc', now())
    where id = p_review_session_id;
  elsif p_transition_kind = 'save_draft' then
    if v_session.stage not in ('creative_writing', 'challenge_selection')
      or v_session.submitted_writing_text is not null
      then raise exception 'review_draft_locked'; end if;
    update public.adle_review_sessions set draft_text = coalesce(p_draft_text, ''),
      state_version = v_next_version, updated_at = timezone('utc', now())
    where id = p_review_session_id;
  else
    if p_extension_seconds not in (300, 600, 900)
      or p_authorized_parent_user_id is distinct from v_session.parent_user_id
      or v_session.extension_seconds is not null
      or v_session.writing_started_at is null or v_session.writing_deadline_at is null
      or clock_timestamp() < v_session.writing_deadline_at
      or v_session.submitted_writing_text is not null
    then raise exception 'review_extension_not_eligible'; end if;
    update public.adle_review_sessions set
      stage = 'creative_writing', extension_seconds = p_extension_seconds,
      extension_authorized_parent_user_id = p_authorized_parent_user_id,
      extension_authorized_at = clock_timestamp(),
      writing_deadline_at = clock_timestamp()
        + make_interval(secs => p_extension_seconds),
      state_version = v_next_version, updated_at = timezone('utc', now())
    where id = p_review_session_id;
  end if;

  insert into public.adle_review_transition_receipts(
    review_session_id, idempotency_key, transition_kind,
    request_fingerprint, resulting_state_version
  ) values (
    p_review_session_id, p_idempotency_key, p_transition_kind,
    v_request_fingerprint, v_next_version
  );
  return jsonb_build_object('ok', true, 'replayed', false, 'stateVersion', v_next_version);
end;
$$;

create or replace function public.finalize_adle_review_stage_r6(
  p_review_session_id uuid,
  p_snapshot_fingerprint text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.adle_review_sessions%rowtype;
  v_result jsonb;
  v_receipt_id uuid;
begin
  select * into v_session from public.adle_review_sessions
  where id = p_review_session_id for update;
  if not found then raise exception 'review_session_not_found'; end if;
  perform set_config('adle.r6_per_word_writer', 'on', true);
  v_result := public.finalize_adle_review_r5(
    p_review_session_id, p_snapshot_fingerprint, p_idempotency_key
  );
  select id into v_receipt_id from public.adle_review_completion_receipts
  where review_session_id = p_review_session_id;
  update public.assignment_items set status = 'completed'
  where id = v_session.assignment_item_id
    and daily_assignment_id = v_session.daily_assignment_id;
  update public.adle_today_session_orchestrations set
    major_stage = 'specialist_generation',
    review_generation_status = 'completed',
    specialist_generation_status = case
      when specialist_generation_status = 'not_started' then 'generating'
      else specialist_generation_status end,
    review_completed_at = coalesce(review_completed_at, (v_result->>'completedAt')::timestamptz),
    completion_receipt_id = coalesce(completion_receipt_id, v_receipt_id),
    state_version = state_version + case when major_stage = 'review' then 1 else 0 end,
    updated_at = timezone('utc', now())
  where daily_assignment_id = v_session.daily_assignment_id
    and major_stage in ('review', 'specialist_generation');
  return v_result || jsonb_build_object(
    'assignmentItemCompleted', true,
    'nextMajorStage', 'specialist_generation'
  );
end;
$$;

create or replace function public.complete_adle_review_only_session_r6(
  p_daily_assignment_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_orchestration public.adle_today_session_orchestrations%rowtype;
begin
  select * into v_orchestration from public.adle_today_session_orchestrations
  where daily_assignment_id = p_daily_assignment_id for update;
  if not found then raise exception 'adle_today_session_not_found'; end if;
  if v_orchestration.major_stage = 'session_complete' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if v_orchestration.major_stage <> 'specialist_generation'
    or v_orchestration.review_generation_status <> 'completed'
    or exists (
      select 1 from public.assignment_items item
      where item.daily_assignment_id = p_daily_assignment_id
        and item.id <> (select assignment_item_id from public.adle_review_sessions
          where daily_assignment_id = p_daily_assignment_id)
    )
  then raise exception 'adle_review_only_completion_conflict'; end if;
  update public.adle_today_session_orchestrations set
    major_stage = 'session_complete', specialist_generation_status = 'not_due',
    session_completed_at = clock_timestamp(), state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where daily_assignment_id = p_daily_assignment_id;
  update public.daily_assignments set status = 'completed'
  where id = p_daily_assignment_id;
  return jsonb_build_object('ok', true, 'replayed', false,
    'nextMajorStage', 'session_complete');
end;
$$;

-- Lesson-only days also participate in the same major-stage state machine.
-- The function is inert for children outside the explicitly active R6 scope.
create or replace function public.adopt_adle_specialist_only_session_r6(
  p_daily_assignment_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_rollout_state text;
begin
  select * into v_assignment from public.daily_assignments
  where id = p_daily_assignment_id for update;
  if not found then raise exception 'adle_specialist_only_assignment_not_found'; end if;
  select rollout_state into v_rollout_state
  from public.adle_review_r6_child_rollouts
  where child_id = v_assignment.child_id;
  if v_rollout_state is distinct from 'active' then
    return jsonb_build_object('ok', true, 'adopted', false, 'reason', 'scope_inactive');
  end if;
  if exists (select 1 from public.adle_review_sessions review
    where review.daily_assignment_id = p_daily_assignment_id)
  then raise exception 'adle_specialist_only_review_conflict'; end if;
  if not ((v_assignment.title = 'ADLE Daily Plan'
      and v_assignment.assignment_generation_source = 'adle_composer_v1')
    or (v_assignment.title = 'ADLE Base-word Family Pilot'
      and v_assignment.assignment_generation_source = 'adle_base_word_family_pilot_v1'))
  then raise exception 'adle_specialist_only_header_unrecognized'; end if;
  insert into public.adle_today_session_orchestrations(
    daily_assignment_id, child_id, parent_user_id, assignment_date,
    major_stage, review_generation_status, specialist_generation_status,
    specialist_started_at, session_completed_at
  ) values (
    v_assignment.id, v_assignment.child_id, v_assignment.parent_user_id,
    v_assignment.assignment_date,
    case when v_assignment.status = 'completed' then 'session_complete'
      else 'specialist_lesson' end,
    'not_required', 'ready',
    case when v_assignment.status <> 'completed' then clock_timestamp() else null end,
    case when v_assignment.status = 'completed' then clock_timestamp() else null end
  ) on conflict (daily_assignment_id) do nothing;
  return jsonb_build_object('ok', true, 'adopted', true,
    'nextMajorStage', case when v_assignment.status = 'completed'
      then 'session_complete' else 'specialist_lesson' end);
end;
$$;

create or replace function public.retry_adle_specialist_generation_r6(
  p_daily_assignment_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_orchestration public.adle_today_session_orchestrations%rowtype;
begin
  select * into v_orchestration from public.adle_today_session_orchestrations
  where daily_assignment_id = p_daily_assignment_id for update;
  if not found then raise exception 'adle_today_session_not_found'; end if;
  if v_orchestration.major_stage = 'blocked'
    and v_orchestration.specialist_generation_status = 'blocked'
    and v_orchestration.review_generation_status = 'completed'
  then
    update public.adle_today_session_orchestrations set
      major_stage = 'specialist_generation', specialist_generation_status = 'generating',
      blocker_code = null, state_version = state_version + 1,
      updated_at = timezone('utc', now())
    where daily_assignment_id = p_daily_assignment_id;
    return jsonb_build_object('ok', true, 'retried', true);
  end if;
  if v_orchestration.major_stage in ('specialist_generation','session_complete') then
    return jsonb_build_object('ok', true, 'retried', false);
  end if;
  raise exception 'adle_specialist_generation_retry_not_eligible';
end;
$$;

create or replace function public.block_adle_specialist_generation_r6(
  p_daily_assignment_id uuid, p_blocker_code text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if nullif(btrim(p_blocker_code), '') is null then
    raise exception 'adle_specialist_blocker_code_required'; end if;
  update public.adle_today_session_orchestrations set
    major_stage = 'blocked', specialist_generation_status = 'blocked',
    blocker_code = left(p_blocker_code, 240), state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where daily_assignment_id = p_daily_assignment_id
    and major_stage = 'specialist_generation'
    and review_generation_status = 'completed';
  if not found and not exists (select 1 from public.adle_today_session_orchestrations
    where daily_assignment_id = p_daily_assignment_id and major_stage = 'blocked'
      and specialist_generation_status = 'blocked')
  then raise exception 'adle_specialist_generation_block_not_eligible'; end if;
  return jsonb_build_object('ok', true, 'nextMajorStage', 'blocked');
end;
$$;

-- A route adapter supplies one complete, already validated specialist snapshot
-- and its items. The function permits the single null -> valid snapshot append.
create or replace function public.append_adle_specialist_stage_r6(
  p_daily_assignment_id uuid,
  p_snapshot jsonb,
  p_items jsonb,
  p_intakes jsonb,
  p_lesson_route_metadata jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_orchestration public.adle_today_session_orchestrations%rowtype;
  v_item jsonb;
  v_intake jsonb;
  v_position integer;
begin
  select * into v_assignment from public.daily_assignments
  where id = p_daily_assignment_id for update;
  select * into v_orchestration from public.adle_today_session_orchestrations
  where daily_assignment_id = p_daily_assignment_id for update;
  if not found or v_orchestration.major_stage <> 'specialist_generation'
    then raise exception 'adle_specialist_append_not_eligible'; end if;
  if v_assignment.compiled_lesson_snapshot is not null then
    if v_assignment.compiled_lesson_snapshot#>>'{provenance,sourceFingerprint}'
      is distinct from p_snapshot#>>'{provenance,sourceFingerprint}'
      then raise exception 'adle_specialist_append_idempotency_conflict'; end if;
    return jsonb_build_object('ok', true, 'replayed', true,
      'nextMajorStage', 'specialist_lesson');
  end if;
  if not public.adle_lesson_snapshot_is_structurally_valid(p_snapshot)
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
    or jsonb_typeof(p_intakes) <> 'array'
    then raise exception 'adle_specialist_append_invalid_contract'; end if;
  perform set_config('adle.r6_specialist_append', 'on', true);
  update public.daily_assignments set
    compiled_lesson_snapshot = p_snapshot,
    lesson_route_metadata = p_lesson_route_metadata,
    target_words = array(select distinct value order by value from unnest(
      target_words || array(select item->>'targetWord'
        from jsonb_array_elements(p_items) item
        where nullif(btrim(item->>'targetWord'), '') is not null)
    ) value)
  where id = p_daily_assignment_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    -- Review owns position 0; specialist compilers retain their immutable
    -- 1-based item bindings so snapshot validation remains exact.
    v_position := (v_item->>'position')::integer;
    insert into public.assignment_items(
      id, daily_assignment_id, child_id, parent_user_id, domain_module,
      item_type, source_type, source_entity_id, learning_item_id,
      template_key, target_word, position, status, prompt_data, metadata
    ) values (
      coalesce((v_item->>'id')::uuid, gen_random_uuid()), p_daily_assignment_id,
      v_assignment.child_id, v_assignment.parent_user_id,
      v_item->>'domainModule', v_item->>'itemType', v_item->>'sourceType',
      v_item->>'sourceEntityId', null, v_item->>'templateKey',
      nullif(v_item->>'targetWord', ''), v_position, 'pending',
      coalesce(v_item->'promptData', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;
  for v_intake in select value from jsonb_array_elements(p_intakes)
  loop
    if v_intake->>'childId' <> v_assignment.child_id::text
      or nullif(btrim(v_intake->>'canonicalWordId'), '') is null
      or nullif(btrim(v_intake->>'microSkillKey'), '') is null
      or nullif(btrim(v_intake->>'itemStatus'), '') is null
      or nullif(btrim(v_intake->>'sourceKind'), '') is null
      or nullif(btrim(v_intake->>'sourceRef'), '') is null
      or jsonb_typeof(v_intake->'reteachPriority') <> 'boolean'
      or coalesce(v_intake->>'intakeOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or v_intake->>'rowStatus' <> 'active'
    then raise exception 'adle_specialist_append_intake_invalid'; end if;
    update public.adle_learning_items set
      row_status = 'superseded', updated_at = timezone('utc', now())
    where child_id = v_assignment.child_id
      and canonical_word_id = (v_intake->>'canonicalWordId')::uuid
      and micro_skill_key = v_intake->>'microSkillKey'
      and row_status = 'active';
    insert into public.adle_learning_items(
      child_id, canonical_word_id, micro_skill_key, item_status, source_kind,
      source_ref, source_attempt_text, reteach_priority, ejected_on,
      intake_on, row_status
    ) values (
      v_assignment.child_id, (v_intake->>'canonicalWordId')::uuid,
      v_intake->>'microSkillKey', v_intake->>'itemStatus',
      v_intake->>'sourceKind', v_intake->>'sourceRef',
      nullif(v_intake->>'sourceAttemptText', ''),
      coalesce((v_intake->>'reteachPriority')::boolean, false),
      nullif(v_intake->>'ejectedOn', '')::date,
      (v_intake->>'intakeOn')::date, 'active'
    );
  end loop;
  update public.adle_today_session_orchestrations set
    major_stage = 'specialist_lesson', specialist_generation_status = 'ready',
    specialist_started_at = clock_timestamp(), state_version = state_version + 1,
    updated_at = timezone('utc', now())
  where daily_assignment_id = p_daily_assignment_id;
  return jsonb_build_object('ok', true, 'replayed', false,
    'nextMajorStage', 'specialist_lesson');
end;
$$;

create or replace function public.persist_adle_specialist_checkpoint_r6(
  p_daily_assignment_id uuid,
  p_child_id uuid,
  p_parent_user_id uuid,
  p_adapter_key text,
  p_checkpoint_schema_version text,
  p_lesson_snapshot_fingerprint text,
  p_checkpoint_payload jsonb,
  p_expected_state_version integer,
  p_mark_completed boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.daily_assignments%rowtype;
  v_checkpoint public.adle_specialist_stage_checkpoints%rowtype;
begin
  select * into v_assignment from public.daily_assignments
  where id = p_daily_assignment_id and child_id = p_child_id
    and parent_user_id = p_parent_user_id for share;
  if not found or v_assignment.compiled_lesson_snapshot is null
    or v_assignment.status = 'completed'
    or v_assignment.compiled_lesson_snapshot#>>'{provenance,sourceFingerprint}'
      <> p_lesson_snapshot_fingerprint
    or jsonb_typeof(p_checkpoint_payload) <> 'object'
    or not exists (select 1 from public.adle_today_session_orchestrations orchestration
      where orchestration.daily_assignment_id = p_daily_assignment_id
        and orchestration.major_stage = 'specialist_lesson')
  then raise exception 'adle_specialist_checkpoint_authority_conflict'; end if;
  select * into v_checkpoint from public.adle_specialist_stage_checkpoints
  where daily_assignment_id = p_daily_assignment_id for update;
  if found then
    if v_checkpoint.state_version <> p_expected_state_version
      or v_checkpoint.adapter_key <> p_adapter_key
      or v_checkpoint.checkpoint_schema_version <> p_checkpoint_schema_version
      or v_checkpoint.lesson_snapshot_fingerprint <> p_lesson_snapshot_fingerprint
      or v_checkpoint.completed_at is not null
    then raise exception 'adle_specialist_checkpoint_state_conflict'; end if;
    update public.adle_specialist_stage_checkpoints set
      checkpoint_payload = p_checkpoint_payload,
      state_version = state_version + 1,
      completed_at = case when p_mark_completed then clock_timestamp() else null end,
      updated_at = timezone('utc', now())
    where daily_assignment_id = p_daily_assignment_id;
    return jsonb_build_object('ok', true, 'stateVersion', p_expected_state_version + 1);
  end if;
  if p_expected_state_version <> 0 then raise exception 'adle_specialist_checkpoint_state_conflict'; end if;
  insert into public.adle_specialist_stage_checkpoints(
    daily_assignment_id, child_id, parent_user_id, adapter_key,
    checkpoint_schema_version, lesson_snapshot_fingerprint,
    checkpoint_payload, state_version, completed_at
  ) values (
    p_daily_assignment_id, p_child_id, p_parent_user_id, p_adapter_key,
    p_checkpoint_schema_version, p_lesson_snapshot_fingerprint,
    p_checkpoint_payload, 1,
    case when p_mark_completed then clock_timestamp() else null end
  );
  return jsonb_build_object('ok', true, 'stateVersion', 1);
end;
$$;

create or replace function public.converge_adle_today_session_completion_r6()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    update public.adle_specialist_stage_checkpoints set
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = timezone('utc', now())
    where daily_assignment_id = new.id;
    update public.adle_today_session_orchestrations set
      major_stage = 'session_complete',
      specialist_generation_status = case
        when new.compiled_lesson_snapshot is null then 'not_due' else 'ready' end,
      session_completed_at = coalesce(session_completed_at, clock_timestamp()),
      blocker_code = null,
      state_version = state_version + 1,
      updated_at = timezone('utc', now())
    where daily_assignment_id = new.id and major_stage <> 'session_complete';
  end if;
  return new;
end;
$$;

drop trigger if exists daily_assignments_r6_session_completion_convergence
  on public.daily_assignments;
create trigger daily_assignments_r6_session_completion_convergence
after update of status on public.daily_assignments
for each row execute function public.converge_adle_today_session_completion_r6();

alter table public.adle_today_session_orchestrations enable row level security;
alter table public.adle_specialist_stage_checkpoints enable row level security;
alter table public.adle_review_r6_authority_cutover_receipts enable row level security;
alter table public.adle_review_r6_child_rollouts enable row level security;
alter table public.adle_review_r6_approval_receipts enable row level security;

revoke all on table public.adle_today_session_orchestrations from anon, authenticated;
revoke all on table public.adle_specialist_stage_checkpoints from anon, authenticated;
revoke all on table public.adle_review_r6_authority_cutover_receipts from anon, authenticated;
revoke all on table public.adle_review_r6_child_rollouts from anon, authenticated;
revoke all on table public.adle_review_r6_approval_receipts from anon, authenticated;
grant all on table public.adle_today_session_orchestrations to service_role;
grant all on table public.adle_specialist_stage_checkpoints to service_role;
grant all on table public.adle_review_r6_authority_cutover_receipts to service_role;
grant all on table public.adle_review_r6_child_rollouts to service_role;
grant all on table public.adle_review_r6_approval_receipts to service_role;

revoke all on function public.persist_adle_review_assignment_r6(
  uuid,uuid,date,uuid,uuid,uuid,jsonb
) from public, anon, authenticated;
revoke all on function public.transition_adle_review_writing_r6(
  uuid,text,text,text,text,integer,uuid,integer,text
) from public, anon, authenticated;
revoke all on function public.finalize_adle_review_stage_r6(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.complete_adle_review_only_session_r6(uuid)
  from public, anon, authenticated;
revoke all on function public.adopt_adle_specialist_only_session_r6(uuid)
  from public, anon, authenticated;
revoke all on function public.retry_adle_specialist_generation_r6(uuid)
  from public, anon, authenticated;
revoke all on function public.block_adle_specialist_generation_r6(uuid,text)
  from public, anon, authenticated;
revoke all on function public.append_adle_specialist_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.persist_adle_specialist_checkpoint_r6(
  uuid,uuid,uuid,text,text,text,jsonb,integer,boolean
) from public, anon, authenticated;
revoke all on function public.quiesce_adle_review_r6_scope(uuid[],text)
  from public, anon, authenticated;
revoke all on function public.adle_review_schedule_authority_rows_r6(uuid[])
  from public, anon, authenticated;
revoke all on function public.audit_adle_review_schedule_authority_r6(uuid[],date)
  from public, anon, authenticated;
revoke all on function public.apply_adle_review_schedule_authority_cutover_r6(
  uuid[],date,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.activate_adle_review_r6_scope(uuid[],text)
  from public, anon, authenticated;
revoke all on function public.pause_adle_review_r6_scope(uuid[])
  from public, anon, authenticated;
grant execute on function public.persist_adle_review_assignment_r6(
  uuid,uuid,date,uuid,uuid,uuid,jsonb
) to service_role;
grant execute on function public.transition_adle_review_writing_r6(
  uuid,text,text,text,text,integer,uuid,integer,text
) to service_role;
grant execute on function public.finalize_adle_review_stage_r6(uuid,text,text)
  to service_role;
grant execute on function public.complete_adle_review_only_session_r6(uuid)
  to service_role;
grant execute on function public.adopt_adle_specialist_only_session_r6(uuid)
  to service_role;
grant execute on function public.retry_adle_specialist_generation_r6(uuid)
  to service_role;
grant execute on function public.block_adle_specialist_generation_r6(uuid,text)
  to service_role;
grant execute on function public.append_adle_specialist_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.persist_adle_specialist_checkpoint_r6(
  uuid,uuid,uuid,text,text,text,jsonb,integer,boolean
) to service_role;
grant execute on function public.quiesce_adle_review_r6_scope(uuid[],text)
  to service_role;
grant execute on function public.adle_review_schedule_authority_rows_r6(uuid[])
  to service_role;
grant execute on function public.audit_adle_review_schedule_authority_r6(uuid[],date)
  to service_role;
grant execute on function public.apply_adle_review_schedule_authority_cutover_r6(
  uuid[],date,text,text,text,text
) to service_role;
grant execute on function public.activate_adle_review_r6_scope(uuid[],text)
  to service_role;
grant execute on function public.pause_adle_review_r6_scope(uuid[])
  to service_role;

comment on table public.adle_today_session_orchestrations is
  'R6 major-stage authority. Review and specialist runtimes retain their own internal state.';
comment on table public.adle_review_r6_child_rollouts is
  'Database-backed, owner-gated learner scope. The migration inserts no rows and activates nobody.';
comment on table public.adle_review_r6_authority_cutover_receipts is
  'Append-only Gate B proof that authority changed once while protected scheduling state remained byte-equivalent.';
