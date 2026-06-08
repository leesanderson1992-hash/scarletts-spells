create table if not exists public.canonical_spelling_word_map_import_batches (
  id uuid primary key default gen_random_uuid(),
  workbook_path text not null,
  workbook_sha256 text not null,
  source_commit text,
  validator_version text not null default 'canonical_spelling_word_map_validator_v1',
  validation_summary jsonb not null default '{}'::jsonb,
  row_counts jsonb not null default '{}'::jsonb,
  import_mode text not null default 'manual_seed',
  batch_status text not null default 'active',
  source_metadata jsonb not null default '{}'::jsonb,
  imported_by text,
  imported_at timestamptz,
  deactivated_at timestamptz,
  deactivation_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_import_batches_hash_check
    check (btrim(workbook_sha256) <> ''),
  constraint canonical_spelling_word_map_import_batches_mode_check
    check (import_mode = any (array['manual_seed', 'local_dev_import', 'admin_import'])),
  constraint canonical_spelling_word_map_import_batches_status_check
    check (batch_status = any (array['active', 'inactive', 'deactivated', 'superseded']))
);

create table if not exists public.canonical_spelling_word_metadata (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  word text not null,
  normalised_word text not null,
  dialect_code text not null default 'en-GB',
  syllable_count integer,
  phoneme_hint text,
  stress_pattern text,
  has_schwa boolean,
  morphology_notes text,
  irregularity_band text,
  spelling_complexity_score numeric,
  source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_metadata_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_metadata_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_metadata_source_check
    check (btrim(source) <> ''),
  constraint canonical_spelling_word_metadata_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_metadata_normalised_word_check
    check (btrim(normalised_word) <> '' and normalised_word = lower(normalised_word)),
  constraint canonical_spelling_word_metadata_dialect_code_check
    check (btrim(dialect_code) <> ''),
  constraint canonical_spelling_word_metadata_syllable_count_check
    check (syllable_count is null or syllable_count > 0),
  constraint canonical_spelling_word_metadata_irregularity_band_check
    check (irregularity_band is null or irregularity_band = any (array['regular', 'partly_irregular', 'irregular'])),
  constraint canonical_spelling_word_metadata_complexity_score_check
    check (spelling_complexity_score is null or (spelling_complexity_score >= 0 and spelling_complexity_score <= 10))
);

create table if not exists public.canonical_spelling_word_map_diversity_groups (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  diversity_group_key text not null,
  display_label text not null,
  required_for_mastery boolean not null default false,
  minimum_success_examples integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_diversity_groups_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_map_diversity_groups_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_map_diversity_groups_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_map_diversity_groups_key_check
    check (btrim(diversity_group_key) <> '' and btrim(display_label) <> ''),
  constraint canonical_spelling_word_map_diversity_groups_minimum_check
    check (minimum_success_examples is null or minimum_success_examples >= 0)
);

create table if not exists public.canonical_spelling_word_map_words (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  word text not null,
  normalised_word text not null,
  word_role text not null,
  micro_skill_role text not null,
  diversity_group_key text,
  complexity_band text not null,
  frequency_band text not null,
  practice_route text not null,
  approved_for_assignment boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_words_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_map_words_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_map_words_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_map_words_normalised_word_check
    check (btrim(normalised_word) <> '' and normalised_word = lower(normalised_word)),
  constraint canonical_spelling_word_map_words_word_role_check
    check (word_role = any (array['teaching_example', 'practice_word', 'anchor_word', 'dictation_word', 'sentence_application_word', 'review_word'])),
  constraint canonical_spelling_word_map_words_micro_skill_role_check
    check (micro_skill_role = any (array['primary_tested', 'supporting_prerequisite', 'weak_possible_prerequisite', 'contrast_only'])),
  constraint canonical_spelling_word_map_words_complexity_band_check
    check (complexity_band = any (array['easy', 'medium', 'hard'])),
  constraint canonical_spelling_word_map_words_frequency_band_check
    check (frequency_band = any (array['common', 'medium', 'rare'])),
  constraint canonical_spelling_word_map_words_practice_route_check
    check (practice_route = any (array['word_practice', 'grouped_set_practice', 'sound_pattern_practice', 'morphology_lesson', 'dictation', 'sentence_application', 'proofreading', 'oracy_pronunciation']))
);

