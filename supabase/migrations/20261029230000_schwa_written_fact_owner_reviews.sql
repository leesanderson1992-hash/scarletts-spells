begin;

-- Owner-approved written Schwa decisions remain separate from pronunciation,
-- audio and the immutable route-content publication authority.
create table public.teaching_dictionary_weak_vowel_written_reviews (
  id uuid primary key default gen_random_uuid(),
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id) on delete restrict,
  micro_skill_key text not null references public.micro_skill_catalog(micro_skill_key),
  workbook_sha256 text not null check (workbook_sha256 ~ '^[a-f0-9]{64}$'),
  workbook_row integer not null check (workbook_row >= 2),
  source_row integer not null check (source_row >= 2),
  source_target jsonb,
  lesson_target jsonb,
  selected_vowel jsonb,
  proposed_spoken_cuts jsonb,
  family_decision text check (family_decision in ('approve','skip')),
  mapping_rule text not null check (mapping_rule in ('same_as_workbook','full_al_pattern_to_written_a')),
  decision_status text not null check (decision_status in ('approved_written','needs_resolution')),
  dictionary_fingerprint text not null check (dictionary_fingerprint ~ '^[a-f0-9]{64}$'),
  row_sha256 text not null check (row_sha256 ~ '^[a-f0-9]{64}$'),
  decision_reference text not null check (btrim(decision_reference) <> ''),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default timezone('utc',now()),
  unique (canonical_word_id,micro_skill_key,workbook_sha256),
  unique (workbook_sha256,workbook_row),
  check ((decision_status='approved_written' and source_target is not null and lesson_target is not null
      and selected_vowel is not null and family_decision is not null)
    or (decision_status='needs_resolution' and source_target is null and lesson_target is null
      and selected_vowel is null))
);
create index teaching_dictionary_weak_vowel_written_reviews_word_idx
  on public.teaching_dictionary_weak_vowel_written_reviews(canonical_word_id,reviewed_at desc);
create trigger teaching_dictionary_weak_vowel_written_reviews_immutable before update
  on public.teaching_dictionary_weak_vowel_written_reviews for each row
  execute function public.reject_writing_fact_update();
alter table public.teaching_dictionary_weak_vowel_written_reviews enable row level security;
revoke all on public.teaching_dictionary_weak_vowel_written_reviews from public,anon,authenticated;
grant select,insert on public.teaching_dictionary_weak_vowel_written_reviews to service_role;

notify pgrst,'reload schema';
commit;
