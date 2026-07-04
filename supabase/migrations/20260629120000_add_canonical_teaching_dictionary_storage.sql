create table if not exists public.canonical_teaching_dictionary_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_folder_path text not null,
  source_folder_sha256 text,
  source_commit text,
  validator_version text not null default 'version_3_phase_5c_teaching_dictionary_csv_v1',
  validation_summary jsonb not null default '{}'::jsonb,
  row_counts jsonb not null default '{}'::jsonb,
  readiness_summary jsonb not null default '{}'::jsonb,
  import_mode text not null default 'local_dev_dry_run',
  batch_status text not null default 'draft',
  source_metadata jsonb not null default '{}'::jsonb,
  imported_by text,
  imported_at timestamptz,
  deactivated_at timestamptz,
  deactivation_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_import_batches_source_check
    check (btrim(source_folder_path) <> ''),
  constraint canonical_teaching_dictionary_import_batches_mode_check
    check (import_mode = any (array['local_dev_dry_run', 'local_dev_import', 'admin_import'])),
  constraint canonical_teaching_dictionary_import_batches_status_check
    check (batch_status = any (array['draft', 'validated', 'applied', 'inactive', 'deactivated', 'superseded', 'rejected']))
);

create table if not exists public.canonical_teaching_dictionary_sources (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  row_status text not null default 'active',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  source_key text not null,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  importability_status text not null,
  legal_review_status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_sources_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_sources_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_sources_key_check
    check (btrim(source_key) <> ''),
  constraint canonical_teaching_dictionary_sources_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_sources_importability_check
    check (importability_status = any (array['importable', 'reference_only', 'requires_legal_review', 'not_importable', 'unknown'])),
  constraint canonical_teaching_dictionary_sources_legal_review_check
    check (legal_review_status = any (array['not_required', 'required', 'passed', 'failed', 'unknown'])),
  constraint canonical_teaching_dictionary_sources_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> '')
);

create table if not exists public.canonical_teaching_dictionary_words (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  source_id uuid references public.canonical_teaching_dictionary_sources(id) on delete restrict,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  word_key text not null,
  normalised_word text not null,
  display_word text not null,
  dialect_code text not null default 'en-GB',
  frequency_band text,
  age_band text,
  complexity_band text,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  review_status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_words_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_words_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_words_word_key_check
    check (btrim(word_key) <> ''),
  constraint canonical_teaching_dictionary_words_normalised_word_check
    check (btrim(normalised_word) <> '' and normalised_word = lower(normalised_word)),
  constraint canonical_teaching_dictionary_words_display_word_check
    check (btrim(display_word) <> ''),
  constraint canonical_teaching_dictionary_words_dialect_code_check
    check (btrim(dialect_code) <> ''),
  constraint canonical_teaching_dictionary_words_source_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_words_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_words_review_status_check
    check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_words_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> '')
);

create table if not exists public.canonical_teaching_dictionary_word_metadata (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_id uuid references public.canonical_teaching_dictionary_sources(id) on delete restrict,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  syllables text,
  phoneme_hint text,
  grapheme_notes text,
  stress_pattern text,
  has_schwa boolean,
  morphemes text,
  morphology_notes text,
  irregularity_notes text,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_word_metadata_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_word_metadata_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_word_metadata_source_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_word_metadata_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_word_metadata_review_status_check
    check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_word_metadata_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> '')
);

create table if not exists public.canonical_teaching_dictionary_word_support (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  source_id uuid references public.canonical_teaching_dictionary_sources(id) on delete restrict,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  support_role text not null,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  review_status text not null,
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_word_support_row_status_check
    check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_word_support_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_word_support_role_check
    check (support_role = any (array['support_example', 'contrast', 'review_example'])),
  constraint canonical_teaching_dictionary_word_support_source_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_word_support_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_word_support_review_status_check
    check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_word_support_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> '')
);

