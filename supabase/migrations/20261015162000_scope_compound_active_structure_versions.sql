-- Multiple immutable authorities may retain an active version of the same
-- word. The runtime resolves rows through its exact dependency authority.
begin;
drop index public.ctd_compound_structure_v2_one_active_word_skill;
create unique index ctd_compound_structure_v2_one_active_word_skill
  on public.canonical_teaching_dictionary_compound_structures_v2
    (canonical_word_id,micro_skill_key,(coalesce(source_metadata->>'dependencyAuthorityId','legacy')))
  where row_status='active';
notify pgrst, 'reload schema';
commit;
