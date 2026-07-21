-- Review-gated curriculum metadata for ADLE base-word family lessons.
-- This migration creates no runtime consumer, learning item, assignment,
-- evidence, scheduler, reward, resolver, or production activation path.

create table if not exists public.canonical_teaching_dictionary_base_word_families (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  base_family_key text not null,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key) on delete restrict,
  base_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  base_meaning text not null,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
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
  constraint canonical_teaching_dictionary_base_word_families_key_check check (btrim(base_family_key) <> ''),
  constraint canonical_teaching_dictionary_base_word_families_base_meaning_check check (btrim(base_meaning) <> ''),
  constraint canonical_teaching_dictionary_base_word_families_row_status_check check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_base_word_families_source_row_check check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_base_word_families_source_category_check check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_base_word_families_confidence_check check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_base_word_families_review_status_check check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_base_word_families_internal_note_check check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> ''),
  unique (import_batch_id, base_family_key)
);

create table if not exists public.canonical_teaching_dictionary_base_word_family_members (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.canonical_teaching_dictionary_import_batches(id) on delete restrict,
  base_word_family_id uuid not null references public.canonical_teaching_dictionary_base_word_families(id) on delete restrict,
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  member_role text not null,
  word_sum text not null,
  morphology_parts jsonb not null,
  morphology_joins jsonb not null default '[]'::jsonb,
  transformation_notes text,
  dictation_sentence text,
  dictation_target_token_index integer,
  audio_text text,
  assignment_eligible boolean not null default false,
  row_status text not null default 'draft',
  source_sheet text not null,
  source_row_number integer not null,
  source_row_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
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
  constraint canonical_teaching_dictionary_base_word_family_members_role_check check (member_role = any (array['base', 'authentic_target', 'transfer', 'optional_transfer_check'])),
  constraint canonical_teaching_dictionary_base_word_family_members_word_sum_check check (btrim(word_sum) <> ''),
  constraint canonical_teaching_dictionary_base_word_family_members_parts_check check (jsonb_typeof(morphology_parts) = 'array' and jsonb_array_length(morphology_parts) > 0),
  constraint canonical_teaching_dictionary_base_word_family_members_joins_check check (jsonb_typeof(morphology_joins) = 'array'),
  constraint canonical_teaching_dictionary_base_word_family_members_sentence_check check ((dictation_sentence is null and dictation_target_token_index is null) or (btrim(coalesce(dictation_sentence, '')) <> '' and dictation_target_token_index >= 0)),
  constraint canonical_teaching_dictionary_base_word_family_members_assignment_support_check check (not assignment_eligible or (btrim(coalesce(dictation_sentence, '')) <> '' and dictation_target_token_index is not null and btrim(coalesce(audio_text, '')) <> '')),
  constraint canonical_teaching_dictionary_base_word_family_members_row_status_check check (row_status = any (array['draft', 'active', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_base_word_family_members_source_row_check check (source_row_number > 1 and btrim(source_sheet) <> '' and btrim(source_row_hash) <> ''),
  constraint canonical_teaching_dictionary_base_word_family_members_source_category_check check (source_category = any (array['internal_authored', 'internal_reviewed_seed', 'public_domain', 'open_licensed', 'licensed_vendor', 'reference_only', 'ai_assisted_draft'])),
  constraint canonical_teaching_dictionary_base_word_family_members_confidence_check check (confidence = any (array['low', 'medium', 'high'])),
  constraint canonical_teaching_dictionary_base_word_family_members_review_status_check check (review_status = any (array['draft', 'ai_draft', 'in_review', 'changes_requested', 'approved_for_guided_review', 'approved_for_first_exposure', 'rejected', 'superseded'])),
  constraint canonical_teaching_dictionary_base_word_family_members_internal_note_check check (source_category <> 'internal_authored' or btrim(coalesce(source_use_note, '')) <> ''),
  unique (import_batch_id, base_word_family_id, canonical_word_id)
);

create index if not exists canonical_teaching_dictionary_base_word_families_skill_idx
  on public.canonical_teaching_dictionary_base_word_families (micro_skill_key, row_status, review_status);
create index if not exists canonical_teaching_dictionary_base_word_family_members_family_idx
  on public.canonical_teaching_dictionary_base_word_family_members (base_word_family_id, row_status, review_status);

alter table public.canonical_teaching_dictionary_base_word_families enable row level security;
alter table public.canonical_teaching_dictionary_base_word_family_members enable row level security;

revoke all on table public.canonical_teaching_dictionary_base_word_families from anon, authenticated;
revoke all on table public.canonical_teaching_dictionary_base_word_family_members from anon, authenticated;
grant select, insert, update, delete on table public.canonical_teaching_dictionary_base_word_families to service_role;
grant select, insert, update, delete on table public.canonical_teaching_dictionary_base_word_family_members to service_role;
