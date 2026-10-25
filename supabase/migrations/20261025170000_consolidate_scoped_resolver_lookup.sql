begin;

-- The old materializer cannot interpret an environment-specific withdrawal.
-- The worker exclusively calls the scoped replacement installed in 160000.
drop function public.materialize_writing_known_error_review_candidates(integer);

-- Return correction authority and current teaching attribution together.
-- This avoids a second PostgREST request for each resolver lookup.
create function public.find_resolver_visible_token_safe_canonical_mappings_scoped(
  p_observed_normalized_tokens text[],
  p_dialect_code text,
  p_normalization_version text,
  p_environment_key text
) returns table (
  mapping_id uuid,
  misspelling_normalized text,
  correct_spelling_normalized text,
  micro_skill_key text,
  dialect_code text,
  normalization_version text,
  authority_reference text,
  teaching_micro_skill_key text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_environment_key is null or p_environment_key not in ('local','staging','production')
    or p_observed_normalized_tokens is null then
    raise exception 'RESOLVER_PAIR_SCOPE_INVALID';
  end if;

  return query
    select mapping.mapping_id,mapping.misspelling_normalized,mapping.correct_spelling_normalized,
      mapping.micro_skill_key,mapping.dialect_code,mapping.normalization_version,
      mapping.authority_reference,
      case when exists (
        select 1 from public.canonical_teaching_dictionary_words word
        join public.teaching_dictionary_pair_latest_decisions decision
          on decision.canonical_word_id=word.id
          and decision.micro_skill_key=mapping.micro_skill_key
          and decision.environment_key=p_environment_key
          and decision.action='deassign'
        where word.normalised_word=mapping.correct_spelling_normalized
          and word.dialect_code=mapping.dialect_code and word.row_status='active'
      ) then null::text else mapping.micro_skill_key end
    from public.find_resolver_visible_token_safe_canonical_mappings(
      p_observed_normalized_tokens,p_dialect_code,p_normalization_version
    ) mapping;
end $$;

revoke all on function public.find_resolver_visible_token_safe_canonical_mappings_scoped(text[],text,text,text)
  from public,anon,authenticated;
grant execute on function public.find_resolver_visible_token_safe_canonical_mappings_scoped(text[],text,text,text)
  to service_role;

drop function public.find_withdrawn_resolver_mapping_ids(text,uuid[]);

commit;
