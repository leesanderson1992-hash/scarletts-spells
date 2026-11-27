begin;
set local lock_timeout='5s';
-- Effective reviewed sense classification governs equivalence for legacy keys.
create or replace function public.validate_teaching_dictionary_lexical_family_succession()
returns trigger language plpgsql set search_path=public as $$
declare old_family record; target record; old_effective record; target_effective record;
begin
 select * into strict old_family from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.old_family_key and revision=new.old_revision;
 select * into strict target from canonical_teaching_dictionary_lexical_base_families
 where family_key=new.canonical_family_key and revision=new.canonical_revision;
 select * into strict old_effective from teaching_dictionary_families_with_current_meaning
 where family_key=new.old_family_key and revision=new.old_revision;
 select * into strict target_effective from teaching_dictionary_families_with_current_meaning
 where family_key=new.canonical_family_key and revision=new.canonical_revision;
 if old_family.review_status<>'approved' or target.review_status<>'approved'
   or old_family.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target.canonical_base_word_id is distinct from new.canonical_base_word_id
   or target_effective.canonical_base_sense_id is distinct from new.canonical_base_sense_id
   or old_effective.base_kind is distinct from target_effective.base_kind
   or (old_effective.canonical_base_sense_id is not null and old_effective.canonical_base_sense_id is distinct from new.canonical_base_sense_id)
   or exists(select 1 from teaching_dictionary_lexical_family_successions
      where old_family_key=new.canonical_family_key or canonical_family_key=new.old_family_key)
 then raise exception 'FAMILY_SUCCESSION_IDENTITY_MISMATCH'; end if;
 return new;
end;
$$;

notify pgrst,'reload schema';
commit;
