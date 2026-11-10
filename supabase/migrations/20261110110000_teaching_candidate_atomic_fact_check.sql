begin;

-- Recheck the exact reviewed facts used by the lesson evaluator in the same
-- transaction that publishes a governed word-skill relationship and sense.
create function public.reconcile_teaching_dictionary_bulk_review_v4(
  p_environment text,p_skill_key text,p_publish_ids uuid[],p_exclude_ids uuid[],
  p_clear_ids uuid[],p_deassign_ids uuid[],p_restore_ids uuid[],
  p_sense_ids jsonb,p_actor uuid,p_request_id uuid,p_authority_fingerprint text,
  p_rule_revision text,p_expected_facts jsonb
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text;
  v_expected jsonb;
  v_word uuid;
  v_current_links uuid[];
begin
  if p_rule_revision is distinct from 'reviewed_overview_candidate_v1'
    or jsonb_typeof(p_expected_facts) is distinct from 'object' then
    raise exception 'TEACHING_CANDIDATE_RULE_STALE';
  end if;
  for v_key,v_expected in select key,value from jsonb_each(p_expected_facts) loop
    v_word:=v_key::uuid;
    if not v_word=any(p_clear_ids) or p_sense_ids->>v_key is distinct from v_expected->>'senseId'
      or not exists(select 1 from public.teaching_dictionary_reviewed_sense_sets s
        where s.canonical_word_id=v_word and s.sense_set=v_expected->'senseSet')
      or not exists(select 1 from public.canonical_teaching_dictionary_word_morphology m
        where m.id=(v_expected->>'morphologyId')::uuid and m.canonical_word_id=v_word
          and m.row_status='active' and m.analysis_status='approved'
          and m.review_status='approved_for_first_exposure') then
      raise exception 'TEACHING_CANDIDATE_FACTS_STALE';
    end if;
    select coalesce(array_agg(id order by id),array[]::uuid[]) into v_current_links
      from public.teaching_dictionary_current_sense_family_links
      where canonical_word_id=v_word and sense_id=v_expected->>'senseId';
    if to_jsonb(v_current_links) is distinct from v_expected->'familyLinkIds' then
      raise exception 'TEACHING_CANDIDATE_FAMILY_STALE';
    end if;
  end loop;
  return public.reconcile_teaching_dictionary_bulk_review_v3(
    p_environment,p_skill_key,p_publish_ids,p_exclude_ids,p_clear_ids,
    p_deassign_ids,p_restore_ids,p_sense_ids,p_actor,p_request_id,
    p_authority_fingerprint);
end $$;
revoke all on function public.reconcile_teaching_dictionary_bulk_review_v4(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.reconcile_teaching_dictionary_bulk_review_v4(
  text,text,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb,uuid,uuid,text,text,jsonb)
  to service_role;

notify pgrst,'reload schema';
commit;
