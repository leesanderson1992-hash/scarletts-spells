-- Dictionary-first, review-gated facts for the position-aware Suffix Word Lab.
-- Teaching splits are deliberately separate from the structured true morphology
-- held by each member: a child may see happi | ness while the canonical record
-- remains happy + ness with a y-to-i transformation.

create table if not exists public.canonical_teaching_dictionary_suffix_profiles (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  suffix_label text not null, suffix_text text not null, suffix_meaning text not null,
  meaning_bins jsonb not null, include_meaning_sort boolean not null default false,
  suffix_choices jsonb not null, intro_content jsonb not null, reflection_prompt_key text not null, reflection_prompt_text text not null,
  production_enabled boolean not null default false,
  row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, micro_skill_key),
  constraint ctd_suffix_profiles_values check (btrim(suffix_label) <> '' and btrim(suffix_text) <> '' and btrim(suffix_meaning) <> '' and btrim(reflection_prompt_key) <> '' and btrim(reflection_prompt_text) <> '' and jsonb_typeof(meaning_bins) = 'array' and jsonb_array_length(meaning_bins) >= 1 and jsonb_typeof(suffix_choices) = 'array' and jsonb_typeof(intro_content) = 'object'),
  constraint ctd_suffix_profiles_meaning_sort check ((include_meaning_sort and jsonb_array_length(meaning_bins) > 1) or (not include_meaning_sort and jsonb_array_length(meaning_bins) = 1)),
  constraint ctd_suffix_profiles_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);

create table if not exists public.canonical_teaching_dictionary_suffix_members (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  suffix_profile_id uuid not null references public.canonical_teaching_dictionary_suffix_profiles(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  member_role text not null, suffix_variant text not null,
  semantic_base_text text not null, semantic_base_kind text not null, base_meaning text not null, new_word_meaning text not null, meaning_bin_key text not null,
  teaching_split_parts jsonb not null, teaching_split_joins jsonb not null,
  true_morphology_parts jsonb not null, true_morphology_joins jsonb not null, true_morphology_transformations jsonb not null default '[]'::jsonb, transformation_notes text not null default '', true_morphology_provenance jsonb not null,
  assignment_eligible boolean not null default false, row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, suffix_profile_id, canonical_word_id),
  constraint ctd_suffix_members_values check (member_role = any (array['authentic_target','transfer']) and btrim(suffix_variant) <> '' and btrim(semantic_base_text) <> '' and semantic_base_kind = any (array['base','root']) and btrim(base_meaning) <> '' and btrim(new_word_meaning) <> '' and btrim(meaning_bin_key) <> '' and jsonb_typeof(teaching_split_parts) = 'array' and jsonb_array_length(teaching_split_parts) >= 2 and jsonb_typeof(teaching_split_joins) = 'array' and jsonb_typeof(true_morphology_parts) = 'array' and jsonb_array_length(true_morphology_parts) >= 2 and jsonb_typeof(true_morphology_joins) = 'array' and jsonb_typeof(true_morphology_transformations) = 'array' and jsonb_typeof(true_morphology_provenance) = 'object'),
  constraint ctd_suffix_members_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);

create index if not exists ctd_suffix_profiles_runtime_idx on public.canonical_teaching_dictionary_suffix_profiles (micro_skill_key, row_status, review_status, production_enabled);
create index if not exists ctd_suffix_members_runtime_idx on public.canonical_teaching_dictionary_suffix_members (suffix_profile_id, row_status, review_status, assignment_eligible);
alter table public.canonical_teaching_dictionary_suffix_profiles enable row level security;
alter table public.canonical_teaching_dictionary_suffix_members enable row level security;
revoke all on public.canonical_teaching_dictionary_suffix_profiles, public.canonical_teaching_dictionary_suffix_members from anon, authenticated;
grant select, insert, update, delete on public.canonical_teaching_dictionary_suffix_profiles, public.canonical_teaching_dictionary_suffix_members to service_role;