create table if not exists public.canonical_spelling_word_map_contrast_pairs (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  target_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  target_word text not null,
  contrast_word text not null,
  contrast_micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  contrast_type text not null,
  approved_for_assignment boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_contrast_pairs_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_map_contrast_pairs_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_map_contrast_pairs_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_map_contrast_pairs_words_check
    check (btrim(target_word) <> '' and btrim(contrast_word) <> ''),
  constraint canonical_spelling_word_map_contrast_pairs_type_check
    check (contrast_type = any (array['same_sound_different_spelling', 'same_spelling_different_sound', 'confusable_grapheme', 'near_pattern', 'morphology_family', 'homophone', 'meaning_choice', 'irregular_vs_regular']))
);

create table if not exists public.canonical_spelling_word_map_diagnostic_examples (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  misspelling_normalised text not null,
  correction_normalised text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  diagnostic_reason text not null,
  confidence text not null,
  resolver_visible_candidate boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_diagnostic_examples_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_map_diagnostic_examples_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_map_diagnostic_examples_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_map_diagnostic_examples_words_check
    check (
      btrim(misspelling_normalised) <> ''
      and btrim(correction_normalised) <> ''
      and misspelling_normalised = lower(misspelling_normalised)
      and correction_normalised = lower(correction_normalised)
      and misspelling_normalised <> correction_normalised
    ),
  constraint canonical_spelling_word_map_diagnostic_examples_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_spelling_word_map_diagnostic_examples_resolver_hidden_check
    check (resolver_visible_candidate = false)
);

create table if not exists public.canonical_spelling_word_map_route_support (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_spelling_word_map_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  review_status text,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  route text not null,
  minimum_words_required integer not null default 0,
  requires_contrast_words boolean not null default false,
  template_key text,
  enabled_for_mvp boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_spelling_word_map_route_support_row_status_check
    check (row_status = any (array['active', 'inactive', 'rejected'])),
  constraint canonical_spelling_word_map_route_support_review_status_check
    check (review_status is null or review_status = any (array['unreviewed_import', 'source_verified', 'manual_review_needed', 'manual_verified', 'rejected'])),
  constraint canonical_spelling_word_map_route_support_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_spelling_word_map_route_support_route_check
    check (route = any (array['word_practice', 'grouped_set_practice', 'sound_pattern_practice', 'morphology_lesson', 'dictation', 'sentence_application', 'proofreading', 'oracy_pronunciation'])),
  constraint canonical_spelling_word_map_route_support_minimum_check
    check (minimum_words_required >= 0)
);

create index if not exists canonical_spelling_word_metadata_batch_idx
  on public.canonical_spelling_word_metadata(import_batch_id);
create index if not exists canonical_spelling_word_metadata_normalised_idx
  on public.canonical_spelling_word_metadata(normalised_word);
create unique index if not exists canonical_spelling_word_metadata_active_word_idx
  on public.canonical_spelling_word_metadata(normalised_word, dialect_code)
  where row_status = 'active';

create index if not exists canonical_spelling_word_map_diversity_groups_batch_idx
  on public.canonical_spelling_word_map_diversity_groups(import_batch_id);
create index if not exists canonical_spelling_word_map_diversity_groups_skill_idx
  on public.canonical_spelling_word_map_diversity_groups(micro_skill_key);
create unique index if not exists canonical_spelling_word_map_diversity_groups_active_key_idx
  on public.canonical_spelling_word_map_diversity_groups(micro_skill_key, diversity_group_key)
  where row_status = 'active';

create index if not exists canonical_spelling_word_map_words_batch_idx
  on public.canonical_spelling_word_map_words(import_batch_id);
create index if not exists canonical_spelling_word_map_words_skill_idx
  on public.canonical_spelling_word_map_words(micro_skill_key);
create index if not exists canonical_spelling_word_map_words_skill_route_idx
  on public.canonical_spelling_word_map_words(micro_skill_key, practice_route);
create index if not exists canonical_spelling_word_map_words_normalised_idx
  on public.canonical_spelling_word_map_words(normalised_word);
create index if not exists canonical_spelling_word_map_words_active_approved_idx
  on public.canonical_spelling_word_map_words(micro_skill_key, practice_route, normalised_word)
  where row_status = 'active' and approved_for_assignment = true;
