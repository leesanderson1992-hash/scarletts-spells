begin;

-- A correction can remain canonical after its teaching relationship is withdrawn.
-- Review screens must use the same current pair veto as lesson selection.
create function public.find_current_deassigned_micro_skill_keys_for_word(
  p_correct_spelling_normalized text,
  p_dialect_code text,
  p_environment_key text
) returns table (micro_skill_key text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_environment_key is null or p_environment_key not in ('local','staging','production')
    or p_correct_spelling_normalized is null or p_dialect_code is null then
    raise exception 'REVIEW_PAIR_SCOPE_INVALID';
  end if;

  return query
    select distinct decision.micro_skill_key
    from public.canonical_teaching_dictionary_words word
    join public.teaching_dictionary_pair_latest_decisions decision
      on decision.canonical_word_id=word.id
      and decision.environment_key=p_environment_key
      and decision.action='deassign'
    where word.normalised_word=p_correct_spelling_normalized
      and word.dialect_code=p_dialect_code
      and word.row_status='active';
end $$;

revoke all on function public.find_current_deassigned_micro_skill_keys_for_word(text,text,text)
  from public,anon,authenticated;
grant execute on function public.find_current_deassigned_micro_skill_keys_for_word(text,text,text)
  to service_role;

commit;
