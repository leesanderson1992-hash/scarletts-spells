-- ADLE Slice 2 (2A): review-scheduler storage — per-child review bundles,
-- per-word schedule state, taught/probed history, the append-only outcome
-- ledger, and the versioned review-policy registry.
-- Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
-- (review model; 2026-07-04 amendment items 5, 6, 8) and the approved
-- adle-word-complexity-banding-and-formula-numbers-proposal.md (§3.4, §4b).
-- Local/dev only per docs/operations/supabase-migration-policy.md.
--
-- The scheduler owns schedule facts only: no evidence scores, no
-- learning_items, no reward state. Day-advance transitions live in
-- lib/adle/review-scheduler.ts; "bundles only move forward" is a property of
-- that logic (there is no demotion path) with the outcome ledger as the
-- verifiable audit trail.

create table if not exists public.adle_review_policy_versions (
  schedule_policy_version text primary key,
  is_active boolean not null default false,
  interval_ladder_days integer[] not null,
  catch_up_offsets_days integer[] not null,
  session_cap integer not null,
  pre_retirement_check_gap_days integer not null,
  formula_reference text not null,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_policy_versions_key_check
    check (btrim(schedule_policy_version) <> ''),
  constraint adle_review_policy_versions_ladder_check
    check (array_length(interval_ladder_days, 1) >= 1),
  constraint adle_review_policy_versions_offsets_check
    check (array_length(catch_up_offsets_days, 1) = 2),
  constraint adle_review_policy_versions_cap_check
    check (session_cap >= 1),
  constraint adle_review_policy_versions_check_gap_check
    check (pre_retirement_check_gap_days >= 1),
  constraint adle_review_policy_versions_reference_check
    check (btrim(formula_reference) <> ''),
  constraint adle_review_policy_versions_activated_check
    check (is_active = false or activated_at is not null)
);

-- Exactly one active review policy at a time; the active policy owns the
-- ladder, catch-up offsets, session cap, and pre-retirement check gap.
create unique index if not exists adle_review_policy_versions_one_active_idx
  on public.adle_review_policy_versions((true))
  where is_active = true;

