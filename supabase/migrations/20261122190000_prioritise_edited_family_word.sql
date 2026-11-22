begin;
-- A word-page approval checks that word first instead of waiting behind a
-- global batch. This does not approve drafts or publish lesson content.
create function public.claim_dictionary_family_dependencies_for_word(p_environment text,p_word uuid,p_limit integer default 20)
returns setof public.teaching_dictionary_family_dependencies language sql security definer set search_path=public,pg_temp as $$
  update public.teaching_dictionary_family_dependencies d set lease_until=now()+interval '3 minutes',checked_at=now()
  where id in(select waiting.id from public.teaching_dictionary_family_dependencies waiting
    where environment_key=p_environment and canonical_word_id=p_word and (lease_until is null or lease_until<now())
    order by checked_at nulls first,id limit least(greatest(p_limit,1),20) for update skip locked)
  returning d.*;
$$;
revoke all on function public.claim_dictionary_family_dependencies_for_word(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_dictionary_family_dependencies_for_word(text,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