create table if not exists public.canonical_teaching_dictionary_content_versions (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  source_id uuid references public.canonical_teaching_dictionary_sources(id) on delete restrict,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  content_version text not null,
  version_status text not null default 'draft',
  is_active boolean not null default false,
  teaching_objective text,
  child_friendly_explanation text,
  rule_explanation text,
  memory_tip text,
  common_misconceptions text,
  first_exposure_progression jsonb not null default '[]'::jsonb,
  guided_practice_progression jsonb not null default '[]'::jsonb,
  review_proofreading_progression jsonb not null default '[]'::jsonb,
  example_selection_guidance text,
  contrast_policy_guidance text,
  sample_preview_word_key text,
  source_category text not null,
  source_name text,
  source_url text,
  source_licence text,
  source_use_note text,
  confidence text not null,
  supersedes_content_version text,
  final_readiness_review_status text not null default 'not_started',
  final_readiness_reviewed_by text,
  final_readiness_reviewed_at timestamptz,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_content_versions_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_content_versions_key_check
    check (btrim(content_version) <> ''),
  constraint canonical_teaching_dictionary_content_versions_status_check
    check (version_status = any (array['draft', 'in_review', 'changes_requested', 'active', 'rejected', 'superseded', 'archived'])),
  constraint canonical_teaching_dictionary_content_versions_active_check
    check (
      is_active = false
      or (
        version_status = 'active'
        and final_readiness_review_status = 'signed_off'
      )
    ),
  constraint canonical_teaching_dictionary_content_versions_first_progression_check
    check (jsonb_typeof(first_exposure_progression) = 'array'),
  constraint canonical_teaching_dictionary_content_versions_guided_progression_check
    check (jsonb_typeof(guided_practice_progression) = 'array'),
  constraint canonical_teaching_dictionary_content_versions_review_proofreading_progression_check
    check (jsonb_typeof(review_proofreading_progression) = 'array'),
  constraint canonical_teaching_dictionary_content_versions_source_category_check
    check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_content_versions_confidence_check
    check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_content_versions_final_review_check
    check (final_readiness_review_status = any (array['not_started', 'in_review', 'changes_requested', 'signed_off', 'rejected'])),
  constraint canonical_teaching_dictionary_content_versions_internal_note_check
    check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> '')
);

create table if not exists public.canonical_teaching_dictionary_field_reviews (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  teaching_content_version_id uuid not null references public.canonical_teaching_dictionary_content_versions(id) on delete restrict,
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  field_key text not null,
  review_gate text not null,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_field_reviews_source_row_check
    check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_field_reviews_field_key_check
    check (btrim(field_key) <> ''),
  constraint canonical_teaching_dictionary_field_reviews_gate_check
    check (review_gate = any (array['source_licence', 'pedagogy', 'child_language', 'british_english', 'accessibility', 'legal', 'final_readiness'])),
  constraint canonical_teaching_dictionary_field_reviews_status_check
    check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded']))
);

create table if not exists public.canonical_teaching_dictionary_readiness_reports (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  teaching_content_version_id uuid not null references public.canonical_teaching_dictionary_content_versions(id) on delete restrict,
  validator_version text not null default 'version_3_phase_5c_teaching_dictionary_csv_v1',
  readiness_state text not null,
  first_exposure_allowed boolean not null default false,
  guided_review_allowed boolean not null default false,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  p0_field_statuses jsonb not null default '[]'::jsonb,
  p1_field_statuses jsonb not null default '[]'::jsonb,
  p2_field_statuses jsonb not null default '[]'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  licence_summary jsonb not null default '{}'::jsonb,
  review_summary jsonb not null default '{}'::jsonb,
  activity_progression_summary jsonb not null default '{}'::jsonb,
  report_metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint canonical_teaching_dictionary_readiness_reports_state_check
    check (readiness_state = any (array['not_ready', 'content_gap', 'source_or_license_gap', 'needs_manual_review', 'ready_for_guided_review_only', 'ready_for_first_exposure', 'rejected', 'superseded', 'archived'])),
  constraint canonical_teaching_dictionary_readiness_reports_first_exposure_check
    check (first_exposure_allowed = false or readiness_state = 'ready_for_first_exposure'),
  constraint canonical_teaching_dictionary_readiness_reports_guided_review_check
    check (guided_review_allowed = false or readiness_state = any (array['ready_for_guided_review_only', 'ready_for_first_exposure'])),
  constraint canonical_teaching_dictionary_readiness_reports_blockers_check
    check (jsonb_typeof(blockers) = 'array'),
  constraint canonical_teaching_dictionary_readiness_reports_warnings_check
    check (jsonb_typeof(warnings) = 'array'),
  constraint canonical_teaching_dictionary_readiness_reports_p0_check
    check (jsonb_typeof(p0_field_statuses) = 'array'),
  constraint canonical_teaching_dictionary_readiness_reports_p1_check
    check (jsonb_typeof(p1_field_statuses) = 'array'),
  constraint canonical_teaching_dictionary_readiness_reports_p2_check
    check (jsonb_typeof(p2_field_statuses) = 'array')
);

create index if not exists canonical_teaching_dictionary_sources_batch_idx
  on public.canonical_teaching_dictionary_sources(import_batch_id);
create unique index if not exists canonical_teaching_dictionary_sources_active_key_idx
  on public.canonical_teaching_dictionary_sources(source_key)
  where row_status = 'active';

create index if not exists canonical_teaching_dictionary_words_batch_idx
  on public.canonical_teaching_dictionary_words(import_batch_id);
