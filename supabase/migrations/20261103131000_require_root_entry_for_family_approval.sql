begin;

-- Historical approved families remain readable. Every new bound-root
-- approval must carry its own reviewed root entry in the same revision.
create or replace function public.require_lexical_root_entry_on_approval()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.base_kind='bound_root' and new.review_status='approved'
    and old.review_status is distinct from 'approved'
    and not exists(select 1 from public.canonical_teaching_dictionary_lexical_root_metadata r
      where r.family_key=new.family_key and r.revision=new.revision
        and lower(r.root_text)=lower(new.base_lemma)
        and r.root_meaning=new.base_meaning) then
    raise exception 'LEXICAL_ROOT_ENTRY_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists lexical_root_entry_on_approval
  on public.canonical_teaching_dictionary_lexical_base_families;
create trigger lexical_root_entry_on_approval
  before update of review_status on public.canonical_teaching_dictionary_lexical_base_families
  for each row execute function public.require_lexical_root_entry_on_approval();

commit;
