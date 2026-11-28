begin;
-- Family renames already retain immutable historical identities. An explicit
-- reviewed correction can also change bound-root classification to free base.
alter table public.teaching_dictionary_lexical_family_successions
 add column reclassification_reason text check(reclassification_reason is null or length(btrim(reclassification_reason)) between 10 and 2000);
create or replace function public.validate_teaching_dictionary_lexical_family_succession()
returns trigger language plpgsql set search_path=public as $$
declare old_family record; target record; old_effective record; target_effective record; reclassified boolean:=false;
begin
 select * into strict old_family from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.old_family_key and revision=new.old_revision;
 select * into strict target from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.canonical_family_key and revision=new.canonical_revision;
 select * into strict old_effective from teaching_dictionary_families_with_current_meaning
 where family_key=new.old_family_key and revision=new.old_revision;
 select * into strict target_effective from teaching_dictionary_families_with_current_meaning
 where family_key=new.canonical_family_key and revision=new.canonical_revision;
 if new.reclassification_reason is not null then
  reclassified:=old_effective.base_kind='bound_root' and target_effective.base_kind='free_base'
   and exists(select 1 from teaching_dictionary_reviewed_sense_sets s
    join teaching_dictionary_current_sense_morphology m on m.canonical_word_id=s.canonical_word_id
     and m.sense_id=new.canonical_base_sense_id
    cross join lateral jsonb_array_elements(s.sense_set->'senses') sense
    where s.canonical_word_id=new.canonical_base_word_id and sense->>'id'=new.canonical_base_sense_id
     and sense->>'partOfSpeech'<>'root' and jsonb_array_length(m.morphology_parts)=1
     and m.morphology_parts#>>'{0,kind}'='base'
     and m.morphology_parts#>>'{0,sourceText}'=target.base_lemma
     and m.morphology_parts#>>'{0,surfaceText}'=target.base_lemma);
  if not reclassified then raise exception 'FAMILY_RECLASSIFICATION_REVIEW_REQUIRED';end if;
 end if;
 if old_family.review_status<>'approved' or target.review_status<>'approved'
   or old_family.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target_effective.canonical_base_sense_id is distinct from new.canonical_base_sense_id
   or (old_effective.base_kind is distinct from target_effective.base_kind and not reclassified)
   or (old_effective.canonical_base_sense_id is not null and old_effective.canonical_base_sense_id is distinct from new.canonical_base_sense_id)
   or exists(select 1 from teaching_dictionary_lexical_family_successions
      where old_family_key=new.canonical_family_key or canonical_family_key=new.old_family_key)
 then raise exception 'FAMILY_SUCCESSION_IDENTITY_MISMATCH'; end if;
 return new;
end;
$$;
notify pgrst,'reload schema';
commit;