create index if not exists canonical_teaching_dictionary_words_source_idx
  on public.canonical_teaching_dictionary_words(source_id);
create index if not exists canonical_teaching_dictionary_words_normalised_idx
  on public.canonical_teaching_dictionary_words(normalised_word);
create unique index if not exists canonical_teaching_dictionary_words_active_word_idx
  on public.canonical_teaching_dictionary_words(normalised_word, dialect_code)
  where row_status = 'active';
create unique index if not exists canonical_teaching_dictionary_words_active_key_idx
  on public.canonical_teaching_dictionary_words(word_key)
  where row_status = 'active';

create index if not exists canonical_teaching_dictionary_word_metadata_batch_idx
  on public.canonical_teaching_dictionary_word_metadata(import_batch_id);
create index if not exists canonical_teaching_dictionary_word_metadata_word_idx
  on public.canonical_teaching_dictionary_word_metadata(canonical_word_id);

create index if not exists canonical_teaching_dictionary_word_support_batch_idx
  on public.canonical_teaching_dictionary_word_support(import_batch_id);
create index if not exists canonical_teaching_dictionary_word_support_word_idx
  on public.canonical_teaching_dictionary_word_support(canonical_word_id);
create index if not exists canonical_teaching_dictionary_word_support_skill_idx
  on public.canonical_teaching_dictionary_word_support(micro_skill_key);
create unique index if not exists canonical_teaching_dictionary_word_support_active_mapping_idx
  on public.canonical_teaching_dictionary_word_support(canonical_word_id, micro_skill_key, support_role)
  where row_status = 'active';

create index if not exists canonical_teaching_dictionary_content_versions_batch_idx
  on public.canonical_teaching_dictionary_content_versions(import_batch_id);
create index if not exists canonical_teaching_dictionary_content_versions_skill_idx
  on public.canonical_teaching_dictionary_content_versions(micro_skill_key);
create unique index if not exists canonical_teaching_dictionary_content_versions_key_idx
  on public.canonical_teaching_dictionary_content_versions(micro_skill_key, content_version);
create unique index if not exists canonical_teaching_dictionary_content_versions_one_active_idx
  on public.canonical_teaching_dictionary_content_versions(micro_skill_key)
  where is_active = true and version_status = 'active' and final_readiness_review_status = 'signed_off';

create index if not exists canonical_teaching_dictionary_field_reviews_batch_idx
  on public.canonical_teaching_dictionary_field_reviews(import_batch_id);
create index if not exists canonical_teaching_dictionary_field_reviews_version_idx
  on public.canonical_teaching_dictionary_field_reviews(teaching_content_version_id);
create unique index if not exists canonical_teaching_dictionary_field_reviews_unique_gate_idx
  on public.canonical_teaching_dictionary_field_reviews(teaching_content_version_id, field_key, review_gate);

create index if not exists canonical_teaching_dictionary_readiness_reports_batch_idx
  on public.canonical_teaching_dictionary_readiness_reports(import_batch_id);
create index if not exists canonical_teaching_dictionary_readiness_reports_version_idx
  on public.canonical_teaching_dictionary_readiness_reports(teaching_content_version_id);
create index if not exists canonical_teaching_dictionary_readiness_reports_state_idx
  on public.canonical_teaching_dictionary_readiness_reports(readiness_state);

alter table public.canonical_teaching_dictionary_import_batches enable row level security;
alter table public.canonical_teaching_dictionary_sources enable row level security;
alter table public.canonical_teaching_dictionary_words enable row level security;
alter table public.canonical_teaching_dictionary_word_metadata enable row level security;
alter table public.canonical_teaching_dictionary_word_support enable row level security;
alter table public.canonical_teaching_dictionary_content_versions enable row level security;
alter table public.canonical_teaching_dictionary_field_reviews enable row level security;
alter table public.canonical_teaching_dictionary_readiness_reports enable row level security;

revoke all on table public.canonical_teaching_dictionary_import_batches from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_sources from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_words from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_word_metadata from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_word_support from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_content_versions from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_field_reviews from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_readiness_reports from anon, authenticated;

grant all on table public.canonical_teaching_dictionary_import_batches to service_role;
grant all on table public.canonical_teaching_dictionary_sources to service_role;
grant all on table public.canonical_teaching_dictionary_words to service_role;
grant all on table public.canonical_teaching_dictionary_word_metadata to service_role;
grant all on table public.canonical_teaching_dictionary_word_support to service_role;
grant all on table public.canonical_teaching_dictionary_content_versions to service_role;
grant all on table public.canonical_teaching_dictionary_field_reviews to service_role;
grant all on table public.canonical_teaching_dictionary_readiness_reports to service_role;