create table if not exists public.adle_review_bundles (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  source_ref text not null,
  interval_index integer not null default 0,
  next_due_on date not null,
  schedule_policy_version text not null
    references public.adle_review_policy_versions(schedule_policy_version) on delete restrict,
  bundle_status text not null default 'active',
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_bundles_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_review_bundles_interval_index_check
    check (interval_index >= 0),
  constraint adle_review_bundles_bundle_status_check
    check (bundle_status = any (array['active', 'completed'])),
  constraint adle_review_bundles_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create index if not exists adle_review_bundles_child_idx
  on public.adle_review_bundles(child_id);
create index if not exists adle_review_bundles_child_due_idx
  on public.adle_review_bundles(child_id, next_due_on)
  where bundle_status = 'active' and row_status = 'active';

create table if not exists public.adle_review_schedule_words (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  bundle_id uuid not null references public.adle_review_bundles(id) on delete restrict,
  membership_status text not null default 'scheduled',
  catch_up_stage integer not null default 0,
  next_retest_due_on date,
  failed_review_on date,
  pre_retirement_check_due_on date,
  last_28_day_review_on date,
  reteach_cycle_count integer not null default 0,
  taught_on date not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_schedule_words_membership_check
    check (membership_status = any (array[
      'scheduled',
      'catch_up',
      'ejected_pending_reteach',
      'paused_parent_review',
      'awaiting_pre_retirement_check',
      'retired'
    ])),
  constraint adle_review_schedule_words_stage_check
    check (catch_up_stage between 0 and 2),
  -- A catch-up word always carries its retest due date, its anchoring failed
  -- review date, and a live stage (amendment item 5: +1 then +3).
  constraint adle_review_schedule_words_catch_up_state_check
    check (
      membership_status <> 'catch_up'
      or (catch_up_stage in (1, 2) and next_retest_due_on is not null and failed_review_on is not null)
    ),
  -- A word awaiting its conditional pre-retirement check always carries the
  -- check's due date (amendment item 6).
  constraint adle_review_schedule_words_check_state_check
    check (
      membership_status <> 'awaiting_pre_retirement_check'
      or pre_retirement_check_due_on is not null
    ),
  constraint adle_review_schedule_words_reteach_count_check
    check (reteach_cycle_count >= 0),
  constraint adle_review_schedule_words_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

-- One active schedule row per (child, word); reteach re-entry (Slice 3)
-- supersedes and inserts rather than resetting history.
create unique index if not exists adle_review_schedule_words_active_child_word_idx
  on public.adle_review_schedule_words(child_id, canonical_word_id)
  where row_status = 'active';
create index if not exists adle_review_schedule_words_bundle_idx
  on public.adle_review_schedule_words(bundle_id);
create index if not exists adle_review_schedule_words_child_retest_idx
  on public.adle_review_schedule_words(child_id, next_retest_due_on)
  where membership_status = 'catch_up' and row_status = 'active';
create index if not exists adle_review_schedule_words_child_check_idx
  on public.adle_review_schedule_words(child_id, pre_retirement_check_due_on)
  where membership_status = 'awaiting_pre_retirement_check' and row_status = 'active';

-- Append-only per-child taught/probed word events: the storage truth behind
-- eligibility status 4 (review-eligible) in lib/adle/dictionary-eligibility.ts.
-- Written by the Slice 3 composer on lesson/probe completion; until then only
-- fixtures and guarded local scripts write here.
create table if not exists public.adle_taught_word_history (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  event_kind text not null,
  occurred_on date not null,
  source_ref text not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_taught_word_history_event_kind_check
    check (event_kind = any (array['taught', 'probed'])),
  constraint adle_taught_word_history_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_taught_word_history_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create index if not exists adle_taught_word_history_child_word_idx
  on public.adle_taught_word_history(child_id, canonical_word_id);

-- Append-only scheduler outcome ledger: the audit trail that makes "bundles
-- only move forward" verifiable and the fact stream the Slice 4 evidence
-- engine prices. The scheduler records outcomes; it never computes evidence.
create table if not exists public.adle_review_outcome_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  bundle_id uuid references public.adle_review_bundles(id) on delete restrict,
  event_type text not null,
  occurred_on date not null,
  interval_index integer,
  schedule_policy_version text not null
    references public.adle_review_policy_versions(schedule_policy_version) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_review_outcome_events_type_check
    check (event_type = any (array[
      'review_pass',
      'review_fail',
      'retest_pass',
      'retest_fail',
      'ejected',
      'reteach_priority_flagged',
      'paused_parent_review',
      'retirement_check_scheduled',
      'retirement_check_pass',
      'retirement_check_fail',
      'retired'
    ])),
  constraint adle_review_outcome_events_interval_index_check
    check (interval_index is null or interval_index >= 0)
);

create index if not exists adle_review_outcome_events_child_word_idx
  on public.adle_review_outcome_events(child_id, canonical_word_id, occurred_on);
create index if not exists adle_review_outcome_events_bundle_idx
  on public.adle_review_outcome_events(bundle_id);

alter table public.adle_review_policy_versions enable row level security;
alter table public.adle_review_bundles enable row level security;
alter table public.adle_review_schedule_words enable row level security;
alter table public.adle_taught_word_history enable row level security;
alter table public.adle_review_outcome_events enable row level security;

revoke all on table public.adle_review_policy_versions from anon, authenticated;
revoke all on table public.adle_review_bundles from anon, authenticated;
revoke all on table public.adle_review_schedule_words from anon, authenticated;
revoke all on table public.adle_taught_word_history from anon, authenticated;
revoke all on table public.adle_review_outcome_events from anon, authenticated;

grant all on table public.adle_review_policy_versions to service_role;
grant all on table public.adle_review_bundles to service_role;
grant all on table public.adle_review_schedule_words to service_role;
grant all on table public.adle_taught_word_history to service_role;
grant all on table public.adle_review_outcome_events to service_role;

-- Registry seed: the owner-approved review policy v1 is active from day one.
-- Ladder values are rolling gaps from the previous review (owner-confirmed
-- 2026-07-05); catch-up offsets are days after the failed review; the
-- pre-retirement check is due this many days after a non-clean 56-day pass.
insert into public.adle_review_policy_versions
  (schedule_policy_version, is_active, interval_ladder_days, catch_up_offsets_days,
   session_cap, pre_retirement_check_gap_days, formula_reference, activated_at)
values (
  'review_policy_v1_2026-07-04',
  true,
  array[1, 3, 7, 14, 28, 56],
  array[1, 3],
  10,
  112,
  'docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md',
  timezone('utc', now())
)
on conflict (schedule_policy_version) do nothing;
