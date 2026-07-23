-- Review-gated, dictionary-first facts for Dynamic Prefix Word Lab v2.
-- This migration intentionally seeds no learner items, assignments, evidence,
-- scheduler state, or production activation. Importers must retain existing
-- reviewed dictionary rows and fill only missing reviewed fields.

create table if not exists public.canonical_teaching_dictionary_prefix_profiles (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  prefix_label text not null, prefix_text text not null, prefix_meaning text not null,
  meaning_bins jsonb not null, prefix_choices jsonb not null,
  reflection_prompt_key text not null, reflection_prompt_text text not null,
  production_enabled boolean not null default false,
  row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, micro_skill_key),
  constraint ctd_prefix_profiles_values check (btrim(prefix_label) <> '' and btrim(prefix_text) <> '' and btrim(prefix_meaning) <> '' and btrim(reflection_prompt_key) <> '' and btrim(reflection_prompt_text) <> '' and jsonb_typeof(meaning_bins) = 'array' and jsonb_array_length(meaning_bins) >= 2 and jsonb_typeof(prefix_choices) = 'array'),
  constraint ctd_prefix_profiles_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);

create table if not exists public.canonical_teaching_dictionary_prefix_members (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  prefix_profile_id uuid not null references public.canonical_teaching_dictionary_prefix_profiles(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  member_role text not null, base_word text not null, base_meaning text not null, child_friendly_meaning text not null, meaning_bin_key text not null,
  -- Lesson-specific analysis only. These fields must never overwrite or
  -- represent the canonical dictionary's full morphology record.
  teaching_split_parts jsonb not null, teaching_split_joins jsonb not null, transformation_notes text not null default '', prefix_variant text not null,
  assignment_eligible boolean not null default false, row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, prefix_profile_id, canonical_word_id),
  constraint ctd_prefix_members_values check (member_role = any (array['authentic_target','transfer']) and btrim(base_word) <> '' and btrim(base_meaning) <> '' and btrim(child_friendly_meaning) <> '' and btrim(meaning_bin_key) <> '' and btrim(prefix_variant) <> '' and jsonb_typeof(teaching_split_parts) = 'array' and jsonb_array_length(teaching_split_parts) >= 2 and jsonb_typeof(teaching_split_joins) = 'array'),
  constraint ctd_prefix_members_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);

create index if not exists ctd_prefix_profiles_runtime_idx on public.canonical_teaching_dictionary_prefix_profiles (micro_skill_key, row_status, review_status, production_enabled);
create index if not exists ctd_prefix_members_runtime_idx on public.canonical_teaching_dictionary_prefix_members (prefix_profile_id, row_status, review_status, assignment_eligible);
alter table public.canonical_teaching_dictionary_prefix_profiles enable row level security;
alter table public.canonical_teaching_dictionary_prefix_members enable row level security;
revoke all on public.canonical_teaching_dictionary_prefix_profiles, public.canonical_teaching_dictionary_prefix_members from anon, authenticated;
grant select, insert, update, delete on public.canonical_teaching_dictionary_prefix_profiles, public.canonical_teaching_dictionary_prefix_members to service_role;