create unique index if not exists canonical_spelling_word_map_words_active_content_idx
  on public.canonical_spelling_word_map_words(micro_skill_key, normalised_word, word_role, micro_skill_role, practice_route, coalesce(diversity_group_key, ''))
  where row_status = 'active';

create index if not exists canonical_spelling_word_map_contrast_pairs_batch_idx
  on public.canonical_spelling_word_map_contrast_pairs(import_batch_id);
create index if not exists canonical_spelling_word_map_contrast_pairs_target_skill_idx
  on public.canonical_spelling_word_map_contrast_pairs(target_micro_skill_key);
create index if not exists canonical_spelling_word_map_contrast_pairs_contrast_skill_idx
  on public.canonical_spelling_word_map_contrast_pairs(contrast_micro_skill_key);
create index if not exists canonical_spelling_word_map_contrast_pairs_active_approved_idx
  on public.canonical_spelling_word_map_contrast_pairs(target_micro_skill_key, contrast_type)
  where row_status = 'active' and approved_for_assignment = true;

create index if not exists canonical_spelling_word_map_diagnostic_examples_batch_idx
  on public.canonical_spelling_word_map_diagnostic_examples(import_batch_id);
create index if not exists canonical_spelling_word_map_diagnostic_examples_skill_idx
  on public.canonical_spelling_word_map_diagnostic_examples(micro_skill_key);
create index if not exists canonical_spelling_word_map_diagnostic_examples_correction_idx
  on public.canonical_spelling_word_map_diagnostic_examples(correction_normalised);
create index if not exists canonical_spelling_word_map_diagnostic_examples_misspelling_idx
  on public.canonical_spelling_word_map_diagnostic_examples(misspelling_normalised);
create unique index if not exists canonical_spelling_word_map_diagnostic_examples_active_pair_idx
  on public.canonical_spelling_word_map_diagnostic_examples(misspelling_normalised, correction_normalised, micro_skill_key)
  where row_status = 'active';

create index if not exists canonical_spelling_word_map_route_support_batch_idx
  on public.canonical_spelling_word_map_route_support(import_batch_id);
create index if not exists canonical_spelling_word_map_route_support_skill_idx
  on public.canonical_spelling_word_map_route_support(micro_skill_key);
create index if not exists canonical_spelling_word_map_route_support_skill_route_idx
  on public.canonical_spelling_word_map_route_support(micro_skill_key, route);
create index if not exists canonical_spelling_word_map_route_support_enabled_idx
  on public.canonical_spelling_word_map_route_support(micro_skill_key, route)
  where row_status = 'active' and enabled_for_mvp = true;

alter table public.canonical_spelling_word_map_import_batches enable row level security;
alter table public.canonical_spelling_word_metadata enable row level security;
alter table public.canonical_spelling_word_map_diversity_groups enable row level security;
alter table public.canonical_spelling_word_map_words enable row level security;
alter table public.canonical_spelling_word_map_contrast_pairs enable row level security;
alter table public.canonical_spelling_word_map_diagnostic_examples enable row level security;
alter table public.canonical_spelling_word_map_route_support enable row level security;

revoke all on table public.canonical_spelling_word_map_import_batches from anon, authenticated;
revoke all on table public.canonical_spelling_word_metadata from anon, authenticated;
revoke all on table public.canonical_spelling_word_map_diversity_groups from anon, authenticated;
revoke all on table public.canonical_spelling_word_map_words from anon, authenticated;
revoke all on table public.canonical_spelling_word_map_contrast_pairs from anon, authenticated;
revoke all on table public.canonical_spelling_word_map_diagnostic_examples from anon, authenticated;
revoke all on table public.canonical_spelling_word_map_route_support from anon, authenticated;

grant all on table public.canonical_spelling_word_map_import_batches to service_role;
grant all on table public.canonical_spelling_word_metadata to service_role;
grant all on table public.canonical_spelling_word_map_diversity_groups to service_role;
grant all on table public.canonical_spelling_word_map_words to service_role;
grant all on table public.canonical_spelling_word_map_contrast_pairs to service_role;
grant all on table public.canonical_spelling_word_map_diagnostic_examples to service_role;
grant all on table public.canonical_spelling_word_map_route_support to service_role;
