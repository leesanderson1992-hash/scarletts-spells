-- ADLE Slice 3 (3A): daily-assignment-composer storage — reformed word-level
-- learning items, the imported family-method/activity-template registry, and
-- probe-cap bookkeeping, plus the owner-approved raw-attempt-text columns on
-- the Slice 2 tables (owner decision 6, 2026-07-05).
-- Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
-- ("Learning items are word-level"; probe rules; 2026-07-05 amendments),
-- adle-daily-assignment-composer-contract.md (ownership boundaries),
-- adle-instructional-activity-registry-contract.md (registry metadata shape,
-- 2026-07-04 activity-set amendment), and the owner-approved Slice 3 plan
-- (docs/implementation/adle-slice-3-daily-assignment-composer-plan.md).
-- Local/dev only per docs/operations/supabase-migration-policy.md.
--
-- The composer owns intake/selection facts only: no evidence scores, no
-- proficiency, no reward state. The legacy learning_items table is untouched
-- (live writing-engine/Word-Treasure consumers; open question 1).

-- Reformed word-level learning items: one active record per child + word +
-- primary micro-skill key. Clusters are never stored — they are computed at
-- composition time from unresolved items sharing a micro-skill.
create table if not exists public.adle_learning_items (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  canonical_word_id uuid not null
    references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text not null
    references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  item_status text not null default 'pending',
  source_kind text not null,
  source_ref text not null,
  -- The child's raw attempt for probe-miss/ejection/verified-misspelling
  -- intake rows (owner decision 6, 2026-07-05). Storage only in this slice:
  -- never read, priced, or analysed before Slice 4.
  source_attempt_text text,
  reteach_priority boolean not null default false,
  ejected_on date,
  -- Intake date: the "oldest learning item" ordering fact for the pinned
  -- lexicographic tie-breakers and the 5-word fill order.
  intake_on date not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_learning_items_status_check
    check (item_status = any (array[
      'pending',
      'in_lesson',
      'awaiting_review_outcome',
      'resolved',
      'pending_reteach',
      'paused_parent_review'
    ])),
  -- 'stretch_selection' extends the plan's enum: the acceptance criteria
  -- require stretch words to trace to items created at composition (composer
  -- contract: no word-map row creates assignment content by itself), so the
  -- composition's stretch intake needs its own source kind. Flagged for owner
  -- QA in the Slice 3 closeout. 'slippage_reentry' arrives in Slice 4.
  constraint adle_learning_items_source_kind_check
    check (source_kind = any (array[
      'verified_misspelling',
      'probe_miss',
      'review_ejection',
      'slippage_reentry',
      'stretch_selection'
    ])),
  constraint adle_learning_items_source_ref_check
    check (btrim(source_ref) <> ''),
  -- A reteach re-entry always carries its ejection date.
  constraint adle_learning_items_ejection_state_check
    check (source_kind <> 'review_ejection' or ejected_on is not null),
  constraint adle_learning_items_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create unique index if not exists adle_learning_items_active_child_word_skill_idx
  on public.adle_learning_items(child_id, canonical_word_id, micro_skill_key)
  where row_status = 'active';
create index if not exists adle_learning_items_child_status_idx
  on public.adle_learning_items(child_id, item_status)
  where row_status = 'active';
create index if not exists adle_learning_items_child_skill_idx
  on public.adle_learning_items(child_id, micro_skill_key)
  where row_status = 'active';

-- Imported Family Methods sheet (content workbook 2026-07-04.v1). Content
-- data only — the workbook's policy columns are nowhere read at runtime.
create table if not exists public.adle_family_methods (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null,
  core_pedagogy text not null,
  first_exposure_sequence text[] not null,
  -- Template keys split from the sheet's '->' list. May contain the two
  -- documented meta-keys DICTATION_OR_WRITING / SENTENCE_APPLICATION, which
  -- the composer resolves to production templates at composition time.
  guided_question_sequence text[] not null,
  -- Raw sheet value, e.g. 'REVIEW_QUICK_SORT(sound/spelling cue)'; the
  -- composer parses the parenthesised sort dimension and fails closed when
  -- the value is unparseable.
  review_sort_dimension text not null,
  production_task text not null,
  notes text,
  content_version text not null,
  import_batch_id uuid not null
    references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_family_methods_family_key_check
    check (btrim(family_key) <> ''),
  constraint adle_family_methods_sequences_check
    check (
      array_length(first_exposure_sequence, 1) >= 1
      and array_length(guided_question_sequence, 1) >= 1
    ),
  constraint adle_family_methods_sort_dimension_check
    check (btrim(review_sort_dimension) <> ''),
  constraint adle_family_methods_content_version_check
    check (btrim(content_version) <> ''),
  constraint adle_family_methods_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create unique index if not exists adle_family_methods_active_key_idx
  on public.adle_family_methods(family_key)
  where row_status = 'active';

-- Imported Activity Templates sheet plus the registry contract's runtime
-- metadata columns the composer needs to fail closed. evidence_kind is a
-- label only — weights are Slice 4's.
create table if not exists public.adle_activity_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  phase text not null,
  purpose text not null,
  child_response text not null,
  required_inputs text[] not null,
  child_facing_copy text not null,
  min_words_required integer not null default 1,
  requires_sentence_context boolean not null default false,
  requires_contrast_words boolean not null default false,
  evidence_kind text not null,
  content_version text not null,
  import_batch_id uuid not null
    references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint adle_activity_templates_key_check
    check (btrim(template_key) <> ''),
  constraint adle_activity_templates_phase_check
    check (btrim(phase) <> ''),
  constraint adle_activity_templates_min_words_check
    check (min_words_required >= 1),
  constraint adle_activity_templates_evidence_kind_check
    check (evidence_kind = any (array[
      'read_only',
      'guided_task',
      'controlled_spelling',
      'dictation',
      'dictation_sentence_context',
      'free_writing',
      'reflection',
      'diagnostic_probe',
      'categorisation'
    ])),
  constraint adle_activity_templates_content_version_check
    check (btrim(content_version) <> ''),
  constraint adle_activity_templates_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create unique index if not exists adle_activity_templates_active_key_idx
  on public.adle_activity_templates(template_key)
  where row_status = 'active';

-- Probe-cap bookkeeping: one probe per micro-skill per 14 days, enforced by
-- the composition read model over these rows. Word-level probed facts still
-- go to adle_taught_word_history (event_kind 'probed') so eligibility
-- status 4 and review eligibility stay consistent.
create table if not exists public.adle_probe_runs (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  micro_skill_key text not null
    references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  run_on date not null,
  word_count integer not null,
  source_ref text not null,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint adle_probe_runs_word_count_check
    check (word_count >= 1),
  constraint adle_probe_runs_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint adle_probe_runs_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded']))
);

create index if not exists adle_probe_runs_child_skill_idx
  on public.adle_probe_runs(child_id, micro_skill_key, run_on desc)
  where row_status = 'active';

-- Raw-attempt-text capture on the Slice 2 tables (owner decision 6,
-- 2026-07-05; local/dev alter authorized by that decision). Storage only.
alter table public.adle_taught_word_history
  add column if not exists attempt_text text;
alter table public.adle_review_outcome_events
  add column if not exists attempt_text text;

alter table public.adle_learning_items enable row level security;
alter table public.adle_family_methods enable row level security;
alter table public.adle_activity_templates enable row level security;
alter table public.adle_probe_runs enable row level security;

revoke all on table public.adle_learning_items from anon, authenticated;
revoke all on table public.adle_family_methods from anon, authenticated;
revoke all on table public.adle_activity_templates from anon, authenticated;
revoke all on table public.adle_probe_runs from anon, authenticated;

grant all on table public.adle_learning_items to service_role;
grant all on table public.adle_family_methods to service_role;
grant all on table public.adle_activity_templates to service_role;
grant all on table public.adle_probe_runs to service_role;
