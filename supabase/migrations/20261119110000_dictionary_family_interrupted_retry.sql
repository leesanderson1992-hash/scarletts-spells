begin;
-- Expired leases must retry even when the family has not changed since the interrupted claim.
create or replace function public.claim_dictionary_family_dependencies(p_environment text,p_limit integer default 10,p_base text default null)
returns setof public.teaching_dictionary_family_dependencies language sql security definer set search_path=public,pg_temp as $$
  update public.teaching_dictionary_family_dependencies d set lease_until=now()+interval '3 minutes',checked_at=now()
  where id in(select waiting.id from public.teaching_dictionary_family_dependencies waiting
    where environment_key=p_environment and status<>'ready' and (lease_until is null or lease_until<now())
      and (p_base is null or base_form=p_base)
      and (p_base is not null or (waiting.lease_until is not null and waiting.lease_until < now()) or exists (
        select 1 from public.canonical_teaching_dictionary_lexical_base_families f
        left join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=f.canonical_base_word_id
        where f.base_lemma=waiting.base_form and f.base_kind=waiting.base_kind and f.review_status='approved'
          and (checked_at is null or status='error' or greatest(f.created_at,coalesce(f.reviewed_at,f.created_at),coalesce(s.reviewed_at,f.created_at))>checked_at)))
    order by checked_at nulls first,id limit least(greatest(p_limit,1),20) for update skip locked)
  returning d.*;
$$;
revoke all on function public.claim_dictionary_family_dependencies(text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_dictionary_family_dependencies(text,integer,text) to service_role;

notify pgrst,'reload schema';
commit;
