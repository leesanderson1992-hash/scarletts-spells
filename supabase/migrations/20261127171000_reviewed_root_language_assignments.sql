begin;
set local lock_timeout='5s';
-- Automatic grouping requires the reviewed root sense and its current root analysis.
create or replace view public.teaching_dictionary_root_skill_families as
with latest as (
 select distinct on(family_key) * from public.teaching_dictionary_families_with_current_meaning
 where is_current_family and review_status='approved' and base_kind='bound_root'
 order by family_key,revision desc
)
select f.family_key,f.revision,f.canonical_base_word_id root_word_id,f.canonical_base_sense_id root_sense_id,
 r.root_text,r.origin_language,c.micro_skill_key,c.display_name,r.reviewed_at
from latest f join public.canonical_teaching_dictionary_lexical_root_metadata r using(family_key,revision)
join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
join lateral jsonb_array_elements(s.sense_set->'senses') sense on sense->>'id'=f.canonical_base_sense_id and sense->>'partOfSpeech'='root'
join public.teaching_dictionary_current_sense_morphology m on m.canonical_word_id=f.canonical_base_word_id and m.sense_id=f.canonical_base_sense_id
 and jsonb_array_length(m.morphology_parts)=1 and m.morphology_parts#>>'{0,kind}'='root'
join public.micro_skill_catalog c on c.micro_skill_key=public.root_micro_skill_for_historical_language(r.origin_language)
where c.is_active and c.is_assignable;
notify pgrst,'reload schema';
commit;
