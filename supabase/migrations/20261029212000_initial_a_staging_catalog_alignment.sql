begin;

-- Production's reviewed Domain 4 seed already contains this key.  Older
-- staging catalog copies did not, so align the canonical identity before
-- proving the specialist route there.  Never overwrite an existing row.
insert into public.micro_skill_catalog
  (mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
   display_name,practice_route,is_assignable,is_active,allowed_template_keys,metadata)
values
  ('D4','D4_SCHWA','D4_SCHWA_INITIAL','D4_SCHWA_INITIAL_A_INITIAL',
   'Spell initial unstressed a-','word_practice',true,true,
   array['T01','T02','T03','T04','T05','T08','T10','T09','T11'],
   '{"cluster_name":"Initial schwa","seed_version":"domain4-seed-expansion-v1",
     "example_words":["about","again","around","away"],
     "teaching_point":"Unstressed vowels can sound unclear; children should preserve the correct written vowel even when it is weak in speech.",
     "source_workbook":"docs/D4 Seeding Map Finale Final.xlsx",
     "starter_word_bank":[{"word":"about","difficulty":"seed","common_wrong_spellings":[]},
       {"word":"again","difficulty":"seed","common_wrong_spellings":[]},
       {"word":"around","difficulty":"seed","common_wrong_spellings":[]},
       {"word":"away","difficulty":"seed","common_wrong_spellings":[]}],
     "developmental_foundation":"Schwa / unstressed vowel awareness",
     "unsupported_runtime_notes":["Task templates and family-level mappings are repo artifacts/config until dedicated schema exists.",
       "Resolver adoption is intentionally separate from taxonomy seeding."]}'::jsonb)
on conflict (micro_skill_key) do nothing;

do $assert$
begin
  if not exists(select 1 from public.micro_skill_catalog
    where micro_skill_key='D4_SCHWA_INITIAL_A_INITIAL' and mastery_domain_key='D4'
      and skill_family_key='D4_SCHWA' and skill_cluster_key='D4_SCHWA_INITIAL'
      and is_active and is_assignable)
    then raise exception 'Initial A catalog identity conflicts with reviewed Domain 4 seed'; end if;
end $assert$;
commit;
