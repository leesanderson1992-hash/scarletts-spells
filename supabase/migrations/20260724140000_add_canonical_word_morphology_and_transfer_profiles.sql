-- PR #10: canonical-word readiness.  A word sum is reviewed child-facing data,
-- never an automatic interpretation of raw MorphoLex segmentation.

create table if not exists public.canonical_teaching_dictionary_word_morphology (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete cascade,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete cascade,
  row_status text not null default 'active' check (row_status in ('draft','active','retired')),
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null, source_metadata jsonb not null default '{}'::jsonb,
  raw_morpholex_segmentation text, raw_morpholex_pos text,
  morphology_parts jsonb not null default '[]'::jsonb, feature_keys jsonb not null default '[]'::jsonb, morphology_joins jsonb not null default '[]'::jsonb,
  transformation_notes text, word_sum text,
  analysis_status text not null check (analysis_status in ('in_review','approved','not_applicable','rejected')),
  source_category text not null, source_name text not null, source_url text, source_licence text, source_use_note text not null,
  confidence text not null, review_status text not null, reviewed_by text, reviewed_at timestamptz, review_notes text,
  created_at timestamptz not null default now(),
  unique (import_batch_id, canonical_word_id),
  check (analysis_status <> 'approved' or (coalesce(word_sum,'') <> '' and jsonb_array_length(morphology_parts) > 0))
);
create unique index if not exists canonical_teaching_dictionary_word_morphology_active_word on public.canonical_teaching_dictionary_word_morphology(canonical_word_id) where row_status = 'active';

create table if not exists public.canonical_teaching_dictionary_transfer_selector_profiles (
  id uuid primary key default gen_random_uuid(),
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  selector_kind text not null check (selector_kind in ('affix','base_word_family')),
  feature_type text not null check (feature_type in ('prefix','suffix','base','root')),
  feature_key text not null, permitted_transformations jsonb not null default '[]'::jsonb,
  semantic_constraints jsonb not null default '{}'::jsonb, required_transfer_words integer not null check (required_transfer_words > 0),
  allowed_age_bands jsonb not null default '[]'::jsonb, minimum_source_quality text not null default 'high',
  content_version text not null, row_status text not null default 'draft' check (row_status in ('draft','active','retired')),
  review_status text not null default 'in_review', reviewed_by text, reviewed_at timestamptz, review_notes text,
  created_at timestamptz not null default now(),
  unique (micro_skill_key, content_version),
  check (row_status <> 'active' or (review_status = 'approved_for_first_exposure' and reviewed_by is not null and reviewed_at is not null))
);
create index if not exists canonical_teaching_dictionary_transfer_selector_profiles_active on public.canonical_teaching_dictionary_transfer_selector_profiles(micro_skill_key, feature_type, feature_key) where row_status = 'active';

alter table public.canonical_teaching_dictionary_word_morphology enable row level security;
alter table public.canonical_teaching_dictionary_transfer_selector_profiles enable row level security;
