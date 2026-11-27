begin;
set local lock_timeout='5s';
-- Legacy revision writers omit the new field. Preserve references on those
-- revisions; an explicit empty array still permits a reviewed removal.
alter table public.canonical_teaching_dictionary_lexical_root_metadata
  alter column teaching_examples drop default;
create function public.inherit_root_teaching_examples()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.teaching_examples is null then
    select teaching_examples into new.teaching_examples
    from public.canonical_teaching_dictionary_lexical_root_metadata
    where family_key=new.family_key and revision<new.revision
    order by revision desc limit 1;
    new.teaching_examples:=coalesce(new.teaching_examples,'{}'::text[]);
  end if;
  return new;
end $$;
revoke all on function public.inherit_root_teaching_examples() from public,anon,authenticated;
create trigger inherit_root_teaching_examples before insert
  on public.canonical_teaching_dictionary_lexical_root_metadata
  for each row execute function public.inherit_root_teaching_examples();
commit;
