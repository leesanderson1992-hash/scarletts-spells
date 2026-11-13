begin;

-- A release choice is separate from the approvals of the individual meanings.
create table public.teaching_dictionary_staging_ing_meaning_choices (
  canonical_word_id uuid not null references public.canonical_teaching_dictionary_words(id),
  micro_skill_key text not null check (micro_skill_key in (
    'D4_INF_ING_ENDINGS_REGULAR', 'D4_INF_ING_ENDINGS_DROP_E',
    'D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT', 'D4_INF_ING_ENDINGS_IE_TO_Y'
  )),
  sense_id text not null check (btrim(sense_id) <> ''),
  selected_by uuid not null,
  selected_at timestamptz not null default now(),
  primary key (canonical_word_id, micro_skill_key)
);

alter table public.teaching_dictionary_staging_ing_meaning_choices enable row level security;
revoke all on public.teaching_dictionary_staging_ing_meaning_choices from public, anon, authenticated;
grant select, insert, update on public.teaching_dictionary_staging_ing_meaning_choices to service_role;

notify pgrst, 'reload schema';
commit;
