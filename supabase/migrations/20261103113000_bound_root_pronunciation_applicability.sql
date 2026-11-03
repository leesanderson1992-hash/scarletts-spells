begin;

-- Bound roots are family anchors, not standalone spoken teaching words.
alter table public.canonical_teaching_dictionary_lexical_root_metadata
  alter column pronunciation_ipa drop not null;
alter table public.canonical_teaching_dictionary_lexical_root_metadata
  add column if not exists pronunciation_applicability text not null default 'reviewed';
do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'lexical_root_pronunciation_applicability_check'
      and conrelid = 'public.canonical_teaching_dictionary_lexical_root_metadata'::regclass) then
    alter table public.canonical_teaching_dictionary_lexical_root_metadata
      add constraint lexical_root_pronunciation_applicability_check
      check (
        (pronunciation_applicability = 'reviewed' and nullif(btrim(pronunciation_ipa),'') is not null)
        or (pronunciation_applicability = 'not_applicable' and pronunciation_ipa is null)
      );
  end if;
end $$;

notify pgrst,'reload schema';
commit;
