-- Dictionary-first, profile-specific facts for the D4 closed-compound lesson.
create table if not exists public.canonical_teaching_dictionary_compound_profiles (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  compound_type text not null check (compound_type = 'closed'), intro_content jsonb not null,
  reflection_prompt_key text not null, reflection_prompt_text text not null, production_enabled boolean not null default false,
  row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, micro_skill_key),
  constraint ctd_compound_profile_values check (micro_skill_key = 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS' and jsonb_typeof(intro_content) = 'object' and btrim(reflection_prompt_key) <> '' and btrim(reflection_prompt_text) <> ''),
  constraint ctd_compound_profile_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);
-- Facts belong to canonical words, not to a single lesson roster.  A later
-- profile can therefore use any reviewed closed compound without copying it.
create table if not exists public.canonical_teaching_dictionary_compound_facts (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  compound_type text not null check (compound_type = 'closed'),
  first_word text not null, second_word text not null, first_word_meaning text not null, second_word_meaning text not null, child_friendly_definition text not null,
  teaching_split_parts jsonb not null, teaching_split_joins jsonb not null, true_morphology_parts jsonb not null, true_morphology_joins jsonb not null, true_morphology_transformations jsonb not null default '[]'::jsonb, transformation_notes text not null default '', true_morphology_provenance jsonb not null,
  assignment_eligible boolean not null default false, transfer_eligible boolean not null default false, row_status text not null default 'draft', review_status text not null,
  source_sheet text not null, source_row_number integer not null, source_row_hash text not null, source_metadata jsonb not null default '{}'::jsonb, source_category text not null, source_name text, source_url text, source_licence text, source_use_note text, confidence text not null, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  unique (import_batch_id, canonical_word_id, micro_skill_key),
  constraint ctd_compound_fact_values check (micro_skill_key = 'D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS' and btrim(first_word) <> '' and btrim(second_word) <> '' and btrim(first_word_meaning) <> '' and btrim(second_word_meaning) <> '' and btrim(child_friendly_definition) <> '' and jsonb_typeof(teaching_split_parts) = 'array' and jsonb_array_length(teaching_split_parts) = 2 and jsonb_typeof(teaching_split_joins) = 'array' and jsonb_array_length(teaching_split_joins) = 1 and jsonb_typeof(true_morphology_parts) = 'array' and jsonb_array_length(true_morphology_parts) >= 2 and jsonb_typeof(true_morphology_joins) = 'array' and jsonb_typeof(true_morphology_provenance) = 'object'),
  constraint ctd_compound_fact_status check (row_status = any (array['draft','active','rejected','superseded']) and review_status = any (array['draft','ai_draft','in_review','changes_requested','approved_for_guided_review','approved_for_first_exposure','rejected','superseded']))
);
create index if not exists ctd_compound_profiles_runtime_idx on public.canonical_teaching_dictionary_compound_profiles(micro_skill_key, row_status, review_status, production_enabled);
create index if not exists ctd_compound_facts_runtime_idx on public.canonical_teaching_dictionary_compound_facts(micro_skill_key, compound_type, row_status, review_status, assignment_eligible, transfer_eligible);
alter table public.canonical_teaching_dictionary_compound_profiles enable row level security;
alter table public.canonical_teaching_dictionary_compound_facts enable row level security;
revoke all on public.canonical_teaching_dictionary_compound_profiles, public.canonical_teaching_dictionary_compound_facts from anon, authenticated;
grant select, insert, update, delete on public.canonical_teaching_dictionary_compound_profiles, public.canonical_teaching_dictionary_compound_facts to service_role;
