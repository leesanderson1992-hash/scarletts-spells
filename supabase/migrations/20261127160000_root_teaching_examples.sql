begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Reference examples belong to the immutable reviewed root revision.
-- They do not approve dictionary membership or ordinary lesson selection.
alter table public.canonical_teaching_dictionary_lexical_root_metadata
  add column teaching_examples text[] not null default '{}'::text[]
  check (array_position(teaching_examples,null) is null
    and cardinality(teaching_examples)<=20);
comment on column public.canonical_teaching_dictionary_lexical_root_metadata.teaching_examples
  is 'Reviewed teaching references only; no family membership or spelling-target eligibility is conferred.';
notify pgrst,'reload schema';
commit;
