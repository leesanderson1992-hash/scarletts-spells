-- ADLE Slice 4 (4A): evidence-engine storage — the versioned evidence-policy
-- registry and the two append-only fact streams that exist nowhere else
-- (authentic use, slippage). Policy sources:
-- adle-daily-assignment-and-evidence-blueprint-contract.md (evidence model;
-- 2026-07-04 amendment items 2/3/7; 2026-07-05 amendment item 3) and the
-- approved formula-numbers proposal (§3.1, §3.2).
-- Local/dev only per docs/operations/supabase-migration-policy.md.
--
-- Deliberately absent (owner-approved storage shape, Slice 4 plan open
-- question 2): no stored evidence scores, no persisted priced-event ledger,
-- no word-state column anywhere. Pricing and states are pure recomputations
-- in lib/adle/ over these facts plus the Slice 2/3 fact streams.

create table if not exists public.adle_evidence_policy_versions (
  evidence_policy_version text primary key,
  is_active boolean not null default false,
  -- The v1 weight table (blueprint "Evidence model"), keyed by evidence kind.
  weights jsonb not null,
  -- deduction = -(deduction_multiplier x the context's positive weight)
  -- (2026-07-04 amendment item 2 / proposal §3.1).
  deduction_multiplier numeric not null,
  -- cold = no ADLE exposure of the word for this many days.
  cold_gap_days integer not null,
  -- cold-dictation credit at most once per word per this many days.
  cold_credit_cap_days integer not null,
  -- productions weighted >= this count as unprompted (proposal §3.2).
  unprompted_weight_threshold numeric not null,
  -- secure/mastered transition edges (proposal §3.2), as self-describing jsonb.
  secure_edge jsonb not null,
  mastered_edge jsonb not null,
  -- limit N: the (N+1)th slip rejoins the next lesson (blueprint deductions).
  slip_limit integer not null,
  -- skill-family key whose words carry no plain-dictation evidence.
  homophone_family_key text not null,
  formula_reference text not null,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_evidence_policy_versions_key_check
    check (btrim(evidence_policy_version) <> ''),
  constraint adle_evidence_policy_versions_multiplier_check
    check (deduction_multiplier > 0 and deduction_multiplier <= 1),
  constraint adle_evidence_policy_versions_cold_gap_check
    check (cold_gap_days >= 1),
  constraint adle_evidence_policy_versions_cold_cap_check
    check (cold_credit_cap_days >= 1),
  constraint adle_evidence_policy_versions_threshold_check
    check (unprompted_weight_threshold > 0),
  constraint adle_evidence_policy_versions_slip_limit_check
    check (slip_limit >= 1),
  constraint adle_evidence_policy_versions_family_check
    check (btrim(homophone_family_key) <> ''),
  constraint adle_evidence_policy_versions_reference_check
    check (btrim(formula_reference) <> ''),
  constraint adle_evidence_policy_versions_activated_check
    check (is_active = false or activated_at is not null)
);

create unique index if not exists adle_evidence_policy_versions_one_active_idx
  on public.adle_evidence_policy_versions((true))
  where is_active = true;

-- Append-only per-child authentic-use facts: the storage truth behind the
-- real AuthenticUseProvider (Slice 2 amendment item 6 retirement decision),
-- the authentic-use review credit (blueprint 2026-07-05 amendment item 3),
-- and the mastered edge's parent gate. v1 intake writes parent-verified rows
-- only (fail-closed bridge from Review Work truth plus the owner-confirmed
-- corpus preview scan); the parent_verified column keeps the shape honest
-- for a future unverified-accrual path.
create table if not exists public.adle_authentic_use_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  -- The date of the writing itself, not the verification.
  occurred_on date not null,
  verified_at timestamptz,
  use_kind text not null,
  parent_verified boolean not null default false,
  -- Identifies the piece of writing: backs "once per word per piece" and the
  -- review credit's one-credit-per-event consumption audit.
  piece_ref text not null,
  -- Lineage to the writing-engine record this was bridged from.
  source_ref text not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_authentic_use_events_use_kind_check
    check (use_kind = any (array['authentic_correct_use', 'self_correction_in_writing'])),
  constraint adle_authentic_use_events_piece_ref_check
    check (btrim(piece_ref) <> ''),
  constraint adle_authentic_use_events_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_authentic_use_events_verified_check
    check (parent_verified = false or verified_at is not null),
  constraint adle_authentic_use_events_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

-- One credit per word per piece per kind (blueprint caps: self-correction
-- once per word per piece; correct use priced once per piece).
create unique index if not exists adle_authentic_use_events_piece_idx
  on public.adle_authentic_use_events(child_id, canonical_word_id, piece_ref, use_kind)
  where row_status = 'active';
create index if not exists adle_authentic_use_events_child_word_idx
  on public.adle_authentic_use_events(child_id, canonical_word_id, occurred_on);

-- Append-only slip facts for secure/review_retired/mastered words met
-- outside their own scheduled reviews (proposal §3.1 boundary: scheduled
-- review failures are priced by catch-up/ejection, never recorded here).
create table if not exists public.adle_slippage_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  occurred_on date not null,
  -- Prices per the §3.1 deduction table; weak-evidence contexts never deduct
  -- and therefore never appear here.
  context_kind text not null,
  -- Self-corrected in the same piece: no deduction, interval check only.
  self_corrected boolean not null default false,
  attempt_text text,
  source_ref text not null,
  -- 1-based position among the word's slips at detection time; the read
  -- model (lib/adle/slippage.ts) enforces the slip limit — ordinal
  -- slip_limit + 1 triggers lesson re-entry (slippage_reentry intake).
  slip_ordinal integer not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_slippage_events_context_check
    check (context_kind = any (array[
      'authentic_writing',
      'dictation_cold',
      'dictation_recent',
      'controlled_lesson'
    ])),
  constraint adle_slippage_events_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_slippage_events_ordinal_check
    check (slip_ordinal >= 1),
  constraint adle_slippage_events_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create index if not exists adle_slippage_events_child_word_idx
  on public.adle_slippage_events(child_id, canonical_word_id, occurred_on);

alter table public.adle_evidence_policy_versions enable row level security;
alter table public.adle_authentic_use_events enable row level security;
alter table public.adle_slippage_events enable row level security;

revoke all on table public.adle_evidence_policy_versions from anon, authenticated;
revoke all on table public.adle_authentic_use_events from anon, authenticated;
revoke all on table public.adle_slippage_events from anon, authenticated;

grant all on table public.adle_evidence_policy_versions to service_role;
grant all on table public.adle_authentic_use_events to service_role;
grant all on table public.adle_slippage_events to service_role;

-- Registry seed: the owner-approved evidence policy v1 is active from day
-- one. Values mirror lib/adle/evidence-policy.ts EVIDENCE_POLICY_V1 exactly;
-- the regression asserts parity between the two.
insert into public.adle_evidence_policy_versions
  (evidence_policy_version, is_active, weights, deduction_multiplier,
   cold_gap_days, cold_credit_cap_days, unprompted_weight_threshold,
   secure_edge, mastered_edge, slip_limit, homophone_family_key,
   formula_reference, activated_at)
values (
  'evidence_policy_v1_2026-07-04',
  true,
  jsonb_build_object(
    'authentic_correct_use', 2.0,
    'self_correction_in_writing', 1.5,
    'dictation_cold', 1.5,
    'dictation_recent', 0.5,
    'controlled_lesson_spelling', 0.75,
    'guided_or_recognition', 0.25,
    'exposure', 0
  ),
  0.5,
  3,
  28,
  0.5,
  jsonb_build_object(
    'min_productions', 3,
    'min_interval_windows', 2,
    'min_span_days', 7
  ),
  jsonb_build_object(
    'min_score', 8,
    'min_productions', 5,
    'min_distinct_days', 4,
    'min_span_days', 21,
    'requires_parent_reviewed_authentic', true
  ),
  2,
  'D4_HOM',
  'docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md',
  timezone('utc', now())
)
on conflict (evidence_policy_version) do nothing;
