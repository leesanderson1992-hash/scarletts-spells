begin;

-- Apply the same freshness check used by the review and publish transactions
-- to a lesson's reviewed words within one read-only request.
create function public.teaching_dictionary_route_dictionary_fingerprints(p_words uuid[])
returns table(word_id uuid, fingerprint text)
language sql stable security invoker
set search_path = public, pg_temp as $$
  select words.id, public.teaching_dictionary_route_dictionary_fingerprint(words.id)
  from (select distinct id from unnest(p_words) as requested(id) where id is not null) words;
$$;

revoke all on function public.teaching_dictionary_route_dictionary_fingerprints(uuid[])
  from public, anon, authenticated;
grant execute on function public.teaching_dictionary_route_dictionary_fingerprints(uuid[])
  to service_role;

commit;
