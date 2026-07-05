-- ADLE Slice 1 (1A): word-complexity banding storage on the Teaching Dictionary.
-- Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
-- (2026-07-04 formula-package amendment) and the approved
-- adle-word-complexity-banding-and-formula-numbers-proposal.md (banding v1.1).
-- Local/dev only per docs/operations/supabase-migration-policy.md.
--
-- Eligibility-ladder statuses are derived read models (lib/adle) and are
-- deliberately NOT stored here; this migration owns only banding facts:
-- the version registry, per-word banding rows, admin overrides, and the
-- recomputable per-skill per-level allocation table.

create table if not exists public.canonical_teaching_dictionary_banding_versions (
  banding_version text primary key,
  is_active boolean not null default false,
  level_count integer not null,
  formula_reference text not null,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_banding_versions_key_check
    check (btrim(banding_version) <> ''),
  constraint canonical_teaching_dictionary_banding_versions_level_count_check
    check (level_count between 2 and 10),
  constraint canonical_teaching_dictionary_banding_versions_reference_check
    check (btrim(formula_reference) <> ''),
  constraint canonical_teaching_dictionary_banding_versions_activated_check
    check (is_active = false or activated_at is not null)
);

-- Exactly one active banding version at a time; the active version owns the
-- valid complexity-level range.
create unique index if not exists canonical_teaching_dictionary_banding_versions_one_active_idx
  on public.canonical_teaching_dictionary_banding_versions((true))
  where is_active = true;

create table if not exists public.canonical_teaching_dictionary_word_banding (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  banding_version text not null references public.canonical_teaching_dictionary_banding_versions(banding_version) on delete restrict,
  import_batch_id uuid references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  syllable_points integer not null,
  length_points integer not null,
  irregularity_class integer not null,
  irregularity_points integer not null,
  morphology_depth integer not null,
  morphology_points integer not null,
  has_schwa boolean not null,
  mismatch_flag boolean not null,
  irregularity_note_source text,
  structural_score integer not null,
  complexity_level integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_word_banding_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_word_banding_syllable_points_check
    check (syllable_points between 0 and 3),
  constraint canonical_teaching_dictionary_word_banding_length_points_check
    check (length_points between 0 and 3),
  constraint canonical_teaching_dictionary_word_banding_irregularity_class_check
    check (irregularity_class between 0 and 2),
  constraint canonical_teaching_dictionary_word_banding_irregularity_points_check
    check (irregularity_points = any (array[0, 2, 4])),
  constraint canonical_teaching_dictionary_word_banding_morphology_depth_check
    check (morphology_depth >= 1),
  constraint canonical_teaching_dictionary_word_banding_morphology_points_check
    check (morphology_points between 0 and 2),
  constraint canonical_teaching_dictionary_word_banding_level_check
    check (complexity_level >= 1),
  -- banding v1.1 audit invariant: the stored score is exactly the sum of the
  -- stored input points (max 14), so a banding row can always be explained.
  constraint canonical_teaching_dictionary_word_banding_score_check
    check (
      structural_score = syllable_points + length_points + irregularity_points
        + morphology_points
        + (case when has_schwa then 1 else 0 end)
        + (case when mismatch_flag then 1 else 0 end)
    )
);

-- One active banding row per word per version; re-banding supersedes and
-- inserts, old versions are retained for audit.
create unique index if not exists canonical_teaching_dictionary_word_banding_active_word_version_idx
  on public.canonical_teaching_dictionary_word_banding(canonical_word_id, banding_version)
  where row_status = 'active';
create index if not exists canonical_teaching_dictionary_word_banding_word_idx
  on public.canonical_teaching_dictionary_word_banding(canonical_word_id);
create index if not exists canonical_teaching_dictionary_word_banding_version_idx
  on public.canonical_teaching_dictionary_word_banding(banding_version);
create index if not exists canonical_teaching_dictionary_word_banding_batch_idx
  on public.canonical_teaching_dictionary_word_banding(import_batch_id);

create table if not exists public.canonical_teaching_dictionary_banding_overrides (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  override_level integer not null,
  override_reason text not null,
  created_by text,
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_banding_overrides_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_banding_overrides_level_check
    check (override_level >= 1),
  constraint canonical_teaching_dictionary_banding_overrides_reason_check
    check (btrim(override_reason) <> '')
);

-- Overrides are version-independent and survive re-banding: effective level =
-- active override, else the computed level for the active banding version.
create unique index if not exists canonical_teaching_dictionary_banding_overrides_active_word_idx
  on public.canonical_teaching_dictionary_banding_overrides(canonical_word_id)
  where row_status = 'active';
create index if not exists canonical_teaching_dictionary_banding_overrides_word_idx
  on public.canonical_teaching_dictionary_banding_overrides(canonical_word_id);

create table if not exists public.canonical_teaching_dictionary_skill_level_allocation (
  id uuid primary key default gen_random_uuid(),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  complexity_level integer not null,
  allocation integer not null,
  banding_version text not null references public.canonical_teaching_dictionary_banding_versions(banding_version) on delete restrict,
  import_batch_id uuid references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  computed_at timestamptz not null default timezone('utc', now()),
  row_status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_skill_level_allocation_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_skill_level_allocation_level_check
    check (complexity_level >= 1),
  constraint canonical_teaching_dictionary_skill_level_allocation_count_check
    check (allocation >= 0)
);

-- Derived artefact: fully recomputed on every banding run; consumers read it,
-- never write it.
create unique index if not exists canonical_teaching_dictionary_skill_level_allocation_active_cell_idx
  on public.canonical_teaching_dictionary_skill_level_allocation(micro_skill_key, complexity_level, banding_version)
  where row_status = 'active';
create index if not exists canonical_teaching_dictionary_skill_level_allocation_skill_idx
  on public.canonical_teaching_dictionary_skill_level_allocation(micro_skill_key);
create index if not exists canonical_teaching_dictionary_skill_level_allocation_version_idx
  on public.canonical_teaching_dictionary_skill_level_allocation(banding_version);

alter table public.canonical_teaching_dictionary_banding_versions enable row level security;
alter table public.canonical_teaching_dictionary_word_banding enable row level security;
alter table public.canonical_teaching_dictionary_banding_overrides enable row level security;
alter table public.canonical_teaching_dictionary_skill_level_allocation enable row level security;

revoke all on table public.canonical_teaching_dictionary_banding_versions from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_word_banding from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_banding_overrides from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_skill_level_allocation from anon, authenticated;

grant all on table public.canonical_teaching_dictionary_banding_versions to service_role;
grant all on table public.canonical_teaching_dictionary_word_banding to service_role;
grant all on table public.canonical_teaching_dictionary_banding_overrides to service_role;
grant all on table public.canonical_teaching_dictionary_skill_level_allocation to service_role;

-- Registry seed: the owner-approved banding v1.1 (3-level scheme) is the
-- active version from day one; runtime banding rows arrive via the guarded
-- banding runner, never via migration.
insert into public.canonical_teaching_dictionary_banding_versions
  (banding_version, is_active, level_count, formula_reference, activated_at)
values (
  'banding_v1.1_2026-07-04',
  true,
  3,
  'docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md',
  timezone('utc', now())
)
on conflict (banding_version) do nothing;
